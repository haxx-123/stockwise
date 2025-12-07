
import { User, RoleLevel, UserPermissions } from '../types';
import { dataService } from './dataService';

export const DEFAULT_PERMISSIONS: UserPermissions = {
    logs_level: 'C',
    announcement_rule: 'VIEW',
    store_scope: 'LIMITED',
    delete_mode: 'SOFT',
    show_excel: false
};

// Initial Admin Account
export const DEFAULT_ADMIN: User = {
    id: 'admin_00',
    username: '管理员',
    password: 'password', 
    role_level: 0,
    permissions: {
        logs_level: 'A',
        announcement_rule: 'PUBLISH',
        store_scope: 'GLOBAL',
        delete_mode: 'HARD',
        show_excel: true
    },
    allowed_store_ids: []
};

class AuthService {
    private currentUser: User | null = null;
    private SESSION_KEY = 'sw_session_user';

    constructor() {
        const stored = sessionStorage.getItem(this.SESSION_KEY);
        if (stored) {
            try {
                this.currentUser = JSON.parse(stored);
            } catch (e) { sessionStorage.removeItem(this.SESSION_KEY); }
        }
    }

    getCurrentUser(): User | null {
        return this.currentUser;
    }

    async login(username: string, passwordInput: string): Promise<boolean> {
        // 1. Check Hardcoded Super Admin
        if (username === '管理员' && passwordInput === 'ss631204') {
            this.currentUser = DEFAULT_ADMIN;
            const sessionUser = { ...DEFAULT_ADMIN, password: '' }; 
            sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(sessionUser));
            return true;
        }

        // 2. Check DB Users
        try {
            const users = await dataService.getUsers();
            const user = users.find(u => u.username === username && u.password === passwordInput);
            
            if (user) {
                // Ensure permissions object exists (migration safety)
                if (!user.permissions) user.permissions = DEFAULT_PERMISSIONS;
                
                this.currentUser = user;
                const sessionUser = { ...user, password: '' };
                sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(sessionUser));
                return true;
            }
        } catch (e) {
            console.error("Login DB check failed", e);
        }

        return false;
    }

    logout() {
        this.currentUser = null;
        sessionStorage.removeItem(this.SESSION_KEY);
        window.location.reload();
    }

    // Strict Hierarchy: Current < Target
    canManageUser(targetLevel: RoleLevel): boolean {
        if (!this.currentUser) return false;
        return this.currentUser.role_level < targetLevel;
    }

    // Permission Accessors based on Matrix
    get permissions() {
        const p = this.currentUser?.permissions || DEFAULT_PERMISSIONS;
        return {
            // Logs
            can_see_system_logs: p.logs_level === 'A',
            can_see_subordinate_logs: p.logs_level === 'A' || p.logs_level === 'B',
            can_undo: true, // Controlled by logs level in logic
            
            // Announcements
            can_publish_announcements: p.announcement_rule === 'PUBLISH',
            
            // Stores
            is_global_store: p.store_scope === 'GLOBAL',
            
            // Delete
            can_hard_delete: p.delete_mode === 'HARD',
            
            // UI
            can_export_excel: p.show_excel,
            has_settings_page: true // Everyone has settings, but content differs
        };
    }
}

export const authService = new AuthService();
