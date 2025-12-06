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

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
                <Icons.AlertTriangle size={24} className="text-yellow-500" />
                审计大厅 (Read Only)
            </h1>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto shadow-sm transition-colors">
                <table className="w-full text-left text-xs font-mono min-w-[700px]">
                    <thead className="bg-gray-950 text-gray-300 uppercase">
                        <tr>
                            <th className="px-4 py-3">ID</th>
                            <th className="px-4 py-3">时间</th>
                            <th className="px-4 py-3">表名</th>
                            <th className="px-4 py-3">操作</th>
                            <th className="px-4 py-3">变更详情 (JSON)</th>
                            <th className="px-4 py-3">详情</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 dark:divide-gray-700">
                        {paginatedLogs.map(log => (
                            <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                <td className="px-4 py-2 text-gray-500">{log.id}</td>
                                <td className="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                    {new Date(log.timestamp).toLocaleString()}
                                </td>
                                <td className="px-4 py-2 font-bold text-blue-600 dark:text-blue-400">{log.table_name}</td>
                                <td className="px-4 py-2">
                                    <span className={`px-2 py-0.5 rounded ${
                                        log.operation === 'DELETE' ? 'bg-red-900 text-red-100' :
                                        log.operation === 'INSERT' ? 'bg-green-900 text-green-100' : 'bg-blue-900 text-blue-100'
                                    }`}>
                                        {log.operation}
                                    </span>
                                </td>
                                <td className="px-4 py-2 text-gray-500 truncate max-w-xs">
                                    {JSON.stringify(log.new_data || log.old_data)}
                                </td>
                                <td className="px-4 py-2">
                                    <button 
                                        onClick={() => setDetailLog(log)}
                                        className="text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded shadow-sm text-xs font-bold"
                                    >
                                        详情
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Custom Pagination: Input + Total */}
            <div className="flex flex-wrap justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mt-4 gap-4">
                <button disabled={page<=1} onClick={()=>setPage(p=>Math.max(1, p-1))} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded disabled:opacity-50 dark:text-white transition-colors hover:bg-gray-200 dark:hover:bg-gray-600">
                    上一页
                </button>
                <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700">
                    <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">当前</span>
                    <input 
                        type="number" min="1" max={totalPages} 
                        className="w-16 text-center bg-white dark:bg-gray-800 border dark:border-gray-600 rounded text-sm dark:text-white font-bold p-1 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={page} onChange={e => {
                            const val = Number(e.target.value);
                            if(val >= 1 && val <= totalPages) setPage(val);
                        }}
                    />
                    <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">/ 共 {totalPages} 页</span>
                </div>
                <button disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages, p+1))} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded disabled:opacity-50 dark:text-white transition-colors hover:bg-gray-200 dark:hover:bg-gray-600">
                    下一页
                </button>
            </div>

            {/* Detail Modal */}
            {detailLog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh] border dark:border-gray-700">
                        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800">
                            <h3 className="text-lg font-bold dark:text-white">审计详情 (ID: {detailLog.id})</h3>
                            <button onClick={() => setDetailLog(null)} className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white">
                                <Icons.Minus size={24} />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 font-mono text-sm dark:text-gray-300 space-y-4">
                            <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-lg border border-red-100 dark:border-red-900/30">
                                <span className="font-bold text-red-600 dark:text-red-400 block mb-2 border-b border-red-200 dark:border-red-900/50 pb-1">旧数据 (Old Data)</span>
                                <pre className="whitespace-pre-wrap break-all text-xs text-gray-700 dark:text-gray-300">
                                    {detailLog.old_data ? JSON.stringify(detailLog.old_data, null, 2) : 'N/A'}
                                </pre>
                            </div>
                            <div className="bg-green-50 dark:bg-green-900/10 p-4 rounded-lg border border-green-100 dark:border-green-900/30">
                                <span className="font-bold text-green-600 dark:text-green-400 block mb-2 border-b border-green-200 dark:border-green-900/50 pb-1">新数据 (New Data)</span>
                                <pre className="whitespace-pre-wrap break-all text-xs text-gray-700 dark:text-gray-300">
                                    {detailLog.new_data ? JSON.stringify(detailLog.new_data, null, 2) : 'N/A'}
                                </pre>
                            </div>
                        </div>
                        <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-right">
                            <button onClick={() => setDetailLog(null)} className="px-6 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded font-bold text-gray-700 dark:text-gray-200 text-sm">关闭</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};