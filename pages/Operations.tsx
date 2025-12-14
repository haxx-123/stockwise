
import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { dataService } from '../services/dataService';
import { Product, Store } from '../types';
import { isConfigured } from '../services/supabaseClient';

interface OperationsProps {
  currentStore: string;
}

type Tab = 'IN' | 'OUT';

export const Operations: React.FC<OperationsProps> = ({ currentStore }) => {
  const [activeTab, setActiveTab] = useState<Tab>('IN');
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(0);
  const [unitType, setUnitType] = useState<'WHOLE' | 'SPLIT'>('WHOLE');
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Stock In specific
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  // UI Feedback
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  useEffect(() => {
    if (!isConfigured()) return;
    const loadData = async () => {
        try {
            const [p, s] = await Promise.all([dataService.getProducts(), dataService.getStores()]);
            setProducts(p);
            setStores(s);
        } catch(e) { console.error(e); }
        finally { setLoading(false); }
    };
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!isConfigured()) {
        setMessage({ type: 'error', text: '请先配置数据库连接。' });
        return;
    }

    if (!selectedProduct) {
        setMessage({ type: 'error', text: '请选择商品。' });
        return;
    }
    if (quantity <= 0) {
        setMessage({ type: 'error', text: '数量必须大于 0。' });
        return;
    }
    
    setSubmitting(true);
    const targetStoreId = currentStore === 'all' ? (stores[0]?.id || 'store_1') : currentStore;
    const product = products.find(p => p.id === selectedProduct);
    if (!product) return;

    // Calculate total split units
    const actualQty = unitType === 'WHOLE' ? quantity * (product.split_ratio || 1) : quantity;

    try {
        if (activeTab === 'IN') {
            if (!batchNumber || !expiryDate) {
                setMessage({ type: 'error', text: '入库必须填写批次号和有效期。' });
                setSubmitting(false);
                return;
            }
            await dataService.createBatch({
                product_id: product.id,
                store_id: targetStoreId,
                batch_number: batchNumber,
                quantity: actualQty,
                expiry_date: new Date(expiryDate).toISOString()
            });
            setMessage({ type: 'success', text: `成功入库 ${quantity} ${unitType === 'WHOLE' ? product.unit_name : product.split_unit_name} ${product.name}。` });
        } else {
            // Stock Out
            await dataService.processStockOut(product.id, targetStoreId, actualQty, '手动操作');
            setMessage({ type: 'success', text: `成功出库 ${quantity} ${unitType === 'WHOLE' ? product.unit_name : product.split_unit_name}。` });
        }

        // Reset Form
        setQuantity(0);
        setBatchNumber('');
        setExpiryDate('');
        
    } catch (err: any) {
        setMessage({ type: 'error', text: err.message || '操作失败' });
    } finally {
        setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8">加载中...</div>;

  const selectedProdDetails = products.find(p => p.id === selectedProduct);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto animate-fade-in">
      <h1 className="text-3xl font-black text-black dark:text-white mb-6">库存操作</h1>

      <div className="glass-panel rounded-3xl shadow-xl border border-white/20 overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-black/5 dark:border-white/5 bg-gray-50/50 dark:bg-gray-800/50">
          <button
            onClick={() => setActiveTab('IN')}
            className={`flex-1 py-5 text-sm font-bold text-center transition-all ${
              activeTab === 'IN' 
                ? 'text-blue-600 bg-white dark:bg-gray-800 shadow-inner' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-black/5'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
                <Icons.Plus size={20} />
                <span>入库 (进货)</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('OUT')}
            className={`flex-1 py-5 text-sm font-bold text-center transition-all ${
              activeTab === 'OUT' 
                ? 'text-red-600 bg-white dark:bg-gray-800 shadow-inner' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-black/5'
            }`}
          >
             <div className="flex items-center justify-center space-x-2">
                <Icons.Minus size={20} />
                <span>出库 (销售/领用)</span>
            </div>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {message && (
            <div className={`p-4 rounded-2xl text-sm font-bold shadow-sm ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                {message.text}
            </div>
          )}

          {/* Store Indicator */}
          <div className="bg-black/5 dark:bg-white/5 p-4 rounded-2xl flex items-center justify-between border border-black/5">
              <span className="text-sm text-gray-500 font-bold">目标门店</span>
              <span className="text-sm font-black text-black dark:text-white">
                  {stores.find(s => s.id === (currentStore === 'all' ? (stores[0]?.id || 'store_1') : currentStore))?.name}
              </span>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-500 mb-2">选择商品</label>
            <div className="relative">
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="w-full rounded-2xl border-none bg-gray-50 dark:bg-gray-900 p-4 font-bold text-lg focus:ring-2 focus:ring-blue-500 outline-none appearance-none shadow-inner dark:text-white"
                >
                  <option value="">-- 请选择 --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </select>
                <Icons.ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-2">数量</label>
                <input
                    type="number"
                    min="1"
                    value={quantity || ''}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                    className="w-full rounded-2xl border-none bg-gray-50 dark:bg-gray-900 p-4 font-black text-2xl outline-none focus:ring-2 focus:ring-blue-500 shadow-inner dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-2">单位类型</label>
                <div className="relative">
                    <select
                        value={unitType}
                        onChange={(e) => setUnitType(e.target.value as any)}
                        className="w-full rounded-2xl border-none bg-gray-50 dark:bg-gray-900 p-4 font-bold text-lg outline-none focus:ring-2 focus:ring-blue-500 appearance-none shadow-inner dark:text-white"
                        disabled={!selectedProduct}
                    >
                        <option value="WHOLE">整{selectedProdDetails?.unit_name || '件'}</option>
                        <option value="SPLIT">散{selectedProdDetails?.split_unit_name || '件'}</option>
                    </select>
                    <Icons.ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
                </div>
              </div>
          </div>
          
          {selectedProdDetails && (
              <p className="text-xs text-gray-400 font-medium text-center">
                  换算关系: 1 {selectedProdDetails.unit_name} = {selectedProdDetails.split_ratio} {selectedProdDetails.split_unit_name}
              </p>
          )}

          {activeTab === 'IN' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
                <div>
                    <label className="block text-sm font-bold text-gray-500 mb-2">批次号</label>
                    <input
                        type="text"
                        value={batchNumber}
                        onChange={(e) => setBatchNumber(e.target.value)}
                        className="w-full rounded-2xl border-none bg-gray-50 dark:bg-gray-900 p-4 font-mono font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-inner dark:text-white"
                        placeholder="例如: B2024-001"
                    />
                </div>
                <div>
                    <label className="block text-sm font-bold text-gray-500 mb-2">有效期</label>
                    <input
                        type="date"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                        className="w-full rounded-2xl border-none bg-gray-50 dark:bg-gray-900 p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-inner dark:text-white"
                    />
                </div>
             </div>
          )}

          {activeTab === 'OUT' && (
              <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-2xl border border-blue-100 dark:border-blue-800 animate-fade-in">
                  <p className="text-sm text-blue-800 dark:text-blue-200 font-bold flex items-center gap-2">
                      <Icons.Sparkles size={16}/>
                      注意: 系统采用 FIFO (先入先出) 逻辑，自动扣减最早到期的批次。
                  </p>
              </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={`w-full text-white font-black text-xl py-4 rounded-2xl transition-all shadow-lg hover:scale-[1.01] active:scale-95 ${
                submitting ? 'opacity-50 cursor-not-allowed bg-gray-400' : 
                activeTab === 'IN' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {submitting ? '处理中...' : (activeTab === 'IN' ? '确认入库' : '确认出库')}
          </button>
        </form>
      </div>
    </div>
  );
}
