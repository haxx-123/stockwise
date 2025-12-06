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
import { Store, Announcement } from './types';
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

// ... Announcement Modal ...
const AnnouncementModal = ({ onClose }: any) => {
    const [anns, setAnns] = useState<Announcement[]>([]);
    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState('');
    const perms = authService.permissions;
    const user = authService.getCurrentUser();

    useEffect(() => {
        dataService.getAnnouncements().then(setAnns);
    }, []);

    const publish = async () => {
        if (!newTitle || !newContent) return;
        try {
            const nextWeek = new Date();
            nextWeek.setDate(nextWeek.getDate() + 7);
            await dataService.createAnnouncement({
                title: newTitle,
                content: newContent,
                creator: user?.username || 'Sys',
                audience_role: 'ALL',
                valid_until: nextWeek.toISOString(),
                popup_frequency: 'ALWAYS'
            });
            setNewTitle('');
            setNewContent('');
            dataService.getAnnouncements().then(setAnns);
        } catch(e: any) { alert(e.message); }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center animate-fade-in p-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-lg shadow-2xl dark:text-white max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg flex items-center gap-2"><div className="p-1 bg-yellow-100 rounded text-yellow-600"><Icons.Sparkles size={16}/></div> 系统公告</h3>
                    <button onClick={onClose}><Icons.Minus size={24}/></button>
                </div>
                
                <div className="flex-1 overflow-y-auto space-y-4 mb-4 custom-scrollbar">
                    {anns.length === 0 && <p className="text-center text-gray-500 py-8">暂无公告</p>}
                    {anns.map(a => (
                        <div key={a.id} className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700">
                            <h4 className="font-bold text-blue-600 dark:text-blue-400">{a.title}</h4>
                            <p className="text-sm mt-1 whitespace-pre-wrap">{a.content}</p>
                            <div className="text-xs text-gray-400 mt-2 text-right">By {a.creator} - {new Date(a.created_at).toLocaleDateString()}</div>
                        </div>
                    ))}
                </div>

                {perms.can_publish_announcements && (
                    <div className="border-t pt-4 dark:border-gray-700">
                        <input className="w-full border p-2 rounded mb-2 dark:bg-gray-800" placeholder="标题" value={newTitle} onChange={e=>setNewTitle(e.target.value)} />
                        <textarea className="w-full border p-2 rounded mb-2 h-20 dark:bg-gray-800" placeholder="内容..." value={newContent} onChange={e=>setNewContent(e.target.value)}></textarea>
                        <button onClick={publish} className="w-full bg-blue-600 text-white py-2 rounded font-bold">发布公告</button>
                    </div>
                )}
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
  const perms = authService.permissions;

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
    if (isAuthenticated && isConfigured()) refreshStores();
  }, [isAuthenticated]);

  const refreshStores = () => dataService.getStores().then(setStores).catch(() => {});

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
         // Filter products that have batches if strict view needed, but usually we just map
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
                <button onClick={() => setAnnouncementOpen(true)} title="公告" className="p-2 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded relative">
                    <Icons.Sparkles size={18} />
                    <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
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