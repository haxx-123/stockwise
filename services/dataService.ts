
import { Product, Batch, Transaction, Store, User, Announcement, AuditLog, RoleLevel } from '../types';
import { getSupabaseClient } from './supabaseClient';
import { authService, DEFAULT_PERMISSIONS } from './authService';

class DataService {
  
  private getClient() {
    const client = getSupabaseClient();
    if (!client) return null;
    return client;
  }

  // --- Users ---
  async getUsers(): Promise<User[]> {
      const client = this.getClient();
      if (!client) return [];
      const { data, error } = await client.from('users').select('*');
      if (error) return []; 
      return data || [];
  }

  async createUser(user: Omit<User, 'id'>): Promise<void> {
      const client = this.getClient();
      if (!client) return;
      const { error } = await client.from('users').insert({ 
          ...user, 
          id: crypto.randomUUID(),
          // Ensure JSON defaults
          permissions: user.permissions || DEFAULT_PERMISSIONS,
          allowed_store_ids: user.allowed_store_ids || []
      });
      if (error) throw new Error(error.message);
  }

  async updateUser(id: string, updates: Partial<User>): Promise<void> {
      const client = this.getClient();
      if (!client) return;
      const { error } = await client.from('users').update(updates).eq('id', id);
      if (error) throw new Error(error.message);
  }

  async deleteUser(id: string): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      await client.from('users').delete().eq('id', id);
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
      await client.from('announcements').update(updates).eq('id', id);
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
    const { data, error } = await client.from('stores').select('*');
    if (error) throw new Error(error.message);
    
