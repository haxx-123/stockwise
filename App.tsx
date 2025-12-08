




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
import { generatePageSummary, formatUnit } from './utils/formatters';
import { authService } from './services/authService';
import { RichTextEditor } from './components/RichTextEditor';

declare const window: any;
declare const html2canvas: any;

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
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-xl w-full max-w-sm text-center">
                <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg mx-auto mb-6">
                    <Icons.Box size={40} />
                </div>
                <h1 className="text-2xl font-bold mb-8 dark:text-white">StockWise</h1>
                <form onSubmit={handleSubmit} className="space-y-4 text-left">
                    {error && <div className="text-red-500 text-sm text-center">{error}</div>}
                    <input className="w-full border p-3 rounded-lg dark:bg-gray-700 dark:text-white" placeholder="用户名" value={user} onChange={e=>setUser(e.target.value)} />
                    <input type="password" className="w-full border p-3 rounded-lg dark:bg-gray-700 dark:text-white" placeholder="密码" value={pass} onChange={e=>setPass(e.target.value)} />
                    <button className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold">登录</button>
                </form>
            </div>
        </div>
    );
};

// --- ANNOUNCEMENT SYSTEM ---
const AnnouncementOverlay = ({ onClose, unreadCount, setUnreadCount }: any) => {
    const [view, setView] = useState<'MY_LIST' | 'DETAIL' | 'MANAGE_SELECT' | 'MANAGE_LIST' | 'PUBLISH'>('MY_LIST');
    const [anns, setAnns] = useState<Announcement[]>([]);
    const [detailAnn, setDetailAnn] = useState<Announcement | null>(null);
    const [selectedUserForManage, setSelectedUserForManage] = useState<string>('');
    const [users, setUsers] = useState<User[]>([]);
    const [manageMode, setManageMode] = useState(false);
    
    // Publish State
    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState('');
    const [targetUsers, setTargetUsers] = useState<Set<string>>(new Set());
    const [popupEnabled, setPopupEnabled] = useState(false);
    const [popupDuration, setPopupDuration] = useState('ONCE');
    const [allowDelete, setAllowDelete] = useState(true);

    const user = authService.getCurrentUser();
    const perms = authService.permissions;
    const [deleteMode, setDeleteMode] = useState(false);
    const [selectedToDelete, setSelectedToDelete] = useState<Set<string>>(new Set());

    useEffect(() => { loadMyAnns(); dataService.getUsers().then(setUsers); }, []);

    const loadMyAnns = async () => {
        const all = await dataService.getAnnouncements();
        const myId = user?.id || '';
        const my = all.filter(a => 
            !a.is_force_deleted && 
            (!a.target_users?.length || a.target_users.includes(myId)) && 
            !a.read_by?.includes(`HIDDEN_BY_${myId}`)
        );
        setAnns(my);
        
        // Calculate Unread
        const unread = my.filter(a => !a.read_by?.includes(myId)).length;
        setUnreadCount(unread);
    };

    const loadUserAnns = async (uid: string) => {
        const all = await dataService.getAnnouncements();
        const targets = all.filter(a => a.creator_id === uid); 
        setAnns(targets);
    };

    const handleDelete = async () => {
        if (selectedToDelete.size === 0) return;
        if (!confirm("确定删除选中的公告?")) return;
        for(const id of selectedToDelete) {
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
            popup_config: { enabled: popupEnabled, duration: popupDuration },
            allow_delete: allowDelete
        });
        alert("发布成功"); setView('MY_LIST'); loadMyAnns();
    };

    const openDetail = (ann: Announcement) => {
        setDetailAnn(ann);
        setView('DETAIL');
        if (!manageMode && user) {
            dataService.markAnnouncementRead(ann.id, user.id);
            setUnreadCount((prev:number) => Math.max(0, prev - 1));
        }
    };

    // --- FULL PAGE DETAIL (Overlay) ---
    if (view === 'DETAIL' && detailAnn) {
        return (
             <div className="fixed inset-0 bg-white dark:bg-gray-900 z-[100] flex flex-col animate-fade-in w-full h-full">
                 <div className="p-4 border-b flex justify-between items-center bg-gray-50 dark:bg-gray-800 shrink-0">
                     <button onClick={()=>setView(manageMode ? 'MANAGE_LIST' : 'MY_LIST')} className="p-2 bg-gray-200 dark:bg-gray-700 rounded-full"><Icons.Minus className="dark:text-white" size={24}/></button>
                     <h2 className="font-bold dark:text-white truncate mx-4 flex-1 text-center">公告详情</h2>
                     <div className="w-10"></div>
                 </div>
                 <div className="p-6 overflow-y-auto w-full custom-scrollbar flex-1 bg-white dark:bg-gray-900">
                     <h1 className="text-2xl font-bold mb-4 dark:text-white">{detailAnn.title}</h1>
                     <div className="text-xs text-gray-500 mb-8 flex gap-4 border-b pb-4 dark:border-gray-700">
                         <span>发布人: {detailAnn.creator}</span>
                         <span>{new Date(detailAnn.created_at).toLocaleString()}</span>
                     </div>
                     <div className="prose dark:prose-invert max-w-none dark:text-gray-300" dangerouslySetInnerHTML={{__html: detailAnn.content}} />
                 </div>
             </div>
        );
    }

    // --- PUBLISH PAGE (Within Modal) ---
    if (view === 'PUBLISH') {
        return (
            <div className="fixed inset-0 bg-white dark:bg-gray-900 z-[100] flex flex-col animate-fade-in">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 dark:bg-gray-800">
                    <h2 className="font-bold dark:text-white">发布新公告</h2>
                    <button onClick={()=>setView('MY_LIST')} className="text-gray-500 dark:text-gray-300">取消</button>
                </div>
                <div className="p-4 flex-1 overflow-y-auto space-y-4 max-w-4xl mx-auto w-full custom-scrollbar pb-24">
                    <input className="w-full border p-3 rounded text-lg font-bold dark:bg-gray-800 dark:border-gray-600 dark:text-white" placeholder="公告标题" value={newTitle} onChange={e=>setNewTitle(e.target.value)} />
                    <RichTextEditor value={newContent} onChange={setNewContent} />
                     
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div className="border p-4 rounded h-40 overflow-y-auto dark:border-gray-600 custom-scrollbar">
                            <label className="block font-bold mb-2 dark:text-white">接收对象 (不选则全员)</label>
                            {users.map(u => <label key={u.id} className="block dark:text-gray-300"><input type="checkbox" onChange={e=>{const s=new Set(targetUsers); if(e.target.checked)s.add(u.id); else s.delete(u.id); setTargetUsers(s)}}/> {u.username}</label>)}
                         </div>
                         <div className="space-y-4 border p-4 rounded dark:border-gray-600">
                             <label className="flex items-center gap-2 dark:text-white font-bold"><input type="checkbox" checked={popupEnabled} onChange={e=>setPopupEnabled(e.target.checked)}/> 强制弹窗提醒</label>
                             {popupEnabled && (
                                 <select value={popupDuration} onChange={e=>setPopupDuration(e.target.value as any)} className="w-full border p-2 rounded dark:bg-gray-800 dark:text-white">
                                     <option value="ONCE">一次性</option>
                                     <option value="DAY">每天</option>
                                     <option value="WEEK">每周</option>
                                     <option value="MONTH">每月</option>
                                     <option value="FOREVER">永久</option>
                                 </select>
                             )}
                             <label className="flex items-center gap-2 dark:text-white font-bold mt-2"><input type="checkbox" checked={allowDelete} onChange={e=>setAllowDelete(e.target.checked)}/> 允许接收者删除(隐藏)</label>
                         </div>
                     </div>
                     <button onClick={handlePublish} className="w-full bg-blue-600 text-white py-3 rounded font-bold shadow-lg">发布公告</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">
                {/* Header */}
                <div className="flex border-b bg-gray-50 dark:bg-gray-800 dark:border-gray-700 shrink-0">
                    <button onClick={()=>{setView('MY_LIST'); setManageMode(false); loadMyAnns();}} className={`flex-1 py-4 font-bold ${!manageMode ? 'text-blue-600 border-b-2 border-blue-600 bg-white dark:bg-gray-900' : 'text-gray-500'}`}>我的公告</button>
                    {perms.can_publish_announcements && <button onClick={()=>{setView('PUBLISH');}} className="flex-1 py-4 font-bold text-gray-500 hover:bg-white hover:text-green-600">发布公告</button>}
                    {perms.can_publish_announcements && <button onClick={()=>{setView('MANAGE_SELECT'); setManageMode(true);}} className={`flex-1 py-4 font-bold ${manageMode ? 'text-blue-600 border-b-2 border-blue-600 bg-white dark:bg-gray-900' : 'text-gray-500'}`}>公告管理</button>}
                    <button onClick={onClose} className="px-6 text-gray-400 hover:bg-red-50"><Icons.Minus size={24}/></button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-gray-50/50 dark:bg-black/20">
                     {view === 'MY_LIST' && (
                         <>
                            <div className="flex justify-between mb-4">
                                <button onClick={()=>deleteMode?handleDelete():setDeleteMode(true)} className={`px-4 py-2 rounded font-bold ${deleteMode?'bg-red-600 text-white':'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>{deleteMode ? '确认删除' : '删除 (隐藏)'}</button>
                                {deleteMode && <button onClick={()=>setDeleteMode(false)} className="px-4 py-2 text-gray-500">取消</button>}
                            </div>
                            <div className="space-y-2">
                                {anns.map(a => (
                                    <div key={a.id} onClick={()=>{if(!deleteMode){openDetail(a);}}} className="p-4 bg-white dark:bg-gray-800 rounded border dark:border-gray-700 flex items-center gap-3 cursor-pointer hover:shadow-md transition-shadow relative">
                                        {/* Unread Dot */}
                                        {!manageMode && user && !a.read_by?.includes(user.id) && <div className="w-2 h-2 rounded-full bg-red-600 absolute top-4 right-4"></div>}
                                        
                                        {deleteMode && a.allow_delete && <input type="checkbox" onClick={e=>e.stopPropagation()} onChange={e=>{const s=new Set(selectedToDelete); if(e.target.checked)s.add(a.id); else s.delete(a.id); setSelectedToDelete(s)}} className="w-5 h-5" />}
                                        <div className="flex-1">
                                            <div className="font-bold dark:text-white text-lg">{a.title}</div>
                                            <div className="text-xs text-gray-400 mt-1">{new Date(a.created_at).toLocaleDateString()} - {a.creator}</div>
                                        </div>
                                        <Icons.ChevronRight className="text-gray-300"/>
                                    </div>
                                ))}
                                {anns.length === 0 && <div className="text-center text-gray-400 py-10">暂无公告</div>}
                            </div>
                         </>
                     )}

                     {view === 'MANAGE_SELECT' && (
                         <div className="max-w-md mx-auto mt-10 space-y-4">
                             <div className="text-center font-bold mb-4 dark:text-white">请先选择账户进行管理</div>
                             <select className="w-full border p-3 rounded dark:bg-gray-800 dark:text-white" onChange={e=>{if(e.target.value){setSelectedUserForManage(e.target.value); loadUserAnns(e.target.value); setView('MANAGE_LIST');}}}>
                                 <option value="">-- 选择账户 --</option>
                                 <option value={user?.id}>我自己 ({user?.username})</option>
                                 {users.filter(u => u.role_level > (user?.role_level||0)).map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                             </select>
                         </div>
                     )}

                     {view === 'MANAGE_LIST' && (
                         <>
                            <div className="flex justify-between mb-4 items-center">
                                <button onClick={()=>setView('MANAGE_SELECT')} className="text-blue-600 underline text-sm">切换账户</button>
                                <div className="flex gap-2">
                                     <button onClick={()=>deleteMode?handleDelete():setDeleteMode(true)} className={`px-4 py-2 rounded font-bold ${deleteMode?'bg-red-600 text-white':'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>{deleteMode ? '确认删除 (强制)' : '删除'}</button>
                                     {deleteMode && <button onClick={()=>setDeleteMode(false)} className="px-4 py-2 text-gray-500">取消</button>}
                                </div>
                            </div>
                            <div className="space-y-2">
                                {anns.map(a => (
                                    <div key={a.id} onClick={()=>{if(!deleteMode){openDetail(a);}}} className="p-4 bg-white dark:bg-gray-800 rounded border dark:border-gray-700 flex items-center gap-3 cursor-pointer">
                                        {deleteMode && <input type="checkbox" onClick={e=>e.stopPropagation()} onChange={e=>{const s=new Set(selectedToDelete); if(e.target.checked)s.add(a.id); else s.delete(a.id); setSelectedToDelete(s)}} className="w-5 h-5" />}
                                        <div className="flex-1">
                                            <div className={`font-bold ${a.is_force_deleted ? 'text-red-500' : 'dark:text-white'}`}>
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
  
  // Announcement State
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(0);
  const [forcedAnnouncement, setForcedAnnouncement] = useState<Announcement | null>(null);

  // Mobile Tools Menu
  const [toolsOpen, setToolsOpen] = useState(false);

  const user = authService.getCurrentUser();
  const perms = authService.permissions;

  // LAYOUT LOCKING
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);
  
  // PERMISSION REDIRECT FOR INIT ACCOUNT
  useEffect(() => {
      if (isAuthenticated && perms.only_view_config) {
          if (currentPage !== 'settings-config') {
              setCurrentPage('settings-config');
          }
      }
  }, [isAuthenticated, currentPage, perms.only_view_config]);

  useEffect(() => {
    localStorage.setItem('sw_theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
  
  // Realtime Polling for Announcements
  useEffect(() => { 
      if (isAuthenticated && isConfigured()) { 
          refreshStores(); 
          checkAnnouncements(); 
          
          // Poll every 30 seconds for new announcements to make it "real-time" enough
          const interval = setInterval(checkAnnouncements, 30000);
          return () => clearInterval(interval);
      } 
  }, [isAuthenticated]);

  const refreshStores = async () => {
      const s = await dataService.getStores();
      setStores(s);
      if (user?.permissions.store_scope === 'LIMITED') {
          if (currentStore === 'all' || !user.allowed_store_ids.includes(currentStore)) {
              const firstAllowed = s.find(st => user.allowed_store_ids.includes(st.id));
              if (firstAllowed) setCurrentStore(firstAllowed.id);
          }
      }
  };

  const checkAnnouncements = async () => {
      if (!user) return;
      const all = await dataService.getAnnouncements();
      const myId = user.id;
      // Filter visible
      const visible = all.filter(a => !a.is_force_deleted && (!a.target_users?.length || a.target_users.includes(myId)) && !a.read_by?.includes(`HIDDEN_BY_${myId}`));
      
      const unread = visible.filter(a => !a.read_by?.includes(myId));
      setUnreadAnnouncements(unread.length);

      // Check Forced Popup Logic
      // Priority: Unread Force > Recurred Force
      const unreadForce = unread.find(a => a.popup_config?.enabled);
      
      if (unreadForce) {
          setForcedAnnouncement(unreadForce);
          return; // Stop processing, show unread first
      }

      // Check Recurring Popups (Even if read in DB, we check local storage for recurrence)
      const recurring = visible.filter(a => a.popup_config?.enabled && a.popup_config.duration !== 'ONCE');
      
      for (const ann of recurring) {
          const lastSeenKey = `sw_ann_last_seen_${ann.id}_${myId}`;
          const lastSeen = localStorage.getItem(lastSeenKey);
          const now = Date.now();
          
          let shouldShow = false;
          if (!lastSeen) {
              // If not seen locally but marked read in DB (e.g. read on another device), we might want to respect DB read or force show once on this device.
              // Logic: If 'Force', we assume we show it.
              shouldShow = true;
          } else {
              const lastTime = parseInt(lastSeen);
              const diff = now - lastTime;
              const day = 86400000;
              
              switch(ann.popup_config.duration) {
                  case 'DAY': if(diff > day) shouldShow = true; break;
                  case 'WEEK': if(diff > day * 7) shouldShow = true; break;
                  case 'MONTH': if(diff > day * 30) shouldShow = true; break;
                  case 'YEAR': if(diff > day * 365) shouldShow = true; break;
                  case 'FOREVER': shouldShow = true; break; // Always show on login/refresh
              }
          }

          if (shouldShow) {
              setForcedAnnouncement(ann);
              return; // Show one at a time
          }
      }
  };

  const handleCopyText = async () => {
      let content = "当前页面不支持复制";
      const format = (d: any) => generatePageSummary(currentPage, d);
      try {
          if (currentPage === 'inventory') {
             const prods = await dataService.getProducts(false, currentStore);
             const batches = await dataService.getBatches(currentStore==='all'?undefined:currentStore);
             const agg = prods.map(p => ({
                 product: p,
                 totalQuantity: batches.filter(b=>b.product_id===p.id).reduce((s,b)=>s+b.quantity,0),
                 batches: batches.filter(b=>b.product_id===p.id)
             }));
             content = format(agg);
          } else if (currentPage === 'logs') {
              const l = await dataService.getTransactions('ALL', 50);
              content = format(l);
          } else if (currentPage === 'audit') {
              const a = await dataService.getAuditLogs(50);
              content = format(a);
          }
          await navigator.clipboard.writeText(content);
          alert("已复制“大白话”文本到剪贴板");
      } catch(e) { alert("复制失败"); }
  };

  const handleScreenshot = () => {
      const targetId = currentPage === 'inventory' ? 'table-inventory' : (currentPage === 'logs' ? 'table-logs' : 'main-content-area');
      const el = document.getElementById(targetId) || document.getElementById('main-content-area');
      if (el && html2canvas) {
          html2canvas(el).then((canvas: any) => {
              const link = document.createElement('a');
              link.download = `screenshot_${currentPage}_${Date.now()}.png`;
              link.href = canvas.toDataURL();
              link.click();
          });
      } else alert("截图失败");
  };

  const handleExcel = () => {
      if(!['inventory','logs','audit','settings-perms'].includes(currentPage)) {
          return alert("此页面不支持导出 Excel");
      }
      if(!(window as any).XLSX) return alert("导出组件未加载");

      (async () => {
          let data: any[] = [];
          if(currentPage === 'inventory') {
             const p = await dataService.getProducts(false, currentStore);
             const b = await dataService.getBatches(currentStore==='all'?undefined:currentStore);
             
             data = [];
             for (const prod of p) {
                 const prodBatches = b.filter(x => x.product_id === prod.id);
                 if (prodBatches.length === 0) {
                     data.push({
                         商品: prod.name, SKU: prod.sku, 类别: prod.category, 
                         总库存: 0, 批号: '-', 门店: '-', 大单位数: 0, 小单位数: 0, 有效期: '-'
                     });
                 } else {
                     for (const batch of prodBatches) {
                         data.push({
                             商品: prod.name, 
                             SKU: prod.sku, 
                             类别: prod.category,
                             总库存: formatUnit(prodBatches.reduce((s,i)=>s+i.quantity,0), prod),
                             批号: batch.batch_number,
                             门店: batch.store_name || '-',
                             大单位数: Math.floor(batch.quantity / (prod.split_ratio||1)),
                             小单位数: batch.quantity % (prod.split_ratio||1),
                             有效期: batch.expiry_date ? batch.expiry_date.split('T')[0] : '-'
                         });
                     }
                 }
             }

          } else if(currentPage === 'logs') {
              const l = await dataService.getTransactions('ALL', 200);
              data = l.map(x => ({
                  时间: x.timestamp, 操作人: x.operator, 类型: x.type, 商品: x.product?.name, 数量: x.quantity
              }));
          } else if(currentPage === 'audit') {
               const a = await dataService.getAuditLogs(100);
               data = a.map(x => ({ID: x.id, 表: x.table_name, 操作: x.operation, 时间: x.timestamp}));
          }

          const ws = (window as any).XLSX.utils.json_to_sheet(data);
          const wb = (window as any).XLSX.utils.book_new();
          (window as any).XLSX.utils.book_append_sheet(wb, ws, "Export");
          (window as any).XLSX.writeFile(wb, `StockWise_Export_${currentPage}.xlsx`);
      })();
  };

  if (!isAuthenticated) return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;

  const renderPage = () => {
    if (currentPage.startsWith('settings')) return <Settings subPage={currentPage.split('-')[1]} onThemeChange={setTheme} />;
    switch (currentPage) {
      case 'dashboard': return <Dashboard currentStore={currentStore} onNavigate={setCurrentPage} />;
      case 'inventory': return <Inventory currentStore={currentStore} />;
      case 'import': return <Import currentStore={currentStore} />;
      case 'logs': return <Logs />;
      case 'audit': return perms.can_manage_audit ? <Audit /> : <div className="p-8 text-center text-gray-500">审计大厅已隐藏</div>;
      case 'ai': return <AIInsights currentStore={currentStore} />;
      default: return <Dashboard currentStore={currentStore} onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-950 flex font-sans text-gray-800 dark:text-gray-100 overflow-hidden">
      {!perms.only_view_config && <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} currentStore={currentStore} hasUnread={false} />}
      
      <div className="flex-1 flex flex-col h-full relative">
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm px-4 py-3 flex items-center justify-between z-20 shrink-0 h-16">
            <h2 className="text-lg font-semibold capitalize text-gray-800 dark:text-white truncate">{currentPage.split('-')[0]}</h2>
            
            <div className="flex items-center space-x-2">
                
                {/* Unified Tool Menu */}
                <div className="relative">
                    <button onClick={() => setToolsOpen(!toolsOpen)} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 relative">
                        <Icons.Menu size={24}/>
                        {unreadAnnouncements > 0 && <div className="w-2.5 h-2.5 bg-red-600 rounded-full absolute top-1 right-1 ring-2 ring-white"></div>}
                    </button>
                    {toolsOpen && (
                        <div className="absolute right-0 top-12 bg-white dark:bg-gray-800 border dark:border-gray-700 shadow-xl rounded-xl w-48 flex flex-col z-50 overflow-hidden animate-fade-in">
                            <button onClick={()=>{setAnnouncementOpen(true); setToolsOpen(false);}} className="p-3 text-left border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 flex justify-between items-center">
                                📢 公告 {unreadAnnouncements > 0 && <span className="bg-red-600 text-white text-xs px-1.5 rounded-full">{unreadAnnouncements}</span>}
                            </button>
                            <button onClick={()=>{handleScreenshot(); setToolsOpen(false);}} className="p-3 text-left border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">📷 截图</button>
                            {['inventory','logs','audit','settings-perms'].includes(currentPage) && 
                                <button onClick={()=>{handleCopyText(); setToolsOpen(false);}} className="p-3 text-left border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">📄 复制文字</button>
                            }
                            {['inventory','logs','audit','settings-perms'].includes(currentPage) && 
                                <button onClick={()=>{handleExcel(); setToolsOpen(false);}} className="p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700">📊 Excel 导出</button>
                            }
                        </div>
                    )}
                </div>

                {/* Store Selector (Hidden for Init Account) */}
                {!perms.only_view_config && (
                    <button onClick={() => setStoreModalOpen(true)} className="flex items-center bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-3 py-2 rounded-lg font-medium text-xs md:text-sm truncate max-w-[120px]">
                        <Icons.Store size={16} className="mr-1" />
                        <span>{currentStore === 'all' ? (user?.permissions.store_scope === 'LIMITED' ? '可用门店' : '所有门店') : stores.find(s=>s.id===currentStore)?.name || '门店'}</span>
                    </button>
                )}
            </div>
        </header>

        {/* Content Area - Locked Layout - PB-24 for mobile nav */}
        <div id="main-content-area" className="flex-1 overflow-auto custom-scrollbar p-0 relative bg-gray-50 dark:bg-gray-950 pb-24 md:pb-0">
            {renderPage()}
        </div>
      </div>

      {storeModalOpen && !perms.only_view_config && (
          <StoreManager isOpen={storeModalOpen} onClose={() => setStoreModalOpen(false)} stores={stores} currentStore={currentStore} setStore={setCurrentStore} refresh={refreshStores} canManage={perms.can_manage_stores} />
      )}
      
      {announcementOpen && <AnnouncementOverlay onClose={() => setAnnouncementOpen(false)} unreadCount={unreadAnnouncements} setUnreadCount={setUnreadAnnouncements} />}
      
      {/* FORCED POPUP */}
      {forcedAnnouncement && (
          <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-6 animate-fade-in">
              <div className="bg-white dark:bg-gray-900 rounded-xl max-w-lg w-full p-6 shadow-2xl relative">
                  <h1 className="text-2xl font-bold text-red-600 mb-4">重要公告 (必读)</h1>
                  <h2 className="text-xl font-bold mb-2 dark:text-white">{forcedAnnouncement.title}</h2>
                  <div className="prose dark:prose-invert max-h-60 overflow-y-auto mb-6 custom-scrollbar" dangerouslySetInnerHTML={{__html: forcedAnnouncement.content}} />
                  <button onClick={()=>{
                      // Mark as read in DB if needed
                      if (!forcedAnnouncement.read_by?.includes(user!.id)) {
                          dataService.markAnnouncementRead(forcedAnnouncement.id, user!.id);
                      }
                      
                      // Update Local Timestamp for Recurrence
                      const key = `sw_ann_last_seen_${forcedAnnouncement.id}_${user!.id}`;
                      localStorage.setItem(key, Date.now().toString());

                      setForcedAnnouncement(null);
                      // Trigger re-check in case there are more
                      setTimeout(checkAnnouncements, 500); 
                  }} className="w-full bg-blue-600 text-white py-3 rounded font-bold">我已阅读并知晓</button>
              </div>
          </div>
      )}
    </div>
  );
};

// ... StoreManager component (updated permissions) ...
const StoreManager = ({ onClose, stores, currentStore, setStore, refresh, canManage }: any) => {
    const user = authService.getCurrentUser();
    const visibleStores = user?.permissions.store_scope === 'LIMITED' ? stores.filter((s:any) => user.allowed_store_ids.includes(s.id)) : stores;
    const [contextMenu, setContextMenu] = useState<{x:number, y:number, storeId: string} | null>(null);

    const handleRightClick = (e: React.MouseEvent, sid: string) => {
        if (!canManage) return;
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, storeId: sid });
    };

    const handleAction = async (action: 'RENAME' | 'DELETE') => {
        if (!contextMenu) return;
        try {
            if (action === 'DELETE') {
                if(confirm("确定删除该门店？(只有库存归零才可删除)")) {
                    await dataService.deleteStore(contextMenu.storeId);
                    refresh();
                }
            } else if (action === 'RENAME') {
                const name = prompt("新名称:");
                if (name) {
                    await dataService.updateStore(contextMenu.storeId, { name });
                    refresh();
                }
            }
        } catch(e: any) { alert(e.message); }
        setContextMenu(null);
    };

    const handleCreate = async () => {
        const name = prompt("门店名称:");
        if(name) {
            await dataService.createStore(name);
            refresh();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-md shadow-2xl relative" onClick={e=>e.stopPropagation()}>
                 <h3 className="font-bold text-lg mb-4 dark:text-white flex justify-between">
                     切换门店
                     {canManage && <button onClick={handleCreate} className="text-xs bg-green-600 text-white px-2 py-1 rounded">新建</button>}
                 </h3>
                 <div className="max-h-60 overflow-y-auto space-y-2">
                     {user?.permissions.store_scope !== 'LIMITED' && (
                         <button onClick={()=>{setStore('all'); onClose();}} className="w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-800 border-b dark:border-gray-700 dark:text-white">所有门店</button>
                     )}
                     {visibleStores.map((s:any) => (
                         <button 
                            key={s.id} 
                            onClick={()=>{setStore(s.id); onClose();}} 
                            onContextMenu={(e)=>handleRightClick(e, s.id)}
                            className={`w-full text-left p-3 rounded ${currentStore===s.id ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-200'}`}
                         >
                             {s.name}
                         </button>
                     ))}
                 </div>
                 
                 {contextMenu && (
                     <div className="fixed bg-white dark:bg-gray-800 shadow-xl border dark:border-gray-600 rounded z-[60]" style={{top: contextMenu.y, left: contextMenu.x}}>
                         <button onClick={()=>handleAction('RENAME')} className="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white text-sm">重命名</button>
                         <button onClick={()=>handleAction('DELETE')} className="block w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 dark:hover:bg-gray-700 text-sm">删除</button>
                     </div>
                 )}
            </div>
        </div>
    );
};

export default App;