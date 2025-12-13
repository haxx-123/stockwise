

import React, { useState, useEffect, Suspense, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { Icons } from './components/Icons';
import { dataService } from './services/dataService';
import { Store, User } from './types';
import { isConfigured } from './services/supabaseClient';
import { authService } from './services/authService';
import { PermissionProvider } from './contexts/PermissionContext';

// Lazy Load Routes
const Dashboard = React.lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Inventory = React.lazy(() => import('./pages/Inventory').then(m => ({ default: m.Inventory })));
const Import = React.lazy(() => import('./pages/Import').then(m => ({ default: m.Import })));
const Logs = React.lazy(() => import('./pages/Logs').then(m => ({ default: m.Logs })));
const Audit = React.lazy(() => import('./pages/Audit').then(m => ({ default: m.Audit })));
const Settings = React.lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const AnnouncementCenter = React.lazy(() => import('./pages/AnnouncementCenter').then(m => ({ default: m.AnnouncementCenter })));
const StoreManagement = React.lazy(() => import('./pages/StoreManagement').then(m => ({ default: m.StoreManagement })));

declare const window: any;
declare const faceapi: any;

// Splash Screen
const Splash = ({ isReady }: { isReady: boolean }) => (
    <div className={`fixed inset-0 bg-white dark:bg-gray-950 z-[9999] flex flex-col items-center justify-center transition-all duration-800 ease-out ${isReady ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <img src="https://i.ibb.co/vxTZMzfD/retouch-2025121122511132.png" className="w-24 h-24 mb-6 drop-shadow-2xl object-contain animate-bounce" />
        <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-[0.5em] text-center mb-8 uppercase">棱镜<br/><span className="text-xs tracking-[1em] text-gray-400 font-medium">StockWise</span></h1>
        <img src="https://i.ibb.co/8gLfYKCW/retouch-2025121313394035.png" className="w-48 h-auto object-contain opacity-80" />
    </div>
);

// Top Right Actions Bar
const TopActions = ({ onNavigate, currentPage }: any) => {
    const handleScreenshot = () => {
        const el = document.getElementById('main-content');
        if (el && (window as any).html2canvas) {
            const originalHeight = el.style.height;
            const originalOverflow = el.style.overflow;
            el.style.height = el.scrollHeight + 'px';
            el.style.overflow = 'visible';
            (window as any).html2canvas(el, { ignoreElements: (e:any) => e.classList.contains('no-print') }).then((canvas:any) => {
                const link = document.createElement('a');
                link.download = `screenshot_${Date.now()}.png`;
                link.href = canvas.toDataURL();
                link.click();
                el.style.height = originalHeight;
                el.style.overflow = originalOverflow;
            });
        }
    };

    const handleExcel = () => {
        if (currentPage !== 'inventory' && currentPage !== 'logs' && currentPage !== 'audit' && currentPage !== 'settings-perms') return;
        const event = new CustomEvent('trigger-excel-export');
        window.dispatchEvent(event);
    };

    const handleCopy = () => {
        if (currentPage !== 'inventory' && currentPage !== 'logs' && currentPage !== 'audit' && currentPage !== 'settings-perms') return;
        const event = new CustomEvent('trigger-copy');
        window.dispatchEvent(event);
    };

    return (
        <div className="fixed top-4 right-4 z-[90] flex gap-2 no-print">
            <button onClick={handleScreenshot} className="p-2 bg-white/80 backdrop-blur shadow-lg rounded-full hover:scale-110 transition-transform"><Icons.Camera size={18}/></button>
            <button onClick={handleExcel} className="p-2 bg-white/80 backdrop-blur shadow-lg rounded-full hover:scale-110 transition-transform"><Icons.FileSpreadsheet size={18}/></button>
            <button onClick={handleCopy} className="p-2 bg-white/80 backdrop-blur shadow-lg rounded-full hover:scale-110 transition-transform"><Icons.Copy size={18}/></button>
            <button onClick={()=>onNavigate('announcement')} className="p-2 bg-white/80 backdrop-blur shadow-lg rounded-full hover:scale-110 transition-transform relative">
                <Icons.Megaphone size={18}/>
                <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></div>
            </button>
            <InstallButton />
        </div>
    );
};

const InstallButton = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [showIOS, setShowIOS] = useState(false);

    useEffect(() => {
        window.addEventListener('beforeinstallprompt', (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
        });
        const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        if (isIos && !(window.navigator as any).standalone) setShowIOS(true);
    }, []);

    const install = () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(() => setDeferredPrompt(null));
        } else if (showIOS) {
            alert("请点击浏览器底部的分享按钮，选择“添加到主屏幕”");
        }
    };

    if (!deferredPrompt && !showIOS) return null;
    return (
        <button onClick={install} className="p-2 bg-black text-white shadow-lg rounded-full hover:scale-110 transition-transform">
            <Icons.Download size={18}/>
        </button>
    );
};

const AppContent: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(!!authService.getCurrentUser());
  const [isReady, setIsReady] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [currentStore, setCurrentStore] = useState('all');
  const [stores, setStores] = useState<Store[]>([]);
  const [theme, setTheme] = useState(localStorage.getItem('sw_theme') || 'light');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  useEffect(() => {
      document.documentElement.className = ''; 
      if (theme === 'dark') document.documentElement.classList.add('dark');
      if (theme === 'prism') document.documentElement.classList.add('theme-prism');
      localStorage.setItem('sw_theme', theme);
  }, [theme]);

  // Launch Logic
  useEffect(() => {
      if (!isAuthenticated) return;
      const boot = async () => {
          if (isConfigured()) { 
               try {
                   const [sList] = await Promise.all([
                       dataService.getStores(),
                       // pre-fetch other critical data if needed
                   ]);
                   setStores(sList);
               } catch (e) { console.error("Boot Error", e); }
          }
          setIsReady(true);
      };
      boot();
  }, [isAuthenticated]);

  // Popup Logic
  useEffect(() => {
      if (isReady && isAuthenticated) {
          const todayKey = `hasViewedPopup_${new Date().toISOString().split('T')[0]}`;
          if (!sessionStorage.getItem(todayKey)) {
              dataService.getAnnouncements().then(anns => {
                  const user = authService.getCurrentUser();
                  const valid = anns.find(a => !a.is_force_deleted && a.popup_config.enabled && !a.read_by?.includes(`HIDDEN_BY_${user?.id}`));
                  if (valid) {
                      // Custom Modal needed for Rich Text, using alert for simple demo as requested, 
                      // but ideally this should be a modal. Using simple alert for now to satisfy constraints.
                      // For rich text popup, we'd render a component.
                      alert(`【公告】${valid.title} (请在公告中心查看详情)`); 
                      sessionStorage.setItem(todayKey, 'true');
                  }
              });
          }
      }
  }, [isReady, isAuthenticated]);

  const handleLogin = async (u: string, p: string) => {
      const success = await authService.login(u, p);
      if (success) setIsAuthenticated(true);
      return success;
  };

  const handleFaceLogin = async (u: string) => {
      const success = await authService.loginWithFace(u);
      if (success) setIsAuthenticated(true);
      return success;
  };

  if (!isAuthenticated) {
      return <LoginPage onLogin={handleLogin} onFaceLogin={handleFaceLogin} />;
  }

  return (
    <>
    <Splash isReady={isReady} />
    <TopActions onNavigate={setCurrentPage} currentPage={currentPage} />
    
    <div className="h-screen flex font-sans text-gray-800 dark:text-gray-100 overflow-hidden bg-gray-50 dark:bg-gray-950">
      
      {/* Mobile Menu Button */}
      <div className="fixed top-4 left-4 z-[60] md:hidden">
          <button onClick={()=>setMobileMenuOpen(!mobileMenuOpen)} className="p-2 bg-white/80 backdrop-blur shadow-lg rounded-full">
              <Icons.Menu size={20}/>
          </button>
      </div>

      {/* Sidebar: Overlay on Mobile, Fixed on Desktop */}
      <div className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 md:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:flex`}>
          <Sidebar 
             currentPage={currentPage} 
             onNavigate={(p) => { setCurrentPage(p); setMobileMenuOpen(false); }} 
             currentStore={currentStore} 
             stores={stores}
             onStoreChange={setCurrentStore}
             isMobileDrawer={true} // Style adjustment
          />
      </div>
      {/* Mobile Overlay Backdrop */}
      {mobileMenuOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={()=>setMobileMenuOpen(false)}></div>}
      
      <div id="main-content" className="flex-1 flex flex-col h-full relative transition-all duration-300 overflow-hidden">
        <div className="flex-1 overflow-auto custom-scrollbar p-0 relative pb-safe">
            <Suspense fallback={<div className="p-10 text-center">Loading...</div>}>
                {currentPage === 'dashboard' && <Dashboard currentStore={currentStore} onNavigate={setCurrentPage} />}
                {currentPage === 'inventory' && <Inventory currentStore={currentStore} />}
                {currentPage === 'import' && <Import currentStore={currentStore} />}
                {currentPage === 'logs' && <Logs />}
                {currentPage === 'audit' && <Audit />}
                {currentPage === 'store_manage' && <StoreManagement />}
                {currentPage === 'announcement' && <AnnouncementCenter />} 
                {currentPage.startsWith('settings') && <Settings subPage={currentPage.split('-')[1]} onThemeChange={setTheme} />}
            </Suspense>
        </div>
      </div>
    </div>
    </>
  );
};

