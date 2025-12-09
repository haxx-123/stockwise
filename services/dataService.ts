
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
      await client.from('system_audit_logs').insert({
          table_name: 'CLIENT_ACTION',
          record_id: user?.id || 'ANON',
          operation: 'CLIENT_ACTION',
          new_data: { action, details, operator: user?.username },
          timestamp: new Date().toISOString()
      });
  }

  // --- Users (Architecture Refactor: Per-User Matrix) ---
  async getUsers(includeArchived = false): Promise<User[]> {
      const client = this.getClient();
      if (!client) return [];
      
      // Query the VIEW (which now mirrors the USERS table with new columns)
      let query = client.from('live_users_v').select('*');
      
      if (!includeArchived) {
          query = query.or('is_archived.is.null,is_archived.eq.false');
      }
      const { data, error } = await query;
      if (error) {
          console.error("User Fetch Error:", error);
          return [];
      } 
      
      // Map flat DB columns to User structure
      return (data || []).map((row: any) => {
          // Construct permissions object from flat columns
          const perms: UserPermissions = {
              role_level: row.role_level,
              logs_level: row.logs_level || 'D',
              announcement_rule: row.announcement_rule || 'VIEW',
              store_scope: row.store_scope || 'LIMITED',
              show_excel: row.show_excel ?? false,
              view_peers: row.view_peers ?? false,
              view_self_in_list: row.view_self_in_list ?? true,
              hide_perm_page: row.hide_perm_page ?? true,
              hide_audit_hall: row.hide_audit_hall ?? true,
              hide_store_management: row.hide_store_management ?? true,
              only_view_config: row.only_view_config ?? false
          };

          return {
              id: row.id,
              username: row.username,
              password: row.password,
              role_level: row.role_level,
              allowed_store_ids: row.allowed_store_ids || [],
              is_archived: row.is_archived,
              face_descriptor: row.face_descriptor,
              
              // Attach the computed permissions object for app logic
              permissions: perms,

              // Also keep raw fields attached for the Edit Modal
              ...perms
          };
      });
  }

  async createUser(user: Partial<User>): Promise<void> {
      const client = this.getClient();
      if (!client) return;
      
      await this.logClientAction('CREATE_USER', { target: user.username });

      // Flatten permissions for DB insertion
      // We strip the nested 'permissions' object and rely on the top-level keys
      const { permissions, ...userData } = user as any;

      // Note: userData contains the flat permission fields (logs_level, etc.) because
      // the form updates the top-level user object.
      
      const { error } = await client.from('users').insert({ 
          ...userData, 
          id: crypto.randomUUID(),
          allowed_store_ids: user.allowed_store_ids || [],
          is_archived: false
      });
      if (error) throw new Error(error.message);
  }

  async updateUser(id: string, updates: Partial<User>): Promise<void> {
      const client = this.getClient();
      if (!client) return;
      
      const { permissions, ...safeUpdates } = updates as any;

      await this.logClientAction('UPDATE_USER', { id, safeUpdates });
      const { error } = await client.from('users').update(safeUpdates).eq('id', id);
      if (error) throw new Error(error.message);
  }

  async deleteUser(id: string): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      await this.logClientAction('DELETE_USER', { id });
      await client.from('users').update({ is_archived: true }).eq('id', id);
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

  async updateAnnouncement(id: string, updates: Partial<Announcement>): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      await this.logClientAction('UPDATE_ANNOUNCEMENT', { id, updates });
      await client.from('announcements').update(updates).eq('id', id);
  }
  
  async deleteAnnouncement(id: string, force = false): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      
      const user = authService.getCurrentUser();
      
      if (force) {
          await this.logClientAction('FORCE_DELETE_ANNOUNCEMENT', { id });
          await client.from('announcements').update({ is_force_deleted: true }).eq('id', id);
      } else {
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

  // --- Core Data ---
  async getStores(): Promise<Store[]> {
    const client = this.getClient();
    if(!client) return [];
    
    const { data, error } = await client.from('stores').select('*').or('is_archived.is.null,is_archived.eq.false');
    if (error) throw new Error(error.message);
    
    const user = authService.getCurrentUser();
    // Using user-specific permission scope
    if (user && user.permissions.store_scope === 'LIMITED') {
        const allowed = new Set(user.allowed_store_ids || []);
        return (data || []).filter(s => allowed.has(s.id));
    }

    return data || [];
  }

  async createStore(name: string, location?: string): Promise<Store> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      await this.logClientAction('CREATE_STORE', { name });
      const newStore = { id: crypto.randomUUID(), name, location, is_archived: false };
      const { data, error } = await client.from('stores').insert(newStore).select().single();
      if(error) throw new Error(error.message);
      return data;
  }

  async updateStore(id: string, updates: Partial<Store>): Promise<void> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      await this.logClientAction('UPDATE_STORE', { id, updates });
      const { error } = await client.from('stores').update(updates).eq('id', id);
      if(error) throw new Error(error.message);
  }

  async deleteStore(id: string): Promise<void> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      
      const { data: batches } = await client.from('batches')
          .select('quantity')
          .eq('store_id', id)
          .or('is_archived.is.null,is_archived.eq.false');
      
      const totalStock = batches?.reduce((acc, b) => acc + b.quantity, 0) || 0;
      
      if (totalStock > 0) {
          throw new Error(`该门店下仍有 ${totalStock} 件库存，无法删除。必须库存归零才允许删除。`);
      }

      await this.logClientAction('DELETE_STORE', { id });
      const { error } = await client.from('stores').update({ is_archived: true }).eq('id', id);
      if(error) throw new Error(error.message);
  }

  async getProducts(includeArchived = false, currentStoreId?: string): Promise<Product[]> {
    const client = this.getClient();
    if(!client) return [];
    
    let query = client.from('products').select('*');
    if (!includeArchived) {
        query = query.or('is_archived.is.null,is_archived.eq.false');
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

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
      const { error } = await client.from('products').update(updates).eq('id', id);
      if (error) throw new Error(error.message);

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

  async deleteProduct(id: string): Promise<void> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      
      const user = authService.getCurrentUser();
      const { data: prod } = await client.from('products').select('name').eq('id', id).single();
      const { count } = await client.from('batches').select('*', { count: 'exact', head: true }).eq('product_id', id).gt('quantity', 0);

      const { error } = await client.from('products').update({ is_archived: true }).eq('id', id);
      if (error) throw new Error(error.message);

      await client.from('transactions').insert({
          id: crypto.randomUUID(),
          type: 'DELETE',
          product_id: id,
          quantity: 0,
          timestamp: new Date().toISOString(),
          note: `删除了 ${prod?.name} (含 ${count} 个批次)`,
          operator: user?.username || 'System',
          snapshot_data: { context: 'SOFT_DELETE_PRODUCT', name: prod?.name }
      });
  }

  async getBatches(storeId?: string, productId?: string): Promise<Batch[]> {
    const client = this.getClient();
    if(!client) return [];
    
    let query = client.from('batches').select('*, store:stores(name)');
    query = query.or('is_archived.is.null,is_archived.eq.false');
    
    if (storeId && storeId !== 'all') query = query.eq('store_id', storeId);
    if (productId) query = query.eq('product_id', productId);
    
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    
    return (data || []).filter((b: any) => b.quantity >= 0).map((b: any) => ({
        ...b,
        store_name: b.store?.name
    }));
  }

  async getTransactions(filterType?: string, limit = 200, startDate?: string, storeId?: string): Promise<Transaction[]> {
    const client = this.getClient();
    if(!client) return [];
    
    let query = client
      .from('transactions')
      .select('*, product:products(name), store:stores(name)')
      .eq('is_undone', false)
      .order('timestamp', { ascending: false })
      .limit(limit);
      
    if (filterType && filterType !== 'ALL') query = query.eq('type', filterType);
    if (startDate) query = query.gte('timestamp', startDate);
    
    // Store Scope check using per-user permission
    const user = authService.getCurrentUser();
    if (storeId && storeId !== 'all') {
        query = query.eq('store_id', storeId);
    } else {
        if (user && user.permissions.store_scope === 'LIMITED') {
             query = query.in('store_id', user.allowed_store_ids || []);
        }
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    
    const allTransactions = data || [];

    // --- LOG PERMISSION FILTERING ---
    if (!user) return [];

    const logLevel = user.permissions.logs_level;

    if (logLevel === 'A' || logLevel === 'B' || logLevel === 'C') {
        return allTransactions;
    } else {
        // Level D: Only see Self
        return allTransactions.filter(t => t.operator === user.username);
    }
  }

  async getAuditLogs(limit = 100): Promise<AuditLog[]> {
      const client = this.getClient();
      if (!client) return [];
      const { data, error } = await client.from('system_audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
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
      
      const user = authService.getCurrentUser();
      if (user && user.permissions.store_scope === 'LIMITED') {
          query = query.in('store_id', user.allowed_store_ids || []);
      }

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

  // --- RPC Wrappers (Stock Ops) ---
  // ... (Code for stock ops remains largely same, just checking user.permissions.*)
  
  async updateStock(productId: string, storeId: string, quantityChange: number, type: 'IN' | 'OUT', note?: string, batchId?: string): Promise<void> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");

      const user = authService.getCurrentUser();
      if (!batchId) throw new Error("Batch ID required");

      // Per-User Scope Check
      if (user?.permissions.store_scope === 'LIMITED') {
          if (!user.allowed_store_ids.includes(storeId)) {
               throw new Error("无权操作此门店");
          }
      }

      const { data: batch } = await client.from('batches').select('*').eq('id', batchId).single();
      const { data: product } = await client.from('products').select('*').eq('id', productId).single();
      const snapshot = { batch, product, tx_context: 'manual_update' };

      const { error } = await client.rpc('operate_stock', {
          p_batch_id: batchId,
          p_qty_change: type === 'OUT' ? -quantityChange : quantityChange,
          p_type: type,
          p_note: note,
          p_operator: user?.username || 'System',
          p_snapshot: snapshot
      });

      if (error) throw new Error(error.message);
  }

  async processStockOut(productId: string, storeId: string, quantity: number, note?: string): Promise<void> {
    const client = this.getClient();
    if(!client) throw new Error("No DB");
    
    const user = authService.getCurrentUser();
    if (user?.permissions.store_scope === 'LIMITED') {
        if (!user.allowed_store_ids.includes(storeId)) throw new Error("无权操作此门店");
    }

    let query = client.from('batches').select('*').eq('product_id', productId).gt('quantity', 0).or('is_archived.is.null,is_archived.eq.false').eq('store_id', storeId).order('expiry_date', { ascending: true });

    const { data: batches } = await query;
    const totalAvailable = batches?.reduce((acc, b) => acc + b.quantity, 0) || 0;
    if (totalAvailable < quantity) throw new Error(`当前门店库存不足。可用: ${totalAvailable}`);

    let remaining = quantity;
    const { data: product } = await client.from('products').select('*').eq('id', productId).single();

    for (const batch of (batches || [])) {
        if (remaining <= 0) break;
        const deduct = Math.min(batch.quantity, remaining);
        
        const { error } = await client.rpc('operate_stock', {
            p_batch_id: batch.id,
            p_qty_change: -deduct,
            p_type: 'OUT',
            p_note: note ? `${note} (FIFO)` : 'FIFO 出库',
            p_operator: user?.username || 'System',
            p_snapshot: { batch, product, tx_context: 'FIFO' }
        });

        if (error) throw new Error(`FIFO Failed: ${error.message}`);
        remaining -= deduct;
    }
  }

  async adjustBatch(batchId: string, updates: Partial<Batch>): Promise<void> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      
      const { data: oldBatch } = await client.from('batches').select('*').eq('id', batchId).single();
      const user = authService.getCurrentUser();

      if (updates.quantity !== undefined && oldBatch) {
          const delta = updates.quantity - oldBatch.quantity;
          if (delta !== 0) {
              if (user?.permissions.store_scope === 'LIMITED') {
                  if (oldBatch.store_id && !user.allowed_store_ids.includes(oldBatch.store_id)) {
                       throw new Error("无权操作此门店");
                  }
              }
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

  async deleteBatch(batchId: string): Promise<void> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      
      const user = authService.getCurrentUser();
      const { data: batch } = await client.from('batches').select('*, product:products(*)').eq('id', batchId).single();

      const { error } = await client.from('batches').update({ is_archived: true }).eq('id', batchId);
      if (error) throw new Error(error.message);

      await client.from('transactions').insert({
          id: crypto.randomUUID(),
          type: 'DELETE',
          batch_id: batchId,
          product_id: batch?.product_id,
          store_id: batch?.store_id,
          quantity: 0,
          timestamp: new Date().toISOString(),
          note: `删除了批次 ${batch?.batch_number}`,
          operator: user?.username || 'System',
          snapshot_data: { deleted_batch: batch }
      });
  }

  async createBatch(batch: Omit<Batch, 'id' | 'created_at'>): Promise<string> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      
      const user = authService.getCurrentUser();
      if (user?.permissions.store_scope === 'LIMITED') {
          if (!user.allowed_store_ids.includes(batch.store_id)) throw new Error("无权操作此门店");
      }

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
      if (!tx) throw new Error("记录不存在");

      const user = authService.getCurrentUser();
      if (!user) return;
      const p = user.permissions;
      
      // Strict Logic based on User Permission Fields
      if (p.logs_level === 'D') {
          if (tx.operator !== user.username) throw new Error("权限不足: D级用户只能撤销自己的操作");
      }
      else if (p.logs_level === 'C') {
          if (tx.operator !== user.username) throw new Error("权限不足: C级用户只能撤销自己的操作");
      }
      else if (p.logs_level === 'B') {
          if (tx.operator !== user.username) {
              const { data: opUser } = await client.from('users').select('role_level').eq('username', tx.operator).single();
              if (opUser && opUser.role_level <= user.role_level) {
                  throw new Error("权限不足: B级用户只能撤销低等级用户的操作");
              }
          }
      }

      await this.logClientAction('UNDO_TRANSACTION', { transactionId });
      
      if (tx.type === 'ADJUST') {
          const oldData = tx.snapshot_data?.old;
          if (oldData) {
              const { id, ...updatePayload } = oldData;
              if (tx.batch_id) {
                  await client.from('batches').update(updatePayload).eq('id', tx.batch_id);
              } else if (tx.product_id) {
                  await client.from('products').update(updatePayload).eq('id', tx.product_id);
              }
          } else {
               throw new Error("无法撤销：缺少原始数据快照");
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
      } 
      else if (tx.type === 'DELETE') {
          if (tx.batch_id) {
              await client.from('batches').update({ is_archived: false }).eq('id', tx.batch_id);
          }
          if (tx.product_id && !tx.batch_id) {
              await client.from('products').update({ is_archived: false }).eq('id', tx.product_id);
          }
      }

      await client.from('transactions').update({ is_undone: true }).eq('id', transactionId);
  }
}

export const dataService = new DataService();
