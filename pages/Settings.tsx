import React, { useState, useEffect } from 'react';
import { getSupabaseConfig, saveSupabaseConfig } from '../services/supabaseClient';
import { authService } from '../services/authService';
import { dataService } from '../services/dataService';
import { User } from '../types';

export const Settings: React.FC<{ subPage?: string; onThemeChange?: (theme: string) => void }> = ({ subPage = 'config', onThemeChange }) => {
    const [url, setUrl] = useState('');
    const [key, setKey] = useState('');
    const [saved, setSaved] = useState(false);
    const user = authService.getCurrentUser();
    
    // Theme state
    const [currentTheme, setCurrentTheme] = useState(localStorage.getItem('sw_theme') || 'light');

    // Account state
    const [users, setUsers] = useState<User[]>([]);
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState(2); // Default staff

    useEffect(() => {
        const config = getSupabaseConfig();
        setUrl(config.url);
        setKey(config.key);
        if (subPage === 'account' && user?.role_level === 0) {
            dataService.getUsers().then(setUsers);
        }
    }, [subPage]);

    const handleSaveConfig = () => {
        saveSupabaseConfig(url.trim(), key.trim());
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        window.location.reload(); 
    };

    const handleLogout = () => {
        authService.logout();
    };

    const handleThemeClick = (theme: string) => {
        setCurrentTheme(theme);
        if (onThemeChange) onThemeChange(theme);
    };

    const handleCreateUser = async () => {
        if (!newUsername || !newPassword) return;
        try {
            await dataService.createUser({ username: newUsername, password: newPassword, role_level: newRole as any });
            setNewUsername(''); setNewPassword('');
            dataService.getUsers().then(setUsers);
        } catch(e:any) { alert(e.message); }
    };

    const handleDeleteUser = async (id: string) => {
        if(!confirm("确定删除?")) return;
        await dataService.deleteUser(id);
        dataService.getUsers().then(setUsers);
    };

    const sqlScript = `
-- RESET SCHEMA (Clean Start with CASCADE)
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

-- 2. Products (UNIQUE constraint on name)
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

-- 4. Users
create table users (
  id text primary key default gen_random_uuid(),
  username text unique not null,
  password text not null, 
  role_level integer default 2,
  default_store_id text references stores(id)
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
  snapshot_data jsonb
);

-- 6. Announcements
create table announcements (
  id text primary key default gen_random_uuid(),
  title text not null,
  content text,
  creator text,
  audience_role text default 'ALL',
  valid_until timestamp with time zone,
  popup_frequency text,
  created_at timestamp with time zone default now(),
  is_deleted boolean default false
);

-- 7. Audit Logs (System Level)
create table system_audit_logs (
  id bigserial primary key,
  table_name text,
  record_id text,
  operation text,
  old_data jsonb,
  new_data jsonb,
  timestamp timestamp default now()
);

-- TRIGGER FUNCTION
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

create trigger audit_batches_trigger
after insert or update or delete on batches
for each row execute function log_audit_trail();

create trigger audit_products_trigger
after insert or update or delete on products
for each row execute function log_audit_trail();


-- RPC FUNCTION: Atomic Stock Operation
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
  
  if v_new_qty < 0 then
    raise exception 'Insufficient stock.';
  end if;

  update batches set quantity = v_new_qty where id = p_batch_id;

  insert into transactions (
    id, type, product_id, store_id, batch_id, quantity, 
    balance_after, timestamp, note, operator, snapshot_data
  ) values (
    gen_random_uuid(), p_type, v_batch.product_id, v_batch.store_id, p_batch_id, p_qty_change,
    v_new_qty, now(), p_note, p_operator, p_snapshot
  );
end;
$$ language plpgsql;

-- Security Policies
alter table stores enable row level security;
alter table products enable row level security;
alter table batches enable row level security;
alter table transactions enable row level security;
alter table users enable row level security;
alter table announcements enable row level security;
alter table system_audit_logs enable row level security;

create policy "Public Access" on stores for all using (true) with check (true);
create policy "Public Access" on products for all using (true) with check (true);
create policy "Public Access" on batches for all using (true) with check (true);
create policy "Public Access" on transactions for all using (true) with check (true);
create policy "Public Access" on users for all using (true) with check (true);
create policy "Public Access" on announcements for all using (true) with check (true);
create policy "Public Access" on system_audit_logs for all using (true) with check (true);

-- INIT DATA
insert into stores (name) values ('默认总店');
`;

    if (subPage === 'config') {
        return (
            <div className="p-8 max-w-4xl mx-auto dark:text-gray-100">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">数据库连接配置</h1>
                <div className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 space-y-6 max-w-lg transition-colors">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Supabase Project URL</label>
                        <input value={url} onChange={(e) => setUrl(e.target.value)} className="w-full rounded-lg border dark:border-gray-600 dark:bg-gray-800 dark:text-white p-2.5 outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Supabase Anon Key</label>
                        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} className="w-full rounded-lg border dark:border-gray-600 dark:bg-gray-800 dark:text-white p-2.5 outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="flex items-center space-x-4">
                        <button onClick={handleSaveConfig} className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 shadow-md">保存配置</button>
                        {saved && <span className="text-green-600 text-sm">已保存</span>}
                    </div>
                    
                    <hr className="my-6 border-gray-200 dark:border-gray-700"/>
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">SQL 初始化脚本 (必须运行)</h3>
                    <div className="relative">
                        <pre className="bg-gray-950 text-gray-300 p-4 rounded-lg h-48 overflow-auto text-xs font-mono custom-scrollbar border border-gray-700">{sqlScript}</pre>
                        <button onClick={() => navigator.clipboard.writeText(sqlScript)} className="absolute top-2 right-2 text-xs bg-white/20 text-white px-2 py-1 rounded hover:bg-white/30">复制</button>
                    </div>
                </div>
            </div>
        );
    }
    
    if (subPage === 'theme') {
        return (
            <div className="p-8 max-w-4xl mx-auto dark:text-gray-100">
                <h1 className="text-2xl font-bold mb-6">应用主题</h1>
                <div className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-sm border dark:border-gray-700">
                    <div className="flex gap-4">
                        <button onClick={() => handleThemeClick('light')} className={`px-6 py-3 rounded-lg border ${currentTheme==='light' ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold' : 'dark:bg-gray-800 dark:border-gray-600'}`}>默认 (浅色)</button>
                        <button onClick={() => handleThemeClick('dark')} className={`px-6 py-3 rounded-lg border ${currentTheme==='dark' ? 'bg-gray-800 border-gray-500 text-white font-bold' : 'dark:bg-gray-800 dark:border-gray-600'}`}>深色</button>
                    </div>
                </div>
            </div>
        );
    }

    if (subPage === 'account') {
        return (
            <div className="p-8 max-w-4xl mx-auto dark:text-gray-100">
                <h1 className="text-2xl font-bold mb-6">账户设置</h1>
                <div className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-sm border dark:border-gray-700 mb-6">
                    <h3 className="font-bold mb-2">当前用户</h3>
                    <p>用户名: {user?.username}</p>
                    <p>权限等级: Lv.{user?.role_level}</p>
                    <button onClick={handleLogout} className="mt-4 bg-red-100 text-red-600 px-4 py-2 rounded">退出登录</button>
                </div>

                {user?.role_level === 0 && (
                    <div className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-sm border dark:border-gray-700">
                        <h3 className="font-bold mb-4">用户管理 (管理员)</h3>
                        <div className="flex gap-2 mb-4">
                            <input placeholder="新用户名" className="border p-2 rounded dark:bg-gray-800" value={newUsername} onChange={e=>setNewUsername(e.target.value)}/>
                            <input placeholder="密码" className="border p-2 rounded dark:bg-gray-800" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/>
                            <select className="border p-2 rounded dark:bg-gray-800" value={newRole} onChange={e=>setNewRole(Number(e.target.value))}>
                                <option value={0}>管理员 (0)</option>
                                <option value={1}>店长 (1)</option>
                                <option value={2}>员工 (2)</option>
                            </select>
                            <button onClick={handleCreateUser} className="bg-blue-600 text-white px-4 py-2 rounded">创建</button>
                        </div>
                        <div className="border-t pt-4 dark:border-gray-700">
                            {users.map(u => (
                                <div key={u.id} className="flex justify-between items-center py-2 border-b dark:border-gray-800 last:border-0">
                                    <span>{u.username} (Lv.{u.role_level})</span>
                                    {u.id !== user.id && <button onClick={()=>handleDeleteUser(u.id)} className="text-red-500 text-sm">删除</button>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }
    
    if (subPage === 'perms') {
        return (
            <div className="p-8 max-w-4xl mx-auto dark:text-gray-100">
                <h1 className="text-2xl font-bold mb-6">权限说明</h1>
                <div className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-sm border dark:border-gray-700">
                     <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                         <li><strong>Lv.0 (管理员)</strong>: 拥有所有权限，包括管理用户、物理删除数据、撤销他人操作。</li>
                         <li><strong>Lv.1 (店长)</strong>: 可以管理大部分业务，发布公告，但不能物理删除数据。</li>
                         <li><strong>Lv.2 (员工)</strong>: 仅能进行基本的出入库操作和查看自己门店的数据。</li>
                     </ul>
                </div>
            </div>
        );
    }

    return null;
};