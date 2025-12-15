import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Inventory } from './pages/Inventory';
import { Import } from './pages/Import';
import { Logs } from './pages/Logs';
import { Audit } from './pages/Audit';
import { Settings } from './pages/Settings';
import { Icons } from './components/Icons';
import { dataService } from './services/dataService';
import { Store, Announcement, User } from './types';
import { isConfigured } from './services/supabaseClient';
import { generatePageSummary, formatUnit } from './utils/formatters';
import { authService } from './services/authService';
import { RichTextEditor } from './components/RichTextEditor';
import { UsernameBadge } from './components/UsernameBadge';
import { PermissionProvider, useUserPermissions } from './contexts/PermissionContext';
import { SVIPBadge } from './components/SVIPBadge';
import { GlobalAnnouncement } from './components/GlobalAnnouncement';
import { AnnouncementManager } from './components/AnnouncementManager';

declare const window: any;
declare const html2canvas: any;

// --- COMPONENT: Launch Screen ---
const LaunchScreen = ({ isReady }: { isReady: boolean }) => {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        if (isReady) {
            // Wait a moment to ensure smooth transition
            const timer = setTimeout(() => setVisible(false), 500); 
            return () => clearTimeout(timer);
        }
    }, [isReady]);

    if (!visible) return null;

    return (
        <div className={`fixed inset-0 z-[100] bg-[#F2F3F7] dark:bg-gray-900 flex flex-col items-center justify-center transition-opacity duration-700 ${isReady ? 'opacity-0' : 'opacity-100'}`}>
            <div className="flex flex-col items-center animate-scale-in space-y-6">
                <div className="w-24 h-24 bg-white rounded-3xl shadow-xl flex items-center justify-center p-4">
                    <img 
                        src="https://i.ibb.co/vxq7QfYd/retouch-2025121423241826.png" 
                        alt="Logo" 
                        className="w-full h-full object-contain"
                    />
                </div>
                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white tracking-tight">棱镜</h1>
                    <p className="text-sm text-gray-500 uppercase tracking-widest">StockWise-智能库管系统</p>
                </div>
            </div>
            
            {/* Signature at bottom */}
            <div className="absolute bottom-12 opacity-80">
                <img 
                    src="https://i.ibb.co/8gLfYKCW/retouch-2025121313394035.png" 
                    alt="Signature" 
                    className="h-12 object-contain filter grayscale opacity-50"
                />
            </div>
        </div>
    );
};

// --- COMPONENT: Smart Install Prompt ---
const InstallPrompt = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [showButton, setShowButton] = useState(false);
    const [showIOSGuide, setShowIOSGuide] = useState(false);

    useEffect(() => {
        // Android / Chrome
        const handler = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setShowButton(true);
        };
        window.addEventListener('beforeinstallprompt', handler);

        // iOS Detection
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        const isStandalone = (window.navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches;
        
        if (isIOS && !isStandalone) {
             setShowButton(true); // We reuse the button trigger logic but handle click differently
        }

        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleClick = () => {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        
        if (isIOS) {
            setShowIOSGuide(true);
        } else if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((choiceResult: any) => {
                if (choiceResult.outcome === 'accepted') {
                    setShowButton(false);
                }
                setDeferredPrompt(null);
            });
        }
    };

    if (!showButton) return null;

    return (
        <>
            {/* Floating Button - Top Right Fixed */}
            <button 
                onClick={handleClick}
                className="fixed top-20 right-4 z-50 bg-blue-600 text-white p-3 rounded-full shadow-lg hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center animate-fade-in"
                title="安装应用"
            >
                <Icons.Store size={20} className="text-white" />
                <span className="sr-only">安装</span>
            </button>

            {/* iOS Guide Modal */}
            {showIOSGuide && (
                <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-fade-in" onClick={() => setShowIOSGuide(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative" onClick={e => e.stopPropagation()}>
                         <div className="flex justify-between items-center mb-4">
                             <h3 className="font-bold text-lg dark:text-white">安装到 iPhone/iPad</h3>
                             <button onClick={() => setShowIOSGuide(false)} className="p-1 bg-gray-100 rounded-full"><Icons.Minus size={16}/></button>
                         </div>
                         <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
                             <p>由于 iOS 系统限制，请手动添加：</p>
                             <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700 p-3 rounded-xl">
                                 <div className="w-8 h-8 flex items-center justify-center bg-blue-100 text-blue-600 rounded-lg font-bold">1</div>
                                 <span>点击浏览器底部的 <span className="font-bold">分享按钮</span> <span className="inline-block align-middle"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></span></span>
                             </div>
                             <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700 p-3 rounded-xl">
                                 <div className="w-8 h-8 flex items-center justify-center bg-blue-100 text-blue-600 rounded-lg font-bold">2</div>
                                 <span>向下滑动，选择 <span className="font-bold">“添加到主屏幕”</span></span>
                             </div>
                         </div>
                         <div className="mt-6 text-center">
                             <button onClick={() => setShowIOSGuide(false)} className="text-blue-600 font-bold text-sm">我知道了</button>
                         </div>
                         {/* Pointer arrow for bottom share button usually found in Safari */}
                         <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 translate-y-full w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[10px] border-t-white dark:border-t-gray-800 md:hidden"></div>
                    </div>
                </div>
            )}
        </>
    );
};

