import React, { useMemo, useEffect, useState } from 'react';
import { Icons } from '../components/Icons';
import { Product, Batch } from '../types';
import { dataService } from '../services/dataService';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import { isConfigured } from '../services/supabaseClient';
import { InventoryTable } from './Inventory';
import { generatePageSummary, formatUnit } from '../utils/formatters';
// Import html-to-image
import * as htmlToImage from 'html-to-image';

declare const window: any;

interface DashboardProps {
  currentStore: string;
  onNavigate: (page: string, params?: any) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ currentStore, onNavigate }) => {
  const [loading, setLoading] = useState(true);
  
  // Phase 7: Simplified State populated by RPC
  const [stats, setStats] = useState({
      totalItems: 0,
      lowStockCount: 0,
      expiringCount: 0,
      flowData: [] as any[],
      lowStockList: [] as any[], // Lightweight preview
      expiringList: [] as any[]  // Lightweight preview
  });

  const [fullBatches, setFullBatches] = useState<Batch[]>([]); // Lazy loaded only if needed
  const [fullProducts, setFullProducts] = useState<Product[]>([]); // Lazy loaded

  const [detailModal, setDetailModal] = useState<{type: 'LOW' | 'EXPIRY', data: any[]} | null>(null);

  // Auto-Save Settings
  const [lowStockLimit, setLowStockLimit] = useState(() => Number(localStorage.getItem('sw_low_limit')) || 20);
  const [expiryDays, setExpiryDays] = useState(() => Number(localStorage.getItem('sw_expiry_days')) || 30);
  
  // Modal State
  const [modalSearch, setModalSearch] = useState('');
  const [modalTypeFilter, setModalTypeFilter] = useState('ALL');

  useEffect(() => {
      localStorage.setItem('sw_low_limit', String(lowStockLimit));
      localStorage.setItem('sw_expiry_days', String(expiryDays));
  }, [lowStockLimit, expiryDays]);

  // Phase 7: Load Dashboard via Single RPC
  useEffect(() => {
    if (!isConfigured()) { setLoading(false); return; }
    
    const fetchData = async () => {
      setLoading(true);
      try {
        const rpcData = await dataService.getDashboardStats(
            currentStore === 'all' ? 'all' : currentStore, 
            lowStockLimit, 
            expiryDays
        );
        
        if (rpcData) {
            setStats({
                totalItems: rpcData.totalItems,
                lowStockCount: rpcData.lowStockCount,
                expiringCount: rpcData.expiringCount,
                flowData: rpcData.flowData,
                lowStockList: [], // We'll fetch full details on click for accuracy
                expiringList: []
            });
        }
      } catch (err: any) { console.error(err); } 
      finally { setLoading(false); }
    };
    
    fetchData();
  }, [currentStore, lowStockLimit, expiryDays]);

  // Lazy Fetch Full Data for Modal
  const loadFullDataIfNeeded = async () => {
      if (fullBatches.length > 0 && fullProducts.length > 0) return;
      setLoading(true);
      const [b, p] = await Promise.all([
          dataService.getBatches(currentStore === 'all' ? undefined : currentStore),
          dataService.getProducts(false, currentStore === 'all' ? undefined : currentStore),
      ]);
      setFullBatches(b);
      setFullProducts(p);
      setLoading(false);
  };

  const openDetail = async (type: 'LOW' | 'EXPIRY') => {
      await loadFullDataIfNeeded();
      
      const expiryThresholdDate = new Date();
      expiryThresholdDate.setDate(new Date().getDate() + expiryDays);

      if (type === 'LOW') {
          // Re-calculate strictly for view
          const productQtyMap = new Map<string, number>();
          fullBatches.forEach(b => productQtyMap.set(b.product_id, (productQtyMap.get(b.product_id) || 0) + b.quantity));
          
          const lowStockProds = fullProducts.filter(p => {
              const qty = productQtyMap.get(p.id) || 0;
              // Only show if it has stock (based on user request to hide empty)
              // or maybe we show all low stock? Sticking to logic in Phase 2
              return qty > 0 && (qty / (p.split_ratio || 1)) < (p.min_stock_level || lowStockLimit);
          });

          const aggData = lowStockProds.map(p => ({
              product: p,
              totalQuantity: productQtyMap.get(p.id) || 0,
              batches: fullBatches.filter(b => b.product_id === p.id)
          }));
          setDetailModal({ type, data: aggData });
      } else {
          // Expiry
          const expBatches = fullBatches.filter(b => b.quantity > 0 && b.expiry_date && new Date(b.expiry_date) < expiryThresholdDate);
          const relProdIds = new Set(expBatches.map(b => b.product_id));
          const aggData = Array.from(relProdIds).map(pid => {
             const p = fullProducts.find(prod => prod.id === pid)!;
             const relBatches = expBatches.filter(b => b.product_id === pid);
             return {
                 product: p,
                 totalQuantity: relBatches.reduce((s,b)=>s+b.quantity,0),
                 batches: relBatches
             };
          });
          setDetailModal({ type, data: aggData });
      }
      setModalSearch('');
  };

  const filteredModalData = useMemo(() => {
      if (!detailModal) return [];
      let res = detailModal.data;
      if (modalSearch) {
          const q = modalSearch.toLowerCase();
          res = res.filter(item => item.product.name.toLowerCase().includes(q) || item.product.sku?.toLowerCase().includes(q));
      }
      return res;
  }, [detailModal, modalSearch]);

  // Chart Data also needs full batches to classify by category properly? 
  // Phase 7: We can add category stats to RPC later. For now, we can omit or lazy load.
  // To keep UI working, we will hide chart until full data loaded OR just skip it for optimization if data not there.
  // Let's lazy load full data for charts in background? No, let's keep it simple.
  // We will load full data for charts ONLY if user is on Dashboard for > 1 sec?
  // Actually, for Phase 7, removing client-side heavy lifting means charts should come from DB too.
  // BUT, to satisfy "Minimal Changes" while doing "SQL Reset", I implemented RPC for the main counters.
  // I will leave charts empty until "View Details" is clicked OR add a simple trigger.
  // Better: Trigger full load in background after initial render.
  useEffect(() => {
      if (isConfigured()) loadFullDataIfNeeded();
  }, [currentStore]);

  const chartData = useMemo(() => {
     if (fullBatches.length === 0) return [];
     const data: Record<string, number> = {};
     fullBatches.forEach(b => {
         const p = fullProducts.find(prod => prod.id === b.product_id);
         const cat = p?.category || '未分类';
         data[cat] = (data[cat] || 0) + b.quantity;
     });
     return Object.keys(data).map(key => ({ name: key, value: data[key] }));
  }, [fullBatches, fullProducts]);

  // Phase 7: html-to-image Screenshot
  const handleScreenshot = () => {
      const el = document.getElementById('dashboard-modal-content');
      if(el) {
          htmlToImage.toPng(el, { cacheBust: true, backgroundColor: '#ffffff' })
              .then((dataUrl) => {
                  const link = document.createElement('a');
                  link.download = `dashboard_detail_${Date.now()}.png`;
                  link.href = dataUrl;
                  link.click();
              })
              .catch((err) => {
                  console.error('oops, something went wrong!', err);
                  alert("截图生成失败");
              });
      } else alert("未找到内容");
  };

  const handleCopy = () => {
      if(!detailModal) return;
      const content = generatePageSummary('inventory', filteredModalData);
      navigator.clipboard.writeText(content).then(() => alert("已复制内容"));
  };

  const handleExcel = () => {
     if(!detailModal || !(window as any).XLSX) return;
     const data = filteredModalData.map((item: any) => ({
         商品: item.product.name,
         SKU: item.product.sku,
         总库存: formatUnit(item.totalQuantity, item.product),
         ...item.batches.reduce((acc: any, b: any, idx: number) => ({
             ...acc, [`批次${idx+1}_号`]: b.batch_number, [`批次${idx+1}_量`]: b.quantity, [`批次${idx+1}_效期`]: b.expiry_date
         }), {})
     }));
     const ws = (window as any).XLSX.utils.json_to_sheet(data);
     const wb = (window as any).XLSX.utils.book_new();
     (window as any).XLSX.utils.book_append_sheet(wb, ws, "Export");
     (window as any).XLSX.writeFile(wb, `StockWise_Details.xlsx`);
  };

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
  const [mobileDetailItem, setMobileDetailItem] = useState<any>(null);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto relative space-y-6">
      <div className="flex justify-end gap-4 text-sm text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 p-3 rounded-lg border border-gray-100 dark:border-gray-800 shadow-sm">
           <div className="flex items-center gap-2"><span>低库存(大单位):</span><input type="number" value={lowStockLimit} onChange={e => setLowStockLimit(Number(e.target.value))} className="w-12 border dark:border-gray-700 rounded px-1 dark:bg-gray-800" /></div>
           <div className="flex items-center gap-2"><span>临期天数:</span><input type="number" value={expiryDays} onChange={e => setExpiryDays(Number(e.target.value))} className="w-12 border dark:border-gray-700 rounded px-1 dark:bg-gray-800" /></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-900 p-6 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-center justify-between">
          <div><p className="text-sm font-medium text-gray-500 mb-1">总库存量</p><h3 className="text-3xl font-bold dark:text-white">{stats.totalItems.toLocaleString()}</h3></div>
          <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-lg"><Icons.Package size={24} /></div>
        </div>
        <div onClick={() => openDetail('LOW')} className="bg-white dark:bg-gray-900 p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow">
          <div><p className="text-sm font-medium text-gray-500 mb-1">低库存</p><h3 className="text-3xl font-bold text-red-600">{stats.lowStockCount}</h3></div>
          <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 rounded-lg"><Icons.AlertTriangle size={24} /></div>
        </div>
        <div onClick={() => openDetail('EXPIRY')} className="bg-white dark:bg-gray-900 p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow">
          <div><p className="text-sm font-medium text-gray-500 mb-1">即将过期</p><h3 className="text-3xl font-bold text-amber-500">{stats.expiringCount}</h3></div>
          <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-lg"><Icons.Sparkles size={24} /></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-auto">
          <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border dark:border-gray-800 shadow-sm flex flex-col h-80 md:h-80">
            <h3 className="text-sm font-bold dark:text-gray-200 mb-4">库存分类 (后台加载中...)</h3>
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                        <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>{chartData.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border dark:border-gray-800 shadow-sm flex flex-col h-80 md:h-80">
            <div className="flex justify-between items-center mb-4"><h3 className="text-sm font-bold dark:text-gray-200">出入库趋势 (7天)</h3></div>
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.flowData}>
                         <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                         <XAxis dataKey="date" stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} />
                         <YAxis stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} />
                         <Tooltip />
                         <Line type="monotone" dataKey="in" stroke="#10B981" strokeWidth={2} dot={false} />
                         <Line type="monotone" dataKey="out" stroke="#EF4444" strokeWidth={2} dot={false} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
          </div>
      </div>

      {/* Main Detail Modal */}
      {detailModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl border dark:border-gray-700">
                  <div className="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-center gap-3 justify-center md:justify-start">
                              <div className={`p-2 rounded-lg ${detailModal.type==='LOW'?'bg-red-100 text-red-600':'bg-amber-100 text-amber-600'}`}>
                                  {detailModal.type==='LOW'?<Icons.AlertTriangle size={20}/>:<Icons.Sparkles size={20}/>}
                              </div>
                              <h2 className="text-xl font-bold dark:text-white">{detailModal.type === 'LOW' ? '低库存详情' : '即将过期详情'}</h2>
                          </div>
                          <div className="flex gap-2 w-full md:w-auto">
                              <input placeholder="搜索..." value={modalSearch} onChange={e=>setModalSearch(e.target.value)} className="border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:text-white flex-1 md:w-48"/>
                              <select value={modalTypeFilter} onChange={e=>setModalTypeFilter(e.target.value)} className="border rounded px-2 py-2 text-sm dark:bg-gray-700 dark:text-white">
                                 <option value="ALL">全部</option>
                              </select>
                          </div>
                          <div className="flex justify-between md:justify-end items-center gap-2">
                             <div className="flex gap-1">
                                 <button onClick={handleScreenshot} title="截图" className="p-2 hover:bg-gray-200 rounded text-xl">📷</button>
                                 <button onClick={handleCopy} title="复制" className="p-2 hover:bg-gray-200 rounded text-xl">📄</button>
                                 <button onClick={handleExcel} title="Excel" className="p-2 hover:bg-gray-200 rounded text-xl">📊</button>
                              </div>
                              <button onClick={() => setDetailModal(null)} className="p-2 hover:bg-gray-200 rounded-full"><Icons.Minus size={24} className="text-gray-500"/></button>
                          </div>
                      </div>
                  </div>
                  <div id="dashboard-modal-content" className="flex-1 overflow-auto p-4 custom-scrollbar bg-white dark:bg-gray-900">
                      <InventoryTable 
                        data={filteredModalData} 
                        onRefresh={() => {}} 
                        currentStore={currentStore} 
                        compact={true} 
                        deleteMode={false}
                        selectedToDelete={new Set()}
                        selectedBatchIds={new Set()}
                        onMobileClick={(item: any) => setMobileDetailItem(item)}
                      />
                  </div>
              </div>
          </div>
      )}

      {/* Independent Mobile Detail Page */}
      {mobileDetailItem && (
          <div className="fixed inset-0 bg-gray-50 dark:bg-gray-900 z-[60] overflow-y-auto animate-fade-in p-4 pb-24">
              <div className="flex items-center gap-3 mb-4 sticky top-0 bg-gray-50 dark:bg-gray-900 z-10 py-2 border-b dark:border-gray-800">
                  <button onClick={() => setMobileDetailItem(null)} className="p-2 bg-white dark:bg-gray-800 rounded-full shadow"><Icons.ArrowRightLeft size={20} className="transform rotate-180 dark:text-white"/></button>
                  <h1 className="font-bold text-lg dark:text-white">{mobileDetailItem.product.name} - 详情</h1>
              </div>
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
                  onRefresh={()=>{}} 
                  currentStore={currentStore}
                  deleteMode={false}
                  selectedToDelete={new Set()}
                  selectedBatchIds={new Set()}
                  mobileExpanded={true} 
                  isMobileOverlay={true}
              />
          </div>
      )}
    </div>
  );
};