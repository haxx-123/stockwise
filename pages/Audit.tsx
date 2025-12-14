
import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { dataService } from '../services/dataService';
import { authService } from '../services/authService';
import { User, AuditLog } from '../types';
import { UsernameBadge } from '../components/UsernameBadge';
import { createPortal } from 'react-dom';

declare const window: any;

export const Audit: React.FC<{ initialView?: 'LOGS' | 'DEVICES' }> = ({ initialView }) => {
    const [view, setView] = useState<'LOGS' | 'DEVICES'>(initialView || 'LOGS');
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    
    // Sync if prop changes
    useEffect(() => {
        if (initialView) setView(initialView);
    }, [initialView]);

    // State for Detail Modal
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

    // State for Device Monitor
    const [selectedUserId, setSelectedUserId] = useState('');
    
    const currentUser = authService.getCurrentUser();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const [logs, allUsers] = await Promise.all([
            dataService.getAuditLogs(100),
            dataService.getUsers()
        ]);
        setAuditLogs(logs);
        
        // Filter users for Device Monitor: Only allow selecting self or lower permissions (Higher Number)
        if (currentUser) {
            // 00 sees everyone. Others see self and lower roles.
            const validUsers = allUsers.filter(u => u.role_level >= currentUser.role_level);
            setUsers(validUsers);
        }
    };

    // --- Excel Export Listener ---
    useEffect(() => {
        const handleExcelExport = () => {
            if (!window.XLSX) return alert("Excel 模块未加载");
            
            const exportRows = auditLogs.map(l => ({
                "时间戳": new Date(l.timestamp).toLocaleString(),
                "表名": l.table_name,
                "操作类型": l.operation,
                "变动详情": JSON.stringify(l.new_data)
            }));

            const ws = window.XLSX.utils.json_to_sheet(exportRows);
            const wb = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(wb, ws, "AuditTrail");
            window.XLSX.writeFile(wb, `StockWise_Audit_${Date.now()}.xlsx`);
        };

        window.addEventListener('trigger-excel-export', handleExcelExport);
        return () => window.removeEventListener('trigger-excel-export', handleExcelExport);
    }, [auditLogs]);

    const targetUser = users.find(u => u.id === selectedUserId);

    return (
        <div className="p-4 md:p-8 animate-fade-in pb-24">
            {/* Header Tabs */}
            <div className="flex gap-6 mb-8 border-b border-black/10 dark:border-white/10 pb-2">
                <button 
                    onClick={()=>setView('LOGS')} 
                    className={`text-2xl font-black transition-colors flex items-center gap-2 ${view==='LOGS'?'text-black dark:text-white':'text-gray-400 hover:text-gray-600'}`}
                >
                    <Icons.AlertTriangle size={24}/> 操作审计
                </button>
                <button 
                    onClick={()=>setView('DEVICES')} 
                    className={`text-2xl font-black transition-colors flex items-center gap-2 ${view==='DEVICES'?'text-black dark:text-white':'text-gray-400 hover:text-gray-600'}`}
                >
                    <Icons.Scan size={24}/> 账户设备
                </button>
            </div>

            {/* --- LOGS VIEW --- */}
            {view === 'LOGS' && (
                <div className="glass-panel rounded-3xl overflow-hidden shadow-lg border border-white/20">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-black/5 dark:bg-white/5 font-bold uppercase text-black dark:text-white border-b border-black/5">
                                <tr>
                                    <th className="p-4 w-48">时间</th>
                                    <th className="p-4 w-32">类型 / 表</th>
                                    <th className="p-4">简要内容</th>
                                    <th className="p-4 w-24 text-right">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black/5 dark:divide-white/5">
                                {auditLogs.map(l => (
                                    <tr key={l.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                                        <td className="p-4 text-black dark:text-gray-300">
                                            <div className="font-bold">{new Date(l.timestamp).toLocaleDateString()}</div>
                                            <div className="text-xs opacity-60 font-mono">{new Date(l.timestamp).toLocaleTimeString()}</div>
                                        </td>
                                        <td className="p-4">
                                            <span className="font-black text-xs uppercase bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-black dark:text-white block w-fit mb-1">{l.operation}</span>
                                            <span className="text-xs font-mono opacity-60">{l.table_name}</span>
                                        </td>
                                        <td className="p-4">
                                            <div className="truncate max-w-xs md:max-w-md opacity-70 font-mono text-xs dark:text-gray-300">
                                                {JSON.stringify(l.new_data)}
                                            </div>
                                        </td>
                                        <td className="p-4 text-right">
                                            <button 
                                                onClick={() => setSelectedLog(l)}
                                                className="px-4 py-2 bg-black text-white dark:bg-white dark:text-black rounded-xl font-bold text-xs shadow hover:scale-105 transition-transform"
                                            >
                                                详情
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {auditLogs.length === 0 && <div className="p-10 text-center text-gray-400">暂无审计记录</div>}
                    </div>
                </div>
            )}

            {/* --- DEVICES VIEW --- */}
            {view === 'DEVICES' && (
                <div className="max-w-3xl mx-auto space-y-6 animate-slide-up">
                    <div className="glass-panel p-8 rounded-3xl shadow-xl border border-white/20">
                        <label className="block text-sm font-bold text-gray-500 mb-2">选择账户 (仅显示权限低于或等于您的账户)</label>
                        <select 
                            className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 border-none font-bold text-lg outline-none mb-6 dark:text-white shadow-inner" 
                            onChange={e=>setSelectedUserId(e.target.value)}
                            value={selectedUserId}
                        >
                            <option value="">-- 请选择账户 --</option>
                            {users.map(u => (
                                <option key={u.id} value={u.id}>
                                    {u.username} (Level {u.role_level})
                                </option>
                            ))}
                        </select>

                        {targetUser ? (
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-2xl border border-blue-100 dark:border-blue-800 animate-fade-in">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="p-3 bg-blue-100 dark:bg-blue-800 rounded-full text-blue-600 dark:text-blue-200">
                                        <Icons.Store size={24}/>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg dark:text-white mb-2">设备活动详情</h3>
                                        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                                            <span className="font-black text-black dark:text-white text-base mr-1">{targetUser.username}</span>
                                            目前已在以下设备上登录 棱镜 账号，或过去28天内曾在这些设备上登录过 棱镜 账号。可能会显示来自同一设备的多个活动会话。
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {targetUser.device_history && targetUser.device_history.length > 0 ? (
                                        targetUser.device_history.map((device, idx) => (
                                            <div key={idx} className="bg-white dark:bg-gray-800 p-4 rounded-xl flex items-center justify-between shadow-sm">
                                                <div className="flex items-center gap-3">
                                                    <Icons.LayoutDashboard className="text-gray-400"/>
                                                    <div>
                                                        <div className="font-bold text-sm dark:text-white">{device.device_name || '未知设备'}</div>
                                                        <div className="text-xs text-gray-400 font-mono">IP: {device.ip || 'Unknown'}</div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-xs font-bold text-green-600 bg-green-100 dark:bg-green-900 dark:text-green-300 px-2 py-1 rounded mb-1">
                                                        {idx === 0 ? '最近登录' : '历史会话'}
                                                    </div>
                                                    <div className="text-xs text-gray-400">{new Date(device.last_login).toLocaleString()}</div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-8 text-gray-400 bg-white/50 dark:bg-black/20 rounded-xl">
                                            暂无设备登录记录
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-12 text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                                <Icons.Scan size={48} className="mx-auto mb-4 opacity-20"/>
                                <p>请先在上方选择一个账户以查看详情</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* --- DETAIL MODAL (Independent Page Style) --- */}
            {selectedLog && createPortal(
                <div className="fixed inset-0 z-[200] bg-gray-100 dark:bg-gray-900 overflow-y-auto animate-slide-up flex flex-col">
                    {/* Modal Header */}
                    <div className="sticky top-0 bg-white dark:bg-gray-800 shadow-md z-10 px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button 
                                onClick={()=>setSelectedLog(null)} 
                                className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-gray-200 transition-colors"
                            >
                                <Icons.ArrowRightLeft size={20} className="rotate-180 dark:text-white"/>
                            </button>
                            <div>
                                <h1 className="text-xl font-black dark:text-white">审计详情</h1>
                                <p className="text-xs text-gray-500 font-mono">{selectedLog.id}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-sm font-bold dark:text-white">{new Date(selectedLog.timestamp).toLocaleString()}</div>
                        </div>
                    </div>

                    {/* Modal Content */}
                    <div className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                                <h3 className="text-gray-500 font-bold text-sm uppercase mb-4">基本信息</h3>
                                <div className="space-y-4">
                                    <div className="flex justify-between border-b dark:border-gray-700 pb-2">
                                        <span className="text-gray-500">表名 (Table)</span>
                                        <span className="font-mono font-bold dark:text-white">{selectedLog.table_name}</span>
                                    </div>
                                    <div className="flex justify-between border-b dark:border-gray-700 pb-2">
                                        <span className="text-gray-500">操作类型</span>
                                        <span className={`font-black px-2 py-0.5 rounded text-white ${
                                            selectedLog.operation === 'DELETE' ? 'bg-red-500' :
                                            selectedLog.operation === 'UPDATE' ? 'bg-blue-500' :
                                            'bg-green-500'
                                        }`}>
                                            {selectedLog.operation}
                                        </span>
                                    </div>
                                    <div className="flex justify-between border-b dark:border-gray-700 pb-2">
                                        <span className="text-gray-500">记录 ID</span>
                                        <span className="font-mono text-xs dark:text-white">{selectedLog.record_id}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                                <h3 className="text-gray-500 font-bold text-sm uppercase mb-4">操作上下文</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-300">
                                    此记录由系统自动生成，记录了数据库层面的原子变动。如果这是 "CLIENT_ACTION"，则表示用户在客户端触发了特定行为（如登录、登出）。
                                </p>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
                            <div className="bg-gray-50 dark:bg-gray-700 p-4 border-b border-gray-100 dark:border-gray-600 flex justify-between items-center">
                                <h3 className="font-bold text-black dark:text-white">变动数据 (JSON Payload)</h3>
                                <button 
                                    onClick={() => {
                                        navigator.clipboard.writeText(JSON.stringify(selectedLog.new_data, null, 2));
                                        alert("JSON 已复制");
                                    }}
                                    className="text-xs bg-black text-white px-3 py-1 rounded-lg hover:opacity-80"
                                >
                                    复制 JSON
                                </button>
                            </div>
                            <div className="p-0 overflow-x-auto">
                                <pre className="p-6 text-sm font-mono text-gray-800 dark:text-green-400 whitespace-pre-wrap break-all">
                                    {JSON.stringify(selectedLog.new_data, null, 4)}
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
