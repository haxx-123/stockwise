import React, { useState, useEffect, useRef } from 'react';
import { Icons } from './Icons';
import { Store } from '../types';
import { dataService } from '../services/dataService';
import { authService } from '../services/authService';

interface StoreSwitcherProps {
    currentStore: string;
    onChange: (storeId: string) => void;
}

export const StoreSwitcher: React.FC<StoreSwitcherProps> = ({ currentStore, onChange }) => {
    const [stores, setStores] = useState<Store[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const user = authService.getCurrentUser();

    useEffect(() => {
        const load = async () => {
            const all = await dataService.getStores();
            setStores(all);
        };
        load();
        
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedStore = stores.find(s => s.id === currentStore);
    const isAll = currentStore === 'all';

    const handleSelect = (id: string) => {
        onChange(id);
        setIsOpen(false);
    };

    return (
        <div className="px-4 pt-4 relative z-20" ref={containerRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 px-4 flex items-center justify-between shadow-lg shadow-blue-200 dark:shadow-none transition-all active:scale-95 group"
            >
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="p-1.5 bg-white/20 rounded-lg shrink-0">
                        <Icons.Store size={18} className="text-white" />
                    </div>
                    <div className="flex flex-col items-start truncate">
                        <span className="text-[10px] uppercase text-blue-100 font-bold tracking-wider">当前门店</span>
                        <span className="font-bold text-sm truncate w-full text-left">
                            {isAll ? '所有门店 (All)' : selectedStore?.name || '未知门店'}
                        </span>
                    </div>
                </div>
                <Icons.ChevronDown size={16} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-4 right-4 mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden animate-scale-in origin-top z-30">
                    <div className="max-h-64 overflow-y-auto custom-scrollbar p-1">
                        {/* 'All Stores' Option - Only if GLOBAL scope */}
                        {user?.permissions.store_scope === 'GLOBAL' && (
                             <button 
                                onClick={() => handleSelect('all')}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 flex items-center justify-between ${isAll ? 'bg-blue-50 text-blue-600 font-bold dark:bg-blue-900/20 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                            >
                                <span>所有门店 (All)</span>
                                {isAll && <div className="w-2 h-2 rounded-full bg-blue-500"></div>}
                            </button>
                        )}
                        
                        {stores.length === 0 && <div className="p-3 text-center text-xs text-gray-400">无可用门店</div>}

                        {stores.map(store => (
                            <button 
                                key={store.id}
                                onClick={() => handleSelect(store.id)}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 flex items-center justify-between ${currentStore === store.id ? 'bg-blue-50 text-blue-600 font-bold dark:bg-blue-900/20 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                            >
                                <span className="truncate">{store.name}</span>
                                {currentStore === store.id && <div className="w-2 h-2 rounded-full bg-blue-500"></div>}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};