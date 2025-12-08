


import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Icons } from '../components/Icons';
import { dataService } from '../services/dataService';
import { Batch, Product, Store, AggregatedStock } from '../types';
import { isConfigured } from '../services/supabaseClient';
import { formatUnit, ph, matchSearch, getUnitSplit } from '../utils/formatters';

declare const Html5Qrcode: any;

interface InventoryProps {
  currentStore?: string;
}

export const Inventory: React.FC<InventoryProps> = ({ currentStore }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<Store[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<any>(null);
  const [selectedCategory, setSelectedCategory] = useState('All');

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedToDelete, setSelectedToDelete] = useState<Set<string>>(new Set());
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  
  const [mobileDetailItem, setMobileDetailItem] = useState<AggregatedStock | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [p, b, s] = await Promise.all([
        dataService.getProducts(false, currentStore),
        dataService.getBatches(currentStore === 'all' ? undefined : currentStore),
        dataService.getStores()
      ]);
      setProducts(p);
      setBatches(b);
      setStores(s);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (isConfigured()) loadData();
    setPage(1);
    setSelectedToDelete(new Set());
    setSelectedBatchIds(new Set());
  }, [currentStore]);

  // Scanner Logic
  const startScanner = async () => {
      if (isScanning) { stopScanner(); return; }
      try {
          const html5QrCode = new Html5Qrcode("search-reader");
          scannerRef.current = html5QrCode;
          setIsScanning(true);
          await html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (decodedText: string) => {
              setSearchQuery(decodedText);
              stopScanner();
          }, () => {});
      } catch (err) { alert("Scanner failed"); setIsScanning(false); }
  };
  const stopScanner = async () => {
      if (scannerRef.current) { try { await scannerRef.current.stop(); await scannerRef.current.clear(); } catch(e){} }
      setIsScanning(false);
  };
  useEffect(() => () => { if(scannerRef.current) stopScanner(); }, []);

  const aggregatedData = useMemo(() => {
    const map = new Map<string, AggregatedStock>();
    products.forEach(p => {
        if (!map.has(p.id)) map.set(p.id, { product: p, totalQuantity: 0, batches: [], expiringSoon: 0 });
    });
    batches.forEach(b => {
        if (map.has(b.product_id)) {
            const agg = map.get(b.product_id)!;
            agg.totalQuantity += b.quantity;
            agg.batches.push(b);
        }
    });

    let result = Array.from(map.values());
    result = result.filter(item => {
        if (selectedCategory !== 'All' && (item.product.category || '未分类') !== selectedCategory) return false;
        if (searchQuery) {
            const q = searchQuery.trim();
            if (!matchSearch(item.product.name, q) && !item.product.sku?.toLowerCase().includes(q.toLowerCase()) && !item.batches.some(b => b.batch_number?.toLowerCase().includes(q.toLowerCase()))) return false;
        }
        return true;
    });
    return result;
  }, [batches, products, searchQuery, selectedCategory]);

  const categories = useMemo(() => ['All', ...new Set(products.map(p => p.category || '未分类'))], [products]);
  const totalPages = Math.ceil(aggregatedData.length / PAGE_SIZE);
  const paginatedData = aggregatedData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleBulkDelete = async () => {
      if (selectedToDelete.size + selectedBatchIds.size === 0) return;
      if (!confirm(`确认删除选中的 ${selectedToDelete.size} 个商品和 ${selectedBatchIds.size} 个批次? (软删除)`)) return;
      try {
          for (const bid of selectedBatchIds) await dataService.deleteBatch(bid);
          for (const pid of selectedToDelete) await dataService.deleteProduct(pid);
          alert("删除成功"); setSelectedToDelete(new Set()); setSelectedBatchIds(new Set()); setDeleteMode(false); loadData();
      } catch(e: any) { alert(e.message); }
  };

  const handleSelectAllOnPage = () => {
      const newProdSet = new Set(selectedToDelete);
      const newBatchSet = new Set(selectedBatchIds);
      
      const allSelected = paginatedData.length > 0 && paginatedData.every(item => newProdSet.has(item.product.id));

      if (allSelected) {
          paginatedData.forEach(item => {
              newProdSet.delete(item.product.id);
              item.batches.forEach(b => newBatchSet.delete(b.id));
          });
      } else {
          paginatedData.forEach(item => {
              newProdSet.add(item.product.id);
              item.batches.forEach(b => newBatchSet.add(b.id));
          });
      }
      setSelectedToDelete(newProdSet);
      setSelectedBatchIds(newBatchSet);
  };

  const toggleSelectProduct = (pid: string, batchIds: string[]) => {
      const newProdSet = new Set(selectedToDelete);
      const newBatchSet = new Set(selectedBatchIds);
      if (newProdSet.has(pid)) { newProdSet.delete(pid); batchIds.forEach(bid => newBatchSet.delete(bid)); } 
      else { newProdSet.add(pid); batchIds.forEach(bid => newBatchSet.add(bid)); }
      setSelectedToDelete(newProdSet); setSelectedBatchIds(newBatchSet);
  };
  const toggleSelectBatch = (bid: string) => {
      const newSet = new Set(selectedBatchIds);
      if (newSet.has(bid)) newSet.delete(bid); else newSet.add(bid);
      setSelectedBatchIds(newSet);
  };

  if (loading) return <div className="p-8 dark:text-white">加载中...</div>;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-center">
              <div className="flex items-center gap-2 w-full md:w-auto">
                   <button onClick={() => deleteMode ? handleBulkDelete() : setDeleteMode(true)} className={`px-4 py-2 rounded-lg font-bold transition-colors w-full md:w-auto ${deleteMode ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                      {deleteMode ? `确认删除 (${selectedToDelete.size + selectedBatchIds.size})` : '删除 (管理)'}
                   </button>
                   {deleteMode && (
                       <label className="flex items-center gap-1 cursor-pointer select-none">
                           <input type="checkbox" onChange={handleSelectAllOnPage} className="w-5 h-5 accent-red-600 rounded border-2 border-white" />
                           <span className="text-sm font-bold dark:text-white">全选本页</span>
                       </label>
                   )}
              </div>
              
              {deleteMode && <button onClick={()=>{setDeleteMode(false); setSelectedToDelete(new Set());}} className="text-gray-500 underline text-sm dark:text-gray-400">取消</button>}

              <div className="flex-1 relative w-full">
                  <input type="text" placeholder="搜索... (支持扫码枪)" autoFocus className="w-full pl-10 pr-10 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={searchQuery} onChange={e => {setSearchQuery(e.target.value); setPage(1);}} />
                  <div className="absolute left-3 top-2.5 text-gray-400"><Icons.Sparkles size={18}/></div>
                  <button onClick={startScanner} className="absolute right-2 top-1.5 p-1 bg-gray-100 dark:bg-gray-600 rounded"><Icons.Scan size={18}/></button>
              </div>
              <div id="search-reader" className={isScanning ? 'block' : 'hidden'}></div>
              
              <select value={selectedCategory} onChange={e => {setSelectedCategory(e.target.value); setPage(1);}} className="border rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white flex-1 md:flex-none">
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
          </div>
      </div>

      <InventoryTable 
        data={paginatedData} 
        onRefresh={loadData} 
        currentStore={currentStore}
        deleteMode={deleteMode}
        selectedToDelete={selectedToDelete}
        toggleSelectProduct={toggleSelectProduct}
        selectedBatchIds={selectedBatchIds}
        toggleSelectBatch={toggleSelectBatch}
        onMobileClick={(item: any) => setMobileDetailItem(item)}
        handleSelectAllOnPage={handleSelectAllOnPage}
      />

      <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
           <button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded disabled:opacity-50 dark:text-white">上一页</button>
           <span className="text-sm text-gray-500 dark:text-gray-400">Page {page} of {totalPages}</span>
           <button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded disabled:opacity-50 dark:text-white">下一页</button>
      </div>

      {mobileDetailItem && (
          <div className="fixed inset-0 bg-gray-50 dark:bg-gray-900 z-50 overflow-y-auto animate-fade-in p-4 pb-24">
              <div className="flex items-center gap-3 mb-4 sticky top-0 bg-gray-50 dark:bg-gray-900 z-10 py-2 border-b dark:border-gray-800">
                  <button onClick={() => setMobileDetailItem(null)} className="p-2 bg-white dark:bg-gray-800 rounded-full shadow"><Icons.ArrowRightLeft size={20} className="transform rotate-180 dark:text-white"/></button>
                  <h1 className="font-bold text-lg dark:text-white">{mobileDetailItem.product.name} - 详情</h1>
              </div>
              {/* Full functional view in mobile overlay */}
              <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border dark:border-gray-700 mb-4">
                  <div className="flex justify-between items-center">
                       <div>
                           <div className="text-xs text-gray-500">SKU: {mobileDetailItem.product.sku}</div>
                           <div className="text-xs text-gray-500">类别: {mobileDetailItem.product.category}</div>
                       </div>
                       <div className="text-right">
                           <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatUnit(mobileDetailItem.totalQuantity, mobileDetailItem.product)}</div>
                       </div>
                  </div>
              </div>

              <h3 className="font-bold dark:text-white mb-2">批次列表</h3>
              <InventoryTable 
                  data={[mobileDetailItem]} 
                  onRefresh={loadData} 
                  currentStore={currentStore}
                  deleteMode={deleteMode}
                  selectedToDelete={selectedToDelete}
                  selectedBatchIds={selectedBatchIds}
                  mobileExpanded={true} // Force expand in this view
                  isMobileOverlay={true}
              />
          </div>
      )}
    </div>
  );
};

export const InventoryTable = ({ data, onRefresh, currentStore, deleteMode, selectedToDelete, toggleSelectProduct, selectedBatchIds, toggleSelectBatch, onMobileClick, mobileExpanded, isMobileOverlay }: any) => {
    const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
    const [editProduct, setEditProduct] = useState<Product | null>(null);
    const [adjustBatch, setAdjustBatch] = useState<Batch | null>(null);
    const [billBatch, setBillBatch] = useState<Batch | null>(null);

    const toggleExpand = (pid: string) => {
        const newSet = new Set(expandedProducts);
        if (newSet.has(pid)) newSet.delete(pid); else newSet.add(pid);
        setExpandedProducts(newSet);
    };

    return (
        <>
        {/* DESKTOP TABLE (Or Mobile Expanded View) */}
        <div id="table-inventory" className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm ${mobileExpanded ? 'block' : 'hidden md:block'}`}>
             <table className="w-full text-left border-collapse table-fixed">
                <thead className="bg-gray-100 dark:bg-gray-900 text-xs text-gray-600 dark:text-gray-400 uppercase font-semibold">
                    <tr>
                         {!isMobileOverlay && <th className="px-4 py-4 w-10"></th>}
                         {deleteMode && !isMobileOverlay && (
                             <th className="px-2 py-4 w-10 text-center"></th>
                         )}
                         <th className="px-4 py-4 truncate">商品名称</th>
                         <th className="px-4 py-4 truncate">SKU/类别</th>
                         <th className="px-4 py-4 truncate">总库存</th>
                         <th className="px-4 py-4 text-right truncate">操作</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {data.map((item: any) => {
                        const isExpanded = mobileExpanded || expandedProducts.has(item.product.id);
                        return (
                            <React.Fragment key={item.product.id}>
                                {/* Parent Row - Hidden in Mobile Overlay usually unless we just want child rows */}
                                {!isMobileOverlay && (
                                    <tr className="hover:bg-blue-50 dark:hover:bg-gray-700 cursor-pointer transition-colors" onClick={() => !mobileExpanded && toggleExpand(item.product.id)}>
                                        <td className="px-4 py-4 text-center">
                                            {!mobileExpanded && <Icons.ChevronRight size={16} className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`} />}
                                        </td>
                                        {deleteMode && (
                                            <td className="px-2 py-4 text-center" onClick={e=>e.stopPropagation()}>
                                                <input type="checkbox" checked={selectedToDelete.has(item.product.id)} onChange={()=>toggleSelectProduct(item.product.id, item.batches.map((b:any)=>b.id))} className="w-5 h-5 rounded cursor-pointer accent-blue-600 border-2 dark:border-white dark:bg-gray-700" />
                                            </td>
                                        )}
                                        <td className="px-4 py-4 font-bold text-gray-800 dark:text-white truncate">{item.product.name}</td>
                                        <td className="px-4 py-4 text-gray-500 text-xs truncate">
                                            <div>{ph(item.product.sku)}</div>
                                            <div className="text-gray-400">{ph(item.product.category)}</div>
                                        </td>
                                        <td className="px-4 py-4 font-medium text-blue-700 dark:text-blue-400 truncate">{formatUnit(item.totalQuantity, item.product)}</td>
                                        <td className="px-4 py-4 text-right" onClick={e=>e.stopPropagation()}>
                                            <button onClick={()=>setEditProduct(item.product)} className="text-xs bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded hover:bg-gray-200 dark:text-white">调整</button>
                                        </td>
                                    </tr>
                                )}
                                {/* Child Rows */}
                                {isExpanded && (
                                    <tr className="bg-gray-50/50 dark:bg-gray-900/50 animate-fade-in">
                                        <td colSpan={deleteMode ? 6 : 5} className="p-0">
                                            <div className="border-t border-b border-gray-200 dark:border-gray-700">
                                                {/* Batch Header */}
                                                <div className="grid grid-cols-7 gap-2 bg-gray-200 dark:bg-gray-800 p-2 text-xs font-bold text-gray-600 dark:text-gray-300">
                                                    <div className="col-span-1 text-center">选择</div>
                                                    <div className="col-span-1">批号</div>
                                                    {currentStore === 'all' && <div className="col-span-1">门店</div>}
                                                    <div className={currentStore === 'all' ? 'col-span-1' : 'col-span-2'}>数量({item.product.unit_name})</div>
                                                    <div className="col-span-1">数量({item.product.split_unit_name || '散'})</div>
                                                    <div className="col-span-1">有效期</div>
                                                    <div className="col-span-1 text-right">操作</div>
                                                </div>
                                                {item.batches.map((batch: any) => {
                                                    const split = getUnitSplit(batch.quantity, item.product);
                                                    return (
                                                        <div key={batch.id} className="grid grid-cols-7 gap-2 items-center p-3 border-b dark:border-gray-800 last:border-0 hover:bg-white dark:hover:bg-gray-800 transition-colors text-sm">
                                                            <div className="col-span-1 text-center">
                                                                {deleteMode && <input type="checkbox" checked={selectedBatchIds.has(batch.id)} onChange={()=>toggleSelectBatch(batch.id)} className="w-4 h-4 accent-blue-600 dark:border-white" />}
                                                            </div>
                                                            <div className="col-span-1 font-mono text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1 rounded inline-block w-fit">{batch.batch_number}</div>
                                                            {currentStore === 'all' && <div className="col-span-1 text-gray-500 text-xs">{batch.store_name}</div>}
                                                            <div className={currentStore === 'all' ? 'col-span-1 font-bold text-green-700 dark:text-green-400' : 'col-span-2 font-bold text-green-700 dark:text-green-400'}>{split.major}</div>
                                                            <div className="col-span-1 text-gray-500">{split.minor}</div>
                                                            <div className="col-span-1 text-xs text-orange-600 dark:text-orange-400">{batch.expiry_date ? batch.expiry_date.split('T')[0] : '/'}</div>
                                                            <div className="col-span-1 text-right flex justify-end gap-1">
                                                                <button onClick={()=>setAdjustBatch(batch)} className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded dark:bg-blue-900 dark:text-blue-200">调</button>
                                                                <button onClick={()=>setBillBatch(batch)} className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded dark:bg-green-900 dark:text-green-200">单</button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {item.batches.length === 0 && <div className="text-center text-gray-400 text-xs py-4">无批次</div>}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
             </table>
        </div>

        {/* MOBILE CARD LIST (Default view) */}
        {!mobileExpanded && (
            <div className="md:hidden space-y-3">
                 {data.map((item: any) => (
                     <div key={item.product.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border dark:border-gray-700 flex justify-between items-center active:scale-[0.98] transition-transform" onClick={() => onMobileClick(item)}>
                         <div className="flex items-center gap-3">
                             {deleteMode && <input type="checkbox" checked={selectedToDelete.has(item.product.id)} onChange={(e)=>{e.stopPropagation(); toggleSelectProduct(item.product.id, item.batches.map((b:any)=>b.id));}} className="w-5 h-5 rounded accent-blue-600 dark:bg-gray-700 dark:border-white" />}
                             <div>
                                 <h3 className="font-bold text-gray-800 dark:text-white text-lg">{item.product.name}</h3>
                                 <p className="text-sm text-gray-500">{formatUnit(item.totalQuantity, item.product)}</p>
                             </div>
                         </div>
                         <Icons.ChevronRight size={24} className="text-gray-400" />
                     </div>
                 ))}
            </div>
        )}

        {/* MODALS */}
        {editProduct && <EditProductModal product={editProduct} onClose={()=>setEditProduct(null)} onSuccess={()=>{setEditProduct(null); onRefresh();}} />}
        {adjustBatch && <AdjustBatchModal batch={adjustBatch} onClose={()=>setAdjustBatch(null)} onSuccess={()=>{setAdjustBatch(null); onRefresh();}} product={data.find((i:any)=>i.product.id===adjustBatch.product_id)?.product}/>}
        {billBatch && <BillModal batch={billBatch} onClose={()=>setBillBatch(null)} onSuccess={()=>{setBillBatch(null); onRefresh();}} product={data.find((i:any)=>i.product.id===billBatch.product_id)?.product}/>}
        </>
    );
};

// ... (Rest of Modal Components remain same)
const EditProductModal = ({ product, onClose, onSuccess }: any) => {
    const [form, setForm] = useState({ name: product.name, sku: product.sku, category: product.category, unit_name: product.unit_name, split_unit_name: product.split_unit_name, split_ratio: product.split_ratio });
    const handleSave = async () => {
        await dataService.updateProduct(product.id, form);
        onSuccess();
    };
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-md shadow-2xl space-y-4">
                <h3 className="font-bold text-lg dark:text-white">调整商品信息 (不含库存)</h3>
                <input className="w-full border p-2 rounded dark:bg-gray-800 dark:text-white" placeholder="名称" value={form.name} onChange={e=>setForm({...form, name: e.target.value})} />
                <div className="grid grid-cols-2 gap-2">
                    <input className="border p-2 rounded dark:bg-gray-800 dark:text-white" placeholder="SKU" value={form.sku} onChange={e=>setForm({...form, sku: e.target.value})} />
                    <input className="border p-2 rounded dark:bg-gray-800 dark:text-white" placeholder="类别" value={form.category} onChange={e=>setForm({...form, category: e.target.value})} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <input className="border p-2 rounded dark:bg-gray-800 dark:text-white" placeholder="大单位" value={form.unit_name} onChange={e=>setForm({...form, unit_name: e.target.value})} />
                    <input className="border p-2 rounded dark:bg-gray-800 dark:text-white" placeholder="小单位" value={form.split_unit_name} onChange={e=>setForm({...form, split_unit_name: e.target.value})} />
                    <input type="number" className="border p-2 rounded dark:bg-gray-800 dark:text-white" placeholder="换算" value={form.split_ratio} onChange={e=>setForm({...form, split_ratio: Number(e.target.value)})} />
                </div>
                <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="px-4 py-2 text-gray-500">取消</button><button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded">保存</button></div>
            </div>
        </div>
    );
};

const AdjustBatchModal = ({ batch, product, onClose, onSuccess }: any) => {
    const [form, setForm] = useState({ batch_number: batch.batch_number || '', expiry_date: batch.expiry_date ? batch.expiry_date.split('T')[0] : '', quantity: batch.quantity });
    const handleSave = async () => {
        await dataService.adjustBatch(batch.id, { ...form, expiry_date: form.expiry_date ? new Date(form.expiry_date).toISOString() : null, quantity: Number(form.quantity) });
        onSuccess();
    };
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-md shadow-2xl space-y-4">
                <h3 className="font-bold text-lg dark:text-white">调整批次 ({batch.batch_number})</h3>
                <input className="w-full border p-2 rounded dark:bg-gray-800 dark:text-white" placeholder="批号" value={form.batch_number} onChange={e=>setForm({...form, batch_number: e.target.value})} />
                <input type="date" className="w-full border p-2 rounded dark:bg-gray-800 dark:text-white" value={form.expiry_date} onChange={e=>setForm({...form, expiry_date: e.target.value})} />
                <div className="flex items-center gap-2"><label className="whitespace-nowrap dark:text-gray-300">当前总数:</label><input type="number" className="w-full border p-2 rounded dark:bg-gray-800 dark:text-white" value={form.quantity} onChange={e=>setForm({...form, quantity: e.target.value})} /></div>
                <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="px-4 py-2 text-gray-500">取消</button><button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded">保存</button></div>
            </div>
        </div>
    );
};

const BillModal = ({ batch, product, onClose, onSuccess }: any) => {
    const [type, setType] = useState<'IN'|'OUT'>('OUT');
    const [qty, setQty] = useState(1);
    const [unitType, setUnitType] = useState<'WHOLE'|'SPLIT'>('WHOLE');

    const handleBill = async () => {
        try {
            const ratio = product.split_ratio || 1;
            const actualQty = unitType === 'WHOLE' ? qty * ratio : qty;
            await dataService.updateStock(product.id, batch.store_id, actualQty, type, `快速开单 (${unitType === 'WHOLE' ? '整' : '散'})`, batch.id);
            onSuccess();
        } catch(e:any) { alert(e.message); }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-center">
                <h3 className="font-bold text-lg dark:text-white">快速开单 ({product.name})</h3>
                <div className="flex gap-2 justify-center p-1 bg-gray-100 dark:bg-gray-800 rounded">
                    <button onClick={()=>setType('IN')} className={`flex-1 py-1 rounded ${type==='IN'?'bg-white shadow text-green-600':'text-gray-500'}`}>入库 (+)</button>
                    <button onClick={()=>setType('OUT')} className={`flex-1 py-1 rounded ${type==='OUT'?'bg-white shadow text-red-600':'text-gray-500'}`}>出库 (-)</button>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-left">
                    <div>
                        <label className="text-xs text-gray-500">单位类型</label>
                        <select 
                            value={unitType} 
                            onChange={e=>setUnitType(e.target.value as any)} 
                            className="w-full border p-2 rounded dark:bg-gray-800 dark:text-white text-sm"
                        >
                            <option value="WHOLE">整 ({product.unit_name})</option>
                            <option value="SPLIT">散 ({product.split_unit_name || '件'})</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">数量</label>
                        <input type="number" min="1" className="w-full border p-2 rounded dark:bg-gray-800 dark:text-white text-lg font-bold text-center" value={qty} onChange={e=>setQty(Number(e.target.value))} />
                    </div>
                </div>

                <div className="text-xs text-gray-400">
                    当前: {type === 'IN' ? '增加' : '减少'} {qty} {unitType === 'WHOLE' ? product.unit_name : (product.split_unit_name || '件')} 
                    {unitType === 'WHOLE' && ` (约 ${qty * (product.split_ratio || 1)} 散)`}
                </div>

                <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="flex-1 py-3 text-gray-500 bg-gray-100 rounded">取消</button><button onClick={handleBill} className="flex-1 py-3 bg-blue-600 text-white rounded font-bold">确认</button></div>
            </div>
        </div>
    );
};
