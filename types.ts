
export type Store = {
  id: string;
  name: string;
  location?: string;
  image_url?: string; 
  parent_id?: string | null; 
  managers?: string[]; // User IDs
  viewers?: string[]; // User IDs
  is_archived?: boolean; 
  children?: Store[]; // Virtual
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

export type OperationType = 'IN' | 'OUT' | 'ADJUST' | 'DELETE' | 'IMPORT' | 'RESTORE';

// New Atomic Log Table
export type OperationLog = {
    id: string;
    action_type: OperationType;
    target_id: string; // Batch ID or Product ID
    change_delta: number;
    snapshot_data: any; // JSON Snapshot
    operator_id: string; // Username
    created_at: string;
    is_revoked: boolean;
};

// Legacy Transaction (Keep for charts if needed, but Log is primary now)
export type Transaction = OperationLog; 

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
  face_descriptor?: string; 
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
  allow_delete: boolean;
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
