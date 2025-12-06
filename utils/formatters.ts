import { Product } from '../types';

export const DEFAULT_IMPORT_RATIO = 10;

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
  // Fallback to Big Unit if split info missing
  if (!product.split_ratio || !product.split_unit_name) {
    return `${quantity} ${product.unit_name || '个'}`;
  }

  const ratio = product.split_ratio;
  const major = Math.floor(quantity / ratio);
  const minor = quantity % ratio;

  if (major === 0 && minor === 0) return "0";

  let result = [];
  if (major > 0) result.push(`${major}${product.unit_name}`);
  if (minor > 0) result.push(`${minor}${product.split_unit_name}`);
  
  return result.join(' ');
};

export const matchSearch = (text: string | null | undefined, query: string): boolean => {
    if (!text) return false;
    const cleanText = text.toLowerCase();
    const cleanQuery = query.toLowerCase();
    return cleanText.includes(cleanQuery); 
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
                    return `   • 批号: ${b.batch_number} | 数量: ${b.quantity} | 有效期: ${expiry}`;
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
            
            // Format JSON data nicely
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