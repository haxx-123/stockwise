
import React, { useState } from 'react';
import { Icons } from '../components/Icons';
import { analyzeInventory } from '../services/geminiService';
import { dataService } from '../services/dataService';
import { AggregatedStock } from '../types';
import { isConfigured } from '../services/supabaseClient';

interface AIInsightsProps {
    currentStore: string;
}

export const AIInsights: React.FC<AIInsightsProps> = ({ currentStore }) => {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const runAnalysis = async () => {
        if (!isConfigured()) {
            setError("请先配置 Supabase 数据库。");
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const [products, batches] = await Promise.all([
                dataService.getProducts(),
                dataService.getBatches(currentStore === 'all' ? undefined : currentStore)
            ]);
            
            // Build aggregate data for AI
            const inventory: AggregatedStock[] = products.map(product => {
                const productBatches = batches.filter(b => b.product_id === product.id);
                return {
                    product,
                    totalQuantity: productBatches.reduce((sum, b) => sum + b.quantity, 0),
                    batches: productBatches,
                    expiringSoon: productBatches.reduce((sum, b) => {
                        const thirtyDays = new Date();
                        thirtyDays.setDate(new Date().getDate() + 30);
                        return new Date(b.expiry_date) < thirtyDays ? sum + b.quantity : sum;
                    }, 0)
                };
            });

            const analysis = await analyzeInventory(inventory);
            setResult(analysis);
        } catch (err: any) {
            setError("分析失败，请检查网络或 API Key");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto animate-fade-in">
            <div className="flex items-center space-x-4 mb-8">
                <div className="p-3 bg-purple-100 rounded-2xl text-purple-600 shadow-sm">
                    <Icons.Sparkles size={28} />
                </div>
                <h1 className="text-3xl font-black text-gray-800 dark:text-white">AI 库存助手</h1>
            </div>

            <div className="glass-panel rounded-3xl p-8 shadow-xl border border-white/20 text-center min-h-[400px] flex flex-col justify-center">
                {error && (
                     <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-700 rounded-2xl font-bold animate-pulse">{error}</div>
                )}

                {!result && !loading && (
                    <div className="py-8">
                         <div className="w-24 h-24 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-300 shadow-inner">
                            <img src="https://i.ibb.co/vxq7QfYd/retouch-2025121423241826.png" className="w-16 h-16 object-contain opacity-80" />
                         </div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">深度库存健康分析</h2>
                        <p className="text-gray-500 mb-8 max-w-md mx-auto leading-relaxed">
                            依托 Gemini Pro 模型，智能分析您当前的库存水位、效期分布及滞销风险，提供专业运营建议。
                        </p>
                        <button 
                            onClick={runAnalysis}
                            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-lg px-8 py-4 rounded-2xl transition-all shadow-lg hover:shadow-xl hover:scale-105 inline-flex items-center space-x-3"
                        >
                            <span>开始智能分析</span>
                            <Icons.ArrowRightLeft size={20} />
                        </button>
                    </div>
                )}

                {loading && (
                    <div className="py-12 flex flex-col items-center justify-center">
                        <img src="https://i.ibb.co/vxq7QfYd/retouch-2025121423241826.png" className="w-20 h-20 mb-6 animate-spin object-contain drop-shadow-md" />
                        <p className="text-gray-600 dark:text-gray-300 font-bold text-lg animate-pulse">正在运算库存模型...</p>
                    </div>
                )}

                {result && !loading && (
                    <div className="text-left animate-fade-in w-full">
                        <div className="mb-8">
                             <h3 className="text-xl font-black text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                 <span className="text-2xl">📊</span> 执行摘要
                             </h3>
                             <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-inner">
                                 <p className="text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
                                     {result.summary}
                                 </p>
                             </div>
                        </div>
                        
                        <h3 className="text-xl font-black text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <span className="text-2xl">💡</span> 关键行动建议
                        </h3>
                        <div className="grid gap-4">
                            {result.insights?.map((insight: any, idx: number) => (
                                <div key={idx} className={`p-6 rounded-2xl border-l-8 shadow-sm hover:shadow-md transition-shadow bg-white dark:bg-gray-800 ${
                                    insight.type === 'warning' ? 'border-red-500' : 
                                    insight.type === 'success' ? 'border-green-500' : 
                                    'border-blue-500'
                                }`}>
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h4 className={`font-black text-lg mb-2 ${
                                                insight.type === 'warning' ? 'text-red-600' : 
                                                insight.type === 'success' ? 'text-green-600' : 
                                                'text-blue-600'
                                            }`}>{insight.title}</h4>
                                            <p className="text-sm text-gray-600 dark:text-gray-300 font-medium">{insight.message}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        <div className="mt-10 pt-6 border-t border-gray-100 dark:border-gray-700 text-center">
                            <button 
                                onClick={runAnalysis}
                                className="text-purple-600 hover:text-purple-800 font-bold text-sm bg-purple-50 dark:bg-purple-900/20 px-6 py-2 rounded-full transition-colors"
                            >
                                🔄 刷新分析报告
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