// FACE ID COMPONENT
const FaceLogin = ({ onSuccess }: any) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [status, setStatus] = useState('初始化相机...');
    const [scanning, setScanning] = useState(false);

    const stopStream = () => {
        if(videoRef.current && videoRef.current.srcObject) {
            (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
            videoRef.current.srcObject = null;
        }
    };

    useEffect(() => {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
            .then(stream => {
                if(videoRef.current) videoRef.current.srcObject = stream;
                setStatus("请保持脸部在框内");
                setScanning(true);
            })
            .catch(err => setStatus("无法访问相机: " + err.message));
        
        return () => stopStream();
    }, []);

    const attemptLogin = async () => {
        if (!videoRef.current) return;
        setStatus("正在验证...");
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
        const users = await dataService.getUsers();
        const userWithFace = users.find(u => !!u.face_descriptor);
        
        if (userWithFace) {
             stopStream();
             authService.switchAccount(userWithFace); 
             onSuccess();
        } else {
             setStatus("验证失败: 未找到匹配用户或未设置人脸");
             setScanning(false);
             stopStream();
        }
    };

    return (
        <div className="flex flex-col items-center gap-4">
             <div className="w-48 h-48 bg-gray-200 rounded-full overflow-hidden border-4 border-blue-500 relative shadow-xl">
                 <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover"></video>
                 {scanning && <div className="absolute inset-0 border-2 border-white opacity-50 rounded-full animate-pulse"></div>}
             </div>
             <p className="text-sm text-gray-500">{status}</p>
             <div className="flex gap-2 w-full">
                <button onClick={()=>{stopStream(); window.location.reload();}} className="flex-1 bg-gray-200 text-gray-600 py-2 rounded-xl font-bold">取消</button>
                <button onClick={attemptLogin} className="flex-1 bg-blue-600 text-white py-2 rounded-xl font-bold shadow-lg shadow-blue-200">开始识别</button>
             </div>
        </div>
    );
};

