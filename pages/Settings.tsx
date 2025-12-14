
import React, { useState, useEffect, useRef } from 'react';
import { getSupabaseConfig } from '../services/supabaseClient';
import { authService, DEFAULT_PERMISSIONS } from '../services/authService';
import { dataService } from '../services/dataService';
import { User, UserPermissions, RoleLevel } from '../types';
import { UsernameBadge } from '../components/UsernameBadge';
import { SVIPBadge } from '../components/SVIPBadge';
import { Icons } from '../components/Icons';
import { FaceAuth } from '../components/FaceAuth';
import { createPortal } from 'react-dom';

declare const window: any;

// ... (PermissionEditor Component remains the same) ...
const PermissionEditor: React.FC<{ 
    userId: string | null, 
    onClose: () => void, 
    currentUserLevel: number 
}> = ({ userId, onClose, currentUserLevel }) => {
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    // Initial Load: Fetch Fresh Data from DB
    useEffect(() => {
        const fetchTarget = async () => {
            if (userId) {
                // Edit Mode: Fetch fresh
                setIsCreating(false);
                const fetched = await dataService.getUser(userId);
                if (fetched) {
                    setUser(fetched);
                } else {
                    alert("用户不存在或已删除");
                    onClose();
                }
            } else {
                // Create Mode: Init blank user template
                setIsCreating(true);
                setUser({
                    id: '',
                    username: '',
                    password: '',
                    role_level: Math.min(9, currentUserLevel + 1) as RoleLevel, // Default to lower level
                    permissions: { ...DEFAULT_PERMISSIONS, role_level: Math.min(9, currentUserLevel + 1) as RoleLevel },
                    allowed_store_ids: []
                });
            }
            setLoading(false);
        };
        fetchTarget();
    }, [userId, currentUserLevel]);

    // Handle Basic Field Changes (Username, Pwd, Role)
    const handleFieldChange = async (key: keyof User, value: any) => {
        if (!user) return;
        
        // Optimistic Local Update
        const updated = { ...user, [key]: value };
        if (key === 'role_level') {
            updated.permissions.role_level = value; // Sync internal permission role level
        }
        setUser(updated);

        // Auto-save if not creating
        if (!isCreating) {
            try {
                await dataService.updateUser(user.id, { [key]: value });
            } catch (e) {
                console.error("Save failed", e);
            }
        }
    };

    // Handle Permission Toggle (Optimistic + Immediate Save)
    const handleTogglePerm = async (key: keyof UserPermissions) => {
        if (!user) return;

        const oldPerms = user.permissions;
        const newVal = !oldPerms[key];
        const newPerms = { ...oldPerms, [key]: newVal };
        
        // 1. Optimistic Update
        setUser({ ...user, permissions: newPerms });

        // 2. Background Save (if existing user)
        if (!isCreating) {
            try {
                await dataService.updateUser(user.id, { permissions: newPerms });
            } catch (e) {
                console.error("Perm save failed", e);
                // Revert
                setUser({ ...user, permissions: oldPerms });
                alert("设置保存失败，请重试");
            }
        }
    };

    const handleLogDescChange = async (level: 'A'|'B'|'C'|'D') => {
        if (!user) return;
        const newPerms = { ...user.permissions, logs_level: level };
        setUser({ ...user, permissions: newPerms });
        if (!isCreating) {
            await dataService.updateUser(user.id, { permissions: newPerms });
        }
    };

    const handleCreateUser = async () => {
        if (!user || !user.username || !user.password) return alert("用户名和密码必填");
        try {
            await dataService.createUser(user);
            alert("用户创建成功");
            onClose(); // Will trigger refresh in parent
        } catch (e: any) {
            alert("创建失败: " + e.message);
        }
    };

    if (loading) return createPortal(
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center backdrop-blur-sm">
            <div className="bg-white p-8 rounded-2xl font-bold animate-pulse">正在从数据库获取最新配置...</div>
        </div>,
        document.body
    );

    if (!user) return null;

    return createPortal(
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white dark:bg-gray-900 w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col border dark:border-gray-700">
                {/* Header */}
                <div className="p-6 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-between items-center shrink-0">
                    <h2 className="text-2xl font-black dark:text-white flex items-center gap-2">
                        {isCreating ? '新增用户' : '权限配置'}
                        {!isCreating && <UsernameBadge name={user.username} roleLevel={user.role_level}/>}
                    </h2>
                    <button onClick={onClose} className="p-2 bg-gray-200 dark:bg-gray-700 rounded-full hover:bg-gray-300 transition-colors"><Icons.Minus/></button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                    
                    {/* Basic Info Block */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-5 rounded-2xl border border-blue-100 dark:border-blue-800">
                        <h3 className="text-blue-800 dark:text-blue-300 font-bold mb-4 flex items-center gap-2"><Icons.User size={18}/> 基础信息</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1 block">用户名</label>
                                <input value={user.username} onChange={e=>handleFieldChange('username', e.target.value)} className="w-full p-2 rounded-xl border font-bold dark:bg-gray-800 dark:text-white dark:border-gray-600"/>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1 block">密码</label>
                                <input value={user.password || ''} onChange={e=>handleFieldChange('password', e.target.value)} className="w-full p-2 rounded-xl border font-mono dark:bg-gray-800 dark:text-white dark:border-gray-600"/>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1 block">管理权限等级 (00-09)</label>
                                <select 
                                    value={user.role_level} 
                                    onChange={e=>handleFieldChange('role_level', Number(e.target.value))}
                                    className="w-full p-2 rounded-xl border font-bold bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600"
                                >
                                    {[0,1,2,3,4,5,6,7,8,9].filter(l => l >= currentUserLevel).map(l => (
                                        <option key={l} value={l}>{String(l).padStart(2,'0')} {l === 0 ? '(最高)' : ''}</option>
                                    ))}
                                </select>
                            </div>
                            {!isCreating && (
                                <div>
                                    <label className="text-xs font-bold text-gray-500 mb-1 block">用户 ID (只读)</label>
                                    <div className="w-full p-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-xs font-mono text-gray-500 truncate dark:text-gray-400">{user.id}</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Permissions Block */}
                    <div className="space-y-6">
                        {/* 1. Log Perms */}
                        <div>
                            <h3 className="font-bold mb-3 dark:text-white border-b pb-2 dark:border-gray-700">日志权限</h3>
                            <div className="space-y-2">
                                {[
                                    { k: 'A', label: 'A级 (最高)', desc: '查看所有人日志 + 任意撤销 (危险)' },
                                    { k: 'B', label: 'B级 (管理)', desc: '查看所有人日志 + 仅撤销低等级用户操作' },
                                    { k: 'C', label: 'C级 (受限)', desc: '查看所有人日志 + 仅撤销自己的操作' },
                                    { k: 'D', label: 'D级 (个人)', desc: '仅查看自己日志 + 仅撤销自己的操作' },
                                ].map((opt: any) => (
                                    <label key={opt.k} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${user.permissions.logs_level === opt.k ? 'bg-black text-white border-black shadow-lg dark:bg-blue-600 dark:border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'}`}>
                                        <div>
                                            <div className="font-black text-sm">{opt.label}</div>
                                            <div className="text-xs opacity-80">{opt.desc}</div>
                                        </div>
                                        <input type="radio" name="log_level" checked={user.permissions.logs_level === opt.k} onChange={()=>handleLogDescChange(opt.k)} className="w-5 h-5 accent-white"/>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* 2. Toggle Matrix */}
                        <div>
                            <h3 className="font-bold mb-3 dark:text-white border-b pb-2 dark:border-gray-700">功能开关 (点击即时生效)</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <PermToggle label="允许导出 Excel" checked={user.permissions.show_excel} onChange={()=>handleTogglePerm('show_excel')} />
                                <PermToggle label="同级列表可见性 (查看/创建同级)" checked={user.permissions.view_peers} onChange={()=>handleTogglePerm('view_peers')} />
                                <PermToggle label="自身可见性 (列表显示自己)" checked={user.permissions.view_self_in_list} onChange={()=>handleTogglePerm('view_self_in_list')} />
                                
                                <PermToggle label="隐藏 [审计大厅] 页面" checked={user.permissions.hide_audit_hall} onChange={()=>handleTogglePerm('hide_audit_hall')} warn />
                                <PermToggle label="隐藏 [权限设置] 页面 (入口)" checked={user.permissions.hide_perm_page} onChange={()=>handleTogglePerm('hide_perm_page')} warn />
                                <PermToggle label="隐藏 [新建门店] 页面" checked={user.permissions.hide_new_store_btn} onChange={()=>handleTogglePerm('hide_new_store_btn')} warn />
                                <PermToggle label="隐藏 [Excel导出] 按钮" checked={user.permissions.hide_excel_export_btn} onChange={()=>handleTogglePerm('hide_excel_export_btn')} warn />
                                <PermToggle label="隐藏 [门店修改] 按钮" checked={user.permissions.hide_store_edit_btn} onChange={()=>handleTogglePerm('hide_store_edit_btn')} warn />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer for Create Mode */}
                {isCreating && (
                    <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0">
                        <button onClick={handleCreateUser} className="w-full py-3 bg-black text-white rounded-xl font-bold shadow-lg hover:scale-[1.01] transition-transform">
                            确认创建用户
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

const PermToggle = ({ label, checked, onChange, warn }: any) => (
    <div onClick={onChange} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer select-none transition-all active:scale-95 ${checked ? 'bg-black text-white border-black dark:bg-green-600 dark:border-green-600 shadow-md' : 'bg-white text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'}`}>
        <span className={`font-bold text-sm ${warn && checked ? 'text-red-300' : ''}`}>{label}</span>
        <div className={`w-10 h-6 rounded-full p-1 transition-colors ${checked ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600'}`}>
            <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-4' : ''}`}></div>
        </div>
    </div>
);


export const Settings: React.FC<{ subPage?: string; onThemeChange?: (theme: string) => void }> = ({ subPage, onThemeChange }) => {
    // ... (All logic remains same as previous, just updating the SQL_CODE constant at the bottom) ...
    const [users, setUsers] = useState<User[]>([]);
    const currentUser = authService.getCurrentUser();
    
    // Permission Management State
    const [editorUserId, setEditorUserId] = useState<string | null>(null); // If null, means create mode if modal open? No, use explicit null for create
    const [showEditor, setShowEditor] = useState(false);
    
    // Account Settings State
    const [editForm, setEditForm] = useState({ username: '', password: '' });
    const [originalForm, setOriginalForm] = useState({ username: '', password: '' });
    const [newFaceDescriptor, setNewFaceDescriptor] = useState<string | null>(null);
    const [isFaceAuthOpen, setIsFaceAuthOpen] = useState(false);
    
    // Account Switching State
    const [showSwitchModal, setShowSwitchModal] = useState(false);
    const [switchableUsers, setSwitchableUsers] = useState<User[]>([]);

    // Theme State
    const [activeTheme, setActiveTheme] = useState(localStorage.getItem('sw_theme') || 'theme-prism');

    useEffect(() => {
        if(subPage === 'perms' || subPage === 'account') loadUsers();
    }, [subPage, showEditor]);

    useEffect(() => {
        if (currentUser && subPage === 'account') {
            const initData = { 
                username: currentUser.username, 
                password: currentUser.password || '' 
            };
            setEditForm(initData);
            setOriginalForm(initData);
            setNewFaceDescriptor(null);
        }
    }, [currentUser, subPage]);

    const loadUsers = async () => {
        const u = await dataService.getUsers();
        setUsers(u);
        if (currentUser) {
            const lower = u.filter(target => target.role_level > currentUser.role_level);
            setSwitchableUsers(lower);
        }
    };

    const hasChanges = () => {
        const textChanged = JSON.stringify(editForm) !== JSON.stringify(originalForm);
        const faceChanged = newFaceDescriptor !== null;
        return textChanged || faceChanged;
    };

    const handleSaveAccount = async () => {
        if (!currentUser || !hasChanges()) return;
        try {
            const updates: any = { username: editForm.username, password: editForm.password };
            if (newFaceDescriptor) {
                updates.face_descriptor = JSON.parse(newFaceDescriptor);
            }
            await dataService.updateUser(currentUser.id, updates);
            const updatedUser = { ...currentUser, ...updates };
            authService.setSession(updatedUser);
            setOriginalForm(editForm);
            setNewFaceDescriptor(null);
            alert("账户信息已保存");
        } catch (e: any) { alert("保存失败: " + e.message); }
    };

    const handleFaceCapture = (descriptor: string) => {
        setNewFaceDescriptor(descriptor);
        setIsFaceAuthOpen(false);
    };

    const handleSwitchAccount = async (targetUser: User) => {
        if(window.confirm(`确定切换到账户 "${targetUser.username}" 吗？`)) {
            await authService.switchAccount(targetUser);
        }
    };

    const handleDeleteUser = async (u: User) => {
        if (!window.confirm(`确定要删除用户 "${u.username}" 吗？\n(此操作为全员软删除，数据保留在数据库但不再显示)`)) return;
        try { await dataService.deleteUser(u.id); loadUsers(); } catch (e: any) { alert("删除失败: " + e.message); }
    };

    const handleThemeSwitch = (theme: string) => {
        localStorage.setItem('sw_theme', theme);
        setActiveTheme(theme);
        document.documentElement.className = theme;
        if (theme.includes('dark')) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    };

    // --- FULL SQL CODE ---
    const SQL_CODE = `
-- ==========================================
-- StockWise 数据库初始化脚本 (Supabase / Postgres)
-- ==========================================

-- 1. 用户表
CREATE TABLE IF NOT EXISTS public.users (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    username text NOT NULL,
    password text NOT NULL,
    role_level int4 NOT NULL DEFAULT 9,
    -- 扁平化存储权限字段，简化查询
    logs_level text DEFAULT 'D',
    announcement_rule text DEFAULT 'VIEW',
    store_scope text DEFAULT 'LIMITED',
    show_excel boolean DEFAULT false,
    view_peers boolean DEFAULT false,
    view_self_in_list boolean DEFAULT true,
    hide_perm_page boolean DEFAULT false,
    hide_audit_hall boolean DEFAULT true,
    hide_store_management boolean DEFAULT true,
    only_view_config boolean DEFAULT false,
    hide_new_store_btn boolean DEFAULT false,
    hide_excel_export_btn boolean DEFAULT false,
    hide_store_edit_btn boolean DEFAULT false,
    
    allowed_store_ids text[] DEFAULT '{}'::text[],
    is_archived boolean DEFAULT false,
    face_descriptor float4[], -- 人脸向量 (简单数组存储)
    
    CONSTRAINT users_pkey PRIMARY KEY (id)
);

-- 2. 门店表
CREATE TABLE IF NOT EXISTS public.stores (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    location text,
    image_url text,
    parent_id uuid, -- 母门店ID
    managers text[] DEFAULT '{}'::text[], -- 管理员 ID 数组
    viewers text[] DEFAULT '{}'::text[],  -- 浏览者 ID 数组
    is_archived boolean DEFAULT false,
    
    CONSTRAINT stores_pkey PRIMARY KEY (id)
);

-- 3. 商品表
CREATE TABLE IF NOT EXISTS public.products (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    sku text,
    category text,
    unit_name text, -- 大单位
    split_unit_name text, -- 小单位
    split_ratio int4 DEFAULT 1,
    min_stock_level int4 DEFAULT 10,
    image_url text,
    remark text,
    pinyin text,
    is_archived boolean DEFAULT false,
    bound_store_id uuid, -- 绑定门店(可选)
    
    CONSTRAINT products_pkey PRIMARY KEY (id)
);

-- 4. 批次库存表
CREATE TABLE IF NOT EXISTS public.batches (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES public.products(id),
    store_id uuid NOT NULL REFERENCES public.stores(id),
    batch_number text,
    quantity int4 NOT NULL DEFAULT 0, -- 最小单位数量
    expiry_date timestamptz,
    created_at timestamptz DEFAULT now(),
    is_archived boolean DEFAULT false,
    image_url text,
    remark text,
    
    CONSTRAINT batches_pkey PRIMARY KEY (id)
);

-- 5. 操作日志表 (原子日志)
CREATE TABLE IF NOT EXISTS public.operation_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    action_type text NOT NULL, -- IN, OUT, ADJUST, DELETE, IMPORT
    target_id uuid NOT NULL, -- Batch ID
    change_delta int4 NOT NULL,
    snapshot_data jsonb, -- 当时的数据快照
    operator_id text NOT NULL, -- Username
    created_at timestamptz DEFAULT now(),
    is_revoked boolean DEFAULT false, -- 是否已撤销
    
    CONSTRAINT operation_logs_pkey PRIMARY KEY (id)
);

-- 6. 公告表
CREATE TABLE IF NOT EXISTS public.announcements (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    type text DEFAULT 'ANNOUNCEMENT', -- ANNOUNCEMENT / SUGGESTION
    title text NOT NULL,
    content text NOT NULL,
    creator text NOT NULL,
    creator_id text,
    creator_role int4,
    target_users text[] DEFAULT '{}'::text[],
    popup_config jsonb, -- { enabled: bool, frequency: string }
    allow_hide boolean DEFAULT true,
    is_force_deleted boolean DEFAULT false,
    read_by text[] DEFAULT '{}'::text[],
    hidden_by text[] DEFAULT '{}'::text[],
    created_at timestamptz DEFAULT now(),
    
    CONSTRAINT announcements_pkey PRIMARY KEY (id)
);

-- 7. 系统审计表 (登录/设备)
CREATE TABLE IF NOT EXISTS public.system_audit_logs (
    id bigserial NOT NULL,
    table_name text NOT NULL,
    record_id text,
    operation text NOT NULL,
    old_data jsonb,
    new_data jsonb,
    timestamp timestamptz DEFAULT now(),
    
    CONSTRAINT system_audit_logs_pkey PRIMARY KEY (id)
);

-- 视图: 活跃用户
CREATE OR REPLACE VIEW public.live_users_v AS
 SELECT * FROM public.users WHERE is_archived = false;

-- RLS (简单起见，如果开启 RLS 需要添加策略)
-- ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Enable all for anon" ON public.users FOR ALL USING (true);
    `;

    if (subPage === 'theme') {
        // ... (Theme UI Code remains same) ...
        return (
            <div className="p-8 max-w-4xl mx-auto space-y-6">
                <h1 className="text-3xl font-black mb-8">应用主题</h1>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Prism */}
                    <button onClick={() => handleThemeSwitch('theme-prism')} className={`relative overflow-hidden rounded-3xl h-64 border-4 transition-all duration-300 ${activeTheme === 'theme-prism' ? 'border-blue-500 scale-105 shadow-2xl' : 'border-transparent hover:scale-105'}`}>
                        <div className="absolute inset-0 bg-[#888888]"></div>
                        <div className="absolute inset-4 bg-white/15 backdrop-blur-[25px] border border-white/20 rounded-2xl flex flex-col items-center justify-center p-4">
                            <span className="text-2xl font-bold text-black mb-2">棱镜色</span>
                            <span className="text-xs text-black opacity-70">Deep Glassmorphism</span>
                        </div>
                    </button>

                    {/* Dark */}
                    <button onClick={() => handleThemeSwitch('theme-dark')} className={`relative overflow-hidden rounded-3xl h-64 border-4 transition-all duration-300 ${activeTheme === 'theme-dark' ? 'border-blue-500 scale-105 shadow-2xl' : 'border-transparent hover:scale-105'}`}>
                        <div className="absolute inset-0 bg-black"></div>
                        <div className="absolute inset-4 bg-[#1a1a1a] border border-white/10 rounded-2xl flex flex-col items-center justify-center p-4">
                             <span className="text-2xl font-bold text-white mb-2">深色模式</span>
                             <span className="text-xs text-white opacity-70">High Contrast Dark</span>
                        </div>
                    </button>

                    {/* Light */}
                    <button onClick={() => handleThemeSwitch('theme-light')} className={`relative overflow-hidden rounded-3xl h-64 border-4 transition-all duration-300 ${activeTheme === 'theme-light' ? 'border-blue-500 scale-105 shadow-2xl' : 'border-transparent hover:scale-105'}`}>
                        <div className="absolute inset-0 bg-gray-100"></div>
                        <div className="absolute inset-4 bg-white border border-gray-200 rounded-2xl flex flex-col items-center justify-center p-4 shadow-sm">
                             <span className="text-2xl font-bold text-black mb-2">浅色模式</span>
                             <span className="text-xs text-gray-500">Standard Light</span>
                        </div>
                    </button>
                </div>
            </div>
        );
    }

    if (subPage === 'account') {
        // ... (Account UI Code remains same - returning it completely) ...
        const canSave = hasChanges();
        return (
            <div className="p-8 max-w-3xl mx-auto space-y-8 animate-fade-in pb-24">
                <h1 className="text-3xl font-black mb-4">账户设置</h1>
                {(currentUser?.role_level === 0 || currentUser?.role_level === 1) && (
                    <div className="mb-4">
                        <SVIPBadge name={currentUser.username} roleLevel={currentUser.role_level} className="w-full h-32 text-2xl" />
                    </div>
                )}
                <div className="glass-panel p-6 rounded-3xl shadow-sm border border-white/20">
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 border-b border-black/5 pb-2">身份信息 (不可修改)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="text-xs font-bold text-gray-400 mb-1 block">用户 ID (Supabase UID)</label>
                            <div className="font-mono text-sm bg-black/5 dark:bg-white/10 p-3 rounded-xl break-all">
                                {currentUser?.id}
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-400 mb-1 block">管理权限等级</label>
                            <div className="flex items-center gap-3 bg-black/5 dark:bg-white/10 p-2.5 rounded-xl">
                                <div className="w-8 h-8 bg-black text-white rounded-full flex items-center justify-center font-bold font-mono">
                                    {String(currentUser?.role_level).padStart(2,'0')}
                                </div>
                                <span className="font-bold text-sm">
                                    {currentUser?.role_level === 0 ? '最高管理员 (Owner)' : 
                                     currentUser?.role_level === 1 ? '副管理员 (Admin)' : '普通成员'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="glass-panel p-6 rounded-3xl shadow-lg border border-white/20">
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 border-b border-black/5 pb-2">基本资料 (自定义)</h3>
                    <div className="space-y-5">
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">用户名</label>
                            <input value={editForm.username} onChange={e => setEditForm({...editForm, username: e.target.value})} className="w-full p-4 border rounded-2xl font-bold text-lg bg-white/40 dark:bg-black/20 focus:ring-2 focus:ring-blue-500 outline-none transition-all"/>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">登录密码</label>
                            <input type="password" value={editForm.password} onChange={e => setEditForm({...editForm, password: e.target.value})} className="w-full p-4 border rounded-2xl font-bold text-lg bg-white/40 dark:bg-black/20 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono tracking-widest"/>
                        </div>
                        <div className="pt-2">
                            <label className="text-xs font-bold text-gray-500 mb-2 block">生物识别</label>
                            <div className="flex items-center justify-between bg-white/40 dark:bg-black/20 p-4 rounded-2xl border border-white/10">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-full ${newFaceDescriptor ? 'bg-green-100 text-green-600' : (currentUser?.face_descriptor ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-400')}`}><Icons.Scan size={24}/></div>
                                    <div>
                                        <div className="font-bold text-sm">Face ID 人脸识别</div>
                                        <div className="text-xs opacity-60">{newFaceDescriptor ? '已录入新数据 (待保存)' : (currentUser?.face_descriptor ? '已设置' : '未设置')}</div>
                                    </div>
                                </div>
                                <button onClick={()=>setIsFaceAuthOpen(true)} className="px-4 py-2 bg-white dark:bg-gray-700 shadow-sm rounded-xl text-xs font-bold hover:scale-105 transition-transform">{currentUser?.face_descriptor ? '重新录入' : '立即设置'}</button>
                            </div>
                        </div>
                    </div>
                    <div className="mt-8">
                        <button onClick={handleSaveAccount} disabled={!canSave} className={`w-full py-4 rounded-2xl font-black text-lg transition-all shadow-lg flex items-center justify-center gap-2 ${canSave ? 'bg-black text-white hover:scale-[1.02] cursor-pointer' : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'}`}><Icons.Box size={20}/> 保存修改</button>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setShowSwitchModal(true)} className="py-4 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-2xl font-bold border-2 border-indigo-100 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center justify-center gap-2"><Icons.ArrowRightLeft size={20}/> 切换账户</button>
                    <button onClick={() => authService.logout()} className="py-4 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 rounded-2xl font-bold border-2 border-red-100 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors flex items-center justify-center gap-2"><Icons.LogOut size={20}/> 退出登录</button>
                </div>
                {isFaceAuthOpen && <FaceAuth mode="REGISTER" onSuccess={()=>{}} onCapture={handleFaceCapture} onCancel={()=>setIsFaceAuthOpen(false)} />}
                {showSwitchModal && createPortal(
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl flex flex-col max-h-[80vh]">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-black dark:text-white">切换账户</h3>
                                <button onClick={()=>setShowSwitchModal(false)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full"><Icons.Minus/></button>
                            </div>
                            <p className="text-sm text-gray-500 mb-4">仅显示权限等级低于您的账户 (数字 > {currentUser?.role_level})</p>
                            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
                                {switchableUsers.length === 0 ? (<div className="text-center py-8 text-gray-400 font-bold">无可用账户</div>) : (switchableUsers.map(u => (
                                    <button key={u.id} onClick={() => handleSwitchAccount(u)} className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-transparent hover:border-black dark:hover:border-white transition-all group">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center font-bold text-gray-600 dark:text-gray-300">{String(u.role_level).padStart(2,'0')}</div>
                                            <div className="text-left">
                                                <div className="font-bold text-black dark:text-white">{u.username}</div>
                                                <div className="text-xs text-gray-400">ID: {u.id.substring(0,8)}...</div>
                                            </div>
                                        </div>
                                        <Icons.ChevronRight className="text-gray-300 group-hover:text-black dark:group-hover:text-white"/>
                                    </button>
                                )))}
                            </div>
                        </div>
                    </div>, document.body
                )}
            </div>
        );
    }

    if (subPage === 'perms') {
        // ... (Perms UI Code remains same - returning complete block) ...
        const myLevel = currentUser?.role_level || 9;
        const perms = currentUser?.permissions || DEFAULT_PERMISSIONS;
        const filteredUsers = users.filter(u => {
            if (u.is_archived) return false;
            if (u.role_level > myLevel) return true;
            if (perms.view_peers && u.role_level === myLevel) {
                if (!perms.view_self_in_list && u.id === currentUser?.id) return false;
                return true;
            }
            if (perms.view_self_in_list && u.id === currentUser?.id) return true;
            return false;
        });

        return (
            <div className="p-4 md:p-8 animate-fade-in">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-black text-black dark:text-white">权限设置</h1>
                    <button onClick={() => { setEditorUserId(null); setShowEditor(true); }} className="bg-black text-white px-6 py-3 rounded-2xl font-bold shadow-lg hover:scale-105 transition-transform flex items-center gap-2"><Icons.Plus size={20}/> 新增用户</button>
                </div>
                <div className="hidden md:block glass-panel rounded-3xl overflow-hidden shadow-sm border border-white/20">
                    <table className="w-full text-left">
                        <thead className="bg-black/5 dark:bg-white/5 font-bold uppercase border-b border-black/5">
                            <tr><th className="p-5">用户 / 等级</th><th className="p-5">日志权限</th><th className="p-5">关键特权</th><th className="p-5 text-right">操作</th></tr>
                        </thead>
                        <tbody className="divide-y divide-black/5 dark:divide-white/5">
                            {filteredUsers.map(u => (
                                <tr key={u.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                                    <td className="p-5"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center font-black font-mono shadow-sm">{String(u.role_level).padStart(2,'0')}</div><div><UsernameBadge name={u.username} roleLevel={u.role_level}/><div className="text-xs text-gray-500 font-mono mt-0.5">{u.id.substring(0,8)}...</div></div></div></td>
                                    <td className="p-5"><span className="font-mono font-bold bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-xs">Level {u.permissions.logs_level}</span></td>
                                    <td className="p-5 text-xs font-bold text-gray-500 space-x-2">{u.permissions.show_excel && <span className="text-green-600 bg-green-50 px-2 py-1 rounded">Excel</span>}{!u.permissions.hide_audit_hall && <span className="text-purple-600 bg-purple-50 px-2 py-1 rounded">审计</span>}{!u.permissions.hide_store_management && <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded">门店</span>}</td>
                                    <td className="p-5 text-right space-x-2"><button onClick={() => { setEditorUserId(u.id); setShowEditor(true); }} className="px-4 py-2 bg-black text-white rounded-xl font-bold text-xs hover:scale-105 transition-transform">设置</button><button onClick={() => handleDeleteUser(u)} className="px-4 py-2 bg-red-50 text-red-500 rounded-xl font-bold text-xs hover:bg-red-100 transition-colors">删除</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="md:hidden grid grid-cols-1 gap-4">
                    {filteredUsers.map(u => (
                        <div key={u.id} className="glass-panel p-5 rounded-2xl shadow-sm border border-white/20 flex flex-col gap-4">
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-3"><div className="w-12 h-12 bg-black text-white rounded-2xl flex items-center justify-center font-black text-lg shadow-lg">{String(u.role_level).padStart(2,'0')}</div><div><UsernameBadge name={u.username} roleLevel={u.role_level}/><div className="text-xs text-gray-500 mt-1">Log Level: {u.permissions.logs_level}</div></div></div>
                            </div>
                            <div className="flex gap-2"><button onClick={() => { setEditorUserId(u.id); setShowEditor(true); }} className="flex-1 py-3 bg-black text-white rounded-xl font-bold text-sm shadow-md">设置权限</button><button onClick={() => handleDeleteUser(u)} className="px-4 py-3 bg-red-50 text-red-500 rounded-xl font-bold border border-red-100"><Icons.Minus size={18}/></button></div>
                        </div>
                    ))}
                </div>
                {showEditor && <PermissionEditor userId={editorUserId} onClose={() => setShowEditor(false)} currentUserLevel={currentUser?.role_level || 9}/>}
            </div>
        );
    }

    if (subPage === 'config' && currentUser?.role_level === 0) {
        return (
            <div className="p-8">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold">数据库初始化脚本</h3>
                    <button onClick={()=>navigator.clipboard.writeText(SQL_CODE).then(()=>alert('已复制'))} className="text-xs bg-black text-white px-3 py-1 rounded-lg">复制 SQL</button>
                </div>
                <pre className="bg-gray-900 text-green-400 p-6 rounded-3xl overflow-auto text-xs font-mono h-[70vh] border border-gray-700">{SQL_CODE}</pre>
            </div>
        );
    }

    return null;
};
