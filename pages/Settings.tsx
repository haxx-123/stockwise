
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
    
    // SQL SCRIPT UPDATE (Include Reset and New Fields)
    const sqlScript = `
-- RESET SCHEMA FOR STOCKWISE 2.0 (Soft Delete & Isolation)
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
  location text,
  is_archived boolean default false
);

-- 2. Products (Strict Isolation Support)
create table products (
  id text primary key default gen_random_uuid(),
  name text not null, 
  sku text,
  category text,
  unit_name text,
  split_unit_name text,
  split_ratio integer,
  min_stock_level integer,
  image_url text,
  is_archived boolean default false,
  bound_store_id text references stores(id), -- If set, only visible in this store
  unique(name, bound_store_id) -- Name uniqueness per store scope
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

-- 4. Users (Permissions)
create table users (
  id text primary key default gen_random_uuid(),
  username text unique not null,
  password text not null, 
  role_level integer default 9, 
  permissions jsonb default '{}', 
  allowed_store_ids text[] default '{}',
  is_archived boolean default false
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

-- 7. Audit (Universal)
create table system_audit_logs (
  id bigserial primary key,
  table_name text,
  record_id text,
  operation text,
  old_data jsonb,
  new_data jsonb,
  timestamp timestamp default now()
);

-- FUNCTION: Audit Trigger
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

create trigger audit_all_changes after insert or update or delete on batches for each row execute function log_audit_trail();
create trigger audit_prod_changes after insert or update or delete on products for each row execute function log_audit_trail();
create trigger audit_store_changes after insert or update or delete on stores for each row execute function log_audit_trail();
create trigger audit_user_changes after insert or update or delete on users for each row execute function log_audit_trail();
create trigger audit_ann_changes after insert or update or delete on announcements for each row execute function log_audit_trail();

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

insert into stores (name) values ('默认总店');
`;

    if (subPage === 'config') {
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
                                <p>SQL Update: <span className="text-blue-500 font-bold">Yes (Logic V2)</span></p>
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

    if (subPage === 'account') return <AccountSettings />;
    if (subPage === 'perms') return <PermissionsSettings />;
    
    // Legacy mapping (These pages were removed but let's redirect logic if needed, or show empty)
    // The prompt says "Delete independent Announcement and Store settings pages". 
    // They are now accessed via other means or integrated. 
    // I will remove them from the sidebar in Sidebar.tsx, so these conditions won't be hit usually.
    return null;
};

// --- PAGE: ACCOUNT SETTINGS ---
const AccountSettings = () => {
    const user = authService.getCurrentUser();
    const [form, setForm] = useState({ username: '', password: '' });
    const [showPass, setShowPass] = useState(false);
    const [switchTarget, setSwitchTarget] = useState<User | null>(null);
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
        <div className="p-8 max-w-4xl mx-auto dark:text-gray-100">
            <h1 className="text-2xl font-bold mb-6">账户设置</h1>
            <div className="grid md:grid-cols-2 gap-8">
                <div className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-sm border dark:border-gray-700 space-y-6">
                    <h3 className="font-bold border-b pb-2 dark:border-gray-700">基本信息</h3>
                    <div>
                        <label className="block text-sm font-bold text-gray-500 uppercase mb-1">管理权限等级 (Level)</label>
                        <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-gray-600 dark:text-gray-400 font-mono font-bold">
                            {String(user?.role_level).padStart(2, '0')}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1">用户名</label>
                        <input 
                            value={form.username} onChange={e => setForm({...form, username: e.target.value})}
                            className="w-full border p-3 rounded dark:bg-gray-800 dark:border-gray-600"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1">密码</label>
                        <div className="relative">
                            <input 
                                type={showPass ? "text" : "password"}
                                value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                                className="w-full border p-3 rounded dark:bg-gray-800 dark:border-gray-600 pr-10"
                            />
                            <button onClick={() => setShowPass(!showPass)} className="absolute right-3 top-3 text-gray-400">
                                {showPass ? <Icons.ArrowRightLeft size={16}/> : <Icons.ChevronDown size={16}/>}
                            </button>
                        </div>
                    </div>
                    
                    <button onClick={handleSave} className="w-full py-3 rounded font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-md">
                        保存变更
                    </button>
                    
                    <button onClick={() => {if(confirm("确定要退出登录吗？")) authService.logout();}} className="w-full py-3 rounded font-bold border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-900/20">
                        退出账号
                    </button>
                </div>

                <div className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-sm border dark:border-gray-700 space-y-6 h-fit">
                     <h3 className="font-bold border-b pb-2 dark:border-gray-700 flex items-center gap-2">
                        <Icons.ArrowRightLeft size={18}/> 快速切换账户
                     </h3>
                     <p className="text-sm text-gray-500">您可以快速切换到权限等级低于您的账户，无需重新输入密码。</p>
                     
                     <div className="max-h-60 overflow-y-auto custom-scrollbar border rounded dark:border-gray-700">
                         {lowerUsers.length === 0 && <div className="p-4 text-center text-gray-400 text-sm">无下级账户</div>}
                         {lowerUsers.map(u => (
                             <button key={u.id} onClick={() => handleSwitch(u)} className="w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-800 border-b dark:border-gray-800 flex justify-between items-center group">
                                 <span className="font-bold text-sm">{u.username}</span>
                                 <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-500">Lv.{u.role_level}</span>
                             </button>
                         ))}
                     </div>
                </div>
            </div>
        </div>
    );
};