const LoginScreen = ({ onLogin }: any) => {
    const [user, setUser] = useState('');
    const [pass, setPass] = useState('');
    const [error, setError] = useState('');
    const [mode, setMode] = useState<'PASSWORD' | 'FACE'>('PASSWORD');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (await authService.login(user, pass)) {
            window.location.reload(); // Reload to trigger App mount & ready state again if needed
        } else {
            setError("用户名或密码错误");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-prism dark:bg-gray-900 p-4">
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl w-full max-w-sm text-center border border-white/50 dark:border-gray-700">
                <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-lg mx-auto mb-6 p-2">
                    <img src="https://i.ibb.co/vxq7QfYd/retouch-2025121423241826.png" className="w-full h-full object-contain" alt="Logo"/>
                </div>
                <h1 className="text-2xl font-bold mb-2 dark:text-white">棱镜</h1>
                <p className="text-sm text-gray-500 mb-8 uppercase tracking-widest">StockWise System</p>
                
                <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-xl mb-6">
                    <button onClick={()=>setMode('PASSWORD')} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${mode==='PASSWORD' ? 'bg-white dark:bg-gray-600 text-blue-600 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>密码登录</button>
                    <button onClick={()=>setMode('FACE')} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${mode==='FACE' ? 'bg-white dark:bg-gray-600 text-blue-600 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>人脸识别</button>
                </div>

                {mode === 'PASSWORD' ? (
                    <form onSubmit={handleSubmit} className="space-y-4 text-left animate-fade-in">
                        {error && <div className="text-red-500 text-sm text-center font-bold bg-red-50 py-1 rounded">{error}</div>}
                        <input className="w-full border-none bg-gray-50 dark:bg-gray-900 p-4 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 transition-all outline-none" placeholder="用户名" value={user} onChange={e=>setUser(e.target.value)} />
                        <input type="password" className="w-full border-none bg-gray-50 dark:bg-gray-900 p-4 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 transition-all outline-none" placeholder="密码" value={pass} onChange={e=>setPass(e.target.value)} />
                        <button className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 dark:shadow-none transition-transform active:scale-95">登录</button>
                    </form>
                ) : (
                    <div className="animate-fade-in">
                        <FaceLogin onSuccess={() => window.location.reload()} />
                    </div>
                )}
            </div>
        </div>
    );
};

const AppContent: React.FC<{ setIsReady: (ready: boolean) => void }> = ({ setIsReady }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(!!authService.getCurrentUser());
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [currentStore, setCurrentStore] = useState('all');
  const [theme, setTheme] = useState(localStorage.getItem('sw_theme') || 'light');
  
  // Mobile Tools Menu
  const [toolsOpen, setToolsOpen] = useState(false);
  const [showAnnManager, setShowAnnManager] = useState(false);

  const user = authService.getCurrentUser();
  const perms = useUserPermissions(user?.role_level);

  // APP INITIALIZATION LOGIC (The "Parallel Execution" part)
  useEffect(() => {
      const initApp = async () => {
          if (isAuthenticated && isConfigured()) {
               try {
                   await new Promise(r => setTimeout(r, 800)); // Simulating "Check Core Data"
               } catch(e) {}
          }
          // If not authenticated, we are "ready" to show login screen immediately.
          setIsReady(true);
      };

      initApp();
  }, [isAuthenticated]);

  // LAYOUT LOCKING
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);
  
  useEffect(() => {
      if (isAuthenticated && perms.only_view_config) {
          if (currentPage !== 'settings-config') setCurrentPage('settings-config');
      }
  }, [isAuthenticated, currentPage, perms.only_view_config]);

  useEffect(() => {
    localStorage.setItem('sw_theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
  
  if (!isAuthenticated) return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;

  const renderPage = () => {
    if (currentPage.startsWith('settings')) return <Settings subPage={currentPage.split('-')[1]} onThemeChange={setTheme} />;
    switch (currentPage) {
      case 'dashboard': return <Dashboard currentStore={currentStore} onNavigate={setCurrentPage} />;
      case 'inventory': return <Inventory currentStore={currentStore} />;
      case 'import': return <Import currentStore={currentStore} />;
      case 'logs': return <Logs />;
      case 'audit': return (!perms.hide_audit_hall) ? <Audit /> : <div className="p-8 text-center text-gray-500">审计大厅已隐藏</div>;
      default: return <Dashboard currentStore={currentStore} onNavigate={setCurrentPage} />;
    }
  };

  // TOOL ACTIONS
  const handleGlobalScreenshot = async () => {
      setToolsOpen(false);
      const element = document.getElementById('main-content-area');
      if (!element || !html2canvas) return alert("截图组件未加载");

      try {
          const canvas = await html2canvas(element, {
              useCORS: true,
              scale: 2, // High resolution
              backgroundColor: theme === 'dark' ? '#030712' : '#F2F3F7'
          });
          const link = document.createElement('a');
          link.download = `StockWise_Snap_${Date.now()}.png`;
          link.href = canvas.toDataURL();
          link.click();
      } catch(e: any) {
          alert("截图失败: " + e.message);
      }
  };

  const triggerTool = (action: 'COPY' | 'EXCEL') => {
      setToolsOpen(false);
      // Dispatch Global Event for pages to listen
      window.dispatchEvent(new CustomEvent('SW_TOOL_ACTION', { detail: { action } }));
  };

  return (
    <div className="h-screen bg-prism dark:bg-gray-950 flex font-sans text-gray-800 dark:text-gray-100 overflow-hidden">
      <GlobalAnnouncement />
      {showAnnManager && <AnnouncementManager onClose={() => setShowAnnManager(false)} />}
      
      {!perms.only_view_config && <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} currentStore={currentStore} setCurrentStore={setCurrentStore} hasUnread={false} />}
      
      {/* Content Wrapper */}
      <div className="flex-1 flex flex-col h-full relative md:ml-64 transition-all duration-300">
        
        {/* Top Header - Glass Effect */}
        <header className="sticky top-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between z-30 shrink-0 h-16 md:h-20">
            <h2 className="text-xl font-bold capitalize text-gray-800 dark:text-white truncate pl-10 md:pl-0 animate-fade-in">
                {currentPage.split('-')[0] === 'dashboard' ? '仪表盘' : 
                 currentPage.split('-')[0] === 'inventory' ? '库存管理' : 
                 currentPage.split('-')[0] === 'import' ? '商品导入' : 
                 currentPage.split('-')[0] === 'logs' ? '操作日志' : 
                 currentPage.split('-')[0] === 'settings' ? '系统设置' : currentPage}
            </h2>
            
            <div className="flex items-center space-x-3">
                <div className="relative">
                    <button onClick={() => setToolsOpen(!toolsOpen)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 relative transition-colors">
                        <Icons.Menu size={24}/>
                    </button>
                    {toolsOpen && (
                        <div className="absolute right-0 top-12 bg-white dark:bg-gray-800 border dark:border-gray-700 shadow-glass rounded-2xl w-48 flex flex-col z-50 overflow-hidden animate-scale-in origin-top-right p-1">
                             <button onClick={()=>{ setShowAnnManager(true); setToolsOpen(false); }} className="p-3 text-left rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 flex justify-between items-center text-sm font-medium transition-colors">
                                📢 公告中心
                            </button>
                            <button onClick={handleGlobalScreenshot} className="p-3 text-left rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors">
                                📷 页面长截图
                            </button>
                            <button onClick={() => triggerTool('COPY')} className="p-3 text-left rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors">
                                📄 复制本页文字
                            </button>
                            <button onClick={() => triggerTool('EXCEL')} className="p-3 text-left rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors">
                                📊 导出本页 Excel
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>

        {/* Main Content */}
        <div id="main-content-area" className="flex-1 overflow-auto custom-scrollbar p-0 relative bg-prism dark:bg-gray-950 pb-24 md:pb-0">
            {renderPage()}
        </div>
      </div>
      
      {/* GLOBAL INSTALL PROMPT BUTTON */}
      <InstallPrompt />
    </div>
  );
};

const App = () => {
    const [isReady, setIsReady] = useState(false);
    
    return (
        <PermissionProvider>
            <LaunchScreen isReady={isReady} />
            <AppContent setIsReady={setIsReady} />
        </PermissionProvider>
    );
};

export default App;