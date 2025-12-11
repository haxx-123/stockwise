

import React, { useState, useEffect } from 'react';
import { Icons } from './Icons';
import { authService } from '../services/authService';
import { UsernameBadge } from './UsernameBadge';
import { SVIPBadge } from './SVIPBadge';
import { useUserPermissions } from '../contexts/PermissionContext';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  currentStore: string;
  hasUnread?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, currentStore, hasUnread }) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const user = authService.getCurrentUser();
  const perms = useUserPermissions(user?.role_level);

  useEffect(() => {
      const handleResize = () => setIsMobile(window.innerWidth < 768);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const NavButton = ({ item, isMobile }: any) => {
    const isActive = currentPage === item.id;
    return (
        <button
          onClick={() => onNavigate(item.id)}
          className={`relative flex items-center justify-center btn-press transition-all duration-200 ${
              isMobile 
              ? 'flex-col space-y-1 p-2 w-full rounded-xl' 
              : 'w-full space-x-3 px-4 py-3 rounded-xl'
          } ${
            isActive
              ? 'text-blue-600 dark:text-blue-400 font-bold bg-blue-50/80 dark:bg-blue-900/30'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50'
          }`}
        >
          <item.icon size={isMobile ? 24 : 20} strokeWidth={isActive ? 2.5 : 2} />
          <span className={isMobile ? 'text-[10px]' : 'font-medium'}>{item.label}</span>
        </button>
    );
  };

  if (isMobile) {
      return (
          <div className="fixed bottom-0 left-0 right-0 glass dark:glass z-50 px-2 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.05)] rounded-t-3xl h-20 transition-transform duration-300">
             <div className="flex justify-between items-center h-full pb-2">
                {menuItems.slice(0, 4).map(item => <NavButton key={item.id} item={item} isMobile={true} />)}
                
                <div className="relative w-full">
                     {settingsOpen && (
                        <div className="absolute bottom-20 right-2 glass dark:bg-gray-900/90 border dark:border-gray-700 rounded-2xl shadow-2xl p-2 w-40 flex flex-col gap-2 mb-2 animate-scale-in origin-bottom-right">
                            <button onClick={()=>{onNavigate(`settings-config`); setSettingsOpen(false)}} className="text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl text-xs dark:text-white">连接配置</button>
                            <button onClick={()=>{onNavigate(`settings-account`); setSettingsOpen(false)}} className="text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl text-xs dark:text-white">账户设置</button>
                            {!perms.hide_perm_page && <button onClick={()=>{onNavigate(`settings-perms`); setSettingsOpen(false)}} className="text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl text-xs dark:text-white">权限设置</button>}
                            <button onClick={()=>{onNavigate(`settings-theme`); setSettingsOpen(false)}} className="text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl text-xs dark:text-white">应用主题</button>
                        </div>
                     )}
                     <button onClick={() => setSettingsOpen(!settingsOpen)} className="flex flex-col items-center justify-center p-2 w-full text-gray-500 dark:text-gray-400 btn-press">
                        <Icons.ChevronDown size={24} className={`transform transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
                        <span className="text-[10px]">设置</span>
                     </button>
                </div>
             </div>
          </div>
      );
  }

  return (
    <div className="w-72 glass dark:bg-gray-900/80 border-r border-gray-200/50 dark:border-gray-800 h-full flex flex-col shrink-0 backdrop-blur-xl z-30">
      <div className="p-8 flex items-center space-x-3">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
          <Icons.Prism size={24} />
        </div>
        <span className="text-2xl font-bold text-gray-800 dark:text-white tracking-tight">棱镜</span>
      </div>

      <nav className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar">
        {menuItems.map((item, idx) => (
            <div key={item.id} className="stagger-item" style={{animationDelay: `${idx * 0.05}s`}}>
                <NavButton item={item} isMobile={false} />
            </div>
        ))}

        <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 btn-press ${
                currentPage.startsWith('settings') ? 'text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/20' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
                <div className="flex items-center space-x-3">
                    <Icons.ChevronDown size={20} className={`transform transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
                    <span className="font-medium">系统设置</span>
                </div>
            </button>
            
            {settingsOpen && (
                <div className="pl-4 space-y-1 mt-2 animate-fade-in ml-2">
                    <button onClick={() => onNavigate('settings-config')} className={`block w-full text-left px-4 py-2 rounded-lg text-sm transition-colors ${currentPage === 'settings-config' ? 'text-blue-600 dark:text-blue-400 font-bold bg-blue-50/50 dark:bg-blue-900/20' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>连接配置</button>
                    <button onClick={() => onNavigate('settings-account')} className={`block w-full text-left px-4 py-2 rounded-lg text-sm transition-colors ${currentPage === 'settings-account' ? 'text-blue-600 dark:text-blue-400 font-bold bg-blue-50/50 dark:bg-blue-900/20' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>账户设置</button>
                    {!perms.hide_perm_page && <button onClick={() => onNavigate('settings-perms')} className={`block w-full text-left px-4 py-2 rounded-lg text-sm transition-colors ${currentPage === 'settings-perms' ? 'text-blue-600 dark:text-blue-400 font-bold bg-blue-50/50 dark:bg-blue-900/20' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>权限设置</button>}
                    <button onClick={() => onNavigate('settings-theme')} className={`block w-full text-left px-4 py-2 rounded-lg text-sm transition-colors ${currentPage === 'settings-theme' ? 'text-blue-600 dark:text-blue-400 font-bold bg-blue-50/50 dark:bg-blue-900/20' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>应用主题</button>
                </div>
            )}
        </div>
      </nav>

      <div className="p-4 m-4 rounded-2xl bg-white/50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 shadow-sm backdrop-blur-sm">
         {(user?.role_level === 0 || user?.role_level === 1) ? (
             <SVIPBadge name={user?.username || ''} roleLevel={user?.role_level} />
         ) : (
            <div className="flex items-center space-x-3 px-1 py-1">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-sm font-bold text-white shadow-md font-mono border-2 border-white dark:border-gray-700">
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
};
