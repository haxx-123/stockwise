
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Inventory } from './pages/Inventory';
import { Import } from './pages/Import';
import { Logs } from './pages/Logs';
import { Audit } from './pages/Audit';
import { Settings } from './pages/Settings';
import { Operations } from './pages/Operations';
import { AIInsights } from './pages/AIInsights';
import { Icons } from './components/Icons';
import { dataService } from './services/dataService';
import { Store, Announcement, User } from './types';
import { isConfigured } from './services/supabaseClient';
import { generatePageSummary } from './utils/formatters';
import { authService } from './services/authService';

declare const html2canvas: any;
declare const window: any;

// ... LoginScreen Component ...
const LoginScreen = ({ onLogin }: any) => {
    const [user, setUser] = useState('');
    const [pass, setPass] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const success = await authService.login(user, pass);
        if (success) onLogin();
        else setError("用户名或密码错误");
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-xl w-full max-w-sm">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white">StockWise</h1>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && <div className="text-red-500 text-sm text-center">{error}</div>}
                    <input 
                        type="text" placeholder="用户名" 
                        className="w-full border p-3 rounded-lg dark:bg-gray-700 dark:text-white"
                        value={user} onChange={e => setUser(e.target.value)}
                    />
                    <div className="relative">
                        <input 
                            type={showPass ? "text" : "password"} placeholder="密码" 
                            className="w-full border p-3 rounded-lg dark:bg-gray-700 dark:text-white"
                            value={pass} onChange={e => setPass(e.target.value)}
                        />
                        <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-3 text-gray-400">
                            {showPass ? <Icons.ArrowRightLeft size={16}/> : <Icons.ChevronDown size={16}/>} 
                        </button>
                    </div>
                    <button className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold">登录</button>
                </form>
            </div>
        </div>
    );
};

