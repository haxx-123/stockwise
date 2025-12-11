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
        const key = `${p.name}::${p.sku || ''}`;
        if (!map.has(key)) {
             map.set(key, { product: p, totalQuantity: 0, batches: [], expiringSoon: 0 });
        }
    });

    batches.forEach(b => {
        const product = products.find(p => p.id === b.product_id);
        if (product) {
            const key = `${product.name}::${product.sku || ''}`;
            if (map.has(key)) {
                const agg = map.get(key)!;
                agg.totalQuantity += b.quantity; 
                agg.batches.push(b); 
            }
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
      setSelectedToDelete(newProdSet); setSelectedBatchIds(newBatchSet);
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

  if (loading) return <div className="p-8 dark:text-white flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-center">
              <div className="flex items-center gap-2 w-full md:w-auto">
                   <button onClick={() => deleteMode ? handleBulkDelete() : setDeleteMode(true)} className={`px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95 w-full md:w-auto ${deleteMode ? 'bg-red-600 text-white shadow-red-200 shadow-lg' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'}`}>
                      {deleteMode ? `确认删除 (${selectedToDelete.size + selectedBatchIds.size})` : '管理 / 删除'}
                   </button>
                   {deleteMode && (
                       <label className="flex items-center gap-1 cursor-pointer select-none px-2">
                           <input type="checkbox" onChange={handleSelectAllOnPage} className="w-5 h-5 accent-red-600 rounded border-2" />
                           <span className="text-sm font-bold dark:text-white">全选</span>
                       </label>
                   )}
              </div>
              
              {deleteMode && <button onClick={()=>{setDeleteMode(false); setSelectedToDelete(new Set());}} className="text-gray-500 text-sm dark:text-gray-400">取消</button>}

              <div className="flex-1 relative w-full group">
                  <input 
                    type="text" 
                    placeholder="搜索商品或批次..." 
                    // NO AUTOFOCUS HERE AS REQUESTED
                    className="w-full pl-10 pr-10 py-2.5 border-0 bg-gray-100 dark:bg-gray-700 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 transition-all" 
                    value={searchQuery} 
                    onChange={e => {setSearchQuery(e.target.value); setPage(1);}} 
                  />
                  <div className="absolute left-3 top-3 text-gray-400 group-focus-within:text-blue-500 transition-colors"><Icons.Sparkles size={18}/></div>
                  <button onClick={startScanner} className="absolute right-2 top-1.5 p-1.5 hover:bg-white dark:hover:bg-gray-600 rounded-lg transition-colors"><Icons.Scan size={18}/></button>
              </div>
              <div id="search-reader" className={isScanning ? 'block' : 'hidden'}></div>
              
              <select value={selectedCategory} onChange={e => {setSelectedCategory(e.target.value); setPage(1);}} className="border-0 bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-2.5 dark:text-white flex-1 md:flex-none font-medium">
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

      <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
           <button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="px-5 py-2 bg-gray-100 dark:bg-gray-700 rounded-xl disabled:opacity-50 dark:text-white font-bold transition-transform active:scale-95">上一页</button>
           <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Page {page} / {totalPages}</span>
           <button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} className="px-5 py-2 bg-gray-100 dark:bg-gray-700 rounded-xl disabled:opacity-50 dark:text-white font-bold transition-transform active:scale-95">下一页</button>
      </div>

      {mobileDetailItem && (
          <div className="fixed inset-0 bg-gray-50 dark:bg-gray-950 z-[100] overflow-y-auto animate-slide-in-right p-4 pb-24">
              <div className="flex items-center gap-3 mb-6 sticky top-0 bg-gray-50/80 dark:bg-gray-950/80 backdrop-blur-md z-10 py-4 border-b dark:border-gray-800">
                  <button onClick={() => setMobileDetailItem(null)} className="p-3 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-100 dark:border-gray-700"><Icons.ArrowRightLeft size={20} className="transform rotate-180 dark:text-white"/></button>
                  <h1 className="font-black text-xl dark:text-white truncate flex-1">{mobileDetailItem.product.name}</h1>
              </div>
              
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
                  <div className="flex justify-between items-start">
                       <div className="space-y-1">
                           <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">SKU Code</div>
                           <div className="font-mono text-gray-700 dark:text-gray-300 text-lg">{mobileDetailItem.product.sku || 'N/A'}</div>
                           <div className="inline-block px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs font-bold mt-2">{mobileDetailItem.product.category}</div>
                       </div>
                       <div className="text-right">
                           <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Stock</div>
                           <div className="text-3xl font-black text-blue-600 dark:text-blue-400">{formatUnit(mobileDetailItem.totalQuantity, mobileDetailItem.product)}</div>
                       </div>
                  </div>
              </div>

              <h3 className="font-bold text-lg dark:text-white mb-4 px-2">批次明细</h3>
              <InventoryTable 
                  data={[mobileDetailItem]} 
                  onRefresh={loadData} 
                  currentStore={currentStore}
                  deleteMode={deleteMode}
                  selectedToDelete={selectedToDelete}
                  selectedBatchIds={selectedBatchIds}
                  mobileExpanded={true} 
                  isMobileOverlay={true}
              />
          </div>
      )}
    </div>
  );
};

