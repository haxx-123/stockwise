

import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { dataService } from '../services/dataService';
import { Announcement } from '../types';
import { authService } from '../services/authService';

export const AnnouncementCenter: React.FC = () => {
    const [view, setView] = useState<'MY' | 'MANAGE' | 'CREATE'>('MY');
    const [list, setList] = useState<Announcement[]>([]);
    const [user] = useState(authService.getCurrentUser());

    // Form
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [isPopup, setIsPopup] = useState(false);
    const [popupFreq, setPopupFreq] = useState('ONCE');

    useEffect(() => { loadData(); }, [view]);

    const loadData = async () => {
        const raw = await dataService.getAnnouncements();
        
        if (view === 'MY') {
            // Filter: Visible to me, not force deleted, not hidden by me
            const myId = user?.id || '';
            const filtered = raw.filter(a => {
                if (a.is_force_deleted) return false;
                if (a.read_by?.includes(`HIDDEN_BY_${myId}`)) return false;
                // Add more target logic if needed
                return true; 
            });
            setList(filtered);
        } else {
            // Manage: Show all if I have permission (or my own)
            setList(raw.filter(a => !a.is_force_deleted)); // Physical delete hidden
        }
    };

    const handleCreate = async () => {
        if (!title || !content) return alert("必填");
        await dataService.createAnnouncement({
            title, content,
            creator: user?.username, creator_id: user?.id,
            target_users: [], // logic for selection
            popup_config: { enabled: isPopup, duration: popupFreq },
            allow_delete: true
        });
        setView('MY');
    };

    const handleHide = async (id: string) => {
        await dataService.deleteAnnouncement(id, false); // Soft hide
        loadData();
    };

    const handleRevoke = async (id: string) => {
        if(!window.confirm("确认撤销？将物理删除。")) return;
        await dataService.deleteAnnouncement(id, true); // Force delete
        loadData();
    };

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto h-full flex flex-col">
            {/* Header / Switcher */}
            <div className="flex gap-4 mb-6 border-b pb-4">
                <button onClick={()=>setView('MY')} className={`text-xl font-bold pb-2 ${view==='MY'?'border-b-4 border-purple-600':''}`}>我的公告</button>
                <button onClick={()=>setView('MANAGE')} className={`text-xl font-bold pb-2 ${view==='MANAGE'?'border-b-4 border-purple-600':''}`}>公告管理</button>
                <div className="flex-1 text-right">
                    <button onClick={()=>setView('CREATE')} className="bg-black text-white px-4 py-2 rounded-xl font-bold">+ 发布</button>
                </div>
            </div>

            {/* In-Place Content */}
            <div className="flex-1 overflow-y-auto">
                {view === 'CREATE' && (
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl animate-scale-in">
                        <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="标题" className="w-full p-3 mb-4 text-xl font-black border-b bg-transparent outline-none"/>
                        <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="内容..." className="w-full h-40 p-3 bg-gray-50 rounded-xl mb-4"/>
                        <div className="flex gap-4 items-center mb-6">
                            <label className="flex gap-2 items-center font-bold"><input type="checkbox" checked={isPopup} onChange={e=>setIsPopup(e.target.checked)}/> 弹窗提示</label>
                            {isPopup && (
                                <select value={popupFreq} onChange={e=>setPopupFreq(e.target.value)} className="p-2 border rounded-lg">
                                    <option value="ONCE">一次性</option>
                                    <option value="WEEK">每周</option>
                                    <option value="FOREVER">每次登录</option>
                                </select>
                            )}
                        </div>
                        <button onClick={handleCreate} className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold shadow-lg">发布公告</button>
                    </div>
                )}

                {(view === 'MY' || view === 'MANAGE') && list.map(item => (
                    <div key={item.id} className="bg-white dark:bg-gray-800 p-5 rounded-2xl mb-4 shadow-sm border border-gray-100 flex justify-between animate-fade-in-up">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                {view === 'MY' && !item.read_by?.includes(user?.id||'') && <div className="w-2 h-2 bg-red-500 rounded-full"></div>}
                                <h3 className="font-bold text-lg">{item.title}</h3>
                            </div>
                            <p className="text-gray-500 line-clamp-2">{item.content}</p>
                            <div className="text-xs text-gray-400 mt-2">发布者: {item.creator} | {new Date(item.created_at).toLocaleDateString()}</div>
                        </div>
                        <div className="flex flex-col gap-2 justify-center">
                            {view === 'MY' && <button onClick={()=>handleHide(item.id)} className="p-2 text-gray-400 hover:text-red-500"><Icons.Minus size={18}/></button>}
                            {view === 'MANAGE' && <button onClick={()=>handleRevoke(item.id)} className="px-3 py-1 bg-red-100 text-red-600 rounded-lg text-xs font-bold">撤销</button>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};