

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

  const LOGO_URL = "https://ibb.co/MDtMJNK9";

  const menuItems = [
    { id: 'dashboard', label: '仪表盘', icon: Icons.LayoutDashboard },
    { id: 'inventory', label: '库存管理', icon: Icons.Package },
    { id: 'import', label: '导入商品', icon: Icons.Plus },
    { id: 'logs', label: '操作日志', icon: Icons.Sparkles },
  ];

  // Audit Hall logic: Visible if perm allows or if role_level 0
  const showAudit = !perms.hide_audit_hall || user?.role_level === 0;
  if (showAudit) {
      menuItems.push({ id: 'audit', label: '审计大厅', icon: Icons.AlertTriangle });
  }

  const NavButton = ({ item }: any) => {
    const isActive = currentPage === item.id;
    return (
        <button
          onClick={() => onNavigate(item.id)}
          className={`relative flex items-center w-full space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-300 group ${
            isActive
              ? 'text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-900/20 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <item.icon size={22} className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
          <span className="font-medium tracking-wide">{item.label}</span>
          {isActive && <div className="absolute right-2 w-1.5 h-1.5 bg-blue-600 rounded-full"></div>}
        </button>
    );
  };

  return (
    <div className={`h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col shrink-0 shadow-xl z-50 ${isMobileDrawer ? 'w-full' : 'w-72 fixed inset-y-0 left-0'}`}>
      <div className="p-6 flex items-center space-x-4 border-b border-gray-100 dark:border-gray-800">
        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-lg border border-gray-100 overflow-hidden shrink-0">
          <img src={LOGO_URL} alt="Logo" className="w-10 h-10 object-contain" />
        </div>
        <div>
            <span className="text-xl font-black text-gray-800 dark:text-white tracking-tight block">棱镜</span>
            <span className="text-[10px] text-gray-400 font-medium tracking-widest uppercase">StockWise</span>
        </div>
      </div>

      {/* STORE BUTTON - Top of Sidebar */}
      {!perms.hide_store_management && (
         <div className="px-4 mt-4">
             <button onClick={()=>onNavigate('store_manage')} className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all active:scale-95">
                 <div className="flex items-center gap-2">
                     <Icons.Store size={20}/>
                     <span className="font-bold">门店管理</span>
                 </div>
                 <Icons.ChevronRight size={16}/>
             </button>
         </div>
      )}

      {/* STORE SELECTOR */}
      {stores.length > 0 && (
          <div className="px-4 mt-4">
              <div className="bg-gray-50 dark:bg-gray-800 p-1 rounded-2xl border border-gray-100 dark:border-gray-700 flex items-center gap-2 relative">
                  <div className="absolute left-3 text-gray-400"><Icons.Store size={18}/></div>
                  <select 
                      value={currentStore} 
                      onChange={(e) => onStoreChange && onStoreChange(e.target.value)}
                      className="w-full bg-transparent p-3 pl-10 text-sm font-bold text-gray-700 dark:text-white outline-none appearance-none cursor-pointer"
                  >
                      <option value="all">所有门店 (汇总)</option>
                      {stores.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                  </select>
                  <div className="absolute right-3 text-gray-400 pointer-events-none"><Icons.ChevronDown size={14}/></div>
              </div>
          </div>
      )}

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
        {menuItems.map((item, idx) => (
             <div key={item.id} className={`stagger-${(idx%5)+1} animate-fade-in-up`}>
                <NavButton item={item} />
             </div>
        ))}
        
        {/* Announcement Button in Sidebar as per logic */}
        <div className="stagger-5 animate-fade-in-up">
            <NavButton item={{ id: 'announcement', label: '公告中心', icon: Icons.Megaphone }} />
        </div>

        <div className="pt-6 mt-2 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-200 ${
                currentPage.startsWith('settings') ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-bold' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
                <div className="flex items-center space-x-3">
                    <Icons.Menu size={20} />
                    <span className="font-medium">系统设置</span>
                </div>
                <Icons.ChevronDown size={16} className={`transform transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {settingsOpen && (
                <div className="pl-4 space-y-1 mt-2 ml-4 border-l-2 border-gray-100 dark:border-gray-800 animate-scale-in origin-top">
                    {(user?.role_level === 0) && <button onClick={() => onNavigate('settings-config')} className={`block w-full text-left px-4 py-2.5 rounded-xl text-sm transition-colors ${currentPage === 'settings-config' ? 'text-blue-600 font-bold bg-blue-50' : 'text-gray-500 hover:text-gray-900'}`}>连接配置</button>}
                    
                    <button onClick={() => onNavigate('settings-account')} className={`block w-full text-left px-4 py-2.5 rounded-xl text-sm transition-colors ${currentPage === 'settings-account' ? 'text-blue-600 font-bold bg-blue-50' : 'text-gray-500 hover:text-gray-900'}`}>账户设置</button>
                    {!perms.hide_perm_page && <button onClick={() => onNavigate('settings-perms')} className={`block w-full text-left px-4 py-2.5 rounded-xl text-sm transition-colors ${currentPage === 'settings-perms' ? 'text-blue-600 font-bold bg-blue-50' : 'text-gray-500 hover:text-gray-900'}`}>权限设置</button>}
                    <button onClick={() => onNavigate('settings-theme')} className={`block w-full text-left px-4 py-2.5 rounded-xl text-sm transition-colors ${currentPage === 'settings-theme' ? 'text-blue-600 font-bold bg-blue-50' : 'text-gray-500 hover:text-gray-900'}`}>应用主题</button>
                </div>
            )}
        </div>
      </nav>

      <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur-sm">
         {(user?.role_level === 0 || user?.role_level === 1) ? (
             <SVIPBadge name={user?.username || ''} roleLevel={user?.role_level} />
         ) : (
            <div className="flex items-center space-x-3 px-2 py-1">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-sm font-bold text-white shadow-lg font-mono ring-2 ring-white dark:ring-gray-700">
                    {String(user?.role_level).padStart(2,'0')}
                </div>
                <div className="overflow-hidden">
                    <UsernameBadge name={user?.username || ''} roleLevel={user?.role_level || 9} />
                    <p className="text-gray-400 text-xs truncate mt-0.5 font-medium">Level {String(user?.role_level).padStart(2,'0')}</p>
                </div>
            </div>
         )}
      </div>
    </div>
  );
};