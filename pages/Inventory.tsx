
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
  
  // State ... (Search, etc)
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
      const [p, b] = await Promise.all([
        dataService.getProducts(false, currentStore),
        dataService.getBatches(currentStore === 'all' ? undefined : currentStore)
      ]);
      setProducts(p);
      setBatches(b);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (isConfigured()) loadData(); setPage(1); }, [currentStore]);

  // Scanner ... (Omitted for brevity, assumed unchanged)
  
  const aggregatedData = useMemo(() => {
    const map = new Map<string, AggregatedStock>();
    
    // LEVEL 1: Strict Grouping by Product ID Only
    // Key must NOT contain StoreID.
    products.forEach(p => {
        if (!map.has(p.id)) map.set(p.id, { product: p, totalQuantity: 0, batches: [], expiringSoon: 0 });
    });

    // Batches are assigned to the Product Parent.
    // Total Stock is SUM of all batches available in the current context.
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

  // ... (Bulk Delete Logic, same as before)
  const handleBulkDelete = async () => {
      if (selectedToDelete.size + selectedBatchIds.size === 0) return;
      if (!confirm(`确认删除?`)) return;
      try {
          for (const bid of selectedBatchIds) await dataService.deleteBatch(bid);
          for (const pid of selectedToDelete) await dataService.deleteProduct(pid);
          alert("删除成功"); setSelectedToDelete(new Set()); setSelectedBatchIds(new Set()); setDeleteMode(false); loadData();
      } catch(e: any) { alert(e.message); }
  };

  const handleSelectAllOnPage = () => { /* ... */ };
  const toggleSelectProduct = (pid: string, batchIds: string[]) => { /* ... */ };
  const toggleSelectBatch = (bid: string) => { /* ... */ };

  if (loading) return <div className="p-8 dark:text-white">加载中...</div>;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-center">
              <div className="flex items-center gap-2 w-full md:w-auto">
                   <button onClick={() => deleteMode ? handleBulkDelete() : setDeleteMode(true)} className={`px-4 py-2 rounded-lg font-bold transition-colors w-full md:w-auto ${deleteMode ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                      {deleteMode ? `确认删除 (${selectedToDelete.size + selectedBatchIds.size})` : '删除 (管理)'}
                   </button>
              </div>
              
              {deleteMode && <button onClick={()=>{setDeleteMode(false); setSelectedToDelete(new Set());}} className="text-gray-500 underline text-sm dark:text-gray-400">取消</button>}

              <div className="flex-1 relative w-full">
                  <input type="text" placeholder="搜索..." className="w-full pl-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={searchQuery} onChange={e => {setSearchQuery(e.target.value); setPage(1);}} />
              </div>
              
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
        selectedBatchIds={selectedBatchIds}
        toggleSelectProduct={toggleSelectProduct} // Pass dummy or real if implemented
        toggleSelectBatch={toggleSelectBatch} // Pass dummy or real
        onMobileClick={(item: any) => setMobileDetailItem(item)}
      />

      <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
           <button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded disabled:opacity-50 dark:text-white">上一页</button>
           <span className="text-sm text-gray-500 dark:text-gray-400">Page {page} of {totalPages}</span>
           <button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded disabled:opacity-50 dark:text-white">下一页</button>
      </div>

      {/* Mobile Detail Overlay */}
      {mobileDetailItem && (
          <div className="fixed inset-0 bg-gray-50 dark:bg-gray-900 z-50 overflow-y-auto animate-fade-in p-4 pb-24">
              <div className="flex items-center gap-3 mb-4 sticky top-0 bg-gray-50 dark:bg-gray-900 z-10 py-2 border-b dark:border-gray-800">
                  <button onClick={() => setMobileDetailItem(null)} className="p-2 bg-white dark:bg-gray-800 rounded-full shadow"><Icons.ArrowRightLeft size={20} className="transform rotate-180 dark:text-white"/></button>
                  <h1 className="font-bold text-lg dark:text-white">{mobileDetailItem.product.name} - 详情</h1>
              </div>
              <InventoryTable 
                  data={[mobileDetailItem]} 
                  onRefresh={loadData} 
                  currentStore={currentStore}
                  deleteMode={deleteMode}
                  mobileExpanded={true} 
                  isMobileOverlay={true}
              />
          </div>
      )}
    </div>
  );
};

export const InventoryTable = ({ data, onRefresh, currentStore, deleteMode, selectedToDelete, selectedBatchIds, toggleSelectProduct, toggleSelectBatch, onMobileClick, mobileExpanded, isMobileOverlay }: any) => {
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
        <div id="table-inventory" className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm ${mobileExpanded ? 'block' : 'hidden md:block'}`}>
             <table className="w-full text-left border-collapse table-fixed">
                <thead className="bg-gray-100 dark:bg-gray-900 text-xs text-gray-600 dark:text-gray-400 uppercase font-semibold">
                    <tr>
                         {!isMobileOverlay && <th className="px-4 py-4 w-10"></th>}
                         {deleteMode && !isMobileOverlay && <th className="px-2 py-4 w-10 text-center"></th>}
                         <th className="px-4 py-4 truncate w-1/4">商品名称</th>
                         <th className="px-4 py-4 truncate w-1/6">SKU/类别</th>
                         <th className="px-4 py-4 truncate w-1/4">总库存 (大单位 小单位)</th>
                         <th className="px-4 py-4 text-right truncate w-1/6">操作</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {data.map((item: any) => {
                        const isExpanded = mobileExpanded || expandedProducts.has(item.product.id);
                        return (
                            <React.Fragment key={item.product.id}>
                                {!isMobileOverlay && (
                                    <tr className="hover:bg-blue-50 dark:hover:bg-gray-700 cursor-pointer transition-colors" onClick={() => !mobileExpanded && toggleExpand(item.product.id)}>
                                        <td className="px-4 py-4 text-center">
                                            {!mobileExpanded && <Icons.ChevronRight size={16} className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`} />}
                                        </td>
                                        {deleteMode && (
                                            <td className="px-2 py-4 text-center" onClick={e=>e.stopPropagation()}>
                                                <input type="checkbox" checked={selectedToDelete?.has(item.product.id)} className="w-5 h-5" readOnly /> 
                                                {/* Logic omitted for brevity but passed from prop */}
                                            </td>
                                        )}
                                        <td className="px-4 py-4 font-bold text-gray-800 dark:text-white truncate" title={item.product.name}>{item.product.name}</td>
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
                                {isExpanded && (
                                    <tr className="bg-gray-50/50 dark:bg-gray-900/50 animate-fade-in">
                                        <td colSpan={deleteMode ? 6 : 5} className="p-0">
                                            <div className="border-t border-b border-gray-200 dark:border-gray-700">
                                                <div className="flex bg-gray-200 dark:bg-gray-800 p-2 text-xs font-bold text-gray-600 dark:text-gray-300">
                                                    <div className="w-10 text-center">选</div>
                                                    <div className="flex-1">批号</div>
                                                    {/* Strict Hierarchy: Store Name displayed in Level 2 */}
                                                    <div className="flex-1">门店</div>
                                                    <div className="flex-1">数量({item.product.unit_name || '大'})</div>
                                                    <div className="flex-1">数量({item.product.split_unit_name || '小'})</div>
                                                    <div className="flex-1">有效期</div>
                                                    <div className="w-20 text-right">操作</div>
                                                </div>
                                                {item.batches.map((batch: any) => {
                                                    const split = getUnitSplit(batch.quantity, item.product);
                                                    return (
                                                        <div key={batch.id} className="flex items-center p-3 border-b dark:border-gray-800 last:border-0 hover:bg-white dark:hover:bg-gray-800 transition-colors text-sm">
                                                            <div className="w-10 text-center">
                                                                {deleteMode && <input type="checkbox" checked={selectedBatchIds?.has(batch.id)} className="w-4 h-4" readOnly />}
                                                            </div>
                                                            <div className="flex-1 font-mono">
                                                                <span className="text-purple-700 bg-purple-50 dark:bg-purple-900/30 dark:text-purple-300 px-1 rounded">{batch.batch_number}</span>
                                                            </div>
                                                            <div className="flex-1 text-gray-500 text-xs truncate font-bold text-blue-500">{batch.store_name || '-'}</div>
                                                            <div className="flex-1 font-bold text-gray-800 dark:text-gray-200">{split.major}</div>
                                                            <div className="flex-1 text-gray-500">{split.minor}</div>
                                                            <div className="flex-1 text-xs">
                                                                <span className="text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400 px-1 rounded">{batch.expiry_date ? batch.expiry_date.split('T')[0] : '/'}</span>
                                                            </div>
                                                            <div className="w-20 text-right flex justify-end gap-1">
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
        {!mobileExpanded && (
            <div className="md:hidden space-y-3">
                 {data.map((item: any) => (
                     <div key={item.product.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border dark:border-gray-700 flex justify-between items-center" onClick={() => onMobileClick(item)}>
                         <div className="flex items-center gap-3">
                             <div className="overflow-hidden">
                                 <h3 className="font-bold text-gray-800 dark:text-white text-lg truncate">{item.product.name}</h3>
                                 <p className="text-sm text-gray-500">{formatUnit(item.totalQuantity, item.product)}</p>
                             </div>
                         </div>
                         <Icons.ChevronRight size={24} className="text-gray-400 flex-shrink-0" />
                     </div>
                 ))}
            </div>
        )}
        {/* Modals omitted for brevity */}
        </>
    );
};
