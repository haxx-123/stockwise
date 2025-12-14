

import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from '../components/Icons';
import { dataService } from '../services/dataService';
import { Batch, Product, Store, AggregatedStock } from '../types';
import { formatUnit, generatePageSummary } from '../utils/formatters';
import { uploadImage } from '../utils/imageUtils';

declare const window: any;

// --- INDEPENDENT MODALS ---

const AdjustProductModal = ({ product, onClose, onSave }: any) => {
    const [form, setForm] = useState({
        name: product.name, sku: product.sku || '', category: product.category || '',
        unitName: product.unit_name || '整', splitName: product.split_unit_name || '散', ratio: product.split_ratio || 1,
        imageUrl: product.image_url || ''
    });

    const handleImg = async (e: any) => {
        if(e.target.files[0]) {
            const url = await uploadImage(e.target.files[0]);
            if(url) setForm({...form, imageUrl: url});
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="glass-panel w-full max-w-lg rounded-3xl p-6 flex flex-col max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-black mb-4">调整商品信息</h2>
                <div className="space-y-4">
                    <div className="flex gap-4">
                        <div className="w-24 h-24 bg-white/10 rounded-xl flex items-center justify-center overflow-hidden border border-white/20 relative">
                            {form.imageUrl ? <img src={form.imageUrl} className="w-full h-full object-cover"/> : <Icons.Image size={32}/>}
                            <input type="file" onChange={handleImg} className="absolute inset-0 opacity-0 cursor-pointer"/>
                        </div>
                        <div className="flex-1 space-y-2">
                            <input value={form.name} onChange={e=>setForm({...form, name: e.target.value})} placeholder="商品名称" className="w-full p-2 rounded-lg"/>
                            <input value={form.category} onChange={e=>setForm({...form, category: e.target.value})} placeholder="类别" className="w-full p-2 rounded-lg"/>
                        </div>
                    </div>
                    <input value={form.sku} onChange={e=>setForm({...form, sku: e.target.value})} placeholder="SKU" className="w-full p-2 rounded-lg"/>
                    <div className="grid grid-cols-3 gap-2">
                        <input value={form.unitName} onChange={e=>setForm({...form, unitName: e.target.value})} placeholder="大单位 (整)" className="p-2 rounded-lg"/>
                        <input value={form.splitName} onChange={e=>setForm({...form, splitName: e.target.value})} placeholder="小单位 (散)" className="p-2 rounded-lg"/>
                        <input type="number" value={form.ratio} onChange={e=>setForm({...form, ratio: Number(e.target.value)})} placeholder="换算比" className="p-2 rounded-lg"/>
                    </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20">取消</button>
                    <button onClick={()=>onSave(form)} className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold">保存</button>
                </div>
            </div>
        </div>
    );
};

const AdjustBatchModal = ({ batch, product, onClose, onSave }: any) => {
    const ratio = product.split_ratio || 1;
    const [form, setForm] = useState({
        qtyBig: Math.floor(batch.quantity / ratio),
        qtySmall: batch.quantity % ratio,
        batchNo: batch.batch_number || '',
        expiry: batch.expiry_date ? batch.expiry_date.split('T')[0] : '',
        remark: batch.remark || ''
    });

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="glass-panel w-full max-w-md rounded-3xl p-6">
                <h2 className="text-xl font-black mb-4">调整批次库存</h2>
                <div className="space-y-4">
                    <div className="bg-white/5 p-3 rounded-xl mb-2 text-sm">
                        {product.name} <span className="opacity-50">({batch.batch_number})</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs opacity-70">整数 ({product.unit_name})</label>
                            <input type="number" value={form.qtyBig} onChange={e=>setForm({...form, qtyBig: Number(e.target.value)})} className="w-full p-2 rounded-lg font-bold text-lg"/>
                        </div>
                        <div>
                            <label className="text-xs opacity-70">散数 ({product.split_unit_name})</label>
                            <input type="number" value={form.qtySmall} onChange={e=>setForm({...form, qtySmall: Number(e.target.value)})} className="w-full p-2 rounded-lg font-bold text-lg"/>
                        </div>
                    </div>
                    <input value={form.batchNo} onChange={e=>setForm({...form, batchNo: e.target.value})} placeholder="批号" className="w-full p-2 rounded-lg"/>
                    <input type="date" value={form.expiry} onChange={e=>setForm({...form, expiry: e.target.value})} className="w-full p-2 rounded-lg"/>
                    <textarea value={form.remark} onChange={e=>setForm({...form, remark: e.target.value})} placeholder="备注" className="w-full p-2 rounded-lg h-20"/>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20">取消</button>
                    <button onClick={()=>onSave(form)} className="px-4 py-2 rounded-xl bg-green-600 text-white font-bold">保存调整</button>
                </div>
            </div>
        </div>
    );
};

