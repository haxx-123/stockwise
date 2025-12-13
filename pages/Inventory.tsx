

import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from '../components/Icons';
import { dataService } from '../services/dataService';
import { Batch, Product, Store, AggregatedStock } from '../types';
import { formatUnit, matchSearch, generatePageSummary } from '../utils/formatters';
import { authService } from '../services/authService';

declare const window: any;

interface InventoryTableProps {
    data: AggregatedStock[];
    onRefresh: () => void;
    currentStore: string;
    compact?: boolean;
    deleteMode?: boolean;
    selectedToDelete?: Set<string>;
    selectedBatchIds?: Set<string>;
    onMobileClick?: (item: any) => void;
    mobileExpanded?: boolean;
    isMobileOverlay?: boolean;
}

export const InventoryTable: React.FC<InventoryTableProps> = ({ 
    data, onRefresh, currentStore, compact, deleteMode, selectedToDelete, selectedBatchIds, onMobileClick, mobileExpanded, isMobileOverlay
}) => {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [modal, setModal] = useState<{type: 'ADD'|'ADJUST_BATCH'|'ADJUST_PROD'|'BILL', product: Product, batch?: Batch} | null>(null);
    const [form, setForm] = useState<any>({});

    useEffect(() => {
        if (mobileExpanded && data.length === 1) {
            setExpanded(new Set([data[0].product.id]));
        }
    }, [mobileExpanded, data]);

    const handleAction = async () => {
        if (!modal) return;
        const { type, product, batch } = modal;
        
        try {
            if (type === 'ADD') {
                if (currentStore === 'all') return alert("请选具体门店");
                const total = (Number(form.qtyBig)||0) * (product.split_ratio||1) + (Number(form.qtySmall)||0);
                await dataService.createBatch({
                    product_id: product.id, store_id: currentStore,
                    batch_number: form.batchNo, quantity: total, expiry_date: form.expiry,
                    image_url: form.imgUrl, remark: form.remark
                });
            } else if (type === 'BILL' && batch) {
                const total = (Number(form.qtyBig)||0) * (product.split_ratio||1) + (Number(form.qtySmall)||0);
                if (total <= 0) return alert("数量需>0");
                await dataService.updateStock(product.id, batch.store_id, total, 'OUT', '快速开单', batch.id);
            } else if (type === 'ADJUST_BATCH' && batch) {
                const total = (Number(form.qtyBig)||0) * (product.split_ratio||1) + (Number(form.qtySmall)||0);
                await dataService.adjustBatch(batch.id, {
                    quantity: total, batch_number: form.batchNo, expiry_date: form.expiry,
                    image_url: form.imgUrl, remark: form.remark
                });
            } else if (type === 'ADJUST_PROD') {
                await dataService.updateProduct(product.id, {
                    name: form.name, sku: form.sku, category: form.category,
                    unit_name: form.unitName, split_unit_name: form.splitName, split_ratio: Number(form.ratio)
                });
            }
            setModal(null);
            onRefresh();
        } catch(e: any) { alert(e.message); }
    };

    const openModal = (type: any, product: Product, batch?: Batch) => {
        const ratio = product.split_ratio || 1;
        let initForm: any = {};
        
        if (type === 'ADJUST_BATCH' && batch) {
            initForm = {
                qtyBig: Math.floor(batch.quantity / ratio),
                qtySmall: batch.quantity % ratio,
                batchNo: batch.batch_number,
                expiry: batch.expiry_date ? batch.expiry_date.split('T')[0] : '',
                remark: batch.remark,
                imgUrl: batch.image_url
            };
        } else if (type === 'ADJUST_PROD') {
            initForm = {
                name: product.name, sku: product.sku, category: product.category,
                unitName: product.unit_name, splitName: product.split_unit_name, ratio: product.split_ratio
            };
        } else if (type === 'BILL') {
            initForm = { qtyBig: 0, qtySmall: 0 };
        }
        
        setForm(initForm);
        setModal({ type, product, batch });
    };

    return (
        <>
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
                          <div 
                              onClick={() => {
                                  if (onMobileClick && window.innerWidth < 768) {
                                      onMobileClick(item);
                                      return;
                                  }
                                  setExpanded(prev => { const n = new Set(prev); n.has(item.product.id)?n.delete(item.product.id):n.add(item.product.id); return n; });
                              }}
                              className={`grid grid-cols-1 md:grid-cols-12 p-4 items-center hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer gap-2 md:gap-0 ${isMobileOverlay ? 'p-0' : ''}`}
                          >
                              <div className="col-span-4 flex gap-3 items-center">
                                  {item.product.image_url ? <img src={item.product.image_url} className="w-10 h-10 rounded object-cover"/> : <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center"><Icons.Box size={16}/></div>}
                                  <div>
                                      <div className="font-bold flex items-center gap-2">
                                          {item.product.name}
                                          <button onClick={(e)=>{e.stopPropagation(); openModal('ADJUST_PROD', item.product)}} className="text-gray-400 hover:text-blue-600"><Icons.Box size={14}/></button>
                                      </div>
                                      <div className="text-xs text-gray-400 md:hidden">库存: {formatUnit(item.totalQuantity, item.product)}</div>
                                  </div>
                              </div>
                              <div className="col-span-2 hidden md:block font-mono text-blue-600 font-bold">{formatUnit(item.totalQuantity, item.product)}</div>
                              <div className="col-span-2 hidden md:block text-xs text-gray-500">{item.product.sku}</div>
                              <div className="col-span-4 flex justify-end gap-2">
                                  {!compact && <button onClick={(e)=>{e.stopPropagation(); setForm({}); setModal({type:'ADD', product:item.product}); }} className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-bold">新增批号</button>}
                                  <Icons.ChevronDown className={`transform transition ${expanded.has(item.product.id)?'rotate-180':''}`}/>
                              </div>
                          </div>

                          {expanded.has(item.product.id) && (
                              <div className="bg-gray-50 dark:bg-gray-900/50 p-2 md:p-4">
                                  {item.batches.map(b => (
                                      <div key={b.id} className="bg-white dark:bg-gray-800 p-3 rounded-lg border mb-2 flex flex-col md:flex-row justify-between items-center gap-2">
                                          <div className="flex gap-4 items-center w-full md:w-auto">
                                              <span className="font-mono text-purple-600 font-bold">{b.batch_number}</span>
                                              <span className="text-sm">{formatUnit(b.quantity, item.product)}</span>
                                              <span className="text-xs text-gray-400">Exp: {b.expiry_date?.split('T')[0]}</span>
                                          </div>
                                          <div className="flex gap-2">
                                              <button onClick={()=>openModal('BILL', item.product, b)} className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded font-bold">开单</button>
                                              <button onClick={()=>openModal('ADJUST_BATCH', item.product, b)} className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded font-bold">调整</button>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          )}
                      </React.Fragment>
                  ))}
              </div>
          </div>

          {modal && (
              <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                  <div className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-2xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
                      <h3 className="text-xl font-bold mb-4">{modal.type}</h3>
                      <div className="space-y-4">
                          {modal.type === 'ADJUST_PROD' ? (
                              <>
                                <input value={form.name} onChange={e=>setForm({...form, name: e.target.value})} placeholder="名称" className="w-full p-2 border rounded"/>
                                <input value={form.category} onChange={e=>setForm({...form, category: e.target.value})} placeholder="类别" className="w-full p-2 border rounded"/>
                                <div className="grid grid-cols-3 gap-2">
                                    <input value={form.unitName} onChange={e=>setForm({...form, unitName: e.target.value})} placeholder="大单位" className="p-2 border rounded"/>
                                    <input value={form.splitName} onChange={e=>setForm({...form, splitName: e.target.value})} placeholder="小单位" className="p-2 border rounded"/>
                                    <input value={form.ratio} onChange={e=>setForm({...form, ratio: e.target.value})} placeholder="换算" className="p-2 border rounded"/>
                                </div>
                              </>
                          ) : (
                              <>
                                <div className="grid grid-cols-2 gap-4">
                                    <input type="number" value={form.qtyBig} onChange={e=>setForm({...form, qtyBig: e.target.value})} placeholder="大单位数量" className="w-full p-2 border rounded"/>
                                    <input type="number" value={form.qtySmall} onChange={e=>setForm({...form, qtySmall: e.target.value})} placeholder="小单位数量" className="w-full p-2 border rounded"/>
                                </div>
                                {modal.type !== 'BILL' && (
                                    <>
                                        <input value={form.batchNo} onChange={e=>setForm({...form, batchNo: e.target.value})} placeholder="批号" className="w-full p-2 border rounded"/>
                                        <input type="date" value={form.expiry} onChange={e=>setForm({...form, expiry: e.target.value})} className="w-full p-2 border rounded"/>
                                        <input value={form.remark} onChange={e=>setForm({...form, remark: e.target.value})} placeholder="备注" className="w-full p-2 border rounded"/>
                                    </>
                                )}
                              </>
                          )}
                      </div>
                      <div className="mt-6 flex justify-end gap-2">
                          <button onClick={()=>setModal(null)} className="px-4 py-2 bg-gray-100 rounded">取消</button>
                          <button onClick={handleAction} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">确认</button>
                      </div>
                  </div>
              </div>
          )}
          </>
    );
};

export const Inventory: React.FC<{currentStore: string}> = ({ currentStore }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  
  const PAGE_SIZE = 15;

  useEffect(() => { loadData(); }, [currentStore]);

  const loadData = async () => {
      const [p, b, s] = await Promise.all([
          dataService.getProducts(false, currentStore),
          dataService.getBatches(currentStore === 'all' ? undefined : currentStore),
          dataService.getStores()
      ]);
      setProducts(p);
      setBatches(b);
      setStores(s);
  };

  // Group Data & Search
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
      let result = Array.from(map.values());
      
      // Search Logic (Pinyin/Hanzi)
      if (searchQuery) {
          const q = searchQuery.toLowerCase();
          result = result.filter(item => {
              const p = item.product;
              return (p.name.toLowerCase().includes(q) || 
                      (p.pinyin && p.pinyin.toLowerCase().includes(q)) || 
                      p.sku?.toLowerCase().includes(q) ||
                      p.category?.toLowerCase().includes(q));
          });
      }
      return result;
  }, [products, batches, searchQuery]);

  const paginatedData = groupedData.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const totalPages = Math.ceil(groupedData.length / PAGE_SIZE);

  // Event Listeners for Top Bar
  useEffect(() => {
      const copyHandler = () => navigator.clipboard.writeText(generatePageSummary('inventory', groupedData));
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
          <div className="flex gap-4">
              <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="🔍 搜索拼音/汉字/SKU..." className="flex-1 p-3 rounded-xl border font-bold"/>
              <button onClick={()=>alert("扫码功能模拟")} className="p-3 bg-black text-white rounded-xl"><Icons.Scan/></button>
          </div>

          <InventoryTable 
              data={paginatedData} 
              onRefresh={loadData} 
              currentStore={currentStore} 
          />

          <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm">
              <button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="px-4 py-2 bg-gray-100 rounded disabled:opacity-50">上一页</button>
              <div className="flex items-center gap-2">
                  <span>当前</span>
                  <input type="number" value={page} onChange={e=>setPage(Number(e.target.value))} className="w-12 border text-center font-bold"/>
                  <span>/ {totalPages} 页</span>
              </div>
              <button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} className="px-4 py-2 bg-gray-100 rounded disabled:opacity-50">下一页</button>
          </div>
      </div>
  );
};
