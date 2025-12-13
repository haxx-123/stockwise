import { Product, Batch, Transaction, Store, User, Announcement, AuditLog, RoleLevel, UserPermissions } from '../types';
import { getSupabaseClient } from './supabaseClient';
import { authService, DEFAULT_PERMISSIONS } from './authService';

class DataService {
  
  public getClient() {
    const client = getSupabaseClient();
    if (!client) return null;
    return client;
  }

  async logClientAction(action: string, details: any): Promise<void> {
      const client = this.getClient();
      if (!client) return;
      const user = authService.getCurrentUser();
      await client.from('system_audit_logs').insert({
          table_name: 'CLIENT_ACTION',
          record_id: user?.id || 'ANON',
          operation: 'CLIENT_ACTION',
          new_data: { action, details, operator: user?.username },
          timestamp: new Date().toISOString()
      });
  }

  // --- Users ---
  // Ensure permissions object is fully populated
  private mapRowToUser(row: any): User {
      return {
          id: row.id,
          username: row.username,
          password: row.password,
          role_level: row.role_level,
          allowed_store_ids: row.allowed_store_ids || [],
          is_archived: row.is_archived,
          face_descriptor: row.face_descriptor,
          
          logs_level: row.logs_level,
          announcement_rule: row.announcement_rule,
          store_scope: row.store_scope,
          show_excel: row.show_excel,
          view_peers: row.view_peers,
          view_self_in_list: row.view_self_in_list,
          hide_perm_page: row.hide_perm_page,
          hide_audit_hall: row.hide_audit_hall,
          hide_store_management: row.hide_store_management,
          hide_new_store_page: row.hide_new_store_page,
          hide_excel_export: row.hide_excel_export,
          only_view_config: row.only_view_config,

          permissions: {
              role_level: row.role_level,
              logs_level: row.logs_level ?? DEFAULT_PERMISSIONS.logs_level,
              announcement_rule: row.announcement_rule ?? DEFAULT_PERMISSIONS.announcement_rule,
              store_scope: row.store_scope ?? DEFAULT_PERMISSIONS.store_scope,
              show_excel: row.show_excel ?? DEFAULT_PERMISSIONS.show_excel,
              view_peers: row.view_peers ?? DEFAULT_PERMISSIONS.view_peers,
              view_self_in_list: row.view_self_in_list ?? DEFAULT_PERMISSIONS.view_self_in_list,
              hide_perm_page: row.hide_perm_page ?? DEFAULT_PERMISSIONS.hide_perm_page,
              hide_audit_hall: row.hide_audit_hall ?? DEFAULT_PERMISSIONS.hide_audit_hall,
              hide_store_management: row.hide_store_management ?? DEFAULT_PERMISSIONS.hide_store_management,
              hide_new_store_page: row.hide_new_store_page ?? DEFAULT_PERMISSIONS.hide_new_store_page,
              hide_excel_export: row.hide_excel_export ?? DEFAULT_PERMISSIONS.hide_excel_export,
              only_view_config: row.only_view_config ?? DEFAULT_PERMISSIONS.only_view_config
          } as UserPermissions
      };
  }

  async getUsers(includeArchived = false): Promise<User[]> {
      const client = this.getClient();
      if (!client) return [];
      let query = client.from('live_users_v').select('*');
      if (!includeArchived) query = query.or('is_archived.is.null,is_archived.eq.false');
      const { data } = await query;
      return (data || []).map((row: any) => this.mapRowToUser(row));
  }

  // CORE FIX: Get Single User Fresh
  async getUser(id: string): Promise<User | null> {
      const client = this.getClient();
      if (!client) return null;
      const { data, error } = await client.from('users').select('*').eq('id', id).single();
      if (error || !data) return null;
      return this.mapRowToUser(data);
  }

  async createUser(user: Omit<User, 'id'>): Promise<void> {
      const client = this.getClient();
      if (!client) return;
      const { permissions, ...userData } = user as any;
      const payload = {
          ...userData,
          id: crypto.randomUUID(),
          is_archived: false,
          // Defaults if not provided
          logs_level: user.logs_level || 'D',
          store_scope: user.store_scope || 'LIMITED',
      };
      await client.from('users').insert(payload);
  }

