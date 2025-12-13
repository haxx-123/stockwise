


import React, { useState, useEffect } from 'react';
import { getSupabaseConfig, saveSupabaseConfig } from '../services/supabaseClient';
import { Icons } from '../components/Icons';

export const Settings: React.FC<{ subPage?: string; onThemeChange?: (theme: string) => void }> = ({ subPage = 'config', onThemeChange }) => {
    const [configUrl, setConfigUrl] = useState('');
    const [configKey, setConfigKey] = useState('');
    const [currentTheme, setCurrentTheme] = useState(localStorage.getItem('sw_theme') || 'light');

    useEffect(() => {
        const config = getSupabaseConfig();
        setConfigUrl(config.url);
        setConfigKey(config.key);
    }, [subPage]);

    const handleSaveConfig = () => {
        saveSupabaseConfig(configUrl.trim(), configKey.trim());
        window.location.reload(); 
    };

    const handleThemeClick = (theme: string) => {
        setCurrentTheme(theme);
        if (onThemeChange) onThemeChange(theme);
    };
    
    const SQL_CODE = `
    -- StockWise Setup SQL
    create table if not exists users (
      id uuid primary key,
      username text unique not null,
      password text,
      role_level int default 9,
      is_archived boolean default false
    );
    -- ... (Full schema provided in docs) ...
    `;

    if (subPage === 'config') {
        return (
            <div className="p-4 md:p-8 max-w-4xl mx-auto dark:text-gray-100 flex flex-col gap-6 animate-fade-in-up">
                <h1 className="text-3xl font-black mb-2 tracking-tight">连接配置</h1>
                <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl shadow-lg border border-gray-100 dark:border-gray-700 flex flex-col gap-6">
                    <div className="flex flex-col gap-4 w-full">
                        <div className="w-full">
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Supabase Project URL</label>
                            <input value={configUrl} onChange={(e) => setConfigUrl(e.target.value)} className="w-full rounded-2xl bg-gray-50 dark:bg-gray-900 border-0 p-4 outline-none dark:text-white focus:ring-2 focus:ring-blue-500 transition-shadow" />
                        </div>
                        <div className="w-full">
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Supabase Anon Key</label>
                            <input type="password" value={configKey} onChange={(e) => setConfigKey(e.target.value)} className="w-full rounded-2xl bg-gray-50 dark:bg-gray-900 border-0 p-4 outline-none dark:text-white focus:ring-2 focus:ring-blue-500 transition-shadow" />
                        </div>
                        <button onClick={handleSaveConfig} className="w-full bg-blue-600 text-white px-8 py-4 rounded-2xl hover:bg-blue-700 font-bold mt-4 shadow-xl shadow-blue-500/30 transition-transform active:scale-95">保存配置</button>
                    </div>
                    
                    <div className="mt-8 border-t pt-8 dark:border-gray-700">
                        <h3 className="font-bold mb-4">SQL 代码 (复制并在 Supabase SQL Editor 运行)</h3>
                        <div className="bg-gray-900 text-gray-300 p-4 rounded-xl font-mono text-xs overflow-x-auto relative group">
                            <pre>{SQL_CODE}</pre>
                            <button onClick={()=>navigator.clipboard.writeText(SQL_CODE)} className="absolute top-2 right-2 bg-white text-black px-2 py-1 rounded text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">Copy</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (subPage === 'theme') {
        return (
            <div className="p-8 max-w-4xl mx-auto animate-fade-in-up">
                 <h1 className="text-3xl font-black mb-8 dark:text-white">应用主题</h1>
                 <div className="grid grid-cols-3 gap-6">
                     <button onClick={() => handleThemeClick('light')} className={`h-40 rounded-3xl border-4 font-bold text-xl flex flex-col items-center justify-center transition-all ${currentTheme==='light' ? 'bg-white border-blue-500 text-blue-600 shadow-xl scale-105' : 'bg-gray-100 border-transparent text-gray-400'}`}>
                         <span>☀️ 浅色</span>
                     </button>
                     <button onClick={() => handleThemeClick('dark')} className={`h-40 rounded-3xl border-4 font-bold text-xl flex flex-col items-center justify-center transition-all ${currentTheme==='dark' ? 'bg-gray-800 border-blue-500 text-white shadow-xl scale-105' : 'bg-gray-200 border-transparent text-gray-500'}`}>
                         <span>🌙 深色</span>
                     </button>
                     <button onClick={() => handleThemeClick('prism')} className={`h-40 rounded-3xl border-4 font-bold text-xl flex flex-col items-center justify-center transition-all ${currentTheme==='prism' ? 'bg-[#f5f5f7] border-black text-black shadow-xl scale-105' : 'bg-gray-100 border-transparent text-gray-400'}`}>
                         <span>△ 棱镜</span>
                     </button>
                 </div>
                 <p className="mt-6 text-gray-500">棱镜色: 独有主题颜色，符合人因工程学，缓解视觉压力。</p>
            </div>
        );
    }

    return null;
};