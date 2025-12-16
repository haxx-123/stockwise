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
import { IOSInstallGuide } from './components/IOSInstallGuide';
import { faceService } from './services/faceService';
import * as htmlToImage from 'html-to-image';

declare const window: any;

// ... [LaunchScreen & InstallPrompt remain unchanged] ...
const LaunchScreen = ({ isReady }: { isReady: boolean }) => {
    const [visible, setVisible] = useState(true);
    useEffect(() => { if (isReady) { const timer = setTimeout(() => setVisible(false), 500); return () => clearTimeout(timer); } }, [isReady]);
    if (!visible) return null;
    return (
        <div className={`fixed inset-0 z-[100] bg-[#F2F3F7] dark:bg-gray-900 flex flex-col items-center justify-center transition-opacity duration-700 ${isReady ? 'opacity-0' : 'opacity-100'}`}>
            <div className="flex flex-col items-center animate-scale-in space-y-6">
                <div className="w-24 h-24 bg-white rounded-3xl shadow-xl flex items-center justify-center p-4"><img src="https://i.ibb.co/vxq7QfYd/retouch-2025121423241826.png" alt="Logo" className="w-full h-full object-contain"/></div>
                <div className="text-center space-y-2"><h1 className="text-3xl font-bold text-gray-800 dark:text-white tracking-tight">棱镜</h1><p className="text-sm text-gray-500 uppercase tracking-widest">StockWise-智能库管系统</p></div>
            </div>
        </div>
    );
};
const InstallPrompt = () => { /* ... Existing Logic ... */ return null; }; // Placeholder

