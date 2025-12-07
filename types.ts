
export type Store = {
  id: string;
  name: string;
  location?: string;
};

export type Product = {
  id: string;
  name: string;
  sku?: string | null;
  category?: string | null;
  unit_name?: string | null;       // e.g., "箱"
  split_unit_name?: string | null; // e.g., "瓶"
  split_ratio?: number | null;     // e.g., 24
  min_stock_level?: number | null; 
  image_url?: string | null;
  pinyin?: string | null; 
  is_archived?: boolean; // Soft delete
};

export type Batch = {
  id: string;
  product_id: string;
  store_id: string;
  batch_number?: string | null;
  quantity: number;        
  expiry_date?: string | null;     
  created_at: string;
  is_archived?: boolean; // Soft delete
  // Optional join fields
  store_name?: string; 
};

export type TransactionType = 'IN' | 'OUT' | 'TRANSFER' | 'ADJUST' | 'IMPORT' | 'DELETE';

export type Transaction = {
  id: string;
  type: TransactionType;
  product_id?: string;
  store_id?: string;
  batch_id?: string;
  quantity: number; 
  balance_after?: number; // Snapshot of qty after tx
  timestamp: string;
  note?: string;
  operator?: string; 
  snapshot_data?: any; // JSONB full copy of batch/product at time of tx
  is_undone?: boolean; // NEW: If true, this log is hidden/reverted
  // Join fields
  product?: { name: string };
  store?: { name: string };
};

export type AuditLog = {
  id: number;
  table_name: string;
  record_id: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  old_data: any;
  new_data: any;
  timestamp: string;
};

// 0: Admin (00), 1: Owner (01), 2: Staff (02)
export type RoleLevel = 0 | 1 | 2;

export type User = {
  id: string;
  username: string;
  password?: string; 
  role_level: RoleLevel; // Integer based hierarchy
  default_store_id?: string;
};

export type Announcement = {
  id: string;
  title: string;
  content: string; // HTML supported
  creator: string;
  creator_id?: string;
  
  // Targeting
  target_users: string[]; // User IDs, empty = all
  
  // Visibility
  valid_until: string;
  popup_config: {
      enabled: boolean;
      duration: 'ONCE' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'FOREVER';
  };
  
  // Permissions
  allow_delete: boolean; // Can receiver hide it?
  
  // Status
  is_force_deleted?: boolean; // Admin deleted for everyone
  read_by?: string[]; // IDs of users who read/hid it
  
  created_at: string;
};

export interface AggregatedStock {
  product: Product;
  totalQuantity: number;
  batches: Batch[];
  expiringSoon: number; 
}
