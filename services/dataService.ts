

import { Product, Batch, Transaction, Store, User, Announcement, AuditLog, RoleLevel, UserPermissions } from '../types';
import { getSupabaseClient } from './supabaseClient';
import { authService, DEFAULT_PERMISSIONS } from './authService';

class DataService {
  
  public getClient() {
    const client = getSupabaseClient();
    if (!client) return null;
    return client;
  }

  // --- Auditing ---
  async logClientAction(action: string, details: any): Promise<void> {
      const client = this.getClient();
      if (!client) return;
      const user = authService.getCurrentUser();
      // Insert into system_audit_logs treating it as a special operation
      await client.from('system_audit_logs').insert({
          table_name: 'CLIENT_ACTION',
          record_id: user?.id || 'ANON',
          operation: 'CLIENT_ACTION', // Custom op
          new_data: { action, details, operator: user?.username },
          timestamp: new Date().toISOString()
      });
  }

  // --- Users ---
  async getUsers(includeArchived = false): Promise<User[]> {
      const client = this.getClient();
      if (!client) return [];
      
      let query = client.from('live_users_v').select('*');
      if (!includeArchived) {
          query = query.or('is_archived.is.null,is_archived.eq.false');
      }
      const { data, error } = await query;
      if (error) { console.error(error); return []; }
      
      // Map view columns to permissions object
      return (data || []).map((row: any) => ({
          ...row,
          permissions: {
              role_level: row.role_level,
              logs_level: row.logs_level || DEFAULT_PERMISSIONS.logs_level,
              announcement_rule: row.announcement_rule || DEFAULT_PERMISSIONS.announcement_rule,
              store_scope: row.store_scope || DEFAULT_PERMISSIONS.store_scope,
              show_excel: row.show_excel,
              view_peers: row.view_peers,
              view_self_in_list: row.view_self_in_list,
              hide_perm_page: row.hide_perm_page,
              hide_audit_hall: row.hide_audit_hall,
              hide_store_management: row.hide_store_management,
              only_view_config: row.only_view_config,
              hide_new_store_btn: row.hide_new_store_btn,
              hide_excel_export_btn: row.hide_excel_export_btn,
              hide_store_edit_btn: row.hide_store_edit_btn
          }
      }));
  }

  async updateUser(id: string, updates: Partial<User>): Promise<void> {
      const client = this.getClient();
      if (!client) return;
      
      // Separate flat fields from permissions object
      let payload: any = { ...updates };
      delete payload.permissions;

      if (updates.permissions) {
          const p = updates.permissions;
          payload = { ...payload, 
              logs_level: p.logs_level,
              announcement_rule: p.announcement_rule,
              store_scope: p.store_scope,
              show_excel: p.show_excel,
              view_peers: p.view_peers,
              view_self_in_list: p.view_self_in_list,
              hide_perm_page: p.hide_perm_page,
              hide_audit_hall: p.hide_audit_hall,
              hide_store_management: p.hide_store_management,
              only_view_config: p.only_view_config,
              hide_new_store_btn: p.hide_new_store_btn,
              hide_excel_export_btn: p.hide_excel_export_btn,
              hide_store_edit_btn: p.hide_store_edit_btn
          };
      }

      await client.from('users').update(payload).eq('id', id);
  }

  // --- Announcements ---
  async getAnnouncements(): Promise<Announcement[]> {
      const client = this.getClient();
      if (!client) return [];
      const { data } = await client.from('announcements')
        .select('*')
        .order('created_at', { ascending: false });
      return data || [];
  }

