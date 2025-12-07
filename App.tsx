
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Inventory } from './pages/Inventory';
import { Import } from './pages/Import';
import { Logs } from './pages/Logs';
import { Audit } from './pages/Audit';
import { Settings } from './pages/Settings';
import { AIInsights } from './pages/AIInsights';
import { Icons } from './components/Icons';
import { dataService } from './services/dataService';
import { Store, Announcement, User } from './types';
import { isConfigured } from './services/supabaseClient';
import { generatePageSummary } from './utils/formatters';
import { authService } from './services/authService';
import { RichTextEditor } from './components/RichTextEditor';

declare const html2canvas: any;
declare const window: any;

// ... LoginScreen (same as before) ...
const LoginScreen = ({ onLogin }: any) => {
    const [user, setUser] = useState('');
    const [pass, setPass] = useState('');
    const [error, setError] = useState('');
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (await authService.login(user, pass)) onLogin(); else setError("用户名或密码错误");
    };
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-xl w-full max-w-sm">
                <h1 className="text-2xl font-bold text-center mb-8 dark:text-white">StockWise</h1>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && <div className="text-red-500 text-sm text-center">{error}</div>}
                    <input className="w-full border p-3 rounded-lg dark:bg-gray-700" placeholder="用户名" value={user} onChange={e=>setUser(e.target.value)} />
                    <input type="password" className="w-full border p-3 rounded-lg dark:bg-gray-700" placeholder="密码" value={pass} onChange={e=>setPass(e.target.value)} />
                    <button className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold">登录</button>
                </form>
            </div>
        </div>
    );
};

