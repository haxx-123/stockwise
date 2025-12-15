

import React, { createContext, useContext, useEffect, useState } from 'react';
import { getSupabaseClient, isConfigured } from '../services/supabaseClient';
import { UserPermissions, RoleLevel } from '../types';
import { DEFAULT_PERMISSIONS, authService } from '../services/authService';

interface PermissionContextType {
    // We no longer expose a global matrix. We expose the current user's LIVE permissions.
    currentUserPermissions: UserPermissions;
    loading: boolean;
    getPermission: (level: RoleLevel) => UserPermissions; // Fallback helper if needed for other users, though mostly used for self
}

const PermissionContext = createContext<PermissionContextType>({
    currentUserPermissions: DEFAULT_PERMISSIONS,
    loading: true,
    getPermission: () => DEFAULT_PERMISSIONS
});

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [currentUserPermissions, setCurrentUserPermissions] = useState<UserPermissions>(DEFAULT_PERMISSIONS);
    const [loading, setLoading] = useState(true);
    const currentUser = authService.getCurrentUser();

    useEffect(() => {
        if (!isConfigured() || !currentUser) {
            setLoading(false);
            if (currentUser) setCurrentUserPermissions(currentUser.permissions || DEFAULT_PERMISSIONS);
            return;
        }

        // Initialize from session
        setCurrentUserPermissions(currentUser.permissions || DEFAULT_PERMISSIONS);

        const client = getSupabaseClient();
        if (!client) return;

        // Realtime Subscription to USERS table for the CURRENT USER ID
        const channel = client.channel(`user_perms_${currentUser.id}`)
            .on(
                'postgres_changes',
                { 
                    event: 'UPDATE', 
                    schema: 'public', 
                    table: 'users',
                    filter: `id=eq.${currentUser.id}`
                },
                (payload) => {
                    const newUserRow = payload.new;
                    // Map flat columns to permissions object
                    const newPerms: UserPermissions = {
                        role_level: newUserRow.role_level,
                        logs_level: newUserRow.logs_level || DEFAULT_PERMISSIONS.logs_level,
                        announcement_rule: newUserRow.announcement_rule || DEFAULT_PERMISSIONS.announcement_rule,
                        store_scope: newUserRow.store_scope || DEFAULT_PERMISSIONS.store_scope,
                        show_excel: newUserRow.show_excel ?? DEFAULT_PERMISSIONS.show_excel,
                        view_peers: newUserRow.view_peers ?? DEFAULT_PERMISSIONS.view_peers,
                        view_self_in_list: newUserRow.view_self_in_list ?? DEFAULT_PERMISSIONS.view_self_in_list,
                        hide_perm_page: newUserRow.hide_perm_page ?? DEFAULT_PERMISSIONS.hide_perm_page,
                        hide_audit_hall: newUserRow.hide_audit_hall ?? DEFAULT_PERMISSIONS.hide_audit_hall,
                        hide_store_management: newUserRow.hide_store_management ?? DEFAULT_PERMISSIONS.hide_store_management,
                        only_view_config: newUserRow.only_view_config ?? DEFAULT_PERMISSIONS.only_view_config
                    };
                    
                    setCurrentUserPermissions(newPerms);
                    
                    // Update session storage silently so refresh works
                    const updatedUser = { ...currentUser, ...newUserRow, permissions: newPerms };
                    authService.setSession(updatedUser);
                }
            )
            .subscribe();

        setLoading(false);

        return () => {
            client.removeChannel(channel);
        };
    }, [currentUser?.id]);

    // Helper: primarily used for checking other users or fallback
    const getPermission = (level: RoleLevel) => {
        // In the new system, permissions are per-user. 
        // If we are asked for permissions based purely on role level (legacy behavior), 
        // we return defaults. Ideally the app should pass the full User object.
        // For self-checks, we return the live state.
        if (currentUser && currentUser.role_level === level) {
            return currentUserPermissions;
        }
        return DEFAULT_PERMISSIONS;
    };

    return (
        <PermissionContext.Provider value={{ currentUserPermissions, loading, getPermission }}>
            {children}
        </PermissionContext.Provider>
    );
};

export const usePermissionContext = () => useContext(PermissionContext);

export const useUserPermissions = (userRole: RoleLevel | undefined) => {
    const { currentUserPermissions, getPermission } = usePermissionContext();
    const currentUser = authService.getCurrentUser();
    
    // If querying for the current logged-in user, return live state
    if (currentUser && userRole === currentUser.role_level) {
        return currentUserPermissions;
    }
    
    return getPermission(userRole ?? 9);
};
