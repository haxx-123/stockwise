
import React, { useState, useEffect, Suspense } from 'react';
import { Sidebar } from './components/Sidebar';
import { Icons } from './components/Icons';
import { dataService } from './services/dataService';
import { Store, User } from './types';
import { isConfigured } from './services/supabaseClient';
import { authService } from './services/authService';
import { PermissionProvider } from './contexts/PermissionContext';
import { FaceAuth } from './components/FaceAuth'; 
import { createPortal } from 'react-dom';

// 1. Define Lazy Imports
const DashboardPromise = import('./pages/Dashboard');
const Dashboard = React.lazy(() => DashboardPromise.then(m => ({ default: m.Dashboard })));

const InventoryPromise = () => import('./pages/Inventory');
const Inventory = React.lazy(() => InventoryPromise().then(m => ({ default: m.Inventory })));

const ImportPromise = () => import('./pages/Import');
const Import = React.lazy(() => ImportPromise().then(m => ({ default: m.Import })));

const LogsPromise = () => import('./pages/Logs');
const Logs = React.lazy(() => LogsPromise().then(m => ({ default: m.Logs })));

const AuditPromise = () => import('./pages/Audit');
const Audit = React.lazy(() => AuditPromise().then(m => ({ default: m.Audit })));

const SettingsPromise = () => import('./pages/Settings');
const Settings = React.lazy(() => SettingsPromise().then(m => ({ default: m.Settings })));

const AnnouncementCenterPromise = () => import('./pages/AnnouncementCenter');
const AnnouncementCenter = React.lazy(() => AnnouncementCenterPromise().then(m => ({ default: m.AnnouncementCenter })));

const StoreManagementPromise = () => import('./pages/StoreManagement');
const StoreManagement = React.lazy(() => StoreManagementPromise().then(m => ({ default: m.StoreManagement })));

declare const window: any;
declare const faceapi: any;

