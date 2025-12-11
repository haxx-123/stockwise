
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

    if (subPage === 'config') {
        return (
            <div className="p-4 md:p-8 max-w-4xl mx-auto dark:text-gray-100 flex flex-col gap-6 animate-fade-in-up">
                <h1 className="text-3xl font-black mb-2 tracking-tight">连接配置</h1>
                <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl shadow-lg border border-gray-100 dark:border-gray-700 flex flex-col gap-6">
                    <div className="flex flex-col gap-4 w-full">
                        <div className="w-full">
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Supabase Project URL</label>
                            <input value={configUrl} onChange={(e) => setConfigUrl(e.target.value)} className="w-full rounded-2xl bg-gray-50 dark:bg-gray-900 border-0 p-4 outline-none dark:text-white focus:ring-2 focus:ring-blue-500 transition-shadow" />
                        </div>
                        <div className="w-full">
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Supabase Anon Key</label>
                            <input 
                                type="password" 
                                value={configKey} 
                                onChange={(e) => setConfigKey(e.target.value)} 
                                className="w-full rounded-2xl bg-gray-50 dark:bg-gray-900 border-0 p-4 outline-none dark:text-white focus:ring-2 focus:ring-blue-500 transition-shadow" 
                            />
                        </div>
                        <button onClick={handleSaveConfig} className="w-full bg-blue-600 text-white px-8 py-4 rounded-2xl hover:bg-blue-700 font-bold mt-4 shadow-xl shadow-blue-500/30 transition-transform active:scale-95">保存配置</button>
                    </div>
                </div>
            </div>
        );
    }

    if (subPage === 'theme') {
        return (
            <div className="p-8 max-w-4xl mx-auto animate-fade-in-up">
                 <h1 className="text-3xl font-black mb-8 dark:text-white">应用主题</h1>
                 <div className="grid grid-cols-2 gap-6">
                     <button onClick={() => handleThemeClick('light')} className={`h-40 rounded-3xl border-4 font-bold text-xl flex flex-col items-center justify-center transition-all ${currentTheme==='light' ? 'bg-white border-blue-500 text-blue-600 shadow-xl scale-105' : 'bg-gray-100 border-transparent text-gray-400'}`}>
                         <span>☀️ 浅色</span>
                     </button>
                     <button onClick={() => handleThemeClick('dark')} className={`h-40 rounded-3xl border-4 font-bold text-xl flex flex-col items-center justify-center transition-all ${currentTheme==='dark' ? 'bg-gray-800 border-blue-500 text-white shadow-xl scale-105' : 'bg-gray-200 border-transparent text-gray-500'}`}>
                         <span>🌙 深色</span>
                     </button>
                 </div>
            </div>
        );
    }

    if (subPage === 'account') return <AccountSettings />;
    if (subPage === 'perms') return <PermissionsSettings />;
    
    return null;
};

// --- REFACTORED PERMISSION MATRIX (ISOLATED & REACTIVE) ---
interface PermissionMatrixProps { userId?: string; initialUser: Partial<User>; stores: Store[]; onLocalChange?: (field: string, val: any) => void; }

