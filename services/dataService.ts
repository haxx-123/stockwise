

// ... existing imports ...
import { Product, Batch, Transaction, Store, User, Announcement, AuditLog, RoleLevel, UserPermissions } from '../types';
import { getSupabaseClient } from './supabaseClient';
import { authService, DEFAULT_PERMISSIONS } from './authService';

class DataService {
  public getClient() {
    const client = getSupabaseClient();
    if (!client) return null;
    return client;
  }

  // --- Users ---
  // Fix: Need specific single user fetch to bypass stale list state
  async getUser(id: string): Promise<User | null> {
      const client = this.getClient();
      if (!client) return null;
      const { data, error } = await client.from('users').select('*').eq('id', id).single();
      if (error || !data) return null;
      
      // Map permissions manually if needed, or use stored object
      return {
          ...data,
          permissions: {
              ...DEFAULT_PERMISSIONS,
              ...(data.permissions || {}), // Merge stored JSONB permissions if you use JSONB column, else map flat cols
              // If you use flat columns for permissions, map them here:
              show_excel: data.show_excel,
              hide_audit_hall: data.hide_audit_hall,
              // ... map others
          }
      };
  }

  async getUsers(includeArchived = false): Promise<User[]> {
      const client = this.getClient();
      if (!client) return [];
      
      let query = client.from('live_users_v').select('*');
      if (!includeArchived) {
          query = query.or('is_archived.is.null,is_archived.eq.false');
      }
      const { data, error } = await query;
      if (error) { console.error(error); return []; }
      
      return (data || []).map((row: any) => ({
          ...row,
          permissions: { ...DEFAULT_PERMISSIONS, ...row } // Simplify mapping for view
      }));
  }

  async updateUser(id: string, updates: Partial<User>): Promise<void> {
      const client = this.getClient();
      if (!client) return;
      
      let payload: any = { ...updates };
      // If updating permissions, flattening might be needed depending on DB schema
      // For this demo, assuming DB has flat columns matching permission keys OR a jsonb 'permissions' column
      if (updates.permissions) {
          // Flatten for DB if using columns
          const p = updates.permissions;
          payload = { ...payload, 
              show_excel: p.show_excel, 
              hide_audit_hall: p.hide_audit_hall,
              // ... add other keys
          };
          delete payload.permissions; 
      }

      await client.from('users').update(payload).eq('id', id);
  }

  // ... (Rest of existing DataService methods: getStores, getProducts, etc. keep them as is) ...
  // Re-implementing necessary ones for context completeness if needed, but assuming they exist from previous turns.
  
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
    if (storeId && storeId !== 'all') query = query.eq('store_id', storeId);
    const { data } = await query;
    return (data || []).map((b: any) => ({...b, store_name: b.store?.name}));
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

  async createBatch(batch: any): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      await client.from('batches').insert({ ...batch, id: crypto.randomUUID(), created_at: new Date().toISOString() });
  }

  async updateStock(pid: string, sid: string, qty: number, type: string, note: string, bid: string): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      // Using RPC for safety
      await client.rpc('operate_stock', { p_batch_id: bid, p_qty_change: type==='OUT'?-qty:qty, p_type: type, p_note: note, p_operator: 'System' });
  }

  async adjustBatch(bid: string, updates: any): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      await client.from('batches').update(updates).eq('id', bid);
  }

  async updateProduct(pid: string, updates: any): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      await client.from('products').update(updates).eq('id', pid);
  }

  async deleteStore(id: string): Promise<void> {
      const client = this.getClient();
      if(!client) return;
      await client.from('stores').update({ is_archived: true }).eq('id', id);
  }

  async getTransactions(filter: string, limit: number): Promise<Transaction[]> {
      const client = this.getClient();
      if(!client) return [];
      const { data } = await client.from('transactions').select('*').limit(limit);
      return data || [];
  }

  async getAuditLogs(limit: number): Promise<AuditLog[]> {
      const client = this.getClient();
      if(!client) return [];
      const { data } = await client.from('system_audit_logs').select('*').limit(limit);
      return data || [];
  }

  async undoTransaction(id: string): Promise<void> {
      // implementation ...
  }

  // New Methods added for fixing errors

  async getStockFlowStats(days: number, storeId: string): Promise<any[]> {
    const client = this.getClient();
    if (!client) return [];
    
    // Calculate start date
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    let query = client.from('transactions')
      .select('type, quantity, timestamp, store_id')
      .gte('timestamp', startDate.toISOString());

    if (storeId && storeId !== 'all') {
        query = query.eq('store_id', storeId);
    }

    const { data } = await query;
    const txs = data || [];

    // Aggregate by date
    const stats: Record<string, { in: number, out: number }> = {};
    
    // Initialize dates
    for(let i=0; i<days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        stats[key] = { in: 0, out: 0 };
    }

    txs.forEach((t: any) => {
        const key = t.timestamp.split('T')[0];
        if (stats[key]) {
            if (t.type === 'IN' || t.type === 'IMPORT') stats[key].in += Math.abs(t.quantity);
            if (t.type === 'OUT') stats[key].out += Math.abs(t.quantity);
        }
    });

    return Object.keys(stats).sort().map(date => ({
        date,
        in: stats[date].in,
        out: stats[date].out
    }));
  }

  async processStockOut(productId: string, storeId: string, quantity: number, note: string): Promise<void> {
      const client = this.getClient();
      if(!client) throw new Error("Database not connected");

      // FIFO Logic: Get batches sorted by expiry_date asc
      const { data: batches, error } = await client.from('batches')
          .select('*')
          .eq('product_id', productId)
          .eq('store_id', storeId)
          .gt('quantity', 0)
          .order('expiry_date', { ascending: true });

      if (error) throw error;
      if (!batches || batches.length === 0) throw new Error("库存不足");

      let remaining = quantity;
      
      // Calculate total stock first
      const totalStock = batches.reduce((acc: number, b: any) => acc + b.quantity, 0);
      if (totalStock < quantity) throw new Error(`库存不足 (当前: ${totalStock}, 需要: ${quantity})`);

      for (const batch of batches) {
          if (remaining <= 0) break;
          
          const take = Math.min(batch.quantity, remaining);
          
          await this.updateStock(productId, storeId, take, 'OUT', note, batch.id);
          
          remaining -= take;
      }
  }

  async logClientAction(operation: string, details: any): Promise<void> {
      const client = this.getClient();
      if (!client) return;
      
      await client.from('system_audit_logs').insert({
          table_name: 'CLIENT',
          record_id: 'N/A',
          operation: operation,
          old_data: null,
          new_data: details,
          timestamp: new Date().toISOString()
      });
  }
}

export const dataService = new DataService();
