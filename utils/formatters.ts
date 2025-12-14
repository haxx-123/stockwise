
import { Product, OperationLog } from '../types';

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

// Field Translation Map
const FIELD_MAP: Record<string, string> = {
    quantity: '库存数量',
    batch_number: '批次号',
    expiry_date: '有效期',
    store_id: '所属门店',
    is_archived: '归档状态',
    remark: '备注',
    image_url: '图片',
    created_at: '创建时间'
};

const TYPE_MAP: Record<string, string> = {
    IN: '入库',
    OUT: '出库',
    ADJUST: '库存调整',
    DELETE: '删除',
    IMPORT: '导入',
    RESTORE: '恢复'
};

export const formatLogContent = (log: OperationLog) => {
    // 1. Extract Data
    const snapshot = log.snapshot_data || {};
    const typeLabel = TYPE_MAP[log.action_type] || log.action_type;
    
    // Fallback Product Name: Logic to find name even if product deleted
    // Prioritize snapshot name, then if we have a deleted_batch structure
    let productName = snapshot.product_name;
    let unit = snapshot.unit || '单位'; // Default unit
    
    if (!productName && snapshot.deleted_batch && snapshot.deleted_batch.product) {
        productName = snapshot.deleted_batch.product.name;
    }
    if (!productName) productName = '未知商品';

    const absQty = Math.abs(log.change_delta);

    // --- CASE 1: IN/OUT (Standard Format) ---
    // Req: "[Type]: [Product] x [Qty] [Unit]"
    if (log.action_type === 'IN' || log.action_type === 'OUT' || log.action_type === 'IMPORT') {
        const actionStr = log.action_type === 'IMPORT' ? '批量导入' : typeLabel;
        return `${actionStr}：${productName} × ${absQty} ${unit}`;
    }

    // --- CASE 2: DELETE ---
    // Req: Must show Name and Batch Number
    if (log.action_type === 'DELETE') {
        const b = snapshot.deleted_batch || {};
        const batchNo = b.batch_number || '无批号';
        return `删除：${productName} (批号: ${batchNo})`;
    }

    // --- CASE 3: ADJUST (Detailed diffs) ---
    if (log.action_type === 'ADJUST') {
        const changes: string[] = [];
        const oldObj = snapshot.old || {};
        const newObj = snapshot.new || {};

        // Iterate keys in newObj to find diffs
        Object.keys(newObj).forEach(key => {
            const oldVal = oldObj[key];
            const newVal = newObj[key];

            // Ignore if both are null/undefined or equal
            if (oldVal == newVal) return; // loose equality for string/number match
            if (!oldVal && !newVal) return;

            // Ignore technical fields
            if (['id', 'product_id', 'created_at', 'updated_at', 'store_id'].includes(key)) return;

            const fieldName = FIELD_MAP[key] || key;
            
            // Format specific values
            let displayOld = oldVal;
            let displayNew = newVal;

            if (key === 'expiry_date') {
                displayOld = oldVal ? new Date(oldVal).toLocaleDateString() : '无';
                displayNew = newVal ? new Date(newVal).toLocaleDateString() : '无';
            }

            changes.push(`将 ${fieldName} 从 "${displayOld || '空'}" 改为 "${displayNew || '空'}"`);
        });

        if (changes.length === 0) return `${typeLabel}：${productName} (无实质变更)`;
        return `${typeLabel}：${productName}，${changes.join('；')}`;
    }

    // Fallback
    return `${typeLabel}：${productName}`;
};

export const getLogColor = (type: string) => {
    switch(type) {
        case 'IN': 
        case 'IMPORT': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
        case 'OUT': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
        case 'DELETE': return 'bg-gray-800 text-white dark:bg-gray-700';
        case 'ADJUST': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
        case 'RESTORE': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
        default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
};

export const generatePageSummary = (page: string, data: any[]): string => {
    if (page === 'inventory') {
        return data.map((item: any) => {
            const p = item.product;
            const total = formatUnit(item.totalQuantity, p);
            let details = `商品: ${p.name}\nSKU: ${p.sku || 'N/A'}\n总库存: ${total}\n`;
            if (item.batches && item.batches.length > 0) {
                details += `批次详情:\n`;
                item.batches.forEach((b: any) => {
                    details += `- 批号: ${b.batch_number || '无'} | 数量: ${b.quantity} | 有效期: ${b.expiry_date ? new Date(b.expiry_date).toLocaleDateString() : '无'}\n`;
                });
            }
            return details;
        }).join('\n-----------------------------------\n');
    }
    return '';
};
