
import { Product, Batch, OperationLog, Store, User, Announcement, AuditLog, RoleLevel, UserPermissions, LogFilter } from '../types';
import { getSupabaseClient } from './supabaseClient';
import { authService, DEFAULT_PERMISSIONS } from './authService';

class DataService {
  public getClient() {
    const client = getSupabaseClient();
    if (!client) return null;
    return client;
  }

  // --- Users ---
  async getUser(id: string): Promise<User | null> {
      const client = this.getClient();
      if (!client) return null;
      const { data, error } = await client.from('users').select('*').eq('id', id).single();
      if (error || !data) return null;
      return {
          ...data,
          permissions: { ...DEFAULT_PERMISSIONS, ...(data.permissions || {}) }
      };
  }

  async getUsers(includeArchived = false): Promise<User[]> {
      const client = this.getClient();
      if (!client) return [];
      let query = client.from('live_users_v').select('*');
      if (!includeArchived) query = query.or('is_archived.is.null,is_archived.eq.false');
      const { data } = await query;
      return (data || []).map((row: any) => ({
          ...row,
          permissions: { ...DEFAULT_PERMISSIONS, ...row }
      }));
  }

  async updateUser(id: string, updates: Partial<User>): Promise<void> {
      const client = this.getClient();
      if (!client) return;
      let payload: any = { ...updates };
      if (updates.permissions) {
          const p = updates.permissions;
          payload = { ...payload, ...p }; // Flatten
          delete payload.permissions; 
      }
      await client.from('users').update(payload).eq('id', id);
  }

  async createUser(user: Partial<User>): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      // Flatten permissions for insertion
      let payload: any = { ...user };
      if (user.permissions) {
          payload = { ...payload, ...user.permissions };
          delete payload.permissions;
      }
      // Ensure ID
      if (!payload.id) payload.id = crypto.randomUUID();
      payload.is_archived = false;
      
