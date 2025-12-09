

import React, { useState, useEffect } from 'react';
import { dataService } from '../services/dataService';
import { Transaction, User, RoleLevel } from '../types';
import { Icons } from '../components/Icons';
import { authService } from '../services/authService';
import { getLogColor } from '../utils/formatters';
import { UsernameBadge } from '../components/UsernameBadge';

export const Logs: React.FC = () => {
    const [logs, setLogs] = useState<Transaction[]>([]);
    const [filter, setFilter] = useState('ALL');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 15;
    const [detailLog, setDetailLog] = useState<Transaction | null>(null);
    const [userMap, setUserMap] = useState<Map<string, RoleLevel>>(new Map());

    useEffect(() => { loadLogs(); setPage(1); }, [filter]);

    const loadLogs = async () => {
        try {
            const [data, users] = await Promise.all([
                dataService.getTransactions(filter, 200),
                dataService.getUsers()
            ]);
            
            // Build User Map for Colors based on username -> role level
            const uMap = new Map<string, RoleLevel>();
            users.forEach(u => uMap.set(u.username, u.role_level));
            setUserMap(uMap);

            // Hide RESTORE type from UI
            setLogs(data.filter(t => t.type !== 'RESTORE'));
        } catch(e) { console.error(e); }
    };

    const handleUndo = async (id: string) => {
        if(!window.confirm("确定要撤销此操作吗？")) return;
        try {
            await dataService.undoTransaction(id);
            setLogs(prev => prev.filter(l => l.id !== id));
            setDetailLog(null);
            alert("已撤销");
        } catch(e: any) { alert(e.message); }
    };

    const typeLabel = (t: string) => {
        const map:any = { 'IN':'入库','OUT':'出库','IMPORT':'导入','ADJUST':'调整','DELETE':'删除','RESTORE':'撤销恢复' };
        return map[t] || t;
    };

    const renderContent = (log: Transaction) => {
        if (log.type === 'ADJUST') {
            return <div className="text-xs text-gray-500 break-words">{log.note}</div>;
        }
        if (log.type === 'DELETE') {
             return <div className="text-xs text-red-500 font-bold">{log.note}</div>;
        }
        return (
            <div>
                <div className="font-medium dark:text-white">{log.product?.name || '未知商品'}</div>
                <div className="text-xs text-gray-400">{log.note}</div>
            </div>
        );
    };

    const renderQty = (log: Transaction) => {
        if (log.type === 'ADJUST' || log.type === 'DELETE') return <span className="text-gray-400 text-xs">-</span>;
        const color = log.type==='OUT' ? 'text-red-600' : 'text-green-600';
        return <span className={`font-mono font-bold ${color}`}>{log.type==='OUT'?'-':'+'}{log.quantity}</span>;
    };

    const filteredLogs = logs; 
    const totalPages = Math.ceil(filteredLogs.length / PAGE_SIZE);
    const paginatedLogs = filteredLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto max-w-[100vw]">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">操作日志</h1>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4 custom-scrollbar">
                 {['ALL', 'IN', 'OUT', 'ADJUST', 'DELETE', 'IMPORT'].map(f => (
                     <button key={f} onClick={()=>setFilter(f)} className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${filter===f?'bg-gray-800 text-white dark:bg-white dark:text-gray-900':'bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'}`}>
                         {typeLabel(f)}
                     </button>
                 ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden shadow-sm" id="table-logs">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400">
                        <tr><th className="p-4">时间</th><th className="p-4">操作人</th><th className="p-4">类型</th><th className="p-4">内容/商品</th><th className="p-4 text-right">数量变动</th><th className="p-4 text-right">操作</th></tr>
                    </thead>
                    <tbody className="divide-y dark:divide-gray-700">
                        {paginatedLogs.map(log => (
                            <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                <td className="p-4 text-gray-500">{new Date(log.timestamp).toLocaleString()}</td>
                                <td className="p-4"><UsernameBadge name={log.operator || '未知'} roleLevel={userMap.get(log.operator || '') || 9} /></td>
                                <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-bold ${getLogColor(log.type)}`}>{typeLabel(log.type)}</span></td>
                                <td className="p-4">{renderContent(log)}</td>
                                <td className="p-4 text-right">{renderQty(log)}</td>
                                <td className="p-4 text-right"><button onClick={()=>handleUndo(log.id)} className="text-xs text-red-500 hover:underline font-bold">撤销</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
                {paginatedLogs.map(log => (
                    <div key={log.id} onClick={()=>setDetailLog(log)} className="bg-white dark:bg-gray-800 p-4 rounded-xl border dark:border-gray-700 shadow-sm flex justify-between items-center active:bg-gray-50 dark:active:bg-gray-700">
                        <div className="flex flex-col gap-1">
                            <div className="text-[10px] text-gray-400">{new Date(log.timestamp).toLocaleString()}</div>
                            <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${getLogColor(log.type)}`}>{typeLabel(log.type)}</span>
                                <span className="text-sm font-bold dark:text-white truncate max-w-[120px]">{log.type === 'ADJUST' || log.type === 'DELETE' ? (log.product?.name || '属性变更') : log.product?.name}</span>
                            </div>
                        </div>
                        <div className="flex flex-col items-end">
                            {renderQty(log)}
                            <UsernameBadge name={log.operator || '未知'} roleLevel={userMap.get(log.operator || '') || 9} />
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex justify-between mt-4">
                 <button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="px-4 py-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded shadow disabled:opacity-50 dark:text-white">上一页</button>
                 <button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} className="px-4 py-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded shadow disabled:opacity-50 dark:text-white">下一页</button>
            </div>

            {/* Detail Modal */}
            {detailLog && (
                <div className="fixed inset-0 bg-white dark:bg-gray-900 z-[100] flex flex-col animate-fade-in">
                    <div className="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
                        <h2 className="font-bold text-lg dark:text-white">日志详情</h2>
                        <div className="flex gap-2">
                             <button onClick={()=>handleUndo(detailLog.id)} className="text-red-500 font-bold border border-red-200 px-3 py-1 rounded text-sm">撤销此操作</button>
                             <button onClick={()=>setDetailLog(null)} className="bg-blue-600 text-white px-4 py-1 rounded font-bold text-sm">关闭</button>
                        </div>
                    </div>
                    <div className="p-6 overflow-y-auto space-y-4">
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl border dark:border-gray-700">
                             <div className="grid grid-cols-2 gap-4 text-sm dark:text-gray-300">
                                 <div><label className="block text-gray-500 text-xs">时间</label>{new Date(detailLog.timestamp).toLocaleString()}</div>
                                 <div><label className="block text-gray-500 text-xs">操作人</label><UsernameBadge name={detailLog.operator || '未知'} roleLevel={userMap.get(detailLog.operator || '') || 9} /></div>
                                 <div><label className="block text-gray-500 text-xs">类型</label><span className={`px-2 py-0.5 rounded ${getLogColor(detailLog.type)}`}>{typeLabel(detailLog.type)}</span></div>
                                 <div><label className="block text-gray-500 text-xs">数量变动</label>{renderQty(detailLog)}</div>
                             </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl border dark:border-gray-700">
                             <label className="block text-gray-500 text-xs mb-2">详细内容 / 备注</label>
                             <div className="font-medium text-lg dark:text-white mb-2">{detailLog.note}</div>
                             {detailLog.snapshot_data && (
                                 <pre className="text-xs bg-gray-200 dark:bg-black/50 p-2 rounded overflow-x-auto text-gray-600 dark:text-gray-400 font-mono">
                                     {JSON.stringify(detailLog.snapshot_data, null, 2)}
                                 </pre>
                             )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