export const InventoryTable = ({ data, onRefresh, currentStore, deleteMode, selectedToDelete, toggleSelectProduct, selectedBatchIds, toggleSelectBatch, onMobileClick, mobileExpanded, isMobileOverlay }: any) => {
    // ... (Keeping logic same, just updating classes for styling)
    const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
    const [editProduct, setEditProduct] = useState<Product | null>(null);
    const [adjustBatch, setAdjustBatch] = useState<Batch | null>(null);
    const [billBatch, setBillBatch] = useState<Batch | null>(null);
    const toggleExpand = (pid: string) => { const newSet = new Set(expandedProducts); if (newSet.has(pid)) newSet.delete(pid); else newSet.add(pid); setExpandedProducts(newSet); };

    return (
        <>
        <div id="table-inventory" className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm ${mobileExpanded ? 'block' : 'hidden md:block'}`}>
             <table className="w-full text-left border-collapse table-fixed">
                <thead className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider">
                    <tr>
                         {!isMobileOverlay && <th className="px-6 py-4 w-12"></th>}
                         {deleteMode && !isMobileOverlay && <th className="px-2 py-4 w-10 text-center"></th>}
                         <th className="px-6 py-4 truncate w-1/4">商品名称</th>
                         <th className="px-6 py-4 truncate w-1/6">SKU / 类别</th>
                         <th className="px-6 py-4 truncate w-1/4">总库存</th>
                         <th className="px-6 py-4 text-right truncate w-1/6">操作</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {data.map((item: any, idx: number) => {
                        const isExpanded = mobileExpanded || expandedProducts.has(item.product.id);
                        return (
                            <React.Fragment key={item.product.id}>
                                {!isMobileOverlay && (
                                    <tr className={`hover:bg-blue-50/50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors stagger-${(idx%5)+1}`} onClick={() => !mobileExpanded && toggleExpand(item.product.id)}>
                                        <td className="px-6 py-4 text-center">
                                            {!mobileExpanded && <Icons.ChevronRight size={16} className={`text-gray-400 transform transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`} />}
                                        </td>
                                        {deleteMode && (
                                            <td className="px-2 py-4 text-center" onClick={e=>e.stopPropagation()}>
                                                <input type="checkbox" checked={selectedToDelete.has(item.product.id)} onChange={()=>toggleSelectProduct(item.product.id, item.batches.map((b:any)=>b.id))} className="w-5 h-5 rounded cursor-pointer accent-red-600" />
                                            </td>
                                        )}
                                        <td className="px-6 py-4 font-bold text-gray-800 dark:text-white truncate text-base">{item.product.name}</td>
                                        <td className="px-6 py-4">
                                            <div className="font-mono text-xs text-gray-600 dark:text-gray-300">{ph(item.product.sku)}</div>
                                            <span className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-500">{ph(item.product.category)}</span>
                                        </td>
                                        <td className="px-6 py-4 font-bold text-blue-600 dark:text-blue-400 truncate">{formatUnit(item.totalQuantity, item.product)}</td>
                                        <td className="px-6 py-4 text-right" onClick={e=>e.stopPropagation()}>
                                            <button onClick={()=>setEditProduct(item.product)} className="text-xs bg-white border border-gray-200 dark:bg-gray-700 dark:border-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 shadow-sm font-bold dark:text-white">调整</button>
                                        </td>
                                    </tr>
                                )}
                                {isExpanded && (
                                    <tr className="bg-gray-50/30 dark:bg-black/20 animate-fade-in">
                                        <td colSpan={deleteMode ? 6 : 5} className="p-0">
                                            <div className="p-4 space-y-2">
                                                {item.batches.map((batch: any) => {
                                                    const split = getUnitSplit(batch.quantity, item.product);
                                                    return (
                                                        <div key={batch.id} className="flex items-center p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm gap-4">
                                                            {deleteMode && <input type="checkbox" checked={selectedBatchIds.has(batch.id)} onChange={()=>toggleSelectBatch(batch.id)} className="w-4 h-4 accent-red-600" />}
                                                            <div className="flex-1 font-mono text-xs text-purple-600 bg-purple-50 dark:bg-purple-900/20 px-2 py-1 rounded w-fit">{batch.batch_number}</div>
                                                            <div className="flex-1 text-xs text-gray-500 font-bold">{batch.store_name}</div>
                                                            <div className="flex-1 font-bold text-gray-800 dark:text-gray-200">{split.major}{item.product.unit_name}</div>
                                                            <div className="flex-1 text-gray-500">{split.minor}{item.product.split_unit_name||'件'}</div>
                                                            <div className="flex-1 text-xs bg-orange-50 text-orange-600 px-2 py-1 rounded dark:bg-orange-900/20 w-fit">{batch.expiry_date?.split('T')[0] || 'N/A'}</div>
                                                            <div className="flex gap-2">
                                                                <button onClick={()=>setAdjustBatch(batch)} className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-100">调</button>
                                                                <button onClick={()=>setBillBatch(batch)} className="text-xs bg-green-50 text-green-600 px-3 py-1.5 rounded-lg font-bold hover:bg-green-100">单</button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {item.batches.length === 0 && <div className="text-center text-gray-400 text-xs py-2 italic">无批次库存</div>}
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

        {!mobileExpanded && (
            <div className="md:hidden space-y-3 pb-24">
                 {data.map((item: any, i: number) => (
                     <div key={item.product.id} className={`bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex justify-between items-center active:scale-[0.98] transition-all stagger-${(i%5)+1}`} onClick={() => onMobileClick(item)}>
                         <div className="flex items-center gap-4 overflow-hidden">
                             {deleteMode && <input type="checkbox" checked={selectedToDelete.has(item.product.id)} onChange={(e)=>{e.stopPropagation(); toggleSelectProduct(item.product.id, item.batches.map((b:any)=>b.id));}} className="w-5 h-5 rounded accent-red-600 shrink-0" />}
                             <div className="min-w-0">
                                 <h3 className="font-bold text-gray-800 dark:text-white text-lg truncate">{item.product.name}</h3>
                                 <div className="flex items-center gap-2 mt-1">
                                     <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 px-1.5 py-0.5 rounded">{item.product.category}</span>
                                     <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{formatUnit(item.totalQuantity, item.product)}</span>
                                 </div>
                             </div>
                         </div>
                         <Icons.ChevronRight size={20} className="text-gray-300 flex-shrink-0" />
                     </div>
                 ))}
            </div>
        )}
        
        {/* Modals remain same logic but slightly updated UI classes if needed (already generally generic) */}
        {editProduct && <EditProductModal product={editProduct} onClose={()=>setEditProduct(null)} onSuccess={()=>{setEditProduct(null); onRefresh();}} />}
        {adjustBatch && <AdjustBatchModal batch={adjustBatch} onClose={()=>setAdjustBatch(null)} onSuccess={()=>{setAdjustBatch(null); onRefresh();}} product={data.find((i:any)=>i.product.id===adjustBatch.product_id)?.product}/>}
        {billBatch && <BillModal batch={billBatch} onClose={()=>setBillBatch(null)} onSuccess={()=>{setBillBatch(null); onRefresh();}} product={data.find((i:any)=>i.product.id===billBatch.product_id)?.product}/>}
        </>
    );
};
// ... Keeping modal sub-components ...
const EditProductModal = ({ product, onClose, onSuccess }: any) => { /* Same logic */ const [form, setForm] = useState({ name: product.name, sku: product.sku, category: product.category, unit_name: product.unit_name, split_unit_name: product.split_unit_name, split_ratio: product.split_ratio }); const handleSave = async () => { await dataService.updateProduct(product.id, form); onSuccess(); }; return ( <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4"> <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 animate-scale-in"> <h3 className="font-black text-xl dark:text-white">调整商品</h3> <input className="w-full bg-gray-100 dark:bg-gray-800 border-0 p-3 rounded-xl dark:text-white" placeholder="名称" value={form.name} onChange={e=>setForm({...form, name: e.target.value})} /> <div className="grid grid-cols-2 gap-3"> <input className="bg-gray-100 dark:bg-gray-800 border-0 p-3 rounded-xl dark:text-white" placeholder="SKU" value={form.sku} onChange={e=>setForm({...form, sku: e.target.value})} /> <input className="bg-gray-100 dark:bg-gray-800 border-0 p-3 rounded-xl dark:text-white" placeholder="类别" value={form.category} onChange={e=>setForm({...form, category: e.target.value})} /> </div> <div className="grid grid-cols-3 gap-3"> <input className="bg-gray-100 dark:bg-gray-800 border-0 p-3 rounded-xl dark:text-white" placeholder="大单位" value={form.unit_name} onChange={e=>setForm({...form, unit_name: e.target.value})} /> <input className="bg-gray-100 dark:bg-gray-800 border-0 p-3 rounded-xl dark:text-white" placeholder="小单位" value={form.split_unit_name} onChange={e=>setForm({...form, split_unit_name: e.target.value})} /> <input type="number" className="bg-gray-100 dark:bg-gray-800 border-0 p-3 rounded-xl dark:text-white" placeholder="换算" value={form.split_ratio} onChange={e=>setForm({...form, split_ratio: Number(e.target.value)})} /> </div> <div className="flex gap-3 mt-6"> <button onClick={onClose} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-gray-500">取消</button> <button onClick={handleSave} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg">保存</button> </div> </div> </div> ); };
const AdjustBatchModal = ({ batch, product, onClose, onSuccess }: any) => { /* Same logic */ const [form, setForm] = useState({ batch_number: batch.batch_number || '', expiry_date: batch.expiry_date ? batch.expiry_date.split('T')[0] : '', quantity: batch.quantity }); const handleSave = async () => { await dataService.adjustBatch(batch.id, { ...form, expiry_date: form.expiry_date ? new Date(form.expiry_date).toISOString() : null, quantity: Number(form.quantity) }); onSuccess(); }; return ( <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4"> <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 animate-scale-in"> <h3 className="font-black text-xl dark:text-white">批次调整 ({batch.batch_number})</h3> <input className="w-full bg-gray-100 dark:bg-gray-800 border-0 p-3 rounded-xl dark:text-white" placeholder="批号" value={form.batch_number} onChange={e=>setForm({...form, batch_number: e.target.value})} /> <input type="date" className="w-full bg-gray-100 dark:bg-gray-800 border-0 p-3 rounded-xl dark:text-white" value={form.expiry_date} onChange={e=>setForm({...form, expiry_date: e.target.value})} /> <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 p-3 rounded-xl"> <label className="whitespace-nowrap dark:text-gray-300 text-sm font-bold">数量:</label> <input type="number" className="w-full bg-transparent border-0 font-mono text-xl font-bold dark:text-white text-right outline-none" value={form.quantity} onChange={e=>setForm({...form, quantity: e.target.value})} /> </div> <div className="flex gap-3 mt-6"> <button onClick={onClose} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-gray-500">取消</button> <button onClick={handleSave} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg">保存</button> </div> </div> </div> ); };
const BillModal = ({ batch, product, onClose, onSuccess }: any) => { /* Same logic */ const [type, setType] = useState<'IN'|'OUT'>('OUT'); const [qty, setQty] = useState(1); const [unitType, setUnitType] = useState<'WHOLE'|'SPLIT'>('WHOLE'); const handleBill = async () => { try { const ratio = product.split_ratio || 1; const actualQty = unitType === 'WHOLE' ? qty * ratio : qty; await dataService.updateStock(product.id, batch.store_id, actualQty, type, `快速开单`, batch.id); onSuccess(); } catch(e:any) { alert(e.message); } }; return ( <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4"> <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-center animate-scale-in"> <h3 className="font-black text-xl dark:text-white">快速开单</h3> <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl"> <button onClick={()=>setType('IN')} className={`flex-1 py-2 rounded-lg font-bold transition-all ${type==='IN'?'bg-white shadow text-green-600':'text-gray-500'}`}>入库 +</button> <button onClick={()=>setType('OUT')} className={`flex-1 py-2 rounded-lg font-bold transition-all ${type==='OUT'?'bg-white shadow text-red-600':'text-gray-500'}`}>出库 -</button> </div> <div className="space-y-3 text-left"> <div> <label className="text-xs font-bold text-gray-400">单位</label> <select value={unitType} onChange={e=>setUnitType(e.target.value as any)} className="w-full bg-gray-100 dark:bg-gray-800 border-0 p-3 rounded-xl text-sm font-bold outline-none dark:text-white"> <option value="WHOLE">整 ({product.unit_name})</option> <option value="SPLIT">散 ({product.split_unit_name || '件'})</option> </select> </div> <div> <label className="text-xs font-bold text-gray-400">数量</label> <input type="number" min="1" className="w-full bg-gray-100 dark:bg-gray-800 border-0 p-3 rounded-xl text-2xl font-black text-center outline-none dark:text-white" value={qty} onChange={e=>setQty(Number(e.target.value))} /> </div> </div> <div className="flex gap-3 mt-4"> <button onClick={onClose} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-gray-500">取消</button> <button onClick={handleBill} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-transform">确认</button> </div> </div> </div> ); };
