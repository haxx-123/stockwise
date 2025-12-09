
import React from 'react';
import { RoleLevel } from '../types';

export const UsernameBadge = ({ name, roleLevel }: { name: string, roleLevel: RoleLevel | number }) => {
    const level = Number(roleLevel);
    let className = "truncate "; // Base class

    if (level === 0) { // 00 - Purple Gradient (VIP)
        className += "bg-gradient-to-br from-purple-600 via-fuchsia-500 to-cyan-500 bg-clip-text text-transparent font-extrabold drop-shadow-[0_1px_1px_rgba(147,51,234,0.3)]";
    } else if (level === 1) { // 01 - Gold Gradient (VIP)
        // Gold to Orange to Light Yellow
        className += "bg-gradient-to-br from-[#FFD700] via-[#FFA500] to-[#FCEE21] bg-clip-text text-transparent font-extrabold drop-shadow-[0_1px_1px_rgba(234,179,8,0.4)]";
    } else if (level === 2) { // 02 - Bright Blue
        className += "text-[#00BFFF] font-bold";
    } else if (level === 3) { // 03 - Teal
        className += "text-teal-600 dark:text-teal-400 font-bold";
    } else if (level === 4) { // 04 - Olive
        className += "text-lime-700 dark:text-lime-400 font-bold";
    } else if (level === 5) { // 05 - Dark Slate
        className += "text-slate-600 dark:text-slate-400 font-bold";
    } else { // 06-09 - Black
        className += "text-black dark:text-white font-bold";
    }

    return <span className={className}>{name}</span>;
};
