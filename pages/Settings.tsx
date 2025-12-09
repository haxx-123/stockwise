
import React, { useState, useEffect, useRef } from 'react';
import { getSupabaseConfig, saveSupabaseConfig } from '../services/supabaseClient';
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
    
    // UPDATED SQL SCRIPT
    const sqlScript = `
-- STOCKWISE V3.0.0 ARCHITECTURE REFACTOR
-- SQL是/否较上一次发生更改: 是
-- SQL是/否必须包含重置数据库: 否

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ 
BEGIN 
    -- 1. Schema Updates (Safely add columns)
    
    -- Stores Table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stores') THEN
        CREATE TABLE stores (id text PRIMARY KEY, name text, location text, is_archived boolean default false);
    ELSE
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='is_archived') THEN
            ALTER TABLE stores ADD COLUMN is_archived boolean default false;
        END IF;
    END IF;

    -- Products Table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN
        CREATE TABLE products (id text PRIMARY KEY, name text, sku text, category text, unit_name text, split_unit_name text, split_ratio numeric, min_stock_level numeric, image_url text, is_archived boolean default false, bound_store_id text);
    ELSE
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='bound_store_id') THEN
            ALTER TABLE products ADD COLUMN bound_store_id text references stores(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='is_archived') THEN
            ALTER TABLE products ADD COLUMN is_archived boolean default false;
        END IF;
    END IF;

    -- Transactions Table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions') THEN
        CREATE TABLE transactions (id text PRIMARY KEY, type text, product_id text, store_id text, batch_id text, quantity numeric, balance_after numeric, timestamp timestamptz, note text, operator text, snapshot_data jsonb, is_undone boolean default false);
    ELSE
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='is_undone') THEN
            ALTER TABLE transactions ADD COLUMN is_undone boolean default false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='snapshot_data') THEN
            ALTER TABLE transactions ADD COLUMN snapshot_data jsonb;
        END IF;
    END IF;

    -- Announcements Table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='announcements' AND column_name='allow_delete') THEN
        ALTER TABLE announcements ADD COLUMN allow_delete boolean default true;
    END IF;

    -- Users Table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='face_descriptor') THEN
        ALTER TABLE users ADD COLUMN face_descriptor text;
    END IF;

    -- 2. Create Audit Logs Table if not exists
    CREATE TABLE IF NOT EXISTS system_audit_logs (
        id bigserial PRIMARY KEY,
        table_name text,
        record_id text,
        operation text,
        old_data jsonb,
        new_data jsonb,
        timestamp timestamptz default now()
    );

    -- 3. Permission Matrix Table (Robust Check)
    CREATE TABLE IF NOT EXISTS role_permissions (
        role_level integer PRIMARY KEY
    );
    
    -- Clean up legacy 'permissions' column from role_permissions if present
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='role_permissions' AND column_name='permissions') THEN
        ALTER TABLE role_permissions DROP COLUMN permissions;
    END IF;

    -- Clean up legacy 'permissions' column from users (Architecture Change)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='permissions') THEN
         ALTER TABLE users DROP COLUMN permissions;
    END IF;
    
    -- Explicitly check and add columns to role_permissions
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
        ALTER TABLE role_permissions ADD COLUMN hide_perm_page boolean DEFAULT false;
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

    -- 4. Initialization User
    IF NOT EXISTS (SELECT 1 FROM users WHERE username = '初始化') THEN
        INSERT INTO users (id, username, password, role_level, allowed_store_ids, is_archived)
        VALUES (
            gen_random_uuid(),
            '初始化',
            '123',
            9,
            '{}',
            false
        );
    END IF;

END $$;

-- 5. Insert Default Matrix if Empty (Safe Insert)
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

-- 6. Create LIVE VIEW for Users
DROP VIEW IF EXISTS live_users_v;
CREATE VIEW live_users_v AS
SELECT 
    u.id, 
    u.username, 
    u.password, 
    u.role_level, 
    u.allowed_store_ids, 
    u.is_archived, 
    u.face_descriptor,
    rp.logs_level, 
    rp.announcement_rule, 
    rp.store_scope, 
    rp.show_excel, 
    rp.view_peers, 
    rp.view_self_in_list, 
    rp.hide_perm_page, 
    rp.hide_audit_hall, 
    rp.hide_store_management, 
    rp.only_view_config
FROM users u
LEFT JOIN role_permissions rp ON u.role_level = rp.role_level;

-- 7. Safe Realtime Enablement
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'role_permissions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE role_permissions;
    END IF;
EXCEPTION 
    WHEN OTHERS THEN NULL; 
END $$;

-- 8. Functions & Triggers

-- Audit Trigger Function
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

-- Apply Audit Trigger to Batches (Idempotent)
drop trigger if exists audit_batches_trigger on batches;
create trigger audit_batches_trigger after insert or update or delete on batches for each row execute function log_audit_trail();

-- Stock Operation RPC
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
                <div className="bg-white dark:bg-gray-900 p-4 md:p-8 rounded-xl shadow-sm border dark:border-gray-700 flex flex-col gap-4 max-w-[100vw] overflow-hidden">
                    {/* Mobile Vertical Layout enforced via flex-col */}
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
                                onCopy={(e) => e.preventDefault()} // Prevent Copy
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

const FaceSetup = ({ user, onSuccess, onCancel }: any) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [status, setStatus] = useState('初始化相机...');

    const stopStream = () => {
        if(videoRef.current && videoRef.current.srcObject) {
            (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
            videoRef.current.srcObject = null;
        }
    };

    useEffect(() => {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
            .then(stream => {
                if(videoRef.current) videoRef.current.srcObject = stream;
                setStatus("请将脸部对准摄像头");
            })
            .catch(err => setStatus("相机访问失败: " + err.message));
        return () => stopStream();
    }, []);

    const capture = async () => {
        if (!videoRef.current) return;
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
        const base64 = canvas.toDataURL('image/jpeg', 0.8);
        
        setStatus("正在录入...");
        await dataService.updateUser(user.id, { face_descriptor: base64 });
        stopStream();
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
                <div className="flex gap-4 w-full">
                    <button onClick={() => {stopStream(); onCancel();}} className="flex-1 py-2 text-gray-500">取消</button>
                    <button onClick={capture} className="flex-1 py-2 bg-blue-600 text-white rounded font-bold">录入人脸</button>
                </div>
            </div>
        </div>
    );
};

const AccountSettings = () => {
    const user = authService.getCurrentUser();
    const [form, setForm] = useState({ username: '', password: '' });
    const [showPass, setShowPass] = useState(false);
    const [lowerUsers, setLowerUsers] = useState<User[]>([]);
    const [showFaceSetup, setShowFaceSetup] = useState(false);

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
            {/* SVIP Header for 00/01 */}
            {(user?.role_level === 0 || user?.role_level === 1) && (
                <div className="mb-6 flex justify-center">
                    <SVIPBadge name={user?.username || ''} roleLevel={user?.role_level} className="w-full max-w-md shadow-2xl scale-110" />
                </div>
            )}

            <h1 className="text-2xl font-bold mb-6">账户设置</h1>
            <div className="grid md:grid-cols-2 gap-8">
                <div className="bg-white dark:bg-gray-900 p-6 md:p-8 rounded-xl shadow-sm border dark:border-gray-700 space-y-6 w-full max-w-[100vw] overflow-hidden">
                    <h3 className="font-bold border-b pb-2 dark:border-gray-700">基本信息</h3>
                    <div>
                        <label className="block text-sm font-bold text-gray-500 uppercase mb-1">用户 ID (只读)</label>
                        <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded text-xs text-gray-500 font-mono break-all select-all">
                            {user?.id}
                        </div>
                    </div>
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
                    
                    <button onClick={()=>setShowFaceSetup(true)} className={`w-full py-3 rounded font-bold border ${user?.face_descriptor ? 'border-green-500 text-green-600 bg-green-50' : 'border-gray-300 text-gray-600'}`}>
                        {user?.face_descriptor ? '人脸已录入 (点击重新录入)' : '设置人脸识别登录'}
                    </button>

                    <button onClick={handleSave} className="w-full py-3 rounded font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-md">保存变更</button>
                    <button onClick={() => {if(confirm("确定要退出登录吗？")) authService.logout();}} className="w-full py-3 rounded font-bold border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-900/20">退出账号</button>
                </div>
                
                <div className="bg-white dark:bg-gray-900 p-6 md:p-8 rounded-xl shadow-sm border dark:border-gray-700 space-y-6 h-fit w-full max-w-[100vw] overflow-hidden">
                     <h3 className="font-bold border-b pb-2 dark:border-gray-700 flex items-center gap-2"><Icons.ArrowRightLeft size={18}/> 快速切换账户</h3>
                     <div className="max-h-60 overflow-y-auto custom-scrollbar border rounded dark:border-gray-700">
                         {lowerUsers.length === 0 && <div className="p-4 text-center text-gray-400 text-sm">无下级账户</div>}
                         {lowerUsers.map(u => (
                             <button key={u.id} onClick={() => handleSwitch(u)} className="w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-800 border-b dark:border-gray-800 flex justify-between items-center group">
                                 <UsernameBadge name={u.username} roleLevel={u.role_level} />
                                 <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-500 dark:text-gray-300">Lv.{u.role_level}</span>
                             </button>
                         ))}
                     </div>
                </div>
            </div>
            {showFaceSetup && <FaceSetup user={user} onSuccess={()=>{setShowFaceSetup(false); alert("录入成功"); window.location.reload();}} onCancel={()=>setShowFaceSetup(false)} />}
        </div>
    );
};

const PermissionsSettings = () => {
    const currentUser = authService.getCurrentUser();
    // Use Matrix to display role capabilities if we wanted to show them, but here we edit USERS.
    const { getPermission } = usePermissionContext(); 
    
    // We still use current user's matrix-based permissions to decide if they can view this page (handled by parent logic typically)
    const myPerms = getPermission(currentUser?.role_level ?? 9);

    const [subordinates, setSubordinates] = useState<User[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [formData, setFormData] = useState<Partial<User>>({});
    const [hasChanges, setHasChanges] = useState(false);

    const loadData = async () => {
        if (!currentUser) return;
        const [users, allStores] = await Promise.all([dataService.getUsers(), dataService.getStores()]);
        
        let subs: User[] = [];
        if (myPerms.view_peers) {
             subs = users.filter(u => u.role_level >= currentUser.role_level);
        } else {
             subs = users.filter(u => u.role_level > currentUser.role_level);
        }
        
        if (!myPerms.view_self_in_list) subs = subs.filter(u => u.id !== currentUser.id);
        
        // Show Self if enabled (explicitly check user preference or matrix)
        if (myPerms.view_self_in_list && !subs.find(u => u.id === currentUser.id)) {
            // If the query didn't return self (e.g. view_peers is false but view_self is true), manually add self if not present
            const selfUser = users.find(u => u.id === currentUser.id);
            if (selfUser) subs.unshift(selfUser);
        }

        setSubordinates(subs);
        setStores(allStores);
    };

    useEffect(() => { loadData(); }, []);

    const handleEdit = (user: User | null) => {
        if (user) {
            // Edit existing
            // Check: can I edit this user? 
            // If it's me, I can edit.
            // If it's peer (same level) and not me, I can only View? Requirement says "Show self and view peers selected means can edit self and CREATE peer".
            // It says "Only Create, Not Modify Peers".
            
            if (currentUser && user.role_level === currentUser.role_level && user.id !== currentUser.id) {
                alert("无权修改同级用户 (仅可查看/删除/新建)");
                return;
            }
            // Cannot edit higher level (already filtered out usually, but safety check)
            if (currentUser && user.role_level < currentUser.role_level) {
                 alert("无权修改上级用户");
                 return;
            }

            setEditingUser(user);
            setFormData(JSON.parse(JSON.stringify(user)));
        } else {
            // Create New
            setEditingUser(null);
            setFormData({
                username: '', password: '123', 
                role_level: (myPerms.view_peers ? currentUser?.role_level : (currentUser?.role_level || 0) + 1) as RoleLevel,
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
            // Ignore nested permission changes as they are now driven by Matrix (except maybe overrides if we kept that logic, but we are moving to matrix only)
            // But we keep it in state just in case, though the UI for overriding permissions should be disabled/removed per "Matrix" architecture? 
            // The prompt says "Architecture Refactor: Global Matrix". 
            // It implies individual user permissions are GONE.
            // So we should NOT allow editing individual permissions anymore.
            // But let's keep the code safe.
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
        
        const inputLevel = Number(formData.role_level);
        const myLevel = currentUser?.role_level || 0;
        
        if (editingUser) {
             // Modification - DEMOTE ONLY Logic
             const originalLevel = editingUser.role_level;
             
             // Rule: "Permission Level only modify to lower (higher number)"
             // Example: Me=2. Target=2. Original=2. Input=3. OK.
             // Example: Me=2. Target=3. Original=3. Input=2. FAIL (Promotion).
             
             if (inputLevel < originalLevel) {
                 return alert("权限等级只能往低修改 (数字变大)，不可往高修改！");
             }

             // Check against MY level (cannot promote someone to be higher than me)
             if (inputLevel < myLevel) {
                 return alert("不能将用户等级提升至高于您的等级");
             }
        } else {
             // Creation
             if (inputLevel < myLevel) return alert("不能创建比自己等级高的用户");
        }

        try {
            // Clean up permissions field before sending if API expects it, but our new View ignores it.
            // Actually, we should stop sending 'permissions' json since it's dropped.
            const { permissions, ...payload } = formData as any; 
            
            if (editingUser) await dataService.updateUser(editingUser.id, payload);
            else await dataService.createUser(payload);
            
            setIsModalOpen(false);
            loadData();
        } catch(e: any) { alert(e.message); }
    };

    const handleDeleteUser = async (u: User) => {
        if (currentUser && u.role_level < currentUser.role_level) {
             return alert("无法删除上级用户");
        }
        if (currentUser && u.role_level === currentUser.role_level && u.id !== currentUser.id) {
             // Allow deleting peer? Prompt says "Visible peers... can Create peer". 
             // Usually implies manage. Let's allow delete for now as per previous logic unless restricted.
        }
        if(confirm("确定删除该用户？(软删除)")) { await dataService.deleteUser(u.id); loadData(); }
    };

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto dark:text-gray-100">
             <div className="flex justify-between items-center mb-6">
                 <h1 className="text-2xl font-bold">权限设置</h1>
                 <button onClick={() => handleEdit(null)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2">
                     <Icons.Plus size={20}/> 新增用户
                 </button>
             </div>

             <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 overflow-x-auto shadow-sm w-full max-w-[100vw]">
                 <table className="w-full text-left min-w-[600px]">
                     <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                         <tr>
                             <th className="p-4">用户</th>
                             <th className="p-4">等级</th>
                             <th className="p-4">日志权限</th>
                             <th className="p-4">门店范围</th>
                             <th className="p-4 text-right">操作</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y dark:divide-gray-700">
                         {subordinates.map(u => {
                             // Get Live Permissions from Matrix for display
                             const p = getPermission(u.role_level);
                             return (
                                 <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                     <td className="p-4"><UsernameBadge name={u.username} roleLevel={u.role_level} /></td>
                                     <td className="p-4"><span className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-xs font-mono">{u.role_level}</span></td>
                                     <td className="p-4"><span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded text-xs font-bold">{p.logs_level}级</span></td>
                                     <td className="p-4 text-sm">{p.store_scope === 'GLOBAL' ? '全局' : `受限 (${u.allowed_store_ids.length})`}</td>
                                     <td className="p-4 text-right space-x-2">
                                         <button onClick={() => handleEdit(u)} className="text-blue-600 font-bold hover:underline">编辑</button>
                                         <button onClick={() => handleDeleteUser(u)} className="text-red-600 font-bold hover:underline">删除</button>
                                     </td>
                                 </tr>
                             );
                         })}
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
                             <div className="space-y-4">
                                 <h3 className="font-bold border-b dark:border-gray-700 pb-2">基本属性</h3>
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                     {editingUser && (
                                         <div className="md:col-span-2">
                                             <label className="block text-sm font-bold text-gray-500">ID (只读)</label>
                                             <div className="bg-gray-100 dark:bg-gray-800 p-2 text-xs font-mono break-all">{editingUser.id}</div>
                                         </div>
                                     )}
                                     <div><label className="block text-sm font-bold mb-1">用户名</label><input value={formData.username} onChange={e => handleChange('username', e.target.value)} className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white"/></div>
                                     <div><label className="block text-sm font-bold mb-1">密码</label><input value={formData.password} onChange={e => handleChange('password', e.target.value)} className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white"/></div>
                                     <div>
                                         <label className="block text-sm font-bold mb-1">等级 (0-9)</label>
                                         <input 
                                             type="number" 
                                             min={myPerms.view_peers ? currentUser?.role_level : (currentUser?.role_level||0)+1} 
                                             max="9" 
                                             value={formData.role_level} 
                                             onChange={e => handleChange('role_level', Number(e.target.value))} 
                                             className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                                         />
                                         <p className="text-xs text-gray-500 mt-1">您是等级 {currentUser?.role_level}，{myPerms.view_peers ? '可以创建同级用户' : '只能创建更低等级用户'}</p>
                                         {editingUser && <p className="text-xs text-red-500 font-bold">注意: 编辑时只能降低等级 (增大数字)</p>}
                                     </div>
                                 </div>
                             </div>

                             {/* STORE SCOPE - Only show if the TARGET LEVEL allows Limited scope in matrix? 
                                 Actually, store scope is defined in matrix (GLOBAL vs LIMITED).
                                 If the Target Level is LIMITED, we show the store selector.
                                 We need to know the matrix rule for the SELECTED role_level in the form.
                             */}
                             {(() => {
                                 const targetLevelPerms = getPermission(formData.role_level as RoleLevel);
                                 if (targetLevelPerms.store_scope === 'LIMITED') {
                                     return (
                                        <div className="space-y-4">
                                            <h3 className="font-bold border-b dark:border-gray-700 pb-2">门店分配 (该等级为受限范围)</h3>
                                            <div className="pl-4 border-l-2 border-blue-500 grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                                                {stores.map(s => (<label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.allowed_store_ids?.includes(s.id)} onChange={(e) => handleStoreChange(s.id, e.target.checked)} />{s.name}</label>))}
                                            </div>
                                        </div>
                                     );
                                 }
                                 return <p className="text-xs text-gray-500">该等级 ({formData.role_level}) 配置为全局门店范围，无需分配。</p>;
                             })()}

                             <div className="bg-orange-50 p-4 rounded text-xs text-orange-700 border border-orange-200">
                                 注意：具体权限 (日志/公告/功能显隐) 现已由 全局权限矩阵 (等级 {formData.role_level}) 统一控制，无法单独修改。
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
