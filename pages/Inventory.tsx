import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from '../components/Icons';
import { dataService } from '../services/dataService';
import { Batch, Product, Store, AggregatedStock } from '../types';
import { formatUnit, generatePageSummary } from '../utils/formatters';

declare const window: any;

export interface InventoryTableProps {
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
    const [modal, setModal] = useState<{type: 'ADD'|'ADJUST'|'BILL', product: Product, batch?: Batch} | null>(null);
    const [stores, setStores] = useState<Store[]>([]);
    
    // Forms
    const [qtyBig, setQtyBig] = useState(0);
    const [qtySmall, setQtySmall] = useState(0);
    const [batchNo, setBatchNo] = useState('');
    const [expiry, setExpiry] = useState('');
    const [remark, setRemark] = useState('');
    const [imgUrl, setImgUrl] = useState('');

    useEffect(() => {
        dataService.getStores().then(setStores);
    }, []);

    // Force expand if mobileExpanded is true (for Dashboard detail view)
    useEffect(() => {
        if (mobileExpanded && data.length > 0) {
            setExpanded(new Set(data.map(d => d.product.id)));
        }
    }, [mobileExpanded, data]);

    const isParent = stores.find(s => s.id === currentStore)?.children?.length;

    const handleAction = async () => {
        if (!modal) return;
        const { type, product, batch } = modal;
        const ratio = product.split_ratio || 1;
        const total = qtyBig * ratio + qtySmall;
  
        try {
            if (type === 'ADD') {
                if (currentStore === 'all') return alert("请选具体门店");
                await dataService.createBatch({
                    product_id: product.id, store_id: currentStore,
                    batch_number: batchNo, quantity: total, expiry_date: expiry,
                    image_url: imgUrl, remark
                });
            } else if (type === 'BILL' && batch) {
                if (total <= 0) return alert("数量需>0");
                await dataService.updateStock(product.id, batch.store_id, total, 'OUT', '快速开单', batch.id);
            } else if (type === 'ADJUST' && batch) {
                await dataService.adjustBatch(batch.id, {
                    quantity: total, batch_number: batchNo, expiry_date: expiry,
                    image_url: imgUrl, remark
                });
            }
            setModal(null);
            onRefresh();
        } catch (e: any) {
            alert(e.message || "操作失败");
        }
    };