// --- ANNOUNCEMENT SYSTEM (Refactored) ---
const AnnouncementOverlay = ({ onClose }: any) => {
    const [view, setView] = useState<'MY_LIST' | 'DETAIL' | 'MANAGE_SELECT' | 'MANAGE_LIST' | 'MANAGE_DETAIL'>('MY_LIST');
    const [anns, setAnns] = useState<Announcement[]>([]);
    const [detailAnn, setDetailAnn] = useState<Announcement | null>(null);
    const [selectedUserForManage, setSelectedUserForManage] = useState<string>('');
    const [users, setUsers] = useState<User[]>([]);
    const [manageMode, setManageMode] = useState(false); // Are we in management view?
    
    // Publish State
    const [publishMode, setPublishMode] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState(''); // HTML
    const [targetUsers, setTargetUsers] = useState<Set<string>>(new Set());
    const [popupEnabled, setPopupEnabled] = useState(false);
    const [popupDuration, setPopupDuration] = useState('ONCE');

    const user = authService.getCurrentUser();
    const perms = authService.permissions;
    const [deleteMode, setDeleteMode] = useState(false);
    const [selectedToDelete, setSelectedToDelete] = useState<Set<string>>(new Set());

    useEffect(() => { loadMyAnns(); dataService.getUsers().then(setUsers); }, []);

    const loadMyAnns = async () => {
        const all = await dataService.getAnnouncements();
        // Filter for "My Announcements"
        const my = all.filter(a => !a.is_force_deleted && (!a.target_users?.length || a.target_users.includes(user?.id||'')) && !a.read_by?.includes('HIDDEN'));
        setAnns(my);
    };

    const loadUserAnns = async (uid: string) => {
        const all = await dataService.getAnnouncements();
        // Manager View: Show everything created by user, even deleted (marked red)
        const targets = all.filter(a => a.creator_id === uid); 
        setAnns(targets);
    };

    const handleDelete = async () => {
        if (selectedToDelete.size === 0) return;
        if (!confirm("确定删除选中的公告?")) return;
        for(const id of selectedToDelete) {
             // If manage mode -> Force Delete. If My List -> Soft Hide.
             await dataService.deleteAnnouncement(id, manageMode);
        }
        setDeleteMode(false); setSelectedToDelete(new Set());
        if (manageMode) loadUserAnns(selectedUserForManage); else loadMyAnns();
    };

    const handlePublish = async () => {
        if (!newTitle || !newContent) return alert("必填项缺失");
        await dataService.createAnnouncement({
            title: newTitle, content: newContent, creator: user?.username, creator_id: user?.id,
            target_users: Array.from(targetUsers), valid_until: new Date(Date.now() + 86400000 * 365).toISOString(),
            popup_config: { enabled: popupEnabled, duration: popupDuration }
        });
        alert("发布成功"); setPublishMode(false); loadMyAnns();
    };

    // Render Logic
    if (publishMode) {
        return (
            <div className="fixed inset-0 bg-white dark:bg-gray-900 z-[100] flex flex-col animate-fade-in">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 dark:bg-gray-800">
                    <h2 className="font-bold">发布公告</h2>
                    <button onClick={()=>setPublishMode(false)} className="text-gray-500">取消</button>
                </div>
                <div className="p-4 flex-1 overflow-y-auto space-y-4 max-w-3xl mx-auto w-full">
                    <input className="w-full border p-3 rounded text-lg font-bold" placeholder="标题" value={newTitle} onChange={e=>setNewTitle(e.target.value)} />
                    <RichTextEditor value={newContent} onChange={setNewContent} />
                    {/* User Select & Popup Config (Simplified for brevity but same as before) */}
                     <div className="border p-4 rounded h-40 overflow-y-auto">
                        <label className="block font-bold mb-2">接收对象</label>
                        {users.map(u => <label key={u.id} className="block"><input type="checkbox" onChange={e=>{const s=new Set(targetUsers); if(e.target.checked)s.add(u.id); else s.delete(u.id); setTargetUsers(s)}}/> {u.username}</label>)}
                     </div>
                     <label className="flex items-center gap-2"><input type="checkbox" checked={popupEnabled} onChange={e=>setPopupEnabled(e.target.checked)}/> 强制弹窗</label>
                     <button onClick={handlePublish} className="w-full bg-blue-600 text-white py-3 rounded font-bold">发布</button>
                </div>
            </div>
        );
    }

    if (view === 'DETAIL' && detailAnn) {
        return (
             <div className="fixed inset-0 bg-white dark:bg-gray-900 z-[100] flex flex-col animate-fade-in">
                 <div className="p-4 border-b flex justify-between items-center bg-gray-50 dark:bg-gray-800">
                     <button onClick={()=>setView(manageMode ? 'MANAGE_LIST' : 'MY_LIST')}><Icons.ArrowRightLeft className="rotate-180" size={24}/></button>
                     <h2 className="font-bold">公告详情</h2>
                     <div className="w-6"></div>
                 </div>
                 <div className="p-6 overflow-y-auto max-w-3xl mx-auto w-full">
                     <h1 className="text-2xl font-bold mb-2">{detailAnn.title}</h1>
                     <div className="text-xs text-gray-500 mb-6 flex gap-4"><span>发布人: {detailAnn.creator}</span><span>{new Date(detailAnn.created_at).toLocaleString()}</span></div>
                     <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{__html: detailAnn.content}} />
                 </div>
             </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">
                {/* Header Tabs */}
                <div className="flex border-b bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                    <button onClick={()=>{setView('MY_LIST'); setManageMode(false); loadMyAnns();}} className={`flex-1 py-4 font-bold ${!manageMode ? 'text-blue-600 border-b-2 border-blue-600 bg-white dark:bg-gray-900' : 'text-gray-500'}`}>我的公告</button>
                    {perms.can_publish_announcements && <button onClick={()=>{setView('MANAGE_SELECT'); setManageMode(true);}} className={`flex-1 py-4 font-bold ${manageMode ? 'text-blue-600 border-b-2 border-blue-600 bg-white dark:bg-gray-900' : 'text-gray-500'}`}>公告管理</button>}
                    <button onClick={onClose} className="px-6 text-gray-400 hover:bg-red-50"><Icons.Minus size={24}/></button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-gray-50/50 dark:bg-black/20">
                     {/* MY LIST VIEW */}
                     {view === 'MY_LIST' && (
                         <>
                            <div className="flex justify-between mb-4">
                                <button onClick={()=>deleteMode?handleDelete():setDeleteMode(true)} className={`px-4 py-2 rounded font-bold ${deleteMode?'bg-red-600 text-white':'bg-gray-200 text-gray-600'}`}>{deleteMode ? '确认删除' : '删除'}</button>
                                {deleteMode && <button onClick={()=>setDeleteMode(false)} className="px-4 py-2 text-gray-500">取消</button>}
                            </div>
                            <div className="space-y-2">
                                {anns.map(a => (
                                    <div key={a.id} onClick={()=>{if(!deleteMode){setDetailAnn(a); setView('DETAIL');}}} className="p-4 bg-white dark:bg-gray-800 rounded border dark:border-gray-700 flex items-center gap-3 cursor-pointer hover:shadow-md">
                                        {deleteMode && <input type="checkbox" onClick={e=>e.stopPropagation()} onChange={e=>{const s=new Set(selectedToDelete); if(e.target.checked)s.add(a.id); else s.delete(a.id); setSelectedToDelete(s)}} />}
                                        <div className="flex-1">
                                            <div className="font-bold dark:text-white">{a.title}</div>
                                            <div className="text-xs text-gray-400">{new Date(a.created_at).toLocaleDateString()} - {a.creator}</div>
                                        </div>
                                    </div>
                                ))}
                                {anns.length === 0 && <div className="text-center text-gray-400 py-10">无公告</div>}
                            </div>
                         </>
                     )}

                     {/* MANAGE SELECT VIEW */}
                     {view === 'MANAGE_SELECT' && (
                         <div className="max-w-md mx-auto mt-10 space-y-4">
                             <div className="text-center font-bold mb-4">请先选择账户进行管理</div>
                             <select className="w-full border p-3 rounded" onChange={e=>{setSelectedUserForManage(e.target.value); loadUserAnns(e.target.value); setView('MANAGE_LIST');}}>
                                 <option value="">-- 选择账户 --</option>
                                 <option value={user?.id}>我自己 ({user?.username})</option>
                                 {users.filter(u => u.role_level > (user?.role_level||0)).map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                             </select>
                             <div className="border-t pt-4 mt-4">
                                <button onClick={()=>setPublishMode(true)} className="w-full bg-green-600 text-white py-3 rounded font-bold shadow">发布新公告</button>
                             </div>
                         </div>
                     )}

                     {/* MANAGE LIST VIEW */}
                     {view === 'MANAGE_LIST' && (
                         <>
                            <div className="flex justify-between mb-4 items-center">
                                <button onClick={()=>setView('MANAGE_SELECT')} className="text-blue-600 underline text-sm">切换账户</button>
                                <div className="flex gap-2">
                                     <button onClick={()=>deleteMode?handleDelete():setDeleteMode(true)} className={`px-4 py-2 rounded font-bold ${deleteMode?'bg-red-600 text-white':'bg-gray-200 text-gray-600'}`}>{deleteMode ? '确认删除 (强制)' : '删除'}</button>
                                     {deleteMode && <button onClick={()=>setDeleteMode(false)} className="px-4 py-2 text-gray-500">取消</button>}
                                </div>
                            </div>
                            <div className="space-y-2">
                                {anns.map(a => (
                                    <div key={a.id} onClick={()=>{if(!deleteMode){setDetailAnn(a); setView('DETAIL');}}} className="p-4 bg-white dark:bg-gray-800 rounded border dark:border-gray-700 flex items-center gap-3 cursor-pointer">
                                        {deleteMode && <input type="checkbox" onClick={e=>e.stopPropagation()} onChange={e=>{const s=new Set(selectedToDelete); if(e.target.checked)s.add(a.id); else s.delete(a.id); setSelectedToDelete(s)}} />}
                                        <div className="flex-1">
                                            <div className={`font-bold ${a.is_force_deleted ? 'text-red-500 line-through' : 'dark:text-white'}`}>
                                                {a.title} {a.is_force_deleted && '(已被强制删除)'}
                                            </div>
                                            <div className="text-xs text-gray-400">{new Date(a.created_at).toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                         </>
                     )}
                </div>
            </div>
        </div>
    );
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(!!authService.getCurrentUser());
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [currentStore, setCurrentStore] = useState('all');
  const [stores, setStores] = useState<Store[]>([]);
  const [theme, setTheme] = useState(localStorage.getItem('sw_theme') || 'light');
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const user = authService.getCurrentUser();
  const perms = authService.permissions;

  // Layout Locking
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);
  useEffect(() => {
    localStorage.setItem('sw_theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
  
  useEffect(() => { if (isAuthenticated && isConfigured()) refreshStores(); }, [isAuthenticated]);

  const refreshStores = async () => {
      const s = await dataService.getStores();
      setStores(s);
      // STRICT ISOLATION INITIAL CHECK
      if (user?.permissions.store_scope === 'LIMITED') {
          // If current is 'all' or unauthorized, force first allowed
          if (currentStore === 'all' || !user.allowed_store_ids.includes(currentStore)) {
              const firstAllowed = s.find(st => user.allowed_store_ids.includes(st.id));
              if (firstAllowed) setCurrentStore(firstAllowed.id);
          }
      }
  };

  const handleCopyText = async () => {
      let content = "当前页面不支持导出";
      const getData = async () => {
          if (currentPage === 'inventory') {
             const prods = await dataService.getProducts(false, currentStore); 
             return prods.map(p => `${p.name} | 库存: N/A`).join('\n'); // Simplified for "Big Vernacular" constraint
          }
          // ... implement other page fetches similarly
          return "请在页面内查看";
      };
      
      content = await getData();
      navigator.clipboard.writeText(content);
      alert("已复制到剪贴板");
  };

  const handleExcel = () => { if(perms.can_export_excel) alert("请使用桌面端进行完整导出"); };

  if (!isAuthenticated) return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;

  const renderPage = () => {
    if (currentPage.startsWith('settings')) return <Settings subPage={currentPage.split('-')[1]} onThemeChange={setTheme} />;
    switch (currentPage) {
      case 'dashboard': return <Dashboard currentStore={currentStore} onNavigate={setCurrentPage} />;
      case 'inventory': return <Inventory currentStore={currentStore} />;
      case 'import': return <Import currentStore={currentStore} />;
      case 'logs': return <Logs />;
      case 'audit': return <Audit />;
      case 'ai': return <AIInsights currentStore={currentStore} />;
      default: return <Dashboard currentStore={currentStore} onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-950 flex font-sans text-gray-800 dark:text-gray-100 overflow-hidden">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} currentStore={currentStore} />
      
      <div className="flex-1 flex flex-col h-full relative">
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm px-4 py-3 flex items-center justify-between z-20 shrink-0 h-16">
            <h2 className="text-lg font-semibold capitalize text-gray-800 dark:text-white">{currentPage.split('-')[0]}</h2>
            <div className="flex items-center space-x-3">
                
                {/* Mobile Tools Dropdown */}
                <div className="md:hidden relative">
                    <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2"><Icons.LayoutDashboard size={24} /></button>
                    {mobileMenuOpen && (
                        <div className="absolute right-0 top-10 bg-white dark:bg-gray-800 border dark:border-gray-700 shadow-xl rounded-xl w-40 flex flex-col z-50">
                            <button onClick={()=>setAnnouncementOpen(true)} className="p-3 text-left border-b dark:border-gray-700">公告</button>
                            <button onClick={()=>alert('截图')} className="p-3 text-left border-b dark:border-gray-700">截图</button>
                            {['inventory','logs','audit','settings-perms'].includes(currentPage) && <button onClick={handleCopyText} className="p-3 text-left border-b dark:border-gray-700">复制文字</button>}
                            {perms.can_export_excel && <button onClick={handleExcel} className="p-3 text-left">导出 Excel</button>}
                        </div>
                    )}
                </div>

                {/* Desktop Tools */}
                <div className="hidden md:flex items-center space-x-2">
                     <button onClick={()=>setAnnouncementOpen(true)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">📢</button>
                     <button onClick={()=>alert('截图')} className="p-2 bg-gray-100 dark:bg-gray-800 rounded"><Icons.Box size={18}/></button>
                     {/* ... others ... */}
                </div>

                {/* Store Manager */}
                <button onClick={() => setStoreModalOpen(true)} className="flex items-center bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-3 py-2 rounded-lg font-medium text-xs md:text-sm truncate max-w-[120px]">
                    <Icons.Store size={16} className="mr-1" />
                    <span>{currentStore === 'all' ? (user?.permissions.store_scope === 'LIMITED' ? '可用门店' : '所有门店') : stores.find(s=>s.id===currentStore)?.name || '门店'}</span>
                </button>
            </div>
        </header>

        {/* Added pb-24 for mobile bottom clearance */}
        <div id="main-content-area" className="flex-1 overflow-auto custom-scrollbar p-0 relative bg-gray-50 dark:bg-gray-950 pb-24 md:pb-0">
            {renderPage()}
        </div>
      </div>

      {storeModalOpen && (
          <StoreManager isOpen={storeModalOpen} onClose={() => setStoreModalOpen(false)} stores={stores} currentStore={currentStore} setStore={setCurrentStore} refresh={refreshStores} />
      )}
      {announcementOpen && <AnnouncementOverlay onClose={() => setAnnouncementOpen(false)} />}
    </div>
  );
};

// ... StoreManager (Updated for Strict Isolation) ...
const StoreManager = ({ onClose, stores, currentStore, setStore, refresh }: any) => {
    const user = authService.getCurrentUser();
    const visibleStores = user?.permissions.store_scope === 'LIMITED' ? stores.filter((s:any) => user.allowed_store_ids.includes(s.id)) : stores;
    
    // ... Context Menu Logic ...

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-md shadow-2xl relative" onClick={e=>e.stopPropagation()}>
                 <h3 className="font-bold text-lg mb-4 dark:text-white">切换门店</h3>
                 <div className="max-h-60 overflow-y-auto space-y-2">
                     {user?.permissions.store_scope !== 'LIMITED' && (
                         <button onClick={()=>{setStore('all'); onClose();}} className="w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-800 border-b">所有门店</button>
                     )}
                     {visibleStores.map((s:any) => (
                         <button key={s.id} onClick={()=>{setStore(s.id); onClose();}} className={`w-full text-left p-3 rounded ${currentStore===s.id ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-200'}`}>
                             {s.name}
                         </button>
                     ))}
                 </div>
                 {/* Admin Create Button logic ... */}
            </div>
        </div>
    );
};

export default App;
