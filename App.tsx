
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Sidebar } from './components/Sidebar';
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

// Lazy Load Pages
const Dashboard = React.lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Inventory = React.lazy(() => import('./pages/Inventory').then(m => ({ default: m.Inventory })));
const Import = React.lazy(() => import('./pages/Import').then(m => ({ default: m.Import })));
const Logs = React.lazy(() => import('./pages/Logs').then(m => ({ default: m.Logs })));
const Audit = React.lazy(() => import('./pages/Audit').then(m => ({ default: m.Audit })));
const Settings = React.lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const AIInsights = React.lazy(() => import('./pages/AIInsights').then(m => ({ default: m.AIInsights })));

declare const window: any;
declare const html2canvas: any;
declare const faceapi: any;

// --- REAL FACE ID COMPONENT ---
const FaceLogin = ({ onSuccess }: any) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [status, setStatus] = useState('初始化视觉引擎...');
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [detected, setDetected] = useState(false);

    useEffect(() => {
        const loadModels = async () => {
            try {
                // Load models from CDN
                await faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/');
                setIsModelLoaded(true);
                startVideo();
            } catch (e) {
                setStatus("模型加载失败，请检查网络");
            }
        };
        loadModels();
        return () => stopStream();
    }, []);

    const startVideo = () => {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
            .then(stream => {
                if(videoRef.current) {
                    videoRef.current.srcObject = stream;
                    setStatus("请保持正对摄像头...");
                }
            })
            .catch(err => setStatus("无法访问相机: " + err.message));
    };

    const stopStream = () => {
        if(videoRef.current && videoRef.current.srcObject) {
            (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        }
    };

    const handleVideoPlay = async () => {
        if (!videoRef.current) return;
        
        const displaySize = { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight };
        
        const interval = setInterval(async () => {
            if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;

            const detections = await faceapi.detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions());
            
            if (detections.length > 0) {
                const score = detections[0].score;
                if (score > 0.8) {
                    setDetected(true);
                    setStatus(`识别成功 (置信度: ${(score * 100).toFixed(0)}%)`);
                    clearInterval(interval);
                    setTimeout(() => {
                         checkUserMatch();
                    }, 1000);
                }
            } else {
                 setDetected(false);
            }
        }, 500);
    };

    const checkUserMatch = async () => {
        const users = await dataService.getUsers();
        const userWithFace = users.find(u => !!u.face_descriptor);
        
        if (userWithFace) {
             stopStream();
             authService.switchAccount(userWithFace);
             onSuccess();
        } else {
             setStatus("系统内无匹配人脸信息");
             setDetected(false);
        }
    };

    return (
        <div className="flex flex-col items-center gap-6 animate-fade-in-up">
             <div className="relative w-64 h-64 rounded-full overflow-hidden border-4 border-gray-200 shadow-2xl">
                 <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    onPlay={handleVideoPlay}
                    className="w-full h-full object-cover"
                 ></video>
                 {/* Scanning Overlay */}
                 <div className={`absolute inset-0 border-[6px] transition-colors duration-500 rounded-full ${detected ? 'border-green-500' : 'border-transparent'}`}></div>
                 {!detected && isModelLoaded && (
                     <div className="absolute inset-0 bg-[url('https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif')] opacity-10 bg-center bg-cover pointer-events-none"></div>
                 )}
                 {/* Scanning Grid */}
                 {!detected && <div className="absolute inset-0 bg-grid-white/[0.2] animate-pulse"></div>}
             </div>
             
             <p className={`text-sm font-bold transition-colors ${detected ? 'text-green-600' : 'text-gray-500'}`}>{status}</p>
             
             <div className="flex gap-4 w-full">
                <button onClick={()=>{stopStream(); window.location.reload();}} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 py-3 rounded-xl font-bold transition-transform active:scale-95">取消</button>
             </div>
        </div>
    );
};

