import React, { useState, useEffect } from 'react';
import { Icons } from './Icons';
import { authService } from '../services/authService';
import { UsernameBadge } from './UsernameBadge';
import { SVIPBadge } from './SVIPBadge';
import { useUserPermissions } from '../contexts/PermissionContext';
import { StoreSwitcher } from './StoreSwitcher';
import { dataService } from '../services/dataService';
import { getSupabaseClient } from '../services/supabaseClient';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  currentStore: string;
  setCurrentStore: (storeId: string) => void;
  hasUnread?: boolean; // Prop from parent if needed, but we handle internally now
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, currentStore, setCurrentStore }) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); 
  const [unreadCount, setUnreadCount] = useState(0); // Phase 6
  
  const user = authService.getCurrentUser();
  const perms = useUserPermissions(user?.role_level);

  useEffect(() => {
      const handleResize = () => setIsMobile(window.innerWidth < 768);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- PHASE 6: Realtime Unread Count ---
  useEffect(() => {
      if (!user) return;
      
      const fetchUnread = async () => {
          const list = await dataService.getAnnouncements();
          // Logic: Valid Date + Not in read_by array
          const now = new Date();
          const count = list.filter(a => 
              !a.is_force_deleted && 
              new Date(a.valid_until) > now && 
              !a.read_by?.includes(user.id)
          ).length;
          setUnreadCount(count);
      };
      
      fetchUnread();

      // Listen for new announcements
      const client = getSupabaseClient();
      if (client) {
          const channel = client.channel('announcement_badge')
              .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
                  fetchUnread(); // Re-fetch on any change
              })
              .subscribe();
          return () => { client.removeChannel(channel); };
      }
  }, [user?.id]);

  const menuItems = [
    { id: 'dashboard', label: '仪表盘', icon: Icons.LayoutDashboard },
    { id: 'inventory', label: '库存管理', icon: Icons.Package },
    { id: 'import', label: '导入商品', icon: Icons.Plus },
    { id: 'logs', label: '操作日志', icon: Icons.Sparkles },
  ];

  if (currentStore === 'all' && ['A','B','C'].includes(perms.logs_level)) {
      if (!perms.hide_audit_hall) {
          menuItems.push({ id: 'audit', label: '审计大厅', icon: Icons.AlertTriangle });
      }
  }

  const NavButton = ({ item }: any) => {
    const isActive = currentPage === item.id;
    return (
        <button
          onClick={() => { onNavigate(item.id); setIsMobileMenuOpen(false); }}
          className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all duration-200 active:scale-95 ${
            isActive
              ? 'text-blue-600 dark:text-blue-400 font-bold bg-prism dark:bg-gray-800 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          <item.icon size={20} />
          <span className="font-medium">{item.label}</span>
        </button>
    );
  };

  const SidebarContent = () => (
      <div className="flex flex-col h-full">
          {/* Logo Area */}
          <div className="p-6 flex items-center space-x-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
            <img 
                src="https://i.ibb.co/vxq7QfYd/retouch-2025121423241826.png" 
                alt="Prism Logo" 
                className="w-10 h-10 object-contain drop-shadow-md"
            />
            <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">棱镜</h1>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">StockWise System</p>
            </div>
          </div>

          {/* Store Switcher */}
          <StoreSwitcher currentStore={currentStore} onChange={setCurrentStore} />

          <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
            {menuItems.map((item) => <NavButton key={item.id} item={item} />)}

            <div className="pt-2">
                <button
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-200 ${
                    currentPage.startsWith('settings') ? 'text-blue-600 dark:text-blue-400 bg-prism dark:bg-gray-800' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                    <div className="flex items-center space-x-3">
                        <Icons.ChevronDown size={20} className={`transform transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
                        <span className="font-medium">系统设置</span>
                    </div>
                </button>
                
                {settingsOpen && (
                    <div className="pl-4 mt-2 space-y-1 animate-fade-in">
                        <div className="border-l-2 border-gray-100 dark:border-gray-800 pl-4 space-y-1">
                            <button onClick={() => {onNavigate('settings-config'); setIsMobileMenuOpen(false);}} className={`block w-full text-left py-2 px-3 rounded-xl text-sm transition-colors ${currentPage === 'settings-config' ? 'text-blue-600 font-bold bg-blue-50 dark:bg-blue-900/20' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>连接配置</button>
                            <button onClick={() => {onNavigate('settings-account'); setIsMobileMenuOpen(false);}} className={`block w-full text-left py-2 px-3 rounded-xl text-sm transition-colors ${currentPage === 'settings-account' ? 'text-blue-600 font-bold bg-blue-50 dark:bg-blue-900/20' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>账户设置</button>
                            {!perms.hide_perm_page && <button onClick={() => {onNavigate('settings-perms'); setIsMobileMenuOpen(false);}} className={`block w-full text-left py-2 px-3 rounded-xl text-sm transition-colors ${currentPage === 'settings-perms' ? 'text-blue-600 font-bold bg-blue-50 dark:bg-blue-900/20' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>权限设置</button>}
                            <button onClick={() => {onNavigate('settings-theme'); setIsMobileMenuOpen(false);}} className={`block w-full text-left py-2 px-3 rounded-xl text-sm transition-colors ${currentPage === 'settings-theme' ? 'text-blue-600 font-bold bg-blue-50 dark:bg-blue-900/20' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>应用主题</button>
                        </div>
                    </div>
                )}
            </div>
          </nav>

          <div className="p-4 border-t border-gray-100 dark:border-gray-800">
             {(user?.role_level === 0 || user?.role_level === 1) ? (
                 <SVIPBadge name={user?.username || ''} roleLevel={user?.role_level} className="shadow-sm" />
             ) : (
                <div className="flex items-center space-x-3 px-2 py-1 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-sm font-bold text-white shadow-md font-mono">
                        {String(user?.role_level).padStart(2,'0')}
                    </div>
                    <div className="overflow-hidden">
                        <UsernameBadge name={user?.username || ''} roleLevel={user?.role_level || 9} />
                        <p className="text-gray-500 dark:text-gray-400 text-xs truncate">Level {String(user?.role_level).padStart(2,'0')}</p>
                    </div>
                </div>
             )}
          </div>
      </div>
  );

  if (isMobile) {
      return (
          <>
            <button 
                onClick={() => setIsMobileMenuOpen(true)}
                className={`fixed top-3 left-4 z-50 p-2 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md rounded-full shadow-lg border border-gray-200 dark:border-gray-700 transition-transform duration-200 ${isMobileMenuOpen ? 'scale-0 opacity-0' : 'scale-100 opacity-100'} relative`}
            >
                <img src="https://i.ibb.co/vxq7QfYd/retouch-2025121423241826.png" className="w-6 h-6 object-contain" alt="Menu" />
                {unreadCount > 0 && <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></div>}
            </button>

            {isMobileMenuOpen && (
                <div className="fixed inset-0 z-[60] flex">
                    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-fade-in" onClick={() => setIsMobileMenuOpen(false)}></div>
                    <div className="relative w-72 h-full bg-white dark:bg-gray-900 shadow-2xl animate-slide-in-right flex flex-col">
                        <SidebarContent />
                    </div>
                </div>
            )}
          </>
      );
  }

  return (
    <div className="fixed inset-y-0 left-0 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-sm z-40 hidden md:flex flex-col">
        <SidebarContent />
    </div>
  );
};
