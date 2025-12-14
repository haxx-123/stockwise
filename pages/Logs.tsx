
import React, { useState, useEffect } from 'react';
import { dataService } from '../services/dataService';
import { OperationLog, Product } from '../types';
import { Icons } from '../components/Icons';
import { formatLogContent, getLogColor } from '../utils/formatters';

export const Logs: React.FC = () => {
    const [logs, setLogs] = useState<OperationLog[]>([]);
    const [products, setProducts] = useState<Map<string, Product>>(new Map());
    const [filter, setFilter] = useState('ALL');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const [l, p] = await Promise.all([
            dataService.getOperationLogs(),
            dataService.getProducts(true) // Include archived for history
        ]);
        setLogs(l);
        const pMap = new Map();
        p.forEach(prod => pMap.set(prod.id, prod));
        setProducts(pMap);
    };

    const handleUndo = async (log: OperationLog) => {
        const msg = log.action_type === 'IN' ? "撤销入库将扣减库存，确定吗？" : 
                    log.action_type === 'OUT' ? "撤销出库将回退库存，确定吗？" : 
                    "确定撤销此操作吗？";
        
        if(!window.confirm(msg)) return;

        try {
            await dataService.undoOperation(log.id);
            alert("撤销成功");
            loadData();
        } catch(e: any) {
            alert("撤销失败: " + e.message);
        }
    };

    const filtered = logs.filter(l => filter === 'ALL' || l.action_type === filter);

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto animate-fade-in">
            <h1 className="text-3xl font-black mb-6 text-black">操作日志 (原子撤销)</h1>
            
            <div className="flex gap-2 mb-4 overflow-x-auto">
                {['ALL', 'IN', 'OUT', 'ADJUST', 'DELETE'].map(f => (
                    <button key={f} onClick={()=>setFilter(f)} className={`px-4 py-2 rounded-xl font-bold ${filter===f?'bg-black text-white':'bg-white/40 text-black'}`}>
                        {f==='ALL'?'全部':f}
                    </button>
                ))}
            </div>

            <div className="glass-panel rounded-2xl overflow-hidden">
                <table className="w-full text-left text-sm text-black">
                    <thead className="bg-white/20 font-bold uppercase border-b border-black/10">
                        <tr><th className="p-4">时间</th><th className="p-4">操作人</th><th className="p-4">类型</th><th className="p-4">内容详情</th><th className="p-4 text-right">操作</th></tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                        {filtered.map(log => (
                            <tr key={log.id} className="hover:bg-white/10 transition-colors">
                                <td className="p-4 opacity-70">{new Date(log.created_at).toLocaleString()}</td>
                                <td className="p-4 font-bold">{log.operator_id}</td>
                                <td className="p-4"><span className={`px-2 py-1 rounded-lg text-xs font-bold ${getLogColor(log.action_type)}`}>{log.action_type}</span></td>
                                <td className="p-4 font-medium">{formatLogContent(log, products)}</td>
                                <td className="p-4 text-right">
                                    {!log.is_revoked && (
                                        <button onClick={()=>handleUndo(log)} className="px-3 py-1 bg-red-100 text-red-600 rounded-lg font-bold hover:bg-red-200">
                                            撤销
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