// ... Announcement Modal (Complex 3 Tabs) ...
const AnnouncementModal = ({ onClose }: any) => {
    const [activeTab, setActiveTab] = useState<'VIEW' | 'PUBLISH' | 'MANAGE'>('VIEW');
    const [anns, setAnns] = useState<Announcement[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [expandedAnn, setExpandedAnn] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    
    // Publish State
    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState(''); // Simple HTML
    const [targetUsers, setTargetUsers] = useState<Set<string>>(new Set());
    const [popupEnabled, setPopupEnabled] = useState(false);
    const [popupDuration, setPopupDuration] = useState('ONCE');
    const [allowDelete, setAllowDelete] = useState(true);

    // Manage State
    const [manageAccount, setManageAccount] = useState('SELF');
    const [manageSelection, setManageSelection] = useState<Set<string>>(new Set());

    const user = authService.getCurrentUser();
    const PAGE_SIZE = 5;

    useEffect(() => {
        dataService.getAnnouncements().then(setAnns);
        dataService.getUsers().then(setUsers);
    }, []);

    const userAnns = anns.filter(a => {
        // Filter logic for "VIEW" tab:
        // 1. Not force deleted globally
        // 2. Targeted to user OR empty target (all)
        // 3. Not hidden by user (read_by logic used differently, actually we need a 'hidden_by' logic or reuse read_by as 'hidden')
        // Prompt says: "Delete only hides it". Let's use `read_by` to track if user 'deleted/hid' it.
        if (a.is_force_deleted) return false;
        if (a.target_users && a.target_users.length > 0 && !a.target_users.includes(user?.id || '')) return false;
        if (a.read_by?.includes(user?.id || 'HIDDEN')) return false; // If marked 'HIDDEN'
        return true;
    });

    const manageAnns = anns.filter(a => {
        if (manageAccount === 'SELF') return a.creator === user?.username;
        const targetUser = users.find(u => u.id === manageAccount);
        return a.creator === targetUser?.username;
    });

    const handlePublish = async () => {
        if (!newTitle || !newContent) return alert("标题和内容必填");
        await dataService.createAnnouncement({
            title: newTitle,
            content: newContent,
            creator: user?.username,
            creator_id: user?.id,
            target_users: Array.from(targetUsers),
            valid_until: new Date(Date.now() + 86400000 * 365).toISOString(), // Default 1 year validity
            popup_config: { enabled: popupEnabled, duration: popupDuration },
            allow_delete: allowDelete
        });
        alert("发布成功");
        setNewTitle(''); setNewContent(''); 
        dataService.getAnnouncements().then(setAnns);
    };

    const handleHide = async (ids: string[]) => {
        // For View Tab: Hide from myself
        const client = (dataService as any).getClient();
        for (const id of ids) {
             const { data: ann } = await client.from('announcements').select('read_by').eq('id', id).single();
             if (ann) {
                 const reads = ann.read_by || [];
                 // Use a special flag or just 'HIDDEN' appended to read_by is hacky but works given constraints
                 // Better: use `read_by` as the 'Hidden' list for this implementation context
                 const myId = user?.id || 'HIDDEN'; 
                 if (!reads.includes(myId)) {
                     await client.from('announcements').update({ read_by: [...reads, myId] }).eq('id', id);
                 }
             }
        }
        dataService.getAnnouncements().then(setAnns);
    };

    const handleForceDelete = async () => {
        // For Manage Tab: Globally hide/delete
        const client = (dataService as any).getClient();
        for (const id of manageSelection) {
            await client.from('announcements').update({ is_force_deleted: true }).eq('id', id);
        }
        setManageSelection(new Set());
        dataService.getAnnouncements().then(setAnns);
    };

    // Rich Text Mock
    const execCmd = (cmd: string, val?: string) => {
        document.execCommand(cmd, false, val);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-2xl h-[80vh] flex flex-col shadow-2xl dark:text-white overflow-hidden border dark:border-gray-700">
                <div className="flex border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                    {['VIEW', 'PUBLISH', 'MANAGE'].map(t => (
                        <button 
                            key={t}
                            onClick={() => setActiveTab(t as any)} 
                            className={`flex-1 py-3 text-sm font-bold ${activeTab === t ? 'text-blue-600 border-b-2 border-blue-600 bg-white dark:bg-gray-900' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                        >
                            {t === 'VIEW' ? '查看公告' : t === 'PUBLISH' ? '发布公告' : '公告管理'}
                        </button>
                    ))}
                    <button onClick={onClose} className="px-4 text-gray-400 hover:text-red-500"><Icons.Minus size={24}/></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-gray-900 custom-scrollbar">
                    {activeTab === 'VIEW' && (
                        <div>
                             <div className="mb-4 flex justify-between items-center">
                                <h3 className="font-bold">公告列表</h3>
                                <button onClick={() => {
                                    // Handle logic for bulk hide
                                }} className="text-red-500 text-sm">删除选中(隐藏)</button>
                             </div>
                             {userAnns.map(a => (
                                 <div key={a.id} className="mb-4 border rounded-lg dark:border-gray-700 overflow-hidden">
                                     <div 
                                        onClick={() => setExpandedAnn(expandedAnn === a.id ? null : a.id)}
                                        className="bg-gray-50 dark:bg-gray-800 p-3 flex justify-between items-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                     >
                                         <span className="font-medium text-sm flex items-center gap-2">
                                             {!a.read_by?.includes(user?.id||'xxx') && <span className="w-2 h-2 rounded-full bg-red-500"></span>}
                                             {a.title}
                                         </span>
                                         <span className="text-xs text-gray-400">{new Date(a.created_at).toLocaleDateString()}</span>
                                     </div>
                                     {expandedAnn === a.id && (
                                         <div className="p-4 bg-white dark:bg-gray-900 text-sm">
                                             <div className="mb-2 text-xs text-gray-500">发布者: {a.creator}</div>
                                             <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{__html: a.content}}></div>
                                             {a.allow_delete && (
                                                 <div className="mt-4 text-right">
                                                     <button onClick={() => handleHide([a.id])} className="text-red-500 text-xs border border-red-200 px-2 py-1 rounded hover:bg-red-50">删除 (隐藏)</button>
                                                 </div>
                                             )}
                                         </div>
                                     )}
                                 </div>
                             ))}
                        </div>
                    )}

                    {activeTab === 'PUBLISH' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold mb-1">接收用户 (空=所有人)</label>
                                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto border p-2 rounded dark:border-gray-700">
                                    {users.map(u => (
                                        <button 
                                            key={u.id}
                                            onClick={() => {
                                                const s = new Set(targetUsers);
                                                if(s.has(u.id)) s.delete(u.id); else s.add(u.id);
                                                setTargetUsers(s);
                                            }}
                                            className={`px-2 py-1 text-xs rounded border ${targetUsers.has(u.id) ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-gray-50 border-gray-200'}`}
                                        >
                                            {u.username}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-4 bg-gray-50 dark:bg-gray-800 p-3 rounded text-sm">
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={popupEnabled} onChange={e=>setPopupEnabled(e.target.checked)} />
                                    弹窗显示
                                </label>
                                {popupEnabled && (
                                    <select value={popupDuration} onChange={e=>setPopupDuration(e.target.value)} className="border rounded p-1 text-xs dark:bg-gray-700">
                                        {['ONCE','DAY','WEEK','MONTH','YEAR','FOREVER'].map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                )}
                                <label className="flex items-center gap-2 ml-auto">
                                    <input type="checkbox" checked={allowDelete} onChange={e=>setAllowDelete(e.target.checked)} />
                                    允许删除
                                </label>
                            </div>

                            <input className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-700 font-bold" placeholder="公告标题" value={newTitle} onChange={e=>setNewTitle(e.target.value)} />
                            
                            <div className="border rounded dark:border-gray-700 overflow-hidden">
                                <div className="bg-gray-100 dark:bg-gray-800 p-2 flex gap-2 border-b dark:border-gray-700">
                                    <button onMouseDown={e=>{e.preventDefault(); execCmd('bold')}} className="p-1 hover:bg-gray-200 rounded"><b>B</b></button>
                                    <button onMouseDown={e=>{e.preventDefault(); execCmd('italic')}} className="p-1 hover:bg-gray-200 rounded"><i>I</i></button>
                                    <button onMouseDown={e=>{e.preventDefault(); execCmd('underline')}} className="p-1 hover:bg-gray-200 rounded"><u>U</u></button>
                                </div>
                                <div 
                                    className="p-3 min-h-[150px] outline-none dark:bg-gray-900"
                                    contentEditable
                                    onInput={e => setNewContent(e.currentTarget.innerHTML)}
                                    dangerouslySetInnerHTML={{__html: newContent}}
                                ></div>
                            </div>

                            <button onClick={handlePublish} className="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700">发布公告</button>
                        </div>
                    )}

                    {activeTab === 'MANAGE' && (
                        <div>
                             <div className="mb-4 flex gap-4 items-center">
                                 <select value={manageAccount} onChange={e=>setManageAccount(e.target.value)} className="border p-1 rounded dark:bg-gray-800">
                                     <option value="SELF">我的账户</option>
                                     {user?.role_level === 0 && users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                                 </select>
                                 <button onClick={handleForceDelete} className="bg-red-600 text-white text-xs px-3 py-1 rounded">删除选中 (强制)</button>
                             </div>
                             
                             {manageAnns.map(a => (
                                 <div key={a.id} className="flex items-center gap-2 p-2 border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                                     <input 
                                        type="checkbox" 
                                        checked={manageSelection.has(a.id)} 
                                        onChange={() => {
                                            const s = new Set(manageSelection);
                                            if(s.has(a.id)) s.delete(a.id); else s.add(a.id);
                                            setManageSelection(s);
                                        }} 
                                     />
                                     <div className="flex-1" onClick={() => setExpandedAnn(expandedAnn === a.id ? null : a.id)}>
                                         <div className="flex justify-between">
                                            <span className={`font-medium text-sm ${a.is_force_deleted ? 'text-red-500 line-through' : ''}`}>
                                                {a.is_force_deleted && '(已被删除) '}{a.title}
                                            </span>
                                            <span className="text-xs text-gray-400">{new Date(a.created_at).toLocaleDateString()}</span>
                                         </div>
                                     </div>
                                 </div>
                             ))}
                             {expandedAnn && (
                                 <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded mt-2 text-sm border dark:border-gray-700">
                                     <div className="font-bold mb-2">详情预览:</div>
                                     <div dangerouslySetInnerHTML={{__html: anns.find(a=>a.id===expandedAnn)?.content || ''}}></div>
                                 </div>
                             )}
                        </div>
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
  const [unreadCount, setUnreadCount] = useState(0);

  const perms = authService.permissions;
  const user = authService.getCurrentUser();

  useEffect(() => {
    localStorage.setItem('sw_theme', theme);
    const root = document.documentElement;
    if (theme === 'dark') {
        root.classList.add('dark');
        document.body.style.backgroundColor = '#030712'; 
    } else {
        root.classList.remove('dark');
        document.body.style.backgroundColor = '#f9fafb';
    }
  }, [theme]);

  useEffect(() => {
    if (isAuthenticated && isConfigured()) {
        refreshStores();
        checkUnread();
    }
  }, [isAuthenticated]);

  const refreshStores = () => dataService.getStores().then(setStores).catch(() => {});
  
  const checkUnread = async () => {
      const allAnns = await dataService.getAnnouncements();
      const myUnread = allAnns.filter(a => {
          if (a.is_force_deleted) return false;
          if (a.target_users && a.target_users.length > 0 && !a.target_users.includes(user?.id || '')) return false;
          // Simple "Read" check using read_by array
          if (a.read_by?.includes(user?.id || '')) return false;
          return true;
      });
      setUnreadCount(myUnread.length);
  };

  const handleScreenshot = () => {
      const main = document.querySelector('main');
      if (main) html2canvas(main).then((canvas: any) => {
          const link = document.createElement('a');
          link.download = `screenshot.png`;
          link.href = canvas.toDataURL();
          link.click();
      });
  };

  const getDataForExport = async () => {
      if (currentPage === 'inventory') {
         const products = await dataService.getProducts();
         const batches = await dataService.getBatches(currentStore === 'all' ? undefined : currentStore);
         return products.map(p => {
             const b = batches.filter(x => x.product_id === p.id);
             return { product: p, totalQuantity: b.reduce((s,i)=>s+i.quantity,0), batches: b };
         });
      }
      if (currentPage === 'logs') return await dataService.getTransactions('ALL', 200, undefined, currentStore);
      if (currentPage === 'audit') return await dataService.getAuditLogs(100);
      return [];
  };

  const handleGenText = async () => {
      const allowedPages = ['inventory', 'logs', 'audit'];
      if (!allowedPages.includes(currentPage)) {
          return alert("提示：只能在“库存管理”和“操作日志”页面使用复制功能。");
      }
      try {
          const data = await getDataForExport();
          const summary = generatePageSummary(currentPage, data);
          navigator.clipboard.writeText(summary);
          alert("已复制到剪贴板！");
      } catch (e: any) { alert("复制失败: " + e.message); }
  };

  const handleExportExcel = async () => {
      const allowedPages = ['inventory', 'logs', 'audit'];
      if (!allowedPages.includes(currentPage)) {
          return alert("只能在【库存管理】、【操作日志】或【审计大厅】页面使用导出功能。");
      }
      if (!perms.can_export_excel) return alert("无权导出");
      
      try {
          const data = await getDataForExport();
          let flatData: any[] = [];
          
          if (currentPage === 'inventory') {
              (data as any[]).forEach(item => {
                  if (item.batches.length === 0) {
                      flatData.push({ 商品: item.product.name, SKU: item.product.sku, 总数: item.totalQuantity, 批号: '-', 数量: 0, 有效期: '-' });
                  } else {
                      item.batches.forEach((b: any) => {
                          flatData.push({ 商品: item.product.name, SKU: item.product.sku, 总数: item.totalQuantity, 批号: b.batch_number, 数量: b.quantity, 有效期: b.expiry_date });
                      });
                  }
              });
          } else if (currentPage === 'logs') {
              flatData = (data as any[]).map(l => ({
                  时间: l.timestamp, 操作人: l.operator, 类型: l.type, 商品: l.product?.name, 数量: l.quantity, 备注: l.note
              }));
          } else {
              flatData = data;
          }

          const wb = (window.XLSX).utils.book_new();
          const ws = (window.XLSX).utils.json_to_sheet(flatData);
          (window.XLSX).utils.book_append_sheet(wb, ws, "Sheet1");
          (window.XLSX).writeFile(wb, `${currentPage}_export.xlsx`);
      } catch (e: any) { alert("导出失败: " + e.message); }
  };

  if (!isAuthenticated) return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;

  const renderPage = () => {
    if (currentPage.startsWith('settings')) return <Settings subPage={currentPage.split('-')[1]} onThemeChange={setTheme} />;
    
    switch (currentPage) {
      case 'dashboard': return <Dashboard currentStore={currentStore} onNavigate={setCurrentPage} />;
      case 'inventory': return <Inventory currentStore={currentStore} />;
      case 'import': 
          if(currentStore === 'all') return <div className="p-8 text-center text-gray-500">请先切换到具体门店才能导入商品。</div>;
          return <Import />;
      case 'logs': return <Logs />;
      case 'audit': return <Audit />;
      case 'ai': return <AIInsights currentStore={currentStore} />;
      default: return <Dashboard currentStore={currentStore} onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex font-sans text-gray-800 dark:text-gray-100 transition-colors duration-300">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} currentStore={currentStore} />
      
      <main className="md:ml-64 flex-1 flex flex-col min-h-screen relative bg-gray-50 dark:bg-gray-950 mb-16 md:mb-0">
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10 shadow-sm px-6 py-3 flex items-center justify-between transition-colors">
            <h2 className="text-lg font-semibold capitalize text-gray-800 dark:text-white">{currentPage.split('-')[0]}</h2>
            <div className="flex items-center space-x-3">
                
                {/* Announcement Button (Rectangular + Red Dot) */}
                <button onClick={() => {setAnnouncementOpen(true); setUnreadCount(0);}} title="公告" className="flex items-center gap-2 px-3 py-2 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded relative hover:bg-yellow-200">
                    <span className="text-base">📢</span>
                    <span className="font-bold text-sm">公告</span>
                    {unreadCount > 0 && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-gray-900"></span>}
                </button>

                <div className="h-6 w-px bg-gray-300 dark:bg-gray-700 mx-2 hidden md:block"></div>
                <button onClick={handleScreenshot} title="截图" className="p-2 bg-gray-100 dark:bg-gray-800 rounded text-gray-600 dark:text-gray-300 hidden md:block"><Icons.Box size={18} /></button>
                <button onClick={handleGenText} title="复制文字" className="p-2 bg-gray-100 dark:bg-gray-800 rounded text-gray-600 dark:text-gray-300"><Icons.Sparkles size={18} /></button>
                <button onClick={handleExportExcel} title="导出Excel" className="p-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded"><Icons.Package size={18} /></button>
                <div className="h-6 w-px bg-gray-300 dark:bg-gray-700 mx-2"></div>
                <button onClick={() => setStoreModalOpen(true)} className="flex items-center bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-3 py-2 rounded-lg font-medium">
                    <Icons.Store size={18} className="mr-2" />
                    <span>{currentStore === 'all' ? '所有门店' : stores.find(s=>s.id===currentStore)?.name || '门店'}</span>
                </button>
            </div>
        </header>
        <div className="flex-1 overflow-auto custom-scrollbar relative">
            {renderPage()}
        </div>
      </main>

      {storeModalOpen && (
          <StoreManager isOpen={storeModalOpen} onClose={() => setStoreModalOpen(false)} stores={stores} currentStore={currentStore} setStore={setCurrentStore} refresh={refreshStores} />
      )}
      {announcementOpen && <AnnouncementModal onClose={() => setAnnouncementOpen(false)} />}
    </div>
  );
};

const StoreManager = ({ onClose, stores, currentStore, setStore, refresh }: any) => {
    const [tab, setTab] = useState('SWITCH');
    const [newName, setNewName] = useState('');
    const [contextMenu, setContextMenu] = useState<{id: string, x: number, y: number} | null>(null);

    const handleRightClick = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        setContextMenu({ id, x: e.clientX, y: e.clientY });
    };

    const handleRename = async () => {
        if (!contextMenu || !newName) return;
        try {
            await dataService.updateStore(contextMenu.id, { name: newName });
            refresh();
            setContextMenu(null);
            setNewName('');
        } catch(e: any) { alert(e.message); }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-md dark:text-white border dark:border-gray-700 shadow-2xl" onClick={() => setContextMenu(null)}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-lg">门店管理 (右键点击可重命名)</h3>
                    <button onClick={onClose}><Icons.Minus size={24} /></button>
                </div>
                
                <div className="flex border-b mb-4 dark:border-gray-700">
                    <button onClick={() => setTab('SWITCH')} className={`flex-1 pb-2 font-medium ${tab === 'SWITCH' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>切换</button>
                    <button onClick={() => setTab('CREATE')} className={`flex-1 pb-2 font-medium ${tab === 'CREATE' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>新建</button>
                </div>

                <div className="h-40 overflow-y-auto custom-scrollbar">
                    {tab === 'SWITCH' && (
                        <div className="space-y-2">
                            <button onClick={() => {setStore('all'); onClose();}} className="w-full text-left p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded font-bold">所有门店</button>
                            {stores.map((s:any) => (
                                <button 
                                    key={s.id} 
                                    onClick={() => {setStore(s.id); onClose();}} 
                                    onContextMenu={(e) => handleRightClick(e, s.id)}
                                    className="w-full text-left p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded"
                                >
                                    {s.name}
                                </button>
                            ))}
                        </div>
                    )}
                    {tab === 'CREATE' && (
                        <div className="space-y-2">
                            <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="新门店名称" className="w-full border p-2 rounded dark:bg-gray-800" />
                            <button onClick={async () => { await dataService.createStore(newName); refresh(); setNewName(''); }} className="w-full bg-blue-600 text-white p-2 rounded">确认新建</button>
                        </div>
                    )}
                </div>

                {contextMenu && (
                    <div 
                        className="fixed bg-white dark:bg-gray-800 shadow-xl border rounded p-2 z-50"
                        style={{ top: contextMenu.y, left: contextMenu.x }}
                        onClick={e => e.stopPropagation()}
                    >
                        <p className="text-xs text-gray-500 mb-2">重命名门店</p>
                        <input autoFocus className="border p-1 rounded text-sm mb-2" value={newName} onChange={e => setNewName(e.target.value)} />
                        <button onClick={handleRename} className="bg-blue-600 text-white px-2 py-1 rounded text-xs w-full">保存</button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default App;