    // Global filter based on User Permissions (Client Side Enforcement)
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
      const newStore = { id: crypto.randomUUID(), name, location };
      const { data, error } = await client.from('stores').insert(newStore).select().single();
      if(error) throw new Error(error.message);
      return data;
  }

  async updateStore(id: string, updates: Partial<Store>): Promise<void> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      const { error } = await client.from('stores').update(updates).eq('id', id);
      if(error) throw new Error(error.message);
  }

  async getProducts(includeArchived = false): Promise<Product[]> {
    const client = this.getClient();
    if(!client) return [];
    let query = client.from('products').select('*');
    if (!includeArchived) {
        query = query.or('is_archived.is.null,is_archived.eq.false');
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  }

  async updateProduct(id: string, updates: Partial<Product>): Promise<void> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      const { error } = await client.from('products').update(updates).eq('id', id);
      if (error) throw new Error(error.message);
  }

  async deleteProduct(id: string): Promise<void> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      // Use Soft Delete to preserve history
      const { error } = await client.from('products').update({ is_archived: true }).eq('id', id);
      if (error) throw new Error(error.message);
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
    
    return (data || []).filter(b => b.quantity > 0).map((b: any) => ({
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
        // If 'all' is requested, but user is LIMITED, we must filter to allowed stores
        const user = authService.getCurrentUser();
        if (user && user.permissions.store_scope === 'LIMITED') {
             // Supabase 'in' query
             query = query.in('store_id', user.allowed_store_ids || []);
        }
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    
    const allTransactions = data || [];

    // --- LOG PERMISSION FILTERING (Matrix) ---
    const user = authService.getCurrentUser();
    if (!user) return [];

    const logLevel = user.permissions.logs_level; // A, B, or C

    if (logLevel === 'A') {
        return allTransactions; // All logs
    } else if (logLevel === 'C') {
        // Self Only
        return allTransactions.filter(t => t.operator === user.username);
    } else if (logLevel === 'B') {
        // Self + Lower Level Users
        // We need to fetch all users to know their levels.
        const { data: allUsers } = await client.from('users').select('username, role_level');
        if (!allUsers) return allTransactions.filter(t => t.operator === user.username);

        const lowerLevelUsers = new Set(
            allUsers
            .filter(u => u.role_level > user.role_level) // Strictly lower power (higher number)
            .map(u => u.username)
        );
        
        return allTransactions.filter(t => 
            t.operator === user.username || lowerLevelUsers.has(t.operator || '')
        );
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
      
      // Also apply Limited Store Scope here for stats
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

      // Verify Store Access
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
    
    // Check Store Perms
    const user = authService.getCurrentUser();
    if (user?.permissions.store_scope === 'LIMITED') {
        if (!user.allowed_store_ids.includes(storeId)) throw new Error("无权操作此门店");
    }

    let query = client.from('batches').select('*').eq('product_id', productId).gt('quantity', 0).or('is_archived.is.null,is_archived.eq.false').order('expiry_date', { ascending: true });
    
    if (storeId && storeId !== 'all') {
        query = query.eq('store_id', storeId);
    }

    const { data: batches } = await query;
    const totalAvailable = batches?.reduce((acc, b) => acc + b.quantity, 0) || 0;
    if (totalAvailable < quantity) throw new Error(`库存不足。可用: ${totalAvailable}`);

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
              await this.updateStock(
                  oldBatch.product_id, 
                  oldBatch.store_id, 
                  Math.abs(delta), 
                  delta > 0 ? 'IN' : 'OUT', 
                  '手动调整库存', 
                  batchId
              );
          }
          delete updates.quantity;
      }

      if (Object.keys(updates).length > 0) {
          const { error } = await client.from('batches').update(updates).eq('id', batchId);
          if (error) throw new Error(error.message);
          
          const { data: product } = await client.from('products').select('*').eq('id', oldBatch.product_id).single();
          await client.from('transactions').insert({
               id: crypto.randomUUID(),
               type: 'ADJUST',
               product_id: oldBatch.product_id,
               store_id: oldBatch.store_id,
               batch_id: batchId,
               quantity: 0,
               timestamp: new Date().toISOString(),
               note: '属性调整',
               operator: user?.username || 'System',
               snapshot_data: { old: oldBatch, updates: updates, product }
          });
      }
  }

  async deleteBatch(batchId: string): Promise<void> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      
      const user = authService.getCurrentUser();
      const perms = authService.permissions; 
      
      const { data: batch } = await client.from('batches').select('*, product:products(*)').eq('id', batchId).single();

      if (perms.can_hard_delete) {
          // Check if user is actually admin or role level 0 for physical delete if logic requires
          // The authService maps `delete_mode: 'HARD'` to `can_hard_delete`.
          await client.from('batches').delete().eq('id', batchId);
          // Also delete related transactions? Typically Foreign Key Cascade handles it if configured, 
          // or we leave logs as orphans (bad practice). 
          // But req says "Physical Delete". 
      } else {
          const { error } = await client.from('batches').update({ is_archived: true }).eq('id', batchId);
          if (error) throw new Error(error.message);
      }

      // Log the deletion (even if hard deleted, we keep a log record usually, but strict hard delete might mean no trace? 
      // Requirement says "Physical Delete Data". Assuming Transaction log acts as audit trail.)
      await client.from('transactions').insert({
          id: crypto.randomUUID(),
          type: 'DELETE',
          batch_id: batchId,
          product_id: batch?.product_id,
          store_id: batch?.store_id,
          quantity: 0,
          timestamp: new Date().toISOString(),
          note: perms.can_hard_delete ? '物理删除' : '归档删除',
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

      // Permission Check for Undo
      // Already filtered by `getTransactions` visibility, but double check undo rights
      const user = authService.getCurrentUser();
      const p = user?.permissions;
      
      // If Level C, can only undo OWN
      if (p?.logs_level === 'C' && tx.operator !== user?.username) {
          throw new Error("权限不足: 只能撤销自己的操作");
      }
      // If Level B, can undo Own OR Lower level. 
      if (p?.logs_level === 'B') {
           if (tx.operator !== user?.username) {
               // Check target level
               const { data: targetUser } = await client.from('users').select('role_level').eq('username', tx.operator).single();
               if (targetUser && targetUser.role_level <= user!.role_level) {
                   throw new Error("权限不足: 只能撤销下级用户的操作");
               }
           }
      }

      // Execute Undo
      await client.from('transactions').update({ is_undone: true }).eq('id', transactionId);

      if (tx.type === 'IN' || tx.type === 'OUT' || tx.type === 'IMPORT') {
          const inverseQty = -tx.quantity; 
          const inverseType = tx.type === 'IN' ? 'OUT' : 'IN';
          
          const { error } = await client.rpc('operate_stock', {
              p_batch_id: tx.batch_id,
              p_qty_change: inverseQty,
              p_type: inverseType,
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
      }
  }
}

export const dataService = new DataService();
