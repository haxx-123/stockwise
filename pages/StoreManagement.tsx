
import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { dataService } from '../services/dataService';
import { Store, User } from '../types';
import { getSupabaseClient } from '../services/supabaseClient';
import { authService } from '../services/authService';
import { createPortal } from 'react-dom';

export const StoreManagement: React.FC = () => {
    const [stores, setStores] = useState<Store[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingStore, setEditingStore] = useState<Store | null>(null);

    // Form
    const [name, setName] = useState('');
    const [location, setLocation] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [isParent, setIsParent] = useState(false);
    const [selectedChildren, setSelectedChildren] = useState<string[]>([]); // Store IDs
    const [selectedManagers, setSelectedManagers] = useState<string[]>([]); // User IDs
    const [selectedViewers, setSelectedViewers] = useState<string[]>([]); // User IDs

    const currentUser = authService.getCurrentUser();

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        const [s, u] = await Promise.all([dataService.getStores(), dataService.getUsers()]);
        setStores(s);
        // Special logic: 00 Admin stealth mode. 
        // If current user is NOT 00, filter out any user with role 00 from the selection list.
        // If current user IS 00, they can see everyone.
        // Also exclude 00 from "users" array if current user is not 00 to prevent adding them as managers visibly
        if (currentUser?.role_level !== 0) {
            setUsers(u.filter(u => u.role_level !== 0));
        } else {
            setUsers(u);
        }
    };

    const handleCreate = () => {
        setEditingStore(null);
        resetForm();
        setIsModalOpen(true);
    };

    const handleEdit = (s: Store) => {
        setEditingStore(s);
        setName(s.name);
        setLocation(s.location || '');
        setImageUrl(s.image_url || '');
        // Check if parent by finding children referencing this
        const children = stores.filter(child => child.parent_id === s.id);
        setIsParent(children.length > 0);
        setSelectedChildren(children.map(c => c.id));
        setSelectedManagers(s.managers || []);
        setSelectedViewers(s.viewers || []);
        setIsModalOpen(true);
    };

    const resetForm = () => {
        setName(''); setLocation(''); setImageUrl(''); setIsParent(false);
        setSelectedChildren([]); setSelectedManagers([]); setSelectedViewers([]);
    };

    const handleDelete = async (id: string) => {
        if(!window.confirm("确定删除？必须库存归零才能删除。")) return;
        try {
            await dataService.deleteStore(id);
            window.dispatchEvent(new Event('REFRESH_STORES'));
            loadData();
        } catch(e: any) { alert(e.message); }
    };

    const handleSubmit = async () => {
        if (!name) return alert("名称必填");
        if (isParent && selectedChildren.length < 2) return alert("母门店至少需要2个子门店");

        try {
            const client = getSupabaseClient();
            if (!client) return alert("数据库连接失败");

            // Clean data for Supabase
            // Note: Postgres array fields should be passed as arrays. If empty, pass [].
            const managers = selectedManagers.length > 0 ? selectedManagers : [];
            const viewers = selectedViewers.length > 0 ? selectedViewers : [];

            const payload: any = {
                name, 
                location: location || null, 
                image_url: imageUrl || null,
                managers: managers, 
                viewers: viewers,
                // If isParent is checked, this store itself has no parent (it IS the parent)
                // If not checked, we rely on the UI logic. Currently UI assumes only 1 level.
                // Reset parent_id to null for safety if it was a child before.
                parent_id: null 
            };

            let storeId = editingStore?.id;

            if (editingStore) {
                const { error } = await client.from('stores').update(payload).eq('id', storeId);
                if(error) throw error;
            } else {
                storeId = crypto.randomUUID();
                const { error } = await client.from('stores').insert({ 
                    ...payload, 
                    id: storeId, 
                    is_archived: false 
                });
                if(error) throw error;
            }

            // Handle Parent/Child Links
            // If this store is a Parent, we update its children's parent_id
            if (storeId && isParent) {
                // First, clear any existing children of this parent (optional, but cleaner)
                // Actually, let's just set the new children.
                // 1. Remove this parent_id from all stores (reset)
                await client.from('stores').update({ parent_id: null }).eq('parent_id', storeId);
                // 2. Set parent_id for selected children
                if (selectedChildren.length > 0) {
                    await client.from('stores').update({ parent_id: storeId }).in('id', selectedChildren);
                }
            }

            window.dispatchEvent(new Event('REFRESH_STORES'));
            setIsModalOpen(false);
            loadData();
            alert("保存成功！");
        } catch (e: any) { 
            console.error("Store Save Error:", e);
            alert("保存失败: " + e.message + "\n(请检查数据库表结构 'managers' 和 'viewers' 是否为 text[] 数组类型)"); 
        }
    };

    const switchStore = (storeId: string) => {
        window.dispatchEvent(new CustomEvent('SWITCH_STORE_ID', { detail: storeId }));
    };

    const canEdit = (s: Store) => {
        if (currentUser?.role_level === 0) return true;
        return s.managers?.includes(currentUser?.id || '');
    };

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto animate-fade-in-up pb-24">
             <div className="flex justify-between items-center mb-6">
                 <h1 className="text-3xl font-black text-black dark:text-white">门店视图</h1>
                 <button onClick={handleCreate} className="bg-black hover:bg-gray-800 text-white px-6 py-2 rounded-2xl font-bold flex gap-2 shadow-lg transition-transform hover:scale-105">
                     <Icons.Plus size={20}/> 新建门店
                 </button>
             </div>

             <div className="space-y-4">
                 {/* Parent Stores First */}
                 {stores.filter(s => stores.some(c => c.parent_id === s.id)).map(parent => (
                     <div key={parent.id} className="bg-white dark:bg-gray-800 rounded-3xl border-2 border-purple-100 dark:border-purple-900 p-6 relative overflow-hidden group shadow-md hover:shadow-xl transition-all">
                         <div className="absolute top-0 right-0 bg-purple-600 text-white text-xs font-bold px-3 py-1.5 rounded-bl-2xl z-10">母门店 (汇总)</div>
                         <div className="flex justify-between items-center mb-4">
                             <div className="cursor-pointer flex-1" onClick={() => switchStore(parent.id)}>
                                <h3 className="text-2xl font-black flex items-center gap-3 dark:text-white">
                                    {parent.name}
                                    <span className="text-xs font-bold text-gray-500 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full opacity-60 group-hover:opacity-100 transition-opacity">点击进入视图</span>
                                </h3>
                                <p className="text-sm text-gray-400 mt-1 font-bold">{parent.location || '无位置信息'}</p>
                             </div>
                             <div className="flex gap-2">
                                 {canEdit(parent) && (
                                     <>
                                        <button onClick={()=>handleEdit(parent)} className="p-3 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-colors"><Icons.Box size={20}/></button>
                                        <button onClick={()=>handleDelete(parent.id)} className="p-3 bg-gray-100 dark:bg-gray-700 text-red-500 rounded-xl hover:bg-red-50 transition-colors"><Icons.Minus size={20}/></button>
                                     </>
                                 )}
                             </div>
                         </div>
                         <div className="flex gap-2 overflow-x-auto pb-2">
                             {stores.filter(c => c.parent_id === parent.id).map(child => (
                                 <div key={child.id} className="px-4 py-2 bg-purple-50 dark:bg-purple-900/30 rounded-xl text-sm font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1">
                                     <span className="text-xs opacity-50">↳</span> {child.name}
                                 </div>
                             ))}
                         </div>
                     </div>
                 ))}

                 {/* Independent/Child Stores */}
                 {stores.filter(s => !stores.some(c => c.parent_id === s.id)).map(store => (
                     <div key={store.id} className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 p-5 flex justify-between items-center hover:shadow-lg transition-all group">
                         <div className="cursor-pointer flex-1" onClick={() => switchStore(store.id)}>
                             <div className="flex items-center gap-3">
                                 <h3 className="font-bold text-xl dark:text-white">{store.name}</h3>
                                 {store.parent_id && <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 px-2 py-1 rounded font-bold">子门店</span>}
                                 <span className="text-xs font-bold text-gray-400 bg-gray-50 dark:bg-gray-700/50 px-3 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">进入</span>
                             </div>
                             <p className="text-xs text-gray-400 font-bold mt-1">{store.location || '无位置信息'}</p>
                         </div>
                         <div className="flex gap-2">
                             {canEdit(store) && (
                                 <>
                                    <button onClick={()=>handleEdit(store)} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl hover:bg-gray-200 transition-colors"><Icons.Box size={18}/></button>
                                    <button onClick={()=>handleDelete(store.id)} className="p-3 bg-gray-50 dark:bg-gray-700 text-red-500 rounded-xl hover:bg-red-50 transition-colors"><Icons.Minus size={18}/></button>
                                 </>
                             )}
                         </div>
                     </div>
                 ))}
             </div>

             {/* Portal Modal */}
             {isModalOpen && createPortal(
                 <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                     <div className="bg-white dark:bg-gray-900 w-full max-w-2xl rounded-3xl p-8 max-h-[90vh] overflow-y-auto animate-scale-in border border-white/10 shadow-2xl">
                         <h2 className="text-2xl font-black mb-6 dark:text-white">{editingStore ? '编辑' : '新建'}门店</h2>
                         <div className="space-y-4">
                             <div className="space-y-1">
                                 <label className="text-xs font-bold text-gray-500">门店名称 *</label>
                                 <input value={name} onChange={e=>setName(e.target.value)} className="w-full p-4 border-2 border-gray-100 dark:border-gray-700 rounded-2xl font-bold bg-white dark:bg-gray-800 text-lg outline-none focus:border-black dark:focus:border-white dark:text-white transition-colors"/>
                             </div>
                             
                             <div className="grid grid-cols-2 gap-4">
                                 <div className="space-y-1">
                                     <label className="text-xs font-bold text-gray-500">地理位置</label>
                                     <input value={location} onChange={e=>setLocation(e.target.value)} className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white"/>
                                 </div>
                                 <div className="space-y-1">
                                     <label className="text-xs font-bold text-gray-500">封面图 URL</label>
                                     <input value={imageUrl} onChange={e=>setImageUrl(e.target.value)} className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white"/>
                                 </div>
                             </div>
                             
                             {/* Parent Toggle */}
                             <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-2xl border border-purple-100 dark:border-purple-800">
                                 <label className="flex items-center gap-3 cursor-pointer">
                                     <input type="checkbox" checked={isParent} onChange={e=>setIsParent(e.target.checked)} className="w-6 h-6 accent-purple-600 rounded-lg"/>
                                     <div>
                                         <span className="font-bold text-purple-900 dark:text-purple-200 block">设为母门店 (Total Store)</span>
                                         <span className="text-xs text-purple-600 dark:text-purple-400">将聚合显示旗下子门店的所有库存数据</span>
                                     </div>
                                 </label>

                                 {isParent && (
                                     <div className="mt-4 pt-4 border-t border-purple-200 dark:border-purple-800">
                                         <p className="font-bold text-sm mb-2 text-purple-800 dark:text-purple-300">勾选子门店 (至少2个)</p>
                                         <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto custom-scrollbar">
                                             {stores.filter(s => s.id !== editingStore?.id && !s.children?.length).map(s => (
                                                 <label key={s.id} className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded-xl cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors">
                                                     <input type="checkbox" 
                                                        checked={selectedChildren.includes(s.id)}
                                                        onChange={e => {
                                                            if(e.target.checked) setSelectedChildren([...selectedChildren, s.id]);
                                                            else setSelectedChildren(selectedChildren.filter(id => id !== s.id));
                                                        }}
                                                        className="w-4 h-4 accent-purple-600"
                                                     />
                                                     <span className="text-sm font-bold dark:text-white truncate">{s.name}</span>
                                                 </label>
                                             ))}
                                         </div>
                                     </div>
                                 )}
                             </div>

                             {/* Permissions */}
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                 <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-4 bg-gray-50 dark:bg-gray-800/50">
                                     <p className="font-bold mb-2 text-blue-600 text-sm">店长/管理员 (完整操作权)</p>
                                     <div className="h-40 overflow-y-auto custom-scrollbar pr-2">
                                         {users.map(u => (
                                             <label key={u.id} className="flex items-center gap-2 mb-2 p-2 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition-colors cursor-pointer">
                                                 <input type="checkbox" checked={selectedManagers.includes(u.id)} 
                                                    onChange={e => {
                                                        if(e.target.checked) setSelectedManagers([...selectedManagers, u.id]);
                                                        else setSelectedManagers(selectedManagers.filter(id=>id!==u.id));
                                                    }}
                                                    className="accent-blue-600 w-4 h-4"
                                                 />
                                                 <span className="text-sm dark:text-gray-300">{u.username}</span>
                                             </label>
                                         ))}
                                     </div>
                                 </div>
                                 <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-4 bg-gray-50 dark:bg-gray-800/50">
                                     <p className="font-bold mb-2 text-gray-500 text-sm">店员/浏览者 (仅查看/出库)</p>
                                     <div className="h-40 overflow-y-auto custom-scrollbar pr-2">
                                         {users.map(u => (
                                             <label key={u.id} className="flex items-center gap-2 mb-2 p-2 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition-colors cursor-pointer">
                                                 <input type="checkbox" checked={selectedViewers.includes(u.id)} 
                                                    onChange={e => {
                                                        if(e.target.checked) setSelectedViewers([...selectedViewers, u.id]);
                                                        else setSelectedViewers(selectedViewers.filter(id=>id!==u.id));
                                                    }}
                                                    className="accent-gray-500 w-4 h-4"
                                                 />
                                                 <span className="text-sm dark:text-gray-300">{u.username}</span>
                                             </label>
                                         ))}
                                     </div>
                                 </div>
                             </div>
                         </div>
                         <div className="mt-8 flex justify-end gap-4 border-t border-gray-100 dark:border-gray-800 pt-6">
                             <button onClick={()=>setIsModalOpen(false)} className="px-6 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">取消</button>
                             <button onClick={handleSubmit} className="px-8 py-3 rounded-2xl bg-black text-white font-bold shadow-lg hover:scale-105 transition-transform">保存配置</button>
                         </div>
                     </div>
                 </div>,
                 document.body
             )}
        </div>
    );
};
