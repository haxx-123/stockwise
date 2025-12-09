
import React from 'react';
import { RoleLevel } from '../types';

interface SVIPBadgeProps {
    name: string;
    roleLevel: RoleLevel | number;
    size?: 'sm' | 'md' | 'lg';
}

export const SVIPBadge: React.FC<SVIPBadgeProps> = ({ name, roleLevel, size = 'md' }) => {
    const level = Number(roleLevel);

    // Only for 00 and 01
    if (level !== 0 && level !== 1) {
        return <span className="font-bold text-gray-800 dark:text-white">{name}</span>;
    }

    const containerClasses = size === 'lg' ? 'px-6 py-4 text-2xl' : (size === 'sm' ? 'px-2 py-1 text-xs' : 'px-4 py-2 text-sm');
    
    // Level 00: Red BG, Purple Name
    if (level === 0) {
        return (
            <div className={`inline-flex items-center gap-2 rounded-xl shadow-lg border border-red-300/50 bg-gradient-to-br from-red-500 via-rose-500 to-pink-500 ${containerClasses}`}>
                <span className="font-extrabold text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.3)] italic tracking-wider">SVIP</span>
                <span className="font-extrabold bg-gradient-to-br from-[#d8b4fe] via-[#f0abfc] to-[#22d3ee] bg-clip-text text-transparent drop-shadow-[0_1px_4px_rgba(147,51,234,0.6)]">
                    {name}
                </span>
            </div>
        );
    }

    // Level 01: Purple BG, Gold Name
    return (
        <div className={`inline-flex items-center gap-2 rounded-xl shadow-lg border border-purple-300/50 bg-gradient-to-br from-purple-600 via-violet-600 to-indigo-600 ${containerClasses}`}>
            <span className="font-extrabold text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.3)] italic tracking-wider">SVIP</span>
            <span className="font-extrabold bg-gradient-to-br from-[#FFD700] via-[#FFA500] to-[#FFFFE0] bg-clip-text text-transparent drop-shadow-[0_1px_4px_rgba(234,179,8,0.8)]">
                {name}
            </span>
        </div>
    );
};
