

import React, { useState, useEffect } from 'react';
import { getSupabaseConfig, saveSupabaseConfig } from '../services/supabaseClient';
import { authService, DEFAULT_PERMISSIONS } from '../services/authService';
import { dataService } from '../services/dataService';
import { User, Store, UserPermissions, RoleLevel, Announcement } from '../types';
import { Icons } from '../components/Icons';

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
-- STOCKWISE V2.1 MIGRATION SCRIPT (Safe Update)

DO $$ 
BEGIN 
    -- 1. Stores: Add is_archived if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='is_archived') THEN
        ALTER TABLE stores ADD COLUMN is_archived boolean default false;
    END IF;

    -- 2. Products: Add strict isolation & archive
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='is_archived') THEN
        ALTER TABLE products ADD COLUMN is_archived boolean default false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='bound_store_id') THEN
        ALTER TABLE products ADD COLUMN bound_store_id text references stores(id);
    END IF;

    -- 3. Batches: Add archive
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='batches' AND column_name='is_archived') THEN
        ALTER TABLE batches ADD COLUMN is_archived boolean default false;
    END IF;

    -- 4. Users: Add archive & permission fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='is_archived') THEN
        ALTER TABLE users ADD COLUMN is_archived boolean default false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='allowed_store_ids') THEN
        ALTER TABLE users ADD COLUMN allowed_store_ids text[] default '{}';
    END IF;

    -- 5. Announcements: Add new fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='announcements' AND column_name='is_force_deleted') THEN
        ALTER TABLE announcements ADD COLUMN is_force_deleted boolean default false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='announcements' AND column_name='read_by') THEN
        ALTER TABLE announcements ADD COLUMN read_by text[] default '{}';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='announcements' AND column_name='target_users') THEN
        ALTER TABLE announcements ADD COLUMN target_users text[];
    END IF;
    
    -- 6. Transactions
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='is_undone') THEN
        ALTER TABLE transactions ADD COLUMN is_undone boolean default false;
    END IF;

END $$;

-- Triggers & Functions (Re-create to ensure latest logic)
create or replace function log_audit_trail() returns trigger as $$
begin
  if (TG_OP = 'DELETE') then
    insert into system_audit_logs (table_name, record_id, operation, old_data)
    values (TG_TABLE_NAME, OLD.id, TG_OP, row_to_json(OLD));
    return OLD;
  elsif (TG_OP = 'UPDATE') then
    insert into system_audit_logs (table_name, record_id, operation, old_data, new_data)
    values (TG_TABLE_NAME, NEW.id, TG_OP, row_to_json(OLD), row_to_json(NEW));
    return NEW;
  elsif (TG_OP = 'INSERT') then
    insert into system_audit_logs (table_name, record_id, operation, new_data)
    values (TG_TABLE_NAME, NEW.id, TG_OP, row_to_json(NEW));
    return NEW;
  end if;
  return null;
end;
$$ language plpgsql;

drop trigger if exists audit_batches_trigger on batches;
create trigger audit_batches_trigger after insert or update or delete on batches for each row execute function log_audit_trail();

create or replace function operate_stock(
  p_batch_id text,
  p_qty_change integer,
  p_type text,
  p_note text,
  p_operator text,
  p_snapshot jsonb
) returns void as $$
declare
  v_new_qty integer;
  v_batch record;
begin
  select * from batches where id = p_batch_id into v_batch;
  if not found then raise exception 'Batch not found'; end if;
  v_new_qty := v_batch.quantity + p_qty_change;
  if v_new_qty < 0 then raise exception 'Insufficient stock.'; end if;
  update batches set quantity = v_new_qty where id = p_batch_id;
  insert into transactions (id, type, product_id, store_id, batch_id, quantity, balance_after, timestamp, note, operator, snapshot_data) 
  values (gen_random_uuid(), p_type, v_batch.product_id, v_batch.store_id, p_batch_id, p_qty_change, v_new_qty, now(), p_note, p_operator, p_snapshot);
