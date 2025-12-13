

import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Icons } from './components/Icons';
import { dataService } from './services/dataService';
import { Store } from './types';
import { isConfigured } from './services/supabaseClient';
import { authService } from './services/authService';
import { PermissionProvider } from './contexts/PermissionContext';

// Static Imports for Stability
import { Dashboard } from './pages/Dashboard';
import { Inventory } from './pages/Inventory';
import { Import } from './pages/Import';
import { Logs } from './pages/Logs';
import { Audit } from './pages/Audit';
import { Settings } from './pages/Settings';
import { AnnouncementCenter } from './pages/AnnouncementCenter';
import { StoreManagement } from './pages/StoreManagement';

declare const window: any;

const SplashScreen = ({ isReady }: { isReady: boolean }) => {
    if (isReady) return null;
    
    return (
        <div className={`fixed inset-0 bg-white dark:bg-gray-950 z-[9999] flex flex-col items-center justify-center transition-opacity duration-1000 ${isReady ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <img src="https://ibb.co/MDtMJNK9" className="w-24 h-24 mb-6 drop-shadow-2xl object-contain animate-bounce" alt="Logo" />
            <h1 className="text-2xl font-black text-gray-800 dark:text-white tracking-[0.5em] text-center mb-8">棱镜 - StockWise</h1>
            <img src="https://ibb.co/5hgSKM0N" className="w-48 h-auto object-contain" alt="Signature" />
        </div>
    );
};

const InstallButton = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isIOS, setIsIOS] = useState(false);
    const [showIOSModal, setShowIOSModal] = useState(false);

    useEffect(() => {
        const handler = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };
        window.addEventListener('beforeinstallprompt', handler);
        
        const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        const isInstalled = (window.navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches;
        if (isIosDevice && !isInstalled) setIsIOS(true);

        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstall = () => {
        if (isIOS) { setShowIOSModal(true); return; }
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(() => setDeferredPrompt(null));
        }
    };

    if (!deferredPrompt && !isIOS) return null;

    return (
        <>
            <button onClick={handleInstall} className="fixed top-4 right-4 z-[9999] bg-black text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-1 animate-scale-in">
                <span>Install</span>
            </button>
            {showIOSModal && (
                <div className="fixed inset-0 bg-black/80 z-[10000] flex items-center justify-center p-8 text-white text-center" onClick={()=>setShowIOSModal(false)}>
                    <div>
                        <p className="mb-4 text-lg font-bold">安装到 iPhone / iPad</p>
                        <p>1. 点击浏览器底部的分享按钮 <Icons.Package size={16} className="inline"/></p>
                        <p>2. 选择 "添加到主屏幕"</p>
                    </div>
                </div>
            )}
        </>
    );
};

const AppContent: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(!!authService.getCurrentUser());
  const [isReady, setIsReady] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [currentStore, setCurrentStore] = useState('all');
  const [stores, setStores] = useState<Store[]>([]);
  const [theme, setTheme] = useState(localStorage.getItem('sw_theme') || 'light');
  
  // Apply theme class
  useEffect(() => {
      document.documentElement.className = ''; 
      if (theme === 'dark') document.documentElement.classList.add('dark');
      if (theme === 'prism') document.documentElement.classList.add('theme-prism');
      localStorage.setItem('sw_theme', theme);
  }, [theme]);

  // Init Data
  useEffect(() => {
      const init = async () => {
          if (isAuthenticated && isConfigured()) { 
               try {
                   const s = await dataService.getStores();
                   setStores(s);
               } catch (e) { console.error("Store Fetch Failed", e); }
          }
          setTimeout(() => setIsReady(true), 1500); 
      };
      init();
  }, [isAuthenticated]);

  const handleLogin = async (u: string, p: string) => {
      const success = await authService.login(u, p);
      if (success) setIsAuthenticated(true);
      return success;
  };

  if (!isAuthenticated) {
      return (
          <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
              <div className="w-full max-w-md bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl border dark:border-gray-700">
                  <div className="text-center mb-8">
                       <img src="https://ibb.co/MDtMJNK9" className="w-16 h-16 mx-auto mb-4 drop-shadow-xl" />
                       <h1 className="text-2xl font-black tracking-widest dark:text-white">STOCKWISE</h1>
                       <p className="text-gray-400 text-xs tracking-[0.3em] uppercase mt-2">Prism Operation System</p>
                  </div>
                  <LoginForm onLogin={handleLogin} />
              </div>
          </div>
      );
  }

  return (
    <>
    <SplashScreen isReady={isReady} />
    <InstallButton />
    
    <div className="h-screen flex font-sans text-gray-800 dark:text-gray-100 overflow-hidden bg-gray-50 dark:bg-gray-950">
      <Sidebar 
         currentPage={currentPage} 
         onNavigate={setCurrentPage} 
         currentStore={currentStore} 
         stores={stores}
         onStoreChange={setCurrentStore} 
      />
      
      <div id="main-content" className="flex-1 flex flex-col h-full relative transition-all duration-300 overflow-hidden">
        <div className="flex-1 overflow-auto custom-scrollbar p-0 relative pb-safe">
            {currentPage === 'dashboard' && <Dashboard currentStore={currentStore} onNavigate={setCurrentPage} />}
            {currentPage === 'inventory' && <Inventory currentStore={currentStore} />}
            {currentPage === 'import' && <Import currentStore={currentStore} />}
            {currentPage === 'logs' && <Logs />}
            {currentPage === 'audit' && <Audit />}
            {currentPage === 'store_manage' && <StoreManagement />}
            {currentPage === 'announcement' && <AnnouncementCenter />} 
            {/* Note: Sidebar doesn't link 'announcement' directly yet but can be added. For now it's accessible if needed or via StoreManagement logic later. */}
            {currentPage.startsWith('settings') && <Settings subPage={currentPage.split('-')[1]} onThemeChange={setTheme} />}
        </div>
      </div>
    </div>
    </>
  );
};

const LoginForm = ({ onLogin }: any) => {
    const [user, setUser] = useState('');
    const [pass, setPass] = useState('');
    const [loading, setLoading] = useState(false);

    const sub = async (e: any) => {
        e.preventDefault();
        setLoading(true);
        const ok = await onLogin(user, pass);
        setLoading(false);
        if(!ok) alert("登录失败：用户名或密码错误");
    };

    return (
        <form onSubmit={sub} className="space-y-4">
            <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Username</label>
                <input className="w-full p-3 bg-gray-50 dark:bg-gray-900 border-none rounded-xl mt-1 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500" value={user} onChange={e=>setUser(e.target.value)} />
            </div>
            <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Password</label>
                <input type="password" className="w-full p-3 bg-gray-50 dark:bg-gray-900 border-none rounded-xl mt-1 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500" value={pass} onChange={e=>setPass(e.target.value)} />
            </div>
            <button disabled={loading} className="w-full bg-black dark:bg-white text-white dark:text-black font-bold py-4 rounded-xl hover:opacity-90 transition-opacity">
                {loading ? 'Verifying...' : 'LOGIN'}
            </button>
        </form>
    );
}

const App = () => (
    <PermissionProvider>
        <AppContent />
    </PermissionProvider>
);

export default App;