// --- PAGE: PERMISSIONS SETTINGS ---
const PermissionsSettings = () => {
    const currentUser = authService.getCurrentUser();
    const [subordinates, setSubordinates] = useState<User[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);

    const loadData = async () => {
        if (!currentUser) return;
        const [users, allStores] = await Promise.all([dataService.getUsers(), dataService.getStores()]);
        
        let subs: User[] = [];
        if (currentUser.permissions.view_peers) {
             // See Same Level AND Lower
             subs = users.filter(u => u.role_level >= currentUser.role_level);
        } else {
             // Only Lower
             subs = users.filter(u => u.role_level > currentUser.role_level);
        }

        if (!currentUser.permissions.view_self_in_list) {
            subs = subs.filter(u => u.id !== currentUser.id);
        }

        setSubordinates(subs);
        setStores(allStores);
    };

    useEffect(() => { loadData(); }, []);

    const handleDelete = async (id: string) => {
        if(!confirm("确定注销该账号？")) return;
        await dataService.deleteUser(id);
        loadData();
    };

    return (
        <div className="p-8 max-w-6xl mx-auto dark:text-gray-100">
             <div className="flex justify-between items-center mb-6">
                 <h1 className="text-2xl font-bold">权限设置 (用户管理)</h1>
                 <button 
                    onClick={() => { setEditingUser(null); setIsModalOpen(true); }}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-bold flex items-center gap-2"
                 >
                     <Icons.Plus size={18} /> 新增用户
                 </button>
             </div>

             <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 overflow-hidden shadow-sm">
                 <div className="p-4 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 font-bold text-gray-500 text-sm">
                     用户列表 (您的等级: {String(currentUser?.role_level).padStart(2, '0')})
                 </div>
                 {subordinates.length === 0 ? (
                     <div className="p-8 text-center text-gray-400">无可见用户</div>
                 ) : (
                     <div className="divide-y dark:divide-gray-800">
                         {subordinates.map(u => (
                             <div key={u.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                 <div>
                                     <div className="flex items-center gap-3">
                                         <span className={`text-xs font-mono px-2 py-1 rounded ${u.role_level === currentUser?.role_level ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>Lv.{String(u.role_level).padStart(2,'0')}</span>
                                         <span className="font-bold">{u.username}</span>
                                         {u.id === currentUser?.id && <span className="text-xs text-gray-400">(我自己)</span>}
                                     </div>
                                 </div>
                                 <div className="flex gap-2">
                                     <button onClick={() => { setEditingUser(u); setIsModalOpen(true); }} className="px-3 py-1 border rounded hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700 text-sm">修改权限</button>
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

// --- MODAL: PERMISSION MATRIX ---
const PermissionModal = ({ onClose, targetUser, currentUser, allStores, onSave }: any) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [roleLevel, setRoleLevel] = useState<number>(currentUser.role_level + 1);
    
    const [perms, setPerms] = useState<UserPermissions>({ ...DEFAULT_PERMISSIONS });
    const [allowedStores, setAllowedStores] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (targetUser) {
            setUsername(targetUser.username);
            setPassword(targetUser.password); 
            setRoleLevel(targetUser.role_level);
            setPerms(targetUser.permissions || DEFAULT_PERMISSIONS);
            setAllowedStores(new Set(targetUser.allowed_store_ids || []));
        } else {
            setUsername(''); setPassword('123456'); 
            setRoleLevel(currentUser.role_level + 1);
            setPerms(DEFAULT_PERMISSIONS);
            setAllowedStores(new Set());
        }
    }, [targetUser]);

    // Allow creating Same Level users if 'view_peers' is true
    const minLevel = currentUser.permissions.view_peers ? currentUser.role_level : currentUser.role_level + 1;
    const availableLevels = Array.from({length: 10}, (_, i) => i).filter(l => l >= minLevel);

    const handleSave = async () => {
        if (!username || !password) return alert("用户名和密码必填");
        const userData: any = {
            username, password, role_level: roleLevel,
            permissions: perms,
            allowed_store_ids: Array.from(allowedStores)
        };
        try {
            if (targetUser) await dataService.updateUser(targetUser.id, userData);
            else await dataService.createUser(userData);
            onSave(); onClose();
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
                     <section className="space-y-4">
                         <h3 className="font-bold text-gray-400 uppercase text-xs tracking-wider border-b pb-1">基本属性</h3>
                         <div className="grid grid-cols-2 gap-4">
                             <div><label className="block text-sm font-bold mb-1">用户名</label><input value={username} onChange={e=>setUsername(e.target.value)} className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600"/></div>
                             <div><label className="block text-sm font-bold mb-1">密码</label><input value={password} onChange={e=>setPassword(e.target.value)} className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600"/></div>
                             <div className="col-span-2">
                                 <label className="block text-sm font-bold mb-1">管理权限等级</label>
                                 <select value={roleLevel} onChange={e=>setRoleLevel(Number(e.target.value))} className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600 font-mono">
                                     {availableLevels.map(l => <option key={l} value={l}>Level {String(l).padStart(2,'0')}</option>)}
                                 </select>
                             </div>
                         </div>
                     </section>

                     <section className="space-y-6">
                         <h3 className="font-bold text-gray-400 uppercase text-xs tracking-wider border-b pb-1">权限矩阵</h3>
                         
                         {/* Visiblity Config */}
                         <div className="space-y-2 bg-gray-50 dark:bg-gray-800 p-3 rounded">
                            <div className="font-bold text-sm">用户可见性</div>
                            <div className="pl-2 space-y-1">
                                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={perms.view_peers} onChange={e=>setPerms({...perms, view_peers: e.target.checked})} /><span>允许查看/创建“同级用户”</span></label>
                                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={perms.view_self_in_list} onChange={e=>setPerms({...perms, view_self_in_list: e.target.checked})} /><span>在列表中显示“自己”</span></label>
                                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={perms.hide_perm_page} onChange={e=>setPerms({...perms, hide_perm_page: e.target.checked})} /><span>隐藏“权限设置”页面入口</span></label>
                            </div>
                         </div>

                         <div className="space-y-2">
                             <div className="font-bold text-sm">日志审计</div>
                             <div className="flex flex-col gap-2 pl-2">
                                 <label className="flex items-center gap-2 text-sm"><input type="radio" checked={perms.logs_level === 'A'} onChange={()=>setPerms({...perms, logs_level: 'A'})} name="logs"/><span>A级: 系统审计日志 + 任意撤销</span></label>
                                 <label className="flex items-center gap-2 text-sm"><input type="radio" checked={perms.logs_level === 'B'} onChange={()=>setPerms({...perms, logs_level: 'B'})} name="logs"/><span>B级: 下级用户日志 + 撤销下级</span></label>
                                 <label className="flex items-center gap-2 text-sm"><input type="radio" checked={perms.logs_level === 'C'} onChange={()=>setPerms({...perms, logs_level: 'C'})} name="logs"/><span>C级: 仅自己的操作</span></label>
                             </div>
                         </div>

                         <div className="space-y-2">
                             <div className="font-bold text-sm">门店范围</div>
                             <div className="flex gap-4 pl-2">
                                 <label className="flex items-center gap-2 text-sm"><input type="radio" checked={perms.store_scope === 'GLOBAL'} onChange={()=>setPerms({...perms, store_scope: 'GLOBAL'})} name="store"/><span>全局模式 (所有门店)</span></label>
                                 <label className="flex items-center gap-2 text-sm"><input type="radio" checked={perms.store_scope === 'LIMITED'} onChange={()=>setPerms({...perms, store_scope: 'LIMITED'})} name="store"/><span>受限模式 (指定门店)</span></label>
                             </div>
                             {perms.store_scope === 'LIMITED' && (
                                 <div className="ml-6 p-3 bg-gray-50 dark:bg-gray-800 border rounded max-h-32 overflow-y-auto">
                                     <div className="space-y-1">
                                         {allStores.map((s: Store) => (
                                             <label key={s.id} className="flex items-center gap-2 text-sm">
                                                 <input type="checkbox" checked={allowedStores.has(s.id)} onChange={e => {
                                                     const set = new Set(allowedStores);
                                                     if(e.target.checked) set.add(s.id); else set.delete(s.id);
                                                     setAllowedStores(set);
                                                 }} />
                                                 <span>{s.name}</span>
                                             </label>
                                         ))}
                                     </div>
                                 </div>
                             )}
                         </div>

                         <div className="space-y-2">
                             <div className="font-bold text-sm">功能开关</div>
                             <div className="pl-2 flex gap-4">
                                 <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={perms.show_excel} onChange={e=>setPerms({...perms, show_excel: e.target.checked})} /><span>显示 Excel 导出</span></label>
                                 <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={perms.announcement_rule === 'PUBLISH'} onChange={e=>setPerms({...perms, announcement_rule: e.target.checked ? 'PUBLISH' : 'VIEW'})} /><span>发布公告权限</span></label>
                             </div>
                         </div>
                     </section>
                 </div>
                 <div className="p-6 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                     <button onClick={handleSave} className="w-full py-3 rounded font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-md">保存配置</button>
                 </div>
             </div>
        </div>
    );
};