end;
$$ language plpgsql;
`;

    if (subPage === 'config') {
        return (
            <div className="p-4 md:p-8 max-w-4xl mx-auto dark:text-gray-100 flex flex-col gap-6">
                <h1 className="text-2xl font-bold mb-2">连接配置</h1>
                <div className="bg-white dark:bg-gray-900 p-4 md:p-8 rounded-xl shadow-sm border dark:border-gray-700 flex flex-col gap-4">
                    <div className="flex flex-col gap-4">
                        <div className="w-full">
                            <label className="block text-sm font-medium mb-2">Supabase Project URL</label>
                            <input value={configUrl} onChange={(e) => setConfigUrl(e.target.value)} className="w-full rounded-lg border dark:border-gray-600 dark:bg-gray-800 p-3 outline-none dark:text-white" />
                        </div>
                        <div className="w-full">
                            <label className="block text-sm font-medium mb-2">Supabase Anon Key</label>
                            <input type="password" value={configKey} onChange={(e) => setConfigKey(e.target.value)} className="w-full rounded-lg border dark:border-gray-600 dark:bg-gray-800 p-3 outline-none dark:text-white" />
                        </div>
                    </div>
                    <button onClick={handleSaveConfig} className="w-full bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 font-bold">保存配置</button>
                    {saved && <span className="text-green-600 ml-4 font-bold">已保存</span>}
                    
                    <hr className="border-gray-200 dark:border-gray-700" />
                    <div>
                        <div className="flex justify-between items-center mb-2">
                             <h3 className="font-bold">数据库初始化 (SQL)</h3>
                             <div className="text-xs text-right">
                                <p>Type: <span className="text-blue-500 font-bold">Safe Migration</span></p>
                             </div>
                        </div>
                        <div className="relative">
                            <pre className="bg-black text-green-400 p-4 rounded h-64 overflow-auto text-xs font-mono">{sqlScript}</pre>
                            <button onClick={() => navigator.clipboard.writeText(sqlScript)} className="absolute top-2 right-2 bg-white/20 px-2 py-1 text-xs text-white rounded">复制</button>
                        </div>
                    </div>
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

const AccountSettings = () => {
    const user = authService.getCurrentUser();
    const [form, setForm] = useState({ username: '', password: '' });
    const [showPass, setShowPass] = useState(false);
    const [lowerUsers, setLowerUsers] = useState<User[]>([]);

    useEffect(() => {
        if (user) {
            setForm({ username: user.username, password: user.password || '' });
            dataService.getUsers().then(users => {
                const subs = users.filter(u => u.role_level > user.role_level);
                setLowerUsers(subs);
            });
        }
    }, []);

    const handleSave = async () => {
        if (!user) return;
        try {
            await dataService.updateUser(user.id, { username: form.username, password: form.password });
            const updated = { ...user, ...form };
            sessionStorage.setItem('sw_session_user', JSON.stringify(updated));
            alert("保存成功");
            window.location.reload();
        } catch(e: any) { alert(e.message); }
    };

    const handleSwitch = (u: User) => {
        if(confirm(`切换到账户 ${u.username}?`)) {
            authService.switchAccount(u);
        }
    };

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto dark:text-gray-100">
            <h1 className="text-2xl font-bold mb-6">账户设置</h1>
            <div className="grid md:grid-cols-2 gap-8">
                <div className="bg-white dark:bg-gray-900 p-6 md:p-8 rounded-xl shadow-sm border dark:border-gray-700 space-y-6">
                    <h3 className="font-bold border-b pb-2 dark:border-gray-700">基本信息</h3>
                    <div>
                        <label className="block text-sm font-bold text-gray-500 uppercase mb-1">管理权限等级</label>
                        <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-gray-600 dark:text-gray-400 font-mono font-bold">
                            {String(user?.role_level).padStart(2, '0')}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1">用户名</label>
                        <input value={form.username} onChange={e => setForm({...form, username: e.target.value})} className="w-full border p-3 rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white"/>
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1">密码</label>
                        <div className="relative">
                            <input type={showPass ? "text" : "password"} value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="w-full border p-3 rounded dark:bg-gray-800 dark:border-gray-600 pr-10 dark:text-white"/>
                            <button onClick={() => setShowPass(!showPass)} className="absolute right-3 top-3 text-gray-400"><Icons.ArrowRightLeft size={16}/></button>
                        </div>
                    </div>
                    <button onClick={handleSave} className="w-full py-3 rounded font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-md">保存变更</button>
                    <button onClick={() => {if(confirm("确定要退出登录吗？")) authService.logout();}} className="w-full py-3 rounded font-bold border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-900/20">退出账号</button>
                </div>
                <div className="bg-white dark:bg-gray-900 p-6 md:p-8 rounded-xl shadow-sm border dark:border-gray-700 space-y-6 h-fit">
                     <h3 className="font-bold border-b pb-2 dark:border-gray-700 flex items-center gap-2"><Icons.ArrowRightLeft size={18}/> 快速切换账户</h3>
                     <div className="max-h-60 overflow-y-auto custom-scrollbar border rounded dark:border-gray-700">
                         {lowerUsers.length === 0 && <div className="p-4 text-center text-gray-400 text-sm">无下级账户</div>}
                         {lowerUsers.map(u => (
                             <button key={u.id} onClick={() => handleSwitch(u)} className="w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-800 border-b dark:border-gray-800 flex justify-between items-center group">
                                 <span className="font-bold text-sm dark:text-white">{u.username}</span>
                                 <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-500 dark:text-gray-300">Lv.{u.role_level}</span>
                             </button>
                         ))}
                     </div>
                </div>
            </div>
        </div>
    );
};

const PermissionsSettings = () => {
    const currentUser = authService.getCurrentUser();
    const [subordinates, setSubordinates] = useState<User[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);

    // Form State for User
    const [formData, setFormData] = useState<Partial<User>>({});
    const [hasChanges, setHasChanges] = useState(false);

    const loadData = async () => {
        if (!currentUser) return;
        const [users, allStores] = await Promise.all([dataService.getUsers(), dataService.getStores()]);
        let subs: User[] = [];
        // View Peers logic
        if (currentUser.permissions.view_peers) subs = users.filter(u => u.role_level >= currentUser.role_level);
        else subs = users.filter(u => u.role_level > currentUser.role_level);
        // View Self Logic
        if (!currentUser.permissions.view_self_in_list) subs = subs.filter(u => u.id !== currentUser.id);
        
        setSubordinates(subs);
        setStores(allStores);
    };

    useEffect(() => { loadData(); }, []);

    const handleEdit = (user: User | null) => {
        if (user) {
            setEditingUser(user);
            setFormData(JSON.parse(JSON.stringify(user)));
        } else {
            setEditingUser(null);
            setFormData({
                username: '', password: '123', role_level: (currentUser?.role_level || 0) + 1 as RoleLevel,
                permissions: JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS)),
                allowed_store_ids: []
            });
        }
        setHasChanges(false);
        setIsModalOpen(true);
    };

    const handleChange = (field: string, value: any, nested?: string) => {
        setHasChanges(true);
        if (nested) {
            setFormData(prev => ({
                ...prev,
                permissions: { ...prev.permissions!, [field]: value }
            }));
        } else {
            setFormData(prev => ({ ...prev, [field]: value }));
        }
    };

    const handleStoreChange = (storeId: string, checked: boolean) => {
        setHasChanges(true);
        const current = new Set(formData.allowed_store_ids || []);
        if (checked) current.add(storeId); else current.delete(storeId);
        setFormData(prev => ({ ...prev, allowed_store_ids: Array.from(current) }));
    };

    const handleSave = async () => {
        if (!formData.username) return alert("用户名必填");
        if (Number(formData.role_level) <= (currentUser?.role_level || 0) && currentUser?.role_level !== 0) return alert("只能创建/修改等级比自己低的用户");

        try {
            if (editingUser) {
                await dataService.updateUser(editingUser.id, formData);
            } else {
                await dataService.createUser(formData as any);
            }
            setIsModalOpen(false);
            loadData();
        } catch(e: any) { alert(e.message); }
    };

    const handleDeleteUser = async (uid: string) => {
        if(confirm("确定删除该用户？(软删除)")) {
            await dataService.deleteUser(uid);
            loadData();
        }
    };

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto dark:text-gray-100">
             <div className="flex justify-between items-center mb-6">
                 <h1 className="text-2xl font-bold">权限设置</h1>
                 <button onClick={() => handleEdit(null)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2">
                     <Icons.Plus size={20}/> 新增用户
                 </button>
             </div>

             <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 overflow-hidden shadow-sm">
                 <table className="w-full text-left">
                     <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                         <tr>
                             <th className="p-4">用户</th>
                             <th className="p-4">等级</th>
                             <th className="p-4">门店范围</th>
                             <th className="p-4">日志权限</th>
                             <th className="p-4 text-right">操作</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y dark:divide-gray-700">
                         {subordinates.map(u => (
                             <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                 <td className="p-4 font-bold">{u.username}</td>
                                 <td className="p-4"><span className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-xs font-mono">{u.role_level}</span></td>
                                 <td className="p-4 text-sm">{u.permissions.store_scope === 'GLOBAL' ? '全局' : `受限 (${u.allowed_store_ids.length})`}</td>
                                 <td className="p-4 text-sm">{u.permissions.logs_level === 'A' ? 'A (系统)' : u.permissions.logs_level === 'B' ? 'B (下级)' : 'C (仅自己)'}</td>
                                 <td className="p-4 text-right space-x-2">
                                     <button onClick={() => handleEdit(u)} className="text-blue-600 font-bold hover:underline">编辑</button>
                                     <button onClick={() => handleDeleteUser(u.id)} className="text-red-600 font-bold hover:underline">删除</button>
                                 </td>
                             </tr>
                         ))}
                     </tbody>
                 </table>
             </div>

             {isModalOpen && formData && (
                 <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                     <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
                         <div className="p-6 border-b dark:border-gray-700 flex justify-between items-center">
                             <h2 className="text-xl font-bold">{editingUser ? '编辑用户' : '新增用户'}</h2>
                             <button onClick={() => setIsModalOpen(false)}><Icons.Minus size={24}/></button>
                         </div>
                         <div className="p-6 space-y-6 flex-1">
                             {/* Basic Info */}
                             <div className="space-y-4">
                                 <h3 className="font-bold border-b dark:border-gray-700 pb-2">基本属性</h3>
                                 <div className="grid grid-cols-2 gap-4">
                                     <div>
                                         <label className="block text-sm font-bold mb-1">用户名</label>
                                         <input value={formData.username} onChange={e => handleChange('username', e.target.value)} className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600"/>
                                     </div>
                                     <div>
                                         <label className="block text-sm font-bold mb-1">密码</label>
                                         <input value={formData.password} onChange={e => handleChange('password', e.target.value)} className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600"/>
                                     </div>
                                     <div>
                                         <label className="block text-sm font-bold mb-1">管理等级 (数值越大权限越低)</label>
                                         <input type="number" min={(currentUser?.role_level||0)+1} max="9" value={formData.role_level} onChange={e => handleChange('role_level', Number(e.target.value))} className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600"/>
                                     </div>
                                 </div>
                             </div>

                             {/* Permission Matrix */}
                             <div className="space-y-4">
                                 <h3 className="font-bold border-b dark:border-gray-700 pb-2">功能权限矩阵</h3>
                                 
                                 {/* Logs */}
                                 <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
                                     <label className="block font-bold mb-2">日志权限</label>
                                     <div className="space-y-2">
                                         <label className="flex items-center gap-2"><input type="radio" name="logs" checked={formData.permissions?.logs_level === 'A'} onChange={() => handleChange('logs_level', 'A', 'perm')} /> A级：查看系统级 + 任意撤销</label>
                                         <label className="flex items-center gap-2"><input type="radio" name="logs" checked={formData.permissions?.logs_level === 'B'} onChange={() => handleChange('logs_level', 'B', 'perm')} /> B级：查看/撤销下级记录</label>
                                         <label className="flex items-center gap-2"><input type="radio" name="logs" checked={formData.permissions?.logs_level === 'C'} onChange={() => handleChange('logs_level', 'C', 'perm')} /> C级：仅查看/撤销自己</label>
                                     </div>
                                 </div>

                                 {/* Announcement */}
                                 <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
                                     <label className="block font-bold mb-2">公告权限</label>
                                     <div className="space-x-4">
                                         <label className="inline-flex items-center gap-2"><input type="radio" name="ann" checked={formData.permissions?.announcement_rule === 'PUBLISH'} onChange={() => handleChange('announcement_rule', 'PUBLISH', 'perm')} /> 发布公告</label>
                                         <label className="inline-flex items-center gap-2"><input type="radio" name="ann" checked={formData.permissions?.announcement_rule === 'VIEW'} onChange={() => handleChange('announcement_rule', 'VIEW', 'perm')} /> 仅接收</label>
                                     </div>
                                 </div>

                                 {/* Store Scope */}
                                 <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded">
                                     <label className="block font-bold mb-2">门店范围 (数据隔离)</label>
                                     <div className="space-x-4 mb-3">
                                         <label className="inline-flex items-center gap-2"><input type="radio" name="scope" checked={formData.permissions?.store_scope === 'GLOBAL'} onChange={() => handleChange('store_scope', 'GLOBAL', 'perm')} /> 全局模式</label>
                                         <label className="inline-flex items-center gap-2"><input type="radio" name="scope" checked={formData.permissions?.store_scope === 'LIMITED'} onChange={() => handleChange('store_scope', 'LIMITED', 'perm')} /> 受限模式</label>
                                     </div>
                                     {formData.permissions?.store_scope === 'LIMITED' && (
                                         <div className="pl-4 border-l-2 border-blue-500 grid grid-cols-2 gap-2">
                                             {stores.map(s => (
                                                 <label key={s.id} className="flex items-center gap-2">
                                                     <input type="checkbox" checked={formData.allowed_store_ids?.includes(s.id)} onChange={(e) => handleStoreChange(s.id, e.target.checked)} />
                                                     {s.name}
                                                 </label>
                                             ))}
                                         </div>
                                     )}
                                 </div>
                                 
                                 {/* Misc */}
                                 <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded grid grid-cols-2 gap-4">
                                     <label className="flex items-center gap-2"><input type="checkbox" checked={formData.permissions?.show_excel} onChange={(e) => handleChange('show_excel', e.target.checked, 'perm')} /> 显示 Excel 导出</label>
                                     <label className="flex items-center gap-2"><input type="checkbox" checked={formData.permissions?.view_peers} onChange={(e) => handleChange('view_peers', e.target.checked, 'perm')} /> 可见同级用户</label>
                                     <label className="flex items-center gap-2"><input type="checkbox" checked={formData.permissions?.view_self_in_list} onChange={(e) => handleChange('view_self_in_list', e.target.checked, 'perm')} /> 列表显示自己</label>
                                     <label className="flex items-center gap-2"><input type="checkbox" checked={formData.permissions?.hide_perm_page} onChange={(e) => handleChange('hide_perm_page', e.target.checked, 'perm')} /> 隐藏“权限设置”页</label>
                                 </div>
                                 
                                 <div className="text-gray-500 text-xs mt-2">
                                     * 删除模式：系统强制执行“全员全操作软删除”，不可配置。
                                 </div>
                             </div>
                         </div>
                         <div className="p-6 border-t dark:border-gray-700 flex justify-end gap-4 bg-gray-50 dark:bg-gray-800">
                             <button onClick={() => setIsModalOpen(false)} className="px-6 py-2 text-gray-500 font-bold">取消</button>
                             <button disabled={!hasChanges} onClick={handleSave} className={`px-6 py-2 rounded font-bold text-white transition-colors ${hasChanges ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'}`}>保存</button>
                         </div>
                     </div>
                 </div>
             )}
        </div>
    );
};