const Splash = ({ isReady }: { isReady: boolean }) => (
    <div className={`fixed inset-0 bg-[#888888] z-[9999] flex flex-col items-center justify-center transition-all duration-800 ease-out ${isReady ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <img src="https://i.ibb.co/vxq7QfYd/retouch-2025121423241826.png" className="w-24 h-24 mb-6 drop-shadow-2xl object-contain animate-bounce" />
        <h1 className="text-3xl font-black text-black tracking-[0.5em] text-center mb-8 uppercase">棱镜<br/><span className="text-xs tracking-[1em] text-gray-700 font-medium">StockWise</span></h1>
    </div>
);

// Top Right Actions Bar (Updated: Always visible icons)
const TopActions = ({ onOpenAnnouncement, currentPage }: { onOpenAnnouncement: () => void, currentPage: string }) => {
    const [hasUnread, setHasUnread] = useState(false);

    useEffect(() => {
        const checkUnread = async () => {
            const user = authService.getCurrentUser();
            if(!user) return;
            const all = await dataService.getAnnouncements();
            const valid = all.filter(a => {
                if (a.is_force_deleted || a.type !== 'ANNOUNCEMENT') return false;
                if (a.hidden_by?.includes(user.id) || a.read_by?.includes(user.id)) return false;
                if (user.role_level === 0) return a.creator_role === 0;
                return a.target_users.includes(user.id);
            });
            setHasUnread(valid.length > 0);
        };
        checkUnread();
        const interval = setInterval(checkUnread, 30000);
        return () => clearInterval(interval);
    }, []);

    const ALLOWED_PAGES = ['inventory', 'logs', 'audit-logs', 'audit-devices', 'settings-perms'];
    const showActionBtns = ALLOWED_PAGES.includes(currentPage);

    const handleScreenshot = async () => {
        const el = document.getElementById('main-content-scroll');
        if (!el || !(window as any).html2canvas) return;
        const btn = document.getElementById('screenshot-btn');
        if (btn) btn.classList.add('animate-spin');
        const originalScrollTop = el.scrollTop;
        const originalStyleHeight = el.style.height;
        const originalStyleOverflow = el.style.overflow;
        try {
            const totalHeight = el.scrollHeight;
            const step = Math.max(100, totalHeight / 20);
            for (let i = 0; i <= totalHeight; i += step) { el.scrollTop = i; await new Promise(r => setTimeout(r, 10)); }
            el.scrollTop = 0; await new Promise(r => setTimeout(r, 200));
            el.style.height = `${totalHeight}px`; el.style.overflow = 'visible';
            let bgColor = '#888888';
            if (document.documentElement.classList.contains('theme-dark')) bgColor = '#000000';
            if (document.documentElement.classList.contains('theme-light')) bgColor = '#f3f4f6';
            const canvas = await (window as any).html2canvas(el, { backgroundColor: bgColor, scale: 2, useCORS: true, logging: false, height: totalHeight, windowHeight: totalHeight });
            const link = document.createElement('a'); link.download = `StockWise_LongCap_${Date.now()}.png`; link.href = canvas.toDataURL('image/png'); link.click();
        } catch (err) { console.error("Screenshot failed", err); alert("长截图生成失败"); } 
        finally { el.style.height = originalStyleHeight; el.style.overflow = originalStyleOverflow; el.scrollTop = originalScrollTop; if (btn) btn.classList.remove('animate-spin'); }
    };

    const handleExcel = () => { window.dispatchEvent(new CustomEvent('trigger-excel-export')); };
    const handleCopy = () => { window.dispatchEvent(new CustomEvent('trigger-copy')); };
    const handleAnnouncement = () => { onOpenAnnouncement(); };

    const ActionButtons = () => (
        <>
            <button id="screenshot-btn" onClick={handleScreenshot} className="p-2 bg-white/80 backdrop-blur shadow-lg rounded-full hover:scale-110 transition-transform flex items-center justify-center w-10 h-10 border border-white/20" title="长截图">
                <Icons.Camera size={18}/> 
            </button>
            {showActionBtns && (
                <>
                    <button onClick={handleExcel} className="p-2 bg-white/80 backdrop-blur shadow-lg rounded-full hover:scale-110 transition-transform flex items-center justify-center w-10 h-10 border border-white/20" title="导出Excel">
                        <Icons.FileSpreadsheet size={18}/>
                    </button>
                    <button onClick={handleCopy} className="p-2 bg-white/80 backdrop-blur shadow-lg rounded-full hover:scale-110 transition-transform flex items-center justify-center w-10 h-10 border border-white/20" title="复制内容">
                        <Icons.Copy size={18}/>
                    </button>
                </>
            )}
            <button onClick={handleAnnouncement} className="p-2 bg-white/80 backdrop-blur shadow-lg rounded-full hover:scale-110 transition-transform relative flex items-center justify-center w-10 h-10 border border-white/20" title="公告">
                <Icons.Megaphone size={18}/>
                {hasUnread && <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse"></div>}
            </button>
            <InstallButton />
        </>
    );

    return (
        <div className="fixed top-4 right-4 z-[90] no-print flex gap-2">
            <ActionButtons />
        </div>
    );
};

const InstallButton = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [showIOS, setShowIOS] = useState(false);
    useEffect(() => {
        window.addEventListener('beforeinstallprompt', (e: any) => { e.preventDefault(); setDeferredPrompt(e); });
        const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        if (isIos && !(window.navigator as any).standalone) setShowIOS(true);
    }, []);
    const install = () => {
        if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.then(() => setDeferredPrompt(null)); } 
        else if (showIOS) { alert("请点击浏览器底部的分享按钮，然后选择“添加到主屏幕”"); }
    };
    if (!deferredPrompt && !showIOS) return null;
    return <button onClick={install} className="p-2 bg-black text-white shadow-lg rounded-full hover:scale-110 transition-transform flex items-center justify-center w-10 h-10"><Icons.Download size={18}/></button>;
};

// App Content
const AppContent: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(!!authService.getCurrentUser());
  const [isReady, setIsReady] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [currentStoreId, setCurrentStoreId] = useState('all');
  const [stores, setStores] = useState<Store[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  
  // Theme
  useEffect(() => {
      const savedTheme = localStorage.getItem('sw_theme') || 'theme-prism';
      document.documentElement.className = savedTheme;
      if (savedTheme.includes('theme-dark')) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
  }, []);

  // Boot
  useEffect(() => {
      if (!isAuthenticated) return;
      const fetchStores = async () => {
          if (isConfigured()) { 
               try { const sList = await dataService.getStores(); setStores(sList); } catch (e) { console.error(e); }
          }
      };
      const boot = async () => { await fetchStores(); setIsReady(true); };
      boot();
      const handleRefresh = () => fetchStores();
      window.addEventListener('REFRESH_STORES', handleRefresh);
      const handleSwitch = (e: any) => { setCurrentStoreId(e.detail); alert("已切换当前门店视图"); };
      window.addEventListener('SWITCH_STORE_ID', handleSwitch);
      return () => { window.removeEventListener('REFRESH_STORES', handleRefresh); window.removeEventListener('SWITCH_STORE_ID', handleSwitch); };
  }, [isAuthenticated]);

  // Popup Logic
  useEffect(() => {
      if (isReady && isAuthenticated) {
          const todayStr = new Date().toISOString().split('T')[0];
          const sessionKey = `hasViewedPopup_${todayStr}`;
          if (sessionStorage.getItem(sessionKey)) return;
          dataService.getAnnouncements().then(anns => {
              const user = authService.getCurrentUser();
              if (!user) return;
              const valid = anns.find(a => {
                  if (a.is_force_deleted || !a.popup_config.enabled || a.hidden_by?.includes(user.id)) return false;
                  if (user.role_level === 0) return a.creator_role === 0;
                  return a.target_users.includes(user.id);
              });
              if (valid) { setAnnouncementOpen(true); sessionStorage.setItem(sessionKey, 'true'); }
          });
      }
  }, [isReady, isAuthenticated]);

  const handleLogin = async (u: string, p: string) => {
      const success = await authService.login(u, p);
      if (success) { setIsAuthenticated(true); window.location.reload(); }
      return success;
  };

  const handleFaceLogin = async (u: string) => {
      const success = await authService.loginWithFace(u);
      if (success) { setIsAuthenticated(true); window.location.reload(); }
      return success;
  };

  if (!isAuthenticated) return <LoginPage onLogin={handleLogin} onFaceLogin={handleFaceLogin} />;

  const currentStoreObj = stores.find(s => s.id === currentStoreId);
  const user = authService.getCurrentUser();
  const isViewer = currentStoreObj?.viewers?.includes(user?.id || '') && !currentStoreObj?.managers?.includes(user?.id || '') && user?.role_level !== 0;
  const isParentStore = !!(currentStoreObj && stores.some(child => child.parent_id === currentStoreObj.id));

  // --- ROUTER LOGIC ---
  let content = null;
  switch (currentPage) {
      case 'dashboard': content = <Dashboard currentStore={currentStoreId} onNavigate={setCurrentPage} />; break;
      case 'inventory': content = <Inventory currentStore={currentStoreId} isViewer={isViewer} />; break;
      case 'import-manual': content = isParentStore || isViewer ? <div className="p-10 text-center font-bold text-gray-500">此模式下无法导入商品</div> : <Import currentStore={currentStoreId} initialMode="MANUAL" />; break;
      case 'import-excel': content = isParentStore || isViewer ? <div className="p-10 text-center font-bold text-gray-500">此模式下无法导入商品</div> : <Import currentStore={currentStoreId} initialMode="EXCEL" />; break;
      case 'logs': content = <Logs />; break;
      case 'audit-logs': content = <Audit initialView="LOGS" />; break;
      case 'audit-devices': content = <Audit initialView="DEVICES" />; break;
      case 'store_manage': content = <StoreManagement />; break;
      default: 
        if (currentPage.startsWith('settings')) content = <Settings subPage={currentPage.split('-')[1]} />;
        break;
  }

  return (
    <>
    <Splash isReady={isReady} />
    <TopActions onOpenAnnouncement={()=>setAnnouncementOpen(true)} currentPage={currentPage} />
    
    <div className="h-screen flex font-sans text-black overflow-hidden bg-[#888888] body-bg">
      {!mobileMenuOpen && (
          <div className="fixed top-4 left-4 z-[60] md:hidden">
              <button onClick={()=>setMobileMenuOpen(true)} className="p-2 bg-white/80 backdrop-blur shadow-lg rounded-full"><Icons.Menu size={20}/></button>
          </div>
      )}

      <div className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 md:inset-auto md:z-0 md:flex md:shrink-0`}>
          <Sidebar 
             currentPage={currentPage} 
             onNavigate={(p) => { setCurrentPage(p); setMobileMenuOpen(false); }} 
             currentStore={currentStoreId} 
             stores={stores}
             isMobileDrawer={mobileMenuOpen} 
          />
      </div>
      
      {mobileMenuOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={()=>setMobileMenuOpen(false)}></div>}
      
      <div id="main-content-scroll" className="flex-1 flex flex-col h-full relative transition-all duration-300 overflow-hidden pt-24 md:pt-0 z-0">
        <div className="flex-1 overflow-auto custom-scrollbar p-0 relative pb-safe">
            <Suspense fallback={<div className="p-10 text-center text-white animate-pulse">Loading...</div>}>
                <div key={currentPage} className="animate-page-enter min-h-full">
                    {content}
                </div>
            </Suspense>
        </div>
      </div>

      {announcementOpen && createPortal(
          <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white dark:bg-gray-800 w-full max-w-5xl h-[85vh] rounded-3xl overflow-hidden shadow-2xl relative glass-panel flex flex-col animate-scale-in">
                  <button onClick={()=>setAnnouncementOpen(false)} className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 rounded-full z-10 transition-colors"><Icons.Minus size={20}/></button>
                  <div className="h-full overflow-hidden">
                      <Suspense fallback={<div className="p-10 text-center">Loading...</div>}><AnnouncementCenter /></Suspense>
                  </div>
              </div>
          </div>,
          document.body
      )}
    </div>
    </>
  );
};

