import React, { useState, useEffect } from 'react';
import { Icons } from './Icons';
import { RichTextEditor } from './RichTextEditor';
import { dataService } from '../services/dataService';
import { authService } from '../services/authService';
import { Announcement } from '../types';

interface AnnouncementManagerProps {
    onClose: () => void;
}

export const AnnouncementManager: React.FC<AnnouncementManagerProps> = ({ onClose }) => {
    const user = authService.getCurrentUser();
    const canPublish = user?.permissions.announcement_rule === 'PUBLISH';
    
    const [tab, setTab] = useState<'LIST' | 'CREATE'>('LIST');
    const [list, setList] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(false);

    // Create Form
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [validDays, setValidDays] = useState(7);
    const [popupEnabled, setPopupEnabled] = useState(true);

    useEffect(() => {
        loadList();
    }, []);

    const loadList = async () => {
        setLoading(true);
        const data = await dataService.getAnnouncements();
        // Filter out force deleted ones unless admin? dataService already returns active ones usually, 
        // but let's filter just in case logic changes
        setList(data.filter(a => !a.is_force_deleted));
        setLoading(false);
    };

    const handlePublish = async () => {
        if (!title.trim() || !content.trim()) return alert("标题和内容不能为空");
        if (!user) return;

        try {
            const validUntil = new Date();
            validUntil.setDate(validUntil.getDate() + validDays);

            await dataService.createAnnouncement({
                title,
                content,
                creator: user.username,
                creator_id: user.id,
                target_users: ['ALL'], // Simplified for now
                valid_until: validUntil.toISOString(),
                popup_config: {
                    enabled: popupEnabled,
                    duration: 'ONCE'
                },
                allow_delete: true
            });
            alert("发布成功");
            setTitle('');
            setContent('');
            setTab('LIST');
            loadList();
        } catch (e: any) {
            alert("发布失败: " + e.message);
        }
    };

    const handleDelete = async (id: string) => {
        if(!confirm("确定删除此公告？")) return;
        await dataService.deleteAnnouncement(id, true); // Force delete
        loadList();
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white dark:bg-gray-900 w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border dark:border-gray-700">
                {/* Header */}
                <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800">
                    <h2 className="text-xl font-bold dark:text-white flex items-center gap-2">
                        <span>📢 公告中心</span>
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full">
                        <Icons.Minus size={24} className="text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b dark:border-gray-700">
                    <button 
                        onClick={() => setTab('LIST')} 
                        className={`flex-1 py-3 font-bold text-sm transition-colors ${tab==='LIST' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50 dark:bg-gray-800' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                    >
                        历史公告
                    </button>
                    {canPublish && (
                        <button 
                            onClick={() => setTab('CREATE')} 
                            className={`flex-1 py-3 font-bold text-sm transition-colors ${tab==='CREATE' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50 dark:bg-gray-800' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                        >
                            发布新公告
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-950 custom-scrollbar">
                    {tab === 'LIST' ? (
                        <div className="space-y-4">
                            {loading ? <p className="text-center text-gray-500">加载中...</p> : list.length === 0 ? <p className="text-center text-gray-500 py-10">暂无公告</p> : null}
                            
                            {list.map(ann => (
                                <div key={ann.id} className="bg-white dark:bg-gray-900 p-5 rounded-xl shadow-sm border dark:border-gray-700">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h3 className="font-bold text-lg dark:text-white">{ann.title}</h3>
                                            <div className="text-xs text-gray-500 mt-1 flex gap-2">
                                                <span>发布人: {ann.creator}</span>
                                                <span>•</span>
                                                <span>有效期至: {new Date(ann.valid_until).toLocaleDateString()}</span>
                                                <span>•</span>
                                                <span>{ann.read_by?.length || 0} 人已读</span>
                                            </div>
                                        </div>
                                        {canPublish && (
                                            <button onClick={() => handleDelete(ann.id)} className="text-red-500 text-xs border border-red-200 px-2 py-1 rounded hover:bg-red-50">删除</button>
                                        )}
                                    </div>
                                    <div className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2 bg-gray-50 dark:bg-gray-800 p-2 rounded">
                                        {ann.content.replace(/<[^>]+>/g, '')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="max-w-2xl mx-auto space-y-6">
                            <div>
                                <label className="block text-sm font-bold mb-2 dark:text-gray-300">标题</label>
                                <input 
                                    className="w-full border p-3 rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" 
                                    placeholder="输入公告标题..." 
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold mb-2 dark:text-gray-300">内容 (富文本)</label>
                                <RichTextEditor value={content} onChange={setContent} />
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-bold mb-2 dark:text-gray-300">有效期 (天)</label>
                                    <select 
                                        className="w-full border p-3 rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                                        value={validDays}
                                        onChange={e => setValidDays(Number(e.target.value))}
                                    >
                                        <option value={1}>1 天</option>
                                        <option value={3}>3 天</option>
                                        <option value={7}>7 天</option>
                                        <option value={30}>30 天</option>
                                        <option value={365}>1 年</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-3 pt-8">
                                    <input 
                                        type="checkbox" 
                                        id="popupCheck"
                                        className="w-5 h-5 accent-blue-600"
                                        checked={popupEnabled}
                                        onChange={e => setPopupEnabled(e.target.checked)}
                                    />
                                    <label htmlFor="popupCheck" className="text-sm font-bold dark:text-gray-300 cursor-pointer">
                                        强制弹窗通知
                                    </label>
                                </div>
                            </div>

                            <div className="pt-4">
                                <button 
                                    onClick={handlePublish}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-200 dark:shadow-none transition-transform active:scale-[0.98]"
                                >
                                    立即发布
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};