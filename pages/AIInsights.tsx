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
        <div className="p-8 max-w-4xl mx-auto">
            <div className="flex items-center space-x-3 mb-6">
                <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
                    <Icons.Sparkles size={24} />
                </div>
                <h1 className="text-2xl font-bold text-gray-800">AI 库存助手</h1>
            </div>

            <div className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm text-center">
                {error && (
                     <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>
                )}

                {!result && !loading && (
                    <div className="py-12">
                         <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                            <Icons.Sparkles size={32} />
                         </div>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">分析库存健康状况</h2>
                        <p className="text-gray-500 mb-6 max-w-md mx-auto">
                            让 AI 分析您当前的库存水平、过期日期和分布情况，提供可操作的业务洞察。
                        </p>
                        <button 
                            onClick={runAnalysis}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-medium px-6 py-3 rounded-lg transition-colors shadow-md inline-flex items-center space-x-2"
                        >
                            <span>生成洞察</span>
                            <Icons.ArrowRightLeft size={16} />
                        </button>
                    </div>
                )}

                {loading && (
                    <div className="py-20 flex flex-col items-center justify-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-4"></div>
                        <p className="text-gray-600 font-medium">正在分析库存模式...</p>
                    </div>
                )}

                {result && !loading && (
                    <div className="text-left animate-fade-in">
                        <div className="mb-8">
                             <h3 className="text-lg font-bold text-gray-900 mb-2">执行摘要</h3>
                             <p className="text-gray-600 leading-relaxed bg-gray-50 p-4 rounded-lg border border-gray-100">
                                 {result.summary}
                             </p>
                        </div>
                        
                        <h3 className="text-lg font-bold text-gray-900 mb-4">行动建议</h3>
                        <div className="grid gap-4">
                            {result.insights?.map((insight: any, idx: number) => (
                                <div key={idx} className={`p-4 rounded-lg border-l-4 ${
                                    insight.type === 'warning' ? 'border-red-500 bg-red-50' : 
                                    insight.type === 'success' ? 'border-green-500 bg-green-50' : 
                                    'border-blue-500 bg-blue-50'
                                }`}>
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h4 className={`font-semibold text-sm mb-1 ${
                                                insight.type === 'warning' ? 'text-red-800' : 
                                                insight.type === 'success' ? 'text-green-800' : 
                                                'text-blue-800'
                                            }`}>{insight.title}</h4>
                                            <p className="text-sm text-gray-700">{insight.message}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        <div className="mt-8 pt-6 border-t border-gray-100 text-center">
                            <button 
                                onClick={runAnalysis}
                                className="text-purple-600 hover:text-purple-700 text-sm font-medium"
                            >
                                刷新分析
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};