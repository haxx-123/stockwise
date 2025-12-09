
import React from 'react';
import { RoleLevel } from '../types';

export const UsernameBadge = ({ name, roleLevel }: { name: string, roleLevel: RoleLevel | number }) => {
    const level = Number(roleLevel);
    let className = "truncate font-bold ";

    // Strict Color Rules
    if (level === 0) { 
        // 00: Vibrant Purple Text (Purple -> Pink -> Cyan 45deg)
        // Note: The requirement for SVIP badge is specific, but for just text we use the vibrant purple requested.
        className += "bg-[linear-gradient(45deg,#a855f7,#ec4899,#06b6d4)] bg-clip-text text-transparent drop-shadow-[0_1px_1px_rgba(168,85,247,0.3)]";
    } else if (level === 1) { 
        // 01: Vibrant Gold Text (Gold -> Orange -> Yellow 45deg)
        className += "bg-[linear-gradient(45deg,#FFD700,#FFA500,#FFFFE0)] bg-clip-text text-transparent drop-shadow-[0_1px_1px_rgba(234,179,8,0.4)]";
    } else if (level === 2) { 
        // 02: Bright Blue
        className += "text-[#00BFFF]";
    } else if (level === 3) { 
        className += "text-teal-600 dark:text-teal-400";
    } else if (level === 4) { 
        className += "text-lime-700 dark:text-lime-400";
    } else if (level === 5) { 
        className += "text-slate-600 dark:text-slate-400";
    } else { 
        // 06+: Black
        className += "text-black dark:text-white";
    }

    return <span className={className}>{name}</span>;
};
