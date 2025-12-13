

import { Product, RoleLevel, Transaction } from '../types';

export const DEFAULT_IMPORT_RATIO = 10;
export const DEFAULT_SPLIT_UNIT = '散';

export const ph = (value: any) => {
  if (value === null || value === undefined || value === '') return '/';
  return value;
};

// --- DATA SANITIZATION ---
export const sanitizeStr = (val: any): string | null => {
    if (val === null || val === undefined) return null;
    const str = String(val).trim();
    return str === '' ? null : str;
};

export const sanitizeInt = (val: any): number | null => {
    if (val === null || val === undefined || val === '') return null;
    const num = Number(val);
    return isNaN(num) ? null : num;
};

// Format: "X大单位 Y小单位"
export const formatUnit = (quantity: number, product: Product) => {
  if (quantity === undefined || quantity === null) return '/';
  
  const unitName = product.unit_name || '整';
  const splitUnitName = product.split_unit_name || '散';
  const ratio = product.split_ratio || 1;
  
  const major = Math.floor(quantity / ratio);
  const minor = quantity % ratio;

  if (major === 0 && minor === 0) return "0";
  if (major === 0) return `${minor}${splitUnitName}`;
  if (minor === 0) return `${major}${unitName}`;
  return `${major}${unitName} ${minor}${splitUnitName}`;
};

export const getUnitSplit = (quantity: number, product: Product) => {
    const ratio = product.split_ratio || 1;
    const major = Math.floor(quantity / ratio);
    const minor = quantity % ratio;
    return { major, minor };
};

export const matchSearch = (text: string | null | undefined, query: string): boolean => {
    if (!text) return false;
    const cleanText = text.toLowerCase();
    const cleanQuery = query.toLowerCase();
    return cleanText.includes(cleanQuery); 
};

// --- LOGGING ---

export const getLogColor = (type: string): string => {
    switch (type) {
        case 'IN': return 'text-emerald-600 bg-emerald-50';
        case 'OUT': return 'text-rose-600 bg-rose-50';
        case 'ADJUST': return 'text-blue-500 bg-blue-50';
        case 'IMPORT': return 'text-purple-600 bg-purple-50';
        case 'DELETE': return 'text-red-900 bg-red-100 font-bold';
        case 'RESTORE': return 'text-amber-600 bg-amber-50';
        default: return 'text-gray-600 bg-gray-50';
    }
};

const LOG_DICT: Record<string, string> = {
    'name': '商品名称', 'sku': 'SKU', 'category': '类别',
    'unit_name': '大单位名称', 'split_unit_name': '小单位名称', 'split_ratio': '拆零比例',
    'min_stock_level': '最低库存', 'image_url': '图片地址', 'remark': '备注',
    'batch_number': '批次号', 'expiry_date': '有效期', 'quantity': '库存数量',
    'location': '位置', 'managers': '管理者', 'is_archived': '归档状态'
};

export const formatLogContent = (log: Transaction) => {
    // 1. In/Out/Import: "[Type]: [Product] x [Qty][Unit]"
    if (['IN', 'OUT', 'IMPORT'].includes(log.type)) {
        const prodName = log.product?.name || log.snapshot_data?.name || '未知商品';
        const opName = log.type === 'IN' || log.type === 'IMPORT' ? '入库' : '出库';
        return `${opName}：${prodName} × ${Math.abs(log.quantity)} (基础单位)`;
    }

    // 2. Adjust: "Subject Verb Object"
    if (log.type === 'ADJUST' && log.snapshot_data?.old) {
        const updates = log.snapshot_data.updates || log.snapshot_data.new || {};
        const old = log.snapshot_data.old;
        
        const changes = Object.keys(updates).map(k => {
            if (k === 'id' || k === 'created_at') return null;
            const oldVal = old[k];
            const newVal = updates[k];
            if (oldVal == newVal) return null; // Loose equality for null/undefined
            if (!oldVal && !newVal) return null;

            const fieldName = LOG_DICT[k] || k;
            
            // Humanize Dates
            const formatVal = (v: any) => {
                if (!v) return '空';
                if (k.includes('date')) return v.split('T')[0];
                return v;
            };

            return `将 ${fieldName} 从 "${formatVal(oldVal)}" 改为 "${formatVal(newVal)}"`;
        }).filter(Boolean);

        if (changes.length === 0) return log.note || "进行了一次调整";
        return changes.join('，');
    }

    // 3. Delete: Must show Name and Batch
    if (log.type === 'DELETE') {
         const name = log.snapshot_data?.deleted_batch?.product?.name || log.snapshot_data?.name || log.product?.name || '未知商品';
         const batchNo = log.snapshot_data?.deleted_batch?.batch_number || log.batch_id || '';
         const batchStr = batchNo ? `(批号: ${batchNo})` : '';
         return `删除了商品：${name} ${batchStr}`;
    }

    return log.note || '无详情';
};

// --- EXPORT FORMATTER ---
export const generatePageSummary = (pageName: string, data: any) => {
    // Simplified for "Copy" feature text
    if (pageName === 'inventory') {
        return data.map((item: any) => {
            const header = `${item.product.name} (库存: ${formatUnit(item.totalQuantity, item.product)})`;
            const batches = item.batches.map((b: any) => 
                `   - 批号:${b.batch_number}, 数量:${b.quantity}, 有效期:${b.expiry_date?.split('T')[0]||'/'}, 备注:${b.remark||'-'}`
            ).join('\n');
            return `${header}\n${batches}`;
        }).join('\n\n');
    }
    return JSON.stringify(data, null, 2);
};