
import React from 'react';
import { RoleLevel } from '../types';

export const UsernameBadge = ({ name, roleLevel }: { name: string, roleLevel: RoleLevel | number }) => {
    const level = Number(roleLevel);
    let className = "truncate "; // Base class

    // Strict Requirements
    // Level 00: Bright Purple -> Deep Pink -> Cyan (45deg)
    if (level === 0) { 
        return (
            <span className="font-extrabold bg-gradient-to-br from-purple-500 via-pink-600 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_2px_rgba(168,85,247,0.4)]">
                {name}
            </span>
        );
    } 
    // Level 01: Gold -> Orange -> Light Yellow (45deg, metallic)
    else if (level === 1) { 
        return (
             <span className="font-extrabold bg-gradient-to-br from-[#FFD700] via-[#FFA500] to-[#FFFFE0] bg-clip-text text-transparent drop-shadow-[0_0_2px_rgba(234,179,8,0.6)]">
                {name}
            </span>
        );
    } 
    // Level 02: Bright Blue
    else if (level === 2) { 
        className += "text-[#00BFFF] font-bold";
    } 
    // 03-05: Pale Colors (Teal, Olive, DarkSlate)
    else if (level === 3) { 
        className += "text-teal-500 dark:text-teal-400 font-bold opacity-90";
    } else if (level === 4) { 
        className += "text-lime-600 dark:text-lime-400 font-bold opacity-90";
    } else if (level === 5) { 
        className += "text-slate-500 dark:text-slate-400 font-bold opacity-90";
    } 
    // 06+: Black
    else { 
        className += "text-black dark:text-white font-bold";
    }

    return <span className={className}>{name}</span>;
};
