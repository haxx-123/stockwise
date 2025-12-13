

import { Product, RoleLevel } from '../types';

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

export const formatUnit = (quantity: number, product: Product) => {
  if (quantity === undefined || quantity === null) return '/';
  
  const unitName = product.unit_name || '整';
  const splitUnitName = product.split_unit_name || DEFAULT_SPLIT_UNIT;
  
  // Fallback if split info missing
  if (!product.split_ratio) {
    return `${quantity}${unitName}`;
  }

  const ratio = product.split_ratio;
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

// --- COLORS ---
export const getUserColor = (roleLevel: RoleLevel | undefined): string => {
    if (roleLevel === undefined) return 'text-black font-bold';
    const level = Number(roleLevel);
    
    // Strict Color Coding Rules
    if (level === 0) return 'text-purple-600 font-extrabold drop-shadow-[0_1px_1px_rgba(147,51,234,0.5)]'; 
    if (level === 1) return 'text-yellow-500 font-extrabold drop-shadow-[0_1px_1px_rgba(234,179,8,0.5)]'; 
    if (level === 2) return 'text-blue-600 font-extrabold drop-shadow-[0_1px_1px_rgba(37,99,235,0.5)]';   
    
    if (level === 3) return 'text-emerald-400 font-medium opacity-80';  
    if (level === 4) return 'text-cyan-400 font-medium opacity-80';     
    if (level === 5) return 'text-slate-400 font-medium opacity-80';    
    
    return 'text-black font-bold'; 
};

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

// Translation for logs
export const translateLogKey = (key: string): string => {
    const map: Record<string, string> = {
        'name': '名称', 'sku': 'SKU', 'category': '类别',
        'unit_name': '大单位', 'split_unit_name': '小单位', 'split_ratio': '拆零比例',
        'min_stock_level': '最低库存', 'image_url': '图片', 'remark': '备注',
        'batch_number': '批号', 'expiry_date': '有效期', 'quantity': '数量'
    };
    return map[key] || key;
};

// Human Readable Page Summary
export const generatePageSummary = (pageName: string, data: any) => {
    let content = '';
    const now = new Date().toLocaleString();

    if (pageName === 'inventory') {
        content = (data as any[]).map((item, idx) => {
            const productInfo = `【${idx + 1}】${item.product.name}`;
            const stockInfo = `总库存: ${formatUnit(item.totalQuantity, item.product)}`;
            let batchInfo = '';
            if (item.batches && item.batches.length > 0) {
                batchInfo = item.batches.map((b: any) => {
                    const expiry = b.expiry_date ? b.expiry_date.split('T')[0] : '无有效期';
                    return `   • 批号: ${b.batch_number} | 门店: ${b.store_name||'-'} | 数量: ${formatUnit(b.quantity, item.product)} | 有效期: ${expiry}`;
                }).join('\n');
            } else {
                batchInfo = '   (无批次信息)';
            }
            return `${productInfo}\n${stockInfo}\n${batchInfo}`;
        }).join('\n\n------------------------\n\n');

    } else if (pageName === 'logs') {
        content = (data as any[]).map((log, idx) => {
            const typeMap: Record<string, string> = { 'IN': '入库', 'OUT': '出库', 'DELETE': '删除', 'ADJUST': '调整', 'IMPORT': '导入' };
            const opName = typeMap[log.type] || log.type;
            const qtySign = (log.type === 'OUT' || log.type === 'DELETE') ? '-' : '+';
            const prodName = log.product?.name || '未知商品';
            
            return `${idx + 1}. [${opName}] ${prodName}\n   变动: ${qtySign}${log.quantity}\n   操作人: ${log.operator || '系统'}\n   时间: ${new Date(log.timestamp).toLocaleString()}\n   备注: ${log.note || '无'}`;
        }).join('\n\n');
    }
    
    return `StockWise 报表\n页面: ${pageName}\n导出时间: ${now}\n\n${content}`;
};