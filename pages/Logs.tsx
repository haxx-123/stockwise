
import React, { useState, useEffect } from 'react';
import { dataService } from '../services/dataService';
import { Transaction } from '../types';
import { Icons } from '../components/Icons';

export const Logs: React.FC = () => {
    const [logs, setLogs] = useState<Transaction[]>([]);
    const [filter, setFilter] = useState('ALL');
    const [startDate, setStartDate] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [operatorFilter, setOperatorFilter] = useState('');
    
    // Pagination
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 15;
    const [inputPage, setInputPage] = useState(1); // Local state for input

    useEffect(() => {
        loadLogs();
        setPage(1);
        setInputPage(1);
    }, [filter, startDate]);

    useEffect(() => {
        setInputPage(page);
    }, [page]);

    const loadLogs = async () => {
        try {
            const date = startDate ? new Date(startDate).toISOString() : undefined;
            const data = await dataService.getTransactions(filter, 200, date);
            setLogs(data);
        } catch(e) { console.error(e); }
    };

    const handleUndo = async (id: string) => {
        if(!window.confirm("确定要撤销此操作吗？此操作将从日志中永久移除，且不可恢复。")) return;
        try {
            await dataService.undoTransaction(id);
            setLogs(prev => prev.filter(l => l.id !== id));
        } catch(e: any) { alert(e.message || "撤销失败"); }
    };

    // Filter Logic
    const filteredLogs = logs.filter(log => {
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const prodName = log.product?.name?.toLowerCase() || '';
            const note = log.note?.toLowerCase() || '';
            if (!prodName.includes(q) && !note.includes(q)) return false;
        }
        if (operatorFilter) {
            if (!log.operator?.toLowerCase().includes(operatorFilter.toLowerCase())) return false;
        }
        return true;
    });

    const totalPages = Math.ceil(filteredLogs.length / PAGE_SIZE);
    const paginatedLogs = filteredLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const handlePageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputPage(Number(e.target.value));
    };

    const commitPageInput = () => {
        let p = inputPage;
        if (isNaN(p)) p = 1;
        if (p < 1) p = 1;
        if (totalPages > 0 && p > totalPages) p = totalPages;
        setPage(p);
        setInputPage(p);
    };

    const renderLogType = (type: string) => {
        switch(type) {
            case 'IN': return <span className="px-2 py-1 rounded text-xs font-bold bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">入库</span>;
            case 'OUT': return <span className="px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">出库</span>;
            case 'DELETE': return <span className="px-2 py-1 rounded text-xs font-bold bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300">删除</span>;
            case 'ADJUST': return <span className="px-2 py-1 rounded text-xs font-bold bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300">调整</span>;
            case 'IMPORT': return <span className="px-2 py-1 rounded text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">导入</span>;
            default: return <span className="px-2 py-1 rounded text-xs font-bold bg-gray-100 text-gray-600">{type}</span>;
        }
    };

    const renderDetails = (log: Transaction) => {
        // CASE C: DELETE
        if (log.type === 'DELETE') {
            const batchCount = log.snapshot_data?.deleted_batch ? 1 : 'X'; // Simplification
            return (
                <div>
                    <div className="text-sm font-medium text-red-600 dark:text-red-400">删除了 {log.product?.name || '未知商品'}</div>
                    <div className="text-xs text-gray-500">含 {batchCount} 个批次</div>
                </div>
            );
        }
        // CASE B: ADJUST
        if (log.type === 'ADJUST') {
            const updates = log.snapshot_data?.updates || {};
            const keys = Object.keys(updates);
            const changes = keys.map(k => {
                const val = updates[k];
                if (k === 'batch_number') return `批号->${val}`;
                if (k === 'expiry_date') return `有效期->${val ? val.split('T')[0] : '空'}`;
                return `${k}变更`;
            }).join(', ');

            return (
                <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{log.product?.name || '未知商品'}</div>
                    <div className="text-xs text-orange-600 dark:text-orange-400">修改: {changes || log.note}</div>
                </div>
            );
        }
        // CASE A: NORMAL
        return (
            <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">{log.product?.name || '未知商品'}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{log.note || '-'}</div>
            </div>
        );
    };

    const renderQty = (log: Transaction) => {
        if (log.type === 'ADJUST' && log.quantity === 0) return <span className="text-gray-400">-</span>;
        if (log.type === 'DELETE') return <span className="text-gray-400">-</span>; // Usually qty is 0 or irrelevant for delete log row itself
        const sign = (log.type === 'OUT') ? '-' : '+';
        return <span>{sign}{Math.abs(log.quantity)}</span>;
    };

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">操作日志</h1>

            <div className="flex flex-col md:flex-row flex-wrap items-center gap-4 mb-6 bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm transition-colors">
                <div className="flex gap-2 w-full md:w-auto">
                    <div className="relative flex-1">
                        <input 
                            placeholder="搜索商品/备注..." 
                            className="w-full pl-8 pr-2 py-1 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            value={searchQuery}
                            onChange={e => {setSearchQuery(e.target.value); setPage(1);}}
                        />
                        <Icons.Sparkles size={14} className="absolute left-2 top-2 text-gray-400"/>
                    </div>
                    <input 
                        placeholder="操作人..." 
                        className="w-24 px-2 py-1 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        value={operatorFilter}
                        onChange={e => {setOperatorFilter(e.target.value); setPage(1);}}
                    />
                </div>

                <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2 hidden md:block"></div>

                <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0 w-full md:w-auto custom-scrollbar">
                    {['ALL', 'IN', 'OUT', 'ADJUST', 'DELETE', 'IMPORT'].map(f => (
                        <button 
                            key={f}
                            onClick={() => {setFilter(f); setPage(1);}} 
                            className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${filter === f ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                        >
                            {f === 'ALL' ? '全部' : f === 'IN' ? '入库' : f === 'OUT' ? '出库' : f === 'ADJUST' ? '调整' : f === 'DELETE' ? '删除' : '导入'}
                        </button>
                    ))}
                </div>
                
                <input 
                    type="date" 
                    value={startDate} 
                    onChange={e => setStartDate(e.target.value)} 
                    className="border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white ml-auto"
                />
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto shadow-sm transition-colors min-h-[400px]">
                <table className="w-full text-left min-w-[700px]">
                    <thead className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-500 dark:text-gray-400 uppercase">
                        <tr>
                            <th className="px-6 py-3">时间</th>
                            <th className="px-6 py-3">操作人</th>
                            <th className="px-6 py-3">类型</th>
                            <th className="px-6 py-3">商品 / 备注</th>
                            <th className="px-6 py-3 text-right">数量</th>
                            <th className="px-6 py-3 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {paginatedLogs.map(log => (
                            <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                    {new Date(log.timestamp).toLocaleString()}
                                </td>
                                <td className="px-6 py-4 text-sm font-bold text-gray-700 dark:text-gray-300">
                                    {log.operator || 'System'}
                                </td>
                                <td className="px-6 py-4">
                                    {renderLogType(log.type)}
                                </td>
                                <td className="px-6 py-4">
                                    {renderDetails(log)}
                                </td>
                                <td className="px-6 py-4 text-right font-mono dark:text-gray-300">
                                    {renderQty(log)}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button onClick={() => handleUndo(log.id)} className="text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400 underline">
                                        撤销
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {paginatedLogs.length === 0 && (
                            <tr><td colSpan={6} className="p-8 text-center text-gray-400">暂无日志</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

             {/* Custom Pagination: Input + Total */}
             <div className="flex flex-wrap justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mt-6 gap-4">
                <button disabled={page<=1} onClick={()=>setPage(p=>Math.max(1, p-1))} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded disabled:opacity-50 dark:text-white transition-colors hover:bg-gray-200 dark:hover:bg-gray-600">
                    上一页
                </button>
                <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700">
                    <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">当前</span>
                    <input 
                        type="number" min="1" max={totalPages} 
                        className="w-16 text-center bg-white dark:bg-gray-800 border dark:border-gray-600 rounded text-sm dark:text-white font-bold p-1 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={inputPage} 
                        onChange={handlePageInput}
                        onBlur={commitPageInput}
                        onKeyDown={e => e.key === 'Enter' && commitPageInput()}
                    />
                    <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">/ 共 {totalPages} 页</span>
                </div>
                <button disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages, p+1))} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded disabled:opacity-50 dark:text-white transition-colors hover:bg-gray-200 dark:hover:bg-gray-600">
                    下一页
                </button>
            </div>
        </div>
    )
};