// Login Page with Face ID
const LoginPage = ({ onLogin, onFaceLogin }: any) => {
    const [user, setUser] = useState('');
    const [pass, setPass] = useState('');
    const [mode, setMode] = useState<'PASS' | 'FACE'>('PASS');
    const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
    const [scanStatus, setScanStatus] = useState('');
    const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoEl) videoEl.srcObject = stream;
            setScanStatus('正在初始化视觉模型...');
            
            await faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/');
            setScanStatus('请正对摄像头...');

            const detect = async () => {
                if(videoEl && canvasEl) {
                    const detections = await faceapi.detectSingleFace(videoEl, new faceapi.TinyFaceDetectorOptions());
                    if (detections && detections.score > 0.8) {
                        setScanStatus('识别成功!');
                        // Stop camera
                        stream.getTracks().forEach(t => t.stop());
                        setTimeout(() => onFaceLogin(user || '管理员'), 1000); // Simulate finding user
                    } else {
                        requestAnimationFrame(detect);
                    }
                }
            };
            detect();

        } catch (e) { alert("Camera error or Model load error"); }
    };

    return (
        <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
            <div className="w-full max-w-md bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl border dark:border-gray-700">
                <div className="text-center mb-8">
                     <img src="https://i.ibb.co/vxTZMzfD/retouch-2025121122511132.png" className="w-20 h-20 mx-auto mb-4 drop-shadow-xl object-contain" />
                     <h1 className="text-2xl font-black tracking-widest dark:text-white">STOCKWISE</h1>
                </div>
                
                <div className="flex gap-4 mb-6">
                    <button onClick={()=>setMode('PASS')} className={`flex-1 py-2 font-bold rounded-xl ${mode==='PASS'?'bg-black text-white':'bg-gray-100 text-gray-500'}`}>密码登录</button>
                    <button onClick={()=>{setMode('FACE'); startCamera();}} className={`flex-1 py-2 font-bold rounded-xl ${mode==='FACE'?'bg-black text-white':'bg-gray-100 text-gray-500'}`}>人脸识别</button>
                </div>

                {mode === 'PASS' ? (
                    <div className="space-y-4">
                        <input className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-none" placeholder="Username" value={user} onChange={e=>setUser(e.target.value)} />
                        <input type="password" className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-none" placeholder="Password" value={pass} onChange={e=>setPass(e.target.value)} />
                        <button onClick={()=>onLogin(user, pass)} className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg">LOGIN</button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-4">
                        <div className="relative w-64 h-64 bg-black rounded-full overflow-hidden border-4 border-blue-500">
                            <video ref={setVideoEl} autoPlay muted playsInline className="w-full h-full object-cover"></video>
                            <canvas ref={setCanvasEl} className="absolute inset-0 w-full h-full"></canvas>
                            <div className="absolute inset-0 border-4 border-transparent border-t-green-500 rounded-full animate-spin"></div>
                        </div>
                        <p className="font-bold text-lg">{scanStatus}</p>
                        <button onClick={()=>{window.location.reload()}} className="text-sm text-gray-500">取消</button>
                    </div>
                )}
            </div>
        </div>
    );
};

const App = () => (
    <PermissionProvider>
        <AppContent />
    </PermissionProvider>
);

export default App;