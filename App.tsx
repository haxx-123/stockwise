
import React, { useState, useEffect, Suspense } from 'react';
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

const Splash = ({ isReady }: { isReady: boolean }) => (
    <div className={`fixed inset-0 bg-[#888888] z-[9999] flex flex-col items-center justify-center transition-all duration-800 ease-out ${isReady ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <img src="https://i.ibb.co/vxq7QfYd/retouch-2025121423241826.png" className="w-24 h-24 mb-6 drop-shadow-2xl object-contain animate-bounce" />
        <h1 className="text-3xl font-black text-black tracking-[0.5em] text-center mb-8 uppercase">棱镜<br/><span className="text-xs tracking-[1em] text-gray-700 font-medium">StockWise</span></h1>
    </div>
);

// Top Right Actions Bar
const TopActions = ({ onOpenAnnouncement }: any) => {
    // Screenshot
    const handleScreenshot = () => {
        const el = document.getElementById('main-content-scroll');
        if (el && (window as any).html2canvas) {
            const originalHeight = el.style.height;
            const originalOverflow = el.style.overflow;
            el.style.height = el.scrollHeight + 'px';
            el.style.overflow = 'visible';
            (window as any).html2canvas(el, { ignoreElements: (e:any) => e.classList.contains('no-print') || e.tagName === 'NAV' }).then((canvas:any) => {
                const link = document.createElement('a');
                link.download = `prism_capture_${Date.now()}.png`;
                link.href = canvas.toDataURL();
                link.click();
                el.style.height = originalHeight;
                el.style.overflow = originalOverflow;
            });
        }
    };

    // Excel Export Trigger (Listens in pages)
    const handleExcel = () => {
        window.dispatchEvent(new CustomEvent('trigger-excel-export'));
    };

    // Copy Trigger
    const handleCopy = () => {
        window.dispatchEvent(new CustomEvent('trigger-copy'));
    };

    return (
        <div className="fixed top-4 right-4 z-[90] flex gap-2 no-print">
            <button onClick={handleScreenshot} className="p-2 bg-white/80 backdrop-blur shadow-lg rounded-full hover:scale-110 transition-transform"><Icons.Camera size={18}/></button>
            <button onClick={handleExcel} className="p-2 bg-white/80 backdrop-blur shadow-lg rounded-full hover:scale-110 transition-transform"><Icons.FileSpreadsheet size={18}/></button>
            <button onClick={handleCopy} className="p-2 bg-white/80 backdrop-blur shadow-lg rounded-full hover:scale-110 transition-transform"><Icons.Copy size={18}/></button>
            <button onClick={onOpenAnnouncement} className="p-2 bg-white/80 backdrop-blur shadow-lg rounded-full hover:scale-110 transition-transform relative">
                <Icons.Megaphone size={18}/>
                <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full" id="ann-dot"></div>
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
            alert("请点击浏览器底部的分享按钮，选择“添加到主屏幕”"); // Modal preferred but alert for constraint
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false); // Modal state
  
  // Theme
  useEffect(() => {
      const savedTheme = localStorage.getItem('sw_theme') || 'prism';
      document.documentElement.className = savedTheme === 'dark' ? 'dark' : '';
  }, []);

  // Boot & Refresh
  useEffect(() => {
      if (!isAuthenticated) return;
      const boot = async () => {
          if (isConfigured()) { 
               try {
                   const [sList] = await Promise.all([dataService.getStores()]);
                   setStores(sList);
               } catch (e) { console.error(e); }
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
                      // Trigger announcement modal instead of alert
                      setAnnouncementOpen(true);
                      sessionStorage.setItem(todayKey, 'true');
                  }
              });
          }
      }
  }, [isReady, isAuthenticated]);

  const handleLogin = async (u: string, p: string) => {
      const success = await authService.login(u, p);
      if (success) { setIsAuthenticated(true); window.location.reload(); } // Force refresh
      return success;
  };

  const handleFaceLogin = async (u: string) => {
      const success = await authService.loginWithFace(u);
      if (success) { setIsAuthenticated(true); window.location.reload(); }
      return success;
  };

  if (!isAuthenticated) {
      return <LoginPage onLogin={handleLogin} onFaceLogin={handleFaceLogin} />;
  }

  return (
    <>
    <Splash isReady={isReady} />
    <TopActions onOpenAnnouncement={()=>setAnnouncementOpen(true)} />
    
    <div className="h-screen flex font-sans text-black overflow-hidden bg-[#888888]">
      
      {/* Mobile Menu Button */}
      <div className="fixed top-4 left-4 z-[60] md:hidden">
          <button onClick={()=>setMobileMenuOpen(!mobileMenuOpen)} className="p-2 bg-white/80 backdrop-blur shadow-lg rounded-full">
              <Icons.Menu size={20}/>
          </button>
      </div>

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 md:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:flex`}>
          <Sidebar 
             currentPage={currentPage} 
             onNavigate={(p) => { setCurrentPage(p); setMobileMenuOpen(false); }} 
             currentStore={currentStore} 
             stores={stores}
             onStoreChange={setCurrentStore}
             isMobileDrawer={true} 
          />
      </div>
      {mobileMenuOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={()=>setMobileMenuOpen(false)}></div>}
      
      <div id="main-content-scroll" className="flex-1 flex flex-col h-full relative transition-all duration-300 overflow-hidden pt-16 md:pt-0">
        <div className="flex-1 overflow-auto custom-scrollbar p-0 relative pb-safe">
            <Suspense fallback={<div className="p-10 text-center text-white">Loading...</div>}>
                {currentPage === 'dashboard' && <Dashboard currentStore={currentStore} onNavigate={setCurrentPage} />}
                {currentPage === 'inventory' && <Inventory currentStore={currentStore} />}
                {currentPage === 'import' && <Import currentStore={currentStore} />}
                {currentPage === 'logs' && <Logs />}
                {currentPage === 'audit' && <Audit />}
                {currentPage === 'store_manage' && <StoreManagement />}
                {currentPage.startsWith('settings') && <Settings subPage={currentPage.split('-')[1]} />}
            </Suspense>
        </div>
      </div>

      {/* Announcement Modal (Overlay) */}
      {announcementOpen && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white dark:bg-gray-800 w-full max-w-4xl h-[80vh] rounded-3xl overflow-hidden shadow-2xl relative">
                  <button onClick={()=>setAnnouncementOpen(false)} className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full z-10"><Icons.Minus size={20}/></button>
                  <div className="h-full overflow-y-auto custom-scrollbar">
                      <Suspense fallback={<div>Loading...</div>}>
                          <AnnouncementCenter />
                      </Suspense>
                  </div>
              </div>
          </div>
      )}
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
    
    // Real Face Logic (Simplified integration)
    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoEl) videoEl.srcObject = stream;
            setScanStatus('初始化模型...');
            await faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/');
            setScanStatus('请正对摄像头...');
            
            const interval = setInterval(async () => {
                if(videoEl && !videoEl.paused) {
                    const det = await faceapi.detectSingleFace(videoEl, new faceapi.TinyFaceDetectorOptions());
                    if(det && det.score > 0.8) {
                        setScanStatus('识别成功');
                        clearInterval(interval);
                        stream.getTracks().forEach(t=>t.stop());
                        onFaceLogin(user || '管理员'); // Mock match logic for demo, real logic matches descriptor
                    }
                }
            }, 500);
        } catch(e) { setScanStatus('摄像头错误'); }
    };

    return (
        <div className="h-screen flex items-center justify-center bg-[#888888] p-4">
            <div className="w-full max-w-md glass-panel p-8 rounded-3xl shadow-xl">
                <div className="text-center mb-8">
                     <img src="https://i.ibb.co/vxq7QfYd/retouch-2025121423241826.png" className="w-20 h-20 mx-auto mb-4 drop-shadow-xl object-contain" />
                     <h1 className="text-2xl font-black tracking-widest text-black">STOCKWISE</h1>
                </div>
                
                <div className="flex gap-4 mb-6">
                    <button onClick={()=>setMode('PASS')} className={`flex-1 py-2 font-bold rounded-xl ${mode==='PASS'?'bg-black text-white':'bg-white/20 text-black'}`}>密码登录</button>
                    <button onClick={()=>{setMode('FACE'); startCamera();}} className={`flex-1 py-2 font-bold rounded-xl ${mode==='FACE'?'bg-black text-white':'bg-white/20 text-black'}`}>人脸识别</button>
                </div>

                {mode === 'PASS' ? (
                    <div className="space-y-4">
                        <input className="w-full p-4 bg-white/30 rounded-2xl font-bold border-none placeholder-gray-600 text-black" placeholder="Username" value={user} onChange={e=>setUser(e.target.value)} />
                        <input type="password" className="w-full p-4 bg-white/30 rounded-2xl font-bold border-none placeholder-gray-600 text-black" placeholder="Password" value={pass} onChange={e=>setPass(e.target.value)} />
                        <button onClick={()=>onLogin(user, pass)} className="w-full bg-black text-white font-bold py-4 rounded-2xl shadow-lg hover:scale-105 transition-transform">LOGIN</button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-4">
                        <div className="relative w-64 h-64 bg-black rounded-full overflow-hidden border-4 border-white/30">
                            <video ref={setVideoEl} autoPlay muted playsInline className="w-full h-full object-cover"></video>
                            <div className="absolute inset-0 border-4 border-transparent border-t-green-500 rounded-full animate-spin"></div>
                        </div>
                        <p className="font-bold text-lg text-black">{scanStatus}</p>
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
