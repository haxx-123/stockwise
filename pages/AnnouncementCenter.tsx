
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
            <div className="flex flex-col h-full bg-white dark:bg-gray-900 p-8 animate-fade-in overflow-hidden">
                <button onClick={()=>setView('MY')} className="self-start mb-6 flex items-center gap-2 text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white transition-colors">
                    <Icons.ArrowRightLeft size={18} className="rotate-180"/> 返回列表
                </button>
                <div className="glass-panel p-8 rounded-3xl shadow-xl flex-1 flex flex-col border border-white/20 overflow-hidden">
                    <h1 className="text-3xl font-black mb-4 dark:text-white">{selectedAnn.title}</h1>
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
                    <div className="prose dark:prose-invert max-w-none overflow-y-auto custom-scrollbar flex-1 pr-2" dangerouslySetInnerHTML={{ __html: selectedAnn.content }}></div>
                </div>
            </div>
        );
    }

    if (view === 'SUGGESTION') {
        if (suggestionSent) {
            return (
                <div className="flex flex-col h-full items-center justify-center animate-scale-in p-8">
                    <div className="p-8 bg-white dark:bg-gray-800 rounded-3xl shadow-xl text-center border border-white/20">
                        <img src="https://i.ibb.co/vxq7QfYd/retouch-2025121423241826.png" className="w-24 h-24 mb-6 object-contain mx-auto"/>
                        <h2 className="text-2xl font-black mb-2 dark:text-white">反馈已提交</h2>
                        <p className="text-gray-500 font-medium mb-8">感谢您的宝贵建议，我们将持续改进！</p>
                        <button onClick={()=>{setSuggestionSent(false); setSuggestionText(''); setView('MY');}} className="px-8 py-3 bg-black text-white rounded-xl font-bold shadow-lg hover:scale-105 transition-transform">返回列表</button>
                    </div>
                </div>
            );
        }
        return (
            <div className="flex flex-col h-full p-6 md:p-8 overflow-hidden">
                 <div className="flex items-center justify-between mb-6">
                     <h1 className="text-3xl font-black dark:text-white">意见箱</h1>
                     <button onClick={()=>setView('MY')} className="text-gray-500 hover:text-black dark:text-gray-400 font-bold">取消</button>
                 </div>
                 
                 <div className="glass-panel flex-1 flex flex-col p-6 rounded-3xl shadow-xl border border-white/20 overflow-hidden relative">
                     <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-green-400 to-teal-500"></div>
                     <p className="text-gray-500 dark:text-gray-400 mb-4 font-medium text-sm">您的建议将直接发送给系统管理员 (00权限)。</p>
                     
                     <textarea 
                        value={suggestionText} 
                        onChange={e=>setSuggestionText(e.target.value)}
                        className="flex-1 w-full p-5 bg-gray-50 dark:bg-gray-800/50 rounded-2xl resize-none border-2 border-transparent focus:border-green-500 outline-none text-lg mb-6 dark:text-white transition-colors custom-scrollbar"
                        placeholder="请输入您的建议或反馈..."
                     />
                     <button onClick={sendSuggestion} className="w-full py-4 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-2xl font-black text-xl hover:shadow-xl hover:scale-[1.01] transition-all shadow-lg flex items-center justify-center gap-2">
                         <Icons.Megaphone size={20}/> 提交建议
                     </button>
                 </div>
            </div>
        );
    }

    if (view === 'PUBLISH') {
        return (
            <div className="flex flex-col h-full p-6 overflow-y-auto custom-scrollbar animate-fade-in pb-24">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-black dark:text-white">{editMode ? '编辑公告' : '发布公告'}</h1>
                    <button onClick={()=>setView('MANAGE')} className="text-sm font-bold text-gray-500 hover:text-black dark:hover:text-white bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-lg">取消</button>
                </div>

                <div className="space-y-6 max-w-4xl mx-auto w-full glass-panel p-8 rounded-3xl shadow-xl border border-white/20">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">公告标题</label>
                        <input value={formTitle} onChange={e=>setFormTitle(e.target.value)} placeholder="请输入标题..." className="w-full text-xl font-bold p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border-2 border-transparent focus:border-black dark:focus:border-white outline-none dark:text-white placeholder-gray-400 transition-colors"/>
                    </div>
                    
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">公告内容 (富文本)</label>
                        <RichTextEditor value={formContent} onChange={setFormContent} />
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-2xl space-y-6 border border-gray-100 dark:border-gray-800">
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <label className="text-xs font-bold text-gray-500 uppercase">接收对象 (不含00权限)</label>
                                <button onClick={()=>{if(formTargets.length===users.length) setFormTargets([]); else setFormTargets(users.map(u=>u.id))}} className="px-3 py-1 bg-white dark:bg-gray-800 shadow-sm rounded-lg text-xs font-bold hover:scale-105 transition-transform">全选/全不选</button>
                            </div>
                            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800">
                                {users.length === 0 && <span className="text-gray-400 text-sm">暂无其他用户</span>}
                                {users.map(u => (
                                    <button 
                                        key={u.id} 
                                        onClick={()=>toggleTarget(u.id)}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all border ${formTargets.includes(u.id) ? 'bg-black text-white border-black shadow-md' : 'bg-gray-50 text-gray-500 border-transparent dark:bg-gray-700 dark:text-gray-300'}`}
                                    >
                                        <UsernameBadge name={u.username} roleLevel={u.role_level}/>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col gap-3">
                                <label className="flex items-center gap-3 font-bold dark:text-white cursor-pointer p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                                    <input type="checkbox" checked={formPopup} onChange={e=>setFormPopup(e.target.checked)} className="w-5 h-5 accent-black rounded-lg"/>
                                    启用弹窗提示 (强制阅读)
                                </label>
                                {formPopup && (
                                    <div className="flex items-center gap-2 pl-2">
                                        <span className="text-xs font-bold text-gray-500">频率:</span>
                                        <select value={formFreq} onChange={e=>setFormFreq(e.target.value as any)} className="p-2 rounded-xl border bg-white dark:bg-gray-800 dark:text-white outline-none text-sm font-bold shadow-sm">
                                            <option value="ONCE">一次性</option>
                                            <option value="DAY">每天一次</option>
                                            <option value="WEEK">每周一次</option>
                                            <option value="MONTH">每月一次</option>
                                            <option value="FOREVER">永久 (每次登录)</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center">
                                <label className="flex items-center gap-3 font-bold dark:text-white cursor-pointer p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 w-full">
                                    <input type="checkbox" checked={formAllowHide} onChange={e=>setFormAllowHide(e.target.checked)} className="w-5 h-5 accent-black rounded-lg"/>
                                    允许用户手动删除 (隐藏)
                                </label>
                            </div>
                        </div>
                    </div>

                    <button onClick={handlePublish} className={`w-full py-4 rounded-2xl font-black text-white text-xl shadow-xl transition-all hover:scale-[1.01] active:scale-95 ${editMode ? 'bg-blue-600' : 'bg-black'}`}>
                        {editMode ? '保存修改' : '🚀 立即发布'}
                    </button>
                </div>
            </div>
        );
    }

    // Default: MY View or MANAGE view (List views)
    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-900">
            {/* Header Tabs */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-10 shadow-sm">
                <div className="flex gap-4 md:gap-6 overflow-x-auto no-scrollbar">
                    <button onClick={()=>setView('MY')} className={`text-lg font-black pb-1 border-b-4 transition-colors whitespace-nowrap ${view==='MY' ? 'border-purple-600 text-black dark:text-white' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>我的公告</button>
                    {(user?.role_level || 9) <= 1 && (
                         <button onClick={()=>setView('MANAGE')} className={`text-lg font-black pb-1 border-b-4 transition-colors whitespace-nowrap ${view==='MANAGE' ? 'border-blue-600 text-black dark:text-white' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>公告管理</button>
                    )}
                    <button onClick={()=>setView('SUGGESTION')} className={`text-lg font-black pb-1 border-b-4 transition-colors whitespace-nowrap ${view==='SUGGESTION' ? 'border-green-600 text-black dark:text-white' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>意见箱</button>
                </div>
                
                <div className="flex gap-2 items-center">
                    {view === 'MY' && (
                        deleteMode ? (
                            <>
                                <button onClick={()=>setDeleteMode(false)} className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl font-bold text-xs">取消</button>
                                <button onClick={handleMyHide} className="px-4 py-2 bg-red-500 text-white rounded-xl font-bold text-xs shadow-md">确认删除</button>
                            </>
                        ) : (
                            <button onClick={()=>setDeleteMode(true)} className="p-2 bg-gray-100 dark:bg-gray-800 hover:bg-red-50 hover:text-red-500 rounded-xl transition-colors text-gray-600 dark:text-gray-300" title="删除模式"><Icons.Minus size={20}/></button>
                        )
                    )}
                    {view === 'MANAGE' && (
                        <div className="flex gap-2 items-center">
                            <select 
                                value={managedAccount} 
                                onChange={e=>setManagedAccount(e.target.value)}
                                className="hidden md:block px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-xs font-bold border-none outline-none dark:text-white cursor-pointer"
                            >
                                <option value="">筛选发布者...</option>
                                <option value={user?.id}>我自己</option>
                                {/* Only show users with HIGHER role number (lower permission) */}
                                {users.filter(u => u.role_level >= (user?.role_level || 9)).map(u => (
                                    <option key={u.id} value={u.id}>{u.username}</option>
                                ))}
                            </select>
                            <button onClick={()=>{ resetForm(); setView('PUBLISH'); }} className="px-4 py-2 bg-black text-white rounded-xl font-bold text-xs shadow-md hover:scale-105 transition-transform flex items-center gap-1">
                                <Icons.Plus size={16}/> 发布
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pb-24">
                {list.length === 0 ? (
                    <div className="text-center py-20 flex flex-col items-center">
                        <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full mb-4 text-gray-300">
                            <Icons.Megaphone size={32}/>
                        </div>
                        <span className="text-gray-400 font-bold">暂无公告</span>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {list.map((item, idx) => (
                            <div 
                                key={item.id} 
                                onClick={() => {
                                    if(deleteMode && view === 'MY') toggleSelection(item.id);
                                    else if(view === 'MANAGE') { /* Do nothing on row click in manage? Or edit? Let's keep separate buttons */ }
                                    else handleOpenDetail(item);
                                }}
                                className={`
                                    bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm 
                                    flex flex-col md:flex-row md:items-center justify-between transition-all hover:shadow-md cursor-pointer animate-slide-up opacity-0 gap-4
                                    ${view === 'MY' && isUnread(item) && !deleteMode ? 'border-l-4 border-l-red-500' : ''}
                                    ${deleteMode && selectedToDelete.has(item.id) ? 'bg-red-50 border-red-500 dark:bg-red-900/20' : ''}
                                `}
                                style={{ animationDelay: `${Math.min(idx * 50, 500)}ms` }}
                            >
                                <div className="flex items-start gap-4">
                                    {/* Delete Checkbox */}
                                    {deleteMode && view === 'MY' && (
                                        <div className={`mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${selectedToDelete.has(item.id) ? 'bg-red-500 border-red-500 text-white' : 'border-gray-300 dark:border-gray-600'}`}>
                                            {selectedToDelete.has(item.id) && <div className="w-3 h-3 bg-white rounded-full"></div>}
                                        </div>
                                    )}
                                    
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            {view === 'MY' && isUnread(item) && !deleteMode && (
                                                <span className="w-2 h-2 bg-red-500 rounded-full shrink-0 animate-pulse"></span>
                                            )}
                                            <h3 className="font-bold text-lg dark:text-white leading-tight">{item.title}</h3>
                                        </div>
                                        <div className="text-xs text-gray-500 flex flex-wrap gap-3 items-center">
                                            <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-600 dark:text-gray-300">{new Date(item.created_at).toLocaleDateString()}</span>
                                            <span className="flex items-center gap-1">发布人: <UsernameBadge name={item.creator} roleLevel={item.creator_role || 9}/></span>
                                            {item.type === 'SUGGESTION' && <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded font-bold">意见反馈</span>}
                                        </div>
                                    </div>
                                </div>

                                {/* Manage Actions */}
                                {view === 'MANAGE' && (
                                    <div className="flex gap-2 self-end md:self-center" onClick={e=>e.stopPropagation()}>
                                        <button onClick={()=>handleForceShow(item)} className="px-3 py-1.5 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200 rounded-xl text-xs font-bold hover:bg-green-200 transition-colors">显示</button>
                                        <button onClick={()=>handleEdit(item)} className="px-3 py-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 rounded-xl text-xs font-bold hover:bg-blue-200 transition-colors">编辑</button>
                                        <button onClick={()=>handleRevoke(item.id)} className="px-3 py-1.5 bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 rounded-xl text-xs font-bold hover:bg-red-200 transition-colors">撤销</button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
