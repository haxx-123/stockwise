

import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { dataService } from '../services/dataService';
import { Store, User } from '../types';
import { getSupabaseClient } from '../services/supabaseClient';

export const StoreManagement: React.FC = () => {
    const [stores, setStores] = useState<Store[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingStore, setEditingStore] = useState<Store | null>(null);

    // Form State
    const [name, setName] = useState('');
    const [location, setLocation] = useState('');
    const [selectedManagers, setSelectedManagers] = useState<string[]>([]); // User IDs

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            const [s, u] = await Promise.all([
                dataService.getStores(),
                dataService.getUsers()
            ]);
            setStores(s);
            setUsers(u);
        } catch (e) { console.error(e); }
    };

    const handleEdit = (store: Store) => {
        setEditingStore(store);
        setName(store.name);
        setLocation(store.location || '');
        setSelectedManagers(store.managers || []);
        setIsModalOpen(true);
    };

    const handleCreate = () => {
        setEditingStore(null);
        setName('');
        setLocation('');
        setSelectedManagers([]);
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("确定要删除此门店吗？删除前请确保库存清零。")) return;
        try {
            await dataService.deleteStore(id);
            await loadData();
        } catch (e: any) { alert(e.message); }
    };

    const handleSubmit = async () => {
        if (!name) return alert("门店名称必填");
        
        try {
            const client = getSupabaseClient(); // Use raw client for specific column updates if needed
            const payload = {
                name,
                location,
                managers: selectedManagers
            };

            if (editingStore) {
                // Update
                if (client) {
                   await client.from('stores').update(payload).eq('id', editingStore.id);
                   await dataService.logClientAction('UPDATE_STORE', { id: editingStore.id, name });
                }
            } else {
                // Create
                if (client) {
                   await client.from('stores').insert({
                       id: crypto.randomUUID(),
                       ...payload,
                       is_archived: false
                   });
                   await dataService.logClientAction('CREATE_STORE', { name });
                }
            }
            setIsModalOpen(false);
            loadData();
        } catch (e: any) { alert(e.message); }
    };

    const toggleManager = (userId: string) => {
        if (selectedManagers.includes(userId)) {
            setSelectedManagers(prev => prev.filter(id => id !== userId));
        } else {
            setSelectedManagers(prev => [...prev, userId]);
        }
    };

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto dark:text-white animate-fade-in-up">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-black mb-2">门店管理</h1>
                    <p className="text-gray-500">管理实体店、仓库及权限分配</p>
                </div>
                <button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-500/30 transition-transform active:scale-95">
                    <Icons.Plus size={20} />
                    <span>新增门店</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {stores.map(store => (
                    <div key={store.id} className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
                         <div className="flex justify-between items-start mb-4">
                             <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600">
                                 <Icons.Store size={24} />
                             </div>
                             <div className="flex gap-2">
                                 <button onClick={() => handleEdit(store)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500"><Icons.Box size={18} /></button>
                                 <button onClick={() => handleDelete(store.id)} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-red-500"><Icons.Minus size={18} /></button>
                             </div>
                         </div>
                         <h3 className="text-xl font-bold mb-1">{store.name}</h3>
                         <p className="text-gray-500 text-sm mb-4 flex items-center gap-1"><span className="text-xs">📍</span> {store.location || '无位置信息'}</p>
                         
                         <div className="border-t dark:border-gray-700 pt-4 mt-4">
                             <p className="text-xs font-bold text-gray-400 uppercase mb-2">管理人员</p>
                             <div className="flex flex-wrap gap-2">
                                 {store.managers && store.managers.length > 0 ? (
                                     store.managers.map(uid => {
                                         const u = users.find(user => user.id === uid);
                                         return u ? (
                                             <span key={uid} className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs font-bold text-gray-700 dark:text-gray-300">{u.username}</span>
                                         ) : null;
                                     })
                                 ) : (
                                     <span className="text-xs text-gray-400 italic">未分配</span>
                                 )}
                             </div>
                         </div>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border dark:border-gray-700 transform transition-all scale-100">
                        <div className="p-6 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
                             <h2 className="text-xl font-bold">{editingStore ? '编辑门店' : '新增门店'}</h2>
                             <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-800"><Icons.Minus size={24}/></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-bold mb-1 text-gray-500">门店名称</label>
                                <input value={name} onChange={e => setName(e.target.value)} className="w-full border dark:border-gray-600 dark:bg-gray-800 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500" placeholder="例如：市中心总店" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold mb-1 text-gray-500">位置/地址</label>
                                <input value={location} onChange={e => setLocation(e.target.value)} className="w-full border dark:border-gray-600 dark:bg-gray-800 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500" placeholder="例如：中山路 88 号" />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-bold mb-2 text-gray-500">指派店长/经理</label>
                                <div className="border dark:border-gray-600 rounded-lg p-2 max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-800 grid grid-cols-2 gap-2">
                                    {users.map(u => (
                                        <div key={u.id} onClick={() => toggleManager(u.id)} 
                                             className={`p-2 rounded cursor-pointer text-sm font-bold border transition-colors flex items-center justify-between ${selectedManagers.includes(u.id) ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-white dark:bg-gray-700 border-transparent dark:text-gray-300 hover:bg-gray-100'}`}>
                                            <span>{u.username}</span>
                                            {selectedManagers.includes(u.id) && <div className="w-2 h-2 bg-blue-600 rounded-full"></div>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t dark:border-gray-700 flex justify-end gap-3 bg-gray-50 dark:bg-gray-800">
                            <button onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl font-bold text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">取消</button>
                            <button onClick={handleSubmit} className="px-5 py-2.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30">保存</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