const AddBatchModal = ({ product, storeId, onClose, onSave }: any) => {
    const [form, setForm] = useState({ qtyBig: 0, qtySmall: 0, batchNo: '', expiry: '', remark: '' });
    
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="glass-panel w-full max-w-md rounded-3xl p-6">
                <h2 className="text-xl font-black mb-4">新增批号 - {product.name}</h2>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <input type="number" placeholder={`整数 (${product.unit_name})`} onChange={e=>setForm({...form, qtyBig: Number(e.target.value)})} className="w-full p-3 rounded-lg bg-white/20 border border-white/10"/>
                        <input type="number" placeholder={`散数 (${product.split_unit_name})`} onChange={e=>setForm({...form, qtySmall: Number(e.target.value)})} className="w-full p-3 rounded-lg bg-white/20 border border-white/10"/>
                    </div>
                    <input value={form.batchNo} onChange={e=>setForm({...form, batchNo: e.target.value})} placeholder="批号 (支持扫码)" className="w-full p-3 rounded-lg"/>
                    <input type="date" onChange={e=>setForm({...form, expiry: e.target.value})} className="w-full p-3 rounded-lg"/>
                    <input value={form.remark} onChange={e=>setForm({...form, remark: e.target.value})} placeholder="备注" className="w-full p-3 rounded-lg"/>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl bg-white/10">取消</button>
                    <button onClick={()=>onSave(form)} className="px-4 py-2 rounded-xl bg-blue-600 font-bold">确认入库</button>
                </div>
            </div>
        </div>
    );
};

const BillModal = ({ batch, product, onClose, onSave }: any) => {
    const [qtyBig, setQtyBig] = useState(0);
    const [qtySmall, setQtySmall] = useState(0);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="glass-panel w-full max-w-sm rounded-3xl p-6 text-center">
                <h2 className="text-xl font-black mb-2">快速开单 (出库)</h2>
                <p className="text-sm opacity-60 mb-6">{product.name} - {batch.batch_number}</p>
                <div className="flex gap-2 justify-center mb-6">
                    <input type="number" placeholder={product.unit_name || '整'} onChange={e=>setQtyBig(Number(e.target.value))} className="w-24 p-3 text-center rounded-xl bg-white/20 font-bold text-xl"/>
                    <input type="number" placeholder={product.split_unit_name || '散'} onChange={e=>setQtySmall(Number(e.target.value))} className="w-24 p-3 text-center rounded-xl bg-white/20 font-bold text-xl"/>
                </div>
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-white/10">取消</button>
                    <button onClick={()=>onSave(qtyBig, qtySmall)} className="flex-1 py-3 rounded-xl bg-red-600 font-bold">确认出库</button>
                </div>
            </div>
        </div>
    );
};

// --- INVENTORY TABLE COMPONENT ---

interface InventoryTableProps {
    data: AggregatedStock[];
    currentStore: string;
    onRefresh: () => void;
    compact?: boolean;
    deleteMode?: boolean;
    selectedToDelete?: Set<string>;
    selectedBatchIds?: Set<string>;
    onMobileClick?: (item: AggregatedStock) => void;
    mobileExpanded?: boolean;
    isMobileOverlay?: boolean;
}

