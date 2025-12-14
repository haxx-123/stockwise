
import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { dataService } from '../services/dataService';
import { AggregatedStock, Product } from '../types';
import { formatUnit } from '../utils/formatters';

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
}

export const InventoryTable: React.FC<InventoryTableProps> = ({ 
    data, onRefresh, currentStore, compact, deleteMode, 
    selectedToDelete, selectedBatchIds, onMobileClick, 
    mobileExpanded, isMobileOverlay 
}) => {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [billModal, setBillModal] = useState<{batch:any, product:any} | null>(null);

    // If mobileExpanded is true, expand all (for detail view)
    useEffect(() => {
        if (mobileExpanded) {
            const allIds = new Set(data.map(i => i.product.id));
            setExpanded(allIds);
        }
    }, [mobileExpanded, data]);

    const toggleExpand = (id: string) => {
        const newSet = new Set(expanded);
        if(newSet.has(id)) newSet.delete(id); else newSet.add(id);
        setExpanded(newSet);
    };

    // --- Bill Modal Component (Inline) ---
    const BillModal = () => {
        if (!billModal) return null;
        const [type, setType] = useState<'IN'|'OUT'>('OUT');
        const [qty, setQty] = useState(0);
        const [unit, setUnit] = useState('BIG'); // BIG or SMALL

        const handleSubmit = async () => {
            const ratio = billModal.product.split_ratio || 1;
            const finalQty = unit === 'BIG' ? qty * ratio : qty;
            try {
                await dataService.updateStock(billModal.product.id, billModal.batch.store_id, finalQty, type, '快速开单', billModal.batch.id);
                setBillModal(null);
                onRefresh();
            } catch(e:any) { alert(e.message); }
        };

        return (
            <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-scale-in">
                    <h3 className="text-xl font-black mb-4">库存操作</h3>
                    <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
                        <button onClick={()=>setType('IN')} className={`flex-1 py-2 rounded-lg font-bold ${type==='IN'?'bg-white shadow text-green-600':'text-gray-500'}`}>入库</button>
                        <button onClick={()=>setType('OUT')} className={`flex-1 py-2 rounded-lg font-bold ${type==='OUT'?'bg-white shadow text-red-600':'text-gray-500'}`}>出库</button>
                    </div>
                    <div className="flex gap-2 mb-4">
                        <input type="number" placeholder="数量" onChange={e=>setQty(Number(e.target.value))} className="flex-1 p-3 bg-gray-50 rounded-xl font-bold text-xl"/>
                        <select onChange={e=>setUnit(e.target.value)} className="bg-gray-50 rounded-xl px-3 font-bold">
                            <option value="BIG">{billModal.product.unit_name || '整'}</option>
                            <option value="SMALL">{billModal.product.split_unit_name || '散'}</option>
                        </select>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={()=>setBillModal(null)} className="flex-1 py-3 bg-gray-200 rounded-xl font-bold">取消</button>
                        <button onClick={handleSubmit} className="flex-1 py-3 bg-black text-white rounded-xl font-bold">确定</button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-4">
            {data.map(item => (
                <div key={item.product.id} className={`glass-panel rounded-2xl overflow-hidden ${compact ? 'border border-gray-100' : ''}`}>
                    <div className="p-4 flex justify-between items-center cursor-pointer hover:bg-white/10" 
                        onClick={() => {
                            if (onMobileClick && !mobileExpanded) onMobileClick(item);
                            else toggleExpand(item.product.id);
                        }}
                    >
                        <div>
                            <h3 className="font-bold text-lg">{item.product.name}</h3>
                            <p className="text-xs opacity-60">
                                SKU: {item.product.sku} | 总量: {formatUnit(item.totalQuantity, item.product)}
                            </p>
                        </div>
                        <Icons.ChevronDown className={`transition ${expanded.has(item.product.id)?'rotate-180':''}`}/>
                    </div>
                    {expanded.has(item.product.id) && (
                        <div className="bg-black/5 p-4 border-t border-black/5 space-y-2">
                            {item.batches.map(b => (
                                <div key={b.id} className="bg-white/40 p-3 rounded-xl flex justify-between items-center">
                                    <div>
                                        <div className="font-mono text-xs opacity-50">{b.batch_number} {b.expiry_date ? `(Exp: ${new Date(b.expiry_date).toLocaleDateString()})` : ''}</div>
                                        <div className="font-bold">{formatUnit(b.quantity, item.product)}</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={()=>setBillModal({batch:b, product:item.product})} className="px-3 py-1 bg-black text-white rounded-lg text-xs font-bold shadow-lg">开单</button>
                                        <button className="px-3 py-1 bg-white border border-black/10 rounded-lg text-xs font-bold">调整</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
            {billModal && <BillModal/>}
        </div>
    );
};

export const Inventory: React.FC<{currentStore: string}> = ({ currentStore }) => {
    const [data, setData] = useState<AggregatedStock[]>([]);
    const [search, setSearch] = useState('');

    useEffect(() => { loadData(); }, [currentStore]);

    const loadData = async () => {
        const [p, b] = await Promise.all([
            dataService.getProducts(false, currentStore),
            dataService.getBatches(currentStore==='all'?undefined:currentStore)
        ]);
        // Aggregation
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

    const filteredData = data.filter(i=>i.product.name.includes(search) || i.product.sku?.includes(search));

    return (
        <div className="p-4 md:p-8 space-y-6 pb-20">
            <div className="glass-panel p-2 rounded-2xl flex items-center gap-2">
                <Icons.Scan size={20} className="ml-2 opacity-50"/>
                <input placeholder="搜索商品 / 拼音 / 扫码..." value={search} onChange={e=>setSearch(e.target.value)} className="bg-transparent border-none w-full p-2 font-bold outline-none"/>
            </div>

            <InventoryTable 
                data={filteredData} 
                onRefresh={loadData} 
                currentStore={currentStore} 
            />
        </div>
    );
};
