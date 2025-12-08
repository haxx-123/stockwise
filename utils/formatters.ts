


import { Product, RoleLevel } from '../types';

export const DEFAULT_IMPORT_RATIO = 10;
export const DEFAULT_SPLIT_UNIT = '条';

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
  
  const unitName = product.unit_name || '件';
  const splitUnitName = product.split_unit_name || DEFAULT_SPLIT_UNIT;
  
  // Fallback if split info missing, treat as Big Unit only
  if (!product.split_ratio) {
    return `${quantity}${unitName} 0${splitUnitName}`;
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
    
    // Strict Color Coding
    if (level === 0) return 'text-purple-600 font-extrabold shadow-sm'; // 00 亮紫色
    if (level === 1) return 'text-yellow-500 font-extrabold shadow-sm'; // 01 亮金色
    if (level === 2) return 'text-blue-600 font-extrabold shadow-sm';   // 02 亮蓝色
    
    // 03-05: Pale/Light distinct colors (No Red/Purple/Gold)
    if (level === 3) return 'text-green-400 font-medium'; 
    if (level === 4) return 'text-cyan-400 font-medium';
    if (level === 5) return 'text-indigo-300 font-medium';
    
    // 06+: Black
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

// Human Readable Page Summary (Optimized for non-tech users)
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

    } else if (pageName === 'audit') {
        content = (data as any[]).map((log, idx) => {
            const opMap: Record<string, string> = { 'INSERT': '新增', 'UPDATE': '修改', 'DELETE': '删除' };
            const opName = opMap[log.operation] || log.operation;
            
            const formatData = (obj: any) => {
                if(!obj) return '无';
                return Object.entries(obj).map(([k,v]) => `${k}: ${v}`).join(', ');
            };

            const details = log.operation === 'UPDATE' 
                ? `旧值: { ${formatData(log.old_data)} }\n   新值: { ${formatData(log.new_data)} }`
                : `数据: { ${formatData(log.new_data || log.old_data)} }`;

            return `${idx + 1}. [${opName}] 对象表: ${log.table_name}\n   ID: ${log.id} | 时间: ${new Date(log.timestamp).toLocaleString()}\n   ${details}`;
        }).join('\n\n');
    } else {
        content = "此页面不支持导出文字。";
    }

    return `StockWise 报表导出\n页面: ${pageName === 'inventory' ? '库存清单' : pageName === 'logs' ? '操作日志' : '审计大厅'}\n导出时间: ${now}\n\n${content}`;
};