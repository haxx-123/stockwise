
import React, { useState } from 'react';
import { Icons } from '../components/Icons';
import { dataService } from '../services/dataService';
import { uploadImage } from '../utils/imageUtils';

declare const window: any;

export const Import: React.FC<{currentStore: string}> = ({ currentStore }) => {
    const [mode, setMode] = useState<'MANUAL' | 'EXCEL'>('MANUAL');
    
    // Manual Form
    const [manualForm, setManualForm] = useState({ name: '', qty_big: 0, qty_small: 0, batch: '', imageFile: null as File | null });
    const [previewUrl, setPreviewUrl] = useState('');

    const handleManualSubmit = async () => {
        if(currentStore==='all') return alert("请选择具体门店");
        if(!manualForm.name) return alert("名称必填");
        
        // Upload image first if exists
        let imgUrl = '';
        if (manualForm.imageFile) {
            const url = await uploadImage(manualForm.imageFile);
            if (url) imgUrl = url;
        }

        // Check Duplicates (80% similarity logic mock)
        const products = await dataService.getProducts();
        const similar = products.find(p => p.name === manualForm.name); // Simple match for now
        
        if (similar) {
            if(!window.confirm(`发现相似商品 "${similar.name}"，是否归入该商品的新批次？(取消则创建新商品)`)) {
               // Create New Product logic...
            }
            // Proceed to add batch to existing...
        }

        alert("模拟保存成功 (含图片上传)");
        setManualForm({ name: '', qty_big: 0, qty_small: 0, batch: '', imageFile: null });
        setPreviewUrl('');
    };

    const handleImgSelect = (e: any) => {
        if(e.target.files[0]) {
            setManualForm({...manualForm, imageFile: e.target.files[0]});
            setPreviewUrl(URL.createObjectURL(e.target.files[0]));
        }
    };

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
            <div className="flex gap-4 mb-6">
                <button onClick={()=>setMode('MANUAL')} className={`flex-1 py-4 rounded-2xl font-black text-lg transition-all ${mode==='MANUAL' ? 'glass-panel border-white/30 text-white' : 'text-gray-500 hover:bg-white/5'}`}>
                    📸 手动 / 拍照
                </button>
                <button onClick={()=>setMode('EXCEL')} className={`flex-1 py-4 rounded-2xl font-black text-lg transition-all ${mode==='EXCEL' ? 'glass-panel border-white/30 text-white' : 'text-gray-500 hover:bg-white/5'}`}>
                    📊 Excel 批量
                </button>
            </div>

            {mode === 'MANUAL' ? (
                <div className="glass-panel p-6 rounded-3xl animate-fade-in">
                    <div className="flex flex-col md:flex-row gap-6">
                        <div className="w-full md:w-1/3 aspect-square bg-black/20 rounded-2xl border-2 border-dashed border-white/20 flex items-center justify-center relative overflow-hidden">
                            {previewUrl ? <img src={previewUrl} className="w-full h-full object-cover"/> : (
                                <div className="text-center text-gray-400">
                                    <Icons.Camera size={40} className="mx-auto mb-2"/>
                                    <span className="text-xs">点击拍照 / 上传</span>
                                </div>
                            )}
                            <input type="file" accept="image/*" onChange={handleImgSelect} className="absolute inset-0 opacity-0 cursor-pointer"/>
                        </div>
                        <div className="flex-1 space-y-4">
                            <input value={manualForm.name} onChange={e=>setManualForm({...manualForm, name: e.target.value})} placeholder="商品名称" className="w-full p-4 rounded-xl bg-white/10 border border-white/10 text-white placeholder-gray-500"/>
                            <div className="flex gap-4">
                                <input type="number" placeholder="整数 (大单位)" value={manualForm.qty_big || ''} onChange={e=>setManualForm({...manualForm, qty_big: Number(e.target.value)})} className="flex-1 p-4 rounded-xl bg-white/10 border border-white/10"/>
                                <input type="number" placeholder="散数 (小单位)" value={manualForm.qty_small || ''} onChange={e=>setManualForm({...manualForm, qty_small: Number(e.target.value)})} className="flex-1 p-4 rounded-xl bg-white/10 border border-white/10"/>
                            </div>
                            <div className="relative">
                                <input value={manualForm.batch} onChange={e=>setManualForm({...manualForm, batch: e.target.value})} placeholder="批号" className="w-full p-4 rounded-xl bg-white/10 border border-white/10"/>
                                <button className="absolute right-3 top-3 p-1 bg-white/10 rounded-lg"><Icons.Scan size={20}/></button>
                            </div>
                            <button onClick={handleManualSubmit} className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl font-bold text-white shadow-lg mt-4">确认入库</button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="glass-panel p-8 rounded-3xl animate-fade-in text-center">
                    <Icons.FileSpreadsheet size={64} className="mx-auto text-green-500 mb-4"/>
                    <h3 className="text-xl font-bold mb-2">Excel 批量导入向导</h3>
                    <p className="text-gray-400 mb-8 text-sm">支持列映射，无需修改表头即可导入</p>
                    <button className="px-8 py-3 bg-green-600 text-white rounded-xl font-bold hover:scale-105 transition-transform">选择文件...</button>
                </div>
            )}
        </div>
    );
};
