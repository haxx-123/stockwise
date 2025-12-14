
import React, { useState } from 'react';
import { Icons } from '../components/Icons';
import { dataService } from '../services/dataService';

export const Audit: React.FC = () => {
    const [view, setView] = useState<'LOGS' | 'DEVICES'>('LOGS');
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [selectedUser, setSelectedUser] = useState('');

    React.useEffect(() => {
        dataService.getAuditLogs(100).then(setAuditLogs);
        dataService.getUsers().then(setUsers);
    }, []);

    const targetUser = users.find(u => u.id === selectedUser);

    return (
        <div className="p-8">
            <div className="flex gap-4 mb-6">
                <button onClick={()=>setView('LOGS')} className={`text-2xl font-black ${view==='LOGS'?'text-black border-b-4 border-black':'text-gray-400'}`}>操作审计</button>
                <button onClick={()=>setView('DEVICES')} className={`text-2xl font-black ${view==='DEVICES'?'text-black border-b-4 border-black':'text-gray-400'}`}>设备监控</button>
            </div>

            {view === 'LOGS' && (
                <div className="glass-panel rounded-3xl p-6 overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="border-b border-black/10 font-bold uppercase"><tr><th className="p-3">Time</th><th className="p-3">Action</th><th className="p-3">Detail</th></tr></thead>
                        <tbody>
                            {auditLogs.map(l => (
                                <tr key={l.id} className="hover:bg-white/20">
                                    <td className="p-3">{new Date(l.timestamp).toLocaleString()}</td>
                                    <td className="p-3 font-bold">{l.operation}</td>
                                    <td className="p-3 opacity-70 truncate max-w-xs">{JSON.stringify(l.new_data)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {view === 'DEVICES' && (
                <div className="glass-panel rounded-3xl p-8">
                    <h2 className="text-xl font-bold mb-4">账户设备查询</h2>
                    <select className="w-full p-4 rounded-xl bg-white/50 mb-6 font-bold" onChange={e=>setSelectedUser(e.target.value)}>
                        <option value="">选择账户...</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                    </select>
                    {targetUser && (
                        <div className="bg-white/40 p-6 rounded-2xl">
                            <p className="mb-4">
                                <span className="font-bold text-lg">{targetUser.username}</span> 
                                目前已在以下设备登录...
                            </p>
                            {/* Device list mock */}
                            <div className="p-4 border-b border-black/10 flex justify-between">
                                <div>iPhone 15 Pro <span className="text-xs bg-green-200 text-green-800 px-2 rounded">Current</span></div>
                                <div className="text-xs opacity-50">Today 10:23 AM</div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
