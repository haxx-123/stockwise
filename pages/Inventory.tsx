
import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from '../components/Icons';
import { dataService } from '../services/dataService';
import { AggregatedStock, Product } from '../types';
import { formatUnit } from '../utils/formatters';
import { SmartSearch } from '../components/SmartSearch';
import { matchProduct, getUniqueCategories } from '../utils/searchHelper';
import { createPortal } from 'react-dom';

declare const window: any;

// Define Props for InventoryTable
export interface InventoryTableProps {
    data: AggregatedStock[];
    onRefresh: () => void;
    currentStore: string;
    compact?: boolean;
    deleteMode?: boolean;
    selectedToDelete?: Set<string>;
    selectedBatchIds?: Set<string>;
    onMobileClick?: (item: AggregatedStock) => void;
    mobileExpanded?: boolean;
    isMobileOverlay?: boolean;
    isViewer?: boolean; // Prop to hide actions
}

export const InventoryTable: React.FC<InventoryTableProps> = ({ 
    data, onRefresh, currentStore, compact, deleteMode, 
    selectedToDelete, selectedBatchIds, onMobileClick, 
    mobileExpanded, isMobileOverlay, isViewer 
}) => {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [billModal, setBillModal] = useState<{batch:any, product:any} | null>(null);
    // Image Modal State
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    // If mobileExpanded is true, expand all (for detail view)
    useEffect(() => {
        if (mobileExpanded) {
            const allIds = new Set(data.map(i => i.product.id));
            setExpanded(allIds);
        }
    }, [mobileExpanded, data]);

    const handleRowClick = (item: AggregatedStock, e: React.MouseEvent) => {
        // Prevent row expansion if clicking image
        if ((e.target as HTMLElement).closest('.img-preview')) return;

        // Intelligent View Switching
        if (window.innerWidth < 768) {
            if (onMobileClick) onMobileClick(item);
        } else {
            const newSet = new Set(expanded);
            if(newSet.has(item.product.id)) newSet.delete(item.product.id); else newSet.add(item.product.id);
            setExpanded(newSet);
        }
    };

    const BillModal = () => {
        if (!billModal) return null;
        const [type, setType] = useState<'IN'|'OUT'>('OUT');
        const [qty, setQty] = useState(0);
        const [unit, setUnit] = useState('BIG');

        const handleSubmit = async () => {
            const ratio = billModal.product.split_ratio || 1;
            const finalQty = unit === 'BIG' ? qty * ratio : qty;
            try {
                await dataService.updateStock(billModal.product.id, billModal.batch.store_id, finalQty, type, '快速开单', billModal.batch.id);
                setBillModal(null);
                onRefresh();
            } catch(e:any) { alert(e.message); }
        };

        return createPortal(
            <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-scale-in border border-white/20">
                    <h3 className="text-xl font-black mb-6 dark:text-white">库存操作</h3>
                    <div className="flex bg-gray-100 dark:bg-gray-700 rounded-2xl p-1 mb-6">
                        <button onClick={()=>setType('IN')} className={`flex-1 py-3 rounded-xl font-bold transition-all ${type==='IN'?'bg-white dark:bg-gray-600 shadow text-green-600 dark:text-green-400':'text-gray-500 dark:text-gray-400'}`}>入库</button>
                        <button onClick={()=>setType('OUT')} className={`flex-1 py-3 rounded-xl font-bold transition-all ${type==='OUT'?'bg-white dark:bg-gray-600 shadow text-red-600 dark:text-red-400':'text-gray-500 dark:text-gray-400'}`}>出库</button>
                    </div>
                    <div className="flex gap-3 mb-6">
                        <input type="number" placeholder="数量" onChange={e=>setQty(Number(e.target.value))} className="flex-1 p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl font-bold text-xl outline-none dark:text-white"/>
                        <select onChange={e=>setUnit(e.target.value)} className="bg-gray-50 dark:bg-gray-900 rounded-2xl px-4 font-bold outline-none dark:text-white">
                            <option value="BIG">{billModal.product.unit_name || '整'}</option>
                            <option value="SMALL">{billModal.product.split_unit_name || '散'}</option>
                        </select>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={()=>setBillModal(null)} className="flex-1 py-4 bg-gray-200 dark:bg-gray-700 rounded-2xl font-bold dark:text-white hover:opacity-80">取消</button>
                        <button onClick={handleSubmit} className="flex-1 py-4 bg-black text-white rounded-2xl font-bold shadow-lg hover:scale-[1.02] active:scale-95 transition-all">确定</button>
                    </div>
                </div>
            </div>,
            document.body
        );
    };

    return (
        <div className="space-y-4">
            {!compact && !isMobileOverlay && (
                <div className="hidden md:flex px-6 py-2 font-bold text-gray-500 text-sm">
                    <div className="w-16">图片</div>
                    <div className="w-1/3">商品名称 / 规格</div>
                    <div className="w-1/3 text-center">分类 / SKU</div>
                    <div className="w-1/3 text-right">当前库存总量</div>
                    <div className="w-8"></div>
                </div>
            )}

            {data.map((item, idx) => (
                <div 
                    key={item.product.id} 
                    className={`glass-panel rounded-2xl overflow-hidden animate-slide-up opacity-0 ${compact ? 'border border-gray-100' : 'shadow-sm hover:shadow-md transition-shadow'}`}
                    style={{ animationDelay: `${Math.min(idx * 50, 600)}ms` }}
                >
                    <div className="p-5 flex flex-col md:flex-row md:items-center cursor-pointer hover:bg-white/10 transition-colors" 
                        onClick={(e) => handleRowClick(item, e)}
                    >
                        {/* Image Thumbnail */}
                        <div className="hidden md:block w-16 mr-6 img-preview">
                            {item.product.image_url ? (
                                <img 
                                    src={item.product.image_url} 
                                    alt="thumb" 
                                    className="w-14 h-14 rounded-2xl object-cover bg-gray-100 border border-gray-200 hover:scale-110 transition-transform cursor-zoom-in shadow-sm"
                                    onClick={()=>setPreviewImage(item.product.image_url || '')}
                                />
                            ) : (
                                <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-300 dark:text-gray-500">
                                    <Icons.Image size={24}/>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-between items-center w-full md:w-auto md:flex-1 md:grid md:grid-cols-3 md:gap-4">
                            <div className="md:col-span-1 flex items-center gap-4">
                                {/* Mobile Image */}
                                <div className="md:hidden img-preview">
                                    {item.product.image_url ? (
                                        <img 
                                            src={item.product.image_url} 
                                            className="w-12 h-12 rounded-xl object-cover bg-gray-100 border border-gray-200 shadow-sm"
                                            onClick={()=>setPreviewImage(item.product.image_url || '')}
                                        />
                                    ) : (
                                        <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-300"><Icons.Image size={20}/></div>
                                    )}
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg leading-tight dark:text-white">{item.product.name}</h3>
                                    <p className="text-xs opacity-60 md:hidden mt-1">SKU: {item.product.sku}</p>
                                </div>
                            </div>
                            
                            <div className="hidden md:block text-center text-sm font-medium opacity-60 dark:text-gray-300">
                                {item.product.category || '-'} <span className="mx-2 opacity-30">|</span> {item.product.sku || '-'}
                            </div>

                            <div className="text-right md:col-span-1">
                                <span className="font-black text-xl text-blue-600 dark:text-blue-400 tracking-tight">
                                    {formatUnit(item.totalQuantity, item.product)}
                                </span>
                            </div>
                        </div>
                        
                        <div className="hidden md:block ml-6">
                            <Icons.ChevronDown className={`transition-transform duration-300 ${expanded.has(item.product.id)?'rotate-180':''}`}/>
                        </div>
                    </div>

                    {expanded.has(item.product.id) && (
                        <div className="bg-black/5 dark:bg-black/20 p-4 border-t border-black/5 space-y-3 animate-fade-in">
                            {item.batches.map(b => (
                                <div key={b.id} className="bg-white/80 dark:bg-gray-800/80 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-center gap-3 shadow-sm border border-white/20">
                                    <div className="flex-1 w-full sm:w-auto">
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/40 px-3 py-1 rounded-lg">
                                                {b.batch_number}
                                            </span>
                                            {b.expiry_date && (
                                                <span className="text-xs font-bold text-pink-600 dark:text-pink-300 bg-pink-50 dark:bg-pink-900/40 px-3 py-1 rounded-lg">
                                                    Exp: {new Date(b.expiry_date).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs font-medium text-gray-400 pl-1">{b.store_name || '未知门店'}</div>
                                    </div>
                                    
                                    <div className="flex items-center justify-between w-full sm:w-auto gap-6">
                                        <div className="font-bold text-lg dark:text-white">{formatUnit(b.quantity, item.product)}</div>
                                        {!isViewer && (
                                            <div className="flex gap-2">
                                                <button onClick={()=>setBillModal({batch:b, product:item.product})} className="px-4 py-2 bg-black text-white rounded-xl text-xs font-bold shadow-lg hover:scale-105 active:scale-95 transition-all">开单</button>
                                                <button className="px-4 py-2 bg-white dark:bg-gray-700 border border-black/5 dark:border-white/10 rounded-xl text-xs font-bold hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">调整</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
            {billModal && <BillModal/>}
            
            {/* Image Preview Modal */}
            {previewImage && createPortal(
                <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-4 animate-fade-in backdrop-blur-md" onClick={()=>setPreviewImage(null)}>
                    <img src={previewImage} className="max-w-full max-h-full rounded-3xl shadow-2xl animate-scale-in" />
                    <button className="absolute top-6 right-6 p-4 bg-white/20 text-white rounded-full hover:bg-white/30 transition-colors"><Icons.Minus size={24}/></button>
                </div>,
                document.body
            )}
        </div>
    );
};

export const Inventory: React.FC<{currentStore: string, isViewer?: boolean}> = ({ currentStore, isViewer }) => {
    const [data, setData] = useState<AggregatedStock[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [mobileDetailItem, setMobileDetailItem] = useState<AggregatedStock | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('ALL');

    useEffect(() => { loadData(); }, [currentStore]);

    const loadData = async () => {
        const [p, b] = await Promise.all([
            dataService.getProducts(false, currentStore),
            dataService.getBatches(currentStore==='all'?undefined:currentStore)
        ]);
        setProducts(p);
        const map = new Map();
        p.forEach(prod => map.set(prod.id, { product: prod, totalQuantity: 0, batches: [] }));
        b.forEach(batch => {
            if(map.has(batch.product_id)) {
                const entry = map.get(batch.product_id);
                entry.totalQuantity += batch.quantity;
                entry.batches.push(batch);
            }
        });
        setData(Array.from(map.values()));
    };

    const categories = useMemo(() => getUniqueCategories(products), [products]);
    const filteredData = useMemo(() => {
        return data.filter(item => {
            if (categoryFilter !== 'ALL' && item.product.category !== categoryFilter) return false;
            return matchProduct(item.product, searchQuery);
        });
    }, [data, searchQuery, categoryFilter]);

    // ... (Keep existing Export listeners)

    return (
        <div className="p-4 md:p-8 space-y-8 pb-24 max-w-7xl mx-auto">
            <SmartSearch 
                products={products}
                categories={categories}
                onSearch={setSearchQuery}
                onCategoryChange={setCategoryFilter}
            />
            <InventoryTable 
                data={filteredData} 
                onRefresh={loadData} 
                currentStore={currentStore} 
                isViewer={isViewer}
                onMobileClick={(item) => setMobileDetailItem(item)}
            />
            {mobileDetailItem && createPortal(
                <div className="fixed inset-0 bg-gray-50 dark:bg-gray-900 z-[200] overflow-y-auto animate-slide-up flex flex-col">
                    <div className="sticky top-0 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between z-10">
                        <div className="flex items-center gap-3">
                            <button onClick={()=>setMobileDetailItem(null)} className="p-3 bg-gray-100 dark:bg-gray-700 rounded-full shadow hover:bg-gray-200 transition-colors">
                                <Icons.ArrowRightLeft className="rotate-180" size={20}/>
                            </button>
                            <h2 className="text-xl font-black truncate max-w-[200px] dark:text-white">{mobileDetailItem.product.name}</h2>
                        </div>
                    </div>
                    <div className="p-6 flex-1">
                        {mobileDetailItem.product.image_url && (
                            <img src={mobileDetailItem.product.image_url} className="w-full h-56 object-cover rounded-3xl mb-8 shadow-lg bg-white" />
                        )}
                        <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-lg mb-8 border border-gray-100 dark:border-gray-700">
                            <div className="text-center mb-6">
                                <div className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">总库存量</div>
                                <div className="text-5xl font-black text-blue-600 dark:text-blue-400 tracking-tighter">
                                    {formatUnit(mobileDetailItem.totalQuantity, mobileDetailItem.product)}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/30 p-5 rounded-2xl">
                                <div>分类: {mobileDetailItem.product.category || '-'}</div>
                                <div>SKU: {mobileDetailItem.product.sku || '-'}</div>
                                <div>单位: {mobileDetailItem.product.unit_name}</div>
                                <div>拆零: 1{mobileDetailItem.product.unit_name}={mobileDetailItem.product.split_ratio}{mobileDetailItem.product.split_unit_name}</div>
                            </div>
                        </div>
                        <h3 className="font-bold text-xl mb-4 pl-4 border-l-4 border-black dark:border-white dark:text-white">批次明细</h3>
                        <InventoryTable 
                            data={[mobileDetailItem]} 
                            onRefresh={loadData} 
                            currentStore={currentStore}
                            isViewer={isViewer}
                            mobileExpanded={true} 
                            isMobileOverlay={true}
                            compact={true}
                        />
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
