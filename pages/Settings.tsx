


import React, { useState, useEffect, useRef } from 'react';
import { getSupabaseConfig, saveSupabaseConfig, getSupabaseClient } from '../services/supabaseClient';
import { authService, DEFAULT_PERMISSIONS } from '../services/authService';
import { dataService } from '../services/dataService';
import { User, Store, UserPermissions, RoleLevel } from '../types';
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
    
    // UPDATED SQL SCRIPT FOR USER-CENTRIC PERMISSIONS
    const sqlScript = `
-- PRISM (STOCKWISE) V3.3.0 SQL
-- 确保 pgcrypto 扩展存在
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ 
BEGIN 
    -- 1. 字段添加
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='logs_level') THEN ALTER TABLE users ADD COLUMN logs_level text DEFAULT 'D'; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='announcement_rule') THEN ALTER TABLE users ADD COLUMN announcement_rule text DEFAULT 'VIEW'; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='store_scope') THEN ALTER TABLE users ADD COLUMN store_scope text DEFAULT 'LIMITED'; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='allowed_store_ids') THEN ALTER TABLE users ADD COLUMN allowed_store_ids text[] DEFAULT '{}'; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='show_excel') THEN ALTER TABLE users ADD COLUMN show_excel boolean DEFAULT false; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='view_peers') THEN ALTER TABLE users ADD COLUMN view_peers boolean DEFAULT false; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='view_self_in_list') THEN ALTER TABLE users ADD COLUMN view_self_in_list boolean DEFAULT true; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='hide_perm_page') THEN ALTER TABLE users ADD COLUMN hide_perm_page boolean DEFAULT true; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='hide_audit_hall') THEN ALTER TABLE users ADD COLUMN hide_audit_hall boolean DEFAULT true; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='hide_store_management') THEN ALTER TABLE users ADD COLUMN hide_store_management boolean DEFAULT true; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='only_view_config') THEN ALTER TABLE users ADD COLUMN only_view_config boolean DEFAULT false; END IF;
    
    -- 删除旧 JSON 字段
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='permissions') THEN ALTER TABLE users DROP COLUMN permissions; END IF;

    -- 2. 视图更新
    DROP VIEW IF EXISTS live_users_v;
    CREATE VIEW live_users_v AS SELECT u.* FROM users u;

    -- 3. Realtime
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'users') THEN ALTER PUBLICATION supabase_realtime ADD TABLE users; END IF;

    -- 4. 建表
    CREATE TABLE IF NOT EXISTS stores (id text PRIMARY KEY, name text, location text, is_archived boolean default false);

END $$;
`;

    if (subPage === 'config') {
        return (
            <div className="p-4 md:p-8 max-w-4xl mx-auto dark:text-gray-100 flex flex-col gap-6 animate-fade-in">
                <h1 className="text-2xl font-bold mb-2">连接配置</h1>
                <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg p-6 md:p-8 rounded-2xl shadow-xl border border-white/20 dark:border-gray-700 flex flex-col gap-6 max-w-[100vw]">
                    <div className="flex flex-col gap-4 w-full">
                        <div className="w-full">
                            <label className="block text-sm font-bold mb-2 text-gray-500">Supabase Project URL</label>
                            <input value={configUrl} onChange={(e) => setConfigUrl(e.target.value)} className="w-full rounded-xl border-0 bg-gray-100 dark:bg-gray-700 p-4 outline-none dark:text-white focus:ring-2 focus:ring-blue-500 transition-all font-mono text-sm break-all" />
                        </div>
                        <div className="w-full">
                            <label className="block text-sm font-bold mb-2 text-gray-500">Supabase Anon Key</label>
                            <input 
                                type="password" 
                                value={configKey} 
                                onChange={(e) => setConfigKey(e.target.value)} 
                                onCopy={(e) => e.preventDefault()} 
                                className="w-full rounded-xl border-0 bg-gray-100 dark:bg-gray-700 p-4 outline-none dark:text-white focus:ring-2 focus:ring-blue-500 transition-all font-mono text-sm break-all" 
                            />
                        </div>
                        
                        <div className="w-full">
                             <div className="flex justify-between items-center mb-2">
                                 <h3 className="font-bold text-sm text-gray-500">数据库初始化 SQL</h3>
                                 <button onClick={() => navigator.clipboard.writeText(sqlScript)} className="bg-blue-100 text-blue-700 px-3 py-1 text-xs rounded-full font-bold">复制 SQL</button>
                             </div>
                             <pre className="bg-gray-900 text-green-400 p-4 rounded-xl h-40 overflow-auto text-xs font-mono w-full whitespace-pre-wrap break-all shadow-inner">{sqlScript}</pre>
                        </div>

                        <button onClick={handleSaveConfig} className="w-full bg-blue-600 text-white px-8 py-4 rounded-xl hover:bg-blue-700 font-bold mt-2 shadow-lg shadow-blue-500/30 btn-press">保存配置 & 重启</button>
                    </div>
                    {saved && <span className="text-green-600 font-bold text-center animate-scale-in">✓ 已保存</span>}
                </div>
            </div>
        );
    }

    if (subPage === 'theme') {
        return (
            <div className="p-8 max-w-4xl mx-auto animate-fade-in">
                 <h1 className="text-2xl font-bold mb-6 dark:text-white">应用主题</h1>
                 <div className="bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-sm border dark:border-gray-700 flex flex-col md:flex-row gap-4">
                     <button onClick={() => handleThemeClick('light')} className={`px-6 py-4 rounded-xl border-2 font-bold transition-all ${currentTheme==='light' ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-md transform scale-105' : 'dark:text-white dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>🌞 浅色 (Light)</button>
                     <button onClick={() => handleThemeClick('dark')} className={`px-6 py-4 rounded-xl border-2 font-bold transition-all ${currentTheme==='dark' ? 'bg-gray-800 border-gray-500 text-white shadow-md transform scale-105' : 'dark:text-white dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>🌙 深色 (Dark)</button>
                 </div>
            </div>
        );
    }

    if (subPage === 'account') return <AccountSettings />;
    if (subPage === 'perms') return <PermissionsSettings />;
    
    return null;
};

// ... PermissionMatrix and Helper Components ...
const PermissionMatrix: React.FC<any> = ({ userId, initialUser, stores, onLocalChange }) => {
    const [localPerms, setLocalPerms] = useState<Partial<User>>(userId ? {} : initialUser);
    const [loading, setLoading] = useState(!!userId);

    useEffect(() => {
        let active = true;
        if (userId) {
            setLoading(true);
            dataService.getUser(userId).then(freshUser => {
                if (active) {
                    if (freshUser) setLocalPerms(freshUser);
                    setLoading(false);
                }
            }).catch(() => { if (active) setLoading(false); });
        } else {
             setLocalPerms(initialUser);
             setLoading(false);
        }
        return () => { active = false; };
    }, [userId]); 

    const handleUpdate = async (field: keyof User, value: any) => {
        const newState = { ...localPerms, [field]: value };
        setLocalPerms(newState);
        if (userId) {
            try { await dataService.updateUser(userId, { [field]: value }); } 
            catch (error: any) { alert(`保存失败: ${error.message}`); setLocalPerms(prev => ({ ...prev, [field]: localPerms[field] })); }
        } else {
            if (onLocalChange) onLocalChange(field as string, value);
        }
    };

    if (loading) return <div className="p-12 text-center text-gray-500">同步中...</div>;

    return (
        <div className="space-y-4 animate-fade-in">
            <h3 className="font-bold text-lg dark:text-white flex justify-between items-center">
                <span>权限矩阵</span>
                <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${userId ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{userId ? '● 实时同步' : '● 待提交'}</span>
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700">
                    <h3 className="font-bold dark:text-white mb-3 text-sm">日志 (Log Level)</h3>
                    <div className="flex flex-col gap-2">
                        {[{val:'A',label:'A (全部)'},{val:'B',label:'B (级联)'},{val:'C',label:'C (仅己)'},{val:'D',label:'D (受限)'}].map(opt => (
                            <label key={opt.val} className={`flex items-center gap-3 cursor-pointer p-2.5 rounded-xl transition-all ${localPerms.logs_level === opt.val ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                                <input type="radio" name="logs_level" checked={localPerms.logs_level === opt.val} onChange={() => handleUpdate('logs_level', opt.val)} className="hidden"/>
                                <span className="font-bold text-sm">{opt.label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700 space-y-4">
                    <div>
                        <h3 className="font-bold dark:text-white mb-2 text-sm">公告</h3>
                        <div className="flex gap-2">
                            {['PUBLISH','VIEW'].map(v => (
                                <button key={v} onClick={()=>handleUpdate('announcement_rule', v)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${localPerms.announcement_rule===v?'bg-blue-600 text-white shadow-md':'bg-white dark:bg-gray-700 text-gray-500'}`}>{v==='PUBLISH'?'发布':'接收'}</button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <h3 className="font-bold dark:text-white mb-2 text-sm">门店范围</h3>
                        <div className="flex gap-2 mb-2">
                             {['GLOBAL','LIMITED'].map(v => (
                                <button key={v} onClick={()=>handleUpdate('store_scope', v)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${localPerms.store_scope===v?'bg-blue-600 text-white shadow-md':'bg-white dark:bg-gray-700 text-gray-500'}`}>{v==='GLOBAL'?'全局':'受限'}</button>
                            ))}
                        </div>
                        {localPerms.store_scope === 'LIMITED' && (
                            <div className="bg-white dark:bg-gray-700 p-3 rounded-xl max-h-32 overflow-y-auto custom-scrollbar border dark:border-gray-600">
                                {stores.map((s:any) => (
                                    <label key={s.id} className="flex items-center gap-2 text-xs dark:text-gray-200 py-1 cursor-pointer">
                                        <input type="checkbox" checked={localPerms.allowed_store_ids?.includes(s.id)} onChange={e => {
                                               const set = new Set<string>(localPerms.allowed_store_ids || []);
                                               if(e.target.checked) set.add(s.id); else set.delete(s.id);
                                               handleUpdate('allowed_store_ids', Array.from(set));
                                           }} className="accent-blue-500 rounded-sm"/>
                                        {s.name}
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700">
                    <h3 className="font-bold dark:text-white mb-3 text-sm">开关 (Flags)</h3>
                    <div className="space-y-2">
                        <ToggleRow label="Excel 导出" checked={!!localPerms.show_excel} onChange={(v:any) => handleUpdate('show_excel', v)} />
                        <ToggleRow label="列表显示自己" checked={!!localPerms.view_self_in_list} onChange={(v:any) => handleUpdate('view_self_in_list', v)} />
                        <ToggleRow label="可见同级" checked={!!localPerms.view_peers} onChange={(v:any) => handleUpdate('view_peers', v)} />
                        <div className="h-px bg-gray-200 dark:bg-gray-700 my-2"></div>
                        <ToggleRow label="隐藏权限页" checked={!!localPerms.hide_perm_page} onChange={(v:any) => handleUpdate('hide_perm_page', v)} danger />
                        <ToggleRow label="隐藏审计厅" checked={!!localPerms.hide_audit_hall} onChange={(v:any) => handleUpdate('hide_audit_hall', v)} danger />
                        <ToggleRow label="隐藏门店管理" checked={!!localPerms.hide_store_management} onChange={(v:any) => handleUpdate('hide_store_management', v)} danger />
                        <ToggleRow label="仅显示配置" checked={!!localPerms.only_view_config} onChange={(v:any) => handleUpdate('only_view_config', v)} danger />
                    </div>
                </div>
            </div>
        </div>
    );
};

const ToggleRow = ({ label, checked, onChange, danger }: any) => (
    <div onClick={() => onChange(!checked)} className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors ${checked ? (danger ? 'bg-red-50 dark:bg-red-900/30' : 'bg-blue-50 dark:bg-blue-900/30') : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
        <span className={`text-xs font-bold ${danger ? (checked ? 'text-red-600' : 'text-gray-500') : (checked ? 'text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400')}`}>{label}</span>
        <div className={`w-8 h-4 rounded-full relative transition-colors ${checked ? (danger ? 'bg-red-500' : 'bg-blue-500') : 'bg-gray-300 dark:bg-gray-600'}`}>
            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-transform duration-200 ${checked ? 'left-4.5 translate-x-0' : 'left-0.5'}`}></div>
        </div>
    </div>
);

const PermissionsSettings = () => {
    const currentUser = authService.getCurrentUser();
    const { currentUserPermissions } = usePermissionContext(); 
    const [subordinates, setSubordinates] = useState<User[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [userFormData, setUserFormData] = useState<Partial<User>>({});
    
    useEffect(() => { loadUsers(); }, []);

    const loadUsers = async () => {
        if (!currentUser) return;
        const [users, allStores] = await Promise.all([dataService.getUsers(), dataService.getStores()]);
        let subs = currentUserPermissions.view_peers ? users.filter(u => u.role_level >= currentUser.role_level) : users.filter(u => u.role_level > currentUser.role_level);
        if (!currentUserPermissions.view_self_in_list) subs = subs.filter(u => u.id !== currentUser.id);
        else if (!subs.find(u => u.id === currentUser.id)) { const me = users.find(u => u.id === currentUser.id); if (me) subs.unshift(me); }
        setSubordinates(subs);
        setStores(allStores);
    };

    const handleEditUser = (user: User | null) => {
        if (user && currentUser && user.role_level === currentUser.role_level && user.id !== currentUser.id && currentUser.role_level !== 0) return alert("无权修改同级用户");
        if (user && currentUser && user.role_level < currentUser.role_level) return alert("无权修改上级用户");
        
        setEditingUser(user);
        setUserFormData(user ? { ...user } : {
            username: '', password: '123', role_level: (currentUserPermissions.view_peers ? currentUser?.role_level : (currentUser?.role_level || 0) + 1) as RoleLevel, allowed_store_ids: [],
            logs_level: 'D', announcement_rule: 'VIEW', store_scope: 'LIMITED', show_excel: false, view_peers: false, view_self_in_list: true, hide_perm_page: true, hide_audit_hall: true, hide_store_management: true, only_view_config: false
        });
        setIsUserModalOpen(true);
    };

    const handleSaveUser = async () => {
        if (!userFormData.username) return alert("用户名必填");
        if (editingUser) await dataService.updateUser(editingUser.id, { username: userFormData.username, password: userFormData.password, role_level: userFormData.role_level });
        else await dataService.createUser(userFormData as any);
        setIsUserModalOpen(false);
        loadUsers();
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto dark:text-gray-100 flex flex-col gap-8 animate-fade-in">
             <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6 shadow-sm">
                 <div className="flex justify-between items-center mb-6">
                     <h2 className="text-xl font-bold dark:text-white">用户管理</h2>
                     <button onClick={() => handleEditUser(null)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 btn-press shadow-lg shadow-blue-500/30">
                         <Icons.Plus size={20}/> 新增
                     </button>
                 </div>

                 {/* DESKTOP TABLE */}
                 <div className="hidden md:block overflow-x-auto">
                     <table className="w-full text-left min-w-[600px]">
                         <thead className="bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-700 text-gray-500">
                             <tr><th className="p-4">用户</th><th className="p-4">等级</th><th className="p-4">日志权限</th><th className="p-4">范围</th><th className="p-4 text-right">操作</th></tr>
                         </thead>
                         <tbody className="divide-y dark:divide-gray-700">
                             {subordinates.map(u => (
                                 <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                     <td className="p-4"><UsernameBadge name={u.username} roleLevel={u.role_level} /></td>
                                     <td className="p-4"><span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs font-mono">{u.role_level}</span></td>
                                     <td className="p-4"><span className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-2 py-1 rounded text-xs font-bold">{u.permissions.logs_level}</span></td>
                                     <td className="p-4 text-xs text-gray-500">{u.permissions.store_scope}</td>
                                     <td className="p-4 text-right space-x-2">
                                         <button onClick={() => handleEditUser(u)} className="text-blue-600 font-bold hover:underline">编辑</button>
                                         <button onClick={async () => {if(confirm("删除?")) {await dataService.deleteUser(u.id); loadUsers();}}} className="text-red-600 font-bold hover:underline">删除</button>
                                     </td>
                                 </tr>
                             ))}
                         </tbody>
                     </table>
                 </div>

                 {/* MOBILE CARDS VIEW */}
                 <div className="md:hidden grid grid-cols-1 gap-4">
                     {subordinates.map(u => (
                         <div key={u.id} className="bg-white dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700 shadow-sm flex flex-col gap-3">
                             <div className="flex justify-between items-center">
                                 <UsernameBadge name={u.username} roleLevel={u.role_level} />
                                 <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs font-mono dark:text-white">Lv.{u.role_level}</span>
                             </div>
                             <div className="flex gap-2 text-xs">
                                 <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-2 py-1 rounded">Log: {u.permissions.logs_level}</span>
                                 <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-1 rounded">{u.permissions.store_scope}</span>
                             </div>
                             <div className="flex gap-2 mt-1">
                                 <button onClick={() => handleEditUser(u)} className="flex-1 py-2 bg-blue-50 dark:bg-gray-700 text-blue-600 dark:text-blue-300 rounded-xl font-bold text-xs">编辑</button>
                                 <button onClick={async () => {if(confirm("删除?")) {await dataService.deleteUser(u.id); loadUsers();}}} className="flex-1 py-2 bg-red-50 dark:bg-gray-700 text-red-600 dark:text-red-400 rounded-xl font-bold text-xs">删除</button>
                             </div>
                         </div>
                     ))}
                 </div>
             </div>

             {/* USER MODAL */}
             {isUserModalOpen && (
                 <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                     <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] animate-scale-in">
                         <div className="p-6 border-b dark:border-gray-700 flex justify-between items-center shrink-0">
                             <h2 className="text-xl font-bold dark:text-white">{editingUser ? '编辑用户' : '新增用户'}</h2>
                             <button onClick={() => setIsUserModalOpen(false)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full"><Icons.Minus size={20} className="dark:text-white"/></button>
                         </div>
                         <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                 <div><label className="text-xs font-bold text-gray-400 mb-1 block">用户名</label><input value={userFormData.username} onChange={e => setUserFormData({...userFormData, username: e.target.value})} className="w-full border-0 bg-gray-100 dark:bg-gray-800 p-3 rounded-xl outline-none dark:text-white"/></div>
                                 <div><label className="text-xs font-bold text-gray-400 mb-1 block">密码</label><input value={userFormData.password} onChange={e => setUserFormData({...userFormData, password: e.target.value})} className="w-full border-0 bg-gray-100 dark:bg-gray-800 p-3 rounded-xl outline-none dark:text-white"/></div>
                                 <div><label className="text-xs font-bold text-gray-400 mb-1 block">等级 (数字越小权限越大)</label><input type="number" value={userFormData.role_level} onChange={e => setUserFormData({...userFormData, role_level: Number(e.target.value) as RoleLevel})} className="w-full border-0 bg-gray-100 dark:bg-gray-800 p-3 rounded-xl outline-none dark:text-white font-mono"/></div>
                             </div>
                             <PermissionMatrix key={editingUser ? editingUser.id : 'new'} userId={editingUser?.id} initialUser={editingUser ? {} : userFormData} stores={stores} onLocalChange={(k:any,v:any)=>setUserFormData(p=>({...p,[k]:v}))} />
                         </div>
                         <div className="p-4 border-t dark:border-gray-700 flex justify-end gap-3 shrink-0">
                             <button onClick={() => setIsUserModalOpen(false)} className="px-6 py-3 text-gray-500 font-bold rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">取消</button>
                             <button onClick={handleSaveUser} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-xl shadow-blue-500/30 hover:bg-blue-700 btn-press">保存</button>
                         </div>
                     </div>
                 </div>
             )}
        </div>
    );
};

const FaceSetup = ({ user, onSuccess, onCancel }: any) => {
    // Face Setup Logic Remains mostly same, simplified for UI
    const videoRef = useRef<HTMLVideoElement>(null);
    useEffect(() => { navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }).then(s => { if(videoRef.current) videoRef.current.srcObject = s; }); }, []);
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
            <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm flex flex-col items-center gap-6 animate-scale-in">
                <div className="w-64 h-64 bg-black rounded-full overflow-hidden border-4 border-blue-500 shadow-2xl relative"><video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover"></video></div>
                <div className="flex gap-4 w-full"><button onClick={onCancel} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-gray-600">取消</button><button onClick={capture} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg">拍摄并保存</button></div>
            </div>
        </div>
    );
};

const AccountSettings = () => {
    // Basic Account Settings UI...
    const user = authService.getCurrentUser();
    const [form, setForm] = useState({ username: '', password: '' });
    const [lowerUsers, setLowerUsers] = useState<User[]>([]);
    const [showFace, setShowFace] = useState(false);
    useEffect(() => { if(user){ setForm({username:user.username, password:user.password||''}); dataService.getUsers().then(u=>setLowerUsers(u.filter(x=>x.role_level>user.role_level))); } }, []);
    const handleSave = async () => { if(!user)return; await dataService.updateUser(user.id, form); alert("保存成功"); window.location.reload(); };
    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto dark:text-gray-100 animate-fade-in">
            <div className="grid md:grid-cols-2 gap-8">
                <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-sm border dark:border-gray-700 space-y-6">
                    <h3 className="font-bold text-xl">我的账户</h3>
                    <input value={form.username} onChange={e=>setForm({...form,username:e.target.value})} className="w-full bg-gray-100 dark:bg-gray-800 p-4 rounded-xl outline-none" placeholder="用户名"/>
                    <input value={form.password} onChange={e=>setForm({...form,password:e.target.value})} className="w-full bg-gray-100 dark:bg-gray-800 p-4 rounded-xl outline-none" placeholder="密码" type="password"/>
                    <button onClick={()=>setShowFace(true)} className={`w-full py-4 rounded-xl font-bold border-2 ${user?.face_descriptor?'border-green-500 text-green-600':'border-gray-200 text-gray-500'}`}>{user?.face_descriptor?'重置人脸':'录入人脸'}</button>
                    <button onClick={handleSave} className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold shadow-lg btn-press">保存修改</button>
                    <button onClick={()=>{authService.logout();}} className="w-full py-4 bg-red-50 text-red-600 rounded-xl font-bold">退出登录</button>
                </div>
                <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-sm border dark:border-gray-700">
                     <h3 className="font-bold text-xl mb-4">快速切换</h3>
                     <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
                         {lowerUsers.map(u => <button key={u.id} onClick={()=>authService.switchAccount(u)} className="w-full flex justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl"><UsernameBadge name={u.username} roleLevel={u.role_level} /><span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">Lv.{u.role_level}</span></button>)}
                     </div>
                </div>
            </div>
            {showFace && <FaceSetup user={user} onSuccess={()=>{setShowFace(false); alert("录入成功");}} onCancel={()=>setShowFace(false)} />}
        </div>
    );
};