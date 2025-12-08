
import React, { useMemo, useEffect, useState } from 'react';
import { Icons } from '../components/Icons';
import { Product, Batch } from '../types';
import { dataService } from '../services/dataService';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import { isConfigured } from '../services/supabaseClient';
import { InventoryTable } from './Inventory';
import { generatePageSummary } from '../utils/formatters';

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
  const [detailModal, setDetailModal] = useState<{type: 'LOW' | 'EXPIRY', data: any[]} | null>(null);

  // Auto-Save Settings
  const [lowStockLimit, setLowStockLimit] = useState(() => Number(localStorage.getItem('sw_low_limit')) || 20);
  const [expiryDays, setExpiryDays] = useState(() => Number(localStorage.getItem('sw_expiry_days')) || 30);

  useEffect(() => {
      localStorage.setItem('sw_low_limit', String(lowStockLimit));
      localStorage.setItem('sw_expiry_days', String(expiryDays));
  }, [lowStockLimit, expiryDays]);

  useEffect(() => {
    if (!isConfigured()) { setLoading(false); return; }
    const fetchData = async () => {
      setLoading(true);
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
    fetchData();
  }, [currentStore, flowDays]);

  const stats = useMemo(() => {
    let totalItems = 0;
    const expiryThresholdDate = new Date();
    expiryThresholdDate.setDate(new Date().getDate() + expiryDays);
    const productQtyMap = new Map<string, number>();
    const expiringBatches: Batch[] = [];

    batches.forEach(b => {
      totalItems += b.quantity;
      const current = productQtyMap.get(b.product_id) || 0;
      productQtyMap.set(b.product_id, current + b.quantity);
      if (b.expiry_date && new Date(b.expiry_date) < expiryThresholdDate) expiringBatches.push(b);
    });

    const lowStockProducts: Product[] = [];
    products.forEach(p => {
      const rawQty = productQtyMap.get(p.id) || 0;
      const ratio = p.split_ratio || 10; 
      const bigUnitQty = rawQty / ratio; 
      const limit = p.min_stock_level !== undefined && p.min_stock_level !== null ? p.min_stock_level : lowStockLimit;
      if (bigUnitQty < limit) lowStockProducts.push(p);
    });

    return { totalItems, lowStockProducts, expiringBatches };
  }, [batches, products, lowStockLimit, expiryDays]);

  const openDetail = (type: 'LOW' | 'EXPIRY') => {
      if (type === 'LOW') {
          const relevantBatchIds = new Set<string>();
          stats.lowStockProducts.forEach(p => {
              batches.filter(b => b.product_id === p.id).forEach(b => relevantBatchIds.add(b.id));
          });
          const aggData = stats.lowStockProducts.map(p => ({
              product: p,
              totalQuantity: batches.filter(b => b.product_id === p.id).reduce((s, b) => s + b.quantity, 0),
              batches: batches.filter(b => b.product_id === p.id)
          }));
          setDetailModal({ type, data: aggData });
      } else {
          const expBatchIds = new Set(stats.expiringBatches.map(b => b.id));
          const relProds = new Set(stats.expiringBatches.map(b => b.product_id));
          const aggData = Array.from(relProds).map(pid => {
             const p = products.find(prod => prod.id === pid)!;
             const relBatches = batches.filter(b => b.product_id === pid && expBatchIds.has(b.id));
             return {
                 product: p,
                 totalQuantity: relBatches.reduce((s,b)=>s+b.quantity,0),
                 batches: relBatches
             };
          });
          setDetailModal({ type, data: aggData });
      }
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
      if(!detailModal) return;
      const content = generatePageSummary('inventory', detailModal.data);
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
     if(!detailModal || !(window as any).XLSX) return;
     alert("请使用电脑端进行完整 Excel 导出。移动端暂只支持复制。");
  };

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

  if (loading) return <div className="p-8 flex justify-center text-gray-500 dark:text-gray-400">加载中...</div>;

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
        <div onClick={() => openDetail('LOW')} className="bg-white dark:bg-gray-900 p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between cursor-pointer hover:shadow-md">
          <div><p className="text-sm font-medium text-gray-500 mb-1">低库存</p><h3 className="text-3xl font-bold text-red-600">{stats.lowStockProducts.length}</h3></div>
          <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 rounded-lg"><Icons.AlertTriangle size={24} /></div>
        </div>
        <div onClick={() => openDetail('EXPIRY')} className="bg-white dark:bg-gray-900 p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between cursor-pointer hover:shadow-md">
          <div><p className="text-sm font-medium text-gray-500 mb-1">即将过期</p><h3 className="text-3xl font-bold text-amber-500">{stats.expiringBatches.length}</h3></div>
          <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-lg"><Icons.Sparkles size={24} /></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-auto">
          <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border dark:border-gray-800 shadow-sm flex flex-col h-80 md:h-80">
            <h3 className="text-sm font-bold dark:text-gray-200 mb-4">库存分类</h3>
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
            <div className="flex justify-between items-center mb-4"><h3 className="text-sm font-bold dark:text-gray-200">出入库趋势</h3></div>
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={flowData}>
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

      {detailModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl border dark:border-gray-700">
                  <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800">
                      <div className="flex items-center gap-3">
                          <h2 className="text-xl font-bold dark:text-white">{detailModal.type === 'LOW' ? '低库存详情' : '即将过期详情'}</h2>
                          {/* Modal Tools */}
                          <div className="flex gap-1 ml-4">
                             <button onClick={handleScreenshot} title="截图" className="p-1 hover:bg-gray-200 rounded">📷</button>
                             <button onClick={handleCopy} title="复制" className="p-1 hover:bg-gray-200 rounded">📄</button>
                             <button onClick={handleExcel} title="Excel" className="p-1 hover:bg-gray-200 rounded">📊</button>
                          </div>
                      </div>
                      <button onClick={() => setDetailModal(null)}><Icons.Minus size={24} /></button>
                  </div>
                  <div id="dashboard-modal-content" className="flex-1 overflow-auto p-4 custom-scrollbar">
                      <InventoryTable 
                        data={detailModal.data} 
                        onRefresh={() => {}} 
                        currentStore={currentStore} 
                        compact={true} 
                        deleteMode={false}
                        selectedToDelete={new Set()}
                        selectedBatchIds={new Set()}
                        onMobileClick={(item: any) => { 
                             // Navigate to inventory page on click
                             onNavigate('inventory'); 
                        }}
                      />
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};