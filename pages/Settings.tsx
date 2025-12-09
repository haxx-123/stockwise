
import React, { useState, useEffect, useRef } from 'react';
import { getSupabaseConfig, saveSupabaseConfig, getSupabaseClient } from '../services/supabaseClient';
import { authService, DEFAULT_PERMISSIONS } from '../services/authService';
import { dataService } from '../services/dataService';
import { User, Store, UserPermissions, RoleLevel, RolePermissionRule } from '../types';
import { Icons } from '../components/Icons';
import { UsernameBadge } from '../components/UsernameBadge';
import { SVIPBadge } from '../components/SVIPBadge';
import { useUserPermissions, usePermissionContext } from '../contexts/PermissionContext';

export const Settings: React.FC<{ subPage?: string; onThemeChange?: (theme: string) => void }> = ({ subPage = 'config', onThemeChange }) => {
    const [configUrl, setConfigUrl] = useState('');
    const [configKey, setConfigKey] = useState('');
    const [saved, setSaved] = useState(false);
    const [currentTheme, setCurrentTheme] = useState(localStorage.getItem('sw_theme') || 'light');

    useEffect(() => {
        const config = getSupabaseConfig();
        setConfigUrl(config.url);
        setConfigKey(config.key);
    }, [subPage]);

    const handleSaveConfig = () => {
        saveSupabaseConfig(configUrl.trim(), configKey.trim());
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        window.location.reload(); 
    };

    const handleThemeClick = (theme: string) => {
        setCurrentTheme(theme);
        if (onThemeChange) onThemeChange(theme);
    };
    
    // UPDATED SQL SCRIPT
    const sqlScript = `
-- STOCKWISE V3.1.0 MATRIX UPDATE
-- SQL是/否较上一次发生更改: 是
-- SQL是/否必须包含重置数据库: 否

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ 
BEGIN 
    -- 1. Role Permissions Matrix Table
    CREATE TABLE IF NOT EXISTS role_permissions (
        role_level integer PRIMARY KEY
    );
    
    -- Ensure Columns Exist for Matrix
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='role_permissions' AND column_name='logs_level') THEN
        ALTER TABLE role_permissions ADD COLUMN logs_level text DEFAULT 'D';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='role_permissions' AND column_name='announcement_rule') THEN
        ALTER TABLE role_permissions ADD COLUMN announcement_rule text DEFAULT 'VIEW';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='role_permissions' AND column_name='store_scope') THEN
        ALTER TABLE role_permissions ADD COLUMN store_scope text DEFAULT 'LIMITED';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='role_permissions' AND column_name='show_excel') THEN
        ALTER TABLE role_permissions ADD COLUMN show_excel boolean DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='role_permissions' AND column_name='view_peers') THEN
        ALTER TABLE role_permissions ADD COLUMN view_peers boolean DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='role_permissions' AND column_name='view_self_in_list') THEN
        ALTER TABLE role_permissions ADD COLUMN view_self_in_list boolean DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='role_permissions' AND column_name='hide_perm_page') THEN
        ALTER TABLE role_permissions ADD COLUMN hide_perm_page boolean DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='role_permissions' AND column_name='hide_audit_hall') THEN
        ALTER TABLE role_permissions ADD COLUMN hide_audit_hall boolean DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='role_permissions' AND column_name='hide_store_management') THEN
        ALTER TABLE role_permissions ADD COLUMN hide_store_management boolean DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='role_permissions' AND column_name='only_view_config') THEN
        ALTER TABLE role_permissions ADD COLUMN only_view_config boolean DEFAULT false;
    END IF;

    -- Drop legacy 'permissions' column from users/role_permissions if exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='role_permissions' AND column_name='permissions') THEN
        ALTER TABLE role_permissions DROP COLUMN permissions;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='permissions') THEN
         ALTER TABLE users DROP COLUMN permissions;
    END IF;

    -- 2. Init Default Data
    INSERT INTO role_permissions (role_level, logs_level, announcement_rule, store_scope, show_excel, view_peers, view_self_in_list, hide_perm_page, hide_audit_hall, hide_store_management, only_view_config)
    VALUES 
    (0, 'A', 'PUBLISH', 'GLOBAL', true, true, true, false, false, false, false),
    (1, 'A', 'PUBLISH', 'GLOBAL', true, true, true, false, false, false, false),
    (2, 'B', 'VIEW', 'GLOBAL', true, true, true, false, false, true, false),
    (3, 'C', 'VIEW', 'LIMITED', false, false, true, true, true, true, false),
    (4, 'C', 'VIEW', 'LIMITED', false, false, true, true, true, true, false),
    (5, 'C', 'VIEW', 'LIMITED', false, false, true, true, true, true, false),
    (6, 'D', 'VIEW', 'LIMITED', false, false, true, true, true, true, false),
    (7, 'D', 'VIEW', 'LIMITED', false, false, true, true, true, true, false),
    (8, 'D', 'VIEW', 'LIMITED', false, false, true, true, true, true, false),
    (9, 'D', 'VIEW', 'LIMITED', false, false, true, true, true, true, false)
    ON CONFLICT (role_level) DO NOTHING;

    -- 3. Create Live View
    DROP VIEW IF EXISTS live_users_v;
    CREATE VIEW live_users_v AS
    SELECT 
        u.id, u.username, u.password, u.role_level, u.allowed_store_ids, u.is_archived, u.face_descriptor,
        rp.logs_level, rp.announcement_rule, rp.store_scope, rp.show_excel, rp.view_peers, 
        rp.view_self_in_list, rp.hide_perm_page, rp.hide_audit_hall, rp.hide_store_management, rp.only_view_config
    FROM users u
    LEFT JOIN role_permissions rp ON u.role_level = rp.role_level;

    -- 4. Realtime
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'role_permissions') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE role_permissions;
    END IF;

    -- 5. Helper Logic for Stores (Ensure table exists)
    CREATE TABLE IF NOT EXISTS stores (id text PRIMARY KEY, name text, location text, is_archived boolean default false);

    -- 6. Helper Logic for Users (Ensure table exists)
    CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY, username text, password text, role_level int, allowed_store_ids text[], is_archived boolean default false, face_descriptor text);

END $$;
`;

    if (subPage === 'config') {
        return (
            <div className="p-4 md:p-8 max-w-4xl mx-auto dark:text-gray-100 flex flex-col gap-6">
                <h1 className="text-2xl font-bold mb-2">连接配置</h1>
                <div className="bg-white dark:bg-gray-900 p-4 md:p-8 rounded-xl shadow-sm border dark:border-gray-700 flex flex-col gap-4 max-w-[100vw] overflow-hidden">
                    <div className="flex flex-col gap-4 w-full">
                        <div className="w-full">
                            <label className="block text-sm font-medium mb-2">Supabase Project URL</label>
                            <input value={configUrl} onChange={(e) => setConfigUrl(e.target.value)} className="w-full rounded-lg border dark:border-gray-600 dark:bg-gray-800 p-3 outline-none dark:text-white break-all" />
                        </div>
                        <div className="w-full">
                            <label className="block text-sm font-medium mb-2">Supabase Anon Key</label>
                            <input 
                                type="password" 
                                value={configKey} 
                                onChange={(e) => setConfigKey(e.target.value)} 
                                onCopy={(e) => e.preventDefault()} 
                                className="w-full rounded-lg border dark:border-gray-600 dark:bg-gray-800 p-3 outline-none dark:text-white break-all select-none" 
                            />
                        </div>
                        
                        <div className="w-full">
                             <div className="flex justify-between items-center mb-2">
                                 <h3 className="font-bold text-sm">数据库初始化 SQL</h3>
                                 <button onClick={() => navigator.clipboard.writeText(sqlScript)} className="bg-blue-100 text-blue-700 px-2 py-1 text-xs rounded">复制 SQL</button>
                             </div>
                             <pre className="bg-black text-green-400 p-4 rounded h-40 overflow-auto text-xs font-mono w-full whitespace-pre-wrap break-all">{sqlScript}</pre>
                        </div>

                        <button onClick={handleSaveConfig} className="w-full bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 font-bold mt-2">保存配置</button>
                    </div>
                    {saved && <span className="text-green-600 font-bold text-center">已保存</span>}
                </div>
            </div>
        );
    }

    if (subPage === 'theme') {
        return (
            <div className="p-8 max-w-4xl mx-auto">
                 <h1 className="text-2xl font-bold mb-6 dark:text-white">应用主题</h1>
                 <div className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-sm border dark:border-gray-700 flex flex-col md:flex-row gap-4">
                     <button onClick={() => handleThemeClick('light')} className={`px-6 py-3 rounded-lg border font-bold ${currentTheme==='light' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'dark:text-white dark:border-gray-600'}`}>浅色 (Light)</button>
                     <button onClick={() => handleThemeClick('dark')} className={`px-6 py-3 rounded-lg border font-bold ${currentTheme==='dark' ? 'bg-gray-700 border-gray-500 text-white' : 'dark:text-white dark:border-gray-600'}`}>深色 (Dark)</button>
                 </div>
            </div>
        );
    }

    if (subPage === 'account') return <AccountSettings />;
    if (subPage === 'perms') return <PermissionsSettings />;
    
    return null;
};