const PermissionMatrix: React.FC<PermissionMatrixProps> = ({ userId, initialUser, stores, onLocalChange }) => {
    // Independent State for this specific user
    const [localPerms, setLocalPerms] = useState<Partial<User>>(initialUser);
    const [loading, setLoading] = useState(!!userId);

    // CRITICAL: Fetch FRESH data on mount if userId exists (Edit Mode)
    useEffect(() => {
        let active = true;
        if (userId) {
            setLoading(true);
            dataService.getUser(userId).then(freshUser => {
                if (active) { 
                    if (freshUser) {
                        console.log("PermissionMatrix: Loaded Fresh Data for", userId);
                        setLocalPerms(freshUser); 
                    }
                    setLoading(false); 
                }
            });
        } else {
            // Create Mode: Use passed initial data
            setLocalPerms(initialUser);
            setLoading(false);
        }
        return () => { active = false; };
    }, [userId]); 

    // Optimistic Update Handler
    const handleUpdate = async (field: keyof User, value: any) => {
        console.log(`[PermissionMatrix] Updating ${field} to`, value);
        
        // 1. Optimistic Update (Immediate UI Feedback)
        setLocalPerms(prev => ({ ...prev, [field]: value }));

        // 2. Background Sync (If editing existing user)
        if (userId) {
            try {
                // IMPORTANT: Send the raw field update. dataService handles mapping if needed, 
                // but since we are updating flat fields (like show_excel), we pass them directly.
                // However, dataService.updateUser expects the User structure.
                // We construct a payload that matches what dataService.updateUser expects.
                await dataService.updateUser(userId, { [field]: value });
            } catch (e) {
                console.error("Failed to sync permission:", e);
                // Revert on failure (optional but recommended for robust optimistic UI)
                // For now, keeping it simple as per request to avoid complexity overhead
            }
        } else {
            // Create Mode: Notify parent
            if (onLocalChange) onLocalChange(field as string, value);
        }
    };

    const toggleAllowedStore = async (storeId: string) => {
        const currentList = localPerms.allowed_store_ids || [];
        const newList = currentList.includes(storeId) 
            ? currentList.filter(id => id !== storeId)
            : [...currentList, storeId];
        
        handleUpdate('allowed_store_ids', newList);
    };

    if (loading) return <div className="p-8 text-center text-gray-400 flex flex-col items-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-2"></div>正在获取实时权限...</div>;

    return (
        <div className="space-y-6 animate-fade-in">
             <div className="bg-yellow-50 dark:bg-yellow-900/10 p-3 rounded-xl border border-yellow-200 dark:border-yellow-800 flex items-center gap-2 mb-4">
                 <Icons.Sparkles size={16} className="text-yellow-600 dark:text-yellow-400"/>
                 <span className="text-xs text-yellow-800 dark:text-yellow-300 font-bold">即时生效模式: 您的修改会自动保存到当前用户。</span>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 {/* 1. Log Levels */}
                 <div className="bg-gray-50 dark:bg-gray-800 p-5 rounded-3xl border border-gray-100 dark:border-gray-700">
                     <h4 className="font-bold mb-4 flex items-center gap-2 dark:text-white"><Icons.Sparkles size={18} className="text-blue-500"/> 日志级别</h4>
                     <div className="space-y-2">
                         {['A','B','C','D'].map((lvl) => (
                             <label key={lvl} className={`block p-3 rounded-xl cursor-pointer transition-all border-2 ${localPerms.logs_level === lvl ? 'bg-white dark:bg-gray-700 border-blue-500 shadow-md transform scale-[1.02]' : 'border-transparent hover:bg-white dark:hover:bg-gray-700'}`}>
                                 <div className="flex items-center gap-3">
                                     <input type="radio" checked={localPerms.logs_level===lvl} onChange={()=>handleUpdate('logs_level', lvl)} className="accent-blue-600 w-5 h-5"/>
                                     <span className="font-bold dark:text-white">{lvl}级权限</span>
                                 </div>
                             </label>
                         ))}
                     </div>
                 </div>

                 {/* 2. Feature Toggles */}
                 <div className="bg-gray-50 dark:bg-gray-800 p-5 rounded-3xl border border-gray-100 dark:border-gray-700">
                     <h4 className="font-bold mb-4 dark:text-white">功能开关</h4>
                     <div className="space-y-3">
                         {[
                             {k:'show_excel', l:'Excel 导出'}, {k:'view_peers', l:'查看同级'}, {k:'view_self_in_list', l:'列表显示自己'},
                             {k:'hide_perm_page', l:'隐藏权限页', danger:true}, {k:'hide_store_management', l:'隐藏门店管理', danger:true}
                         ].map((item:any) => (
                             <label key={item.k} className="flex justify-between items-center p-2 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-lg transition-colors">
                                 <span className={`text-sm font-bold ${item.danger?'text-red-500':'text-gray-600 dark:text-gray-300'}`}>{item.l}</span>
                                 <div className="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in">
                                     <input type="checkbox" checked={!!(localPerms as any)[item.k]} onChange={e=>handleUpdate(item.k as keyof User, e.target.checked)} className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer transition-transform duration-200 ease-in-out checked:translate-x-full checked:border-blue-500 border-gray-300"/>
                                     <span className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer transition-colors duration-200 ${!!(localPerms as any)[item.k] ? (item.danger ? 'bg-red-200' : 'bg-blue-200') : 'bg-gray-300'}`}></span>
                                 </div>
                             </label>
                         ))}
                     </div>
                 </div>

                 {/* 3. Store Scope */}
                 <div className="bg-gray-50 dark:bg-gray-800 p-5 rounded-3xl border border-gray-100 dark:border-gray-700">
                     <h4 className="font-bold mb-4 dark:text-white">门店范围</h4>
                     <div className="flex bg-gray-200 dark:bg-gray-700 rounded-xl p-1 mb-4">
                         <button onClick={()=>handleUpdate('store_scope', 'GLOBAL')} className={`flex-1 py-2 rounded-lg font-bold text-xs transition-all ${localPerms.store_scope==='GLOBAL' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>全门店</button>
                         <button onClick={()=>handleUpdate('store_scope', 'LIMITED')} className={`flex-1 py-2 rounded-lg font-bold text-xs transition-all ${localPerms.store_scope==='LIMITED' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>指定门店</button>
                     </div>
                     
                     {localPerms.store_scope === 'LIMITED' && (
                         <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar bg-white dark:bg-gray-900 p-2 rounded-xl border dark:border-gray-600">
                             {stores.map(s => (
                                 <label key={s.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer">
                                     <input type="checkbox" checked={(localPerms.allowed_store_ids || []).includes(s.id)} onChange={()=>toggleAllowedStore(s.id)} className="w-5 h-5 accent-blue-600 rounded"/>
                                     <span className="text-sm font-medium dark:text-gray-300">{s.name}</span>
                                 </label>
                             ))}
                         </div>
                     )}
                 </div>
             </div>
        </div>
    );
};

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
        if(!currentUser) return; 
        const [u, s] = await Promise.all([dataService.getUsers(), dataService.getStores()]);
        // Simple filtering based on role for demo
        setSubordinates(u.filter(x => x.role_level >= currentUser.role_level));
        setStores(s);
    };

    const handleEditUser = (user: User | null) => {
        setEditingUser(user);
        setUserFormData(user ? { ...user } : { username: '', password: '123', role_level: 9 }); // defaults
        setIsUserModalOpen(true);
    };

    const handleSaveUser = async () => { 
         if(!userFormData.username) return;
         if(editingUser) {
             // For edit, PermissionMatrix handles permissions. We just handle core fields here if needed.
             // Actually, core fields like username/role also need saving.
             await dataService.updateUser(editingUser.id, { username: userFormData.username, role_level: userFormData.role_level });
         } else {
             await dataService.createUser(userFormData as any);
         }
         setIsUserModalOpen(false); loadUsers();
    };
    
    const handleDeleteUser = async (u: User) => { 
        if(confirm("Delete?")) { await dataService.deleteUser(u.id); loadUsers(); } 
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto dark:text-gray-100 flex flex-col gap-8 animate-fade-in-up">
             
             {/* HEADER */}
             <div className="flex justify-between items-center">
                 <h2 className="text-3xl font-black dark:text-white tracking-tight">用户权限</h2>
                 <button onClick={() => handleEditUser(null)} className="bg-black dark:bg-white dark:text-black text-white px-6 py-3 rounded-2xl font-bold shadow-xl hover:scale-105 transition-transform flex items-center gap-2">
                     <Icons.Plus size={20}/> 新建用户
                 </button>
             </div>

             {/* DESKTOP TABLE */}
             <div className="hidden md:block bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 p-2 shadow-sm">
                 <table className="w-full text-left">
                     <thead className="text-gray-500 border-b dark:border-gray-700">
                         <tr>
                             <th className="p-6 font-bold uppercase text-xs tracking-wider">User</th>
                             <th className="p-6 font-bold uppercase text-xs tracking-wider">Level</th>
                             <th className="p-6 font-bold uppercase text-xs tracking-wider">Log Policy</th>
                             <th className="p-6 text-right font-bold uppercase text-xs tracking-wider">Actions</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y dark:divide-gray-700">
                         {subordinates.map(u => (
                             <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                 <td className="p-6"><UsernameBadge name={u.username} roleLevel={u.role_level} /></td>
                                 <td className="p-6"><span className="bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-lg font-mono font-bold">{u.role_level}</span></td>
                                 <td className="p-6"><span className="font-bold text-blue-600">{u.permissions?.logs_level}级</span></td>
                                 <td className="p-6 text-right space-x-3">
                                     <button onClick={() => handleEditUser(u)} className="font-bold hover:text-blue-600 transition-colors">设置</button>
                                     <button onClick={() => handleDeleteUser(u)} className="font-bold text-red-400 hover:text-red-600 transition-colors">删除</button>
                                 </td>
                             </tr>
                         ))}
                     </tbody>
                 </table>
             </div>

             {/* MOBILE GRID CARDS */}
             <div className="md:hidden grid grid-cols-1 gap-4">
                 {subordinates.map((u, i) => (
                     <div key={u.id} className={`bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-4 active:scale-95 transition-transform stagger-${(i%5)+1}`}>
                         <div className="flex justify-between items-start">
                             <div className="flex items-center gap-3">
                                 <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center font-black text-gray-600 text-lg">
                                     {u.username.charAt(0)}
                                 </div>
                                 <div>
                                     <div className="text-lg"><UsernameBadge name={u.username} roleLevel={u.role_level} /></div>
                                     <div className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Level {u.role_level}</div>
                                 </div>
                             </div>
                             <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-xs font-black">{u.permissions?.logs_level}级日志</span>
                         </div>
                         <div className="flex gap-2 mt-2">
                             <button onClick={() => handleEditUser(u)} className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 rounded-xl font-bold text-gray-600 dark:text-gray-300">配置</button>
                             <button onClick={() => handleDeleteUser(u)} className="w-12 flex items-center justify-center bg-red-50 dark:bg-red-900/20 rounded-xl text-red-500"><Icons.Minus size={20}/></button>
                         </div>
                     </div>
                 ))}
             </div>

             {/* USER MODAL */}
             {isUserModalOpen && (
                 <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                     <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[90vh] animate-scale-in">
                         <div className="p-6 border-b dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50 backdrop-blur-md rounded-t-3xl">
                             <div>
                                <h2 className="text-2xl font-black dark:text-white">{editingUser ? '编辑用户' : '新建用户'}</h2>
                                {editingUser && <p className="text-xs text-gray-400 mt-1 uppercase font-bold tracking-widest">ID: {editingUser.id}</p>}
                             </div>
                             <button onClick={() => setIsUserModalOpen(false)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full hover:rotate-90 transition-transform"><Icons.Minus size={24}/></button>
                         </div>
                         
                         <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                             {/* Core Identity Form */}
                             <div className="bg-blue-50/50 dark:bg-blue-900/10 p-5 rounded-3xl border border-blue-100 dark:border-blue-800">
                                 <h3 className="text-blue-600 dark:text-blue-400 font-bold mb-4 flex items-center gap-2"><Icons.Box size={18}/> 基础身份</h3>
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                     <div className="space-y-2">
                                         <label className="font-bold text-gray-500 text-xs uppercase">用户名</label>
                                         <input value={userFormData.username} onChange={e => setUserFormData({...userFormData, username: e.target.value})} className="w-full bg-white dark:bg-gray-800 p-4 rounded-2xl outline-none font-bold dark:text-white focus:ring-2 focus:ring-blue-500 shadow-sm"/>
                                     </div>
                                     <div className="space-y-2">
                                         <label className="font-bold text-gray-500 text-xs uppercase">等级 (0=Admin)</label>
                                         <input type="number" value={userFormData.role_level} onChange={e => setUserFormData({...userFormData, role_level: Number(e.target.value) as RoleLevel})} className="w-full bg-white dark:bg-gray-800 p-4 rounded-2xl outline-none font-bold dark:text-white focus:ring-2 focus:ring-blue-500 shadow-sm"/>
                                     </div>
                                 </div>
                             </div>

                             {/* Permission Matrix: Isolated Component */}
                             <PermissionMatrix 
                                 key={editingUser ? editingUser.id : 'new'} // Force remount on user change
                                 userId={editingUser?.id}
                                 initialUser={editingUser ? {} : userFormData} 
                                 stores={stores} 
                                 onLocalChange={(f, v) => setUserFormData(p => ({ ...p, [f]: v }))}
                             />
                         </div>
                         <div className="p-6 border-t dark:border-gray-800 flex gap-4 bg-gray-50/50 dark:bg-gray-800/50 backdrop-blur-md rounded-b-3xl">
                             <button onClick={() => setIsUserModalOpen(false)} className="flex-1 py-4 font-bold text-gray-500 hover:bg-gray-100 rounded-2xl transition-colors">关闭</button>
                             {/* For existing users, permissions are auto-saved by Matrix, we only save core here. For new, we save all. */}
                             <button onClick={handleSaveUser} className="flex-[2] py-4 bg-black dark:bg-white text-white dark:text-black rounded-2xl font-bold shadow-xl hover:scale-[1.02] transition-transform">
                                 {editingUser ? '保存基础信息' : '创建用户'}
                             </button>
                         </div>
                     </div>
                 </div>
             )}
        </div>
    );
};

const AccountSettings = () => { return (<div>Account Settings (Placeholder)</div>); };