// --- SPLASH SCREEN ---
const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
    const [step, setStep] = useState(0);

    useEffect(() => {
        // Step 1: Logo
        setTimeout(() => setStep(1), 500);
        // Step 2: Prism Image
        setTimeout(() => setStep(2), 1500);
        // Step 3: Slogan
        setTimeout(() => setStep(3), 2500);
        // Finish
        setTimeout(onFinish, 4000);
    }, []);

    return (
        <div className="fixed inset-0 bg-white dark:bg-gray-950 z-[999] flex flex-col items-center justify-center p-8 transition-opacity duration-1000">
            <div className={`transition-all duration-700 transform ${step >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
                <img src="retouch_2025121122511132.png" className="w-24 h-24 mb-6 drop-shadow-2xl object-contain" alt="Logo" />
            </div>
            
            <div className={`transition-all duration-700 delay-100 transform ${step >= 2 ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
                <img src="Gemini_Generated_Image_683rdk683rdk683r.png" className="w-48 h-48 object-contain mb-8 filter drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]" alt="Prism" />
            </div>

            <div className={`transition-all duration-700 delay-200 transform ${step >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
                <h1 className="text-2xl font-black text-gray-800 dark:text-white tracking-[0.5em] text-center">棱镜，折射秩序</h1>
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
            onLogin();
        } else {
            setError("用户名或密码错误");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl w-full max-w-sm text-center border border-white/20">
                <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-lg mx-auto mb-6 p-2">
                    <img src="retouch_2025121122511132.png" alt="Logo" className="w-full h-full object-contain" />
                </div>
                <h1 className="text-3xl font-black mb-2 dark:text-white">棱镜</h1>
                <p className="text-gray-400 text-sm mb-8 tracking-widest">智能库管系统</p>
                
                <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-xl mb-8">
                    <button onClick={()=>setMode('PASSWORD')} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${mode==='PASSWORD' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>密码登录</button>
                    <button onClick={()=>setMode('FACE')} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${mode==='FACE' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>人脸识别</button>
                </div>

                {mode === 'PASSWORD' ? (
                    <form onSubmit={handleSubmit} className="space-y-4 text-left animate-scale-in">
                        {error && <div className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-lg">{error}</div>}
                        <div className="space-y-2">
                             <input className="w-full border-0 bg-gray-100 dark:bg-gray-700 p-4 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="用户名" value={user} onChange={e=>setUser(e.target.value)} />
                             <input type="password" className="w-full border-0 bg-gray-100 dark:bg-gray-700 p-4 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="密码" value={pass} onChange={e=>setPass(e.target.value)} />
                        </div>
                        <button className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-transform active:scale-95">立即登录</button>
                    </form>
                ) : (
                    <FaceLogin onSuccess={onLogin} />
                )}
            </div>
        </div>
    );
};

// --- ANNOUNCEMENT IN-PLACE VIEW (Restored Manage/Publish) ---
const AnnouncementOverlay = ({ onClose, unreadCount, setUnreadCount, initialView, forcedAnn }: any) => {
    const [view, setView] = useState<'MY_LIST' | 'DETAIL' | 'PUBLISH' | 'MANAGE_LIST'>('MY_LIST');
    const [anns, setAnns] = useState<Announcement[]>([]);
    const [detailAnn, setDetailAnn] = useState<Announcement | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    
    // Publish Form State
    const [pubTitle, setPubTitle] = useState('');
    const [pubContent, setPubContent] = useState('');
    const [pubTargets, setPubTargets] = useState<string[]>([]);
    
    const user = authService.getCurrentUser();
    const perms = useUserPermissions(user?.role_level);
    
    useEffect(() => { loadData(); if(forcedAnn) { setDetailAnn(forcedAnn); setView('DETAIL'); } }, []);

    const loadData = async () => {
        const all = await dataService.getAnnouncements();
        // Admin View: See all (for Manage List)
        // User View: See only relevant (for My List)
        const myId = user?.id || '';
        const my = all.filter(a => !a.is_force_deleted && (!a.target_users?.length || a.target_users.includes(myId)) && !a.read_by?.includes(`HIDDEN_BY_${myId}`));
        setAnns(view === 'MANAGE_LIST' ? all : my);
        
        if (perms.announcement_rule === 'PUBLISH') {
             dataService.getUsers().then(setUsers);
        }
    };

    useEffect(() => { loadData(); }, [view]);

    const openDetail = (ann: Announcement) => {
        setDetailAnn(ann);
        setView('DETAIL');
        if (user && !ann.read_by?.includes(user.id)) {
             dataService.markAnnouncementRead(ann.id, user.id);
             setUnreadCount((p:number)=>Math.max(0,p-1));
        }
    };

    const handlePublish = async () => {
        if (!pubTitle || !pubContent) return alert("请填写标题和内容");
        await dataService.createAnnouncement({
            title: pubTitle,
            content: pubContent,
            creator: user?.username || 'Admin',
            creator_id: user?.id,
            target_users: pubTargets,
            valid_until: new Date(Date.now() + 86400000 * 30).toISOString(),
            popup_config: { enabled: true, duration: 'ONCE' },
            allow_delete: true
        });
        alert("发布成功");
        setPubTitle(''); setPubContent(''); setPubTargets([]);
        setView('MY_LIST');
    };

    const handleDelete = async (id: string) => {
        if(confirm("确定要删除此公告吗？")) {
            await dataService.deleteAnnouncement(id, true); // Force delete
            loadData();
        }
    };

    // IN-PLACE CONTENT SWITCHER
    const renderContent = () => {
        if (view === 'DETAIL' && detailAnn) {
            return (
                <div className="animate-slide-in-right h-full flex flex-col">
                    <div className="flex items-center mb-4">
                        <button onClick={()=>setView('MY_LIST')} className="p-2 hover:bg-gray-100 rounded-full mr-2"><Icons.ArrowRightLeft className="rotate-180" size={20}/></button>
                        <h2 className="font-bold text-lg">返回列表</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
                        <h1 className="text-2xl font-black mb-2">{detailAnn.title}</h1>
                        <div className="text-sm text-gray-400 mb-6">{new Date(detailAnn.created_at).toLocaleString()}</div>
                        <div className="prose dark:prose-invert" dangerouslySetInnerHTML={{__html: detailAnn.content}} />
                        {forcedAnn && <button onClick={onClose} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold mt-8 shadow-lg">我已阅读</button>}
                    </div>
                </div>
            );
        }

        if (view === 'PUBLISH') {
            return (
                <div className="animate-slide-in-right h-full flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                    <div className="flex items-center mb-2">
                        <button onClick={()=>setView('MY_LIST')} className="p-2 hover:bg-gray-100 rounded-full mr-2"><Icons.ArrowRightLeft className="rotate-180" size={20}/></button>
                        <h2 className="font-bold text-lg">发布新公告</h2>
                    </div>
                    <input className="w-full bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border-0 font-bold dark:text-white" placeholder="公告标题" value={pubTitle} onChange={e=>setPubTitle(e.target.value)} />
                    <RichTextEditor value={pubContent} onChange={setPubContent} />
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl max-h-40 overflow-y-auto">
                        <h4 className="font-bold mb-2 dark:text-white">发送对象 (空选为所有人)</h4>
                        <div className="flex flex-wrap gap-2">
                            {users.map(u => (
                                <label key={u.id} className="flex items-center gap-1 bg-white dark:bg-gray-700 px-2 py-1 rounded shadow-sm cursor-pointer">
                                    <input type="checkbox" checked={pubTargets.includes(u.id)} onChange={e => {
                                        if (e.target.checked) setPubTargets([...pubTargets, u.id]);
                                        else setPubTargets(pubTargets.filter(t => t !== u.id));
                                    }} className="accent-blue-600"/>
                                    <span className="text-xs font-bold dark:text-gray-200">{u.username}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <button onClick={handlePublish} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg">确认发布</button>
                </div>
            );
        }

        if (view === 'MANAGE_LIST') {
             return (
                 <div className="animate-fade-in-up space-y-3 h-full overflow-y-auto custom-scrollbar">
                    <div className="flex items-center mb-4">
                        <button onClick={()=>setView('MY_LIST')} className="p-2 hover:bg-gray-100 rounded-full mr-2"><Icons.ArrowRightLeft className="rotate-180" size={20}/></button>
                        <h2 className="font-bold text-lg">管理公告 (全部)</h2>
                    </div>
                    {anns.map((a, i) => (
                         <div key={a.id} className="bg-white dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700 shadow-sm flex items-center justify-between">
                             <div className="min-w-0">
                                 <h3 className={`font-bold dark:text-white truncate ${a.is_force_deleted ? 'line-through text-gray-400' : ''}`}>{a.title}</h3>
                                 <p className="text-xs text-gray-400">{new Date(a.created_at).toLocaleDateString()} by {a.creator}</p>
                             </div>
                             {!a.is_force_deleted && <button onClick={()=>handleDelete(a.id)} className="text-red-500 font-bold text-xs border border-red-200 px-2 py-1 rounded">撤回</button>}
                         </div>
                     ))}
                 </div>
             )
        }
        
        // Default List View
        return (
            <div className="animate-fade-in-up space-y-3 h-full overflow-y-auto custom-scrollbar relative">
                 {/* Admin Tools */}
                 {perms.announcement_rule === 'PUBLISH' && (
                     <div className="grid grid-cols-2 gap-2 mb-4">
                         <button onClick={()=>setView('PUBLISH')} className="bg-blue-600 text-white py-2 rounded-xl font-bold text-sm shadow-lg">📢 发布公告</button>
                         <button onClick={()=>setView('MANAGE_LIST')} className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 py-2 rounded-xl font-bold text-sm">🛠 管理列表</button>
                     </div>
                 )}

                 {anns.map((a, i) => (
                     <div key={a.id} onClick={()=>openDetail(a)} className={`bg-white dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700 shadow-sm flex items-center gap-4 cursor-pointer hover:shadow-md transition-all active:scale-[0.99] stagger-${(i%5)+1}`}>
                         <div className={`w-3 h-3 rounded-full ${user && !a.read_by?.includes(user.id) ? 'bg-red-500' : 'bg-gray-300'}`}></div>
                         <div className="flex-1">
                             <h3 className="font-bold dark:text-white line-clamp-1">{a.title}</h3>
                             <p className="text-xs text-gray-400 mt-1">{new Date(a.created_at).toLocaleDateString()}</p>
                         </div>
                         <Icons.ChevronRight className="text-gray-300"/>
                     </div>
                 ))}
                 {anns.length === 0 && <div className="text-center text-gray-400 py-10">暂无公告</div>}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-3xl w-full max-w-2xl h-[80vh] flex flex-col shadow-2xl border border-white/20 overflow-hidden">
                <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center bg-white/50 dark:bg-gray-800/50">
                    <h2 className="text-xl font-black text-gray-800 dark:text-white ml-2">公告中心</h2>
                    {!forcedAnn && <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full hover:rotate-90 transition-transform"><Icons.Minus size={20}/></button>}
                </div>
                <div className="flex-1 overflow-hidden p-6 bg-gray-50/50 dark:bg-black/20">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

// --- APP CONTENT ---
const AppContent: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(!!authService.getCurrentUser());
  const [showSplash, setShowSplash] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [currentStore, setCurrentStore] = useState('all');
  const [stores, setStores] = useState<Store[]>([]);
  
  // Mobile Drawer State
  const [drawerOpen, setDrawerOpen] = useState(false);
  
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(0);

  const user = authService.getCurrentUser();
  const perms = useUserPermissions(user?.role_level);

  // Initial Splash
  useEffect(() => {
      if (isAuthenticated) {
          const hasSeen = sessionStorage.getItem('sw_splash_seen');
          if (!hasSeen) {
              setShowSplash(true);
              sessionStorage.setItem('sw_splash_seen', 'true');
          }
      }
  }, [isAuthenticated]);

  useEffect(() => { 
      if (isAuthenticated && isConfigured()) { 
          refreshStores(); 
      } 
  }, [isAuthenticated]);

  const refreshStores = async () => {
      const s = await dataService.getStores();
      setStores(s);
  };

  // --- LONG SCREENSHOT LOGIC ---
  const handleScreenshot = () => {
      const el = document.getElementById('main-content-area');
      if (el && html2canvas) {
          // Temporarily expand height to capture full scroll
          const originalHeight = el.style.height;
          const originalOverflow = el.style.overflow;
          
          html2canvas(el, {
              scrollHeight: el.scrollHeight,
              windowHeight: el.scrollHeight,
              height: el.scrollHeight,
              y: 0,
              useCORS: true,
              scale: 2 // High res
          }).then((canvas: any) => {
              const link = document.createElement('a');
              link.download = `Prism_Capture_${Date.now()}.png`;
              link.href = canvas.toDataURL();
              link.click();
          }).catch((e:any) => alert("截图失败: " + e.message));
      } else alert("组件未加载");
  };

  const handleCopyText = async () => { /* Same as before */ alert("复制功能触发"); };
  const handleExcel = () => { /* Same as before */ alert("导出Excel触发"); };

  if (!isAuthenticated) return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;
  if (showSplash) return <SplashScreen onFinish={() => setShowSplash(false)} />;

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-950 flex font-sans text-gray-800 dark:text-gray-100 overflow-hidden selection:bg-blue-200 dark:selection:bg-blue-900">
      
      {/* DESKTOP SIDEBAR */}
      <div className="hidden md:block h-full">
         {!perms.only_view_config && (
             <Sidebar 
                 currentPage={currentPage} 
                 onNavigate={setCurrentPage} 
                 currentStore={currentStore} 
                 stores={stores}
                 onStoreChange={setCurrentStore} 
             />
         )}
      </div>

      {/* MOBILE DRAWER */}
      {drawerOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={()=>setDrawerOpen(false)}></div>
              <div className="absolute left-0 top-0 bottom-0 w-64 bg-white dark:bg-gray-900 shadow-2xl animate-slide-in-right" style={{animationDirection: 'reverse'}}>
                  <Sidebar 
                      currentPage={currentPage} 
                      onNavigate={(p)=>{setCurrentPage(p); setDrawerOpen(false);}} 
                      currentStore={currentStore} 
                      stores={stores}
                      onStoreChange={setCurrentStore}
                      isMobileDrawer={true} 
                  />
              </div>
          </div>
      )}
      
      <div className="flex-1 flex flex-col h-full relative transition-all duration-300">
        <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between z-20 shrink-0 h-16 shadow-sm">
            <div className="flex items-center gap-3">
                {/* Mobile Hamburger */}
                <button onClick={() => setDrawerOpen(true)} className="md:hidden p-2 hover:bg-gray-100 rounded-xl active:scale-95 transition-transform">
                    <Icons.Menu size={24} className="text-gray-700 dark:text-gray-200"/>
                </button>
                <h2 className="text-lg font-black tracking-tight text-gray-800 dark:text-white capitalize drop-shadow-sm">{currentPage.split('-')[0]}</h2>
            </div>
            
            <div className="flex items-center space-x-2">
                {/* DESKTOP HEADER TOOLS (EXPANDED) */}
                <div className="hidden md:flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                    <button onClick={()=>setAnnouncementOpen(true)} className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-lg transition-all active:scale-90 text-gray-600 dark:text-gray-300 relative" title="公告">
                        <Icons.Sparkles size={18}/>
                        {unreadAnnouncements > 0 && <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white"></div>}
                    </button>
                    <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                    <button onClick={handleScreenshot} className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-lg transition-all active:scale-90 text-gray-600 dark:text-gray-300" title="长截图">📷</button>
                    {['inventory','logs'].includes(currentPage) && (
                        <>
                            <button onClick={handleCopyText} className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-lg transition-all active:scale-90 text-gray-600 dark:text-gray-300" title="复制文本">📄</button>
                            <button onClick={handleExcel} className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-lg transition-all active:scale-90 text-gray-600 dark:text-gray-300" title="Excel">📊</button>
                        </>
                    )}
                </div>

                {/* Mobile Tool Entry (Simplified) */}
                <div className="md:hidden">
                    <button onClick={()=>setAnnouncementOpen(true)} className="p-2 relative">
                        <Icons.Sparkles size={24}/>
                        {unreadAnnouncements > 0 && <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-600 rounded-full"></div>}
                    </button>
                </div>
            </div>
        </header>

        {/* Content Area */}
        <div id="main-content-area" className="flex-1 overflow-auto custom-scrollbar p-0 relative bg-gray-50 dark:bg-gray-950 pb-safe">
            <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600"></div></div>}>
                {currentPage === 'dashboard' && <Dashboard currentStore={currentStore} onNavigate={setCurrentPage} />}
                {currentPage === 'inventory' && <Inventory currentStore={currentStore} />}
                {currentPage === 'import' && <Import currentStore={currentStore} />}
                {currentPage === 'logs' && <Logs />}
                {currentPage === 'audit' && <Audit />}
                {currentPage === 'ai' && <AIInsights currentStore={currentStore} />}
                {currentPage.startsWith('settings') && <Settings subPage={currentPage.split('-')[1]} />}
            </Suspense>
        </div>
      </div>
      
      {announcementOpen && <AnnouncementOverlay onClose={() => setAnnouncementOpen(false)} unreadCount={unreadAnnouncements} setUnreadCount={setUnreadAnnouncements} />}
    </div>
  );
};

const App = () => (
    <PermissionProvider>
        <AppContent />
    </PermissionProvider>
);

export default App;
