
import React, { useState } from 'react';
import { Icons } from './Icons';
import { authService } from '../services/authService';
import { UsernameBadge } from './UsernameBadge';
import { SVIPBadge } from './SVIPBadge';
import { useUserPermissions } from '../contexts/PermissionContext';
import { Store } from '../types';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  currentStore: string;
  stores?: Store[];
  onStoreChange?: (storeId: string) => void;
  isMobileDrawer?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, currentStore, stores = [], onStoreChange, isMobileDrawer }) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const user = authService.getCurrentUser();
  const perms = useUserPermissions(user?.role_level);

  // Core Navigation
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

  // Logo: Directly use specific URL
  const LOGO_URL = "https://ibb.co/MDtMJNK9"; 

  const NavButton = ({ item }: any) => {
    const isActive = currentPage === item.id;
    return (
        <button
          onClick={() => onNavigate(item.id)}
          className={`relative flex items-center w-full space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-300 group ${
            isActive
              ? 'text-white font-bold bg-white/10 shadow-lg border border-white/5'
              : 'text-gray-400 hover:bg-white/5 hover:text-white'
          }`}
        >
          <item.icon size={22} className={`transition-transform duration-300 ${isActive ? 'scale-110 text-blue-400' : ''}`} />
          <span className="font-medium tracking-wide">{item.label}</span>
          {isActive && <div className="absolute right-2 w-1.5 h-1.5 bg-blue-400 rounded-full shadow-[0_0_5px_rgba(96,165,250,0.8)]"></div>}
        </button>
    );
  };

  // Mobile Sidebar: Fixed position
  const containerClass = isMobileDrawer 
    ? "fixed inset-y-0 left-0 w-64 bg-[#1a1a1a] shadow-2xl z-50 flex flex-col border-r border-gray-800" 
    : "h-full w-72 bg-[#1a1a1a] border-r border-gray-800 flex flex-col shrink-0 shadow-xl z-50";

  return (
    <div className={containerClass}>
      <div className="p-6 flex items-center space-x-4 border-b border-gray-800 bg-black/20">
        <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 overflow-hidden shrink-0 backdrop-blur-md">
          {/* Use specific logo URL, handle fallback if img fails */}
          <div className="text-2xl">🧊</div> 
        </div>
        <div>
            <span className="text-xl font-black text-white tracking-tight block">棱镜</span>
            <span className="text-[10px] text-gray-500 font-medium tracking-widest uppercase">Prism System</span>
        </div>
      </div>

      {/* STORE SELECTOR (Restored) */}
      {!perms.hide_store_management && stores.length > 0 && (
          <div className="px-4 mt-4">
              <div className="bg-black/40 p-1 rounded-2xl border border-white/5 flex items-center gap-2 relative">
                  <div className="absolute left-3 text-gray-500"><Icons.Store size={18}/></div>
                  <select 
                      value={currentStore} 
                      onChange={(e) => onStoreChange && onStoreChange(e.target.value)}
                      className="w-full bg-transparent p-3 pl-10 text-sm font-bold text-gray-200 outline-none appearance-none cursor-pointer"
                  >
                      <option value="all" className="bg-gray-900 text-gray-400">所有门店 (汇总)</option>
                      {stores.map(s => (
                          <option key={s.id} value={s.id} className="bg-gray-900">{s.name}</option>
                      ))}
                  </select>
                  <div className="absolute right-3 text-gray-500 pointer-events-none"><Icons.ChevronDown size={14}/></div>
              </div>
          </div>
      )}

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
        {menuItems.map((item, idx) => (
             <div key={item.id} className={`stagger-${(idx%5)+1} animate-fade-in-up`}>
                <NavButton item={item} />
             </div>
        ))}

        <div className="pt-6 mt-2 border-t border-gray-800">
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-200 ${
                currentPage.startsWith('settings') ? 'bg-white/10 text-white font-bold' : 'text-gray-500 hover:bg-white/5'
              }`}
            >
                <div className="flex items-center space-x-3">
                    <Icons.Menu size={20} />
                    <span className="font-medium">系统设置</span>
                </div>
                <Icons.ChevronDown size={16} className={`transform transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {settingsOpen && (
                <div className="pl-4 space-y-1 mt-2 ml-4 border-l-2 border-gray-800 animate-scale-in origin-top">
                    {!perms.only_view_config && <button onClick={() => onNavigate('settings-config')} className={`block w-full text-left px-4 py-2.5 rounded-xl text-sm transition-colors ${currentPage === 'settings-config' ? 'text-blue-400 font-bold bg-blue-900/20' : 'text-gray-500 hover:text-white'}`}>连接配置</button>}
                    <button onClick={() => onNavigate('settings-account')} className={`block w-full text-left px-4 py-2.5 rounded-xl text-sm transition-colors ${currentPage === 'settings-account' ? 'text-blue-400 font-bold bg-blue-900/20' : 'text-gray-500 hover:text-white'}`}>账户设置</button>
                    {!perms.hide_perm_page && <button onClick={() => onNavigate('settings-perms')} className={`block w-full text-left px-4 py-2.5 rounded-xl text-sm transition-colors ${currentPage === 'settings-perms' ? 'text-blue-400 font-bold bg-blue-900/20' : 'text-gray-500 hover:text-white'}`}>权限设置</button>}
                </div>
            )}
        </div>
      </nav>

      <div className="p-4 border-t border-gray-800 bg-black/20 backdrop-blur-sm">
         <div className="flex items-center space-x-3 px-2 py-1">
             <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-sm font-bold text-white shadow-lg border border-white/10">
                 {String(user?.role_level).padStart(2,'0')}
             </div>
             <div className="overflow-hidden">
                 <UsernameBadge name={user?.username || ''} roleLevel={user?.role_level || 9} />
                 <p className="text-gray-500 text-[10px] truncate mt-0.5 font-bold uppercase tracking-wider">Level {String(user?.role_level).padStart(2,'0')}</p>
             </div>
         </div>
      </div>
    </div>
  );
};
