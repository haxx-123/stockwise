

import React, { useState, useEffect } from 'react';
import { dataService } from '../services/dataService';
import { AuditLog, User } from '../types';
import { Icons } from '../components/Icons';

export const Audit: React.FC = () => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [selectedUserForDevice, setSelectedUserForDevice] = useState<string>('');

    useEffect(() => {
        dataService.getAuditLogs(100).then(setLogs);
        dataService.getUsers().then(setUsers);
    }, []);

    const targetUser = users.find(u => u.id === selectedUserForDevice);

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">审计大厅</h1>

            {/* Device History Section */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-8">
                <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><Icons.Sparkles size={18}/> 账户设备监控</h2>
                <select 
                    value={selectedUserForDevice} 
                    onChange={e=>setSelectedUserForDevice(e.target.value)}
                    className="p-2 border rounded-lg mb-4 bg-gray-50 dark:bg-gray-900"
                >
                    <option value="">选择账户查看设备...</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                </select>

                {targetUser && (
                    <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl">
                        <p className="mb-4 text-sm">
                            <span className="font-bold text-blue-600">{targetUser.username}</span> 目前已在以下设备上登录 棱镜 账号...
                        </p>
                        <div className="space-y-2">
                            {targetUser.device_history?.map((dev, idx) => (
                                <div key={idx} className="flex justify-between items-center border-b pb-2">
                                    <div>
                                        <div className="font-bold">{dev.device_name}</div>
                                        <div className="text-xs text-gray-400">IP: {dev.ip}</div>
                                    </div>
                                    <div className="text-xs text-gray-500">{new Date(dev.last_login).toLocaleString()}</div>
                                </div>
                            )) || <div className="text-gray-400">无设备记录</div>}
                        </div>
                    </div>
                )}
            </div>

            {/* General Logs */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-900 font-bold uppercase">
                        <tr><th className="p-4">时间</th><th className="p-4">操作</th><th className="p-4">详情</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {logs.map(log => (
                            <tr key={log.id}>
                                <td className="p-4">{new Date(log.timestamp).toLocaleString()}</td>
                                <td className="p-4 font-bold">{log.operation}</td>
                                <td className="p-4 truncate max-w-xs">{JSON.stringify(log.new_data)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};