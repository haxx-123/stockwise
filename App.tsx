
import React, { useState, useEffect, useRef } from 'react';
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
import { UsernameBadge } from './components/UsernameBadge';
import { PermissionProvider, usePermission } from './contexts/PermissionContext';

// ... (FaceLogin & LoginScreen omitted for brevity, assume unchanged)
const LoginScreen = ({ onLogin }: any) => {
    const [user, setUser] = useState('');
    const [pass, setPass] = useState('');
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (await authService.login(user, pass)) onLogin(); else alert("Error");
    };
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
             <div className="bg-white dark:bg-gray-800 p-8 rounded shadow text-center">
                 <h1 className="text-xl font-bold mb-4 dark:text-white">StockWise Login</h1>
                 <form onSubmit={handleSubmit} className="space-y-4">
                     <input value={user} onChange={e=>setUser(e.target.value)} placeholder="Username" className="border p-2 w-full"/>
                     <input value={pass} onChange={e=>setPass(e.target.value)} placeholder="Password" type="password" className="border p-2 w-full"/>
                     <button className="bg-blue-600 text-white w-full py-2">Login</button>
                 </form>
             </div>
        </div>
    );
};

const AnnouncementOverlay = ({ onClose, unreadCount, setUnreadCount, initialView, forcedAnn }: any) => {
    const [anns, setAnns] = useState<Announcement[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    
    // Helper to map creator name to role for coloring
    const getUserRole = (name: string) => {
        const u = users.find(u => u.username === name);
        return u?.role_level || 9;
    };

    useEffect(() => {
        dataService.getAnnouncements().then(setAnns);
        dataService.getUsers().then(setUsers);
    }, []);

    // ... (Existing logic for view state, etc. Omitted for brevity)

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl relative">
                <button onClick={onClose} className="absolute top-4 right-4"><Icons.Minus size={24}/></button>
                <div className="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800"><h2 className="font-bold">公告</h2></div>
                <div className="p-4 overflow-y-auto flex-1">
                    {anns.map(a => (
                        <div key={a.id} className="mb-4 p-4 border rounded dark:border-gray-700">
                            <h3 className="font-bold text-lg dark:text-white">{a.title}</h3>
                            <div className="text-xs mt-1 mb-2">
                                <span>发布人: </span>
                                <UsernameBadge name={a.creator} roleLevel={getUserRole(a.creator)} />
                                <span className="ml-2 text-gray-400">{new Date(a.created_at).toLocaleDateString()}</span>
                            </div>
                            <div className="prose dark:prose-invert text-sm" dangerouslySetInnerHTML={{__html: a.content}} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const MainApp = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(!!authService.getCurrentUser());
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [currentStore, setCurrentStore] = useState('all');
  
  // Use Global Permission Matrix
  const { getPermissions } = usePermission();
  const user = authService.getCurrentUser();
  const perms = getPermissions(user?.role_level || 9);

  if (!isAuthenticated) return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;

  const renderPage = () => {
    if (currentPage.startsWith('settings')) return <Settings subPage={currentPage.split('-')[1]} />;
    switch (currentPage) {
      case 'dashboard': return <Dashboard currentStore={currentStore} onNavigate={setCurrentPage} />;
      case 'inventory': return <Inventory currentStore={currentStore} />;
      case 'import': return <Import currentStore={currentStore} />;
      case 'logs': return <Logs />;
      case 'audit': return !perms.hide_audit_hall ? <Audit /> : <div className="p-8">Access Denied</div>;
      case 'ai': return <AIInsights currentStore={currentStore} />;
      default: return <Dashboard currentStore={currentStore} onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-950 flex font-sans text-gray-800 dark:text-gray-100 overflow-hidden">
      {!perms.only_view_config && <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} currentStore={currentStore} hasUnread={false} />}
      <div className="flex-1 flex flex-col h-full relative">
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm px-4 py-3 flex items-center justify-between z-20 shrink-0 h-16">
            <h2 className="text-lg font-semibold capitalize text-gray-800 dark:text-white truncate">{currentPage}</h2>
            {/* Store Selector & Tools omitted for brevity */}
        </header>
        <div id="main-content-area" className="flex-1 overflow-auto custom-scrollbar p-0 relative bg-gray-50 dark:bg-gray-950 pb-24 md:pb-0">
            {renderPage()}
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
    return (
        <PermissionProvider>
            <MainApp />
        </PermissionProvider>
    );
}

export default App;