    return (
        <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow border border-gray-100 dark:border-gray-700 overflow-hidden ${isMobileOverlay ? 'shadow-none border-none' : ''}`}>
             {!isMobileOverlay && (
                <div className="hidden md:grid grid-cols-12 bg-gray-50 dark:bg-gray-900 p-4 font-bold text-xs uppercase text-gray-500">
                    <div className="col-span-4">商品</div>
                    <div className="col-span-2">总库存</div>
                    <div className="col-span-2">SKU</div>
                    <div className="col-span-4 text-right">操作</div>
                </div>
             )}
            
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {data.map(item => (
                    <React.Fragment key={item.product.id}>
                        {/* Row (Desktop) / Card (Mobile) */}
                        <div 
                            onClick={() => {
                                if (onMobileClick && window.innerWidth < 768) {
                                    onMobileClick(item);
                                } else {
                                    setExpanded(prev => { const n = new Set(prev); n.has(item.product.id)?n.delete(item.product.id):n.add(item.product.id); return n; });
                                }
                            }}
                            className={`grid grid-cols-1 md:grid-cols-12 p-4 items-center hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer gap-2 md:gap-0 ${compact ? 'py-2' : ''}`}
                        >
                            <div className="col-span-4 flex gap-3 items-center">
                                {item.product.image_url ? <img src={item.product.image_url} className="w-10 h-10 rounded object-cover"/> : <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center"><Icons.Box size={16}/></div>}
                                <div>
                                    <div className="font-bold">{item.product.name}</div>
                                    <div className="text-xs text-gray-400 md:hidden">库存: {formatUnit(item.totalQuantity, item.product)}</div>
                                </div>
                            </div>
                            <div className="col-span-2 hidden md:block font-mono text-blue-600 font-bold">{formatUnit(item.totalQuantity, item.product)}</div>
                            <div className="col-span-2 hidden md:block text-xs text-gray-500">{item.product.sku}</div>
                            <div className="col-span-4 flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                                <button onClick={()=> { setModal({type:'ADD', product:item.product}); setQtyBig(0); setQtySmall(0); }} className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-bold">新增批号</button>
                                <button onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(item.product.id)?n.delete(item.product.id):n.add(item.product.id); return n; })} className="md:hidden p-1"><Icons.ChevronDown className={`transform transition ${expanded.has(item.product.id)?'rotate-180':''}`}/></button>
                                <Icons.ChevronDown className={`hidden md:block transform transition ${expanded.has(item.product.id)?'rotate-180':''}`}/>
                            </div>
                        </div>

                        {/* Expanded Batches */}
                        {expanded.has(item.product.id) && (
                            <div className="bg-gray-50 dark:bg-gray-900/50 p-2 md:p-4 animate-fade-in">
                                {item.batches.map(b => (
                                    <div key={b.id} className="bg-white dark:bg-gray-800 p-3 rounded-lg border mb-2 flex flex-col md:flex-row justify-between items-center gap-2">
                                        <div className="flex gap-4 items-center w-full md:w-auto">
                                            <span className="font-mono text-purple-600 font-bold">{b.batch_number}</span>
                                            <span className="text-sm">{formatUnit(b.quantity, item.product)}</span>
                                            <span className="text-xs text-gray-400">Exp: {b.expiry_date ? b.expiry_date.split('T')[0] : '/'}</span>
                                            {isParent && <span className="text-xs bg-orange-100 text-orange-800 px-1 rounded">{b.store_name}</span>}
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={()=> { setModal({type:'BILL', product:item.product, batch:b}); setQtyBig(0); setQtySmall(0); }} className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded font-bold">开单</button>
                                            <button onClick={()=> { setModal({type:'ADJUST', product:item.product, batch:b}); setBatchNo(b.batch_number||''); setRemark(b.remark||''); }} className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded font-bold">调整</button>
                                        </div>
                                    </div>
                                ))}
                                {item.batches.length === 0 && <div className="text-center text-gray-400 text-sm py-2">无批次数据</div>}
                            </div>
                        )}
                    </React.Fragment>
                ))}
            </div>

            {/* Modal */}
            {modal && (
              <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                  <div className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-2xl p-6 shadow-2xl">
                      <h3 className="text-xl font-bold mb-4 dark:text-white">{modal.type === 'ADD' ? '新增批号' : modal.type === 'BILL' ? '快速开单' : '调整批次'}</h3>
                      
                      <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                              <div><label className="text-xs font-bold dark:text-gray-300">数量 ({modal.product.unit_name})</label><input type="number" value={qtyBig} onChange={e=>setQtyBig(Number(e.target.value))} className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-white"/></div>
                              <div><label className="text-xs font-bold dark:text-gray-300">数量 ({modal.product.split_unit_name})</label><input type="number" value={qtySmall} onChange={e=>setQtySmall(Number(e.target.value))} className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-white"/></div>
                          </div>
                          
                          {modal.type !== 'BILL' && (
                              <>
                                  <input value={batchNo} onChange={e=>setBatchNo(e.target.value)} placeholder="批号" className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-white"/>
                                  <input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)} className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-white"/>
                                  <input value={remark} onChange={e=>setRemark(e.target.value)} placeholder="备注" className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-white"/>
                                  <div className="flex gap-2">
                                      <button className="bg-gray-200 dark:bg-gray-700 px-3 py-1 rounded dark:text-white" onClick={()=>alert("调用摄像头")}>📷 拍照</button>
                                  </div>
                              </>
                          )}
                      </div>

                      <div className="mt-6 flex justify-end gap-2">
                          <button onClick={()=>setModal(null)} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 dark:text-gray-300 rounded">取消</button>
                          <button onClick={handleAction} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">确认</button>
                      </div>
                  </div>
              </div>
            )}
        </div>
    );
};

export const Inventory: React.FC<{currentStore: string}> = ({ currentStore }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);

  useEffect(() => { loadData(); }, [currentStore]);

  const loadData = async () => {
      const [p, b] = await Promise.all([
          dataService.getProducts(false, currentStore),
          dataService.getBatches(currentStore === 'all' ? undefined : currentStore)
      ]);
      setProducts(p);
      setBatches(b);
  };

  // Group Data
  const groupedData = useMemo(() => {
      const map = new Map<string, AggregatedStock>();
      products.forEach(p => map.set(p.id, { product: p, totalQuantity: 0, batches: [], expiringSoon: 0 }));
      batches.forEach(b => {
          if (map.has(b.product_id)) {
              const item = map.get(b.product_id)!;
              item.totalQuantity += b.quantity;
              item.batches.push(b);
          }
      });
      return Array.from(map.values());
  }, [products, batches]);

  // Event Listeners for Top Bar
  useEffect(() => {
      const copyHandler = () => {
          const txt = generatePageSummary('inventory', groupedData);
          navigator.clipboard.writeText(txt).then(()=>alert("已复制"));
      };
      const excelHandler = () => {
          if (!(window as any).XLSX) return;
          const flat = groupedData.flatMap(g => g.batches.map(b => ({
              商品: g.product.name, 批号: b.batch_number, 数量: b.quantity, 备注: b.remark
          })));
          const ws = (window as any).XLSX.utils.json_to_sheet(flat);
          const wb = (window as any).XLSX.utils.book_new();
          (window as any).XLSX.utils.book_append_sheet(wb, ws, "Inventory");
          (window as any).XLSX.writeFile(wb, "export.xlsx");
      };
      window.addEventListener('trigger-copy', copyHandler);
      window.addEventListener('trigger-excel-export', excelHandler);
      return () => {
          window.removeEventListener('trigger-copy', copyHandler);
          window.removeEventListener('trigger-excel-export', excelHandler);
      };
  }, [groupedData]);

  return (
      <div className="p-4 md:p-8 space-y-6">
          <InventoryTable 
            data={groupedData} 
            currentStore={currentStore} 
            onRefresh={loadData} 
          />
      </div>
  );
};