

export type Store = {
  id: string;
  name: string;
  location?: string;
  is_archived?: boolean; // Soft Delete
};

export type Product = {
  id: string;
  name: string;
  sku?: string | null;
  category?: string | null;
  unit_name?: string | null;       
  split_unit_name?: string | null; 
  split_ratio?: number | null;     
  min_stock_level?: number | null; 
  image_url?: string | null;
  pinyin?: string | null; 
  is_archived?: boolean; 
  bound_store_id?: string | null; // Strict Isolation
};

export type Batch = {
  id: string;
  product_id: string;
  store_id: string;
  batch_number?: string | null;
  quantity: number;        
  expiry_date?: string | null;     
  created_at: string;
  is_archived?: boolean; 
  store_name?: string; 
};

export type TransactionType = 'IN' | 'OUT' | 'TRANSFER' | 'ADJUST' | 'IMPORT' | 'DELETE' | 'RESTORE';

export type Transaction = {
  id: string;
  type: TransactionType;
  product_id?: string;
  store_id?: string;
  batch_id?: string;
  quantity: number; 
  balance_after?: number; 
  timestamp: string;
  note?: string;
  operator?: string; 
  snapshot_data?: any; 
  is_undone?: boolean; 
  product?: { name: string };
  store?: { name: string };
};

export type AuditLog = {
  id: number;
  table_name: string;
  record_id: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'CLIENT_ACTION';
  old_data: any;
  new_data: any;
  timestamp: string;
};

// 0-9: Lower is higher power. 00 is Admin.
export type RoleLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface UserPermissions {
    logs_level: 'A' | 'B' | 'C' | 'D'; // A:All+UndoAny, B:All+UndoLower, C:All+UndoSelf, D:Self+UndoSelf
    announcement_rule: 'PUBLISH' | 'VIEW';
    store_scope: 'GLOBAL' | 'LIMITED';
    show_excel: boolean;
    
    // New Permission Dimensions
    view_peers: boolean; // Can view/manage users of same level
    view_self_in_list: boolean;
    hide_perm_page: boolean; 
    
    // New Hiding Options
    hide_audit_hall: boolean;
    hide_store_management: boolean; // Hides Rename, Delete, Create Store
    
    // Special Init Account Permission
    only_view_config?: boolean;
}

export type RolePermissionMatrix = Record<RoleLevel, UserPermissions>;

export type User = {
  id: string;
  username: string;
  password?: string; 
  role_level: RoleLevel; 
  permissions: UserPermissions; // Deprecated in favor of Matrix, but kept for legacy/init
  allowed_store_ids: string[]; // For LIMITED scope
  is_archived?: boolean; // Soft Delete
  face_descriptor?: string | null; // Base64 of face image or descriptor
};

export type Announcement = {
  id: string;
  title: string;
  content: string; 
  creator: string;
  creator_id?: string;
  target_users: string[]; 
  valid_until: string;
  popup_config: {
      enabled: boolean;
      duration: 'ONCE' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'FOREVER';
  };
  allow_delete: boolean; // "Can hide"
  is_force_deleted?: boolean; // Admin soft delete (invalid for everyone)
  read_by?: string[]; // Array of User IDs OR 'HIDDEN_BY_USERID' strings
  created_at: string;
};

export interface AggregatedStock {
  product: Product;
  totalQuantity: number;
  batches: Batch[];
  expiringSoon: number; 
}
