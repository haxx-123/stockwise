

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Icons } from '../components/Icons';
import { dataService } from '../services/dataService';
import { Batch, Product, Store, AggregatedStock } from '../types';
import { isConfigured } from '../services/supabaseClient';
import { formatUnit, ph, matchSearch, getUnitSplit, generatePageSummary } from '../utils/formatters';

declare const Html5Qrcode: any;
declare const html2canvas: any;
declare const window: any;

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

  const aggregatedData = useMemo(() => {
    const map = new Map<string, AggregatedStock>();
    products.forEach(p => {
        const key = `${p.name}::${p.sku || ''}`;
        if (!map.has(key)) map.set(key, { product: p, totalQuantity: 0, batches: [], expiringSoon: 0 });
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
    return Array.from(map.values()).filter(item => {
        if (selectedCategory !== 'All' && (item.product.category || '未分类') !== selectedCategory) return false;
        if (searchQuery && !matchSearch(item.product.name, searchQuery)) return false;
        return true;
    });
  }, [batches, products, searchQuery, selectedCategory]);

  const categories = useMemo(() => ['All', ...new Set(products.map(p => p.category || '未分类'))], [products]);
  const totalPages = Math.ceil(aggregatedData.length / PAGE_SIZE);
  const paginatedData = aggregatedData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleCopyText = () => {
      const text = generatePageSummary('inventory', aggregatedData);
      navigator.clipboard.writeText(text).then(() => alert("库存清单已复制到剪贴板"));
  };

  if (loading) return <div className="p-8 dark:text-white flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-center">
               {/* Tools */}
               <div className="flex gap-2">
                   <button onClick={handleCopyText} className="p-2 hover:bg-gray-100 rounded-lg" title="复制文本"><Icons.ArrowRightLeft size={18}/></button>
               </div>
              <div className="flex-1 relative w-full group">
                  <input type="text" placeholder="搜索商品..." className="w-full pl-10 pr-10 py-2.5 border-0 bg-gray-100 dark:bg-gray-700 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 transition-all" value={searchQuery} onChange={e => {setSearchQuery(e.target.value); setPage(1);}} />
              </div>
          </div>
      </div>

      <InventoryTable 
        data={paginatedData} 
        currentStore={currentStore}
        deleteMode={deleteMode}
        selectedToDelete={selectedToDelete}
        toggleSelectProduct={()=>{}}
        selectedBatchIds={selectedBatchIds}
        toggleSelectBatch={()=>{}}
        onMobileClick={(item: any) => setMobileDetailItem(item)}
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
              <InventoryTable 
                  data={[mobileDetailItem]} 
                  currentStore={currentStore}
                  deleteMode={false}
                  mobileExpanded={true} 
                  isMobileOverlay={true}
              />
          </div>
      )}
    </div>
  );
};

export const InventoryTable = ({ data, mobileExpanded, isMobileOverlay }: any) => {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
             <table className="w-full text-left border-collapse table-fixed">
                <thead className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider">
                    <tr>
                         <th className="px-6 py-4 truncate w-1/3">商品名称</th>
                         <th className="px-6 py-4 truncate w-1/4">总库存</th>
                         <th className="px-6 py-4 truncate w-1/3">批次信息</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {data.map((item: any) => (
                        <tr key={item.product.id} className="hover:bg-blue-50/50 dark:hover:bg-gray-800/50">
                            <td className="px-6 py-4">
                                <div className="font-bold text-gray-800 dark:text-white">{item.product.name}</div>
                                {item.product.image_url && <img src={item.product.image_url} className="w-8 h-8 mt-1 rounded object-cover" />}
                            </td>
                            <td className="px-6 py-4 font-bold text-blue-600 dark:text-blue-400">{formatUnit(item.totalQuantity, item.product)}</td>
                            <td className="px-6 py-4 text-xs">
                                {item.batches.map((b: any) => (
                                    <div key={b.id} className="mb-1">
                                        <span className="bg-purple-50 text-purple-600 px-1 rounded mr-1">{b.batch_number}</span>
                                        <span className="text-gray-500">{formatUnit(b.quantity, item.product)}</span>
                                    </div>
                                ))}
                            </td>
                        </tr>
                    ))}
                </tbody>
             </table>
        </div>
    );
};