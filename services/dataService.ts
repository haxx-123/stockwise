
import { Product, Batch, OperationLog, Store, User, Announcement, AuditLog, RoleLevel, UserPermissions } from '../types';
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

  // --- Core Operation Logic (Atomic Logs) ---
  
  async logOperation(type: 'IN' | 'OUT' | 'ADJUST' | 'DELETE' | 'IMPORT', targetId: string, delta: number, snapshot: any): Promise<void> {
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

      // Atomic Undo Logic
      if (log.action_type === 'IN' || log.action_type === 'IMPORT') {
          // Undo IN: Deduct stock. Check if sufficient.
          const { data: batch } = await client.from('batches').select('quantity').eq('id', log.target_id).single();
          if (!batch || batch.quantity < log.change_delta) throw new Error("当前库存不足以撤销入库");
          
          await client.from('batches').update({ quantity: batch.quantity - log.change_delta }).eq('id', log.target_id);
      } 
      else if (log.action_type === 'OUT') {
          // Undo OUT: Add stock back.
          const { data: batch } = await client.from('batches').select('quantity').eq('id', log.target_id).single();
          if (batch) {
              await client.from('batches').update({ quantity: batch.quantity + Math.abs(log.change_delta) }).eq('id', log.target_id);
          }
      }
      else if (log.action_type === 'DELETE') {
          // Undo DELETE: Restore from snapshot
          if (log.snapshot_data && log.snapshot_data.deleted_batch) {
              const b = log.snapshot_data.deleted_batch;
              // Restore batch. If product deleted, restore product too? Assuming product soft deleted.
              // For robustness, we check product existence
              const { data: prod } = await client.from('products').select('id').eq('id', b.product_id).single();
              if (!prod && log.snapshot_data.deleted_product) {
                  // Restore Product first
                  await client.from('products').insert(log.snapshot_data.deleted_product);
              }
              // Restore Batch
              await client.from('batches').insert(b);
          }
      }
      else if (log.action_type === 'ADJUST') {
          // Undo ADJUST: Revert to old value
          const old = log.snapshot_data?.old;
          if (old) {
              // Only revert fields that were changed. Simplest is to revert whole batch object minus id
              const { id, ...rest } = old;
              await client.from('batches').update(rest).eq('id', log.target_id);
          }
      }

      // Mark as Revoked
      await client.from('operation_logs').update({ is_revoked: true }).eq('id', logId);
  }

  // --- Inventory Actions with Logging ---

  async createBatch(batch: any): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      const id = crypto.randomUUID();
      const newBatch = { ...batch, id, created_at: new Date().toISOString() };
      
      await client.from('batches').insert(newBatch);
      await this.logOperation('IN', id, batch.quantity, { name: 'Batch Created' });
  }

  // Generic Stock Update (Used for Bill Open)
  async updateStock(productId: string, storeId: string, quantity: number, type: 'IN'|'OUT', note: string, batchId: string): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      
      const { data: batch } = await client.from('batches').select('*').eq('id', batchId).single();
      if (!batch) throw new Error("Batch not found");

      let newQty = batch.quantity;
      let delta = quantity;
      
      if (type === 'OUT') {
          if (batch.quantity < quantity) throw new Error("库存不足");
          newQty -= quantity;
          delta = -quantity;
      } else {
          newQty += quantity;
      }

      await client.from('batches').update({ quantity: newQty }).eq('id', batchId);
      
      // Detailed Snapshot for Log
      const { data: prod } = await client.from('products').select('name, unit_name, split_unit_name').eq('id', productId).single();
      const snapshot = {
          product_name: prod?.name,
          unit: type==='IN' ? prod?.unit_name : prod?.split_unit_name, // Rough guess, accurate in UI
          note
      };
      
      await this.logOperation(type, batchId, delta, snapshot);
  }

  async processStockOut(productId: string, storeId: string, quantity: number, note: string): Promise<void> {
      // FIFO Logic handled in Component or Service
      // This wrapper ensures we log each step
      const client = this.getClient();
      if(!client) return;
      const { data: batches } = await client.from('batches').select('*').eq('product_id', productId).eq('store_id', storeId).gt('quantity',0).order('expiry_date',{ascending:true});
      
      if(!batches) throw new Error("无库存");
      let remaining = quantity;
      
      for (const b of batches) {
          if (remaining <= 0) break;
          const take = Math.min(b.quantity, remaining);
          await this.updateStock(productId, storeId, take, 'OUT', note, b.id);
          remaining -= take;
      }
      if(remaining > 0) throw new Error("库存不足");
  }

  async adjustBatch(bid: string, updates: any): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      
      const { data: old } = await client.from('batches').select('*').eq('id', bid).single();
      await client.from('batches').update(updates).eq('id', bid);
      
      // Calculate delta if qty changed
      let delta = 0;
      if (updates.quantity !== undefined) {
          delta = updates.quantity - old.quantity;
      }
      
      await this.logOperation('ADJUST', bid, delta, { old, new: updates });
  }

  async deleteBatch(batchId: string): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      
      // Get full snapshot before delete
      const { data: batch } = await client.from('batches').select('*, product:products(*)').eq('id', batchId).single();
      
      // We use Soft Delete usually, but if hard delete requested:
      // await client.from('batches').delete().eq('id', batchId);
      // Using Archive as per requirement
      await client.from('batches').update({ is_archived: true, quantity: 0 }).eq('id', batchId);
      
      await this.logOperation('DELETE', batchId, 0, { deleted_batch: batch });
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
    let query = client.from('batches').select('*, store:stores(name)');
    query = query.or('is_archived.is.null,is_archived.eq.false');
    if (storeId && storeId !== 'all') query = query.eq('store_id', storeId);
    const { data } = await query;
    return (data || []).map((b: any) => ({...b, store_name: b.store?.name}));
  }

  // --- Logs & Announcements ---
  async getOperationLogs(filter: any = {}, limit = 200): Promise<OperationLog[]> {
      const client = this.getClient();
      if(!client) return [];
      let query = client.from('operation_logs').select('*').eq('is_revoked', false).order('created_at', { ascending: false }).limit(limit);
      // Add filters if needed
      const { data } = await query;
      return data || [];
  }

  async getAnnouncements(): Promise<Announcement[]> {
      const client = this.getClient();
      if (!client) return [];
      const { data } = await client.from('announcements').select('*').order('created_at', { ascending: false });
      return data || [];
  }

  async createAnnouncement(ann: any): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      await client.from('announcements').insert({ ...ann, id: crypto.randomUUID(), created_at: new Date().toISOString(), is_force_deleted: false, read_by: [] });
  }

  async deleteAnnouncement(id: string, force = false): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      if (force) await client.from('announcements').update({ is_force_deleted: true }).eq('id', id);
      else {
          const user = authService.getCurrentUser();
          const { data } = await client.from('announcements').select('read_by').eq('id', id).single();
          if(data && user) await client.from('announcements').update({ read_by: [...(data.read_by||[]), `HIDDEN_BY_${user.id}`] }).eq('id', id);
      }
  }

  // --- Client & Device Audit ---
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
      // Re-implemented to use operation_logs for accuracy if possible, but using basic logic for now
      return []; // Placeholder for chart data logic
  }
  
  // Store Mgmt
  async deleteStore(id: string): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      await client.from('stores').update({ is_archived: true }).eq('id', id);
  }
  
  // Products
  async updateProduct(pid: string, updates: any): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      await client.from('products').update(updates).eq('id', pid);
  }
}

export const dataService = new DataService();
