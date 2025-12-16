import { Product, Batch, Transaction, Store, User, Announcement, AuditLog, RoleLevel, UserPermissions } from '../types';
import { getSupabaseClient } from './supabaseClient';
import { authService, DEFAULT_PERMISSIONS } from './authService';

// Declare external library (loaded via CDN in index.html)
declare const imageCompression: any;

class DataService {
  
  public getClient() {
    const client = getSupabaseClient();
    if (!client) return null;
    return client;
  }

  // --- PHASE 7: Performance & RPC ---
  async getDashboardStats(storeId: string, lowLimit: number, expiryDays: number): Promise<any> {
      const client = this.getClient();
      if (!client) return null;

      // Single RPC call replaces multiple waterfalls
      const { data, error } = await client.rpc('get_dashboard_stats', {
          p_store_id: storeId,
          p_low_limit: lowLimit,
          p_expiry_days: expiryDays
      });

      if (error) {
          console.error("Dashboard RPC Error:", error);
          throw new Error(error.message);
      }
      return data;
  }

  // --- PHASE 6: Realtime Broadcast ---
  async sendBroadcast(event: string, payload: any): Promise<void> {
      const client = this.getClient();
      if (!client) return;
      
      // Use a dedicated channel for system-wide broadcasts
      const channel = client.channel('stockwise_broadcast');
      
      await channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
              await channel.send({
                  type: 'broadcast',
                  event: event,
                  payload: payload,
              });
              // Cleanup
              client.removeChannel(channel);
          }
      });
  }

  // --- PHASE 4: Image Upload Service ---
  async uploadProductImage(file: File): Promise<string | null> {
      const client = this.getClient();
      if (!client) throw new Error("Database not connected");

      try {
          console.log(`Original size: ${file.size / 1024 / 1024} MB`);
          
          const options = {
              maxSizeMB: 0.5,
              maxWidthOrHeight: 800,
              useWebWorker: true,
              fileType: 'image/jpeg'
          };

          let compressedFile = file;
          if (typeof imageCompression === 'function') {
              compressedFile = await imageCompression(file, options);
          }

          const fileExt = 'jpg';
          const fileName = `${crypto.randomUUID()}.${fileExt}`;
          const filePath = `${fileName}`;

          const { error: uploadError } = await client.storage
              .from('product-images')
              .upload(filePath, compressedFile);

          if (uploadError) throw uploadError;

          const { data } = client.storage.from('product-images').getPublicUrl(filePath);
          return data.publicUrl;

      } catch (error: any) {
          console.error("Image upload failed:", error);
          throw new Error("图片上传失败: " + error.message);
      }
  }

  // --- Auditing ---
  async logClientAction(action: string, details: any): Promise<void> {
      // NOTE: With Phase 5 triggers, DB changes are auto-logged. 
      // This is now purely for "Business Actions" like Login, Logout, UI clicks.
      const client = this.getClient();
      if (!client) return;
      const user = authService.getCurrentUser();
      
      // We still write to system_audit_logs for generic events, 
      // while data changes go to operation_logs via Trigger.
      await client.from('system_audit_logs').insert({
          table_name: 'CLIENT_ACTION',
          record_id: user?.id || 'ANON',
          operation: 'CLIENT_ACTION',
          new_data: { action, details, operator: user?.username },
          timestamp: new Date().toISOString()
      });
  }

  // --- Users ---
  async getUsers(includeArchived = false): Promise<User[]> {
      const client = this.getClient();
      if (!client) return [];
      let query = client.from('live_users_v').select('*');
      if (!includeArchived) query = query.or('is_archived.is.null,is_archived.eq.false');
      const { data, error } = await query;
      if (error) return [];
      return (data || []).map((row: any) => this.mapRowToUser(row));
  }

  async getUser(id: string): Promise<User | null> {
      const client = this.getClient();
      if (!client) return null;
      const { data } = await client.from('users').select('*').eq('id', id).single();
      if (!data) return null;
      return this.mapRowToUser(data);
  }

  private mapRowToUser(row: any): User {
      return {
          id: row.id,
          username: row.username,
          password: row.password,
          role_level: row.role_level,
          allowed_store_ids: row.allowed_store_ids,
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
              only_view_config: row.only_view_config ?? DEFAULT_PERMISSIONS.only_view_config
          } as UserPermissions
      };
  }

  async createUser(user: Omit<User, 'id'>): Promise<void> {
      const client = this.getClient();
      if (!client) return;
      await this.logClientAction('CREATE_USER', { target: user.username });
      const { permissions, ...userData } = user as any;
      const payload = {
          ...userData,
          id: crypto.randomUUID(),
          logs_level: user.logs_level || permissions?.logs_level || DEFAULT_PERMISSIONS.logs_level,
          announcement_rule: user.announcement_rule || permissions?.announcement_rule || DEFAULT_PERMISSIONS.announcement_rule,
          store_scope: user.store_scope || permissions?.store_scope || DEFAULT_PERMISSIONS.store_scope,
          show_excel: user.show_excel ?? permissions?.show_excel ?? DEFAULT_PERMISSIONS.show_excel,
          view_peers: user.view_peers ?? permissions?.view_peers ?? DEFAULT_PERMISSIONS.view_peers,
          view_self_in_list: user.view_self_in_list ?? permissions?.view_self_in_list ?? DEFAULT_PERMISSIONS.view_self_in_list,
          hide_perm_page: user.hide_perm_page ?? permissions?.hide_perm_page ?? DEFAULT_PERMISSIONS.hide_perm_page,
          hide_audit_hall: user.hide_audit_hall ?? permissions?.hide_audit_hall ?? DEFAULT_PERMISSIONS.hide_audit_hall,
          hide_store_management: user.hide_store_management ?? permissions?.hide_store_management ?? DEFAULT_PERMISSIONS.hide_store_management,
          only_view_config: user.only_view_config ?? permissions?.only_view_config ?? DEFAULT_PERMISSIONS.only_view_config,
          allowed_store_ids: user.allowed_store_ids || [],
          is_archived: false
      };
      const { error } = await client.from('users').insert(payload);
      if (error) throw new Error(error.message);
  }

  async updateUser(id: string, updates: Partial<User>): Promise<void> {
      const client = this.getClient();
      if (!client) return;
      const { permissions, ...userData } = updates as any;
      let payload = { ...userData };
      if (permissions) {
          payload = { ...payload, ...permissions };
      }
      const { error } = await client.from('users').update(payload).eq('id', id);
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
      const { data } = await client.from('announcements').select('*').order('created_at', { ascending: false });
      return data || [];
  }

  async createAnnouncement(ann: any): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      await this.logClientAction('PUBLISH_ANNOUNCEMENT', { title: ann.title });
      await client.from('announcements').insert({ ...ann, id: crypto.randomUUID(), created_at: new Date().toISOString(), is_force_deleted: false, read_by: [] });
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
              if (!reads.includes(hideFlag)) await client.from('announcements').update({ read_by: [...reads, hideFlag] }).eq('id', id);
          }
      }
  }

  async markAnnouncementRead(annId: string, userId: string): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      const { data: ann } = await client.from('announcements').select('read_by').eq('id', annId).single();
      if (ann) {
          const reads = ann.read_by || [];
          if (!reads.includes(userId)) await client.from('announcements').update({ read_by: [...reads, userId] }).eq('id', annId);
      }
  }

  // --- Core Data ---
  async getStores(): Promise<Store[]> {
    const client = this.getClient();
    if(!client) return [];
    const { data, error } = await client.from('stores').select('*').or('is_archived.is.null,is_archived.eq.false');
    if (error) throw new Error(error.message);
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
      const { data: batches } = await client.from('batches').select('quantity').eq('store_id', id).or('is_archived.is.null,is_archived.eq.false');
      const totalStock = batches?.reduce((acc, b) => acc + b.quantity, 0) || 0;
      if (totalStock > 0) throw new Error(`该门店下仍有 ${totalStock} 件库存，无法删除。必须库存归零才允许删除。`);
      await this.logClientAction('DELETE_STORE', { id });
      const { error } = await client.from('stores').update({ is_archived: true }).eq('id', id);
      if(error) throw new Error(error.message);
  }

  async getProducts(includeArchived = false, currentStoreId?: string): Promise<Product[]> {
    const client = this.getClient();
    if(!client) return [];
    let query = client.from('products').select('*');
    if (!includeArchived) query = query.or('is_archived.is.null,is_archived.eq.false');
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const products = data || [];
    if (currentStoreId && currentStoreId !== 'all') return products.filter(p => !p.bound_store_id || p.bound_store_id === currentStoreId);
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
          id: crypto.randomUUID(), type: 'ADJUST', product_id: id, quantity: 0, timestamp: new Date().toISOString(),
          note: `修改商品属性: ${changeDesc}`, operator: user?.username || 'System', snapshot_data: { old: old, new: updates }
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
          id: crypto.randomUUID(), type: 'DELETE', product_id: id, quantity: 0, timestamp: new Date().toISOString(),
          note: `删除了 ${prod?.name} (含 ${count} 个批次)`, operator: user?.username || 'System', snapshot_data: { context: 'SOFT_DELETE_PRODUCT', name: prod?.name }
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
    return (data || []).filter((b: any) => b.quantity >= 0).map((b: any) => ({ ...b, store_name: b.store?.name }));
  }

  async getTransactions(filterType?: string, limit = 200, startDate?: string, storeId?: string): Promise<Transaction[]> {
    const client = this.getClient();
    if(!client) return [];
    let query = client.from('transactions').select('*, product:products(name), store:stores(name)').eq('is_undone', false).order('timestamp', { ascending: false }).limit(limit);
    if (filterType && filterType !== 'ALL') query = query.eq('type', filterType);
    if (startDate) query = query.gte('timestamp', startDate);
    if (storeId && storeId !== 'all') {
        query = query.eq('store_id', storeId);
    } else {
        const user = authService.getCurrentUser();
        if (user && user.permissions.store_scope === 'LIMITED') query = query.in('store_id', user.allowed_store_ids || []);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const allTransactions = data || [];
    const user = authService.getCurrentUser();
    if (!user) return [];
    const logLevel = user.permissions.logs_level;
    if (logLevel === 'A' || logLevel === 'B' || logLevel === 'C') return allTransactions;
    else return allTransactions.filter(t => t.operator === user.username);
  }

  // Phase 5: Fetch from new 'operation_logs' table
  async getAuditLogs(limit = 100): Promise<AuditLog[]> {
      const client = this.getClient();
      if (!client) return [];
      
      // Fetch from new 'operation_logs' table
      const { data, error } = await client.from('operation_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
        
      if (error) {
          // Fallback to legacy system_audit_logs if new one fails or is empty (during migration)
          console.warn("Falling back to legacy logs", error);
          const { data: legacy } = await client.from('system_audit_logs').select('*').order('timestamp', { ascending: false }).limit(limit);
          return legacy || [];
      }
      
      // Map new schema to AuditLog type
      return (data || []).map((row: any) => ({
          id: row.id,
          table_name: row.table_name,
          record_id: row.record_id,
          operation: row.action_type,
          old_data: row.previous_state,
          new_data: row.new_state,
          timestamp: row.created_at,
          operator: 'System/User' // The new log stores UUID in 'changed_by', resolving to name needs join, simplified here
      }));
  }
  
  async getStockFlowStats(days: number, storeId?: string): Promise<{date: string, in: number, out: number}[]> {
      const client = this.getClient();
      if (!client) return [];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      let query = client.from('transactions').select('type, quantity, timestamp, store_id').eq('is_undone', false).gte('timestamp', cutoff.toISOString()).order('timestamp', { ascending: true });
      if (storeId && storeId !== 'all') query = query.eq('store_id', storeId);
      const user = authService.getCurrentUser();
      if (user && user.permissions.store_scope === 'LIMITED') query = query.in('store_id', user.allowed_store_ids || []);
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
      return Array.from(map.entries()).map(([date, val]) => ({ date: date.slice(5), in: val.in, out: val.out })).sort((a,b) => a.date.localeCompare(b.date));
  }

  async updateStock(productId: string, storeId: string, quantityChange: number, type: 'IN' | 'OUT', note?: string, batchId?: string): Promise<void> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      const user = authService.getCurrentUser();
      if (!batchId) throw new Error("Batch ID required");
      if (user?.permissions.store_scope === 'LIMITED') {
          if (!user.allowed_store_ids.includes(storeId)) throw new Error("无权操作此门店");
      }
      const { data: batch } = await client.from('batches').select('*').eq('id', batchId).single();
      const { data: product } = await client.from('products').select('*').eq('id', productId).single();
      const snapshot = { batch, product, tx_context: 'manual_update' };
      const { error } = await client.rpc('operate_stock', {
          p_batch_id: batchId, p_qty_change: type === 'OUT' ? -quantityChange : quantityChange,
          p_type: type, p_note: note, p_operator: user?.username || 'System', p_snapshot: snapshot
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
            p_batch_id: batch.id, p_qty_change: -deduct, p_type: 'OUT', p_note: note ? `${note} (FIFO)` : 'FIFO 出库',
            p_operator: user?.username || 'System', p_snapshot: { batch, product, tx_context: 'FIFO' }
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
                  if (oldBatch.store_id && !user.allowed_store_ids.includes(oldBatch.store_id)) throw new Error("无权操作此门店");
              }
              const { error } = await client.rpc('operate_stock', {
                  p_batch_id: batchId, p_qty_change: delta, p_type: 'ADJUST', p_note: '库存数量修正',
                  p_operator: user?.username || 'System', p_snapshot: { old: oldBatch, new_qty: updates.quantity }
              });
              if(error) throw new Error(error.message);
          }
          delete updates.quantity;
      }
      if (Object.keys(updates).length > 0) {
          const changeDesc = Object.keys(updates).map(k => `${k}: [${(oldBatch as any)[k]}]->[${(updates as any)[k]}]`).join(', ');
          await client.from('batches').update(updates).eq('id', batchId);
          await client.from('transactions').insert({
              id: crypto.randomUUID(), type: 'ADJUST', batch_id: batchId, product_id: oldBatch.product_id, store_id: oldBatch.store_id, quantity: 0, timestamp: new Date().toISOString(),
              note: `修改批次属性: ${changeDesc}`, operator: user?.username || 'System', snapshot_data: { old: oldBatch, updates } 
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
          id: crypto.randomUUID(), type: 'DELETE', batch_id: batchId, product_id: batch?.product_id, store_id: batch?.store_id, quantity: 0, timestamp: new Date().toISOString(),
          note: `删除了批次 ${batch?.batch_number}`, operator: user?.username || 'System', snapshot_data: { deleted_batch: batch }
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
      if (batch.quantity > 0) await this.updateStock(batch.product_id, batch.store_id, batch.quantity, 'IN', '新批次入库', id);
      return id;
  }

  // --- PHASE 5: ENHANCED UNDO WITH CONFLICT DETECTION ---
  async undoTransaction(transactionId: string): Promise<void> {
      const client = this.getClient();
      if(!client) throw new Error("No DB");
      const { data: tx } = await client.from('transactions').select('*').eq('id', transactionId).single();
      if (!tx) throw new Error("记录不存在");

      const user = authService.getCurrentUser();
      if (!user) return;
      const p = user.permissions;
      
      if (p.logs_level === 'D' && tx.operator !== user.username) throw new Error("权限不足: D级用户只能撤销自己的操作");
      if (p.logs_level === 'C' && tx.operator !== user.username) throw new Error("权限不足: C级用户只能撤销自己的操作");
      if (p.logs_level === 'B' && tx.operator !== user.username) {
          const { data: opUser } = await client.from('users').select('role_level').eq('username', tx.operator).single();
          if (opUser && opUser.role_level <= user.role_level) throw new Error("权限不足: B级用户只能撤销低等级用户的操作");
      }

      await this.logClientAction('UNDO_TRANSACTION', { transactionId });
      
      // CONFLICT DETECTION
      if (tx.type === 'ADJUST' && tx.snapshot_data?.new) {
          // 1. Determine table
          const table = tx.batch_id ? 'batches' : 'products';
          const recordId = tx.batch_id || tx.product_id;
          
          // 2. Fetch current DB state
          const { data: currentRecord } = await client.from(table).select('*').eq('id', recordId).single();
          
          if (!currentRecord) throw new Error("回滚失败：目标记录已被删除");

          // 3. Compare Critical Fields (Current vs What the log thinks 'New' was)
          // If current != snapshot.new, it means someone else modified it AFTER this transaction.
          const expectedState = tx.snapshot_data.new;
          let hasConflict = false;
          let conflictingField = '';

          for (const key of Object.keys(expectedState)) {
              // Ignore timestamps or irrelevant fields
              if (['updated_at', 'created_at', 'quantity'].includes(key)) continue;
              
              // Loose comparison for numbers/strings
              if (String(currentRecord[key]) !== String(expectedState[key])) {
                  hasConflict = true;
                  conflictingField = key;
                  break;
              }
          }

          if (hasConflict) {
              throw new Error(`安全拦截：数据已发生后续变更 (字段 '${conflictingField}' 不匹配)，无法安全回滚。请手动修正。`);
          }

          // 4. Safe Rollback (Restore Old)
          const oldData = tx.snapshot_data?.old;
          if (oldData) {
              const { id, ...updatePayload } = oldData;
              if (tx.batch_id) await client.from('batches').update(updatePayload).eq('id', tx.batch_id);
              else await client.from('products').update(updatePayload).eq('id', tx.product_id);
          }
      } 
      else if (['IN', 'OUT', 'IMPORT', 'RESTORE'].includes(tx.type)) {
          // For quantity, we assume compensating transaction is safe enough for this simplified model
          // (Real conflict detection for qty involves checking if stock would go negative, 
          // which operate_stock RPC handles via exception)
          const inverseQty = -tx.quantity; 
          const { error } = await client.rpc('operate_stock', {
              p_batch_id: tx.batch_id,
              p_qty_change: inverseQty,
              p_type: 'RESTORE', 
              p_note: `撤销操作 (Ref: ${transactionId})`,
              p_operator: user?.username || 'System',
              p_snapshot: { original_tx: tx, context: 'UNDO' }
          });
          if (error) throw new Error(error.message); // RPC handles negative stock error
      } 
      else if (tx.type === 'DELETE') {
          if (tx.batch_id) await client.from('batches').update({ is_archived: false }).eq('id', tx.batch_id);
          if (tx.product_id && !tx.batch_id) await client.from('products').update({ is_archived: false }).eq('id', tx.product_id);
      }

      await client.from('transactions').update({ is_undone: true }).eq('id', transactionId);
  }
}

export const dataService = new DataService();