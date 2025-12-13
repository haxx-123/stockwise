
import { Product, RoleLevel } from '../types';

export const DEFAULT_IMPORT_RATIO = 10;
export const DEFAULT_SPLIT_UNIT = '散';
export const DEFAULT_UNIT = '整';

export const ph = (value: any) => {
  if (value === null || value === undefined || value === '') return '/';
  return value;
};

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

// "Integer Big Unit Scatter Small Unit"
export const formatUnit = (quantity: number, product: Product) => {
  if (quantity === undefined || quantity === null) return '/';
  
  const unitName = product.unit_name || DEFAULT_UNIT;
  const splitUnitName = product.split_unit_name || DEFAULT_SPLIT_UNIT;
  const ratio = product.split_ratio || 1;

  const major = Math.floor(quantity / ratio);
  const minor = quantity % ratio;

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

export const getUserColor = (roleLevel: RoleLevel | undefined): string => {
    // Prism Dark Theme Colors
    if (roleLevel === undefined) return 'text-white font-bold';
    const level = Number(roleLevel);
    
    if (level === 0) return 'text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 font-black drop-shadow-[0_0_5px_rgba(168,85,247,0.5)]'; 
    if (level === 1) return 'text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-amber-500 font-black drop-shadow-[0_0_5px_rgba(234,179,8,0.5)]'; 
    if (level === 2) return 'text-blue-400 font-bold';   
    
    return 'text-gray-200 font-medium'; 
};

export const getLogColor = (type: string): string => {
    switch (type) {
        case 'IN': return 'text-emerald-400 bg-emerald-900/30 border border-emerald-800';
        case 'OUT': return 'text-rose-400 bg-rose-900/30 border border-rose-800';
        case 'ADJUST': return 'text-blue-400 bg-blue-900/30 border border-blue-800';
        case 'IMPORT': return 'text-purple-400 bg-purple-900/30 border border-purple-800';
        case 'DELETE': return 'text-red-500 bg-red-900/50 border border-red-700 font-bold';
        case 'RESTORE': return 'text-amber-400 bg-amber-900/30 border border-amber-800';
        default: return 'text-gray-400 bg-gray-800 border border-gray-700';
    }
};

export const generatePageSummary = (pageName: string, data: any) => {
    let content = '';
    const now = new Date().toLocaleString();

    if (pageName === 'inventory') {
        content = (data as any[]).map((item, idx) => {
            const productInfo = `【${idx + 1}】${item.product.name} (SKU: ${item.product.sku||'-'})`;
            const stockInfo = `总库存: ${formatUnit(item.totalQuantity, item.product)}`;
            let batchInfo = '';
            if (item.batches?.length > 0) {
                batchInfo = item.batches.map((b: any) => {
                    const expiry = b.expiry_date ? b.expiry_date.split('T')[0] : '无有效期';
                    return `   • 批号: ${b.batch_number} | 数量: ${formatUnit(b.quantity, item.product)} | 效期: ${expiry}`;
                }).join('\n');
            } else { batchInfo = '   (无批次)'; }
            return `${productInfo}\n${stockInfo}\n${batchInfo}`;
        }).join('\n\n');
    } else if (pageName === 'logs') {
        content = (data as any[]).map((log, idx) => {
            const opName = { 'IN': '入库', 'OUT': '出库', 'DELETE': '删除', 'ADJUST': '调整', 'IMPORT': '导入' }[log.type] || log.type;
            const sign = (log.type === 'OUT' || log.type === 'DELETE') ? '-' : '+';
            return `${idx + 1}. [${opName}] ${log.product?.name || '商品'} (${sign}${log.quantity})\n   操作人: ${log.operator} | 时间: ${new Date(log.timestamp).toLocaleString()}\n   备注: ${log.note || ''}`;
        }).join('\n\n');
    }
    
    return `棱镜系统 - ${pageName === 'inventory' ? '库存清单' : '数据报表'}\n生成时间: ${now}\n\n${content}`;
};