export const InventoryTable: React.FC<InventoryTableProps> = ({ 
    data, currentStore, onRefresh, compact, onMobileClick, mobileExpanded, isMobileOverlay 
}) => {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [activeModal, setActiveModal] = useState<{type: 'PROD'|'BATCH'|'ADD'|'BILL', item?: any, batch?: any} | null>(null);

    useEffect(() => {
        if (mobileExpanded && data.length > 0) {
            setExpanded(new Set(data.map(d => d.product.id)));
        }
    }, [mobileExpanded, data]);

    const toggleExpand = (pid: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(pid)) next.delete(pid); else next.add(pid);
            return next;
        });
    };

    const handleSaveProd = async (form: any) => {
        if(!activeModal?.item) return;
        await dataService.updateProduct(activeModal.item.product.id, {
            name: form.name, sku: form.sku, category: form.category,
            unit_name: form.unitName, split_unit_name: form.splitName, split_ratio: form.ratio,
            image_url: form.imageUrl
        });
        setActiveModal(null);
        onRefresh();
    };

    const handleSaveBatch = async (form: any) => {
        if(!activeModal?.batch || !activeModal?.item) return;
        const ratio = activeModal.item.product.split_ratio || 1;
        const total = form.qtyBig * ratio + form.qtySmall;
        await dataService.adjustBatch(activeModal.batch.id, {
            quantity: total, batch_number: form.batchNo, expiry_date: form.expiry, remark: form.remark
        });
        setActiveModal(null);
        onRefresh();
    };

    const handleAddBatch = async (form: any) => {
        if(!activeModal?.item) return;
        if(currentStore === 'all') return alert("请先选择具体门店");
        const ratio = activeModal.item.product.split_ratio || 1;
        const total = form.qtyBig * ratio + form.qtySmall;
        await dataService.createBatch({
            product_id: activeModal.item.product.id,
            store_id: currentStore,
            batch_number: form.batchNo,
            quantity: total,
            expiry_date: form.expiry,
            remark: form.remark
        });
        setActiveModal(null);
        onRefresh();
    };

    const handleBill = async (big: number, small: number) => {
        if(!activeModal?.batch || !activeModal?.item) return;
        const ratio = activeModal.item.product.split_ratio || 1;
        const total = big * ratio + small;
        if(total <= 0) return alert("数量需大于0");
        await dataService.updateStock(activeModal.item.product.id, activeModal.batch.store_id, total, 'OUT', '快速开单', activeModal.batch.id);
        setActiveModal(null);
        onRefresh();
    };

    return (
        <>
        <div className="space-y-4">
            {data.map(item => (
                <div key={item.product.id} className={`glass-panel rounded-2xl overflow-hidden transition-all duration-300 ${compact ? 'border border-gray-100 dark:border-gray-800 shadow-none' : ''}`}>
                    {/* Parent Row */}
                    <div className={`p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 ${compact ? 'py-3' : ''}`} 
                        onClick={()=>{
                            if(onMobileClick) onMobileClick(item);
                            else toggleExpand(item.product.id);
                        }}
                    >
                        <div className="flex items-center gap-4">
                            {!compact && (
                                <div className="w-12 h-12 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center overflow-hidden">
                                    {item.product.image_url ? <img src={item.product.image_url} className="w-full h-full object-cover"/> : <Icons.Box size={20} className="opacity-50"/>}
                                </div>
                            )}
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className={`font-bold ${compact ? 'text-sm' : 'text-lg'}`}>{item.product.name}</h3>
                                    {!compact && <button onClick={(e)=>{e.stopPropagation(); setActiveModal({type:'PROD', item})}} className="p-1 hover:bg-white/10 rounded"><Icons.Menu size={14} className="opacity-50"/></button>}
                                </div>
                                <div className="text-xs text-gray-400 font-mono">Total: {formatUnit(item.totalQuantity, item.product)}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {!compact && !isMobileOverlay && (
                                <button 
                                    onClick={(e)=>{e.stopPropagation(); setActiveModal({type:'ADD', item})}}
                                    className="hidden md:block px-3 py-1.5 bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-bold rounded-lg backdrop-blur-sm"
                                >
                                    + 新增批号
                                </button>
                            )}
                            {!onMobileClick && (
                                <Icons.ChevronDown className={`transition-transform duration-300 ${expanded.has(item.product.id)?'rotate-180':''}`}/>
                            )}
                        </div>
                    </div>

                    {/* Expanded Batches Table */}
                    {expanded.has(item.product.id) && (
                        <div className="bg-black/20 p-4 border-t border-white/10 animate-fade-in">
                            {!compact && !isMobileOverlay && (
                                <div className="md:hidden mb-4">
                                    <button 
                                        onClick={()=>setActiveModal({type:'ADD', item})}
                                        className="w-full py-2 bg-blue-600/80 text-white text-sm font-bold rounded-xl"
                                    >
                                        + 新增批号
                                    </button>
                                </div>
                            )}
                            {item.batches.length === 0 ? (
                                <div className="text-center text-gray-500 py-4">无批次数据</div>
                            ) : (
                                <div className="space-y-2">
                                    {item.batches.map(batch => (
                                        <div key={batch.id} className="flex flex-wrap items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5 gap-2">
                                            <div className="flex items-center gap-3 min-w-[150px]">
                                                <span className="font-mono text-yellow-500 font-bold">{batch.batch_number || '无批号'}</span>
                                                {batch.store_name && <span className="text-xs bg-white/10 px-2 py-0.5 rounded">{batch.store_name}</span>}
                                            </div>
                                            <div className="text-sm font-bold flex-1 text-center md:text-left">
                                                {formatUnit(batch.quantity, item.product)}
                                            </div>
                                            <div className="text-xs text-gray-400 w-full md:w-auto text-center md:text-left">
                                                Exp: {batch.expiry_date?.split('T')[0] || '-'}
                                            </div>
                                            {!compact && (
                                                <div className="flex gap-2 w-full md:w-auto justify-end">
                                                    <button onClick={()=>setActiveModal({type:'BILL', item, batch})} className="px-3 py-1.5 bg-green-600/80 text-white text-xs font-bold rounded-lg hover:bg-green-600">开单</button>
                                                    <button onClick={()=>setActiveModal({type:'BATCH', item, batch})} className="px-3 py-1.5 bg-white/10 text-white text-xs font-bold rounded-lg hover:bg-white/20">调整</button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
        
        {/* Modals Injection */}
        {activeModal?.type === 'PROD' && <AdjustProductModal product={activeModal.item.product} onClose={()=>setActiveModal(null)} onSave={handleSaveProd}/>}
        {activeModal?.type === 'BATCH' && <AdjustBatchModal batch={activeModal.batch} product={activeModal.item.product} onClose={()=>setActiveModal(null)} onSave={handleSaveBatch}/>}
        {activeModal?.type === 'ADD' && <AddBatchModal product={activeModal.item.product} storeId={currentStore} onClose={()=>setActiveModal(null)} onSave={handleAddBatch}/>}
        {activeModal?.type === 'BILL' && <BillModal batch={activeModal.batch} product={activeModal.item.product} onClose={()=>setActiveModal(null)} onSave={handleBill}/>}
        </>
    );
};

// --- MAIN INVENTORY COMPONENT ---

export const Inventory: React.FC<{currentStore: string}> = ({ currentStore }) => {
    const [data, setData] = useState<AggregatedStock[]>([]);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('ALL');
    const [categories, setCategories] = useState<string[]>([]);
    
    useEffect(() => { loadData(); }, [currentStore]);

    const loadData = async () => {
        const [products, batches, stores] = await Promise.all([
            dataService.getProducts(false, currentStore),
            dataService.getBatches(currentStore === 'all' ? undefined : currentStore),
            dataService.getStores()
        ]);

        const map = new Map<string, AggregatedStock>();
        products.forEach(p => map.set(p.id, { product: p, totalQuantity: 0, batches: [], expiringSoon: 0 }));
        
        batches.forEach(b => {
            if (map.has(b.product_id)) {
                const entry = map.get(b.product_id)!;
                entry.totalQuantity += b.quantity;
                if (currentStore === 'all' && stores.length > 0) {
                     // Try to match store name if not present in batch (though dataService.getBatches usually handles this)
                     // If needed: b.store_name = stores.find(s=>s.id===b.store_id)?.name;
                }
                entry.batches.push(b);
            }
        });

        const list = Array.from(map.values());
        setData(list);
        setCategories(Array.from(new Set(products.map(p => p.category || '未分类'))));
    };

    const filtered = useMemo(() => {
        let res = data;
        if (category !== 'ALL') res = res.filter(i => (i.product.category || '未分类') === category);
        if (search) {
            const q = search.toLowerCase();
            res = res.filter(i => 
                i.product.name.toLowerCase().includes(q) || 
                i.product.sku?.toLowerCase().includes(q) ||
                i.product.pinyin?.toLowerCase().includes(q)
            );
        }
        return res;
    }, [data, search, category]);

    return (
        <div className="p-4 md:p-8 space-y-6 pb-20">
            {/* Search Bar */}
            <div className="glass-panel p-2 rounded-2xl flex flex-wrap gap-2">
                <div className="flex-1 flex items-center bg-black/20 rounded-xl px-3 border border-white/5">
                    <Icons.Scan size={20} className="text-gray-400 mr-2"/>
                    <input 
                        value={search} 
                        onChange={e=>setSearch(e.target.value)} 
                        placeholder="搜索拼音 / 汉字 / SKU..." 
                        className="bg-transparent border-none outline-none text-white w-full py-3 font-bold placeholder-gray-500"
                    />
                </div>
                <select 
                    value={category} 
                    onChange={e=>setCategory(e.target.value)}
                    className="bg-black/20 text-white rounded-xl px-4 py-3 font-bold border border-white/5 outline-none"
                >
                    <option value="ALL">全部分类</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>

            {/* List via InventoryTable */}
            <InventoryTable 
                data={filtered} 
                currentStore={currentStore} 
                onRefresh={loadData} 
            />
        </div>
    );
};
