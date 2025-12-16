import React, { useState, useEffect } from 'react';
import { dataService } from '../services/dataService';
import { AuditLog } from '../types';
import { Icons } from '../components/Icons';

export const Audit: React.FC = () => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [page, setPage] = useState(1);
    const [detailLog, setDetailLog] = useState<AuditLog | null>(null);
    const PAGE_SIZE = 15;

    useEffect(() => {
        loadLogs();
    }, []);

    const loadLogs = async () => {
        try {
            const data = await dataService.getAuditLogs(100); 
            setLogs(data);
        } catch(e) { console.error(e); }
    };

    const totalPages = Math.ceil(logs.length / PAGE_SIZE);
    useEffect(() => { if (page > totalPages && totalPages > 0) setPage(totalPages); }, [totalPages]);
    
    const paginatedLogs = logs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    // Helper to compute Diff
    const getDiff = (oldData: any, newData: any) => {
        const allKeys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);
        const diffs: any[] = [];
        allKeys.forEach(key => {
            const oldVal = oldData?.[key];
            const newVal = newData?.[key];
            if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
                diffs.push({ key, old: oldVal, new: newVal });
            }
        });
        return diffs;
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
                <Icons.AlertTriangle size={24} className="text-yellow-500" />
                审计大厅 (Time Machine)
            </h1>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto shadow-sm transition-colors">
                <table className="w-full text-left text-xs font-mono min-w-[700px]">
                    <thead className="bg-gray-950 text-gray-300 uppercase">
                        <tr>
                            <th className="px-4 py-3">时间</th>
                            <th className="px-4 py-3">对象 (Table:ID)</th>
                            <th className="px-4 py-3">动作</th>
                            <th className="px-4 py-3">变更摘要</th>
                            <th className="px-4 py-3">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 dark:divide-gray-700">
                        {paginatedLogs.map(log => {
                            const diffCount = log.operation === 'UPDATE' ? getDiff(log.old_data, log.new_data).length : '-';
                            return (
                                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                        {new Date(log.timestamp).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-2">
                                        <div className="font-bold text-blue-600 dark:text-blue-400">{log.table_name}</div>
                                        <div className="text-[10px] text-gray-400 font-mono truncate w-24">{log.record_id}</div>
                                    </td>
                                    <td className="px-4 py-2">
                                        <span className={`px-2 py-0.5 rounded font-bold ${
                                            log.operation === 'DELETE' ? 'bg-red-900 text-red-100' :
                                            log.operation === 'INSERT' ? 'bg-green-900 text-green-100' : 
                                            'bg-blue-900 text-blue-100'
                                        }`}>
                                            {log.operation}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 text-gray-500">
                                        {log.operation === 'UPDATE' ? `${diffCount} 字段变更` : (log.operation === 'INSERT' ? '新纪录' : '已删除')}
                                    </td>
                                    <td className="px-4 py-2">
                                        <button 
                                            onClick={() => setDetailLog(log)}
                                            className="text-white bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded shadow-sm text-xs"
                                        >
                                            透视
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-wrap justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mt-4 gap-4">
                <button disabled={page<=1} onClick={()=>setPage(p=>Math.max(1, p-1))} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded disabled:opacity-50 dark:text-white transition-colors hover:bg-gray-200 dark:hover:bg-gray-600">
                    上一页
                </button>
                <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">当前 {page} / {totalPages} 页</span>
                <button disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages, p+1))} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded disabled:opacity-50 dark:text-white transition-colors hover:bg-gray-200 dark:hover:bg-gray-600">
                    下一页
                </button>
            </div>

            {/* Detail Modal (Diff View) */}
            {detailLog && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border dark:border-gray-700">
                        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800">
                            <div>
                                <h3 className="text-lg font-bold dark:text-white">审计详情</h3>
                                <p className="text-xs text-gray-500 font-mono">{detailLog.table_name} :: {detailLog.record_id}</p>
                            </div>
                            <button onClick={() => setDetailLog(null)} className="p-2 bg-gray-200 dark:bg-gray-700 rounded-full hover:bg-gray-300">
                                <Icons.Minus size={20} />
                            </button>
                        </div>
                        
                        <div className="p-0 overflow-y-auto flex-1 bg-gray-50 dark:bg-gray-950">
                            {detailLog.operation === 'UPDATE' ? (
                                <table className="w-full text-sm border-collapse">
                                    <thead className="bg-gray-100 dark:bg-gray-900 text-left text-gray-500 border-b dark:border-gray-800 sticky top-0">
                                        <tr>
                                            <th className="p-3 w-1/3">字段</th>
                                            <th className="p-3 w-1/3">旧值 (Pre)</th>
                                            <th className="p-3 w-1/3">新值 (Post)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                        {getDiff(detailLog.old_data, detailLog.new_data).map((diff, i) => (
                                            <tr key={i} className="hover:bg-yellow-50 dark:hover:bg-yellow-900/10">
                                                <td className="p-3 font-mono text-gray-600 dark:text-gray-300 font-bold">{diff.key}</td>
                                                <td className="p-3 text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-900/10 break-all">{String(diff.old)}</td>
                                                <td className="p-3 text-green-600 dark:text-green-400 bg-green-50/50 dark:bg-green-900/10 break-all">{String(diff.new)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="p-6">
                                    <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-xs overflow-auto max-h-96">
                                        {JSON.stringify(detailLog.new_data || detailLog.old_data, null, 2)}
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <div className="p-4 border-t dark:border-gray-700 bg-white dark:bg-gray-900 flex justify-end">
                            <button onClick={() => setDetailLog(null)} className="px-6 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 rounded font-bold text-gray-700 dark:text-white border dark:border-gray-600">
                                关闭
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};