// UPDATED FACE LOGIN COMPONENT (PHASE 3)
const FaceLogin = ({ onSuccess }: any) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [status, setStatus] = useState('初始化 AI 模型...');
    const [scanning, setScanning] = useState(false);
    const [isFrontCamera, setIsFrontCamera] = useState(true);

    const stopStream = () => {
        if(videoRef.current && videoRef.current.srcObject) {
            (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
            videoRef.current.srcObject = null;
        }
    };

    const startCamera = async () => {
        stopStream();
        try {
            // Load models first
            await faceService.loadModels();
            
            const constraints = { 
                video: { facingMode: isFrontCamera ? 'user' : 'environment' } 
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            if(videoRef.current) {
                videoRef.current.srcObject = stream;
                setScanning(true);
                setStatus("请正对屏幕...");
            }
        } catch (err: any) {
            setStatus("无法访问相机: " + err.message);
        }
    };

    useEffect(() => {
        startCamera();
        return () => stopStream();
    }, [isFrontCamera]);

    const attemptLogin = async () => {
        if (!videoRef.current || !scanning) return;
        setStatus("🔍 正在分析特征...");
        
        try {
            // 1. Detect Face and get Descriptor
            const descriptor = await faceService.getFaceDescriptor(videoRef.current);
            
            if (!descriptor) {
                setStatus("❌ 未检测到人脸");
                return;
            }

            // 2. Fetch all users to compare
            setStatus("🔐 正在比对数据库...");
            const users = await dataService.getUsers();
            
            // 3. Find match
            let matchedUser: User | null = null;
            let minDistance = 1.0;

            for (const user of users) {
                if (user.face_descriptor) {
                    const isMatch = faceService.matchFace(descriptor, user.face_descriptor);
                    if (isMatch) {
                        matchedUser = user;
                        break;
                    }
                }
            }

            if (matchedUser) {
                 setStatus(`✅ 识别成功: ${matchedUser.username}`);
                 stopStream();
                 // Delay slightly for UX
                 setTimeout(() => {
                     authService.switchAccount(matchedUser); 
                     onSuccess();
                 }, 800);
            } else {
                 setStatus("🚫 认证失败: 未知用户");
            }

        } catch (e: any) {
            setStatus("Error: " + e.message);
        }
    };

    return (
        <div className="flex flex-col items-center gap-4">
             <div className="w-48 h-48 bg-gray-200 rounded-full overflow-hidden border-4 border-blue-500 relative shadow-xl">
                 <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${isFrontCamera ? 'transform scale-x-[-1]' : ''}`}></video>
                 {scanning && <div className="absolute inset-0 border-2 border-white opacity-50 rounded-full animate-pulse"></div>}
             </div>
             
             <p className="text-sm font-bold text-gray-600 dark:text-gray-300 animate-pulse">{status}</p>
             
             <div className="flex gap-2 w-full">
                <button onClick={() => setIsFrontCamera(!isFrontCamera)} className="p-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-gray-600 dark:text-gray-300">
                    <Icons.ArrowRightLeft size={20} />
                </button>
                <button onClick={attemptLogin} className="flex-1 bg-blue-600 text-white py-2 rounded-xl font-bold shadow-lg shadow-blue-200 dark:shadow-none active:scale-95 transition-transform">
                    开始识别
                </button>
             </div>
             <button onClick={()=>{stopStream(); window.location.reload();}} className="text-xs text-gray-400 underline">取消 / 返回密码登录</button>
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
            window.location.reload(); 
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
  
  const [toolsOpen, setToolsOpen] = useState(false);
  const [showAnnManager, setShowAnnManager] = useState(false);

  const user = authService.getCurrentUser();
  const perms = useUserPermissions(user?.role_level);

  // --- DYNAMIC THEME ENGINE (PHASE 2) ---
  useEffect(() => {
      const applyStoreTheme = async () => {
          if (!isAuthenticated || currentStore === 'all' || !isConfigured()) {
              document.documentElement.style.removeProperty('--primary-color');
              document.documentElement.style.removeProperty('--secondary-color');
              return;
          }
          try {
              const stores = await dataService.getStores();
              const store = stores.find(s => s.id === currentStore);
              if (store?.settings?.theme) {
                  const t = store.settings.theme;
                  if (t.primary) document.documentElement.style.setProperty('--primary-color', t.primary);
              } else {
                  document.documentElement.style.removeProperty('--primary-color');
              }
          } catch(e) {}
      };
      applyStoreTheme();
  }, [currentStore, isAuthenticated]);

  useEffect(() => {
      const initApp = async () => {
          if (isAuthenticated && isConfigured()) {
               try { await new Promise(r => setTimeout(r, 800)); } catch(e) {}
          }
          setIsReady(true);
      };
      initApp();
  }, [isAuthenticated]);

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

  const handleGlobalScreenshot = async () => {
      setToolsOpen(false);
      const element = document.getElementById('main-content-area');
      if (!element) return;

      try {
          // Phase 7: Use html-to-image
          const dataUrl = await htmlToImage.toPng(element, { 
              cacheBust: true, 
              backgroundColor: theme === 'dark' ? '#030712' : '#F2F3F7' 
          });
          const link = document.createElement('a');
          link.download = `StockWise_Snap_${Date.now()}.png`;
          link.href = dataUrl;
          link.click();
      } catch(e: any) { alert("截图失败: " + e.message); }
  };

  const triggerTool = (action: 'COPY' | 'EXCEL') => {
      setToolsOpen(false);
      window.dispatchEvent(new CustomEvent('SW_TOOL_ACTION', { detail: { action } }));
  };

  return (
    <div className="h-screen bg-prism dark:bg-gray-950 flex font-sans text-gray-800 dark:text-gray-100 overflow-hidden">
      <GlobalAnnouncement />
      {showAnnManager && <AnnouncementManager onClose={() => setShowAnnManager(false)} />}
      
      {!perms.only_view_config && <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} currentStore={currentStore} setCurrentStore={setCurrentStore} hasUnread={false} />}
      
      <div className="flex-1 flex flex-col h-full relative md:ml-64 transition-all duration-300">
        <header className="sticky top-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between z-30 shrink-0 h-16 md:h-20">
            <h2 className="text-xl font-bold capitalize text-gray-800 dark:text-white truncate pl-10 md:pl-0 animate-fade-in" style={{ color: 'var(--primary-color)' }}>
                {currentPage.split('-')[0] === 'dashboard' ? '仪表盘' : currentPage.split('-')[0] === 'inventory' ? '库存管理' : currentPage.split('-')[0] === 'import' ? '商品导入' : currentPage.split('-')[0] === 'logs' ? '操作日志' : currentPage.split('-')[0] === 'settings' ? '系统设置' : currentPage}
            </h2>
            <div className="flex items-center space-x-3">
                <div className="relative">
                    <button onClick={() => setToolsOpen(!toolsOpen)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 relative transition-colors"><Icons.Menu size={24}/></button>
                    {toolsOpen && (
                        <div className="absolute right-0 top-12 bg-white dark:bg-gray-800 border dark:border-gray-700 shadow-glass rounded-2xl w-48 flex flex-col z-50 overflow-hidden animate-scale-in origin-top-right p-1">
                             <button onClick={()=>{ setShowAnnManager(true); setToolsOpen(false); }} className="p-3 text-left rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 flex justify-between items-center text-sm font-medium transition-colors">📢 公告中心</button>
                            <button onClick={handleGlobalScreenshot} className="p-3 text-left rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors">📷 页面长截图</button>
                            <button onClick={() => triggerTool('COPY')} className="p-3 text-left rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors">📄 复制本页文字</button>
                            <button onClick={() => triggerTool('EXCEL')} className="p-3 text-left rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors">📊 导出本页 Excel</button>
                        </div>
                    )}
                </div>
            </div>
        </header>

        <div id="main-content-area" className="flex-1 overflow-auto custom-scrollbar p-0 relative bg-prism dark:bg-gray-950 pb-24 md:pb-0">
            {renderPage()}
        </div>
      </div>
      {/* IOS Install Prompt placeholder, logic can be added here if needed */}
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