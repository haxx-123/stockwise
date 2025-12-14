
import React, { useState, useEffect, useRef } from 'react';
import { Icons } from './Icons';
import { Product } from '../types';
import { matchProduct } from '../utils/searchHelper';
import { BarcodeScanner } from './BarcodeScanner';

interface SmartSearchProps {
    products: Product[]; // Used for autocomplete suggestions
    categories: string[];
    onSearch: (query: string) => void;
    onCategoryChange: (category: string) => void;
    onScan?: (code: string) => void;
    placeholder?: string;
}

export const SmartSearch: React.FC<SmartSearchProps> = ({ 
    products, 
    categories, 
    onSearch, 
    onCategoryChange, 
    onScan,
    placeholder = "搜索商品 / 拼音 / 扫码..."
}) => {
    const [query, setQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('ALL');
    const [showScanner, setShowScanner] = useState(false);
    const [suggestions, setSuggestions] = useState<Product[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    
    // Scanner Gun Buffer
    const scanBuffer = useRef('');
    const lastKeyTime = useRef(0);

    // --- 1. Desktop Scanner Gun Listener ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if user is typing in an input (except if it looks like a fast scan)
            const target = e.target as HTMLElement;
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
            
            const now = Date.now();
            const isFast = (now - lastKeyTime.current) < 50; // Scanner guns imply very fast typing
            lastKeyTime.current = now;

            if (e.key === 'Enter') {
                if (scanBuffer.current.length > 3) {
                    // It's a scan!
                    handleScan(scanBuffer.current);
                    scanBuffer.current = '';
                    if (isInput) e.preventDefault(); // Prevent submitting form if focused
                } else {
                    scanBuffer.current = '';
                }
            } else {
                // If strictly standard key, add to buffer
                if (e.key.length === 1) {
                    scanBuffer.current += e.key;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleScan = (code: string) => {
        // 1. Try to find product by SKU
        const match = products.find(p => p.sku === code);
        if (match) {
            setQuery(match.name);
            onSearch(match.name); // Search by name to show results
        } else {
            setQuery(code);
            onSearch(code);
        }
        if (onScan) onScan(code);
    };

    // --- 2. Input Change & Autocomplete ---
    const handleInputChange = (val: string) => {
        setQuery(val);
        onSearch(val);
        
        if (val.trim().length > 0) {
            const matches = products.filter(p => matchProduct(p, val)).slice(0, 5);
            setSuggestions(matches);
            setShowSuggestions(true);
        } else {
            setShowSuggestions(false);
        }
    };

    const selectSuggestion = (p: Product) => {
        setQuery(p.name);
        onSearch(p.name);
        setShowSuggestions(false);
    };

    return (
        <div className="flex flex-col md:flex-row gap-3 relative z-20">
            {/* Category Select */}
            <div className="relative min-w-[120px]">
                <select 
                    value={selectedCategory}
                    onChange={(e) => { setSelectedCategory(e.target.value); onCategoryChange(e.target.value); }}
                    className="w-full h-full bg-white/50 dark:bg-gray-800 border-none rounded-xl px-4 py-3 font-bold text-sm outline-none appearance-none cursor-pointer"
                >
                    <option value="ALL">📦 全部分类</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <Icons.ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" size={16}/>
            </div>

            {/* Search Input */}
            <div className="flex-1 relative">
                <div className="glass-panel p-1 rounded-xl flex items-center gap-2 bg-white/50 dark:bg-gray-800 border-transparent">
                    <Icons.Scan size={20} className="ml-3 text-gray-400"/>
                    <input 
                        value={query} 
                        onChange={e => handleInputChange(e.target.value)}
                        onFocus={() => query && setShowSuggestions(true)}
                        onBlur={() => setTimeout(()=>setShowSuggestions(false), 200)} // Delay to allow click
                        placeholder={placeholder} 
                        className="bg-transparent border-none w-full py-2 font-bold outline-none placeholder-gray-400 text-black dark:text-white"
                    />
                    {query && (
                        <button onClick={()=>handleInputChange('')} className="p-1 mr-1 text-gray-400 hover:text-red-500">
                            <Icons.Minus size={16} className="rotate-45" /> {/* X icon */}
                        </button>
                    )}
                </div>

                {/* Autocomplete Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden z-50 animate-fade-in">
                        {suggestions.map(p => (
                            <div 
                                key={p.id} 
                                onClick={() => selectSuggestion(p)}
                                className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-0"
                            >
                                <div className="font-bold text-sm text-black dark:text-white">{p.name}</div>
                                <div className="text-xs text-gray-500 flex justify-between">
                                    <span>{p.pinyin ? `PY: ${p.pinyin}` : ''}</span>
                                    <span>SKU: {p.sku || '-'}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Scan Button (Mobile) */}
            <button onClick={() => setShowScanner(true)} className="bg-black text-white p-3 rounded-xl hover:bg-gray-800 transition-colors shadow-lg md:hidden">
                <Icons.Camera size={20}/>
            </button>

            {/* Scanner Modal */}
            {showScanner && (
                <BarcodeScanner 
                    onScan={(code) => {
                        handleScan(code);
                        setShowScanner(false);
                    }}
                    onClose={() => setShowScanner(false)}
                    title="搜索商品扫码"
                />
            )}
        </div>
    );
};