const PermissionsSettings = () => {
    const currentUser = authService.getCurrentUser();
    const { getPermission } = usePermissionContext(); 
    const client = getSupabaseClient();

    // -- State for User List --
    const [subordinates, setSubordinates] = useState<User[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [userFormData, setUserFormData] = useState<Partial<User>>({});
    
    // -- State for Matrix --
    const [activeMatrixRole, setActiveMatrixRole] = useState<RoleLevel>(currentUser?.role_level || 0);
    const [matrixConfig, setMatrixConfig] = useState<RolePermissionRule | null>(null);

    // Initial Load
    useEffect(() => {
        loadUsers();
        fetchMatrixConfig(activeMatrixRole);
    }, [activeMatrixRole]);

    const loadUsers = async () => {
        if (!currentUser) return;
        const [users, allStores] = await Promise.all([dataService.getUsers(), dataService.getStores()]);
        
        const myPerms = getPermission(currentUser.role_level);
        let subs: User[] = [];
        
        if (myPerms.view_peers) {
             subs = users.filter(u => u.role_level >= currentUser.role_level);
        } else {
             subs = users.filter(u => u.role_level > currentUser.role_level);
        }
        
        // Show self logic
        if (!myPerms.view_self_in_list) {
            subs = subs.filter(u => u.id !== currentUser.id);
        } else {
            // Ensure self is in list if not already
            if (!subs.find(u => u.id === currentUser.id)) {
                const me = users.find(u => u.id === currentUser.id);
                if (me) subs.unshift(me);
            }
        }
        setSubordinates(subs);
        setStores(allStores);
    };

    const fetchMatrixConfig = async (role: RoleLevel) => {
        if (!client) return;
        const { data } = await client.from('role_permissions').select('*').eq('role_level', role).single();
        if (data) setMatrixConfig(data);
        else {
             // Fallback default
            setMatrixConfig({ ...DEFAULT_PERMISSIONS, role_level: role });
        }
    };

    // -- Matrix Handlers --
    const updateMatrix = async (updates: Partial<RolePermissionRule>) => {
        if (!client || !matrixConfig) return;
        const newConfig = { ...matrixConfig, ...updates };
        setMatrixConfig(newConfig); // Optimistic UI
        await client.from('role_permissions').upsert(newConfig);
    };

    // -- User Modal Handlers --
    const handleEditUser = (user: User | null) => {
        if (user) {
            // Logic: Can modify Self. Can Create Peer. Cannot Modify Peer (unless self).
            if (currentUser && user.role_level === currentUser.role_level && user.id !== currentUser.id) {
                alert("无权修改同级用户 (仅可查看/删除/新建)");
                return;
            }
            if (currentUser && user.role_level < currentUser.role_level) {
                 alert("无权修改上级用户");
                 return;
            }
            setEditingUser(user);
            setUserFormData(JSON.parse(JSON.stringify(user)));
        } else {
            // Create New
            const myPerms = getPermission(currentUser?.role_level || 0);
            setEditingUser(null);
            setUserFormData({
                username: '', password: '123', 
                role_level: (myPerms.view_peers ? currentUser?.role_level : (currentUser?.role_level || 0) + 1) as RoleLevel,
                allowed_store_ids: []
            });
        }
        setIsUserModalOpen(true);
    };

    const handleSaveUser = async () => {
        if (!userFormData.username) return alert("用户名必填");
        
        const inputLevel = Number(userFormData.role_level);
        const myLevel = currentUser?.role_level || 0;
        
        // Strict Demote Constraint
        if (inputLevel < myLevel) return alert("不能将用户等级设置高于您自己的等级");

        if (editingUser) {
             // Editing Existing
             // Cannot Promote (decrease level number below original)
             if (inputLevel < editingUser.role_level) return alert("权限等级只能往低修改 (数字变大，不可往高修改！");
        } 

        try {
            const { permissions, ...payload } = userFormData as any; 
            if (editingUser) await dataService.updateUser(editingUser.id, payload);
            else await dataService.createUser(payload);
            setIsUserModalOpen(false);
            loadUsers();
        } catch(e: any) { alert(e.message); }
    };

    const handleDeleteUser = async (u: User) => {
        if (currentUser && u.role_level < currentUser.role_level) return alert("无法删除上级用户");
        if(confirm("确定删除该用户？(软删除)")) { await dataService.deleteUser(u.id); loadUsers(); }
    };

    // -- Render --
    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto dark:text-gray-100 flex flex-col gap-8">
             
             {/* 1. PERMISSION MATRIX SECTION */}
             <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
                 <div className="flex justify-between items-center mb-6">
                     <h2 className="text-xl font-bold text-white">权限矩阵配置 (Global Policy)</h2>
                     <div className="flex gap-1 bg-gray-900 p-1 rounded-lg overflow-x-auto max-w-[50vw] custom-scrollbar">
                         {[0,1,2,3,4,5,6,7,8,9].map(lvl => (
                             <button 
                                key={lvl} 
                                onClick={() => setActiveMatrixRole(lvl as RoleLevel)}
                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeMatrixRole === lvl ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:bg-gray-700'}`}
                             >
                                 Lv.{lvl}
                             </button>
                         ))}
                     </div>
                 </div>

                 {matrixConfig && (
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
                         {/* Card 1: Log Permissions */}
                         <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                             <h3 className="font-bold text-white mb-3">日志权限 (Log Level)</h3>
                             <div className="space-y-2">
                                 {[
                                     { val: 'A', label: 'A级: 查看所有 + 任意撤销 (最高)' },
                                     { val: 'B', label: 'B级: 查看所有 + 仅撤销低等级' },
                                     { val: 'C', label: 'C级: 查看所有 + 仅撤销自己' },
                                     { val: 'D', label: 'D级: 仅查看自己 + 仅撤销自己' },
                                 ].map(opt => (
                                     <label key={opt.val} className={`flex items-center gap-2 cursor-pointer p-2 rounded ${matrixConfig.logs_level === opt.val ? 'bg-blue-900/30 border border-blue-800' : ''}`}>
                                         <input 
                                            type="radio" 
                                            name="logs_level" 
                                            checked={matrixConfig.logs_level === opt.val} 
                                            onChange={() => updateMatrix({ logs_level: opt.val as any })}
                                            className="accent-blue-500"
                                         />
                                         <span className={`text-sm ${matrixConfig.logs_level === opt.val ? 'text-blue-400 font-bold' : 'text-gray-400'}`}>{opt.label}</span>
                                     </label>
                                 ))}
                             </div>
                         </div>

                         {/* Card 2: Functional Scope */}
                         <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 space-y-6">
                             <div>
                                 <h3 className="font-bold text-white mb-3">公告权限</h3>
                                 <div className="flex gap-4">
                                     <label className="flex items-center gap-2 cursor-pointer">
                                         <input type="radio" checked={matrixConfig.announcement_rule === 'PUBLISH'} onChange={() => updateMatrix({ announcement_rule: 'PUBLISH' })} className="accent-blue-500"/>
                                         <span className="text-sm text-gray-300">发布 & 接收</span>
                                     </label>
                                     <label className="flex items-center gap-2 cursor-pointer">
                                         <input type="radio" checked={matrixConfig.announcement_rule === 'VIEW'} onChange={() => updateMatrix({ announcement_rule: 'VIEW' })} className="accent-blue-500"/>
                                         <span className="text-sm text-gray-300">仅接收</span>
                                     </label>
                                 </div>
                             </div>
                             <div>
                                 <h3 className="font-bold text-white mb-3">门店范围策略</h3>
                                 <div className="flex gap-4">
                                     <label className="flex items-center gap-2 cursor-pointer">
                                         <input type="radio" checked={matrixConfig.store_scope === 'GLOBAL'} onChange={() => updateMatrix({ store_scope: 'GLOBAL' })} className="accent-blue-500"/>
                                         <span className="text-sm text-gray-300">全局 (Global)</span>
                                     </label>
                                     <label className="flex items-center gap-2 cursor-pointer">
                                         <input type="radio" checked={matrixConfig.store_scope === 'LIMITED'} onChange={() => updateMatrix({ store_scope: 'LIMITED' })} className="accent-blue-500"/>
                                         <span className="text-sm text-gray-300">受限 (User Specified)</span>
                                     </label>
                                 </div>
                             </div>
                         </div>

                         {/* Card 3: Feature Flags */}
                         <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                             <h3 className="font-bold text-white mb-3">功能开关</h3>
                             <div className="grid grid-cols-1 gap-3">
                                 <label className="flex items-center gap-2 cursor-pointer">
                                     <input type="checkbox" checked={matrixConfig.show_excel} onChange={e => updateMatrix({ show_excel: e.target.checked })} className="w-4 h-4 accent-blue-500 rounded"/>
                                     <span className="text-sm text-gray-300">显示 Excel 导出</span>
                                 </label>
                                 <label className="flex items-center gap-2 cursor-pointer">
                                     <input type="checkbox" checked={matrixConfig.view_self_in_list} onChange={e => updateMatrix({ view_self_in_list: e.target.checked })} className="w-4 h-4 accent-blue-500 rounded"/>
                                     <span className="text-sm text-gray-300">列表显示自己 (Show Self)</span>
                                 </label>
                                 <label className="flex items-center gap-2 cursor-pointer">
                                     <input type="checkbox" checked={matrixConfig.view_peers} onChange={e => updateMatrix({ view_peers: e.target.checked })} className="w-4 h-4 accent-blue-500 rounded"/>
                                     <span className="text-sm text-gray-300">可见同级 (Visible Peers)</span>
                                 </label>
                                 <div className="h-px bg-gray-700 my-1"></div>
                                 <label className="flex items-center gap-2 cursor-pointer">
                                     <input type="checkbox" checked={matrixConfig.hide_perm_page} onChange={e => updateMatrix({ hide_perm_page: e.target.checked })} className="w-4 h-4 accent-red-500 rounded"/>
                                     <span className="text-sm text-gray-300">隐藏权限页</span>
                                 </label>
                                 <label className="flex items-center gap-2 cursor-pointer">
                                     <input type="checkbox" checked={matrixConfig.hide_audit_hall} onChange={e => updateMatrix({ hide_audit_hall: e.target.checked })} className="w-4 h-4 accent-red-500 rounded"/>
                                     <span className="text-sm text-gray-300">隐藏审计大厅</span>
                                 </label>
                                 <label className="flex items-center gap-2 cursor-pointer">
                                     <input type="checkbox" checked={matrixConfig.hide_store_management} onChange={e => updateMatrix({ hide_store_management: e.target.checked })} className="w-4 h-4 accent-red-500 rounded"/>
                                     <span className="text-sm text-gray-300">隐藏门店管理 (增删改)</span>
                                 </label>
                             </div>
                         </div>
                     </div>
                 )}
             </div>

             {/* 2. USER MANAGEMENT SECTION */}
             <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-6 shadow-sm">
                 <div className="flex justify-between items-center mb-6">
                     <h2 className="text-xl font-bold dark:text-white">用户管理</h2>
                     <button onClick={() => handleEditUser(null)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2">
                         <Icons.Plus size={20}/> 新增用户
                     </button>
                 </div>

                 <div className="overflow-x-auto">
                     <table className="w-full text-left min-w-[600px]">
                         <thead className="bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-700">
                             <tr>
                                 <th className="p-4">用户</th>
                                 <th className="p-4">等级</th>
                                 <th className="p-4">Matrix Log</th>
                                 <th className="p-4">门店范围</th>
                                 <th className="p-4 text-right">操作</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y dark:divide-gray-700">
                             {subordinates.map(u => {
                                 const p = getPermission(u.role_level);
                                 return (
                                     <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                         <td className="p-4"><UsernameBadge name={u.username} roleLevel={u.role_level} /></td>
                                         <td className="p-4"><span className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-xs font-mono">{u.role_level}</span></td>
                                         <td className="p-4"><span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded text-xs font-bold">{p.logs_level}级</span></td>
                                         <td className="p-4 text-sm text-gray-500 dark:text-gray-400">{p.store_scope === 'GLOBAL' ? '全局 (Global)' : `受限 (${u.allowed_store_ids.length})`}</td>
                                         <td className="p-4 text-right space-x-2">
                                             <button onClick={() => handleEditUser(u)} className="text-blue-600 font-bold hover:underline">编辑</button>
                                             <button onClick={() => handleDeleteUser(u)} className="text-red-600 font-bold hover:underline">删除</button>
                                         </td>
                                     </tr>
                                 );
                             })}
                         </tbody>
                     </table>
                 </div>
             </div>

             {/* USER MODAL */}
             {isUserModalOpen && (
                 <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                     <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-lg shadow-2xl flex flex-col">
                         <div className="p-6 border-b dark:border-gray-700 flex justify-between items-center">
                             <h2 className="text-xl font-bold dark:text-white">{editingUser ? '编辑用户' : '新增用户'}</h2>
                             <button onClick={() => setIsUserModalOpen(false)}><Icons.Minus size={24} className="dark:text-white"/></button>
                         </div>
                         <div className="p-6 space-y-4">
                             <div><label className="block text-sm font-bold mb-1 dark:text-gray-300">用户名</label><input value={userFormData.username} onChange={e => setUserFormData({...userFormData, username: e.target.value})} className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white"/></div>
                             <div><label className="block text-sm font-bold mb-1 dark:text-gray-300">密码</label><input value={userFormData.password} onChange={e => setUserFormData({...userFormData, password: e.target.value})} className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white"/></div>
                             <div>
                                 <label className="block text-sm font-bold mb-1 dark:text-gray-300">管理权限等级 (0-9)</label>
                                 <input 
                                     type="number" 
                                     min={currentUser?.role_level} 
                                     max="9" 
                                     value={userFormData.role_level} 
                                     onChange={e => setUserFormData({...userFormData, role_level: Number(e.target.value) as RoleLevel})} 
                                     className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                                 />
                                 <p className="text-xs text-red-400 mt-1">
                                     * 只能设置为 &gt;= {currentUser?.role_level} (您的等级)<br/>
                                     {editingUser && `* 编辑时只能调低等级 (数字变大，当前: ${editingUser.role_level})`}
                                 </p>
                             </div>
                             
                             {/* Limited Store Selection */}
                             {getPermission(userFormData.role_level as RoleLevel).store_scope === 'LIMITED' && (
                                 <div className="border rounded dark:border-gray-600 p-3">
                                     <h3 className="font-bold text-sm mb-2 dark:text-gray-300">门店分配 (受限模式)</h3>
                                     <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                                         {stores.map(s => (
                                             <label key={s.id} className="flex items-center gap-2 text-xs dark:text-gray-300">
                                                 <input 
                                                    type="checkbox" 
                                                    checked={userFormData.allowed_store_ids?.includes(s.id)}
                                                    onChange={e => {
                                                        const set = new Set(userFormData.allowed_store_ids);
                                                        if(e.target.checked) set.add(s.id); else set.delete(s.id);
                                                        setUserFormData({...userFormData, allowed_store_ids: Array.from(set)});
                                                    }}
                                                 />
                                                 {s.name}
                                             </label>
                                         ))}
                                     </div>
                                 </div>
                             )}
                         </div>
                         <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-end gap-3 rounded-b-xl">
                             <button onClick={() => setIsUserModalOpen(false)} className="px-4 py-2 text-gray-500 font-bold">取消</button>
                             <button onClick={handleSaveUser} className="px-6 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700">保存</button>
                         </div>
                     </div>
                 </div>
             )}
        </div>
    );
};

const FaceSetup = ({ user, onSuccess, onCancel }: any) => {
    // ... (Existing FaceSetup implementation kept same)
    const videoRef = useRef<HTMLVideoElement>(null);
    const [status, setStatus] = useState('初始化相机...');
    useEffect(() => {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
            .then(stream => { if(videoRef.current) videoRef.current.srcObject = stream; setStatus("请将脸部对准摄像头"); })
            .catch(err => setStatus("相机访问失败: " + err.message));
        return () => { if(videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop()); };
    }, []);
    const capture = async () => {
        if (!videoRef.current) return;
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
        await dataService.updateUser(user.id, { face_descriptor: canvas.toDataURL('image/jpeg', 0.8) });
        onSuccess();
    };
    return (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-sm flex flex-col items-center gap-4">
                <h3 className="font-bold text-lg dark:text-white">人脸识别设置</h3>
                <div className="w-64 h-64 bg-black rounded-full overflow-hidden border-4 border-blue-500 relative">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover"></video>
                </div>
                <p className="text-sm text-gray-500">{status}</p>
                <div className="flex gap-4 w-full"><button onClick={onCancel} className="flex-1 py-2 text-gray-500">取消</button><button onClick={capture} className="flex-1 py-2 bg-blue-600 text-white rounded font-bold">录入</button></div>
            </div>
        </div>
    );
};

const AccountSettings = () => {
    // ... (Existing AccountSettings implementation kept same but ensuring imports work)
    const user = authService.getCurrentUser();
    const [form, setForm] = useState({ username: '', password: '' });
    const [showPass, setShowPass] = useState(false);
    const [lowerUsers, setLowerUsers] = useState<User[]>([]);
    const [showFaceSetup, setShowFaceSetup] = useState(false);
    useEffect(() => {
        if (user) {
            setForm({ username: user.username, password: user.password || '' });
            dataService.getUsers().then(users => { setLowerUsers(users.filter(u => u.role_level > user.role_level)); });
        }
    }, []);
    const handleSave = async () => {
        if (!user) return;
        await dataService.updateUser(user.id, form);
        sessionStorage.setItem('sw_session_user', JSON.stringify({ ...user, ...form }));
        alert("保存成功"); window.location.reload();
    };
    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto dark:text-gray-100">
            {(user?.role_level === 0 || user?.role_level === 1) && (<div className="mb-6 flex justify-center"><SVIPBadge name={user?.username || ''} roleLevel={user?.role_level} className="w-full max-w-md shadow-2xl scale-110" /></div>)}
            <h1 className="text-2xl font-bold mb-6">账户设置</h1>
            <div className="grid md:grid-cols-2 gap-8">
                <div className="bg-white dark:bg-gray-900 p-6 md:p-8 rounded-xl shadow-sm border dark:border-gray-700 space-y-6 w-full">
                    <h3 className="font-bold border-b pb-2 dark:border-gray-700">基本信息</h3>
                    <div><label className="block text-sm font-bold text-gray-500 uppercase mb-1">ID</label><div className="bg-gray-100 dark:bg-gray-800 p-2 rounded text-xs text-gray-500 font-mono">{user?.id}</div></div>
                    <div><label className="block text-sm font-bold mb-1">用户名</label><input value={form.username} onChange={e => setForm({...form, username: e.target.value})} className="w-full border p-3 rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white"/></div>
                    <div><label className="block text-sm font-bold mb-1">密码</label><div className="relative"><input type={showPass?"text":"password"} value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="w-full border p-3 rounded dark:bg-gray-800 dark:border-gray-600"/><button onClick={()=>setShowPass(!showPass)} className="absolute right-3 top-3 text-gray-400">👁</button></div></div>
                    <button onClick={()=>setShowFaceSetup(true)} className={`w-full py-3 rounded font-bold border ${user?.face_descriptor?'border-green-500 text-green-600 bg-green-50':'border-gray-300 text-gray-600'}`}>{user?.face_descriptor?'重录人脸':'设置人脸'}</button>
                    <button onClick={handleSave} className="w-full py-3 rounded font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-md">保存变更</button>
                    <button onClick={() => {if(confirm("退出?")) authService.logout();}} className="w-full py-3 rounded font-bold border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-900/20">退出</button>
                </div>
                <div className="bg-white dark:bg-gray-900 p-6 md:p-8 rounded-xl shadow-sm border dark:border-gray-700 h-fit w-full">
                     <h3 className="font-bold border-b pb-2 dark:border-gray-700 mb-4">快速切换</h3>
                     <div className="max-h-60 overflow-y-auto custom-scrollbar border rounded dark:border-gray-700">
                         {lowerUsers.map(u => (<button key={u.id} onClick={() => authService.switchAccount(u)} className="w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-800 border-b dark:border-gray-800 flex justify-between items-center"><UsernameBadge name={u.username} roleLevel={u.role_level} /><span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">Lv.{u.role_level}</span></button>))}
                     </div>
                </div>
            </div>
            {showFaceSetup && <FaceSetup user={user} onSuccess={()=>{setShowFaceSetup(false); alert("成功"); window.location.reload();}} onCancel={()=>setShowFaceSetup(false)} />}
        </div>
    );
};
