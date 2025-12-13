
import { User, RoleLevel, UserPermissions } from '../types';
import { dataService } from './dataService';

export const DEFAULT_PERMISSIONS: UserPermissions = {
    role_level: 9,
    logs_level: 'D', 
    announcement_rule: 'VIEW',
    store_scope: 'LIMITED',
    show_excel: false,
    view_peers: false,
    view_self_in_list: true,
    hide_perm_page: false,
    hide_audit_hall: true,
    hide_store_management: true,
    only_view_config: false,
    hide_new_store_btn: false,
    hide_excel_export_btn: false,
    hide_store_edit_btn: false
};

// Initial Admin Account
export const DEFAULT_ADMIN: User = {
    id: 'admin_00',
    username: '管理员',
    password: 'password', 
    role_level: 0,
    permissions: {
        role_level: 0,
        logs_level: 'A',
        announcement_rule: 'PUBLISH',
        store_scope: 'GLOBAL',
        show_excel: true,
        view_peers: true,
        view_self_in_list: true,
        hide_perm_page: false,
        hide_audit_hall: false,
        hide_store_management: false,
        only_view_config: false,
        hide_new_store_btn: false,
        hide_excel_export_btn: false,
        hide_store_edit_btn: false
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
            this.setSession(this.currentUser);
            return true;
        }

        // 2. Check DB Users 
        try {
            const users = await dataService.getUsers(); 
            const user = users.find(u => u.username === username && u.password === passwordInput);
            
            if (user) {
                // Ensure permissions
                user.permissions = { ...DEFAULT_PERMISSIONS, ...user.permissions };
                
                this.currentUser = user;
                this.setSession(user);
                await dataService.logClientAction('LOGIN', { username });
                return true;
            }
        } catch (e) {
            console.error("Login DB check failed", e);
        }

        return false;
    }

    async loginWithFace(username: string): Promise<boolean> {
        // Logic handled in component (Face Match), this just sets session
        const users = await dataService.getUsers();
        const user = users.find(u => u.username === username);
        if (user) {
            user.permissions = { ...DEFAULT_PERMISSIONS, ...user.permissions };
            this.currentUser = user;
            this.setSession(user);
            await dataService.logClientAction('LOGIN_FACE', { username });
            return true;
        }
        return false;
    }

    setSession(user: User) {
        const sessionUser = { ...user, password: '' };
        sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(sessionUser));
        this.currentUser = user;
    }

    async switchAccount(targetUser: User) {
        this.setSession(targetUser);
        await dataService.logClientAction('SWITCH_ACCOUNT', { target: targetUser.username });
        window.location.reload();
    }

    logout() {
        if (this.currentUser) dataService.logClientAction('LOGOUT', { username: this.currentUser.username });
        this.currentUser = null;
        sessionStorage.removeItem(this.SESSION_KEY);
        sessionStorage.clear(); 
        window.location.reload();
    }
}

export const authService = new AuthService();
