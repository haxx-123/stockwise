

export type Store = {
  id: string;
  name: string;
  location?: string;
  image_url?: string; 
  parent_id?: string | null; // Link to Parent Store
  managers?: string[]; // User IDs
  viewers?: string[]; // User IDs
  is_archived?: boolean; 
  // Virtual
  children?: Store[]; 
};

export type Product = {
  id: string;
  name: string;
  sku?: string | null;
  category?: string | null;
  unit_name?: string | null; // "整"
  split_unit_name?: string | null; // "散"
  split_ratio?: number | null;     
  min_stock_level?: number | null; 
  image_url?: string | null;
  remark?: string | null;
  pinyin?: string | null; 
  is_archived?: boolean; 
  bound_store_id?: string | null; 
};

export type Batch = {
  id: string;
  product_id: string;
  store_id: string;
  batch_number?: string | null;
  quantity: number; // Smallest unit
  expiry_date?: string | null;     
  created_at: string;
  is_archived?: boolean; 
  store_name?: string;
  
  image_url?: string | null;
  remark?: string | null; 
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

export type RoleLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface UserPermissions {
    role_level: RoleLevel;
    logs_level: 'A' | 'B' | 'C' | 'D';
    announcement_rule: 'PUBLISH' | 'VIEW';
    store_scope: 'GLOBAL' | 'LIMITED';
    
    // UI Visibility Toggles
    show_excel: boolean;
    view_peers: boolean;
    view_self_in_list: boolean;
    
    hide_perm_page: boolean;
    hide_audit_hall: boolean;
    hide_store_management: boolean;
    hide_new_store_btn: boolean;
    hide_excel_export_btn: boolean;
    hide_store_edit_btn: boolean;

    only_view_config: boolean;
}

export type User = {
  id: string;
  username: string;
  password?: string; 
  role_level: RoleLevel; 
  
  permissions: UserPermissions;
  
  allowed_store_ids: string[]; 
  is_archived?: boolean; 
  face_descriptor?: number[]; // Float32Array as array
  
  // Device History
  device_history?: {
      device_name: string;
      last_login: string;
      ip?: string;
  }[];
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
  is_force_deleted?: boolean; 
  read_by?: string[]; // "HIDDEN_BY_ID" or "READ_BY_ID"
  created_at: string;
};

export interface AggregatedStock {
  product: Product;
  totalQuantity: number;
  batches: Batch[];
  expiringSoon: number; 
}