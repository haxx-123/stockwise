
import React, { useState, useEffect } from 'react';
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['import-group', 'audit-group'])); // Default expand
  const user = authService.getCurrentUser();
  const perms = useUserPermissions(user?.role_level);

  const LOGO_URL = "https://i.ibb.co/vxq7QfYd/retouch-2025121423241826.png";

  // Menu Structure
  const menuItems = [
    { id: 'dashboard', label: '仪表盘', icon: Icons.LayoutDashboard },
    { id: 'inventory', label: '库存管理', icon: Icons.Package },
    
    // Group: Import
    { 
      id: 'import-group', 
      label: '商品入库', 
      icon: Icons.Plus,
      children: [
        { id: 'import-manual', label: '单品录入 (手动)' },
        { id: 'import-excel', label: '批量导入 (Excel)' }
      ]
    },

    { id: 'logs', label: '业务日志', icon: Icons.Sparkles },
  ];

  // Group: Audit (Conditional)
  if (!perms.hide_audit_hall || user?.role_level === 0) {
      menuItems.push({ 
        id: 'audit-group', 
        label: '审计大厅', 
        icon: Icons.AlertTriangle,
        children: [
          { id: 'audit-logs', label: '数据审计' },
          { id: 'audit-devices', label: '设备审计' }
        ]
      });
  }

  const toggleGroup = (groupId: string) => {
      const next = new Set(expandedGroups);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      setExpandedGroups(next);
  };

  const NavButton: React.FC<{ item: any, depth?: number }> = ({ item, depth = 0 }) => {
    const isActive = currentPage === item.id;
    const isGroup = item.children && item.children.length > 0;
    const isExpanded = expandedGroups.has(item.id);
    
    // Check if any child is active
    const hasActiveChild = isGroup && item.children.some((c: any) => c.id === currentPage);

    const handleClick = () => {
        if (isGroup) {
            toggleGroup(item.id);
        } else {
            onNavigate(item.id);
        }
    };

    return (
        <div className="mb-1">
            <button
              onClick={handleClick}
              className={`relative flex items-center w-full justify-between px-4 py-3 rounded-2xl transition-all duration-300 group active:scale-95 ${
                isActive || (isGroup && hasActiveChild && !isExpanded)
                  ? 'text-black font-bold bg-white/40 shadow-lg border border-white/20'
                  : 'text-gray-800 hover:bg-white/20 hover:text-black'
              } ${depth > 0 ? 'pl-12 text-sm py-2.5' : ''}`}
            >
              <div className="flex items-center space-x-3">
                  {item.icon && <item.icon size={depth > 0 ? 18 : 22} className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />}
                  <span className={`tracking-wide ${depth > 0 ? 'font-medium' : 'font-bold'}`}>{item.label}</span>
              </div>
              
              {isActive && !isGroup && <div className="w-1.5 h-1.5 bg-black rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]"></div>}
              {isGroup && (
                  <Icons.ChevronDown size={16} className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''} opacity-50`}/>
              )}
            </button>

            {/* Render Children */}
            {isGroup && isExpanded && (
                <div className="mt-1 space-y-1 animate-fade-in origin-top">
                    {item.children.map((child: any) => (
                        <NavButton key={child.id} item={child} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
  };

  return (
    <div className={`h-full w-full glass-panel flex flex-col shrink-0 overflow-hidden ${isMobileDrawer ? 'shadow-2xl' : ''}`}>
      <div className="p-6 flex items-center space-x-4 border-b border-white/10">
        <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center shadow-inner border border-white/20 overflow-hidden shrink-0 backdrop-blur-md">
          <img src={LOGO_URL} alt="Logo" className="w-10 h-10 object-contain" />
        </div>
        <div>
            <span className="text-xl font-black text-black tracking-tight block">棱镜</span>
            <span className="text-[10px] text-gray-600 font-medium tracking-widest uppercase">StockWise</span>
        </div>
      </div>

      {/* STORE BUTTON */}
      {!perms.hide_store_management && (
         <div className="px-4 mt-6">
             <button onClick={()=>onNavigate('store_manage')} className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-blue-600/90 to-purple-600/90 text-white rounded-2xl shadow-xl border border-white/10 hover:scale-[1.02] active:scale-95 transition-all">
                 <div className="flex items-center gap-3">
                     <Icons.Store size={22}/>
                     <span className="font-bold tracking-wide">门店管理</span>
                 </div>
                 <Icons.ChevronRight size={18} className="opacity-80"/>
             </button>
         </div>
      )}

      {/* STORE SELECTOR VISUAL */}
      <div className="px-4 mt-4">
          <div className="bg-black/5 p-3 rounded-2xl border border-white/5 flex items-center gap-3 relative hover:bg-black/10 transition-colors cursor-default">
              <div className="p-1.5 bg-white/50 rounded-lg"><Icons.Store size={16} className="text-gray-800"/></div>
              <span className="text-sm font-bold text-black truncate">
                  {currentStore === 'all' ? '所有门店 (汇总)' : stores.find(s=>s.id===currentStore)?.name || '未知门店'}
              </span>
          </div>
      </div>

      <nav className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-2">
        {menuItems.map((item, idx) => (
             <div key={item.id} className={`animate-slide-up opacity-0`} style={{animationDelay: `${idx*50}ms`}}>
                <NavButton item={item} />
             </div>
        ))}

        <div className="pt-6 mt-4 border-t border-white/10">
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-200 active:scale-95 ${
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
                    {(user?.role_level === 0) && <button onClick={() => onNavigate('settings-config')} className={`block w-full text-left px-4 py-2.5 rounded-xl text-sm transition-colors active:scale-95 ${currentPage === 'settings-config' ? 'text-black font-bold bg-white/20' : 'text-gray-600 hover:text-black'}`}>连接配置</button>}
                    
                    <button onClick={() => onNavigate('settings-account')} className={`block w-full text-left px-4 py-2.5 rounded-xl text-sm transition-colors active:scale-95 ${currentPage === 'settings-account' ? 'text-black font-bold bg-white/20' : 'text-gray-600 hover:text-black'}`}>账户设置</button>
                    {!perms.hide_perm_page && <button onClick={() => onNavigate('settings-perms')} className={`block w-full text-left px-4 py-2.5 rounded-xl text-sm transition-colors active:scale-95 ${currentPage === 'settings-perms' ? 'text-black font-bold bg-white/20' : 'text-gray-600 hover:text-black'}`}>权限设置</button>}
                    <button onClick={() => onNavigate('settings-theme')} className={`block w-full text-left px-4 py-2.5 rounded-xl text-sm transition-colors active:scale-95 ${currentPage === 'settings-theme' ? 'text-black font-bold bg-white/20' : 'text-gray-600 hover:text-black'}`}>应用主题</button>
                </div>
            )}
        </div>
      </nav>

      <div 
        className="p-4 border-t border-white/10 bg-white/10 backdrop-blur-sm cursor-pointer hover:bg-white/20 transition-colors"
        onClick={() => onNavigate('settings-account')}
        title="前往账户设置"
      >
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
