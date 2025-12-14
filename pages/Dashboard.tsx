
import React, { useMemo, useEffect, useState } from 'react';
import { Icons } from '../components/Icons';
import { Product, Batch } from '../types';
import { dataService } from '../services/dataService';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import { isConfigured } from '../services/supabaseClient';
import { InventoryTable } from './Inventory';
import { generatePageSummary, formatUnit } from '../utils/formatters';
import { createPortal } from 'react-dom';

declare const html2canvas: any;
declare const window: any;

interface DashboardProps {
  currentStore: string;
  onNavigate: (page: string, params?: any) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ currentStore, onNavigate }) => {
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [flowData, setFlowData] = useState<any[]>([]);
  const [flowDays, setFlowDays] = useState(7);
  
  // Detail Modal State: Just tracks which TYPE is open. Data is derived.
  const [detailModalType, setDetailModalType] = useState<'LOW' | 'EXPIRY' | null>(null);

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

  const fetchData = async () => {
    // Keep loading silent if it's a refresh to avoid flickering
    if (batches.length === 0) setLoading(true);
    try {
      const [b, p, flow] = await Promise.all([
        dataService.getBatches(currentStore === 'all' ? undefined : currentStore),
        dataService.getProducts(),
        dataService.getStockFlowStats(flowDays, currentStore)
      ]);
      setBatches(b);
      setProducts(p);
      setFlowData(flow);
    } catch (err: any) { console.error(err); } 
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!isConfigured()) { setLoading(false); return; }
    fetchData();
  }, [currentStore, flowDays]);

  const stats = useMemo(() => {
    let totalItems = 0;
    const expiryThresholdDate = new Date();
    expiryThresholdDate.setDate(new Date().getDate() + expiryDays);
    const productQtyMap = new Map<string, number>();
    const productHasBatchesMap = new Map<string, boolean>();
    const expiringBatches: Batch[] = [];

    batches.forEach(b => {
      totalItems += b.quantity;
      const current = productQtyMap.get(b.product_id) || 0;
      productQtyMap.set(b.product_id, current + b.quantity);
      
      if (b.quantity > 0) {
          productHasBatchesMap.set(b.product_id, true);
      }

      if (b.expiry_date && new Date(b.expiry_date) < expiryThresholdDate) expiringBatches.push(b);
    });

    const lowStockProducts: Product[] = [];
    products.forEach(p => {
      const rawQty = productQtyMap.get(p.id) || 0;
      const hasStock = productHasBatchesMap.get(p.id) || false;
      const ratio = p.split_ratio || 10; 
      const bigUnitQty = rawQty / ratio; 
      const limit = p.min_stock_level !== undefined && p.min_stock_level !== null ? p.min_stock_level : lowStockLimit;
      
      // Filter: Must be below limit AND have at least some batches/stock (exclude empty items as requested)
      if (bigUnitQty < limit && hasStock) {
          lowStockProducts.push(p);
      }
    });

    return { totalItems, lowStockProducts, expiringBatches };
  }, [batches, products, lowStockLimit, expiryDays]);

  // Derived Modal Data to ensure reactivity
  const modalData = useMemo(() => {
      if (!detailModalType) return [];
      
      if (detailModalType === 'LOW') {
          return stats.lowStockProducts.map(p => ({
              product: p,
              totalQuantity: batches.filter(b => b.product_id === p.id).reduce((s, b) => s + b.quantity, 0),
              batches: batches.filter(b => b.product_id === p.id)
          }));
      } else {
          const expBatchIds = new Set(stats.expiringBatches.map(b => b.id));
          const relProds = new Set(stats.expiringBatches.map(b => b.product_id));
          return Array.from(relProds).map(pid => {
             const p = products.find(prod => prod.id === pid)!;
             const relBatches = batches.filter(b => b.product_id === pid && expBatchIds.has(b.id));
             return {
                 product: p,
                 totalQuantity: relBatches.reduce((s,b)=>s+b.quantity,0),
                 batches: relBatches
             };
          });
      }
  }, [detailModalType, stats, batches, products]);

  const filteredModalData = useMemo(() => {
      let res = modalData;
      if (modalSearch) {
          const q = modalSearch.toLowerCase();
          res = res.filter(item => item.product.name.toLowerCase().includes(q) || item.product.sku?.toLowerCase().includes(q));
      }
      return res;
  }, [modalData, modalSearch]);

  const openDetail = (type: 'LOW' | 'EXPIRY') => {
      setDetailModalType(type);
      setModalSearch('');
  };

  const chartData = useMemo(() => {
     const data: Record<string, number> = {};
     batches.forEach(b => {
         const p = products.find(prod => prod.id === b.product_id);
         const cat = p?.category || '未分类';
         data[cat] = (data[cat] || 0) + b.quantity;
     });
     return Object.keys(data).map(key => ({ name: key, value: data[key] }));
  }, [batches, products]);

  // Modal Tools Logic
  const handleCopy = () => {
      if(!detailModalType) return;
      const content = generatePageSummary('inventory', filteredModalData);
      navigator.clipboard.writeText(content).then(() => alert("已复制内容"));
  };
  
  const handleScreenshot = () => {
      const el = document.getElementById('dashboard-modal-content');
      if(el && html2canvas) {
          html2canvas(el).then((canvas: any) => {
              const link = document.createElement('a');
              link.download = `dashboard_detail_${Date.now()}.png`;
              link.href = canvas.toDataURL();
              link.click();
          });
      } else alert("截图失败");
  };

  const handleExcel = () => {
     if(!detailModalType || !(window as any).XLSX) return;
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
     (window as any).XLSX.utils.book_append_sheet(wb, ws, "Export");
     (window as any).XLSX.writeFile(wb, `StockWise_Details.xlsx`);
  };

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

  // Mobile Detail Item for modal interaction
  const [mobileDetailItem, setMobileDetailItem] = useState<any>(null);

  if (loading) return <div className="p-8 flex justify-center text-gray-500 dark:text-gray-400">加载中...</div>;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto relative space-y-6">
      <div className="flex justify-end gap-4 text-sm text-gray-600 dark:text-gray-300 bg-white/60 dark:bg-gray-900/60 p-3 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm backdrop-blur-md animate-fade-in">
           <div className="flex items-center gap-2"><span>低库存(大单位):</span><input type="number" value={lowStockLimit} onChange={e => setLowStockLimit(Number(e.target.value))} className="w-12 border dark:border-gray-700 rounded px-1 dark:bg-gray-800 bg-transparent" /></div>
           <div className="flex items-center gap-2"><span>临期天数:</span><input type="number" value={expiryDays} onChange={e => setExpiryDays(Number(e.target.value))} className="w-12 border dark:border-gray-700 rounded px-1 dark:bg-gray-800 bg-transparent" /></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-lg hover:shadow-xl transition-shadow flex items-center justify-between animate-slide-up opacity-0" style={{animationDelay: '0ms'}}>
          <div><p className="text-sm font-medium text-gray-500 mb-1">总库存量</p><h3 className="text-3xl font-black dark:text-white tracking-tight">{stats.totalItems.toLocaleString()}</h3></div>
          <div className="p-4 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-2xl"><Icons.Package size={28} /></div>
        </div>
        <div onClick={() => openDetail('LOW')} className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 shadow-lg hover:shadow-xl flex items-center justify-between cursor-pointer transition-all active:scale-[0.98] animate-slide-up opacity-0" style={{animationDelay: '100ms'}}>
          <div><p className="text-sm font-medium text-gray-500 mb-1">低库存</p><h3 className="text-3xl font-black text-red-600 tracking-tight">{stats.lowStockProducts.length}</h3></div>
          <div className="p-4 bg-red-50 dark:bg-red-900/30 text-red-600 rounded-2xl"><Icons.AlertTriangle size={28} /></div>
        </div>
        <div onClick={() => openDetail('EXPIRY')} className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 shadow-lg hover:shadow-xl flex items-center justify-between cursor-pointer transition-all active:scale-[0.98] animate-slide-up opacity-0" style={{animationDelay: '200ms'}}>
          <div><p className="text-sm font-medium text-gray-500 mb-1">即将过期</p><h3 className="text-3xl font-black text-amber-500 tracking-tight">{stats.expiringBatches.length}</h3></div>
          <div className="p-4 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-2xl"><Icons.Sparkles size={28} /></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-auto">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border dark:border-gray-800 shadow-lg flex flex-col h-80 md:h-96 animate-slide-up opacity-0" style={{animationDelay: '300ms'}}>
            <h3 className="text-lg font-bold dark:text-gray-200 mb-6">库存分类分布</h3>
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                        <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}} />
                        <Bar dataKey="value" radius={[6, 6, 6, 6]}>{chartData.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border dark:border-gray-800 shadow-lg flex flex-col h-80 md:h-96 animate-slide-up opacity-0" style={{animationDelay: '400ms'}}>
            <div className="flex justify-between items-center mb-6"><h3 className="text-lg font-bold dark:text-gray-200">7日出入库趋势</h3></div>
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={flowData}>
                         <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                         <XAxis dataKey="date" stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} />
                         <YAxis stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} />
                         <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}} />
                         <Line type="monotone" dataKey="in" stroke="#10B981" strokeWidth={3} dot={{r: 4, fill: '#10B981'}} activeDot={{r: 6}} />
                         <Line type="monotone" dataKey="out" stroke="#EF4444" strokeWidth={3} dot={{r: 4, fill: '#EF4444'}} activeDot={{r: 6}} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
          </div>
      </div>

      {/* Main Detail Modal */}
      {detailModalType && createPortal(
          <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 animate-fade-in backdrop-blur-sm">
              <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl border border-white/20 animate-scale-in">
                  <div className="p-6 border-b dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-center gap-3 justify-center md:justify-start">
                              <div className={`p-2 rounded-xl ${detailModalType==='LOW'?'bg-red-100 text-red-600':'bg-amber-100 text-amber-600'}`}>
                                  {detailModalType==='LOW'?<Icons.AlertTriangle size={24}/>:<Icons.Sparkles size={24}/>}
                              </div>
                              <h2 className="text-2xl font-black dark:text-white">{detailModalType === 'LOW' ? '低库存详情' : '即将过期详情'}</h2>
                          </div>
                          
                          <div className="flex gap-2 w-full md:w-auto">
                              <input placeholder="搜索..." value={modalSearch} onChange={e=>setModalSearch(e.target.value)} className="border rounded-xl px-4 py-2 text-sm dark:bg-gray-700 dark:text-white flex-1 md:w-48 shadow-inner"/>
                              <select value={modalTypeFilter} onChange={e=>setModalTypeFilter(e.target.value)} className="border rounded-xl px-3 py-2 text-sm dark:bg-gray-700 dark:text-white shadow-sm">
                                 <option value="ALL">全部</option>
                              </select>
                          </div>

                          <div className="flex justify-between md:justify-end items-center gap-2">
                             <div className="flex gap-1">
                                 <button onClick={handleScreenshot} title="截图" className="p-2 hover:bg-gray-200 rounded-xl text-xl transition-colors">📷</button>
                                 <button onClick={handleCopy} title="复制" className="p-2 hover:bg-gray-200 rounded-xl text-xl transition-colors">📄</button>
                                 <button onClick={handleExcel} title="Excel" className="p-2 hover:bg-gray-200 rounded-xl text-xl transition-colors">📊</button>
                              </div>
                              <button onClick={() => setDetailModalType(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><Icons.Minus size={24} className="text-gray-500"/></button>
                          </div>
                      </div>
                  </div>
                  <div id="dashboard-modal-content" className="flex-1 overflow-auto p-6 custom-scrollbar">
                      <InventoryTable 
                        data={filteredModalData} 
                        onRefresh={fetchData} 
                        currentStore={currentStore} 
                        compact={true} 
                        deleteMode={false}
                        selectedToDelete={new Set()}
                        selectedBatchIds={new Set()}
                        onMobileClick={(item: any) => setMobileDetailItem(item)}
                      />
                  </div>
              </div>
          </div>,
          document.body
      )}

      {/* Independent Mobile Detail Page */}
      {mobileDetailItem && createPortal(
          <div className="fixed inset-0 bg-gray-50 dark:bg-gray-900 z-[200] overflow-y-auto animate-fade-in p-4 pb-24">
              <div className="flex items-center gap-3 mb-6 sticky top-0 bg-gray-50/90 dark:bg-gray-900/90 backdrop-blur z-10 py-4 border-b dark:border-gray-800">
                  <button onClick={() => setMobileDetailItem(null)} className="p-3 bg-white dark:bg-gray-800 rounded-full shadow-lg"><Icons.ArrowRightLeft size={20} className="transform rotate-180 dark:text-white"/></button>
                  <h1 className="font-black text-xl dark:text-white">{mobileDetailItem.product.name} - 详情</h1>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-lg border dark:border-gray-700 mb-6 animate-scale-in">
                  <div className="flex justify-between items-center">
                       <div>
                           <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">SKU: {mobileDetailItem.product.sku || 'N/A'}</div>
                           <div className="text-sm text-gray-600 dark:text-gray-300 font-bold">{mobileDetailItem.product.category || '未分类'}</div>
                       </div>
                       <div className="text-right">
                           <div className="text-3xl font-black text-blue-600 dark:text-blue-400">{formatUnit(mobileDetailItem.totalQuantity, mobileDetailItem.product)}</div>
                       </div>
                  </div>
              </div>

              <h3 className="font-bold dark:text-white mb-4 text-lg px-2">批次列表</h3>
              <InventoryTable 
                  data={[mobileDetailItem]} 
                  onRefresh={fetchData} 
                  currentStore={currentStore}
                  deleteMode={false}
                  selectedToDelete={new Set()}
                  selectedBatchIds={new Set()}
                  mobileExpanded={true} 
                  isMobileOverlay={true}
              />
          </div>,
          document.body
      )}
    </div>
  );
};
