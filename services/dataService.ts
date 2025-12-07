
import { Product, Batch, Transaction, Store, User, Announcement, AuditLog, RoleLevel } from '../types';
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
      let query = client.from('users').select('*');
      if (!includeArchived) {
          query = query.or('is_archived.is.null,is_archived.eq.false');
      }
      const { data, error } = await query;
      if (error) return []; 
      return data || [];
  }

  async createUser(user: Omit<User, 'id'>): Promise<void> {
      const client = this.getClient();
      if (!client) return;
      
      const currentUser = authService.getCurrentUser();
      await this.logClientAction('CREATE_USER', { target: user.username });

      const { error } = await client.from('users').insert({ 
          ...user, 
          id: crypto.randomUUID(),
          permissions: user.permissions || DEFAULT_PERMISSIONS,
          allowed_store_ids: user.allowed_store_ids || [],
          is_archived: false
      });
      if (error) throw new Error(error.message);
  }

  async updateUser(id: string, updates: Partial<User>): Promise<void> {
      const client = this.getClient();
      if (!client) return;
      await this.logClientAction('UPDATE_USER', { id, updates });
      const { error } = await client.from('users').update(updates).eq('id', id);
      if (error) throw new Error(error.message);
  }

  async deleteUser(id: string): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      await this.logClientAction('DELETE_USER', { id });
      // Soft Delete
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
          // Admin "Force Delete" -> invalidates for everyone
          await this.logClientAction('FORCE_DELETE_ANNOUNCEMENT', { id });
          await client.from('announcements').update({ is_force_deleted: true, title: `(已被 ${user?.username} 删除) ` }).eq('id', id);
      } else {
          // Soft delete (hide from self) is handled via 'read_by' logic or local state usually, 
          // but if this is "My Announcement List" delete, we might just hide it.
          // For now, assuming standard soft delete logic is mostly Admin based.
      }
  }

  async markAnnouncementRead(annId: string, userId: string): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      // Fetch current
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
    
    // Fetch only non-archived
    const { data, error } = await client.from('stores').select('*').or('is_archived.is.null,is_archived.eq.false');
    if (error) throw new Error(error.message);
    
    // Global filter based on User Permissions
    const user = authService.getCurrentUser();
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
      
      // Check stock
      const { count } = await client.from('batches').select('*', { count: 'exact', head: true }).eq('store_id', id).gt('quantity', 0);
      if (count && count > 0) throw new Error("该门店下仍有库存，无法删除。");

      await this.logClientAction('DELETE_STORE', { id });
      // Soft Delete
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

    // STRICT ISOLATION: 
    // If bound_store_id is set, only show if it matches currentStoreId or if we are in 'all' view (and allowed).
    // If bound_store_id is null, it's global.
    
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const products = data || [];
    if (!currentStoreId || currentStoreId === 'all') return products;

    return products.filter(p => !p.bound_store_id || p.bound_store_id === currentStoreId);
  }

  async updateProduct(id: string, updates: Partial<Product>): Promise<void> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      await this.logClientAction('UPDATE_PRODUCT', { id, updates });
      const { error } = await client.from('products').update(updates).eq('id', id);
      if (error) throw new Error(error.message);
  }

  async deleteProduct(id: string): Promise<void> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      
      const user = authService.getCurrentUser();
      const { data: prod } = await client.from('products').select('name').eq('id', id).single();

      await this.logClientAction('DELETE_PRODUCT', { id, name: prod?.name });

      // Soft Delete Only
      const { error } = await client.from('products').update({ is_archived: true }).eq('id', id);
      if (error) throw new Error(error.message);

      // Record transaction
      await client.from('transactions').insert({
          id: crypto.randomUUID(),
          type: 'DELETE',
          product_id: id,
          quantity: 0,
          timestamp: new Date().toISOString(),
          note: '商品归档 (软删除)',
          operator: user?.username || 'System',
          snapshot_data: { context: 'SOFT_DELETE_PRODUCT' }
      });
  }

  async getBatches(storeId?: string, productId?: string): Promise<Batch[]> {
    const client = this.getClient();
    if(!client) return [];
    
    let query = client.from('batches').select('*, store:stores(name)');
    query = query.or('is_archived.is.null,is_archived.eq.false');
    if (storeId) query = query.eq('store_id', storeId);
    if (productId) query = query.eq('product_id', productId);
    
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    
    return (data || []).filter((b: any) => b.quantity > 0).map((b: any) => ({
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
    
    // Store isolation
    if (storeId && storeId !== 'all') {
        query = query.eq('store_id', storeId);
    } else {
        const user = authService.getCurrentUser();
        if (user && user.permissions.store_scope === 'LIMITED') {
             query = query.in('store_id', user.allowed_store_ids || []);
        }
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    
    const allTransactions = data || [];

    // --- LOG PERMISSION FILTERING ---
    const user = authService.getCurrentUser();
    if (!user) return [];

    const logLevel = user.permissions.logs_level;

    if (logLevel === 'A') {
        return allTransactions;
    } else if (logLevel === 'C') {
        return allTransactions.filter(t => t.operator === user.username);
    } else if (logLevel === 'B') {
        // Self + Lower Level Users
        const { data: allUsers } = await client.from('users').select('username, role_level');
        if (!allUsers) return allTransactions.filter(t => t.operator === user.username);

        const userLevelMap = new Map<string, number>();
        allUsers.forEach(u => userLevelMap.set(u.username, u.role_level));

        const myLevel = user.role_level;

        return allTransactions.filter(t => {
            if (t.operator === user.username) return true;
            const targetLevel = userLevelMap.get(t.operator || '');
            // Lower Level means Higher Number
            return targetLevel !== undefined && targetLevel > myLevel;
        });
    }

    return [];
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
              if (t.type === 'IN' || t.type === 'IMPORT') curr.in += t.quantity;
              if (t.type === 'OUT') curr.out += t.quantity;
          }
      });

      return Array.from(map.entries())
        .map(([date, val]) => ({ date: date.slice(5), in: val.in, out: val.out }))
        .sort((a,b) => a.date.localeCompare(b.date));
  }

  // --- ATOMIC OPERATIONS (RPC) ---

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
      if (!batchId) throw new Error("Batch ID required");

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

    // Strict store filter
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

      // Handle Quantity via Stock Op to ensure transaction record
      if (updates.quantity !== undefined && oldBatch) {
          const delta = updates.quantity - oldBatch.quantity;
          if (delta !== 0) {
              // Permission check
              if (user?.permissions.store_scope === 'LIMITED') {
                  if (oldBatch.store_id && !user.allowed_store_ids.includes(oldBatch.store_id)) {
                       throw new Error("无权操作此门店");
                  }
              }

              // Use RPC directly for ADJUST
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
          await this.logClientAction('ADJUST_BATCH_PROPS', { batchId, updates });
          const { error } = await client.from('batches').update(updates).eq('id', batchId);
          if (error) throw new Error(error.message);
      }
  }

  async deleteBatch(batchId: string): Promise<void> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      
      const user = authService.getCurrentUser();
      
      const { data: batch } = await client.from('batches').select('*, product:products(*)').eq('id', batchId).single();

      // Always Soft Delete
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
          note: '批次归档',
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
      const { error } = await client.from('batches').insert({ ...batch, id, quantity: 0, created_at: new Date().toISOString() });
      if (error) throw new Error(error.message);

      if (batch.quantity > 0) {
         // Use IMPORT or IN based on context? 
         // Usually createBatch is part of Stock In.
         await this.updateStock(batch.product_id, batch.store_id, batch.quantity, 'IN', '新批次入库', id);
      }
      return id;
  }

  // --- UNDO ---
  async undoTransaction(transactionId: string): Promise<void> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      const { data: tx } = await client.from('transactions').select('*').eq('id', transactionId).single();
      if (!tx) throw new Error("记录不存在");

      const user = authService.getCurrentUser();
      const p = user?.permissions;
      
      // Permission checks
      if (p?.logs_level === 'C' && tx.operator !== user?.username) {
          throw new Error("权限不足: 只能撤销自己的操作");
      }
      if (p?.logs_level === 'B') {
           if (tx.operator !== user?.username) {
               const { data: targetUser } = await client.from('users').select('role_level').eq('username', tx.operator).single();
               const myLevel = user?.role_level || 9;
               const targetLevel = targetUser?.role_level || 9;
               if (targetLevel <= myLevel) {
                   throw new Error("权限不足: 只能撤销下级用户的操作");
               }
           }
      }

      await this.logClientAction('UNDO_TRANSACTION', { transactionId });
      await client.from('transactions').update({ is_undone: true }).eq('id', transactionId);

      if (['IN', 'OUT', 'IMPORT', 'ADJUST'].includes(tx.type)) {
          const inverseQty = -tx.quantity; 
          // Adjust logic needs careful handling if it was a property change vs quantity change.
          // For now assuming quantity based transactions.
          
          const { error } = await client.rpc('operate_stock', {
              p_batch_id: tx.batch_id,
              p_qty_change: inverseQty,
              p_type: 'RESTORE', // Type for the undo log
              p_note: `撤销操作 (Ref: ${transactionId})`,
              p_operator: user?.username || 'System',
              p_snapshot: { original_tx: tx, context: 'UNDO' }
          });
          if (error) throw new Error(error.message);
      } 
      else if (tx.type === 'DELETE') {
          // Restore Soft Deleted
          if (tx.batch_id) {
              await client.from('batches').update({ is_archived: false }).eq('id', tx.batch_id);
          }
          if (tx.product_id && !tx.batch_id) {
              await client.from('products').update({ is_archived: false }).eq('id', tx.product_id);
          }
      }
  }
}

export const dataService = new DataService();
