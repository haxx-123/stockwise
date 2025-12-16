
import { useUserPermissions } from '../contexts/PermissionContext';
import { authService } from '../services/authService';

export type PermissionKey = 
    | 'inventory.view'
    | 'inventory.edit'
    | 'inventory.delete'
    | 'inventory.export'
    | 'import.execute'
    | 'announcement.create'
    | 'logs.view_all'
    | 'store.manage';

export const usePermission = (capability: PermissionKey): boolean => {
    const user = authService.getCurrentUser();
    // Get live permissions from context (auto-updates via Realtime)
    const perms = useUserPermissions(user?.role_level);

    if (!user) return false;

    // Super Admin (00) has all permissions
    if (user.role_level === 0) return true;

    // Map string keys to specific logic/flags
    const map: Record<PermissionKey, boolean> = {
        'inventory.view': true, // All logged-in users
        'inventory.edit': user.role_level < 9, // Level 9 is read-only usually
        'inventory.delete': user.role_level <= 1, // Only Admin/Manager (0, 1)
        'inventory.export': perms.show_excel,
        'import.execute': user.role_level <= 5,
        'announcement.create': perms.announcement_rule === 'PUBLISH',
        'logs.view_all': ['A', 'B', 'C'].includes(perms.logs_level),
        'store.manage': !perms.hide_store_management
    };

    return map[capability] ?? false;
};
