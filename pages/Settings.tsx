
import React, { useState, useEffect } from 'react';
import { getSupabaseConfig, saveSupabaseConfig } from '../services/supabaseClient';
import { authService, DEFAULT_PERMISSIONS } from '../services/authService';
import { dataService } from '../services/dataService';
import { User, Store, UserPermissions, RoleLevel } from '../types';
import { Icons } from '../components/Icons';

export const Settings: React.FC<{ subPage?: string; onThemeChange?: (theme: string) => void }> = ({ subPage = 'config', onThemeChange }) => {
    const [configUrl, setConfigUrl] = useState('');
    const [configKey, setConfigKey] = useState('');
    const [saved, setSaved] = useState(false);
    
    // Theme
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
    
    // RENDER SUBPAGES
    if (subPage === 'config') {
        const sqlScript = `
-- RESET SCHEMA FOR NEW PERMISSIONS (Run in Supabase SQL Editor)
drop trigger if exists audit_batches_trigger on batches cascade;
drop function if exists log_audit_trail cascade;
drop function if exists operate_stock cascade;
drop table if exists transactions cascade;
drop table if exists batches cascade;
drop table if exists products cascade;
drop table if exists stores cascade;
drop table if exists users cascade;
drop table if exists announcements cascade;
drop table if exists system_audit_logs cascade;

-- 1. Stores
create table stores (
  id text primary key default gen_random_uuid(),
  name text not null,
  location text
);

-- 2. Products
create table products (
  id text primary key default gen_random_uuid(),
  name text not null unique, 
  sku text,
  category text,
  unit_name text,
  split_unit_name text,
  split_ratio integer,
  min_stock_level integer,
  image_url text,
  is_archived boolean default false
);

-- 3. Batches
create table batches (
  id text primary key default gen_random_uuid(),
  product_id text references products(id),
  store_id text references stores(id),
  batch_number text,
  quantity integer default 0,
  expiry_date timestamp with time zone,
  created_at timestamp with time zone default now(),
  is_archived boolean default false
);

-- 4. Users (UPDATED with JSON Permissions)
create table users (
  id text primary key default gen_random_uuid(),
  username text unique not null,
  password text not null, 
  role_level integer default 9, -- 0 to 9
  permissions jsonb default '{}', -- Stores Matrix
  allowed_store_ids text[] default '{}',
  default_store_id text references stores(id) -- Legacy/Primary
);

-- 5. Transactions
create table transactions (
  id text primary key default gen_random_uuid(),
  type text not null,
  product_id text references products(id),
  store_id text references stores(id),
  batch_id text references batches(id),
  quantity integer not null,
  balance_after integer,
  timestamp timestamp with time zone default now(),
  note text,
  operator text,
  snapshot_data jsonb,
  is_undone boolean default false
);

-- 6. Announcements
create table announcements (
  id text primary key default gen_random_uuid(),
  title text not null,
  content text,
  creator text,
  creator_id text,
  target_users text[], 
  valid_until timestamp with time zone,
  popup_config jsonb, 
  allow_delete boolean default true,
  is_force_deleted boolean default false,
  read_by text[] default '{}',
  created_at timestamp with time zone default now()
);

-- 7. Audit
create table system_audit_logs (
  id bigserial primary key,
  table_name text,
  record_id text,
  operation text,
  old_data jsonb,
  new_data jsonb,
  timestamp timestamp default now()
);

-- FUNCTION: Audit
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

create trigger audit_batches_trigger after insert or update or delete on batches for each row execute function log_audit_trail();
create trigger audit_products_trigger after insert or update or delete on products for each row execute function log_audit_trail();

-- FUNCTION: Stock Op
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

-- Init Stores
insert into stores (name) values ('默认总店');
`;

        return (
            <div className="p-8 max-w-4xl mx-auto dark:text-gray-100">
                <h1 className="text-2xl font-bold mb-6">连接配置</h1>
                <div className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-sm border dark:border-gray-700 space-y-6">
                    <div>
                        <label className="block text-sm font-medium mb-2">Supabase Project URL</label>
                        <input value={configUrl} onChange={(e) => setConfigUrl(e.target.value)} className="w-full rounded-lg border dark:border-gray-600 dark:bg-gray-800 p-2.5 outline-none" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-2">Supabase Anon Key</label>
                        <input type="password" value={configKey} onChange={(e) => setConfigKey(e.target.value)} className="w-full rounded-lg border dark:border-gray-600 dark:bg-gray-800 p-2.5 outline-none" />
                    </div>
                    <button onClick={handleSaveConfig} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">保存配置</button>
                    {saved && <span className="text-green-600 ml-4">已保存</span>}
                    
                    <hr className="border-gray-200 dark:border-gray-700" />
                    <div>
                        <div className="flex justify-between items-center mb-2">
                             <h3 className="font-bold">SQL 初始化脚本</h3>
                             <div className="text-xs text-right">
                                <p>SQL是/否较上一次发生更改: <span className="text-blue-500 font-bold">是</span></p>
                                <p>SQL是/否必须包含重置数据库: <span className="text-red-500 font-bold">是</span></p>
                             </div>
                        </div>
                        <div className="relative">
                            <pre className="bg-black text-green-400 p-4 rounded h-48 overflow-auto text-xs font-mono">{sqlScript}</pre>
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
                 <div className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-sm border dark:border-gray-700 flex gap-4">
                     <button onClick={() => handleThemeClick('light')} className={`px-6 py-3 rounded-lg border ${currentTheme==='light' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'dark:text-white dark:border-gray-600'}`}>浅色</button>
                     <button onClick={() => handleThemeClick('dark')} className={`px-6 py-3 rounded-lg border ${currentTheme==='dark' ? 'bg-gray-700 border-gray-500 text-white' : 'dark:text-white dark:border-gray-600'}`}>深色</button>
                 </div>
            </div>
        );
    }

    if (subPage === 'account') {
        return <AccountSettings />;
    }

    if (subPage === 'perms') {
        return <PermissionsSettings />;
    }

    return null;
};

