
export type Store = {
  id: string;
  name: string;
  location?: string;
  is_archived?: boolean;
  parent_id?: string | null; // Parent Store ID
  managers?: string[]; // Array of User IDs
  viewers?: string[]; // Array of User IDs
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
  quantity: number; // Stored in smallest unit
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

// 0-9: Lower is higher power. 00 is Admin.
export type RoleLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface UserPermissions {
    role_level: RoleLevel;
    logs_level: 'A' | 'B' | 'C' | 'D'; // A:All+Undo, B:All+LowUndo, C:All+SelfUndo, D:SelfOnly
    announcement_rule: 'PUBLISH' | 'VIEW';
    store_scope: 'GLOBAL' | 'LIMITED';
    show_excel: boolean;
    view_peers: boolean; // Can see/create same level
    view_self_in_list: boolean;
    hide_perm_page: boolean;
    hide_audit_hall: boolean;
    hide_store_management: boolean; // Hide "Edit" store button
    hide_new_store_page: boolean; // New
    hide_excel_export: boolean; // New
    only_view_config: boolean;
}

export type User = {
  id: string;
  username: string;
  password?: string; 
  role_level: RoleLevel; 
  
  // Flat Permissions
  logs_level?: 'A' | 'B' | 'C' | 'D';
  announcement_rule?: 'PUBLISH' | 'VIEW';
  store_scope?: 'GLOBAL' | 'LIMITED';
  show_excel?: boolean;
  view_peers?: boolean;
  view_self_in_list?: boolean;
  hide_perm_page?: boolean;
  hide_audit_hall?: boolean;
  hide_store_management?: boolean;
  hide_new_store_page?: boolean;
  hide_excel_export?: boolean;
  only_view_config?: boolean;

  permissions: UserPermissions; 
  
  allowed_store_ids: string[]; 
  is_archived?: boolean; 
  face_descriptor?: string | null; 
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
  allow_delete: boolean; // "Allow Hide"
  is_force_deleted?: boolean; 
  read_by?: string[]; 
  created_at: string;
};

export interface AggregatedStock {
  product: Product;
  totalQuantity: number;
  batches: Batch[];
  expiringSoon: number; 
}
