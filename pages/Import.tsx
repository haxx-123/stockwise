




import React, { useState, useRef, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { dataService } from '../services/dataService';
import { isConfigured, getSupabaseClient } from '../services/supabaseClient';
import { sanitizeInt, sanitizeStr, DEFAULT_IMPORT_RATIO, DEFAULT_SPLIT_UNIT } from '../utils/formatters';
import { authService } from '../services/authService';

declare const window: any;
declare const Html5Qrcode: any;

interface ImportProps {
    currentStore: string;
}

export const Import: React.FC<ImportProps> = ({ currentStore }) => {
    const [mode, setMode] = useState<'EXCEL' | 'MANUAL'>('EXCEL');
    
    // --- MANUAL STATE ---
    const [manualForm, setManualForm] = useState({
        name: '', sku: '', category: '', 
        unit_name: '整', split_unit_name: DEFAULT_SPLIT_UNIT, split_ratio: 10,
        batch_number: '', 
        qty_big: 0, 
        qty_small: 0,
        expiry_date: '',
        image_url: '',
        remark: ''
    });

    const [isScanning, setIsScanning] = useState(false);
    const scannerRef = useRef<any>(null);
    const user = authService.getCurrentUser();

    // --- SCANNER ---
    const startScanner = async () => {
        if (isScanning) return;
        try {
            const html5QrCode = new Html5Qrcode("import-reader");
            scannerRef.current = html5QrCode;
            setIsScanning(true);
            const config = { fps: 10, qrbox: { width: 250, height: 150 }, aspectRatio: 1.0 };
            await html5QrCode.start({ facingMode: "environment" }, config, (decodedText: string) => {
                setManualForm(prev => ({ ...prev, batch_number: decodedText }));
                stopScanner();
            }, () => {});
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

    const getTargetStoreId = () => {
        if (currentStore === 'all') return null;
        return currentStore;
    };

    const handleManualSubmit = async () => {
        if (!manualForm.name || !manualForm.batch_number) return alert("请填写商品名和批号");
        // Enforce Big Unit requirement
        if (manualForm.qty_big === undefined || manualForm.qty_big === null) return alert("整数单位是必填项 (可以填0)");
        
        const targetId = getTargetStoreId();
        if (!targetId) return alert("请在右上角切换到具体门店。");

        const client = getSupabaseClient();
        if (!client) return;
        
        try {
             let { data: product } = await client.from('products').select('*')
                .eq('name', manualForm.name)
                .or(`bound_store_id.is.null,bound_store_id.eq.${targetId}`)
                .single();
             
             if (!product) {
                 const { data: newProd, error } = await client.from('products').insert({
                     id: crypto.randomUUID(),
                     name: manualForm.name,
                     sku: sanitizeStr(manualForm.sku),
                     category: sanitizeStr(manualForm.category),
                     unit_name: manualForm.unit_name,
                     split_unit_name: sanitizeStr(manualForm.split_unit_name),
                     split_ratio: manualForm.split_ratio,
                     image_url: sanitizeStr(manualForm.image_url),
                     remark: sanitizeStr(manualForm.remark),
                     bound_store_id: targetId,
                     is_archived: false
                 }).select().single();
                 if (error) throw error;
                 product = newProd;
             }

             const ratio = product.split_ratio || 10;
             const totalQty = (Number(manualForm.qty_big) * ratio) + Number(manualForm.qty_small);

             const batchId = crypto.randomUUID();
             await client.from('batches').insert({
                 id: batchId,
                 product_id: product.id,
                 store_id: targetId,
                 batch_number: manualForm.batch_number,
                 quantity: totalQty,
                 expiry_date: manualForm.expiry_date ? new Date(manualForm.expiry_date).toISOString() : null,
                 is_archived: false
             });

             await client.from('transactions').insert({
                 id: crypto.randomUUID(),
                 type: 'IMPORT',
                 product_id: product.id,
                 store_id: targetId,
                 batch_id: batchId,
                 quantity: totalQty,
                 balance_after: totalQty,
                 timestamp: new Date().toISOString(),
                 note: '手动导入',
                 operator: user?.username || 'Manual'
             });

             await dataService.logClientAction('MANUAL_IMPORT', { product: manualForm.name, storeId: targetId });
             alert("导入成功");
             setManualForm({
                name: '', sku: '', category: '', 
                unit_name: '整', split_unit_name: DEFAULT_SPLIT_UNIT, split_ratio: 10,
                batch_number: '', qty_big: 0, qty_small: 0, expiry_date: '',
                image_url: '', remark: ''
             });

        } catch(e: any) { alert(e.message); }
    };

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto dark:text-gray-100">
             <div className="flex justify-between items-center mb-6">
                 <h1 className="text-2xl font-bold text-gray-800 dark:text-white">商品导入</h1>
             </div>
             
             {currentStore === 'all' && (
                 <div className="bg-orange-100 border-l-4 border-orange-500 text-orange-700 p-4 mb-4" role="alert">
                     <p className="font-bold">注意</p>
                     <p>请在右上角切换到具体的门店才能进行导入操作。</p>
                 </div>
             )}

             {currentStore !== 'all' && (
                 <div className="bg-white dark:bg-gray-900 p-6 md:p-8 rounded-xl border dark:border-gray-700 shadow-sm max-w-4xl mx-auto space-y-6 max-w-[100vw]">
                     <h3 className="font-bold border-b dark:border-gray-700 pb-2 mb-4 dark:text-white">新增批次 / 导入商品</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2"><label className="text-sm font-bold dark:text-gray-300">商品名称 *</label><input className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white" value={manualForm.name} onChange={e=>setManualForm({...manualForm, name: e.target.value})}/></div>
                        <div><label className="text-sm font-bold dark:text-gray-300">图片 URL</label><input className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white" value={manualForm.image_url} onChange={e=>setManualForm({...manualForm, image_url: e.target.value})}/></div>
                        <div><label className="text-sm font-bold dark:text-gray-300">备注</label><input className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white" value={manualForm.remark} onChange={e=>setManualForm({...manualForm, remark: e.target.value})}/></div>
                     </div>
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div><label className="text-sm font-bold dark:text-gray-300">SKU</label><input className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white" value={manualForm.sku} onChange={e=>setManualForm({...manualForm, sku: e.target.value})}/></div>
                        <div><label className="text-sm font-bold dark:text-gray-300">类别</label><input className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white" value={manualForm.category} onChange={e=>setManualForm({...manualForm, category: e.target.value})}/></div>
                        <div><label className="text-sm font-bold dark:text-gray-300">大单位 (整)</label><input className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white" value={manualForm.unit_name} onChange={e=>setManualForm({...manualForm, unit_name: e.target.value})}/></div>
                        <div><label className="text-sm font-bold dark:text-gray-300">小单位 (散)</label><input className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white" value={manualForm.split_unit_name} onChange={e=>setManualForm({...manualForm, split_unit_name: e.target.value})}/></div>
                     </div>
                     <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded border dark:border-gray-700">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                             <div>
                                 <label className="text-sm font-bold dark:text-gray-300">批号 *</label>
                                 <div className="flex gap-2">
                                    <input className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={manualForm.batch_number} onChange={e=>setManualForm({...manualForm, batch_number: e.target.value})} />
                                    <button onClick={startScanner} className="bg-white dark:bg-gray-600 px-3 border dark:border-gray-500 rounded"><Icons.Scan size={18}/></button>
                                 </div>
                             </div>
                             <div><label className="text-sm font-bold dark:text-gray-300">有效期</label><input type="date" className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={manualForm.expiry_date} onChange={e=>setManualForm({...manualForm, expiry_date: e.target.value})}/></div>
                         </div>
                         <div className="grid grid-cols-2 gap-4">
                             <div><label className="text-sm font-bold dark:text-gray-300 text-blue-600">数量 ({manualForm.unit_name}) *</label><input type="number" min="0" className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white font-bold" value={manualForm.qty_big} onChange={e=>setManualForm({...manualForm, qty_big: Number(e.target.value)})}/></div>
                             <div><label className="text-sm font-bold dark:text-gray-300 text-green-600">数量 ({manualForm.split_unit_name})</label><input type="number" min="0" className="w-full border p-2 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white font-bold" value={manualForm.qty_small} onChange={e=>setManualForm({...manualForm, qty_small: Number(e.target.value)})}/></div>
                         </div>
                     </div>

                     <div className={`${isScanning ? 'block' : 'hidden'} p-2 bg-black rounded`}><div id="import-reader"></div><button onClick={stopScanner} className="w-full bg-red-600 text-white mt-2">停止</button></div>
                     
                     <button onClick={handleManualSubmit} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-lg text-lg">保存并入库</button>
                 </div>
             )}
        </div>
    );
};