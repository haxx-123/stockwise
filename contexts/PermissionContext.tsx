
import React, { createContext, useContext, useEffect, useState } from 'react';
import { getSupabaseClient, isConfigured } from '../services/supabaseClient';
import { RoleLevel, UserPermissions } from '../types';
import { DEFAULT_PERMISSIONS, authService } from '../services/authService';

interface PermissionContextType {
    // We now just expose the current user's permissions, which might be updated in realtime
    getPermission: (level: RoleLevel) => UserPermissions;
}

const PermissionContext = createContext<PermissionContextType>({
    getPermission: () => DEFAULT_PERMISSIONS
});

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // We track the current user's permissions in state to trigger re-renders
    const [currentUserPerms, setCurrentUserPerms] = useState<UserPermissions>(DEFAULT_PERMISSIONS);
    const user = authService.getCurrentUser();

    useEffect(() => {
        if (!isConfigured() || !user) return;

        // Initialize from session user
        if (user.permissions) {
            setCurrentUserPerms(user.permissions);
        }

        const client = getSupabaseClient();
        if (!client) return;

        // Realtime Subscription: Listen to changes on the USERS table for THIS user
        // When admin updates this user's permissions, we update local state immediately.
        const channel = client.channel(`user_perms_${user.id}`)
            .on(
                'postgres_changes',
                { 
                    event: 'UPDATE', 
                    schema: 'public', 
                    table: 'users',
                    filter: `id=eq.${user.id}` 
                },
                (payload) => {
                    const row = payload.new;
                    // Construct new permissions object from the updated row
                    const newPerms: UserPermissions = {
                        role_level: row.role_level,
                        logs_level: row.logs_level || 'D',
                        announcement_rule: row.announcement_rule || 'VIEW',
                        store_scope: row.store_scope || 'LIMITED',
                        show_excel: row.show_excel ?? false,
                        view_peers: row.view_peers ?? false,
                        view_self_in_list: row.view_self_in_list ?? true,
                        hide_perm_page: row.hide_perm_page ?? true,
                        hide_audit_hall: row.hide_audit_hall ?? true,
                        hide_store_management: row.hide_store_management ?? true,
                        only_view_config: row.only_view_config ?? false
                    };
                    
                    // Update authService session to persist across refresh
                    const updatedUser = { ...user, ...row, permissions: newPerms };
                    authService.setSession(updatedUser);
                    
                    setCurrentUserPerms(newPerms);
                }
            )
            .subscribe();

        return () => {
            client.removeChannel(channel);
        };
    }, [user?.id]);

    const getPermission = (level: RoleLevel) => {
        // If the requested level matches current user, return the live state
        if (user && user.role_level === level) {
            return currentUserPerms;
        }
        // Fallback (shouldn't really happen for self-check)
        return DEFAULT_PERMISSIONS;
    };

    return (
        <PermissionContext.Provider value={{ getPermission }}>
            {children}
        </PermissionContext.Provider>
    );
};

export const usePermissionContext = () => useContext(PermissionContext);

export const useUserPermissions = (userRole: RoleLevel | undefined) => {
    const { getPermission } = usePermissionContext();
    // In the new architecture, we mostly care about "My Permissions" which are stored in Context
    return getPermission(userRole ?? 9);
};
