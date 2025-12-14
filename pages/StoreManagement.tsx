
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
            if (!client) return;

            const payload: any = {
                name, location, image_url: imageUrl,
                managers: selectedManagers, viewers: selectedViewers
            };

            let storeId = editingStore?.id;

            if (editingStore) {
                await client.from('stores').update(payload).eq('id', storeId);
            } else {
                storeId = crypto.randomUUID();
                await client.from('stores').insert({ ...payload, id: storeId, is_archived: false });
            }

            // Handle Parent/Child Links
            if (storeId) {
                await client.from('stores').update({ parent_id: null }).eq('parent_id', storeId);
                if (isParent) {
                    await client.from('stores').update({ parent_id: storeId }).in('id', selectedChildren);
                }
            }

            window.dispatchEvent(new Event('REFRESH_STORES'));
            setIsModalOpen(false);
            loadData();
        } catch (e: any) { alert(e.message); }
    };

    const switchStore = (storeId: string) => {
        // Dispatch global event or call a method to switch store
        window.dispatchEvent(new CustomEvent('SWITCH_STORE_ID', { detail: storeId }));
    };

    // Determine edit permission: 00 admin can always edit/delete
    const canEdit = (s: Store) => {
        if (currentUser?.role_level === 0) return true;
        // Normal logic: must be a manager
        return s.managers?.includes(currentUser?.id || '');
    };

    const isCurrent = (id: string) => {
        // We need access to global state or URL param, but for "In Place" switching,
        // we might trigger an App-level update.
        // For visual, we can read from props if passed, but here we trigger the switch.
        return false; 
    };

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto animate-fade-in-up">
             <div className="flex justify-between items-center mb-6">
                 <h1 className="text-3xl font-black">门店视图</h1>
                 <button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl font-bold flex gap-2 shadow-lg">
                     <Icons.Plus size={20}/> 新建门店
                 </button>
             </div>

             <div className="space-y-4">
                 {/* Parent Stores First */}
                 {stores.filter(s => stores.some(c => c.parent_id === s.id)).map(parent => (
                     <div key={parent.id} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-purple-100 dark:border-purple-900 p-4 relative overflow-hidden group">
                         <div className="absolute top-0 right-0 bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-bl-xl">母门店</div>
                         <div className="flex justify-between items-center mb-2">
                             <div className="cursor-pointer flex-1" onClick={() => switchStore(parent.id)}>
                                <h3 className="text-xl font-bold flex items-center gap-2">
                                    {parent.name}
                                    <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 rounded-full">点击切换</span>
                                </h3>
                             </div>
                             <div className="flex gap-2">
                                 {canEdit(parent) && (
                                     <>
                                        <button onClick={()=>handleEdit(parent)} className="p-2 bg-gray-100 rounded-lg"><Icons.Box size={16}/></button>
                                        <button onClick={()=>handleDelete(parent.id)} className="p-2 bg-red-100 text-red-600 rounded-lg"><Icons.Minus size={16}/></button>
                                     </>
                                 )}
                             </div>
                         </div>
                         <div className="flex gap-2 mt-2 overflow-x-auto">
                             {stores.filter(c => c.parent_id === parent.id).map(child => (
                                 <div key={child.id} className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm font-bold text-gray-500">
                                     ↳ {child.name}
                                 </div>
                             ))}
                         </div>
                     </div>
                 ))}

                 {/* Independent/Child Stores */}
                 {stores.filter(s => !stores.some(c => c.parent_id === s.id)).map(store => (
                     <div key={store.id} className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-4 flex justify-between items-center hover:shadow-md transition-shadow group">
                         <div className="cursor-pointer flex-1" onClick={() => switchStore(store.id)}>
                             <div className="flex items-center gap-2">
                                 <h3 className="font-bold text-lg">{store.name}</h3>
                                 {store.parent_id && <span className="text-xs bg-gray-200 px-1 rounded">子门店</span>}
                                 <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">点击切换</span>
                             </div>
                             <p className="text-xs text-gray-500">{store.location || '无位置'}</p>
                         </div>
                         <div className="flex gap-2">
                             {canEdit(store) && (
                                 <>
                                    <button onClick={()=>handleEdit(store)} className="p-2 hover:bg-gray-100 rounded-lg"><Icons.Box size={18}/></button>
                                    <button onClick={()=>handleDelete(store.id)} className="p-2 hover:bg-red-50 text-red-500 rounded-lg"><Icons.Minus size={18}/></button>
                                 </>
                             )}
                         </div>
                     </div>
                 ))}
             </div>

             {/* Portal Modal */}
             {isModalOpen && createPortal(
                 <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                     <div className="bg-white dark:bg-gray-900 w-full max-w-2xl rounded-3xl p-8 max-h-[90vh] overflow-y-auto animate-scale-in">
                         <h2 className="text-2xl font-black mb-6">{editingStore ? '编辑' : '新建'}门店</h2>
                         <div className="space-y-4">
                             <input value={name} onChange={e=>setName(e.target.value)} placeholder="门店名称" className="w-full p-3 border rounded-xl font-bold bg-gray-50 dark:bg-gray-800"/>
                             <input value={location} onChange={e=>setLocation(e.target.value)} placeholder="位置" className="w-full p-3 border rounded-xl bg-gray-50 dark:bg-gray-800"/>
                             <input value={imageUrl} onChange={e=>setImageUrl(e.target.value)} placeholder="图片URL" className="w-full p-3 border rounded-xl bg-gray-50 dark:bg-gray-800"/>
                             
                             {/* Parent Toggle */}
                             <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
                                 <input type="checkbox" checked={isParent} onChange={e=>setIsParent(e.target.checked)} className="w-5 h-5"/>
                                 <span className="font-bold">设为母门店 (需关联子门店)</span>
                             </div>

                             {isParent && (
                                 <div className="p-4 border rounded-xl">
                                     <p className="font-bold mb-2">选择子门店 (至少2个)</p>
                                     <div className="grid grid-cols-2 gap-2">
                                         {stores.filter(s => s.id !== editingStore?.id && !s.children?.length).map(s => (
                                             <label key={s.id} className="flex items-center gap-2">
                                                 <input type="checkbox" 
                                                    checked={selectedChildren.includes(s.id)}
                                                    onChange={e => {
                                                        if(e.target.checked) setSelectedChildren([...selectedChildren, s.id]);
                                                        else setSelectedChildren(selectedChildren.filter(id => id !== s.id));
                                                    }}
                                                 />
                                                 <span>{s.name}</span>
                                             </label>
                                         ))}
                                     </div>
                                 </div>
                             )}

                             {/* Parent Stores Selection (If not parent) */}
                             {!isParent && (
                                 <div>
                                     <p className="font-bold mb-2">所属母门店 (可选)</p>
                                     <select className="w-full p-3 border rounded-xl bg-gray-50 dark:bg-gray-800" disabled>
                                         <option>功能在母门店侧配置</option>
                                     </select>
                                 </div>
                             )}

                             {/* Permissions */}
                             <div className="grid grid-cols-2 gap-4">
                                 <div>
                                     <p className="font-bold mb-2 text-blue-600">管理员 (完整权限)</p>
                                     <div className="h-32 overflow-y-auto border rounded-xl p-2 bg-gray-50 dark:bg-gray-800">
                                         {users.map(u => (
                                             <label key={u.id} className="flex items-center gap-2 mb-1">
                                                 <input type="checkbox" checked={selectedManagers.includes(u.id)} 
                                                    onChange={e => {
                                                        if(e.target.checked) setSelectedManagers([...selectedManagers, u.id]);
                                                        else setSelectedManagers(selectedManagers.filter(id=>id!==u.id));
                                                    }}/>
                                                 <span>{u.username}</span>
                                             </label>
                                         ))}
                                     </div>
                                 </div>
                                 <div>
                                     <p className="font-bold mb-2 text-gray-500">浏览者 (仅查看)</p>
                                     <div className="h-32 overflow-y-auto border rounded-xl p-2 bg-gray-50 dark:bg-gray-800">
                                         {users.map(u => (
                                             <label key={u.id} className="flex items-center gap-2 mb-1">
                                                 <input type="checkbox" checked={selectedViewers.includes(u.id)} 
                                                    onChange={e => {
                                                        if(e.target.checked) setSelectedViewers([...selectedViewers, u.id]);
                                                        else setSelectedViewers(selectedViewers.filter(id=>id!==u.id));
                                                    }}/>
                                                 <span>{u.username}</span>
                                             </label>
                                         ))}
                                     </div>
                                 </div>
                             </div>
                         </div>
                         <div className="mt-6 flex justify-end gap-4">
                             <button onClick={()=>setIsModalOpen(false)} className="px-6 py-2 rounded-xl bg-gray-200 font-bold">取消</button>
                             <button onClick={handleSubmit} className="px-6 py-2 rounded-xl bg-black text-white font-bold">保存</button>
                         </div>
                     </div>
                 </div>,
                 document.body
             )}
        </div>
    );
};
