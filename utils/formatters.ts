
import { Product, Transaction, OperationLog } from '../types';

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

export const formatLogContent = (log: OperationLog, productMap: Map<string, Product>) => {
    // Find product details
    const product = productMap.get(log.target_id) || log.snapshot_data?.product; // Fallback for deleted
    const name = product?.name || log.snapshot_data?.product_name || '未知商品';
    const unit = log.snapshot_data?.unit || '单位';
    const absQty = Math.abs(log.change_delta);

    if (log.action_type === 'IN') {
        return `入库：${name} × ${absQty} ${unit}`;
    }
    if (log.action_type === 'OUT') {
        return `出库：${name} × ${absQty} ${unit}`;
    }
    if (log.action_type === 'DELETE') {
        const batchNo = log.snapshot_data?.deleted_batch?.batch_number || '';
        return `删除了商品：${name} (批号: ${batchNo})`;
    }
    if (log.action_type === 'ADJUST') {
        const changes = [];
        const old = log.snapshot_data?.old;
        const updates = log.snapshot_data?.new;
        if(old && updates) {
            if(updates.quantity !== undefined && updates.quantity !== old.quantity) 
                changes.push(`库存从 ${old.quantity} 变为 ${updates.quantity}`);
            if(updates.batch_number && updates.batch_number !== old.batch_number)
                changes.push(`批号改为 ${updates.batch_number}`);
            // Add translation logic for other fields
        }
        return `调整：${name} - ${changes.join(', ') || '属性修改'}`;
    }
    return '未知操作';
};

export const getLogColor = (type: string) => {
    switch(type) {
        case 'IN': return 'bg-green-100 text-green-800';
        case 'OUT': return 'bg-red-100 text-red-800';
        case 'DELETE': return 'bg-gray-800 text-white';
        case 'ADJUST': return 'bg-blue-100 text-blue-800';
        default: return 'bg-gray-100 text-gray-800';
    }
};

export const generatePageSummary = (type: string, data: any[]) => {
    if (type === 'inventory') {
        return data.map((item: any) => {
            const lines = [`商品: ${item.product.name} (${item.product.sku || '无SKU'})`];
            lines.push(`总库存: ${formatUnit(item.totalQuantity, item.product)}`);
            if (item.batches && Array.isArray(item.batches)) {
                item.batches.forEach((b: any) => {
                   lines.push(` - 批号: ${b.batch_number}, 数量: ${b.quantity}, 效期: ${b.expiry_date ? new Date(b.expiry_date).toLocaleDateString() : '无'}`);
                });
            }
            return lines.join('\n');
        }).join('\n\n');
    }
    return JSON.stringify(data, null, 2);
};
