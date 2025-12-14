
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

  const LOGO_URL = "https://i.ibb.co/vxq7QfYd/retouch-2025121423241826.png";

  const menuItems = [
    { id: 'dashboard', label: '仪表盘', icon: Icons.LayoutDashboard },
    { id: 'inventory', label: '库存管理', icon: Icons.Package },
    { id: 'import', label: '导入商品', icon: Icons.Plus },
    { id: 'logs', label: '操作日志', icon: Icons.Sparkles },
  ];

  if (!perms.hide_audit_hall || user?.role_level === 0) {
      menuItems.push({ id: 'audit', label: '审计大厅', icon: Icons.AlertTriangle });
  }

  const NavButton = ({ item }: any) => {
    const isActive = currentPage === item.id;
    return (
        <button
          onClick={() => onNavigate(item.id)}
          className={`relative flex items-center w-full space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-300 group ${
            isActive
              ? 'text-black font-bold bg-white/40 shadow-lg border border-white/20'
              : 'text-gray-800 hover:bg-white/20 hover:text-black'
          }`}
        >
          <item.icon size={22} className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
          <span className="font-medium tracking-wide">{item.label}</span>
          {isActive && <div className="absolute right-2 w-1.5 h-1.5 bg-black rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]"></div>}
        </button>
    );
  };

  return (
    <div className={`h-full glass-panel flex flex-col shrink-0 z-50 transition-all duration-300 ${isMobileDrawer ? 'fixed inset-y-0 left-0 w-72 shadow-2xl' : 'w-72 hidden md:flex'}`}>
      <div className="p-6 flex items-center space-x-4 border-b border-white/10">
        <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center shadow-inner border border-white/20 overflow-hidden shrink-0 backdrop-blur-md">
          <img src={LOGO_URL} alt="Logo" className="w-10 h-10 object-contain" />
        </div>
        <div>
            <span className="text-xl font-black text-black tracking-tight block">棱镜</span>
            <span className="text-[10px] text-gray-600 font-medium tracking-widest uppercase">StockWise</span>
        </div>
      </div>

      {/* STORE BUTTON (Top of Sidebar) */}
      {!perms.hide_store_management && (
         <div className="px-4 mt-4">
             <button onClick={()=>onNavigate('store_manage')} className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-blue-600/80 to-purple-600/80 text-white rounded-xl shadow-lg border border-white/10 hover:scale-[1.02] transition-transform">
                 <div className="flex items-center gap-2">
                     <Icons.Store size={20}/>
                     <span className="font-bold">门店管理</span>
                 </div>
                 <Icons.ChevronRight size={16}/>
             </button>
         </div>
      )}

      {/* STORE SELECTOR VISUAL */}
      <div className="px-4 mt-4">
          <div className="bg-black/10 p-2 rounded-xl border border-white/5 flex items-center gap-2 relative">
              <Icons.Store size={16} className="text-gray-600 ml-1"/>
              <span className="text-sm font-bold text-black truncate">
                  {currentStore === 'all' ? '所有门店 (汇总)' : stores.find(s=>s.id===currentStore)?.name || '未知门店'}
              </span>
          </div>
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
        {menuItems.map((item, idx) => (
             <div key={item.id} className={`animate-slide-up`} style={{animationDelay: `${idx*50}ms`}}>
                <NavButton item={item} />
             </div>
        ))}

        <div className="pt-6 mt-2 border-t border-white/10">
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-200 ${
                currentPage.startsWith('settings') ? 'bg-white/30 text-black font-bold' : 'text-gray-700 hover:bg-white/20'
              }`}
            >
                <div className="flex items-center space-x-3">
                    <Icons.Menu size={20} />
                    <span className="font-medium">系统设置</span>
                </div>
                <Icons.ChevronDown size={16} className={`transform transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {settingsOpen && (
                <div className="pl-4 space-y-1 mt-2 ml-4 border-l-2 border-black/10 animate-fade-in origin-top">
                    {(user?.role_level === 0) && <button onClick={() => onNavigate('settings-config')} className={`block w-full text-left px-4 py-2.5 rounded-xl text-sm transition-colors ${currentPage === 'settings-config' ? 'text-black font-bold bg-white/20' : 'text-gray-600 hover:text-black'}`}>连接配置</button>}
                    
                    <button onClick={() => onNavigate('settings-account')} className={`block w-full text-left px-4 py-2.5 rounded-xl text-sm transition-colors ${currentPage === 'settings-account' ? 'text-black font-bold bg-white/20' : 'text-gray-600 hover:text-black'}`}>账户设置</button>
                    {!perms.hide_perm_page && <button onClick={() => onNavigate('settings-perms')} className={`block w-full text-left px-4 py-2.5 rounded-xl text-sm transition-colors ${currentPage === 'settings-perms' ? 'text-black font-bold bg-white/20' : 'text-gray-600 hover:text-black'}`}>权限设置</button>}
                    <button onClick={() => onNavigate('settings-theme')} className={`block w-full text-left px-4 py-2.5 rounded-xl text-sm transition-colors ${currentPage === 'settings-theme' ? 'text-black font-bold bg-white/20' : 'text-gray-600 hover:text-black'}`}>应用主题</button>
                </div>
            )}
        </div>
      </nav>

      <div className="p-4 border-t border-white/10 bg-white/10 backdrop-blur-sm">
         {(user?.role_level === 0 || user?.role_level === 1) ? (
             <SVIPBadge name={user?.username || ''} roleLevel={user?.role_level} />
         ) : (
            <div className="flex items-center space-x-3 px-2 py-1">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-black flex items-center justify-center text-sm font-bold text-white shadow-lg border border-white/20">
                    {String(user?.role_level).padStart(2,'0')}
                </div>
                <div className="overflow-hidden">
                    <UsernameBadge name={user?.username || ''} roleLevel={user?.role_level || 9} />
                    <p className="text-gray-600 text-xs truncate mt-0.5 font-medium">Level {String(user?.role_level).padStart(2,'0')}</p>
                </div>
            </div>
         )}
      </div>
    </div>
  );
};
