

import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { dataService } from '../services/dataService';
import { Announcement } from '../types';
import { authService } from '../services/authService';

export const AnnouncementCenter: React.FC = () => {
    const [list, setList] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Create Mode
    const [isCreating, setIsCreating] = useState(false);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        const data = await dataService.getAnnouncements();
        // Filter out deleted/hidden if necessary, logic is in service
        setList(data.filter(a => !a.is_force_deleted)); 
        setLoading(false);
    };

    const handleCreate = async () => {
        if (!title || !content) return alert("请填写标题和内容");
        try {
            const user = authService.getCurrentUser();
            const newAnn = {
                title,
                content,
                creator: user?.username || 'System',
                creator_id: user?.id,
                target_users: [], // Broadcast
                valid_until: new Date(Date.now() + 86400000 * 7).toISOString(), // 7 days default
                popup_config: { enabled: true, duration: 'ONCE' },
                allow_delete: true
            };
            await dataService.createAnnouncement(newAnn);
            setIsCreating(false);
            setTitle('');
            setContent('');
            loadData();
        } catch (e: any) { alert(e.message); }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("确认删除？")) return;
        await dataService.deleteAnnouncement(id, true); // Force delete for now as Admin
        loadData();
    };

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto dark:text-white animate-fade-in-up">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-black">公告中心</h1>
                <button onClick={() => setIsCreating(true)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2">
                    <Icons.Plus size={18} /> 发布公告
                </button>
            </div>

            {isCreating && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-purple-100 dark:border-purple-900/30 mb-8 animate-scale-in">
                    <h3 className="font-bold mb-4 text-purple-600">撰写新公告</h3>
                    <div className="space-y-4">
                        <input value={title} onChange={e=>setTitle(e.target.value)} className="w-full p-3 border rounded-xl dark:bg-gray-700 dark:border-gray-600 outline-none font-bold" placeholder="标题..." />
                        <textarea value={content} onChange={e=>setContent(e.target.value)} className="w-full p-3 border rounded-xl dark:bg-gray-700 dark:border-gray-600 outline-none h-32" placeholder="内容详情..." />
                        <div className="flex justify-end gap-3">
                            <button onClick={()=>setIsCreating(false)} className="px-4 py-2 text-gray-500 font-bold">取消</button>
                            <button onClick={handleCreate} className="px-6 py-2 bg-purple-600 text-white rounded-xl font-bold shadow-lg shadow-purple-500/30">立即发布</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-4">
                {list.map(item => (
                    <div key={item.id} className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row gap-4">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-600 px-2 py-0.5 rounded text-xs font-bold">通知</span>
                                <h3 className="font-bold text-lg">{item.title}</h3>
                            </div>
                            <p className="text-gray-600 dark:text-gray-300 mb-3">{item.content}</p>
                            <div className="text-xs text-gray-400 flex items-center gap-4">
                                <span>发布人: {item.creator}</span>
                                <span>时间: {new Date(item.created_at).toLocaleString()}</span>
                            </div>
                        </div>
                        <div className="flex items-start">
                            <button onClick={()=>handleDelete(item.id)} className="text-red-400 hover:text-red-600 p-2"><Icons.Minus size={18}/></button>
                        </div>
                    </div>
                ))}
                {list.length === 0 && <div className="text-center text-gray-400 py-10">暂无公告</div>}
            </div>
        </div>
    );
};
