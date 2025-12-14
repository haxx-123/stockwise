
import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { dataService } from '../services/dataService';
import { Announcement, User } from '../types';
import { authService } from '../services/authService';
import { RichTextEditor } from '../components/RichTextEditor';
import { UsernameBadge } from '../components/UsernameBadge';

export const AnnouncementCenter: React.FC = () => {
    // In-Place View State
    const [view, setView] = useState<'MY' | 'MANAGE' | 'PUBLISH' | 'DETAIL' | 'SUGGESTION'>('MY');
    const [list, setList] = useState<Announcement[]>([]);
    const [selectedAnn, setSelectedAnn] = useState<Announcement | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const user = authService.getCurrentUser();
    
    // Management Filter State
    const [managedAccount, setManagedAccount] = useState<string>(''); // User ID

    // Publish Form State
    const [editMode, setEditMode] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formTitle, setFormTitle] = useState('');
    const [formContent, setFormContent] = useState('');
    const [formTargets, setFormTargets] = useState<string[]>([]);
    const [formPopup, setFormPopup] = useState(false);
    const [formFreq, setFormFreq] = useState<'ONCE'|'DAY'|'WEEK'|'MONTH'|'FOREVER'>('ONCE');
    const [formAllowHide, setFormAllowHide] = useState(true);

    // Suggestion Form
    const [suggestionText, setSuggestionText] = useState('');
    const [suggestionSent, setSuggestionSent] = useState(false);

    // "Delete Mode" for My Announcements
    const [deleteMode, setDeleteMode] = useState(false);
    const [selectedToDelete, setSelectedToDelete] = useState<Set<string>>(new Set());

    useEffect(() => { 
        loadData(); 
        if(view === 'PUBLISH' || view === 'MANAGE') loadUsers();
    }, [view, managedAccount]);

    const loadUsers = async () => {
        const all = await dataService.getUsers();
        // Exclude 00 admin from being selectable as a target (as per prompt req "doesn't include 00")
        setUsers(all.filter(u => u.role_level !== 0));
    };

    const loadData = async () => {
        if (!user) return;
        const raw = await dataService.getAnnouncements();
        
        if (view === 'MY') {
            // Filter: 
            // 1. Normal: Published to me, NOT hidden by me
            // 2. 00 Admin: Show ALL (even if not targeted), NOT hidden by me
            setList(raw.filter(a => {
                if (a.is_force_deleted || a.type !== 'ANNOUNCEMENT') return false;
                if (a.hidden_by?.includes(user.id)) return false;

                if (user.role_level === 0) {
                    return true; // 00 sees all
                }
                return a.target_users.includes(user.id);
            }));
        } else if (view === 'MANAGE') {
            // Filter: By selected account (or self if empty/default).
            // Logic: Can only manage accounts with role level >= self (lower hierarchy, bigger number)
            const targetId = managedAccount || user.id;
            setList(raw.filter(a => 
                !a.is_force_deleted && 
                a.creator_id === targetId &&
                a.type === 'ANNOUNCEMENT'
            ));
        }
    };

    // --- Actions ---

    const handleOpenDetail = (ann: Announcement) => {
        // Mark as read if needed
        if (user && !ann.read_by?.includes(user.id)) {
            dataService.markAnnouncementRead(ann.id, user.id);
        }
        setSelectedAnn(ann);
        setView('DETAIL');
    };

    const handlePublish = async () => {
        if (!formTitle || !formContent) return alert("标题和内容必填");
        if (formTargets.length === 0) return alert("请选择接收对象");

        const payload: any = {
            title: formTitle,
            content: formContent,
            creator: user?.username,
            creator_id: user?.id,
            target_users: formTargets,
            popup_config: { enabled: formPopup, frequency: formFreq },
            allow_hide: formAllowHide,
            type: 'ANNOUNCEMENT'
        };

        if (editMode && editingId) {
            await dataService.updateAnnouncement(editingId, payload);
            alert("修改成功");
        } else {
            await dataService.createAnnouncement(payload);
            alert("发布成功");
        }
        resetForm();
        setView('MY');
    };

    const handleRevoke = async (id: string) => {
        if (!window.confirm("确定撤销此公告吗？撤销后所有用户将无法查看。")) return;
        await dataService.deleteAnnouncement(id, true); // Physical delete
        loadData();
    };

    const handleEdit = (ann: Announcement) => {
        setEditMode(true);
        setEditingId(ann.id);
        setFormTitle(ann.title);
        setFormContent(ann.content);
        setFormTargets(ann.target_users || []);
        setFormPopup(ann.popup_config?.enabled || false);
        setFormFreq(ann.popup_config?.frequency || 'ONCE');
        setFormAllowHide(ann.allow_hide ?? true);
        setView('PUBLISH');
    };

    const handleForceShow = async (ann: Announcement) => {
        if (!user) return;
        // In "Manage" view, if I click show, it forces it to show in MY announcement page (un-hide)
        await dataService.showAnnouncementAgain(ann.id, user.id);
        alert("棱镜: 已在‘我的公告’页面显示");
    };

    const handleMyHide = async () => {
        if (!user) return;
        for (const id of selectedToDelete) {
            await dataService.hideAnnouncement(id, user.id);
        }
        setDeleteMode(false);
        setSelectedToDelete(new Set());
        loadData();
    };

    const sendSuggestion = async () => {
        if (!suggestionText) return;
        // Suggestion is just a special announcement targeting admin_00
        await dataService.createAnnouncement({
            title: '用户意见反馈',
            content: suggestionText,
            creator: user?.username,
            creator_id: user?.id,
            target_users: ['admin_00'], 
            type: 'SUGGESTION',
            popup_config: { enabled: false, frequency: 'ONCE' }
        });
        setSuggestionSent(true);
    };

    const resetForm = () => {
        setEditMode(false); setEditingId(null);
        setFormTitle(''); setFormContent(''); setFormTargets([]);
        setFormPopup(false); setFormFreq('ONCE'); setFormAllowHide(true);
    };

    // --- Helpers ---
    const toggleSelection = (id: string) => {
        const next = new Set(selectedToDelete);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedToDelete(next);
    };

    const toggleTarget = (uid: string) => {
        if (formTargets.includes(uid)) setFormTargets(formTargets.filter(id => id !== uid));
        else setFormTargets([...formTargets, uid]);
    };

    const isUnread = (ann: Announcement) => {
        if (ann.read_by?.includes(user?.id||'')) return false;
        // Special 00 Logic: Only RED DOT if creator is also 00
        if (user?.role_level === 0) {
            return ann.creator_role === 0;
        }
        return true;
    };

    // --- Renderers ---

    if (view === 'DETAIL' && selectedAnn) {
        return (
            <div className="flex flex-col h-full bg-white dark:bg-gray-800 p-8 animate-fade-in">
                <button onClick={()=>setView('MY')} className="self-start mb-6 flex items-center gap-2 text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white transition-colors">
                    <Icons.ArrowRightLeft size={18} className="rotate-180"/> 返回列表
                </button>
                <h1 className="text-4xl font-black mb-4 dark:text-white">{selectedAnn.title}</h1>
                <div className="flex items-center gap-4 border-b border-gray-100 dark:border-gray-700 pb-6 mb-8 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                         <Icons.User size={16}/>
                         <span>发布人: 
                             <UsernameBadge name={selectedAnn.creator} roleLevel={selectedAnn.creator_role || 9}/>
                         </span>
                    </div>
                    <div>•</div>
                    <div>{new Date(selectedAnn.created_at).toLocaleString()}</div>
                </div>
                <div className="prose dark:prose-invert max-w-none overflow-y-auto custom-scrollbar flex-1" dangerouslySetInnerHTML={{ __html: selectedAnn.content }}></div>
            </div>
        );
    }

    if (view === 'SUGGESTION') {
        if (suggestionSent) {
            return (
                <div className="flex flex-col h-full items-center justify-center animate-scale-in">
                    <img src="https://i.ibb.co/vxq7QfYd/retouch-2025121423241826.png" className="w-32 h-32 mb-6 object-contain"/>
                    <h2 className="text-2xl font-black mb-2 dark:text-white">棱镜 APP</h2>
                    <p className="text-gray-500 font-medium">感谢您的宝贵建议！</p>
                    <button onClick={()=>{setSuggestionSent(false); setSuggestionText(''); setView('MY');}} className="mt-8 px-6 py-2 bg-black text-white rounded-xl">返回</button>
                </div>
            );
        }
        return (
            <div className="flex flex-col h-full p-8">
                 <h1 className="text-3xl font-black mb-6 dark:text-white">意见箱</h1>
                 <textarea 
                    value={suggestionText} 
                    onChange={e=>setSuggestionText(e.target.value)}
                    className="flex-1 w-full p-4 bg-gray-50 dark:bg-gray-700 rounded-2xl resize-none border-none outline-none text-lg mb-6 dark:text-white"
                    placeholder="请输入您的建议..."
                 />
                 <button onClick={sendSuggestion} className="w-full py-4 bg-black text-white rounded-2xl font-bold text-xl hover:scale-[1.01] transition-transform">
                     提交建议
                 </button>
            </div>
        );
    }

    if (view === 'PUBLISH') {
        return (
            <div className="flex flex-col h-full p-6 overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-black dark:text-white">{editMode ? '编辑公告' : '发布公告'}</h1>
                    <button onClick={()=>setView('MANAGE')} className="text-sm text-gray-500 hover:underline">取消</button>
                </div>

                <div className="space-y-6 max-w-4xl mx-auto w-full">
                    <input value={formTitle} onChange={e=>setFormTitle(e.target.value)} placeholder="公告标题" className="w-full text-2xl font-bold p-4 bg-transparent border-b-2 border-gray-200 dark:border-gray-700 outline-none dark:text-white placeholder-gray-400"/>
                    
                    <div>
                        <label className="block text-sm font-bold text-gray-500 mb-2">公告内容 (富文本)</label>
                        <RichTextEditor value={formContent} onChange={setFormContent} />
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-2xl space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-500 mb-2">接收对象 (不含00权限)</label>
                            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar p-2 border rounded-xl bg-white dark:bg-gray-900 dark:border-gray-700">
                                <button onClick={()=>{if(formTargets.length===users.length) setFormTargets([]); else setFormTargets(users.map(u=>u.id))}} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-lg text-xs font-bold">全选/全不选</button>
                                {users.map(u => (
                                    <button 
                                        key={u.id} 
                                        onClick={()=>toggleTarget(u.id)}
                                        className={`px-3 py-1 rounded-lg text-sm font-bold transition-colors ${formTargets.includes(u.id) ? 'bg-black text-white' : 'bg-gray-100 text-gray-500 dark:bg-gray-800'}`}
                                    >
                                        <UsernameBadge name={u.username} roleLevel={u.role_level}/>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col gap-2">
                                <label className="flex items-center gap-2 font-bold dark:text-white">
                                    <input type="checkbox" checked={formPopup} onChange={e=>setFormPopup(e.target.checked)} className="w-5 h-5 accent-black"/>
                                    启用弹窗提示
                                </label>
                                {formPopup && (
                                    <select value={formFreq} onChange={e=>setFormFreq(e.target.value as any)} className="p-2 rounded-lg border bg-white dark:bg-gray-700 dark:text-white">
                                        <option value="ONCE">一次性</option>
                                        <option value="DAY">每天一次</option>
                                        <option value="WEEK">每周一次</option>
                                        <option value="MONTH">每月一次</option>
                                        <option value="FOREVER">永久 (每次登录)</option>
                                    </select>
                                )}
                            </div>
                            <div className="flex items-center">
                                <label className="flex items-center gap-2 font-bold dark:text-white">
                                    <input type="checkbox" checked={formAllowHide} onChange={e=>setFormAllowHide(e.target.checked)} className="w-5 h-5 accent-black"/>
                                    允许用户手动删除 (隐藏)
                                </label>
                            </div>
                        </div>
                    </div>

                    <button onClick={handlePublish} className={`w-full py-4 rounded-xl font-black text-white text-xl shadow-lg transition-transform hover:scale-[1.01] ${editMode ? 'bg-blue-600' : 'bg-black'}`}>
                        {editMode ? '保存修改' : '立即发布'}
                    </button>
                </div>
            </div>
        );
    }

    // Default: MY View or MANAGE view (List views)
    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-900">
            {/* Header Tabs */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-10">
                <div className="flex gap-6">
                    <button onClick={()=>setView('MY')} className={`text-lg font-black pb-1 border-b-4 transition-colors ${view==='MY' ? 'border-purple-600 text-black dark:text-white' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>我的公告</button>
                    {(user?.role_level || 9) <= 1 && (
                         <button onClick={()=>setView('MANAGE')} className={`text-lg font-black pb-1 border-b-4 transition-colors ${view==='MANAGE' ? 'border-blue-600 text-black dark:text-white' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>公告管理</button>
                    )}
                    <button onClick={()=>setView('SUGGESTION')} className={`text-lg font-black pb-1 border-b-4 transition-colors ${view==='SUGGESTION' ? 'border-green-600 text-black dark:text-white' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>意见箱</button>
                </div>
                
                <div className="flex gap-2">
                    {view === 'MY' && (
                        deleteMode ? (
                            <>
                                <button onClick={()=>setDeleteMode(false)} className="px-4 py-2 bg-gray-100 rounded-xl font-bold text-sm">取消</button>
                                <button onClick={handleMyHide} className="px-4 py-2 bg-red-500 text-white rounded-xl font-bold text-sm">确认删除</button>
                            </>
                        ) : (
                            <button onClick={()=>setDeleteMode(true)} className="p-2 bg-gray-100 hover:bg-red-50 hover:text-red-500 rounded-xl transition-colors"><Icons.Minus size={20}/></button>
                        )
                    )}
                    {view === 'MANAGE' && (
                        <div className="flex gap-2">
                            <select 
                                value={managedAccount} 
                                onChange={e=>setManagedAccount(e.target.value)}
                                className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm font-bold border-none outline-none dark:text-white"
                            >
                                <option value="">选择账户...</option>
                                <option value={user?.id}>我自己</option>
                                {/* Only show users with HIGHER role number (lower permission) */}
                                {users.filter(u => u.role_level >= (user?.role_level || 9)).map(u => (
                                    <option key={u.id} value={u.id}>{u.username}</option>
                                ))}
                            </select>
                            <button onClick={()=>{ resetForm(); setView('PUBLISH'); }} className="px-4 py-2 bg-black text-white rounded-xl font-bold text-sm">+ 发布</button>
                        </div>
                    )}
                </div>
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                {list.length === 0 ? (
                    <div className="text-center py-20 text-gray-400">暂无公告</div>
                ) : (
                    <div className="space-y-3">
                        {list.map(item => (
                            <div 
                                key={item.id} 
                                onClick={() => {
                                    if(deleteMode && view === 'MY') toggleSelection(item.id);
                                    else if(view === 'MANAGE') { /* Do nothing on row click in manage? Or edit? Let's keep separate buttons */ }
                                    else handleOpenDetail(item);
                                }}
                                className={`
                                    bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm 
                                    flex items-center justify-between transition-all hover:shadow-md cursor-pointer
                                    ${view === 'MY' && isUnread(item) && !deleteMode ? 'border-l-4 border-l-red-500' : ''}
                                `}
                            >
                                <div className="flex items-center gap-4">
                                    {/* Delete Checkbox */}
                                    {deleteMode && view === 'MY' && (
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${selectedToDelete.has(item.id) ? 'bg-red-500 border-red-500 text-white' : 'border-gray-300'}`}>
                                            {selectedToDelete.has(item.id) && <Icons.Plus className="rotate-45" size={14}/>}
                                        </div>
                                    )}
                                    
                                    {/* Red Dot (Unread) */}
                                    {view === 'MY' && isUnread(item) && !deleteMode && (
                                        <div className="w-2 h-2 bg-red-500 rounded-full shrink-0"></div>
                                    )}

                                    <div>
                                        <h3 className="font-bold text-lg dark:text-white">{item.title}</h3>
                                        <div className="text-xs text-gray-500 mt-1 flex gap-2 items-center">
                                            <span>{new Date(item.created_at).toLocaleDateString()}</span>
                                            <span>•</span>
                                            <span className="flex items-center gap-1">发布人: <UsernameBadge name={item.creator} roleLevel={item.creator_role || 9}/></span>
                                        </div>
                                    </div>
                                </div>

                                {/* Manage Actions */}
                                {view === 'MANAGE' && (
                                    <div className="flex gap-2" onClick={e=>e.stopPropagation()}>
                                        <button onClick={()=>handleForceShow(item)} className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-bold hover:bg-green-200">显示</button>
                                        <button onClick={()=>handleEdit(item)} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-200">编辑</button>
                                        <button onClick={()=>handleRevoke(item.id)} className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-bold hover:bg-red-200">撤销</button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                
                {/* Pagination Placeholder (Visual Only as per Prompt requirement to match Inventory) */}
                <div className="flex justify-center mt-8 gap-2 opacity-50">
                    <button className="px-3 py-1 bg-gray-100 rounded text-sm disabled:opacity-50" disabled>上一页</button>
                    <span className="px-3 py-1 text-sm">第 1 页</span>
                    <button className="px-3 py-1 bg-gray-100 rounded text-sm disabled:opacity-50" disabled>下一页</button>
                </div>
            </div>
        </div>
    );
};
