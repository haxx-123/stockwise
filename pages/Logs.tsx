
import React, { useState, useEffect, useMemo } from 'react';
import { dataService } from '../services/dataService';
import { OperationLog, LogFilter, Product, User } from '../types';
import { formatLogContent, getLogColor } from '../utils/formatters';
import { matchProduct, getUniqueCategories } from '../utils/searchHelper';
import { SmartSearch } from '../components/SmartSearch';
import { Icons } from '../components/Icons';
import { UsernameBadge } from '../components/UsernameBadge';
import { createPortal } from 'react-dom';

declare const window: any;

export const Logs: React.FC = () => {
    const [logs, setLogs] = useState<OperationLog[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Pagination State
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [total, setTotal] = useState(0);

    // DB Filters (Server Side)
    const [filterType, setFilterType] = useState('ALL');
    const [operatorSearch, setOperatorSearch] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Local Filters (Smart Search)
    const [productQuery, setProductQuery] = useState('');
    const [productCategory, setProductCategory] = useState('ALL');
    const [allProducts, setAllProducts] = useState<Product[]>([]);
    
    // User Cache for Badges
    const [userMap, setUserMap] = useState<Map<string, number>>(new Map());

    // Mobile Detail Modal
    const [selectedLog, setSelectedLog] = useState<OperationLog | null>(null);

    // Reset page when filters change
    useEffect(() => {
        setPage(1);
    }, [filterType, operatorSearch, startDate, endDate]);

    useEffect(() => {
        loadData();
    }, [page, filterType, operatorSearch, startDate, endDate]);

    const loadData = async () => {
        setLoading(true);
        try {
            const filter: LogFilter = {
                type: filterType,
                operator: operatorSearch,
                startDate,
                endDate
            };
            const [logRes, p, u] = await Promise.all([
                dataService.getOperationLogs(filter, page, pageSize),
                dataService.getProducts(true), // Include archived for logs
                dataService.getUsers() // Fetch users to map roles
            ]);
            
            setLogs(logRes.data);
            setTotal(logRes.total);
            setAllProducts(p);
            
            // Create a simple map: username -> role_level
            const map = new Map<string, number>();
            u.forEach(user => map.set(user.username, user.role_level));
            setUserMap(map);

        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const categories = useMemo(() => getUniqueCategories(allProducts), [allProducts]);

    const handleUndo = async (log: OperationLog) => {
        let msg = "确定撤销此操作吗？";
        if (log.action_type === 'IN') msg = "【撤销入库】将扣减现有库存。如果库存不足将失败。\n确定继续吗？";
        if (log.action_type === 'OUT') msg = "【撤销出库】将商品退回库存。\n确定继续吗？";
        if (log.action_type === 'DELETE') msg = "【撤销删除】将尝试恢复商品及批次数据。\n确定继续吗？";
        
        if(!window.confirm(msg)) return;

        try {
            await dataService.undoOperation(log.id);
            alert("撤销成功");
            loadData(); // Refresh list to remove revoked item
            setSelectedLog(null); // Close modal if open
        } catch(e: any) {
            alert("撤销失败: " + e.message);
        }
    };

    // Smart Filtering for Logs
    const filteredLogs = useMemo(() => {
        if (!productQuery && productCategory === 'ALL') return logs;

        return logs.filter(log => {
            const snapshot = log.snapshot_data || {};
            let pName = snapshot.product_name || '';
            if (!pName && snapshot.deleted_batch?.product?.name) pName = snapshot.deleted_batch.product.name;
            
            const productRef = allProducts.find(p => p.name === pName);
            
            if (productCategory !== 'ALL') {
                if (!productRef || productRef.category !== productCategory) return false;
            }

            if (productQuery) {
                if (productRef) {
                    if (!matchProduct(productRef, productQuery)) return false;
                } else {
                    if (!pName.toLowerCase().includes(productQuery.toLowerCase())) return false;
                }
            }

            return true;
        });
    }, [logs, productQuery, productCategory, allProducts]);

    // --- Excel Export Listener ---
    useEffect(() => {
        const handleExcelExport = () => {
            if (!window.XLSX) return alert("Excel 模块未加载");
            
            const exportRows = filteredLogs.map(log => ({
                "时间": new Date(log.created_at).toLocaleString(),
                "操作人": log.operator_id,
                "类型": log.action_type,
                "变更数量": log.change_delta,
                "详情内容": formatLogContent(log)
            }));

            const ws = window.XLSX.utils.json_to_sheet(exportRows);
            const wb = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(wb, ws, "Logs");
            window.XLSX.writeFile(wb, `StockWise_Logs_${Date.now()}.xlsx`);
        };

        window.addEventListener('trigger-excel-export', handleExcelExport);
        return () => window.removeEventListener('trigger-excel-export', handleExcelExport);
    }, [filteredLogs]);

    // --- Plain Language Copy Listener ---
    useEffect(() => {
        const handleCopy = () => {
            if (filteredLogs.length === 0) return alert("当前没有可复制的日志");

            let text = "📝 【操作流水账】\n\n";
            
            filteredLogs.forEach((log) => {
                const time = new Date(log.created_at).toLocaleString();
                // Translate Action Type to Simple Chinese
                let action = "操作";
                if(log.action_type === 'IN') action = "入库";
                if(log.action_type === 'OUT') action = "出库";
                if(log.action_type === 'DELETE') action = "删除";
                if(log.action_type === 'ADJUST') action = "调整";

                const detail = formatLogContent(log); // Reuse our friendly formatter

                text += `【时间】: ${time}\n`;
                text += `【谁干的】: ${log.operator_id}\n`;
                text += `【干了啥】: ${action}\n`;
                text += `【详情】: ${detail}\n`;
                text += `-------------------\n`;
            });

            navigator.clipboard.writeText(text).then(() => {
                alert("已复制到剪贴板！\n格式：时间 + 操作人 + 动作 + 详情");
            });
        };

        window.addEventListener('trigger-copy', handleCopy);
        return () => window.removeEventListener('trigger-copy', handleCopy);
    }, [filteredLogs]);

    const totalPages = Math.ceil(total / pageSize);

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto animate-fade-in pb-24">
            <h1 className="text-3xl font-black mb-6 text-black flex items-center gap-3">
                <Icons.Sparkles className="text-purple-600" />
                操作日志 
                <span className="text-sm font-normal text-gray-500 bg-gray-100 px-3 py-1 rounded-full">支持原子撤销</span>
            </h1>
            
            {/* Server Filters Bar */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mb-4 flex flex-wrap gap-4 items-center animate-slide-up" style={{animationDelay: '50ms'}}>
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-500">类型:</span>
                    <select value={filterType} onChange={e=>setFilterType(e.target.value)} className="bg-gray-50 dark:bg-gray-700 border-none rounded-xl px-3 py-2 font-bold text-sm outline-none dark:text-white">
                        <option value="ALL">全部</option>
                        <option value="IN">入库</option>
                        <option value="OUT">出库</option>
                        <option value="ADJUST">调整</option>
                        <option value="DELETE">删除</option>
                        <option value="IMPORT">导入</option>
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-500">日期:</span>
                    <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="bg-gray-50 dark:bg-gray-700 border-none rounded-xl px-2 py-2 text-sm font-bold dark:text-white"/>
                    <span className="text-gray-300">-</span>
                    <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} className="bg-gray-50 dark:bg-gray-700 border-none rounded-xl px-2 py-2 text-sm font-bold dark:text-white"/>
                </div>
                <button onClick={loadData} className="ml-auto p-2 bg-black text-white rounded-xl hover:scale-105 transition-transform shadow-lg">
                    <Icons.ArrowRightLeft size={18} className="rotate-0"/>
                </button>
            </div>

            {/* Smart Product Search Bar */}
            <div className="mb-6 animate-slide-up" style={{animationDelay: '100ms'}}>
                <SmartSearch 
                    products={allProducts} 
                    categories={categories}
                    onSearch={setProductQuery}
                    onCategoryChange={setProductCategory}
                    placeholder="在日志中搜索商品 / 拼音..."
                />
            </div>

            {/* Logs List */}
            <div className="glass-panel rounded-3xl overflow-hidden shadow-lg border border-white/20 animate-slide-up" style={{animationDelay: '150ms'}}>
                {loading ? (
                    <div className="p-8 text-center text-gray-500">加载中...</div>
                ) : filteredLogs.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">无符合条件的记录</div>
                ) : (
                    <>
                        {/* Desktop Table View */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left text-sm text-black">
                                <thead className="bg-black/5 dark:bg-white/5 font-bold uppercase border-b border-black/5">
                                    <tr>
                                        <th className="p-5 w-48">时间 / 操作人</th>
                                        <th className="p-5 w-24">类型</th>
                                        <th className="p-5">内容详情</th>
                                        <th className="p-5 text-right w-32">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-black/5 dark:divide-white/5">
                                    {filteredLogs.map((log, idx) => (
                                        <tr key={log.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors group animate-slide-up opacity-0" style={{animationDelay: `${Math.min(idx * 30, 500)}ms`}}>
                                            <td className="p-5">
                                                <div className="font-bold dark:text-gray-200">{new Date(log.created_at).toLocaleDateString()}</div>
                                                <div className="text-xs opacity-50 font-mono dark:text-gray-400">{new Date(log.created_at).toLocaleTimeString()}</div>
                                                <div className="mt-1 flex items-center gap-1 text-xs font-bold opacity-70">
                                                    <Icons.User size={12}/> 
                                                    <UsernameBadge name={log.operator_id} roleLevel={userMap.get(log.operator_id) ?? 9} />
                                                </div>
                                            </td>
                                            <td className="p-5">
                                                <span className={`px-3 py-1.5 rounded-xl text-xs font-black tracking-wide ${getLogColor(log.action_type)}`}>
                                                    {log.action_type === 'IN' ? '入库' : 
                                                     log.action_type === 'OUT' ? '出库' : 
                                                     log.action_type === 'DELETE' ? '删除' : 
                                                     log.action_type === 'ADJUST' ? '调整' : log.action_type}
                                                </span>
                                            </td>
                                            <td className="p-5">
                                                <div className="font-medium text-base dark:text-gray-200 leading-relaxed line-clamp-2">
                                                    {formatLogContent(log)}
                                                </div>
                                            </td>
                                            <td className="p-5 text-right">
                                                {!log.is_revoked && (
                                                    <button 
                                                        onClick={()=>handleUndo(log)} 
                                                        className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all shadow-sm text-xs opacity-0 group-hover:opacity-100"
                                                    >
                                                        撤销
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Card View */}
                        <div className="md:hidden">
                            {filteredLogs.map((log, idx) => (
                                <div key={log.id} onClick={()=>setSelectedLog(log)} className="p-4 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer animate-slide-up opacity-0" style={{animationDelay: `${Math.min(idx * 30, 500)}ms`}}>
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <div className="font-bold text-sm text-gray-900 dark:text-white">{formatLogContent(log).split('：')[1]?.split(' ')[0] || '操作详情'}</div>
                                            <div className="text-xs text-gray-500 mt-1">{new Date(log.created_at).toLocaleString()}</div>
                                        </div>
                                        <span className={`px-2 py-1 rounded-lg text-xs font-bold ${getLogColor(log.action_type)}`}>
                                            {log.action_type}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center mt-3">
                                        <div className="flex items-center gap-1 text-xs">
                                            <Icons.User size={12} className="text-gray-400"/>
                                            <UsernameBadge name={log.operator_id} roleLevel={userMap.get(log.operator_id) ?? 9} />
                                        </div>
                                        <div className="text-xs text-blue-500 font-bold">查看详情 &gt;</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
                
                {/* Pagination Controls */}
                <div className="p-4 border-t border-black/5 dark:border-white/5 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50">
                    <div className="text-xs font-bold text-gray-500">
                        共 {total} 条记录，第 {page} / {totalPages || 1} 页
                    </div>
                    <div className="flex gap-2">
                        <button 
                            disabled={page === 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            className="px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-600"
                        >
                            上一页
                        </button>
                        <button 
                            disabled={page >= totalPages}
                            onClick={() => setPage(p => p + 1)}
                            className="px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-600"
                        >
                            下一页
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Log Detail Modal - Using Portal */}
            {selectedLog && createPortal(
                <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl relative animate-scale-in border border-white/20">
                        <button onClick={()=>setSelectedLog(null)} className="absolute top-4 right-4 p-2 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 transition-colors"><Icons.Minus size={20}/></button>
                        
                        <h3 className="text-xl font-black mb-1 dark:text-white">日志详情</h3>
                        <p className="text-xs text-gray-500 mb-6 font-mono">{selectedLog.id}</p>

                        <div className="space-y-4">
                            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl">
                                <div className="text-xs text-gray-500 mb-1">操作类型</div>
                                <span className={`px-3 py-1 rounded-lg text-sm font-bold inline-block ${getLogColor(selectedLog.action_type)}`}>
                                    {selectedLog.action_type}
                                </span>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl">
                                <div className="text-xs text-gray-500 mb-1">详情描述</div>
                                <div className="font-bold text-gray-800 dark:text-gray-200 text-lg leading-relaxed">
                                    {formatLogContent(selectedLog)}
                                </div>
                            </div>
                            <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl">
                                <div>
                                    <div className="text-xs text-gray-500 mb-1">操作人</div>
                                    <UsernameBadge name={selectedLog.operator_id} roleLevel={userMap.get(selectedLog.operator_id) ?? 9} />
                                </div>
                                <div className="text-right">
                                    <div className="text-xs text-gray-500 mb-1">时间</div>
                                    <div className="font-mono text-sm dark:text-gray-300">{new Date(selectedLog.created_at).toLocaleTimeString()}</div>
                                    <div className="text-xs text-gray-400">{new Date(selectedLog.created_at).toLocaleDateString()}</div>
                                </div>
                            </div>
                        </div>

                        {!selectedLog.is_revoked && (
                            <button 
                                onClick={()=>handleUndo(selectedLog)} 
                                className="w-full mt-6 py-3 bg-red-50 text-red-600 rounded-2xl font-bold border border-red-100 hover:bg-red-100 transition-colors shadow-sm"
                            >
                                撤销此操作
                            </button>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
