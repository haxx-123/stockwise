
import React, { createContext, useContext, useEffect, useState } from 'react';
import { getSupabaseClient, isConfigured } from '../services/supabaseClient';
import { RolePermissionMatrix, RoleLevel, UserPermissions } from '../types';
import { DEFAULT_PERMISSIONS } from '../services/authService';

// Default Matrix (Fallback)
const INITIAL_MATRIX: RolePermissionMatrix = {
    0: { ...DEFAULT_PERMISSIONS, logs_level: 'A', announcement_rule: 'PUBLISH', store_scope: 'GLOBAL', show_excel: true, view_peers: true, hide_perm_page: false, hide_audit_hall: false, hide_store_management: false },
    1: { ...DEFAULT_PERMISSIONS, logs_level: 'A', announcement_rule: 'PUBLISH', store_scope: 'GLOBAL', show_excel: true, view_peers: true },
    2: { ...DEFAULT_PERMISSIONS, logs_level: 'B', store_scope: 'GLOBAL' },
    3: { ...DEFAULT_PERMISSIONS },
    4: { ...DEFAULT_PERMISSIONS },
    5: { ...DEFAULT_PERMISSIONS },
    6: { ...DEFAULT_PERMISSIONS },
    7: { ...DEFAULT_PERMISSIONS },
    8: { ...DEFAULT_PERMISSIONS },
    9: { ...DEFAULT_PERMISSIONS, logs_level: 'D' }
};

interface PermissionContextType {
    matrix: RolePermissionMatrix;
    getPermissions: (role: RoleLevel) => UserPermissions;
    refreshMatrix: () => Promise<void>;
}

const PermissionContext = createContext<PermissionContextType>({
    matrix: INITIAL_MATRIX,
    getPermissions: () => DEFAULT_PERMISSIONS,
    refreshMatrix: async () => {}
});

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [matrix, setMatrix] = useState<RolePermissionMatrix>(INITIAL_MATRIX);

    const refreshMatrix = async () => {
        if (!isConfigured()) return;
        const client = getSupabaseClient();
        if (!client) return;

        // Fetch from role_permissions table
        const { data, error } = await client.from('role_permissions').select('*');
        if (data && !error) {
            const newMatrix = { ...INITIAL_MATRIX };
            data.forEach((row: any) => {
                if (row.role_level >= 0 && row.role_level <= 9) {
                    newMatrix[row.role_level as RoleLevel] = row.permissions;
                }
            });
            setMatrix(newMatrix);
        }
    };

    useEffect(() => {
        refreshMatrix();

        if (isConfigured()) {
            const client = getSupabaseClient();
            if (client) {
                const subscription = client
                    .channel('role_perms_changes')
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'role_permissions' }, () => {
                        console.log("Matrix Update Detected!");
                        refreshMatrix();
                    })
                    .subscribe();

                return () => { client.removeChannel(subscription); };
            }
        }
    }, []);

    const getPermissions = (role: RoleLevel) => {
        return matrix[role] || DEFAULT_PERMISSIONS;
    };

    return (
        <PermissionContext.Provider value={{ matrix, getPermissions, refreshMatrix }}>
            {children}
        </PermissionContext.Provider>
    );
};

export const usePermission = () => useContext(PermissionContext);