// --- PAGE 1: ACCOUNT SETTINGS (SELF) ---
const AccountSettings = () => {
    const user = authService.getCurrentUser();
    const [form, setForm] = useState({ username: '', password: '' });
    const [showPass, setShowPass] = useState(false);
    const [original, setOriginal] = useState({ username: '', password: '' });

    useEffect(() => {
        if (user) {
            const initial = { username: user.username, password: user.password || '' };
            setForm(initial);
            setOriginal(initial);
        }
    }, []);

    const hasChanges = JSON.stringify(form) !== JSON.stringify(original);

    const handleSave = async () => {
        if (!user || !hasChanges) return;
        try {
            await dataService.updateUser(user.id, { username: form.username, password: form.password });
            // Update local session
            const updated = { ...user, ...form };
            sessionStorage.setItem('sw_session_user', JSON.stringify(updated));
            setOriginal(form);
            alert("保存成功");
            window.location.reload();
        } catch(e: any) { alert(e.message); }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto dark:text-gray-100">
            <h1 className="text-2xl font-bold mb-6">账户设置</h1>
            <div className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-sm border dark:border-gray-700 max-w-lg space-y-6">
                <div>
                    <label className="block text-sm font-bold text-gray-500 uppercase mb-1">管理权限等级 (Level)</label>
                    <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-gray-600 dark:text-gray-400 font-mono font-bold">
                        {String(user?.role_level).padStart(2, '0')}
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-bold mb-1">用户名</label>
                    <input 
                        value={form.username} 
                        onChange={e => setForm({...form, username: e.target.value})}
                        className="w-full border p-3 rounded dark:bg-gray-800 dark:border-gray-600"
                    />
                </div>
                <div>
                    <label className="block text-sm font-bold mb-1">密码</label>
                    <div className="relative">
                        <input 
                            type={showPass ? "text" : "password"}
                            value={form.password}
                            onChange={e => setForm({...form, password: e.target.value})}
                            className="w-full border p-3 rounded dark:bg-gray-800 dark:border-gray-600 pr-10"
                        />
                        <button onClick={() => setShowPass(!showPass)} className="absolute right-3 top-3 text-gray-400">
                            {showPass ? <Icons.ArrowRightLeft size={16}/> : <Icons.ChevronDown size={16}/>}
                        </button>
                    </div>
                </div>
                
                <button 
                    onClick={handleSave}
                    disabled={!hasChanges}
                    className={`w-full py-3 rounded font-bold transition-all ${hasChanges ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md' : 'bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-800'}`}
                >
                    保存变更
                </button>
            </div>
        </div>
    );
};

