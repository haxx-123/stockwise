

import React, { useState, useEffect } from 'react';
import { getSupabaseConfig } from '../services/supabaseClient';
import { authService } from '../services/authService';
import { dataService } from '../services/dataService';
import { User, UserPermissions } from '../types';
import { UsernameBadge } from '../components/UsernameBadge';
import { Icons } from '../components/Icons';

export const Settings: React.FC<{ subPage?: string; onThemeChange?: (theme: string) => void }> = ({ subPage, onThemeChange }) => {
    const [users, setUsers] = useState<User[]>([]);
    const currentUser = authService.getCurrentUser();
    const is00 = currentUser?.role_level === 0;
    const [selectedUser, setSelectedUser] = useState<User | null>(null); // For Modal
    const [loadingPerms, setLoadingPerms] = useState(false);

    // Load users list
    useEffect(() => {
        if(subPage === 'perms') loadUsers();
    }, [subPage]);

    const loadUsers = async () => {
        const u = await dataService.getUsers();
        // Filter based on hierarchy: Can only see <= self.
        // If 00/01, see all.
        setUsers(u);
    };

    // Open Modal and Fetch FRESH permissions
    const openPermModal = async (u: User) => {
        setLoadingPerms(true);
        // Force Fresh Fetch to avoid stale data
        const freshUser = await dataService.getUser(u.id); 
        setSelectedUser(freshUser);
        setLoadingPerms(false);
    };

    // Instant Toggle (Optimistic UI + Background Save)
    const togglePerm = async (key: keyof UserPermissions) => {
        if (!selectedUser) return;
        
        // 1. Optimistic Update
        const oldPerms = selectedUser.permissions;
        const newVal = !oldPerms[key];
        const newPerms = { ...oldPerms, [key]: newVal };
        
        setSelectedUser({ ...selectedUser, permissions: newPerms });

        // 2. Background Save
        try {
            await dataService.updateUser(selectedUser.id, { permissions: newPerms });
        } catch(e) {
            // Revert on error
            alert("保存失败");
            setSelectedUser({ ...selectedUser, permissions: oldPerms });
        }
    };

    const SQL_CODE = `
    -- StockWise Upgrade
    ALTER TABLE users ADD COLUMN IF NOT EXISTS face_descriptor float4[];
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES stores(id);
    ALTER TABLE batches ADD COLUMN IF NOT EXISTS image_url text;
    ALTER TABLE batches ADD COLUMN IF NOT EXISTS remark text;
    -- No Reset Needed
    `;

    if (subPage === 'account') {
        return (
            <div className="p-8 max-w-2xl mx-auto space-y-6">
                <h1 className="text-3xl font-black">账户设置</h1>
                <div className="bg-white p-6 rounded-3xl shadow-lg">
                    <div className="space-y-4">
                        <div className="bg-gray-100 p-3 rounded-xl font-mono text-xs text-gray-500">ID: {currentUser?.id}</div>
                        <input defaultValue={currentUser?.username} className="w-full p-3 border rounded-xl font-bold"/>
                        <button onClick={()=>alert("启动摄像头录入人脸...")} className="w-full py-3 bg-blue-50 text-blue-600 rounded-xl font-bold border border-blue-200">
                            👤 设置人脸识别
                        </button>
                    </div>
                    <div className="flex gap-4 mt-6">
                        <button className="flex-1 py-3 bg-black text-white rounded-xl font-bold">保存</button>
                        <button onClick={()=>authService.logout()} className="flex-1 py-3 bg-red-100 text-red-600 rounded-xl font-bold">退出登录</button>
                    </div>
                </div>
            </div>
        );
    }

    if (subPage === 'perms') {
        return (
            <div className="p-8">
                <div className="flex justify-between mb-6">
                    <h1 className="text-3xl font-black">权限设置</h1>
                    <button className="bg-black text-white px-4 py-2 rounded-xl font-bold">+ 新增用户</button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {users.map(u => (
                        <div key={u.id} className="bg-white p-6 rounded-2xl shadow border border-gray-100">
                            <div className="flex justify-between items-center mb-4">
                                <UsernameBadge name={u.username} roleLevel={u.role_level}/>
                                <div className="flex gap-2">
                                    <button onClick={()=>openPermModal(u)} className="text-blue-600 font-bold text-sm bg-blue-50 px-3 py-1 rounded-lg">设置</button>
                                    <button className="text-red-600 font-bold text-sm bg-red-50 px-3 py-1 rounded-lg">删除</button>
                                </div>
                            </div>
                            <div className="text-xs text-gray-400">Level {String(u.role_level).padStart(2,'0')}</div>
                        </div>
                    ))}
                </div>

                {/* Independent Permission Modal */}
                {selectedUser && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
                        <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl max-h-[80vh] overflow-y-auto">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-black">权限配置: {selectedUser.username}</h3>
                                <button onClick={()=>setSelectedUser(null)} className="p-2 bg-gray-100 rounded-full"><Icons.Minus/></button>
                            </div>
                            
                            {loadingPerms ? (
                                <div className="text-center p-10">加载最新数据...</div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                                        <span className="font-bold">允许导出 Excel</span>
                                        <input type="checkbox" checked={selectedUser.permissions.show_excel} onChange={()=>togglePerm('show_excel')} className="w-6 h-6 accent-black"/>
                                    </div>
                                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                                        <span className="font-bold">隐藏审计大厅</span>
                                        <input type="checkbox" checked={selectedUser.permissions.hide_audit_hall} onChange={()=>togglePerm('hide_audit_hall')} className="w-6 h-6 accent-black"/>
                                    </div>
                                    {/* Add more toggles as needed */}
                                    <div className="p-3 bg-yellow-50 rounded-xl text-xs text-yellow-800">
                                        注: 操作即时生效，无需点击保存。
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    if (subPage === 'config' && is00) {
        return (
            <div className="p-8">
                <pre className="bg-gray-900 text-green-400 p-4 rounded-xl overflow-auto text-xs">{SQL_CODE}</pre>
            </div>
        );
    }

    return null;
};