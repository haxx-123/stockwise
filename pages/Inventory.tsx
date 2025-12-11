


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

  if (loading) return <div className="p-8 dark:text-white flex justify-center"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-center">
              <div className="flex items-center gap-2 w-full md:w-auto">
                   <button onClick={() => deleteMode ? handleBulkDelete() : setDeleteMode(true)} className={`px-4 py-2.5 rounded-xl font-bold transition-all w-full md:w-auto btn-press ${deleteMode ? 'bg-red-600 text-white shadow-red-500/30 shadow-lg' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                      {deleteMode ? `确认删除 (${selectedToDelete.size + selectedBatchIds.size})` : '批量管理'}
                   </button>
                   {deleteMode && (
                       <label className="flex items-center gap-1 cursor-pointer select-none">
                           <input type="checkbox" onChange={handleSelectAllOnPage} className="w-5 h-5 accent-red-600 rounded border-2 border-white" />
                           <span className="text-sm font-bold dark:text-white">全选</span>
                       </label>
                   )}
              </div>
              
              {deleteMode && <button onClick={()=>{setDeleteMode(false); setSelectedToDelete(new Set());}} className="text-gray-500 text-sm dark:text-gray-400">取消</button>}

              <div className="flex-1 relative w-full">
                  <input 
                    type="text" 
                    placeholder="搜索商品..." 
                    // REMOVED AUTO FOCUS FOR MOBILE OPTIMIZATION
                    className="w-full pl-10 pr-10 py-2.5 border-none bg-gray-100 dark:bg-gray-700/50 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 transition-all" 
                    value={searchQuery} 
                    onChange={e => {setSearchQuery(e.target.value); setPage(1);}} 
                  />
                  <div className="absolute left-3 top-3 text-gray-400"><Icons.Sparkles size={18}/></div>
                  <button onClick={startScanner} className="absolute right-2 top-1.5 p-1.5 bg-white dark:bg-gray-600 rounded-lg shadow-sm"><Icons.Scan size={16}/></button>
              </div>
              <div id="search-reader" className={isScanning ? 'block rounded-xl overflow-hidden shadow-lg' : 'hidden'}></div>
              
              <select value={selectedCategory} onChange={e => {setSelectedCategory(e.target.value); setPage(1);}} className="border-none bg-gray-100 dark:bg-gray-700/50 rounded-xl px-4 py-2.5 dark:text-white flex-1 md:flex-none font-medium">
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

      <div className="flex justify-between items-center bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
           <button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="px-4 py-2 bg-white dark:bg-gray-700 rounded-xl shadow-sm border border-gray-100 dark:border-gray-600 disabled:opacity-50 dark:text-white btn-press">上一页</button>
           <span className="text-sm font-mono text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">Page {page} / {totalPages || 1}</span>
           <button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} className="px-4 py-2 bg-white dark:bg-gray-700 rounded-xl shadow-sm border border-gray-100 dark:border-gray-600 disabled:opacity-50 dark:text-white btn-press">下一页</button>
      </div>

      {mobileDetailItem && (
          <div className="fixed inset-0 bg-gray-50 dark:bg-gray-900 z-50 overflow-y-auto animate-slide-in-right p-4 pb-24">
              <div className="flex items-center gap-3 mb-4 sticky top-0 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur z-10 py-2">
                  <button onClick={() => setMobileDetailItem(null)} className="p-3 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-100 dark:border-gray-700 btn-press"><Icons.ArrowRightLeft size={20} className="transform rotate-180 dark:text-white"/></button>
                  <h1 className="font-bold text-lg dark:text-white truncate flex-1">{mobileDetailItem.product.name}</h1>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-xl shadow-blue-900/5 border border-blue-50 dark:border-gray-700 mb-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-bl-full -mr-4 -mt-4"></div>
                  <div className="flex justify-between items-center relative z-10">
                       <div className="space-y-1">
                           <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">SKU: {mobileDetailItem.product.sku}</div>
                           <div className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full w-fit">{mobileDetailItem.product.category}</div>
                       </div>
                       <div className="text-right">
                           <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">{formatUnit(mobileDetailItem.totalQuantity, mobileDetailItem.product)}</div>
                           <div className="text-xs text-gray-400">总库存</div>
                       </div>
                  </div>
              </div>

              <h3 className="font-bold dark:text-white mb-3 ml-1 flex items-center gap-2"><Icons.Box size={16}/> 批次明细</h3>
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
        <div id="table-inventory" className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm ${mobileExpanded ? 'block' : 'hidden md:block'}`}>
             <table className="w-full text-left border-collapse table-fixed">
                <thead className="bg-gray-50/50 dark:bg-gray-900/50 text-xs text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider">
                    <tr>
                         {!isMobileOverlay && <th className="px-6 py-4 w-12"></th>}
                         {deleteMode && !isMobileOverlay && (
                             <th className="px-2 py-4 w-12 text-center"></th>
                         )}
                         <th className="px-6 py-4 truncate w-1/4">商品名称</th>
                         <th className="px-6 py-4 truncate w-1/6">SKU / 类别</th>
                         <th className="px-6 py-4 truncate w-1/4">总库存</th>
                         <th className="px-6 py-4 text-right truncate w-1/6">操作</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {data.map((item: any, idx: number) => {
                        const isExpanded = mobileExpanded || expandedProducts.has(item.product.id);
                        return (
                            <React.Fragment key={item.product.id}>
                                {!isMobileOverlay && (
                                    <tr className="hover:bg-blue-50/30 dark:hover:bg-gray-700/30 cursor-pointer transition-colors stagger-item" style={{animationDelay: `${idx*0.05}s`}} onClick={() => !mobileExpanded && toggleExpand(item.product.id)}>
                                        <td className="px-6 py-4 text-center">
                                            {!mobileExpanded && <div className={`p-1 rounded-full transition-colors ${isExpanded?'bg-blue-100 text-blue-600':''}`}><Icons.ChevronRight size={16} className={`transform transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`} /></div>}
                                        </td>
                                        {deleteMode && (
                                            <td className="px-2 py-4 text-center" onClick={e=>e.stopPropagation()}>
                                                <input type="checkbox" checked={selectedToDelete.has(item.product.id)} onChange={()=>toggleSelectProduct(item.product.id, item.batches.map((b:any)=>b.id))} className="w-5 h-5 rounded cursor-pointer accent-red-600" />
                                            </td>
                                        )}
                                        <td className="px-6 py-4 font-bold text-gray-800 dark:text-white truncate text-base">{item.product.name}</td>
                                        <td className="px-6 py-4">
                                            <div className="text-gray-900 dark:text-gray-200 font-mono text-xs">{ph(item.product.sku)}</div>
                                            <div className="text-gray-400 text-xs mt-0.5 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded w-fit">{ph(item.product.category)}</div>
                                        </td>
                                        <td className="px-6 py-4 font-bold text-blue-600 dark:text-blue-400 truncate font-mono text-base">{formatUnit(item.totalQuantity, item.product)}</td>
                                        <td className="px-6 py-4 text-right" onClick={e=>e.stopPropagation()}>
                                            <button onClick={()=>setEditProduct(item.product)} className="text-xs font-bold text-gray-600 bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 hover:scale-105 transition-all dark:text-gray-300">调整属性</button>
                                        </td>
                                    </tr>
                                )}
                                {isExpanded && (
                                    <tr className="bg-gray-50/30 dark:bg-gray-900/30 animate-fade-in">
                                        <td colSpan={deleteMode ? 6 : 5} className="p-4">
                                            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-inner">
                                                <div className="flex bg-gray-100 dark:bg-gray-900 p-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                    <div className="w-10 text-center">#</div>
                                                    <div className="flex-1">批号</div>
                                                    <div className="flex-1">门店</div>
                                                    <div className="flex-1">数量({item.product.unit_name})</div>
                                                    <div className="flex-1">有效期</div>
                                                    <div className="w-24 text-right">操作</div>
                                                </div>
                                                {item.batches.map((batch: any) => {
                                                    const split = getUnitSplit(batch.quantity, item.product);
                                                    return (
                                                        <div key={batch.id} className="flex items-center p-3 border-b border-gray-50 dark:border-gray-700 last:border-0 hover:bg-blue-50/20 dark:hover:bg-gray-700/20 transition-colors text-sm group">
                                                            <div className="w-10 text-center">
                                                                {deleteMode && <input type="checkbox" checked={selectedBatchIds.has(batch.id)} onChange={()=>toggleSelectBatch(batch.id)} className="w-4 h-4 accent-red-600" />}
                                                            </div>
                                                            <div className="flex-1 font-mono font-bold text-gray-700 dark:text-gray-200">
                                                                {batch.batch_number}
                                                            </div>
                                                            <div className="flex-1 text-xs font-bold text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded w-fit h-fit">{batch.store_name || '未知'}</div>
                                                            <div className="flex-1 flex items-baseline gap-1">
                                                                <span className="font-bold text-gray-900 dark:text-white">{split.major}</span>
                                                                <span className="text-xs text-gray-400">/ {split.minor}{item.product.split_unit_name}</span>
                                                            </div>
                                                            <div className="flex-1 text-xs font-mono text-orange-500">
                                                                {batch.expiry_date ? batch.expiry_date.split('T')[0] : '/'}
                                                            </div>
                                                            <div className="w-24 text-right flex justify-end gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button onClick={()=>setAdjustBatch(batch)} className="text-xs font-bold text-blue-600 bg-blue-50 p-1.5 rounded hover:bg-blue-100">调</button>
                                                                <button onClick={()=>setBillBatch(batch)} className="text-xs font-bold text-green-600 bg-green-50 p-1.5 rounded hover:bg-green-100">单</button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {item.batches.length === 0 && <div className="text-center text-gray-400 text-xs py-6">无库存批次</div>}
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
            <div className="md:hidden space-y-3">
                 {data.map((item: any, idx: number) => (
                     <div key={item.product.id} className="bg-white/90 dark:bg-gray-800/90 backdrop-blur p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex justify-between items-center active:scale-[0.98] transition-all stagger-item" style={{animationDelay: `${idx*0.05}s`}} onClick={() => onMobileClick(item)}>
                         <div className="flex items-center gap-4 overflow-hidden">
                             {deleteMode && <input type="checkbox" checked={selectedToDelete.has(item.product.id)} onChange={(e)=>{e.stopPropagation(); toggleSelectProduct(item.product.id, item.batches.map((b:any)=>b.id));}} className="w-6 h-6 rounded-full accent-red-600 flex-shrink-0" />}
                             <div className="min-w-0">
                                 <h3 className="font-bold text-gray-800 dark:text-white text-lg truncate">{item.product.name}</h3>
                                 <div className="flex items-center gap-2 mt-1">
                                     <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 px-2 py-0.5 rounded-full">{item.product.category || '未分类'}</span>
                                     <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{formatUnit(item.totalQuantity, item.product)}</span>
                                 </div>
                             </div>
                         </div>
                         <div className="w-8 h-8 rounded-full bg-gray-50 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 text-gray-400">
                            <Icons.ChevronRight size={18} />
                         </div>
                     </div>
                 ))}
            </div>
        )}

        {editProduct && <EditProductModal product={editProduct} onClose={()=>setEditProduct(null)} onSuccess={()=>{setEditProduct(null); onRefresh();}} />}
        {adjustBatch && <AdjustBatchModal batch={adjustBatch} onClose={()=>setAdjustBatch(null)} onSuccess={()=>{setAdjustBatch(null); onRefresh();}} product={data.find((i:any)=>i.product.id===adjustBatch.product_id)?.product}/>}
        {billBatch && <BillModal batch={billBatch} onClose={()=>setBillBatch(null)} onSuccess={()=>{setBillBatch(null); onRefresh();}} product={data.find((i:any)=>i.product.id===billBatch.product_id)?.product}/>}
        </>
    );
};

const EditProductModal = ({ product, onClose, onSuccess }: any) => {
    const [form, setForm] = useState({ name: product.name, sku: product.sku, category: product.category, unit_name: product.unit_name, split_unit_name: product.split_unit_name, split_ratio: product.split_ratio });
    const handleSave = async () => { await dataService.updateProduct(product.id, form); onSuccess(); };
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-fade-in">
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-6 animate-scale-in">
                <h3 className="font-bold text-xl dark:text-white">商品属性调整</h3>
                <div className="space-y-4">
                    <input className="w-full border p-3 rounded-xl dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 ring-blue-500 outline-none transition-all" placeholder="名称" value={form.name} onChange={e=>setForm({...form, name: e.target.value})} />
                    <div className="grid grid-cols-2 gap-4">
                        <input className="border p-3 rounded-xl dark:bg-gray-800 dark:border-gray-700 dark:text-white" placeholder="SKU" value={form.sku} onChange={e=>setForm({...form, sku: e.target.value})} />
                        <input className="border p-3 rounded-xl dark:bg-gray-800 dark:border-gray-700 dark:text-white" placeholder="类别" value={form.category} onChange={e=>setForm({...form, category: e.target.value})} />
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl space-y-3">
                        <p className="text-xs font-bold text-gray-400 uppercase">单位配置</p>
                        <div className="grid grid-cols-3 gap-3">
                            <input className="border p-2 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-center" placeholder="大单位" value={form.unit_name} onChange={e=>setForm({...form, unit_name: e.target.value})} />
                            <input className="border p-2 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-center" placeholder="小单位" value={form.split_unit_name} onChange={e=>setForm({...form, split_unit_name: e.target.value})} />
                            <input type="number" className="border p-2 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-center font-mono" placeholder="换算" value={form.split_ratio} onChange={e=>setForm({...form, split_ratio: Number(e.target.value)})} />
                        </div>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 text-gray-600 font-bold bg-gray-100 rounded-xl hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300">取消</button>
                    <button onClick={handleSave} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg hover:bg-blue-700 btn-press">保存</button>
                </div>
            </div>
        </div>
    );
};

const AdjustBatchModal = ({ batch, onClose, onSuccess }: any) => {
    const [form, setForm] = useState({ batch_number: batch.batch_number || '', expiry_date: batch.expiry_date ? batch.expiry_date.split('T')[0] : '', quantity: batch.quantity });
    const handleSave = async () => { await dataService.adjustBatch(batch.id, { ...form, expiry_date: form.expiry_date ? new Date(form.expiry_date).toISOString() : null, quantity: Number(form.quantity) }); onSuccess(); };
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-fade-in">
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-6 animate-scale-in">
                <div className="flex justify-between items-center">
                    <h3 className="font-bold text-xl dark:text-white">批次调整</h3>
                    <span className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-gray-500">{batch.batch_number}</span>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">批号</label>
                        <input className="w-full border p-3 rounded-xl dark:bg-gray-800 dark:border-gray-700 dark:text-white font-mono" value={form.batch_number} onChange={e=>setForm({...form, batch_number: e.target.value})} />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">有效期</label>
                        <input type="date" className="w-full border p-3 rounded-xl dark:bg-gray-800 dark:border-gray-700 dark:text-white" value={form.expiry_date} onChange={e=>setForm({...form, expiry_date: e.target.value})} />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-blue-500 uppercase mb-1 block">当前总库存</label>
                        <input type="number" className="w-full border-2 border-blue-100 p-3 rounded-xl dark:bg-gray-800 dark:border-blue-900/30 dark:text-white text-xl font-bold text-blue-600" value={form.quantity} onChange={e=>setForm({...form, quantity: e.target.value})} />
                    </div>
                </div>
                <div className="flex gap-3 pt-2">
                    <button onClick={onClose} className="flex-1 py-3 text-gray-600 font-bold bg-gray-100 rounded-xl hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300">取消</button>
                    <button onClick={handleSave} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg hover:bg-blue-700 btn-press">保存</button>
                </div>
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-fade-in">
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-6 text-center animate-scale-in">
                <h3 className="font-bold text-xl dark:text-white">快速开单</h3>
                <div className="bg-gray-100 dark:bg-gray-800 p-1.5 rounded-xl flex">
                    <button onClick={()=>setType('IN')} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${type==='IN'?'bg-white dark:bg-gray-700 shadow text-green-600':'text-gray-400'}`}>入库 (+)</button>
                    <button onClick={()=>setType('OUT')} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${type==='OUT'?'bg-white dark:bg-gray-700 shadow text-red-600':'text-gray-400'}`}>出库 (-)</button>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-left">
                    <div>
                        <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">单位</label>
                        <select 
                            value={unitType} 
                            onChange={e=>setUnitType(e.target.value as any)} 
                            className="w-full border p-3 rounded-xl dark:bg-gray-800 dark:border-gray-700 dark:text-white text-sm font-bold"
                        >
                            <option value="WHOLE">{product.unit_name} (整)</option>
                            <option value="SPLIT">{product.split_unit_name || '件'} (散)</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">数量</label>
                        <input type="number" min="1" className="w-full border p-3 rounded-xl dark:bg-gray-800 dark:border-gray-700 dark:text-white text-lg font-bold text-center" value={qty} onChange={e=>setQty(Number(e.target.value))} />
                    </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl">
                    <p className="text-xs text-blue-600 dark:text-blue-300">
                        {type === 'IN' ? '增加' : '扣除'} <span className="font-bold text-lg mx-1">{qty}</span> {unitType === 'WHOLE' ? product.unit_name : (product.split_unit_name || '件')}
                    </p>
                    {unitType === 'WHOLE' && <p className="text-[10px] text-blue-400 mt-1">≈ {qty * (product.split_ratio || 1)} {product.split_unit_name || '件'}</p>}
                </div>

                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 text-gray-600 font-bold bg-gray-100 rounded-xl hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300">取消</button>
                    <button onClick={handleBill} className={`flex-1 py-3 text-white rounded-xl font-bold shadow-lg btn-press ${type==='IN'?'bg-green-600 hover:bg-green-700':'bg-red-600 hover:bg-red-700'}`}>确认</button>
                </div>
            </div>
        </div>
    );
};