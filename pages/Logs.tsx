


import React, { useState, useEffect } from 'react';
import { dataService } from '../services/dataService';
import { Transaction, RoleLevel } from '../types';
import { Icons } from '../components/Icons';
import { getLogColor, formatLogContent } from '../utils/formatters';
import { UsernameBadge } from '../components/UsernameBadge';
import { generatePageSummary } from '../utils/formatters';

declare const html2canvas: any;

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
            const uMap = new Map<string, RoleLevel>();
            users.forEach(u => uMap.set(u.username, u.role_level));
            setUserMap(uMap);
            setLogs(data.filter(t => t.type !== 'RESTORE'));
        } catch(e) { console.error(e); }
    };

    const handleUndo = async (id: string) => {
        if(!window.confirm("确定要撤销此操作吗？")) return;
        try {
            await dataService.undoTransaction(id);
            alert("已撤销");
            loadLogs();
            setDetailLog(null);
        } catch(e: any) { alert(e.message); }
    };

    const handleCopy = () => {
        const text = generatePageSummary('logs', logs.slice(0, 50)); // Copy top 50
        navigator.clipboard.writeText(text).then(()=>alert("日志文本已复制"));
    };

    const handleScreenshot = () => {
        const el = document.getElementById('table-logs');
        if (el && html2canvas) {
            // Temp styling
            const originalOverflow = el.style.overflow;
            const originalHeight = el.style.height;
            el.style.overflow = 'visible';
            el.style.height = 'auto';
            
            html2canvas(el, { ignoreElements: (e:any) => e.classList.contains('no-print') }).then((canvas:any) => {
                const link = document.createElement('a');
                link.download = `logs_screenshot.png`;
                link.href = canvas.toDataURL();
                link.click();
                
                // Restore
                el.style.overflow = originalOverflow;
                el.style.height = originalHeight;
            });
        }
    };

    const typeLabel = (t: string) => {
        const map:any = { 'IN':'入库','OUT':'出库','IMPORT':'导入','ADJUST':'调整','DELETE':'删除','RESTORE':'撤销恢复' };
        return map[t] || t;
    };

    const totalPages = Math.ceil(logs.length / PAGE_SIZE);
    const paginatedLogs = logs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto max-w-[100vw]">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-white">操作日志</h1>
                <div className="flex gap-2">
                    <button onClick={handleCopy} className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:scale-105 transition-transform"><Icons.Copy size={20}/></button>
                    <button onClick={handleScreenshot} className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:scale-105 transition-transform"><Icons.Camera size={20}/></button>
                </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 mb-4 custom-scrollbar">
                 {['ALL', 'IN', 'OUT', 'ADJUST', 'DELETE', 'IMPORT'].map(f => (
                     <button key={f} onClick={()=>setFilter(f)} className={`px-4 py-1.5 rounded-xl text-xs font-bold border transition-colors ${filter===f?'bg-gray-800 text-white dark:bg-white dark:text-gray-900':'bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'}`}>
                         {typeLabel(f)}
                     </button>
                 ))}
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden shadow-sm" id="table-logs">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400">
                        <tr><th className="p-4">时间</th><th className="p-4">操作人</th><th className="p-4">类型</th><th className="p-4">内容详情</th><th className="p-4 text-right no-print">操作</th></tr>
                    </thead>
                    <tbody className="divide-y dark:divide-gray-700">
                        {paginatedLogs.map((log, idx) => (
                            <tr key={log.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors animate-fade-in-up stagger-${(idx%5)+1}`}>
                                <td className="p-4 text-gray-500 whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td>
                                <td className="p-4"><UsernameBadge name={log.operator || '未知'} roleLevel={userMap.get(log.operator || '') || 9} /></td>
                                <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-bold ${getLogColor(log.type)}`}>{typeLabel(log.type)}</span></td>
                                <td className="p-4 font-medium dark:text-gray-200">{formatLogContent(log)}</td>
                                <td className="p-4 text-right no-print">
                                    {!log.is_undone && (
                                        <button onClick={()=>handleUndo(log.id)} className="text-xs text-red-500 hover:text-red-700 font-bold border border-red-200 px-2 py-1 rounded hover:bg-red-50">撤销</button>
                                    )}
                                    {log.is_undone && <span className="text-xs text-gray-400 italic">已撤销</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination with input */}
            <div className="flex flex-wrap justify-between items-center mt-4 bg-white dark:bg-gray-800 p-4 rounded-xl border dark:border-gray-700">
                 <button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-xl disabled:opacity-50 dark:text-white font-bold active:scale-95 transition-transform">上一页</button>
                 <div className="flex items-center gap-2">
                     <span className="text-sm dark:text-gray-400">当前</span>
                     <input type="number" min="1" max={totalPages} value={page} onChange={(e)=>setPage(Math.max(1, Math.min(totalPages, Number(e.target.value))))} className="w-16 text-center border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white font-bold"/>
                     <span className="text-sm dark:text-gray-400">/ {totalPages} 页</span>
                 </div>
                 <button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-xl disabled:opacity-50 dark:text-white font-bold active:scale-95 transition-transform">下一页</button>
            </div>
        </div>
    );
};