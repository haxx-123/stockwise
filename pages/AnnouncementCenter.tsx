

import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { dataService } from '../services/dataService';
import { Announcement } from '../types';
import { authService } from '../services/authService';
import { RichTextEditor } from '../components/RichTextEditor';
import { UsernameBadge } from '../components/UsernameBadge';

export const AnnouncementCenter: React.FC = () => {
    const [view, setView] = useState<'MY' | 'MANAGE' | 'CREATE' | 'DETAIL'>('MY');
    const [list, setList] = useState<Announcement[]>([]);
    const [selectedAnn, setSelectedAnn] = useState<Announcement | null>(null);
    const [user] = useState(authService.getCurrentUser());

    // Form
    const [title, setTitle] = useState('');
    const [content, setContent] = useState(''); // HTML content
    const [isPopup, setIsPopup] = useState(false);

    useEffect(() => { loadData(); }, [view]);

    const loadData = async () => {
        const raw = await dataService.getAnnouncements();
        if (view === 'MY') {
            const myId = user?.id || '';
            setList(raw.filter(a => !a.is_force_deleted && !a.read_by?.includes(`HIDDEN_BY_${myId}`)));
        } else {
            setList(raw.filter(a => !a.is_force_deleted));
        }
    };

    const handleCreate = async () => {
        if (!title || !content) return alert("必填");
        await dataService.createAnnouncement({
            title, content, // Storing HTML
            creator: user?.username, creator_id: user?.id,
            target_users: [],
            popup_config: { enabled: isPopup, duration: 'ONCE' },
            allow_delete: true
        });
        setView('MY');
    };

    const handleHide = async (id: string) => {
        await dataService.deleteAnnouncement(id, false);
        loadData();
    };

    const openDetail = (ann: Announcement) => {
        setSelectedAnn(ann);
        setView('DETAIL');
    };

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto h-full flex flex-col">
            <div className="flex gap-4 mb-6 border-b pb-4">
                <button onClick={()=>setView('MY')} className={`text-xl font-bold pb-2 ${view==='MY'?'border-b-4 border-purple-600':''}`}>我的公告</button>
                <button onClick={()=>setView('MANAGE')} className={`text-xl font-bold pb-2 ${view==='MANAGE'?'border-b-4 border-purple-600':''}`}>公告管理</button>
                <div className="flex-1 text-right">
                    <button onClick={()=>setView('CREATE')} className="bg-black text-white px-4 py-2 rounded-xl font-bold">+ 发布</button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {view === 'CREATE' && (
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl animate-scale-in">
                        <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="标题" className="w-full p-3 mb-4 text-xl font-black border-b bg-transparent outline-none"/>
                        
                        <div className="mb-4 h-96">
                            <RichTextEditor value={content} onChange={setContent} />
                        </div>

                        <div className="flex gap-4 items-center mb-6">
                            <label className="flex gap-2 items-center font-bold"><input type="checkbox" checked={isPopup} onChange={e=>setIsPopup(e.target.checked)}/> 弹窗提示</label>
                        </div>
                        <button onClick={handleCreate} className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold shadow-lg">发布公告</button>
                    </div>
                )}

                {view === 'DETAIL' && selectedAnn && (
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl animate-fade-in shadow-xl">
                        <button onClick={()=>setView('MY')} className="mb-4 text-gray-400 hover:text-black">← 返回</button>
                        <h1 className="text-3xl font-black mb-2">{selectedAnn.title}</h1>
                        <div className="flex items-center gap-2 mb-6 text-sm text-gray-500 border-b pb-4">
                            <span>发布者: <UsernameBadge name={selectedAnn.creator} roleLevel={0} /></span> {/* Role level fetched normally */}
                            <span>•</span>
                            <span>{new Date(selectedAnn.created_at).toLocaleString()}</span>
                        </div>
                        <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: selectedAnn.content }}></div>
                    </div>
                )}

                {(view === 'MY' || view === 'MANAGE') && list.map(item => (
                    <div key={item.id} onClick={()=>openDetail(item)} className="bg-white dark:bg-gray-800 p-5 rounded-2xl mb-4 shadow-sm border border-gray-100 flex justify-between animate-fade-in-up cursor-pointer hover:shadow-md transition-shadow">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                {view === 'MY' && !item.read_by?.includes(user?.id||'') && <div className="w-2 h-2 bg-red-500 rounded-full"></div>}
                                <h3 className="font-bold text-lg">{item.title}</h3>
                            </div>
                            <div className="text-gray-500 text-sm truncate w-64" dangerouslySetInnerHTML={{__html: item.content.substring(0, 50) + '...'}}></div>
                            <div className="text-xs text-gray-400 mt-2">发布者: {item.creator}</div>
                        </div>
                        <div className="flex flex-col gap-2 justify-center" onClick={e=>e.stopPropagation()}>
                            {view === 'MY' && <button onClick={()=>handleHide(item.id)} className="p-2 text-gray-400 hover:text-red-500"><Icons.Minus size={18}/></button>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};