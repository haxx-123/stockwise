
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

  const loadData = async () => {
    setLoading(true);
    try {
      const [p, b, s] = await Promise.all([
        dataService.getProducts(),
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
              formatsToSupport: [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 ]
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

  // --- DATA AGGREGATION & FILTERING ---
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
            const pinyinMatch = item.product.pinyin?.toLowerCase().includes(q.toLowerCase());
            const batchMatch = item.batches.some(b => b.batch_number?.toLowerCase().includes(q.toLowerCase()));
            
            if (!nameMatch && !skuMatch && !pinyinMatch && !batchMatch) return false;
        }
        
        return true;
    });

    return result;
  }, [batches, products, searchQuery, selectedCategory, advFilters]);

  const categories = useMemo(() => ['All', ...new Set(products.map(p => p.category || '未分类'))], [products]);
  
  // Pagination
  const totalPages = Math.ceil(aggregatedData.length / PAGE_SIZE);
  // Ensure page is valid
  useEffect(() => { if (page > totalPages && totalPages > 0) setPage(totalPages); }, [totalPages]);

  const paginatedData = aggregatedData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Pagination Handlers
  const handlePageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputPage(Number(e.target.value));
  };
  const commitPageInput = () => {
      let p = inputPage;
      if (isNaN(p)) p = 1;
      if (p < 1) p = 1;
      if (totalPages > 0 && p > totalPages) p = totalPages;
      setPage(p);
      setInputPage(p);
  };

  // Bulk Delete
  const handleBulkDelete = async () => {
      const totalCount = selectedToDelete.size + selectedBatchIds.size;
      if (totalCount === 0) return;

      if (!confirm(`确认删除选中的 ${selectedToDelete.size} 个商品和 ${selectedBatchIds.size} 个批次?`)) return;
      try {
          // 1. Delete specific batches
          for (const bid of selectedBatchIds) {
              await dataService.deleteBatch(bid);
          }
          // 2. Delete products
          for (const pid of selectedToDelete) {
              await dataService.deleteProduct(pid);
          }
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
          // Deselect Product -> Deselect all its batches
          newProdSet.delete(pid);
          batchIds.forEach(bid => newBatchSet.delete(bid));
      } else {
          // Select Product -> Select all its batches
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

  if (loading) return <div className="p-8 dark:text-white">加载中...</div>;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Search Bar & Tools */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-center">
              
              <button 
                onClick={() => deleteMode ? handleBulkDelete() : setDeleteMode(true)}
                className={`px-4 py-2 rounded-lg font-bold transition-colors whitespace-nowrap w-full md:w-auto ${deleteMode ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}
              >
                 {deleteMode ? `确认删除 (${selectedToDelete.size + selectedBatchIds.size})` : '删除 Del'}
              </button>
              {deleteMode && <button onClick={()=>{setDeleteMode(false); setSelectedToDelete(new Set()); setSelectedBatchIds(new Set());}} className="text-gray-500 underline text-sm">取消</button>}

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

                <button 
                    onClick={() => setAdvancedOpen(!advancedOpen)}
                    className={`px-4 py-2 rounded-lg border ${advancedOpen ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 dark:text-white'}`}
                >
                    高级
                </button>
              </div>
          </div>
          {advancedOpen && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-gray-100 dark:border-gray-700">
                  <input placeholder="批号..." className="border p-2 rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={advFilters.batch} onChange={e => setAdvFilters({...advFilters, batch: e.target.value})} />
                  <input placeholder="SKU..." className="border p-2 rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={advFilters.sku} onChange={e => setAdvFilters({...advFilters, sku: e.target.value})} />
                  {currentStore === 'all' && <div className="p-2 text-sm text-gray-500">门店选择: 所有 (请在右上角切换门店以过滤)</div>}
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
      />

      {/* Custom Pagination: Input and Total */}
      <div className="flex flex-wrap justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm gap-4">
           <button disabled={page<=1} onClick={()=>setPage(p=>Math.max(1, p-1))} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded disabled:opacity-50 dark:text-white transition-colors hover:bg-gray-200 dark:hover:bg-gray-600">
             上一页
           </button>
           
           <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700">
               <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">当前</span>
               <input 
                 type="number" 
                 min="1" 
                 max={totalPages} 
                 className="w-16 text-center bg-white dark:bg-gray-800 border dark:border-gray-600 rounded text-sm dark:text-white font-bold p-1 focus:ring-2 focus:ring-blue-500 outline-none"
                 value={inputPage} 
                 onChange={handlePageInput}
                 onBlur={commitPageInput}
                 onKeyDown={e => e.key === 'Enter' && commitPageInput()}
               />
               <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">/ 共 {totalPages} 页</span>
           </div>

           <button disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages, p+1))} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded disabled:opacity-50 dark:text-white transition-colors hover:bg-gray-200 dark:hover:bg-gray-600">
             下一页
           </button>
      </div>
    </div>
  );
};

