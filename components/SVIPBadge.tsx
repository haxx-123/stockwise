
import React from 'react';
import { RoleLevel } from '../types';

interface SVIPBadgeProps {
    name: string;
    roleLevel: RoleLevel | number;
    className?: string;
    showRoleLabel?: boolean;
}

export const SVIPBadge: React.FC<SVIPBadgeProps> = ({ name, roleLevel, className = '', showRoleLabel = true }) => {
    const level = Number(roleLevel);

    // SVIP Styles for 00 and 01
    if (level === 0) {
        return (
            <div className={`relative overflow-hidden rounded-xl p-0.5 ${className}`}>
                {/* Background: Vibrant Red Gradient 45deg */}
                <div className="absolute inset-0 bg-[linear-gradient(45deg,#ef4444,#f472b6,#ec4899)] opacity-90"></div>
                
                <div className="relative bg-white/10 backdrop-blur-sm rounded-lg p-3 flex flex-col items-center justify-center border border-white/20">
                    {showRoleLabel && <span className="text-[10px] font-black tracking-widest text-white uppercase mb-1 drop-shadow-md">SVIP • 00</span>}
                    {/* Name: Vibrant Purple Gradient Text */}
                    <span className="text-xl font-bold bg-gradient-to-br from-purple-200 via-fuchsia-100 to-cyan-100 bg-clip-text text-transparent drop-shadow-[0_2px_2px_rgba(0,0,0,0.3)]">
                        {name}
                    </span>
                </div>
            </div>
        );
    }

    if (level === 1) {
        return (
            <div className={`relative overflow-hidden rounded-xl p-0.5 ${className}`}>
                {/* Background: Vibrant Purple Gradient 45deg */}
                <div className="absolute inset-0 bg-[linear-gradient(45deg,#9333ea,#c084fc,#a855f7)] opacity-90"></div>
                
                <div className="relative bg-white/10 backdrop-blur-sm rounded-lg p-3 flex flex-col items-center justify-center border border-white/20">
                    {showRoleLabel && <span className="text-[10px] font-black tracking-widest text-white uppercase mb-1 drop-shadow-md">SVIP • 01</span>}
                    {/* Name: Vibrant Gold Gradient Text */}
                    <span className="text-xl font-bold bg-gradient-to-br from-[#FFD700] via-[#FFA500] to-[#FFFFE0] bg-clip-text text-transparent drop-shadow-[0_2px_2px_rgba(0,0,0,0.3)]">
                        {name}
                    </span>
                </div>
            </div>
        );
    }

    // Default Fallback for normal users (if this component is used)
    return (
        <div className={`flex items-center gap-2 p-2 rounded-lg bg-gray-100 dark:bg-gray-800 border dark:border-gray-700 ${className}`}>
            <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-xs font-bold text-gray-700 dark:text-gray-300">
                {String(level).padStart(2,'0')}
            </div>
            <span className="font-bold text-gray-800 dark:text-gray-200">{name}</span>
        </div>
    );
};
