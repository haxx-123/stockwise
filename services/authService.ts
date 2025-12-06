import { User, RoleLevel } from '../types';
import { dataService } from './dataService';

// Initial Admin Account (Hardcoded fallback if DB empty)
export const DEFAULT_ADMIN: User = {
    id: 'admin_00',
    username: '管理员',
    password: 'password', 
    role_level: 0,
};

class AuthService {
    private currentUser: User | null = null;
    private SESSION_KEY = 'sw_session_user';

    constructor() {
        // SECURITY: Use sessionStorage. Data is LOST when tab/browser is closed.
        // Survives page refresh (F5), but not session termination.
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
        // 1. Check Hardcoded Super Admin (For initial setup)
        if (username === '管理员' && passwordInput === 'ss631204') {
            this.currentUser = DEFAULT_ADMIN;
            // Never save password
            const sessionUser = { ...DEFAULT_ADMIN, password: '' }; 
            sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(sessionUser));
            return true;
        }

        // 2. Check DB Users
        try {
            const users = await dataService.getUsers();
            const user = users.find(u => u.username === username && u.password === passwordInput);
            
            if (user) {
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
        // Force reload to clear any React state
        window.location.reload();
    }

    // Integer based hierarchy: Lower number = Higher permission
    canManageRole(targetLevel: RoleLevel): boolean {
        if (!this.currentUser) return false;
        // Level 0 can manage 0, 1, 2
        // Level 1 can manage 1, 2
        return this.currentUser.role_level <= targetLevel;
    }

    // Permission Mappers
    get permissions() {
        const level = this.currentUser?.role_level ?? 99;
        return {
            can_manage_users: level <= 1,        // 0 and 1
            can_view_logs_others: level <= 1,    // 0 and 1
            can_undo_logs_others: level === 0,   // Only 0
            can_publish_announcements: level <= 1,
            can_hard_delete: level === 0,        // Only 0
            can_export_excel: level <= 1,
            has_settings_page: level <= 1,
        };
    }
}

export const authService = new AuthService();