// --- TABLE COMPONENT ---
export const InventoryTable = ({ data, onRefresh, currentStore, deleteMode, selectedToDelete, toggleSelectProduct, selectedBatchIds, toggleSelectBatch, compact }: any) => {
    const [adjustBatch, setAdjustBatch] = useState<Batch | null>(null);
    const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
    const [billBatch, setBillBatch] = useState<Batch | null>(null);
    const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

    const toggleExpand = (pid: string) => {
        const newSet = new Set(expandedProducts);
        if (newSet.has(pid)) newSet.delete(pid); else newSet.add(pid);
        setExpandedProducts(newSet);
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto shadow-sm">
             {/* DESKTOP TABLE VIEW */}
             <table className="w-full text-left border-collapse min-w-[600px] hidden md:table">
                <thead className="bg-gray-100 dark:bg-gray-900 text-xs text-gray-600 dark:text-gray-400 uppercase font-semibold">
                    <tr>
                         <th className="px-6 py-4 w-10"></th>
                         {deleteMode && <th className="px-2 py-4 w-10 text-center">选</th>}
                         <th className="px-6 py-4">商品名称</th>
                         <th className="px-6 py-4">类别</th>
                         <th className="px-6 py-4">SKU</th>
                         <th className="px-6 py-4">总库存</th>
                         {!compact && <th className="px-6 py-4 text-right">操作</th>}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {data.map((item: any) => {
                        const isExpanded = expandedProducts.has(item.product.id);
                        return (
                            <React.Fragment key={item.product.id}>
                                <tr className="hover:bg-blue-50 dark:hover:bg-gray-700 cursor-pointer transition-colors" onClick={() => toggleExpand(item.product.id)}>
                                    <td className="px-6 py-4 text-center">
                                        <div className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                                            <Icons.ChevronRight size={16} className="text-gray-400" />
                                        </div>
                                    </td>
                                    {deleteMode && (
                                        <td className="px-2 py-4 text-center" onClick={e=>e.stopPropagation()}>
                                            <input 
                                                type="checkbox" 
                                                checked={selectedToDelete.has(item.product.id)} 
                                                onChange={()=>toggleSelectProduct(item.product.id, item.batches.map((b:any)=>b.id))} 
                                                className="w-5 h-5 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer" 
                                            />
                                        </td>
                                    )}
                                    <td className="px-6 py-4 font-bold text-gray-800 dark:text-white">{item.product.name}</td>
                                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{ph(item.product.category)}</td>
                                    <td className="px-6 py-4 font-mono text-sm text-gray-400">{ph(item.product.sku)}</td>
                                    <td className="px-6 py-4 font-medium text-blue-700 dark:text-blue-400">
                                        {formatUnit(item.totalQuantity, item.product)}
                                    </td>
                                    {!compact && (
                                        <td className="px-6 py-4 text-right" onClick={e=>e.stopPropagation()}>
                                            <button 
                                                onClick={() => setAdjustProduct(item.product)}
                                                className="text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-300 text-xs font-bold border px-2 py-1 rounded dark:border-gray-600"
                                            >
                                                调整信息
                                            </button>
                                        </td>
                                    )}
                                </tr>
                                
                                {isExpanded && (
                                    <tr className="bg-gray-50/50 dark:bg-gray-900/50 animate-fade-in">
                                        <td colSpan={deleteMode ? 7 : 6} className="p-0">
                                            <div className="border-t border-b border-gray-200 dark:border-gray-700">
                                                <table className="w-full text-sm">
                                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                                        {item.batches.map((batch: any) => (
                                                            <tr key={batch.id} className="hover:bg-white dark:hover:bg-gray-800">
                                                                <td className="w-16 text-center">
                                                                    {deleteMode && (
                                                                         <div className="flex justify-center w-full pl-6">
                                                                            <input 
                                                                                type="checkbox" 
                                                                                checked={selectedBatchIds.has(batch.id)} 
                                                                                onChange={()=>toggleSelectBatch(batch.id)} 
                                                                                className="w-4 h-4 rounded border-gray-300 text-red-400 focus:ring-red-400 cursor-pointer" 
                                                                            />
                                                                         </div>
                                                                    )}
                                                                </td>
                                                                <td className="pl-4 py-3 font-mono text-gray-600 dark:text-gray-400 w-1/4">
                                                                    <span className="text-xs text-gray-400 mr-2">批号:</span>
                                                                    {ph(batch.batch_number)}
                                                                </td>
                                                                {currentStore === 'all' && <td className="px-4 py-3 text-purple-600 dark:text-purple-400 font-medium w-1/6">{batch.store_name}</td>}
                                                                <td className="px-4 py-3 text-gray-600 dark:text-gray-400 w-1/4">
                                                                    <span className="text-xs text-gray-400 mr-2">有效期:</span>
                                                                    {batch.expiry_date ? batch.expiry_date.split('T')[0] : '/'}
                                                                </td>
                                                                <td className="px-4 py-3 dark:text-gray-200 font-bold w-1/6">
                                                                    {formatUnit(batch.quantity, item.product)}
                                                                </td>
                                                                <td className="px-4 py-3 text-right flex justify-end gap-4 items-center">
                                                                    <button 
                                                                        onClick={() => setAdjustBatch(batch)}
                                                                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 font-bold text-xs"
                                                                    >
                                                                        调整
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => setBillBatch(batch)}
                                                                        className="px-3 py-1 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-bold text-xs hover:bg-blue-200"
                                                                    >
                                                                        开单
                                                                    </button>
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

             {/* MOBILE CARD VIEW */}
             <div className="md:hidden flex flex-col divide-y divide-gray-200 dark:divide-gray-700">
                {data.map((item: any) => {
                     const isExpanded = expandedProducts.has(item.product.id);
                     return (
                         <div key={item.product.id} className="p-4 bg-white dark:bg-gray-800">
                             <div className="flex justify-between items-start" onClick={() => toggleExpand(item.product.id)}>
                                 <div className="flex items-start gap-3">
                                     {deleteMode && (
                                        <input 
                                            type="checkbox" 
                                            checked={selectedToDelete.has(item.product.id)} 
                                            onChange={(e)=>{e.stopPropagation(); toggleSelectProduct(item.product.id, item.batches.map((b:any)=>b.id));}} 
                                            className="mt-1 w-5 h-5 rounded border-gray-300 text-red-600 focus:ring-red-500" 
                                        />
                                     )}
                                     <div>
                                         <h3 className="font-bold text-gray-900 dark:text-white">{item.product.name}</h3>
                                         <p className="text-xs text-gray-500">{ph(item.product.category)} | SKU: {ph(item.product.sku)}</p>
                                     </div>
                                 </div>
                                 <div className="text-right">
                                     <p className="font-bold text-blue-600 dark:text-blue-400">{formatUnit(item.totalQuantity, item.product)}</p>
                                     <Icons.ChevronDown size={16} className={`ml-auto text-gray-400 transform transition ${isExpanded ? 'rotate-180' : ''}`} />
                                 </div>
                             </div>

                             {!compact && isExpanded && (
                                 <div className="mt-3 flex justify-end">
                                     <button onClick={() => setAdjustProduct(item.product)} className="text-xs border px-2 py-1 rounded dark:border-gray-600 dark:text-gray-300">调整信息</button>
                                 </div>
                             )}

                             {isExpanded && (
                                 <div className="mt-4 space-y-3 pl-4 border-l-2 border-gray-100 dark:border-gray-700">
                                     {item.batches.map((batch: any) => (
                                         <div key={batch.id} className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded text-sm relative">
                                             {deleteMode && (
                                                 <div className="absolute top-2 right-2">
                                                    <input type="checkbox" checked={selectedBatchIds.has(batch.id)} onChange={()=>toggleSelectBatch(batch.id)} className="w-4 h-4 text-red-400" />
                                                 </div>
                                             )}
                                             <div className="grid grid-cols-2 gap-y-1">
                                                 <span className="text-gray-500 text-xs">批号:</span>
                                                 <span className="font-mono">{ph(batch.batch_number)}</span>
                                                 <span className="text-gray-500 text-xs">有效期:</span>
                                                 <span>{batch.expiry_date ? batch.expiry_date.split('T')[0] : '/'}</span>
                                                 <span className="text-gray-500 text-xs">数量:</span>
                                                 <span className="font-bold">{formatUnit(batch.quantity, item.product)}</span>
                                             </div>
                                             <div className="mt-2 flex gap-2">
                                                <button onClick={() => setAdjustBatch(batch)} className="flex-1 py-1 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded text-xs">调整</button>
                                                <button onClick={() => setBillBatch(batch)} className="flex-1 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-xs font-bold">开单</button>
                                             </div>
                                         </div>
                                     ))}
                                 </div>
                             )}
                         </div>
                     );
                })}
             </div>
             
             {/* Modals */}
             {adjustBatch && (
                <AdjustBatchModal 
                    batch={adjustBatch} 
                    onClose={() => setAdjustBatch(null)} 
                    onSuccess={() => { setAdjustBatch(null); onRefresh(); }} 
                    product={data.find((i:any) => i.product.id === adjustBatch.product_id)?.product}
                />
             )}
             {adjustProduct && (
                 <AdjustProductModal 
                    product={adjustProduct}
                    onClose={() => setAdjustProduct(null)}
                    onSuccess={() => { setAdjustProduct(null); onRefresh(); }}
                 />
             )}
             {billBatch && (
                <BillModal 
                    batch={billBatch} 
                    onClose={() => setBillBatch(null)} 
                    onSuccess={() => { setBillBatch(null); onRefresh(); }} 
                    product={data.find((i:any) => i.product.id === billBatch.product_id)?.product}
                />
             )}
        </div>
    );
};

// ... MODALS ...
const AdjustProductModal = ({ product, onClose, onSuccess }: any) => {
    const [form, setForm] = useState({
        name: product.name,
        category: product.category || '',
        sku: product.sku || '',
        unit_name: product.unit_name || '',
        split_unit_name: product.split_unit_name || '',
        split_ratio: product.split_ratio || 10
    });

    const handleSave = async () => {
        try {
            await dataService.updateProduct(product.id, form);
            onSuccess();
        } catch(e: any) { alert(e.message); }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl dark:text-white">
                <h2 className="text-xl font-bold mb-4">调整商品信息</h2>
                <div className="space-y-4">
                    <input className="w-full border p-2 rounded dark:bg-gray-700" placeholder="商品名称" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                    <div className="grid grid-cols-2 gap-4">
                        <input className="border p-2 rounded dark:bg-gray-700" placeholder="SKU" value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} />
                        <input className="border p-2 rounded dark:bg-gray-700" placeholder="类别" value={form.category} onChange={e => setForm({...form, category: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                         <input className="border p-2 rounded dark:bg-gray-700" placeholder="大单位" value={form.unit_name} onChange={e => setForm({...form, unit_name: e.target.value})} />
                         <input className="border p-2 rounded dark:bg-gray-700" placeholder="小单位" value={form.split_unit_name} onChange={e => setForm({...form, split_unit_name: e.target.value})} />
                         <input type="number" className="border p-2 rounded dark:bg-gray-700" placeholder="换算" value={form.split_ratio} onChange={e => setForm({...form, split_ratio: Number(e.target.value)})} />
                    </div>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 dark:text-gray-300">取消</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded">保存</button>
                </div>
            </div>
        </div>
    );
}

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
                    <div>
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400">批号</label>
                        <input className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600" value={form.batch_number} onChange={e => setForm({...form, batch_number: e.target.value})} />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400">有效期</label>
                        <input type="date" className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600" value={form.expiry_date} onChange={e => setForm({...form, expiry_date: e.target.value})} />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400">库存 (最小单位)</label>
                        <input type="number" className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} />
                    </div>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 dark:text-gray-300">取消</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded">保存</button>
                </div>
            </div>
        </div>
    );
};

const BillModal = ({ batch, product, onClose, onSuccess }: any) => {
    const [qty, setQty] = useState(0);
    const [unit, setUnit] = useState<'BIG'|'SMALL'>('SMALL');
    const [type, setType] = useState<'IN' | 'OUT'>('OUT');

    const handleSubmit = async () => {
        if(qty <= 0) return;
        const actualQty = unit === 'BIG' ? qty * (product.split_ratio || 1) : qty;
        try {
            await dataService.updateStock(product.id, batch.store_id, actualQty, type, '快速开单', batch.id);
            onSuccess();
        } catch(e: any) { alert(e.message); }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-xs shadow-2xl text-center dark:text-white">
                <div className="flex border-b mb-4 dark:border-gray-600">
                    <button onClick={() => setType('OUT')} className={`flex-1 py-2 font-bold ${type === 'OUT' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>出库</button>
                    <button onClick={() => setType('IN')} className={`flex-1 py-2 font-bold ${type === 'IN' ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-500'}`}>入库</button>
                </div>

                <h2 className="text-lg font-bold mb-4">{product.name}</h2>
                <div className="space-y-3 bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                     <div className="flex items-center gap-2">
                        <input type="number" autoFocus className="w-20 border rounded p-2 text-center text-lg font-bold dark:bg-gray-600 dark:border-gray-500" value={qty} onChange={e => setQty(Number(e.target.value))} />
                        <select className="border rounded p-2 flex-1 dark:bg-gray-600 dark:border-gray-500" value={unit} onChange={e => setUnit(e.target.value as any)}>
                            <option value="SMALL">{ph(product.split_unit_name)}</option>
                            <option value="BIG">{ph(product.unit_name)}</option>
                        </select>
                     </div>
                </div>
                <button onClick={handleSubmit} className={`w-full text-white py-3 rounded-lg font-bold mt-4 ${type === 'OUT' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}>
                    确认{type === 'OUT' ? '出库' : '入库'}
                </button>
                <button onClick={onClose} className="w-full mt-2 text-gray-400 text-sm">取消</button>
            </div>
        </div>
    );
};
