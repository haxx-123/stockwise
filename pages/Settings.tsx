
import React, { useState, useEffect } from 'react';
import { getSupabaseConfig, saveSupabaseConfig } from '../services/supabaseClient';
import { authService } from '../services/authService';
import { dataService } from '../services/dataService';
import { User, Store, RoleLevel } from '../types';
import { Icons } from '../components/Icons';
import { UsernameBadge } from '../components/UsernameBadge';

// --- PERMISSION MATRIX (ISOLATED) ---
interface PermissionMatrixProps { 
    userId?: string; 
    initialUser: Partial<User>; 
    stores: Store[]; 
    onLocalChange?: (field: string, val: any) => void; 
}

const PermissionMatrix: React.FC<PermissionMatrixProps> = ({ userId, initialUser, stores, onLocalChange }) => {
    const [localPerms, setLocalPerms] = useState<Partial<User>>(initialUser);
    const [loading, setLoading] = useState(!!userId);

    // 1. FRESH FETCH ON MOUNT (Edit Mode)
    useEffect(() => {
        let active = true;
        if (userId) {
            setLoading(true);
            dataService.getUser(userId).then(freshUser => {
                if (active) { 
                    if (freshUser) setLocalPerms(freshUser); 
                    setLoading(false); 
                }
            });
        } else {
            setLocalPerms(initialUser);
            setLoading(false);
        }
        return () => { active = false; };
    }, [userId]); 

    // 2. OPTIMISTIC UPDATE
    const handleUpdate = async (field: keyof User, value: any) => {
        setLocalPerms(prev => ({ ...prev, [field]: value })); // Immediate UI update
        
        if (userId) {
            // Silent Background Sync
            try {
                await dataService.updateUser(userId, { [field]: value });
            } catch (e) { console.error("Sync failed", e); }
        } else {
            if (onLocalChange) onLocalChange(field as string, value);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-400">正在同步最新权限...</div>;

    const toggleStore = (sid: string) => {
        const cur = localPerms.allowed_store_ids || [];
        const next = cur.includes(sid) ? cur.filter(x => x !== sid) : [...cur, sid];
        handleUpdate('allowed_store_ids', next);
    };

    return (
        <div className="space-y-6 animate-fade-in">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="bg-gray-800/50 p-4 rounded-2xl border border-gray-700">
                     <h4 className="font-bold mb-4 text-white flex items-center gap-2"><Icons.Sparkles size={16}/> 日志权限等级</h4>
                     <div className="space-y-2">
                         {[
                             {l:'A', d:'A级 (最高): 查看全员 + 任意撤销'},
                             {l:'B', d:'B级: 查看全员 + 撤销下级'},
                             {l:'C', d:'C级: 查看全员 + 仅撤销自己'},
                             {l:'D', d:'D级: 仅查看自己 + 仅撤销自己'}
                         ].map((opt) => (
                             <label key={opt.l} className={`block p-3 rounded-xl border transition-all cursor-pointer ${localPerms.logs_level === opt.l ? 'bg-blue-900/40 border-blue-500' : 'border-transparent hover:bg-gray-700'}`}>
                                 <div className="flex items-center gap-3">
                                     <input type="radio" checked={localPerms.logs_level===opt.l} onChange={()=>handleUpdate('logs_level', opt.l)} className="accent-blue-500"/>
                                     <span className="text-sm font-medium text-gray-200">{opt.d}</span>
                                 </div>
                             </label>
                         ))}
                     </div>
                 </div>

                 <div className="bg-gray-800/50 p-4 rounded-2xl border border-gray-700">
                     <h4 className="font-bold mb-4 text-white">功能矩阵开关</h4>
                     <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                         {[
                             {k:'show_excel', l:'允许 Excel 导出'}, 
                             {k:'hide_excel_export', l:'隐藏 Excel 导出页面', danger:true},
                             {k:'view_peers', l:'查看/创建同级用户'},
                             {k:'view_self_in_list', l:'列表中显示自己'},
                             {k:'hide_perm_page', l:'隐藏权限设置入口', danger:true},
                             {k:'hide_audit_hall', l:'隐藏审计大厅页面', danger:true},
                             {k:'hide_store_management', l:'隐藏门店修改按钮', danger:true},
                             {k:'hide_new_store_page', l:'隐藏新建门店页面', danger:true}
                         ].map((item:any) => (
                             <label key={item.k} className="flex justify-between items-center p-2 hover:bg-gray-700 rounded-lg">
                                 <span className={`text-sm font-bold ${item.danger?'text-red-400':'text-gray-300'}`}>{item.l}</span>
                                 <input type="checkbox" checked={!!(localPerms as any)[item.k]} onChange={e=>handleUpdate(item.k, e.target.checked)} className="w-5 h-5 accent-blue-500 rounded cursor-pointer" />
                             </label>
                         ))}
                     </div>
                 </div>
             </div>

             <div className="bg-gray-800/50 p-4 rounded-2xl border border-gray-700">
                 <h4 className="font-bold mb-4 text-white">门店管理范围</h4>
                 <div className="flex bg-gray-700 rounded-lg p-1 mb-4">
                     <button onClick={()=>handleUpdate('store_scope', 'GLOBAL')} className={`flex-1 py-1.5 rounded text-xs font-bold ${localPerms.store_scope==='GLOBAL' ? 'bg-white text-black' : 'text-gray-400'}`}>全门店 (Global)</button>
                     <button onClick={()=>handleUpdate('store_scope', 'LIMITED')} className={`flex-1 py-1.5 rounded text-xs font-bold ${localPerms.store_scope==='LIMITED' ? 'bg-white text-black' : 'text-gray-400'}`}>指定门店 (Limited)</button>
                 </div>
                 {localPerms.store_scope === 'LIMITED' && (
                     <div className="grid grid-cols-2 gap-2">
                         {stores.map(s => (
                             <label key={s.id} className="flex items-center gap-2 p-2 hover:bg-gray-700 rounded cursor-pointer">
                                 <input type="checkbox" checked={(localPerms.allowed_store_ids || []).includes(s.id)} onChange={()=>toggleStore(s.id)} className="accent-blue-500"/>
                                 <span className="text-sm text-gray-300">{s.name}</span>
                             </label>
                         ))}
                     </div>
                 )}
             </div>
        </div>
    );
};

// --- SETTINGS PAGE MAIN ---
export const Settings: React.FC<{ subPage?: string }> = ({ subPage = 'config' }) => {
    const [configUrl, setConfigUrl] = useState('');
    const [configKey, setConfigKey] = useState('');
    
    // User Management State
    const currentUser = authService.getCurrentUser();
    const [users, setUsers] = useState<User[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [userFormData, setUserFormData] = useState<Partial<User>>({});

    useEffect(() => {
        const c = getSupabaseConfig();
        setConfigUrl(c.url);
        setConfigKey(c.key);
        if (subPage === 'perms') loadUsers();
    }, [subPage]);

    const loadUsers = async () => {
        const [u, s] = await Promise.all([dataService.getUsers(), dataService.getStores()]);
        // Filter based on hierarchy: Users can only see/edit subordinates (role_level > own) OR peers if 'view_peers' is true
        // Admin (0) sees all.
        let visibleUsers = u;
        if (currentUser?.role_level !== 0) {
            visibleUsers = u.filter(target => {
                if (target.id === currentUser?.id) return currentUser.permissions.view_self_in_list;
                if (currentUser?.permissions.view_peers && target.role_level === currentUser.role_level) return true;
                return target.role_level > (currentUser?.role_level || 9);
            });
        }
        setUsers(visibleUsers);
        setStores(s);
    };

    const handleEditUser = (u: User | null) => {
        setEditingUser(u);
        setUserFormData(u ? { ...u } : { username: '', role_level: 9, password: '123' });
        setIsUserModalOpen(true);
    };

    const handleSaveUser = async () => {
        if (!userFormData.username) return;
        // For new users, create. For edit, 'PermissionMatrix' handled perms sync, we just save core info here if needed.
        if (editingUser) {
            await dataService.updateUser(editingUser.id, { username: userFormData.username, role_level: userFormData.role_level, password: userFormData.password });
        } else {
            await dataService.createUser(userFormData as any);
        }
        setIsUserModalOpen(false);
        loadUsers();
    };

    // SQL Code Snippet for Config Page
    // FIXED: Changed uuid to text to be compatible with potentially text-based IDs in existing tables
    const sqlCode = `
-- Prism Database Setup (Fix Type Mismatch)
ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_store_ids text[] DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS face_descriptor text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS remark text;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS remark text;

-- Parent Store ID (Using TEXT to match potential string IDs)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS parent_id text REFERENCES stores(id);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS managers text[] DEFAULT '{}';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS viewers text[] DEFAULT '{}';

-- Device Logs (Using TEXT for user_id)
CREATE TABLE IF NOT EXISTS device_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, 
    user_id text REFERENCES users(id), 
    username text, 
    device_info text, 
    ip_address text, 
    last_active timestamptz DEFAULT now()
);
GRANT ALL ON device_logs TO authenticated;
GRANT ALL ON device_logs TO service_role;
    `.trim();

    if (subPage === 'config') {
        // Only 00 Admin sees this
        if (currentUser?.role_level !== 0) return <div className="p-10 text-center text-gray-500">无权访问</div>;
        return (
            <div className="p-6 max-w-4xl mx-auto space-y-6 animate-fade-in-up text-white">
                <h2 className="text-2xl font-bold">连接配置</h2>
                <div className="glass p-6 rounded-2xl space-y-4">
                    <input value={configUrl} onChange={e=>setConfigUrl(e.target.value)} className="w-full bg-gray-900 border border-gray-700 p-3 rounded-lg text-white" placeholder="URL"/>
                    <input type="password" value={configKey} onChange={e=>setConfigKey(e.target.value)} className="w-full bg-gray-900 border border-gray-700 p-3 rounded-lg text-white" placeholder="Key"/>
                    <button onClick={()=>{saveSupabaseConfig(configUrl,configKey); window.location.reload();}} className="bg-blue-600 px-6 py-2 rounded-lg font-bold">保存并重启</button>
                </div>
                <div className="glass p-6 rounded-2xl">
                    <h3 className="font-bold mb-2">数据库 SQL (点击复制)</h3>
                    <p className="text-xs text-gray-400 mb-2">已修复类型兼容性错误 (42804)</p>
                    <pre onClick={()=>{navigator.clipboard.writeText(sqlCode); alert("已复制");}} className="bg-black/50 p-4 rounded-lg text-xs font-mono text-green-400 cursor-pointer hover:bg-black/70 transition overflow-x-auto whitespace-pre-wrap">
                        {sqlCode}
                    </pre>
                </div>
            </div>
        );
    }

    if (subPage === 'account') {
        // Simple Switch Account UI
        const lowerUsers = users.filter(u => u.role_level > (currentUser?.role_level || 0));
        return (
            <div className="p-6 max-w-2xl mx-auto space-y-6 text-white animate-fade-in-up">
                <h2 className="text-2xl font-bold">账户设置</h2>
                <div className="glass p-6 rounded-2xl flex items-center justify-between">
                    <div>
                        <div className="text-gray-400 text-xs uppercase">Current ID</div>
                        <div className="font-mono font-bold text-lg">{currentUser?.id}</div>
                    </div>
                    <button onClick={()=>authService.logout()} className="bg-red-900/50 text-red-400 px-4 py-2 rounded-lg font-bold border border-red-800">退出登录</button>
                </div>
                <div className="glass p-6 rounded-2xl">
                    <h3 className="font-bold mb-4">切换账户 (仅限低权限)</h3>
                    <div className="grid grid-cols-2 gap-3">
                        {lowerUsers.map(u => (
                            <button key={u.id} onClick={()=>authService.switchAccount(u)} className="flex items-center gap-2 p-3 hover:bg-white/10 rounded-xl transition text-left">
                                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center font-bold text-xs">{u.role_level}</div>
                                <span>{u.username}</span>
                            </button>
                        ))}
                        {lowerUsers.length === 0 && <div className="text-gray-500 text-sm p-2">无可用账户</div>}
                    </div>
                </div>
            </div>
        );
    }

    if (subPage === 'perms') {
        return (
            <div className="p-4 md:p-8 max-w-7xl mx-auto text-white animate-fade-in-up">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">用户权限管理</h2>
                    <button onClick={()=>handleEditUser(null)} className="bg-white text-black px-4 py-2 rounded-xl font-bold hover:scale-105 transition"><Icons.Plus size={18}/> 新建用户</button>
                </div>
                
                {/* Desktop Table */}
                <div className="hidden md:block glass rounded-2xl overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-white/5 text-gray-400 text-xs uppercase">
                            <tr><th className="p-4">User</th><th className="p-4">ID (Read Only)</th><th className="p-4">Level</th><th className="p-4 text-right">Actions</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {users.map(u => (
                                <tr key={u.id} className="hover:bg-white/5">
                                    <td className="p-4"><UsernameBadge name={u.username} roleLevel={u.role_level}/></td>
                                    <td className="p-4 font-mono text-xs text-gray-500">{u.id}</td>
                                    <td className="p-4"><span className="bg-gray-700 px-2 py-1 rounded text-xs font-bold">{u.role_level}</span></td>
                                    <td className="p-4 text-right">
                                        <button onClick={()=>handleEditUser(u)} className="text-blue-400 font-bold mr-4">配置</button>
                                        <button onClick={()=>dataService.deleteUser(u.id).then(loadUsers)} className="text-red-500 opacity-50 hover:opacity-100">软删</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* User Modal */}
                {isUserModalOpen && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-[#1a1a1a] border border-gray-700 rounded-3xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl animate-scale-in">
                            <div className="p-6 border-b border-gray-700 flex justify-between items-center">
                                <h3 className="text-xl font-bold">{editingUser ? '编辑用户' : '新建用户'}</h3>
                                <button onClick={()=>setIsUserModalOpen(false)} className="p-2 hover:bg-gray-800 rounded-full"><Icons.Minus size={24}/></button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                                <div className="glass p-4 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div><label className="block text-xs text-gray-500 mb-1">用户名</label><input className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white" value={userFormData.username} onChange={e=>setUserFormData({...userFormData, username: e.target.value})}/></div>
                                    <div><label className="block text-xs text-gray-500 mb-1">密码</label><input className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white" value={userFormData.password} onChange={e=>setUserFormData({...userFormData, password: e.target.value})}/></div>
                                    <div><label className="block text-xs text-gray-500 mb-1">等级 (0-9)</label><input type="number" className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-white" value={userFormData.role_level} onChange={e=>setUserFormData({...userFormData, role_level: Number(e.target.value) as RoleLevel})}/></div>
                                </div>
                                <PermissionMatrix 
                                    key={editingUser?.id || 'new'} 
                                    userId={editingUser?.id} 
                                    initialUser={editingUser ? {} : userFormData} 
                                    stores={stores}
                                    onLocalChange={(f, v) => setUserFormData(p => ({ ...p, [f]: v }))}
                                />
                            </div>
                            <div className="p-6 border-t border-gray-700 flex justify-end gap-4">
                                <button onClick={()=>setIsUserModalOpen(false)} className="px-6 py-2 text-gray-400">取消</button>
                                <button onClick={handleSaveUser} className="px-8 py-2 bg-white text-black font-bold rounded-xl hover:scale-105 transition">保存</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return null;
};