// Replaced Login Page with robust FaceAuth
const LoginPage = ({ onLogin, onFaceLogin }: any) => {
    const [user, setUser] = useState('');
    const [pass, setPass] = useState('');
    const [isFaceAuthActive, setIsFaceAuthActive] = useState(false);
    const [faceDescriptor, setFaceDescriptor] = useState<string | null>(null);

    const initFaceAuth = async () => {
        if(!user) return alert("请输入用户名以便匹配人脸数据");
        try {
            const users = await dataService.getUsers();
            const target = users.find(u => u.username === user);
            if (!target) return alert("用户不存在");
            if (!target.face_descriptor) return alert("该用户未录入人脸数据，请先使用密码登录并在设置中录入。");
            setFaceDescriptor(target.face_descriptor);
            setIsFaceAuthActive(true);
        } catch(e) {
            alert("无法连接数据库验证用户信息");
        }
    };

    return (
        <div className="h-screen flex items-center justify-center bg-[#888888] p-4 body-bg">
            <div className="w-full max-w-md glass-panel p-8 rounded-3xl shadow-2xl animate-scale-in">
                <div className="text-center mb-8">
                     <img src="https://i.ibb.co/vxq7QfYd/retouch-2025121423241826.png" className="w-24 h-24 mx-auto mb-4 drop-shadow-2xl object-contain hover:scale-110 transition-transform duration-500" />
                     <h1 className="text-3xl font-black tracking-widest text-black">STOCKWISE</h1>
                </div>
                <div className="space-y-5">
                    <input className="w-full p-4 bg-white/40 rounded-2xl font-bold border border-white/20 placeholder-gray-600 text-black shadow-inner" placeholder="Username" value={user} onChange={e=>setUser(e.target.value)} />
                    <input type="password" className="w-full p-4 bg-white/40 rounded-2xl font-bold border border-white/20 placeholder-gray-600 text-black shadow-inner" placeholder="Password" value={pass} onChange={e=>setPass(e.target.value)} />
                    <div className="flex gap-4 mt-6">
                        <button onClick={()=>onLogin(user, pass)} className="flex-1 bg-black/90 text-white font-bold py-4 rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all">密码登录</button>
                        <button onClick={initFaceAuth} className="flex-1 bg-white/20 text-black border border-white/30 font-bold py-4 rounded-2xl shadow-xl hover:bg-white/40 active:scale-95 transition-all flex items-center justify-center gap-2"><Icons.Scan size={20}/> 人脸识别</button>
                    </div>
                </div>
            </div>
            {isFaceAuthActive && faceDescriptor && (
                <FaceAuth 
                    mode="LOGIN"
                    existingDescriptor={faceDescriptor}
                    onSuccess={() => { setIsFaceAuthActive(false); onFaceLogin(user); }}
                    onCancel={() => setIsFaceAuthActive(false)}
                />
            )}
        </div>
    );
};

const App = () => (
    <PermissionProvider>
        <AppContent />
    </PermissionProvider>
);

export default App;
