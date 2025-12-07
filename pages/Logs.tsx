
import React, { useState, useEffect } from 'react';
import { dataService } from '../services/dataService';
import { Transaction } from '../types';
import { Icons } from '../components/Icons';
import { authService } from '../services/authService';

export const Logs: React.FC = () => {
    const [logs, setLogs] = useState<Transaction[]>([]);
    const [filter, setFilter] = useState('ALL');
    const [startDate, setStartDate] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [operatorFilter, setOperatorFilter] = useState('');
    
    // Pagination
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 15;
    const [detailLog, setDetailLog] = useState<Transaction | null>(null);

    useEffect(() => { loadLogs(); setPage(1); }, [filter, startDate]);

    const loadLogs = async () => {
        try {
            const date = startDate ? new Date(startDate).toISOString() : undefined;
            const data = await dataService.getTransactions(filter, 200, date);
            setLogs(data);
        } catch(e) { console.error(e); }
    };

    const handleUndo = async (id: string) => {
        if(!window.confirm("确定要撤销此操作吗？")) return;
        try {
            await dataService.undoTransaction(id);
            setLogs(prev => prev.filter(l => l.id !== id));
        } catch(e: any) { alert(e.message); }
    };

    const filteredLogs = logs.filter(log => {
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            if (!(log.product?.name?.toLowerCase().includes(q) || log.note?.toLowerCase().includes(q))) return false;
        }
        if (operatorFilter && !log.operator?.toLowerCase().includes(operatorFilter.toLowerCase())) return false;
        return true;
    });

    const totalPages = Math.ceil(filteredLogs.length / PAGE_SIZE);
    const paginatedLogs = filteredLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const renderLogType = (type: string) => {
        const colors: any = { 'IN': 'text-green-600', 'OUT': 'text-red-600', 'DELETE': 'text-gray-600', 'ADJUST': 'text-yellow-600', 'IMPORT': 'text-blue-600' };
        return <span className={`font-bold text-xs ${colors[type] || 'text-gray-500'}`}>{type}</span>;
    };

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">操作日志</h1>
            {/* ... Filters simplified for brevity, assume similar layout ... */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                 {['ALL', 'IN', 'OUT', 'ADJUST', 'DELETE'].map(f => <button key={f} onClick={()=>setFilter(f)} className={`px-3 py-1 rounded-full text-xs font-bold border ${filter===f?'bg-gray-800 text-white':'bg-white'}`}>{f}</button>)}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900"><tr><th className="p-4">时间</th><th className="p-4">操作人</th><th className="p-4">类型</th><th className="p-4">商品</th><th className="p-4 text-right">数量</th><th className="p-4 text-right">操作</th></tr></thead>
                    <tbody className="divide-y dark:divide-gray-700">
                        {paginatedLogs.map(log => (
                            <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                <td className="p-4 text-gray-500">{new Date(log.timestamp).toLocaleString()}</td>
                                <td className="p-4 font-bold">{log.operator}</td>
                                <td className="p-4">{renderLogType(log.type)}</td>
                                <td className="p-4">{log.product?.name || '未知'} <div className="text-xs text-gray-400">{log.note}</div></td>
                                <td className="p-4 text-right font-mono">{log.type==='OUT'?'-':'+'}{log.quantity}</td>
                                <td className="p-4 text-right"><button onClick={()=>handleUndo(log.id)} className="text-xs text-red-500 underline">撤销</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
                {paginatedLogs.map(log => (
                    <div key={log.id} onClick={()=>setDetailLog(log)} className="bg-white dark:bg-gray-800 p-4 rounded-xl border dark:border-gray-700 shadow-sm flex justify-between items-center">
                        <div>
                            <div className="text-xs text-gray-400 mb-1">{new Date(log.timestamp).toLocaleTimeString()}</div>
                            <div className="font-bold dark:text-white">{log.product?.name}</div>
                            <div className="flex gap-2 items-center mt-1">
                                {renderLogType(log.type)}
                                <span className="text-xs bg-gray-100 px-1 rounded">{log.operator}</span>
                            </div>
                        </div>
                        <div className="font-mono font-bold text-lg">{log.type==='OUT'?'-':'+'}{log.quantity}</div>
                    </div>
                ))}
            </div>

            {/* Pagination Controls ... */}
            <div className="flex justify-between mt-4">
                 <button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="px-4 py-2 bg-white rounded shadow disabled:opacity-50">上一页</button>
                 <button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} className="px-4 py-2 bg-white rounded shadow disabled:opacity-50">下一页</button>
            </div>

            {/* Detail Modal */}
            {detailLog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-sm p-6 shadow-2xl space-y-4">
                        <h3 className="font-bold text-lg dark:text-white">日志详情</h3>
                        <div className="space-y-2 text-sm dark:text-gray-300">
                             <div><label className="font-bold text-gray-500">时间:</label> {new Date(detailLog.timestamp).toLocaleString()}</div>
                             <div><label className="font-bold text-gray-500">操作人:</label> {detailLog.operator}</div>
                             <div><label className="font-bold text-gray-500">类型:</label> {detailLog.type}</div>
                             <div><label className="font-bold text-gray-500">商品:</label> {detailLog.product?.name}</div>
                             <div><label className="font-bold text-gray-500">数量:</label> {detailLog.quantity}</div>
                             <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded">
                                 <label className="font-bold text-gray-500 block">备注/快照:</label>
                                 {detailLog.note}
                                 <pre className="text-xs mt-2 overflow-x-auto">{JSON.stringify(detailLog.snapshot_data, null, 2)}</pre>
                             </div>
                        </div>
                        <div className="flex justify-end gap-2">
                             <button onClick={()=>handleUndo(detailLog.id)} className="text-red-500 border border-red-200 px-3 py-1 rounded">撤销此操作</button>
                             <button onClick={()=>setDetailLog(null)} className="bg-blue-600 text-white px-4 py-1 rounded">关闭</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