      const { error } = await client.from('users').insert(payload);
      if (error) throw error;
  }

  async deleteUser(id: string): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      await client.from('users').update({ is_archived: true }).eq('id', id);
  }

  // --- Core Operation Logic (Atomic Logs) ---
  
  async logOperation(type: 'IN' | 'OUT' | 'ADJUST' | 'DELETE' | 'IMPORT' | 'RESTORE', targetId: string, delta: number, snapshot: any): Promise<void> {
      const client = this.getClient();
      if (!client) return;
      const user = authService.getCurrentUser();
      
      await client.from('operation_logs').insert({
          action_type: type,
          target_id: targetId,
          change_delta: delta,
          snapshot_data: snapshot,
          operator_id: user?.username || 'System',
          is_revoked: false,
          created_at: new Date().toISOString()
      });
  }

  async undoOperation(logId: string): Promise<void> {
      const client = this.getClient();
      if (!client) throw new Error("DB Error");
      
      const { data: log } = await client.from('operation_logs').select('*').eq('id', logId).single();
      if (!log || log.is_revoked) throw new Error("操作已撤销或不存在");

      // Atomic Undo Logic based on Action Type
      if (log.action_type === 'IN' || log.action_type === 'IMPORT') {
          const { data: batch } = await client.from('batches').select('quantity').eq('id', log.target_id).single();
          if (!batch) throw new Error("批次已不存在，无法撤销入库");
          if (batch.quantity < log.change_delta) throw new Error(`库存不足 (当前: ${batch.quantity})，无法撤销入库数量 ${log.change_delta}`);
          await client.from('batches').update({ quantity: batch.quantity - log.change_delta }).eq('id', log.target_id);
      } 
      else if (log.action_type === 'OUT') {
          const { data: batch } = await client.from('batches').select('quantity').eq('id', log.target_id).single();
          if (batch) {
              const qtyToAdd = Math.abs(log.change_delta);
              await client.from('batches').update({ quantity: batch.quantity + qtyToAdd }).eq('id', log.target_id);
          } else {
              throw new Error("批次未找到，无法退回库存");
          }
      }
      else if (log.action_type === 'DELETE') {
          if (log.snapshot_data && log.snapshot_data.deleted_batch) {
              const b = log.snapshot_data.deleted_batch;
              const { data: prod } = await client.from('products').select('id').eq('id', b.product_id).single();
              if (!prod && b.product) {
                  await client.from('products').upsert(b.product); 
              }
              const { data: existing } = await client.from('batches').select('id').eq('id', b.id).single();
              if (existing) {
                  await client.from('batches').update({ 
                      is_archived: false, 
                      quantity: b.quantity 
                  }).eq('id', b.id);
              } else {
                  await client.from('batches').insert(b);
              }
          }
      }
      else if (log.action_type === 'ADJUST') {
          const old = log.snapshot_data?.old;
          if (old) {
              const { id, created_at, updated_at, ...rest } = old;
              await client.from('batches').update(rest).eq('id', log.target_id);
          }
      }

      await client.from('operation_logs').update({ is_revoked: true }).eq('id', logId);
  }

  // --- Inventory Actions ---

  async createBatch(batch: any): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      const id = crypto.randomUUID();
      const newBatch = { ...batch, id, created_at: new Date().toISOString() };
      
      await client.from('batches').insert(newBatch);
      const { data: prod } = await client.from('products').select('name, unit_name').eq('id', batch.product_id).single();
      
      await this.logOperation('IN', id, batch.quantity, { 
          product_name: prod?.name, 
          unit: prod?.unit_name,
          note: '新批次入库' 
      });
  }

  async updateStock(productId: string, storeId: string, quantity: number, type: 'IN'|'OUT', note: string, batchId: string): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      const { data: batch } = await client.from('batches').select('*').eq('id', batchId).single();
      if (!batch) throw new Error("Batch not found");

      let newQty = batch.quantity;
      let delta = quantity; 
      let logDelta = quantity; 
      
      if (type === 'OUT') {
          if (batch.quantity < quantity) throw new Error("库存不足");
          newQty -= quantity;
          logDelta = -quantity;
      } else {
          newQty += quantity;
      }

      await client.from('batches').update({ quantity: newQty }).eq('id', batchId);
      const { data: prod } = await client.from('products').select('name, unit_name').eq('id', productId).single();
      
      const snapshot = {
          product_name: prod?.name,
          unit: prod?.unit_name, 
          note
      };
      
      await this.logOperation(type, batchId, logDelta, snapshot);
  }

  async processStockOut(productId: string, storeId: string, quantity: number, note: string): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      const { data: batches } = await client.from('batches').select('*').eq('product_id', productId).eq('store_id', storeId).gt('quantity',0).order('expiry_date',{ascending:true});
      
      if(!batches || batches.length === 0) throw new Error("无库存");
      let remaining = quantity;
      
      for (const b of batches) {
          if (remaining <= 0) break;
          const take = Math.min(b.quantity, remaining);
          await this.updateStock(productId, storeId, take, 'OUT', note, b.id);
          remaining -= take;
      }
      if(remaining > 0) throw new Error("库存不足 (所有批次已扣完)");
  }

  async adjustBatch(bid: string, updates: any): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      const { data: old } = await client.from('batches').select('*, product:products(name, unit_name)').eq('id', bid).single();
      await client.from('batches').update(updates).eq('id', bid);
      let delta = 0;
      if (updates.quantity !== undefined) {
          delta = updates.quantity - old.quantity;
      }
      const snapshot = {
          product_name: old.product?.name,
          old: old,
          new: updates
      };
      await this.logOperation('ADJUST', bid, delta, snapshot);
  }

  async deleteBatch(batchId: string): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      const { data: batch } = await client.from('batches').select('*, product:products(*)').eq('id', batchId).single();
      if (!batch) return; 
      await client.from('batches').update({ is_archived: true, quantity: 0 }).eq('id', batchId);
      const snapshot = {
          product_name: batch.product?.name, 
          deleted_batch: batch
      };
      await this.logOperation('DELETE', batchId, -batch.quantity, snapshot);
  }

  // --- Basic Getters ---
  async getStores(): Promise<Store[]> {
    const client = this.getClient();
    if(!client) return [];
    const { data } = await client.from('stores').select('*').or('is_archived.is.null,is_archived.eq.false');
    return data || [];
  }

  async getProducts(includeArchived = false, currentStoreId?: string): Promise<Product[]> {
    const client = this.getClient();
    if(!client) return [];
    let query = client.from('products').select('*');
    if (!includeArchived) query = query.or('is_archived.is.null,is_archived.eq.false');
    const { data } = await query;
    return data || [];
  }

  async getBatches(storeId?: string): Promise<Batch[]> {
    const client = this.getClient();
    if(!client) return [];
    
    // Logic: If storeId is provided, check if it's a parent store.
    // If parent, fetch all batches from its children.
    let targetStoreIds: string[] = [];
    
    if (storeId && storeId !== 'all') {
        // 1. Check if store is parent
        const { data: children } = await client.from('stores').select('id').eq('parent_id', storeId);
        if (children && children.length > 0) {
            // It is a parent, include all children IDs
            targetStoreIds = children.map((c: any) => c.id);
        } else {
            // It is a child or independent
            targetStoreIds = [storeId];
        }
    }

    let query = client.from('batches').select('*, store:stores(name)');
    query = query.or('is_archived.is.null,is_archived.eq.false');
    
    if (targetStoreIds.length > 0) {
        query = query.in('store_id', targetStoreIds);
    }
    
    const { data } = await query;
    return (data || []).map((b: any) => ({...b, store_name: b.store?.name}));
  }

  // --- Logs ---
  async getOperationLogs(filter: LogFilter = { type: 'ALL', operator: '', startDate: '', endDate: '' }, page = 1, pageSize = 50): Promise<{ data: OperationLog[], total: number }> {
      const client = this.getClient();
      if(!client) return { data: [], total: 0 };
      
      let query = client.from('operation_logs').select('*', { count: 'exact' }).eq('is_revoked', false);
      
      if (filter.type !== 'ALL') query = query.eq('action_type', filter.type);
      if (filter.operator) query = query.ilike('operator_id', `%${filter.operator}%`);
      if (filter.startDate) query = query.gte('created_at', filter.startDate);
      if (filter.endDate) {
          const end = new Date(filter.endDate);
          end.setDate(end.getDate() + 1);
          query = query.lt('created_at', end.toISOString());
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      
      const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to);
      
      if (error) {
          console.error(error);
          return { data: [], total: 0 };
      }
      
      return { data: data || [], total: count || 0 };
  }

  // --- Announcements ---
  async getAnnouncements(): Promise<Announcement[]> {
      const client = this.getClient();
      if (!client) return [];
      const { data } = await client.from('announcements').select('*').order('created_at', { ascending: false });
      return data || [];
  }

  async createAnnouncement(ann: Partial<Announcement>): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      const user = authService.getCurrentUser();
      await client.from('announcements').insert({
          ...ann,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          is_force_deleted: false,
          read_by: [],
          hidden_by: [],
          type: ann.type || 'ANNOUNCEMENT',
          creator_role: user?.role_level
      });
  }

  async updateAnnouncement(id: string, updates: Partial<Announcement>): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      await client.from('announcements').update(updates).eq('id', id);
  }

  async deleteAnnouncement(id: string, physical = false): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      if (physical) {
          await client.from('announcements').update({ is_force_deleted: true }).eq('id', id);
      }
  }

  async hideAnnouncement(id: string, userId: string): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      const { data } = await client.from('announcements').select('hidden_by').eq('id', id).single();
      const current = data?.hidden_by || [];
      if(!current.includes(userId)) {
          await client.from('announcements').update({ hidden_by: [...current, userId] }).eq('id', id);
      }
  }

  async markAnnouncementRead(id: string, userId: string): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      const { data } = await client.from('announcements').select('read_by').eq('id', id).single();
      const current = data?.read_by || [];
      if(!current.includes(userId)) {
          await client.from('announcements').update({ read_by: [...current, userId] }).eq('id', id);
      }
  }

  async showAnnouncementAgain(id: string, userId: string): Promise<void> {
       const client = this.getClient();
       if(!client) return;
       const { data } = await client.from('announcements').select('hidden_by').eq('id', id).single();
       const current = data?.hidden_by || [];
       const updated = current.filter((uid: string) => uid !== userId);
       await client.from('announcements').update({ hidden_by: updated }).eq('id', id);
  }

  // --- Audit ---
  async logClientAction(operation: string, details: any): Promise<void> {
      const client = this.getClient();
      if (!client) return;
      await client.from('system_audit_logs').insert({
          table_name: 'CLIENT', record_id: 'N/A', operation, new_data: details, timestamp: new Date().toISOString()
      });
  }
  
  async getAuditLogs(limit: number): Promise<AuditLog[]> {
      const client = this.getClient();
      if(!client) return [];
      const { data } = await client.from('system_audit_logs').select('*').order('timestamp', {ascending:false}).limit(limit);
      return data || [];
  }

  async getStockFlowStats(days: number, storeId: string): Promise<any[]> {
      return []; 
  }
  
  async deleteStore(id: string): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      
      const { count } = await client.from('batches').select('*', { count: 'exact', head: true }).eq('store_id', id).gt('quantity', 0);
      if (count && count > 0) {
          throw new Error("该门店尚有库存，无法删除！");
      }

      await client.from('stores').update({ is_archived: true }).eq('id', id);
  }
  
  async updateProduct(pid: string, updates: any): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      await client.from('products').update(updates).eq('id', pid);
  }

  async createProduct(product: any): Promise<string | null> {
      const client = this.getClient();
      if(!client) return null;
      const id = product.id || crypto.randomUUID();
      const { data, error } = await client.from('products').insert({ ...product, id, is_archived: false }).select('id').single();
      if (error) throw error;
      return id;
  }
}

export const dataService = new DataService();