  async createAnnouncement(ann: any): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      await this.logClientAction('PUBLISH_ANNOUNCEMENT', { title: ann.title });
      await client.from('announcements').insert({
          ...ann, 
          id: crypto.randomUUID(), 
          created_at: new Date().toISOString(),
          is_force_deleted: false,
          read_by: []
      });
  }

  async deleteAnnouncement(id: string, force = false): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      const user = authService.getCurrentUser();
      
      if (force) {
          await this.logClientAction('FORCE_DELETE_ANNOUNCEMENT', { id });
          await client.from('announcements').update({ is_force_deleted: true }).eq('id', id);
      } else {
          // Hide from self
          const { data: ann } = await client.from('announcements').select('read_by').eq('id', id).single();
          if (ann && user) {
              const reads = ann.read_by || [];
              const hideFlag = `HIDDEN_BY_${user.id}`;
              if (!reads.includes(hideFlag)) {
                  await client.from('announcements').update({ read_by: [...reads, hideFlag] }).eq('id', id);
              }
          }
      }
  }

  // --- Core Data ---
  async getStores(): Promise<Store[]> {
    const client = this.getClient();
    if(!client) return [];
    
    // Fetch only non-archived
    const { data, error } = await client.from('stores').select('*').or('is_archived.is.null,is_archived.eq.false');
    if (error) throw new Error(error.message);
    
    // Global filter based on User Permissions (if needed)
    // Here we return all, but UI filters. 00 sees all.
    return data || [];
  }

  async deleteStore(id: string): Promise<void> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      
      // Strict Constraint: Check aggregated stock
      const { data: batches } = await client.from('batches').select('quantity').eq('store_id', id).gt('quantity', 0);
      const totalStock = batches?.reduce((acc, b) => acc + b.quantity, 0) || 0;
      
      if (totalStock > 0) throw new Error(`该门店下仍有 ${totalStock} 件库存，无法删除。`);

      await this.logClientAction('DELETE_STORE', { id });
      await client.from('stores').update({ is_archived: true }).eq('id', id);
  }

  async getProducts(includeArchived = false, currentStoreId?: string): Promise<Product[]> {
    const client = this.getClient();
    if(!client) return [];
    
    let query = client.from('products').select('*');
    if (!includeArchived) query = query.or('is_archived.is.null,is_archived.eq.false');

    const { data } = await query;
    const products = data || [];
    
    if (currentStoreId && currentStoreId !== 'all') {
         return products.filter(p => !p.bound_store_id || p.bound_store_id === currentStoreId);
    }
    return products;
  }

  async updateProduct(id: string, updates: Partial<Product>): Promise<void> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      
      const { data: old } = await client.from('products').select('*').eq('id', id).single();
      await client.from('products').update(updates).eq('id', id);

      const user = authService.getCurrentUser();
      const changeDesc = Object.keys(updates).map(k => `${k}: [${(old as any)[k]}]->[${(updates as any)[k]}]`).join(', ');
      
      await client.from('transactions').insert({
          id: crypto.randomUUID(),
          type: 'ADJUST',
          product_id: id,
          quantity: 0,
          timestamp: new Date().toISOString(),
          note: `修改商品属性: ${changeDesc}`,
          operator: user?.username || 'System',
          snapshot_data: { old: old, new: updates }
      });
  }

  async getBatches(storeId?: string): Promise<Batch[]> {
    const client = this.getClient();
    if(!client) return [];
    
    let query = client.from('batches').select('*, store:stores(name)');
    query = query.or('is_archived.is.null,is_archived.eq.false');
    
    if (storeId && storeId !== 'all') query = query.eq('store_id', storeId);
    
    const { data } = await query;
    return (data || []).map((b: any) => ({
        ...b,
        store_name: b.store?.name
    }));
  }

  async getTransactions(filterType?: string, limit = 200, startDate?: string): Promise<Transaction[]> {
    const client = this.getClient();
    if(!client) return [];
    
    let query = client.from('transactions')
      .select('*, product:products(name), store:stores(name)')
      .eq('is_undone', false)
      .order('timestamp', { ascending: false })
      .limit(limit);
      
    if (filterType && filterType !== 'ALL') query = query.eq('type', filterType);
    
    const { data } = await query;
    const allTransactions = data || [];

    const user = authService.getCurrentUser();
    if (!user) return [];

    const logLevel = user.permissions.logs_level;
    if (logLevel === 'A' || logLevel === 'B' || logLevel === 'C') return allTransactions;
    return allTransactions.filter(t => t.operator === user.username);
  }

  async getAuditLogs(limit = 100): Promise<AuditLog[]> {
      const client = this.getClient();
      if (!client) return [];
      const { data } = await client.from('system_audit_logs').select('*').order('timestamp', { ascending: false }).limit(limit);
      return data || [];
  }
  
  async getStockFlowStats(days: number, storeId?: string): Promise<{date: string, in: number, out: number}[]> {
      const client = this.getClient();
      if (!client) return [];
      
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      
      let query = client.from('transactions')
          .select('type, quantity, timestamp, store_id')
          .eq('is_undone', false)
          .gte('timestamp', cutoff.toISOString())
          .order('timestamp', { ascending: true });

      if (storeId && storeId !== 'all') query = query.eq('store_id', storeId);
      
      const { data } = await query;
      if (!data) return [];

      const map = new Map<string, {in: number, out: number}>();
      for(let i=0; i<days; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const key = d.toISOString().split('T')[0];
          map.set(key, {in: 0, out: 0});
      }

      data.forEach(t => {
          const key = t.timestamp.split('T')[0];
          if (map.has(key)) {
              const curr = map.get(key)!;
              if (t.type === 'IN') curr.in += t.quantity;
              if (t.type === 'OUT') curr.out += t.quantity;
          }
      });

      return Array.from(map.entries())
        .map(([date, val]) => ({ date: date.slice(5), in: val.in, out: val.out }))
        .sort((a,b) => a.date.localeCompare(b.date));
  }

  // --- ATOMIC OPERATIONS ---

  async updateStock(
      productId: string, 
      storeId: string, 
      quantityChange: number, 
      type: 'IN' | 'OUT', 
      note?: string,
      batchId?: string 
  ): Promise<void> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");

      const user = authService.getCurrentUser();
      const { data: batch } = await client.from('batches').select('*').eq('id', batchId).single();
      const { data: product } = await client.from('products').select('*').eq('id', productId).single();

      const { error } = await client.rpc('operate_stock', {
          p_batch_id: batchId,
          p_qty_change: type === 'OUT' ? -quantityChange : quantityChange,
          p_type: type,
          p_note: note,
          p_operator: user?.username || 'System',
          p_snapshot: { batch, product, tx_context: 'manual_update' }
      });

      if (error) throw new Error(error.message);
  }

  // FIFO Stock Out
  async processStockOut(productId: string, storeId: string, quantity: number, note: string): Promise<void> {
      const client = this.getClient();
      if (!client) throw new Error("No DB");

      // Get batches with quantity > 0, sorted by expiry (FIFO)
      const { data: batches, error } = await client
          .from('batches')
          .select('*')
          .eq('product_id', productId)
          .eq('store_id', storeId)
          .gt('quantity', 0)
          .order('expiry_date', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true });

      if (error) throw new Error(error.message);
      if (!batches || batches.length === 0) throw new Error("库存不足 (无可用批次)");

      const totalAvailable = batches.reduce((sum, b) => sum + b.quantity, 0);
      if (totalAvailable < quantity) throw new Error(`库存不足 (可用: ${totalAvailable}, 需: ${quantity})`);

      let remaining = quantity;
      
      for (const batch of batches) {
          if (remaining <= 0) break;
          
          const take = Math.min(batch.quantity, remaining);
          
          // Use updateStock to handle transaction logging and safety
          await this.updateStock(productId, storeId, take, 'OUT', note, batch.id);
          
          remaining -= take;
      }
  }

  async adjustBatch(batchId: string, updates: Partial<Batch>): Promise<void> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      
      const { data: oldBatch } = await client.from('batches').select('*').eq('id', batchId).single();
      const user = authService.getCurrentUser();

      // Handle Quantity via Stock Op
      if (updates.quantity !== undefined && oldBatch) {
          const delta = updates.quantity - oldBatch.quantity;
          if (delta !== 0) {
              const { error } = await client.rpc('operate_stock', {
                  p_batch_id: batchId,
                  p_qty_change: delta,
                  p_type: 'ADJUST',
                  p_note: '库存数量修正',
                  p_operator: user?.username || 'System',
                  p_snapshot: { old: oldBatch, new_qty: updates.quantity }
              });
              if(error) throw new Error(error.message);
          }
          delete updates.quantity;
      }

      if (Object.keys(updates).length > 0) {
          const changeDesc = Object.keys(updates).map(k => `${k}: [${(oldBatch as any)[k]}]->[${(updates as any)[k]}]`).join(', ');
          
          await client.from('batches').update(updates).eq('id', batchId);
          await client.from('transactions').insert({
              id: crypto.randomUUID(),
              type: 'ADJUST',
              batch_id: batchId,
              product_id: oldBatch.product_id,
              store_id: oldBatch.store_id,
              quantity: 0,
              timestamp: new Date().toISOString(),
              note: `修改批次属性: ${changeDesc}`,
              operator: user?.username || 'System',
              snapshot_data: { old: oldBatch, updates }
          });
      }
  }

  async createBatch(batch: Omit<Batch, 'id' | 'created_at'>): Promise<string> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      
      const id = crypto.randomUUID();
      const { error } = await client.from('batches').insert({ ...batch, id, quantity: 0, created_at: new Date().toISOString(), is_archived: false });
      if (error) throw new Error(error.message);

      if (batch.quantity > 0) {
         await this.updateStock(batch.product_id, batch.store_id, batch.quantity, 'IN', '新批次入库', id);
      }
      return id;
  }

  async undoTransaction(transactionId: string): Promise<void> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      const { data: tx } = await client.from('transactions').select('*').eq('id', transactionId).single();
      const user = authService.getCurrentUser();
      
      await this.logClientAction('UNDO_TRANSACTION', { transactionId });
      
      if (tx.type === 'ADJUST') {
          const oldData = tx.snapshot_data?.old;
          if (oldData) {
              const { id, ...updatePayload } = oldData;
              if (tx.batch_id) await client.from('batches').update(updatePayload).eq('id', tx.batch_id);
              else if (tx.product_id) await client.from('products').update(updatePayload).eq('id', tx.product_id);
          }
      } else if (['IN', 'OUT', 'IMPORT', 'RESTORE'].includes(tx.type)) {
          const inverseQty = -tx.quantity; 
          const { error } = await client.rpc('operate_stock', {
              p_batch_id: tx.batch_id,
              p_qty_change: inverseQty,
              p_type: 'RESTORE', 
              p_note: `撤销操作 (Ref: ${transactionId})`,
              p_operator: user?.username || 'System',
              p_snapshot: { original_tx: tx, context: 'UNDO' }
          });
          if (error) throw new Error(error.message);
      } else if (tx.type === 'DELETE') {
          if (tx.batch_id) await client.from('batches').update({ is_archived: false }).eq('id', tx.batch_id);
          if (tx.product_id && !tx.batch_id) await client.from('products').update({ is_archived: false }).eq('id', tx.product_id);
      }

      await client.from('transactions').update({ is_undone: true }).eq('id', transactionId);
  }
}

export const dataService = new DataService();