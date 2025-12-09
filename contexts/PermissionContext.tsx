
import React, { createContext, useContext, useEffect, useState } from 'react';
import { getSupabaseClient, isConfigured } from '../services/supabaseClient';
import { RolePermissionMatrix, RolePermissionRule, RoleLevel } from '../types';
import { DEFAULT_PERMISSIONS } from '../services/authService';

interface PermissionContextType {
    matrix: RolePermissionMatrix;
    loading: boolean;
    getPermission: (level: RoleLevel) => RolePermissionRule;
}

const defaultMatrix: RolePermissionMatrix = {
    0: { ...DEFAULT_PERMISSIONS, role_level: 0, logs_level: 'A', store_scope: 'GLOBAL', show_excel: true, view_peers: true, hide_perm_page: false, hide_audit_hall: false, hide_store_management: false },
    1: { ...DEFAULT_PERMISSIONS, role_level: 1 },
    2: { ...DEFAULT_PERMISSIONS, role_level: 2 },
    3: { ...DEFAULT_PERMISSIONS, role_level: 3 },
    4: { ...DEFAULT_PERMISSIONS, role_level: 4 },
    5: { ...DEFAULT_PERMISSIONS, role_level: 5 },
    6: { ...DEFAULT_PERMISSIONS, role_level: 6 },
    7: { ...DEFAULT_PERMISSIONS, role_level: 7 },
    8: { ...DEFAULT_PERMISSIONS, role_level: 8 },
    9: { ...DEFAULT_PERMISSIONS, role_level: 9 },
};

const PermissionContext = createContext<PermissionContextType>({
    matrix: defaultMatrix,
    loading: true,
    getPermission: (l) => defaultMatrix[l]
});

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [matrix, setMatrix] = useState<RolePermissionMatrix>(defaultMatrix);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isConfigured()) {
            setLoading(false);
            return;
        }

        const client = getSupabaseClient();
        if (!client) return;

        const fetchMatrix = async () => {
            const { data, error } = await client.from('role_permissions').select('*');
            if (!error && data && data.length > 0) {
                const newMatrix = { ...defaultMatrix };
                data.forEach((rule: RolePermissionRule) => {
                    newMatrix[rule.role_level] = rule;
                });
                setMatrix(newMatrix);
            }
            setLoading(false);
        };

        fetchMatrix();

        // Realtime Subscription
        const channel = client.channel('role_permissions_changes')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'role_permissions' },
                (payload) => {
                    const newRule = payload.new as RolePermissionRule;
                    setMatrix(prev => ({
                        ...prev,
                        [newRule.role_level]: newRule
                    }));
                }
            )
            .subscribe();

        return () => {
            client.removeChannel(channel);
        };
    }, []);

    const getPermission = (level: RoleLevel) => {
        return matrix[level] || defaultMatrix[level] || defaultMatrix[9];
    };

    return (
        <PermissionContext.Provider value={{ matrix, loading, getPermission }}>
            {children}
        </PermissionContext.Provider>
    );
};

export const usePermissionContext = () => useContext(PermissionContext);

export const useUserPermissions = (userRole: RoleLevel | undefined) => {
    const { getPermission } = usePermissionContext();
    return getPermission(userRole ?? 9);
};