// --- PAGE 2: PERMISSIONS SETTINGS (OTHERS) ---
const PermissionsSettings = () => {
    const currentUser = authService.getCurrentUser();
    const [subordinates, setSubordinates] = useState<User[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    
    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null); // Null = Create Mode

    const loadData = async () => {
        if (!currentUser) return;
        const [users, allStores] = await Promise.all([dataService.getUsers(), dataService.getStores()]);
        
        // Filter Strictly Lower Level (Higher Number)
        const subs = users.filter(u => u.role_level > currentUser.role_level);
        setSubordinates(subs);
        setStores(allStores);
    };

    useEffect(() => { loadData(); }, []);

    const handleDelete = async (id: string) => {
        if(!confirm("确定注销该账号？")) return;
        await dataService.deleteUser(id);
        loadData();
    };

    const handleResetPass = async (id: string) => {
        if(!confirm("重置密码为 1234?")) return;
        await dataService.updateUser(id, { password: '1234' });
        alert("密码已重置为 1234");
    };

    return (
        <div className="p-8 max-w-6xl mx-auto dark:text-gray-100">
             <div className="flex justify-between items-center mb-6">
                 <h1 className="text-2xl font-bold">权限设置 (下级管理)</h1>
                 <button 
                    onClick={() => { setEditingUser(null); setIsModalOpen(true); }}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-bold flex items-center gap-2"
                 >
                     <Icons.Plus size={18} /> 新增用户
                 </button>
             </div>

             <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 overflow-hidden shadow-sm">
                 <div className="p-4 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 font-bold text-gray-500 text-sm">
                     下级账号列表 (您的等级: {String(currentUser?.role_level).padStart(2, '0')})
                 </div>
                 {subordinates.length === 0 ? (
                     <div className="p-8 text-center text-gray-400">无下级用户</div>
                 ) : (
                     <div className="divide-y dark:divide-gray-800">
                         {subordinates.map(u => (
                             <div key={u.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                 <div>
                                     <div className="flex items-center gap-3">
                                         <span className="bg-blue-100 text-blue-800 text-xs font-mono px-2 py-1 rounded">Lv.{String(u.role_level).padStart(2,'0')}</span>
                                         <span className="font-bold">{u.username}</span>
                                     </div>
                                 </div>
                                 <div className="flex gap-2">
                                     <button onClick={() => { setEditingUser(u); setIsModalOpen(true); }} className="px-3 py-1 border rounded hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700 text-sm">修改权限</button>
                                     <button onClick={() => handleResetPass(u.id)} className="px-3 py-1 border rounded hover:bg-yellow-50 text-yellow-600 dark:border-gray-600 dark:text-yellow-500 text-sm">重置密码</button>
                                     <button onClick={() => handleDelete(u.id)} className="px-3 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 dark:border-gray-600 dark:hover:bg-red-900/20 text-sm">注销</button>
                                 </div>
                             </div>
                         ))}
                     </div>
                 )}
             </div>

             {isModalOpen && (
                 <PermissionModal 
                    isOpen={isModalOpen} 
                    onClose={() => setIsModalOpen(false)} 
                    targetUser={editingUser} 
                    currentUser={currentUser!}
                    allStores={stores}
                    onSave={loadData}
                 />
             )}
        </div>
    );
};

// --- PERMISSION MATRIX MODAL ---
const PermissionModal = ({ isOpen, onClose, targetUser, currentUser, allStores, onSave }: any) => {
    // Form State
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [roleLevel, setRoleLevel] = useState<number>(currentUser.role_level + 1);
    
    // Matrix State
    const [perms, setPerms] = useState<UserPermissions>({ ...DEFAULT_PERMISSIONS });
    const [allowedStores, setAllowedStores] = useState<Set<string>>(new Set());

    // Validation Snapshot
    const [originalJson, setOriginalJson] = useState('');

    useEffect(() => {
        if (targetUser) {
            setUsername(targetUser.username);
            setPassword(targetUser.password); // In real app, don't fill password
            setRoleLevel(targetUser.role_level);
            setPerms(targetUser.permissions || DEFAULT_PERMISSIONS);
            setAllowedStores(new Set(targetUser.allowed_store_ids || []));
            
            setOriginalJson(JSON.stringify({
                u: targetUser.username, p: targetUser.password, l: targetUser.role_level,
                perm: targetUser.permissions || DEFAULT_PERMISSIONS, 
                as: (targetUser.allowed_store_ids || []).sort()
            }));
        } else {
            // Default Create State
            setUsername(''); setPassword('123456'); 
            setRoleLevel(currentUser.role_level + 1);
            setPerms(DEFAULT_PERMISSIONS);
            setAllowedStores(new Set());
            setOriginalJson('');
        }
    }, [targetUser]);

    const getCurrentJson = () => JSON.stringify({
        u: username, p: password, l: roleLevel,
        perm: perms, as: Array.from(allowedStores).sort()
    });

    const hasChanges = !targetUser || getCurrentJson() !== originalJson;

    // Available Levels: Must be > currentUser.level
    const availableLevels = Array.from({length: 10}, (_, i) => i).filter(l => l > currentUser.role_level);

    const handleSave = async () => {
        if (!username || !password) return alert("用户名和密码必填");
        
        const userData: any = {
            username, password, role_level: roleLevel,
            permissions: perms,
            allowed_store_ids: Array.from(allowedStores)
        };

        try {
            if (targetUser) {
                await dataService.updateUser(targetUser.id, userData);
            } else {
                await dataService.createUser(userData);
            }
            onSave();
            onClose();
        } catch(e: any) { alert(e.message); }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
             <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-2xl shadow-2xl border dark:border-gray-700 flex flex-col max-h-[90vh]">
                 <div className="p-6 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800">
                     <h2 className="text-xl font-bold dark:text-white">{targetUser ? '修改权限配置' : '注册新用户'}</h2>
                     <button onClick={onClose}><Icons.Minus size={24} /></button>
                 </div>
                 
                 <div className="p-6 overflow-y-auto custom-scrollbar space-y-8 dark:text-gray-200">
                     {/* 1. Basic Info */}
                     <section className="space-y-4">
                         <h3 className="font-bold text-gray-400 uppercase text-xs tracking-wider border-b pb-1">基本属性</h3>
                         <div className="grid grid-cols-2 gap-4">
                             <div>
                                 <label className="block text-sm font-bold mb-1">用户名</label>
                                 <input value={username} onChange={e=>setUsername(e.target.value)} className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600"/>
                             </div>
                             <div>
                                 <label className="block text-sm font-bold mb-1">密码</label>
                                 <input value={password} onChange={e=>setPassword(e.target.value)} className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600"/>
                             </div>
                             <div className="col-span-2">
                                 <label className="block text-sm font-bold mb-1">管理权限等级 (Level)</label>
                                 <select 
                                    value={roleLevel} 
                                    onChange={e=>setRoleLevel(Number(e.target.value))}
                                    className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600 font-mono"
                                 >
                                     {availableLevels.map(l => <option key={l} value={l}>Level {String(l).padStart(2,'0')}</option>)}
                                 </select>
                                 <p className="text-xs text-gray-500 mt-1">只能分配比您 ({currentUser.role_level}) 低的等级。</p>
                             </div>
                         </div>
                     </section>

                     {/* 2. Function Matrix */}
                     <section className="space-y-6">
                         <h3 className="font-bold text-gray-400 uppercase text-xs tracking-wider border-b pb-1">功能权限矩阵</h3>
                         
                         {/* Logs */}
                         <div className="space-y-2">
                             <div className="font-bold text-sm">日志权限</div>
                             <div className="flex flex-col gap-2 pl-2">
                                 <label className="flex items-center gap-2 text-sm cursor-pointer">
                                     <input type="radio" checked={perms.logs_level === 'A'} onChange={()=>setPerms({...perms, logs_level: 'A'})} name="logs"/>
                                     <span><b>A级 (最高)</b>: 查看系统审计日志 + 任意修改/撤销</span>
                                 </label>
                                 <label className="flex items-center gap-2 text-sm cursor-pointer">
                                     <input type="radio" checked={perms.logs_level === 'B'} onChange={()=>setPerms({...perms, logs_level: 'B'})} name="logs"/>
                                     <span><b>B级</b>: 查看并撤销低等级用户日志</span>
                                 </label>
                                 <label className="flex items-center gap-2 text-sm cursor-pointer">
                                     <input type="radio" checked={perms.logs_level === 'C'} onChange={()=>setPerms({...perms, logs_level: 'C'})} name="logs"/>
                                     <span><b>C级</b>: 仅查看/撤销自己的操作</span>
                                 </label>
                             </div>
                         </div>

                         {/* Announcements */}
                         <div className="space-y-2">
                             <div className="font-bold text-sm">公告权限</div>
                             <div className="flex gap-4 pl-2">
                                 <label className="flex items-center gap-2 text-sm cursor-pointer">
                                     <input type="radio" checked={perms.announcement_rule === 'PUBLISH'} onChange={()=>setPerms({...perms, announcement_rule: 'PUBLISH'})} name="ann"/>
                                     <span>发布公告</span>
                                 </label>
                                 <label className="flex items-center gap-2 text-sm cursor-pointer">
                                     <input type="radio" checked={perms.announcement_rule === 'VIEW'} onChange={()=>setPerms({...perms, announcement_rule: 'VIEW'})} name="ann"/>
                                     <span>仅接收/查看</span>
                                 </label>
                             </div>
                         </div>

                         {/* Stores */}
                         <div className="space-y-2">
                             <div className="font-bold text-sm">门店范围 (数据隔离)</div>
                             <div className="flex gap-4 pl-2">
                                 <label className="flex items-center gap-2 text-sm cursor-pointer">
                                     <input type="radio" checked={perms.store_scope === 'GLOBAL'} onChange={()=>setPerms({...perms, store_scope: 'GLOBAL'})} name="store"/>
                                     <span>全局模式 (所有门店)</span>
                                 </label>
                                 <label className="flex items-center gap-2 text-sm cursor-pointer">
                                     <input type="radio" checked={perms.store_scope === 'LIMITED'} onChange={()=>setPerms({...perms, store_scope: 'LIMITED'})} name="store"/>
                                     <span>受限模式 (指定门店)</span>
                                 </label>
                             </div>
                             
                             {perms.store_scope === 'LIMITED' && (
                                 <div className="ml-6 p-3 bg-gray-50 dark:bg-gray-800 border rounded max-h-32 overflow-y-auto">
                                     <div className="text-xs text-gray-500 mb-2">请选择允许操作的门店:</div>
                                     <div className="space-y-1">
                                         {allStores.map((s: Store) => (
                                             <label key={s.id} className="flex items-center gap-2 text-sm">
                                                 <input 
                                                    type="checkbox" 
                                                    checked={allowedStores.has(s.id)} 
                                                    onChange={e => {
                                                        const set = new Set(allowedStores);
                                                        if(e.target.checked) set.add(s.id); else set.delete(s.id);
                                                        setAllowedStores(set);
                                                    }} 
                                                 />
                                                 <span>{s.name}</span>
                                             </label>
                                         ))}
                                     </div>
                                 </div>
                             )}
                         </div>

                         {/* Delete Mode */}
                         <div className="space-y-2">
                             <div className="font-bold text-sm">删除操作模式</div>
                             <div className="flex gap-4 pl-2">
                                 <label className="flex items-center gap-2 text-sm cursor-pointer">
                                     <input type="radio" checked={perms.delete_mode === 'HARD'} onChange={()=>setPerms({...perms, delete_mode: 'HARD'})} name="del"/>
                                     <span className="text-red-600">硬删除 (不可恢复)</span>
                                 </label>
                                 <label className="flex items-center gap-2 text-sm cursor-pointer">
                                     <input type="radio" checked={perms.delete_mode === 'SOFT'} onChange={()=>setPerms({...perms, delete_mode: 'SOFT'})} name="del"/>
                                     <span>软删除 (归档保留)</span>
                                 </label>
                             </div>
                         </div>

                         {/* Excel */}
                         <div className="space-y-2">
                             <div className="font-bold text-sm">Excel 导出</div>
                             <div className="pl-2">
                                 <label className="flex items-center gap-2 text-sm cursor-pointer">
                                     <input type="checkbox" checked={perms.show_excel} onChange={e=>setPerms({...perms, show_excel: e.target.checked})} />
                                     <span>显示“导出Excel”图标</span>
                                 </label>
                             </div>
                         </div>

                     </section>
                 </div>

                 <div className="p-6 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                     <button 
                        onClick={handleSave} 
                        disabled={!hasChanges}
                        className={`w-full py-3 rounded font-bold transition-all ${hasChanges ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md' : 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700'}`}
                     >
                         保存配置
                     </button>
                 </div>
             </div>
        </div>
    );
};
