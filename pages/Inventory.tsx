
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Icons } from '../components/Icons';
import { dataService } from '../services/dataService';
import { Batch, Product, Store, AggregatedStock } from '../types';
import { isConfigured } from '../services/supabaseClient';
import { formatUnit, ph, matchSearch } from '../utils/formatters';

declare const Html5Qrcode: any;

interface InventoryProps {
  currentStore?: string;
}

export const Inventory: React.FC<InventoryProps> = ({ currentStore }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<Store[]>([]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<any>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advFilters, setAdvFilters] = useState({ sku: '', batch: '', dateRange: '' });
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Pagination & Delete Mode
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;
  const [inputPage, setInputPage] = useState(1); // Local input state
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedToDelete, setSelectedToDelete] = useState<Set<string>>(new Set());
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  
  // Mobile Details View
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
    setInputPage(1);
    setSelectedToDelete(new Set());
    setSelectedBatchIds(new Set());
  }, [currentStore]);

  useEffect(() => {
    setInputPage(page);
  }, [page]);

  // --- SCANNER ---
  const startScanner = async () => {
      if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
          return alert("安全限制：摄像头只能在 HTTPS 或 localhost 下使用。");
      }
      if (isScanning) return;
      try {
          const html5QrCode = new Html5Qrcode("reader");
          scannerRef.current = html5QrCode;
          setIsScanning(true);
          
          const config = { 
              fps: 10, 
              qrbox: { width: 250, height: 150 },
              aspectRatio: 1.0,
          };
          
          await html5QrCode.start({ facingMode: "environment" }, config, (decodedText: string) => {
              setSearchQuery(decodedText);
              stopScanner();
          }, (errorMessage: any) => { });
      } catch (err: any) {
          setIsScanning(false);
          alert(`相机启动失败: ${err.message}`);
      }
  };

  const stopScanner = async () => {
      if (scannerRef.current) {
          try { await scannerRef.current.stop(); await scannerRef.current.clear(); } catch(e){}
          scannerRef.current = null;
      }
      setIsScanning(false);
  };

  useEffect(() => () => { if(scannerRef.current) stopScanner(); }, []);

  // --- DATA AGGREGATION ---
  const aggregatedData = useMemo(() => {
    let filteredBatches = batches;
    if (advFilters.batch) filteredBatches = filteredBatches.filter(b => b.batch_number?.toLowerCase().includes(advFilters.batch.toLowerCase()));
    
    const map = new Map<string, AggregatedStock>();
    
    products.forEach(p => {
        if (!map.has(p.id)) map.set(p.id, { product: p, totalQuantity: 0, batches: [], expiringSoon: 0 });
    });

    filteredBatches.forEach(b => {
        if (map.has(b.product_id)) {
            const agg = map.get(b.product_id)!;
            agg.totalQuantity += b.quantity;
            agg.batches.push(b);
        }
    });

    let result = Array.from(map.values());

    result = result.filter(item => {
        if (selectedCategory !== 'All' && (item.product.category || '未分类') !== selectedCategory) return false;
        if (advFilters.sku && !item.product.sku?.toLowerCase().includes(advFilters.sku.toLowerCase())) return false;
        if (searchQuery) {
            const q = searchQuery.trim();
            const nameMatch = matchSearch(item.product.name, q);
            const skuMatch = item.product.sku?.toLowerCase().includes(q.toLowerCase());
            const batchMatch = item.batches.some(b => b.batch_number?.toLowerCase().includes(q.toLowerCase()));
            if (!nameMatch && !skuMatch && !batchMatch) return false;
        }
        return true;
    });

    return result;
  }, [batches, products, searchQuery, selectedCategory, advFilters]);

  const categories = useMemo(() => ['All', ...new Set(products.map(p => p.category || '未分类'))], [products]);
  
  // Pagination
  const totalPages = Math.ceil(aggregatedData.length / PAGE_SIZE);
  useEffect(() => { if (page > totalPages && totalPages > 0) setPage(totalPages); }, [totalPages]);

  const paginatedData = aggregatedData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Pagination Handlers
  const commitPageInput = () => {
      let p = inputPage;
      if (isNaN(p)) p = 1;
      if (p < 1) p = 1;
      if (totalPages > 0 && p > totalPages) p = totalPages;
      setPage(p);
      setInputPage(p);
  };

  // Bulk Delete Logic
  const handleBulkDelete = async () => {
      const totalCount = selectedToDelete.size + selectedBatchIds.size;
      if (totalCount === 0) return;
      if (!confirm(`确认删除选中的 ${selectedToDelete.size} 个商品和 ${selectedBatchIds.size} 个批次? (操作将归档)`)) return;
      try {
          for (const bid of selectedBatchIds) await dataService.deleteBatch(bid);
          for (const pid of selectedToDelete) await dataService.deleteProduct(pid);
          alert("删除成功");
          setSelectedToDelete(new Set());
          setSelectedBatchIds(new Set());
          setDeleteMode(false);
          loadData();
      } catch(e: any) { alert(e.message); }
  };

  const toggleSelectProduct = (pid: string, batchIds: string[]) => {
      const newProdSet = new Set(selectedToDelete);
      const newBatchSet = new Set(selectedBatchIds);
      if (newProdSet.has(pid)) {
          newProdSet.delete(pid);
          batchIds.forEach(bid => newBatchSet.delete(bid));
      } else {
          newProdSet.add(pid);
          batchIds.forEach(bid => newBatchSet.add(bid));
      }
      setSelectedToDelete(newProdSet);
      setSelectedBatchIds(newBatchSet);
  };

  const toggleSelectBatch = (bid: string) => {
      const newSet = new Set(selectedBatchIds);
      if (newSet.has(bid)) newSet.delete(bid); else newSet.add(bid);
      setSelectedBatchIds(newSet);
  };

  const handleSelectAllPage = () => {
      const newProdSet = new Set(selectedToDelete);
      const newBatchSet = new Set(selectedBatchIds);
      const allSelected = paginatedData.every(i => newProdSet.has(i.product.id));

      paginatedData.forEach(item => {
          if (allSelected) {
              newProdSet.delete(item.product.id);
              item.batches.forEach(b => newBatchSet.delete(b.id));
          } else {
              newProdSet.add(item.product.id);
              item.batches.forEach(b => newBatchSet.add(b.id));
          }
      });
      setSelectedToDelete(newProdSet);
      setSelectedBatchIds(newBatchSet);
  };

  if (loading) return <div className="p-8 dark:text-white">加载中...</div>;

  // Mobile Detail View
  if (mobileDetailItem) {
      return (
          <div className="bg-gray-50 dark:bg-gray-900 min-h-screen p-4">
              <div className="flex items-center gap-3 mb-4">
                  <button onClick={() => setMobileDetailItem(null)} className="p-2 bg-white dark:bg-gray-800 rounded-full shadow"><Icons.ArrowRightLeft size={20} className="transform rotate-180"/></button>
                  <h1 className="font-bold text-lg">{mobileDetailItem.product.name}</h1>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm mb-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                      <div><span className="text-gray-500">SKU:</span> {ph(mobileDetailItem.product.sku)}</div>
                      <div><span className="text-gray-500">类别:</span> {ph(mobileDetailItem.product.category)}</div>
                      <div><span className="text-gray-500">总库存:</span> <span className="font-bold text-blue-600">{formatUnit(mobileDetailItem.totalQuantity, mobileDetailItem.product)}</span></div>
                  </div>
              </div>
              <h3 className="font-bold mb-2 ml-2 text-gray-500">批次列表</h3>
              <div className="space-y-3">
                  {mobileDetailItem.batches.length === 0 && <div className="text-center text-gray-400 py-4">无批次信息</div>}
                  {mobileDetailItem.batches.map(b => (
                      <div key={b.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm">
                          <div className="flex justify-between items-start mb-2">
                              <span className="font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">{ph(b.batch_number)}</span>
                              <span className="font-bold">{formatUnit(b.quantity, mobileDetailItem.product)}</span>
                          </div>
                          <div className="text-xs text-gray-500 mb-3">有效期: {b.expiry_date ? b.expiry_date.split('T')[0] : '/'}</div>
                      </div>
                  ))}
              </div>
          </div>
      )
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Search Bar & Tools */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-center">
              <button 
                onClick={() => deleteMode ? handleBulkDelete() : setDeleteMode(true)}
                className={`px-4 py-2 rounded-lg font-bold transition-colors whitespace-nowrap w-full md:w-auto ${deleteMode ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}
              >
                 {deleteMode ? `确认删除 (${selectedToDelete.size + selectedBatchIds.size})` : '删除 (管理)'}
              </button>
              {deleteMode && (
                  <div className="flex items-center gap-2">
                      <button onClick={handleSelectAllPage} className="text-sm bg-gray-100 px-2 py-1 rounded">全选本页</button>
                      <button onClick={()=>{setDeleteMode(false); setSelectedToDelete(new Set()); setSelectedBatchIds(new Set());}} className="text-gray-500 underline text-sm">取消</button>
                  </div>
              )}

              <div className="flex-1 relative w-full">
                  <input 
                    type="text" 
                    placeholder="搜索商品, SKU, 批号..." 
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    value={searchQuery}
                    onChange={e => {setSearchQuery(e.target.value); setPage(1);}}
                  />
                  <div className="absolute left-3 top-2.5 text-gray-400"><Icons.Sparkles size={18}/></div>
              </div>
              
              <div className="flex gap-2 w-full md:w-auto">
                <select 
                    value={selectedCategory} onChange={e => {setSelectedCategory(e.target.value); setPage(1);}}
                    className="border rounded-lg px-4 py-2 outline-none bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white flex-1 md:flex-none"
                >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                {!isScanning ? (
                    <button onClick={startScanner} className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-4 py-2 rounded-lg flex items-center gap-2 whitespace-nowrap">
                        <Icons.Store size={18} /> 扫码
                    </button>
                ) : (
                    <button onClick={stopScanner} className="bg-red-100 text-red-700 px-4 py-2 rounded-lg flex items-center gap-2 whitespace-nowrap">停止</button>
                )}

                <button onClick={() => setAdvancedOpen(!advancedOpen)} className="px-4 py-2 rounded-lg border dark:border-gray-600">高级</button>
              </div>
          </div>
          {advancedOpen && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-gray-100 dark:border-gray-700">
                  <input placeholder="批号..." className="border p-2 rounded text-sm dark:bg-gray-700" value={advFilters.batch} onChange={e => setAdvFilters({...advFilters, batch: e.target.value})} />
                  <input placeholder="SKU..." className="border p-2 rounded text-sm dark:bg-gray-700" value={advFilters.sku} onChange={e => setAdvFilters({...advFilters, sku: e.target.value})} />
              </div>
          )}
          
          <div className={`${isScanning ? 'block' : 'hidden'} w-full max-w-sm mx-auto p-2 bg-black rounded-lg mt-4`}>
              <div id="reader" className="w-full"></div>
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
      />

      {/* Custom Pagination */}
      <div className="flex flex-wrap justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm gap-4">
           <button disabled={page<=1} onClick={()=>setPage(p=>Math.max(1, p-1))} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded disabled:opacity-50 dark:text-white">上一页</button>
           <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700">
               <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">当前</span>
               <input type="number" min="1" max={totalPages} className="w-16 text-center bg-white dark:bg-gray-800 border dark:border-gray-600 rounded text-sm font-bold p-1" value={inputPage} onChange={e => setInputPage(Number(e.target.value))} onBlur={commitPageInput} onKeyDown={e => e.key === 'Enter' && commitPageInput()} />
               <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">/ 共 {totalPages} 页</span>
           </div>
           <button disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages, p+1))} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded disabled:opacity-50 dark:text-white">下一页</button>
      </div>
    </div>
  );
};

// --- TABLE COMPONENT ---
export const InventoryTable = ({ data, onRefresh, currentStore, deleteMode, selectedToDelete, toggleSelectProduct, selectedBatchIds, toggleSelectBatch, onMobileClick, compact }: any) => {
    const [adjustBatch, setAdjustBatch] = useState<Batch | null>(null);
    const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

    const toggleExpand = (pid: string) => {
        const newSet = new Set(expandedProducts);
        if (newSet.has(pid)) newSet.delete(pid); else newSet.add(pid);
        setExpandedProducts(newSet);
    };

    return (
        <>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm hidden md:block">
             <table className="w-full text-left border-collapse">
                <thead className="bg-gray-100 dark:bg-gray-900 text-xs text-gray-600 dark:text-gray-400 uppercase font-semibold">
                    <tr>
                         <th className="px-6 py-4 w-10"></th>
                         {deleteMode && <th className="px-2 py-4 w-10 text-center">选</th>}
                         <th className="px-6 py-4">商品名称</th>
                         <th className="px-6 py-4">类别</th>
                         <th className="px-6 py-4">SKU</th>
                         <th className="px-6 py-4">总库存</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {data.map((item: any) => {
                        const isExpanded = expandedProducts.has(item.product.id);
                        return (
                            <React.Fragment key={item.product.id}>
                                <tr className="hover:bg-blue-50 dark:hover:bg-gray-700 cursor-pointer transition-colors" onClick={() => toggleExpand(item.product.id)}>
                                    <td className="px-6 py-4 text-center">
                                        <Icons.ChevronRight size={16} className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                    </td>
                                    {deleteMode && (
                                        <td className="px-2 py-4 text-center" onClick={e=>e.stopPropagation()}>
                                            <input type="checkbox" checked={selectedToDelete.has(item.product.id)} onChange={()=>toggleSelectProduct(item.product.id, item.batches.map((b:any)=>b.id))} className="w-5 h-5 rounded cursor-pointer" />
                                        </td>
                                    )}
                                    <td className="px-6 py-4 font-bold text-gray-800 dark:text-white">{item.product.name}</td>
                                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{ph(item.product.category)}</td>
                                    <td className="px-6 py-4 font-mono text-sm text-gray-400">{ph(item.product.sku)}</td>
                                    <td className="px-6 py-4 font-medium text-blue-700 dark:text-blue-400">{formatUnit(item.totalQuantity, item.product)}</td>
                                </tr>
                                {isExpanded && (
                                    <tr className="bg-gray-50/50 dark:bg-gray-900/50 animate-fade-in">
                                        <td colSpan={deleteMode ? 6 : 5} className="p-0">
                                            <div className="border-t border-b border-gray-200 dark:border-gray-700">
                                                <table className="w-full text-sm">
                                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                                        {item.batches.map((batch: any) => (
                                                            <tr key={batch.id} className="hover:bg-white dark:hover:bg-gray-800">
                                                                <td className="w-16 text-center">
                                                                    {deleteMode && <input type="checkbox" checked={selectedBatchIds.has(batch.id)} onChange={()=>toggleSelectBatch(batch.id)} className="w-4 h-4" />}
                                                                </td>
                                                                <td className="pl-4 py-3 font-mono text-gray-600 dark:text-gray-400 w-1/4">
                                                                    <span className="text-xs text-gray-400 mr-2">批号:</span>{ph(batch.batch_number)}
                                                                </td>
                                                                {currentStore === 'all' && <td className="px-4 py-3 text-purple-600 dark:text-purple-400 w-1/6">{batch.store_name}</td>}
                                                                <td className="px-4 py-3 text-gray-600 dark:text-gray-400 w-1/4">
                                                                    <span className="text-xs text-gray-400 mr-2">有效期:</span>{batch.expiry_date ? batch.expiry_date.split('T')[0] : '/'}
                                                                </td>
                                                                <td className="px-4 py-3 dark:text-gray-200 font-bold w-1/6">{formatUnit(batch.quantity, item.product)}</td>
                                                                <td className="px-4 py-3 text-right">
                                                                    <button onClick={() => setAdjustBatch(batch)} className="text-blue-600 font-bold text-xs">调整</button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
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

        {/* MOBILE CARD VIEW */}
        <div className="md:hidden space-y-3">
             {data.map((item: any) => (
                 <div key={item.product.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border dark:border-gray-700 flex justify-between items-center" onClick={() => onMobileClick(item)}>
                     <div className="flex items-center gap-3">
                         {deleteMode && (
                             <input type="checkbox" checked={selectedToDelete.has(item.product.id)} onChange={(e)=>{e.stopPropagation(); toggleSelectProduct(item.product.id, item.batches.map((b:any)=>b.id));}} className="w-5 h-5 rounded" />
                         )}
                         <div>
                             <h3 className="font-bold text-gray-800 dark:text-white">{item.product.name}</h3>
                             <p className="text-xs text-gray-500">{formatUnit(item.totalQuantity, item.product)}</p>
                         </div>
                     </div>
                     <Icons.ChevronRight size={20} className="text-gray-400" />
                 </div>
             ))}
        </div>

        {adjustBatch && (
            <AdjustBatchModal 
                batch={adjustBatch} 
                onClose={() => setAdjustBatch(null)} 
                onSuccess={() => { setAdjustBatch(null); onRefresh(); }} 
                product={data.find((i:any) => i.product.id === adjustBatch.product_id)?.product}
            />
        )}
        </>
    );
};

const AdjustBatchModal = ({ batch, product, onClose, onSuccess }: any) => {
    const [form, setForm] = useState({
        batch_number: batch.batch_number || '',
        expiry_date: batch.expiry_date ? batch.expiry_date.split('T')[0] : '',
        quantity: batch.quantity,
    });
    const handleSave = async () => {
        try {
            await dataService.adjustBatch(batch.id, {
                batch_number: form.batch_number,
                expiry_date: form.expiry_date ? new Date(form.expiry_date).toISOString() : null,
                quantity: Number(form.quantity)
            });
            onSuccess();
        } catch(e) { alert("保存失败"); }
    };
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl dark:text-white">
                <h2 className="text-xl font-bold mb-4">调整批次 ({product.name})</h2>
                <div className="space-y-4">
                    <div><label className="text-xs font-bold text-gray-500">批号</label><input className="w-full border p-2 rounded dark:bg-gray-700" value={form.batch_number} onChange={e => setForm({...form, batch_number: e.target.value})} /></div>
                    <div><label className="text-xs font-bold text-gray-500">有效期</label><input type="date" className="w-full border p-2 rounded dark:bg-gray-700" value={form.expiry_date} onChange={e => setForm({...form, expiry_date: e.target.value})} /></div>
                    <div><label className="text-xs font-bold text-gray-500">库存</label><input type="number" className="w-full border p-2 rounded dark:bg-gray-700" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} /></div>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600">取消</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded">保存</button>
                </div>
            </div>
        </div>
    );
};