  async updateUser(id: string, updates: Partial<User>): Promise<void> {
      const client = this.getClient();
      if (!client) return;
      // Filter out 'permissions' object, stick to flat fields
      const { permissions, ...cleanUpdates } = updates as any;
      await client.from('users').update(cleanUpdates).eq('id', id);
  }

  async deleteUser(id: string): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      // Force Soft Delete for Everyone
      await client.from('users').update({ is_archived: true }).eq('id', id);
  }

  // --- Announcements ---
  async getAnnouncements(): Promise<Announcement[]> {
      const client = this.getClient();
      if (!client) return [];
      const { data } = await client.from('announcements').select('*').order('created_at', { ascending: false });
      return data || [];
  }

  async createAnnouncement(ann: any): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      await client.from('announcements').insert({
          ...ann, id: crypto.randomUUID(), created_at: new Date().toISOString(), is_force_deleted: false, read_by: []
      });
  }

  async deleteAnnouncement(id: string, force = false): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      const user = authService.getCurrentUser();
      
      if (force) {
          await client.from('announcements').update({ is_force_deleted: true }).eq('id', id);
      } else if (user) {
          const { data: ann } = await client.from('announcements').select('read_by').eq('id', id).single();
          if (ann) {
              const reads = ann.read_by || [];
              const hideFlag = `HIDDEN_BY_${user.id}`;
              if (!reads.includes(hideFlag)) {
                  await client.from('announcements').update({ read_by: [...reads, hideFlag] }).eq('id', id);
              }
          }
      }
  }

  async markAnnouncementRead(annId: string, userId: string): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      const { data: ann } = await client.from('announcements').select('read_by').eq('id', annId).single();
      if (ann) {
          const reads = ann.read_by || [];
          if (!reads.includes(userId)) {
              await client.from('announcements').update({ read_by: [...reads, userId] }).eq('id', annId);
          }
      }
  }

  // --- Stores (Hierarchy Logic) ---
  async getStores(): Promise<Store[]> {
    const client = this.getClient();
    if(!client) return [];
    
    // Fetch all active stores
    const { data } = await client.from('stores').select('*').or('is_archived.is.null,is_archived.eq.false');
    const allStores = data || [];
    const user = authService.getCurrentUser();

    // 00 Admin sees all. Others filtered by Managers/Viewers logic + Store Scope
    if (user?.role_level === 0) return allStores;

    // Filter by 'store_scope' or 'allowed_store_ids' or 'managers/viewers' lists
    // Simple implementation: If scope is LIMITED, check allowed list + manager list + viewer list
    return allStores.filter(s => {
        if (user?.permissions.store_scope === 'GLOBAL') return true;
        const allowedIds = user?.allowed_store_ids || [];
        const isManager = s.managers?.includes(user?.id || '');
        const isViewer = s.viewers?.includes(user?.id || '');
        return allowedIds.includes(s.id) || isManager || isViewer;
    });
  }

  async getProducts(includeArchived = false, currentStoreId?: string): Promise<Product[]> {
    const client = this.getClient();
    if(!client) return [];
    let query = client.from('products').select('*');
    if (!includeArchived) query = query.or('is_archived.is.null,is_archived.eq.false');
    const { data } = await query;
    let products = data || [];
    if (currentStoreId && currentStoreId !== 'all') {
         // Show products bound to this store OR global (null)
         products = products.filter(p => !p.bound_store_id || p.bound_store_id === currentStoreId);
    }
    return products;
  }

  // ... (Update other CRUD to handle image_url/remark pass-through) ...
  async updateProduct(id: string, updates: Partial<Product>): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      const { data: old } = await client.from('products').select('*').eq('id', id).single();
      await client.from('products').update(updates).eq('id', id);
      
      // Log details
      await client.from('transactions').insert({
          id: crypto.randomUUID(), type: 'ADJUST', product_id: id, quantity: 0, timestamp: new Date().toISOString(),
          note: '修改商品属性', operator: authService.getCurrentUser()?.username, snapshot_data: { old, new: updates }
      });
  }

  async deleteProduct(productId: string): Promise<void> {
      const client = this.getClient();
      if (!client) return;
      await client.from('products').update({ is_archived: true }).eq('id', productId);
      await client.from('batches').update({ is_archived: true }).eq('product_id', productId);
  }

  async getBatches(storeId?: string): Promise<Batch[]> {
    const client = this.getClient();
    if(!client) return [];
    let query = client.from('batches').select('*, store:stores(name)');
    query = query.or('is_archived.is.null,is_archived.eq.false');
    
    if (storeId && storeId !== 'all') {
        // If parent store, fetch child stores too? For now, strict match or parent-child logic needs to be handled in UI aggregation
        // To simplify: query exact store_id. 
        query = query.eq('store_id', storeId);
    }
    
    const { data } = await query;
    return (data || []).filter((b:any)=>b.quantity >= 0).map((b: any) => ({ ...b, store_name: b.store?.name }));
  }

  async deleteBatch(batchId: string): Promise<void> {
      const client = this.getClient();
      if (!client) return;
      await client.from('batches').update({ is_archived: true }).eq('id', batchId);
      await client.from('batches').update({ quantity: 0 }).eq('id', batchId);
  }

  async adjustBatch(batchId: string, updates: any): Promise<void> {
      const client = this.getClient();
      if (!client) return;
      
      const { data: oldBatch } = await client.from('batches').select('*').eq('id', batchId).single();
      await client.from('batches').update(updates).eq('id', batchId);
      
      const qtyDiff = (updates.quantity !== undefined) ? (updates.quantity - oldBatch.quantity) : 0;
      
      await client.from('transactions').insert({
          id: crypto.randomUUID(), type: 'ADJUST', product_id: oldBatch.product_id, store_id: oldBatch.store_id, batch_id: batchId,
          quantity: Math.abs(qtyDiff),
          timestamp: new Date().toISOString(),
          note: '批次属性/数量调整', operator: authService.getCurrentUser()?.username,
          snapshot_data: { old: oldBatch, new: updates }
      });
  }

  async updateStock(productId: string, storeId: string, quantity: number, type: 'IN' | 'OUT', note: string, batchId?: string): Promise<void> {
      const client = this.getClient();
      if (!client) return;
      
      if (batchId) {
          const { data: batch } = await client.from('batches').select('quantity').eq('id', batchId).single();
          if (!batch) throw new Error("Batch not found");
          
          let newQty = batch.quantity;
          if (type === 'IN') newQty += quantity;
          else newQty -= quantity;
          
          if (newQty < 0) throw new Error("库存不足");
          
          await client.from('batches').update({ quantity: newQty }).eq('id', batchId);
      } else {
          throw new Error("Batch ID required for updateStock");
      }

      await client.from('transactions').insert({
          id: crypto.randomUUID(), type, product_id: productId, store_id: storeId, batch_id: batchId,
          quantity: quantity, timestamp: new Date().toISOString(),
          note, operator: authService.getCurrentUser()?.username
      });
  }

  async processStockOut(productId: string, storeId: string, quantity: number, note: string): Promise<void> {
      const client = this.getClient();
      if (!client) return;

      const { data: batches } = await client.from('batches')
          .select('*')
          .eq('product_id', productId)
          .eq('store_id', storeId)
          .gt('quantity', 0)
          .eq('is_archived', false)
          .order('expiry_date', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true });

      if (!batches || batches.length === 0) throw new Error("没有可用库存");

      let remaining = quantity;
      const txs = [];
      const batchUpdates = [];

      for (const b of batches) {
          if (remaining <= 0) break;
          const take = Math.min(b.quantity, remaining);
          
          batchUpdates.push({ id: b.id, quantity: b.quantity - take });
          txs.push({
              id: crypto.randomUUID(), type: 'OUT', product_id: productId, store_id: storeId, batch_id: b.id,
              quantity: take, timestamp: new Date().toISOString(),
              note: `${note} (FIFO 扣减)`, operator: authService.getCurrentUser()?.username
          });
          remaining -= take;
      }

      if (remaining > 0) throw new Error(`库存不足，缺 ${remaining}`);

      for (const u of batchUpdates) {
          await client.from('batches').update({ quantity: u.quantity }).eq('id', u.id);
      }
      if (txs.length > 0) {
          await client.from('transactions').insert(txs);
      }
  }

  async getTransactions(filterType?: string, limit = 200): Promise<Transaction[]> {
      const client = this.getClient();
      if(!client) return [];
      let query = client.from('transactions').select('*, product:products(name), store:stores(name)').eq('is_undone', false).order('timestamp', { ascending: false }).limit(limit);
      if (filterType && filterType !== 'ALL') query = query.eq('type', filterType);
      
      const { data } = await query;
      const allTx = data || [];
      const user = authService.getCurrentUser();
      
      // Permission Filters
      if (user?.permissions.logs_level === 'D') return allTx.filter(t => t.operator === user.username);
      // A, B, C see all (Restrict UNDO elsewhere)
      return allTx;
  }

  async getStockFlowStats(days: number, storeId?: string): Promise<any[]> {
    const client = this.getClient();
    if (!client) return [];
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    let query = client.from('transactions')
      .select('type, quantity, timestamp, store_id')
      .gte('timestamp', startDate.toISOString())
      .eq('is_undone', false);
      
    if (storeId && storeId !== 'all') {
      query = query.eq('store_id', storeId);
    }
    
    const { data } = await query;
    const txs = data || [];
    
    const statsMap = new Map<string, { in: number, out: number }>();
    
    for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        statsMap.set(dateStr, { in: 0, out: 0 });
    }

    txs.forEach((t: any) => {
        const dateStr = t.timestamp.split('T')[0];
        if (statsMap.has(dateStr)) {
            const entry = statsMap.get(dateStr)!;
            if (t.type === 'IN' || t.type === 'IMPORT' || t.type === 'RESTORE') {
                entry.in += t.quantity;
            } else if (t.type === 'OUT' || t.type === 'DELETE') {
                entry.out += t.quantity;
            }
        }
    });

    return Array.from(statsMap.entries())
        .map(([date, val]) => ({ date, in: val.in, out: val.out }))
        .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getAuditLogs(limit = 100): Promise<AuditLog[]> {
      const client = this.getClient();
      if (!client) return [];
      const { data } = await client.from('system_audit_logs').select('*').order('timestamp', { ascending: false }).limit(limit);
      return data || [];
  }

  // --- ATOMIC STOCK ---
  // Updated to support images/remark in batch creation
  async createBatch(batch: any): Promise<string> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      const id = crypto.randomUUID();
      await client.from('batches').insert({ ...batch, id, quantity: 0, created_at: new Date().toISOString(), is_archived: false });
      
      // Initial In
      if (batch.quantity > 0) {
          await client.rpc('operate_stock', {
              p_batch_id: id, p_qty_change: batch.quantity, p_type: 'IN', p_note: '初始入库', 
              p_operator: authService.getCurrentUser()?.username, p_snapshot: { context: 'CREATE' }
          });
      }
      return id;
  }

  async undoTransaction(transactionId: string): Promise<void> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      const { data: tx } = await client.from('transactions').select('*').eq('id', transactionId).single();
      const user = authService.getCurrentUser();
      if (!tx || !user) return;

      // Undo Levels logic
      const p = user.permissions;
      if (p.logs_level === 'D' || p.logs_level === 'C') {
          if (tx.operator !== user.username) throw new Error("权限不足: 只能撤销自己的操作");
      }
      if (p.logs_level === 'B' && tx.operator !== user.username) {
          const { data: op } = await client.from('users').select('role_level').eq('username', tx.operator).single();
          if (op && op.role_level <= user.role_level) throw new Error("权限不足: 不能撤销同级或上级操作");
      }

      // Perform Undo (Logic simplified for brevity, assumes standard inverse op)
      if (['IN','OUT','IMPORT'].includes(tx.type)) {
          await client.rpc('operate_stock', {
              p_batch_id: tx.batch_id, p_qty_change: -tx.quantity, p_type: 'RESTORE', 
              p_note: `撤销 ${tx.type}`, p_operator: user.username, p_snapshot: { ref: transactionId }
          });
      }
      await client.from('transactions').update({ is_undone: true }).eq('id', transactionId);
  }
}

export const dataService = new DataService();