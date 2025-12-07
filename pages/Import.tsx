
import React, { useState, useRef, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { dataService } from '../services/dataService';
import { isConfigured, getSupabaseClient } from '../services/supabaseClient';
import { sanitizeInt, sanitizeStr, DEFAULT_IMPORT_RATIO } from '../utils/formatters';
import { authService } from '../services/authService';

declare const window: any;
declare const Html5Qrcode: any;

export const Import: React.FC = () => {
    const [mode, setMode] = useState<'EXCEL' | 'MANUAL'>('EXCEL');
    
    // --- EXCEL STATE ---
    const [fileData, setFileData] = useState<any[]>([]);
    const [headers, setHeaders] = useState<string[]>([]); // F0, F1, F2...
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [step, setStep] = useState(1); // 1: Upload, 2: Map, 3: Processing
    const [logs, setLogs] = useState<string[]>([]);
    const [targetStoreId, setTargetStoreId] = useState('');
    const [availableStores, setAvailableStores] = useState<any[]>([]);

    // --- MANUAL STATE ---
    const [manualForm, setManualForm] = useState({
        name: '', sku: '', category: '', 
        unit_name: '件', split_unit_name: '', split_ratio: 10,
        batch_number: '', quantity: 0, expiry_date: ''
    });

    const [isScanning, setIsScanning] = useState(false);
    const scannerRef = useRef<any>(null);

    const FIELD_LABELS: Record<string, string> = {
        name: '商品名称', batch: '批号', quantity: '数量',
        sku: 'SKU', category: '类别', 
        unit: '大单位', split_unit: '小单位', ratio: '换算率', expiry: '有效期'
    };
    const REQUIRED_FIELDS = ['name', 'batch', 'quantity'];

    const addLog = (msg: string) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
    const user = authService.getCurrentUser();

    useEffect(() => {
        dataService.getStores().then(stores => {
            setAvailableStores(stores);
            if (stores.length > 0) setTargetStoreId(stores[0].id);
        });
    }, []);

    // --- SCANNER ---
    const startScanner = async () => {
        if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
            return alert("安全限制：摄像头只能在 HTTPS 或 localhost 下使用。");
        }
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


    // --- EXCEL HANDLERS ---
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        if (!isConfigured()) return alert('请先配置 Supabase');
        
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = (window.XLSX).read(bstr, { type: 'binary' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const data = (window.XLSX).utils.sheet_to_json(ws, { header: 1 }); 
                
                if (data.length < 1) return alert("Excel 为空");
                const maxCols = data.reduce((max: number, row: any) => Math.max(max, row.length), 0);
                const fHeaders = Array.from({length: maxCols}, (_, i) => `F${i}`);
                
                setHeaders(fHeaders);
                setFileData(data); 
                setStep(2);
                setMapping({});
            } catch (err: any) { alert("读取失败: " + err.message); }
        };
        reader.readAsBinaryString(file);
    };

    const executeExcelImport = async () => {
        if (!mapping.name || !mapping.batch || !mapping.quantity) {
            return alert("请完成必填项映射");
        }
        if (!targetStoreId) return alert("请选择目标门店");

        setStep(3);
        const client = getSupabaseClient();
        if (!client) return;

        try {
            // Isolation: Check products bound to this store OR global (bound_store_id is null)
            const { data: existingProducts } = await client.from('products').select('id, name, bound_store_id')
                .or(`bound_store_id.is.null,bound_store_id.eq.${targetStoreId}`);
            
            const productIdMap = new Map<string, string>();
            existingProducts?.forEach(p => productIdMap.set(p.name, p.id));

            const productsToUpsert: any[] = [];
            const batchesToInsert: any[] = [];
            const txToInsert: any[] = [];
            let success = 0;

            const getValue = (row: any[], field: string) => {
                const colIndex = parseInt(mapping[field]?.substring(1) || '-1');
                return colIndex > -1 ? row[colIndex] : null;
            };

            for (const row of fileData) {
                const name = sanitizeStr(getValue(row, 'name'));
                const batch = sanitizeStr(getValue(row, 'batch'));
                const qty = sanitizeInt(getValue(row, 'quantity'));
                if (!name || !batch || qty === null) continue;

                let pid = productIdMap.get(name);
                if (!pid) {
                    // New Product -> Bind to current store if isolation implies it?
                    // The prompt says "When in Store A ... input data MUST be strictly bound to Store A".
                    // This implies the product definition is also private to Store A?
                    // Or implies the relationship.
                    // For safety, let's bind it to targetStoreId to prevent leakage.
                    pid = crypto.randomUUID();
                    productIdMap.set(name, pid); // update map for subsequent rows
                    
                    productsToUpsert.push({
                        id: pid,
                        name: name,
                        sku: sanitizeStr(getValue(row, 'sku')),
                        category: sanitizeStr(getValue(row, 'category')),
                        unit_name: sanitizeStr(getValue(row, 'unit')) || '件',
                        split_unit_name: sanitizeStr(getValue(row, 'split_unit')),
                        split_ratio: sanitizeInt(getValue(row, 'ratio')) || DEFAULT_IMPORT_RATIO,
                        bound_store_id: targetStoreId // Strict Binding
                    });
                }

                const batchId = crypto.randomUUID();
                batchesToInsert.push({
                    id: batchId,
                    product_id: pid,
                    store_id: targetStoreId,
                    batch_number: batch,
                    quantity: qty,
                    expiry_date: getValue(row, 'expiry') ? new Date(getValue(row, 'expiry')).toISOString() : null
                });

                txToInsert.push({
                    id: crypto.randomUUID(),
                    type: 'IMPORT',
                    product_id: pid,
                    store_id: targetStoreId,
                    batch_id: batchId,
                    quantity: qty,
                    balance_after: qty,
                    timestamp: new Date().toISOString(),
                    note: `Excel导入 (批: ${batch})`,
                    operator: user?.username || 'Importer'
                });

                success++;
            }

            if (productsToUpsert.length > 0) {
                 const unique = Array.from(new Map(productsToUpsert.map(p => [p.name, p])).values());
                 await client.from('products').upsert(unique, { onConflict: 'name,bound_store_id' as any });
            }
            if (batchesToInsert.length > 0) {
                await client.from('batches').insert(batchesToInsert);
                await client.from('transactions').insert(txToInsert);
            }

            addLog(`✅ 成功导入 ${success} 条数据 到门店: ${availableStores.find(s=>s.id===targetStoreId)?.name}`);
            dataService.logClientAction('EXCEL_IMPORT', { count: success, storeId: targetStoreId });
            setTimeout(() => { setStep(1); setFileData([]); }, 2000);

        } catch (e: any) {
            addLog(`❌ 错误: ${e.message}`);
            setStep(2);
        }
    };

    // --- MANUAL HANDLERS ---
    const handleManualSubmit = async () => {
        if (!manualForm.name || !manualForm.batch_number || !manualForm.quantity) {
            return alert("请填写必填项");
        }
        if (!targetStoreId) return alert("请选择目标门店");

        const client = getSupabaseClient();
        if (!client) return;
        
        try {
             // Isolation check
             let { data: product } = await client.from('products').select('*')
                .eq('name', manualForm.name)
                .or(`bound_store_id.is.null,bound_store_id.eq.${targetStoreId}`)
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
                     bound_store_id: targetStoreId // Bind
                 }).select().single();
                 if (error) throw error;
                 product = newProd;
             }

             const batchId = crypto.randomUUID();
             const qty = Number(manualForm.quantity);
             
             await client.from('batches').insert({
                 id: batchId,
                 product_id: product.id,
                 store_id: targetStoreId,
                 batch_number: manualForm.batch_number,
                 quantity: qty,
                 expiry_date: manualForm.expiry_date ? new Date(manualForm.expiry_date).toISOString() : null
             });

             await client.from('transactions').insert({
                 id: crypto.randomUUID(),
                 type: 'IMPORT',
                 product_id: product.id,
                 store_id: targetStoreId,
                 batch_id: batchId,
                 quantity: qty,
                 balance_after: qty,
                 timestamp: new Date().toISOString(),
                 note: '手动导入',
                 operator: user?.username || 'Manual'
             });

             await dataService.logClientAction('MANUAL_IMPORT', { product: manualForm.name, storeId: targetStoreId });
             alert("导入成功");
             setManualForm({
                name: '', sku: '', category: '', 
                unit_name: '件', split_unit_name: '', split_ratio: 10,
                batch_number: '', quantity: 0, expiry_date: ''
             });

        } catch(e: any) { alert(e.message); }
    };

    return (
        <div className="p-8 max-w-6xl mx-auto dark:text-gray-100">
             <div className="flex justify-between items-center mb-6">
                 <h1 className="text-2xl font-bold text-gray-800 dark:text-white">商品导入</h1>
                 
                 <div className="flex items-center gap-4">
                     <select className="border p-2 rounded dark:bg-gray-800" value={targetStoreId} onChange={e=>setTargetStoreId(e.target.value)}>
                         {availableStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                     </select>
                     <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                         <button onClick={() => setMode('EXCEL')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${mode === 'EXCEL' ? 'bg-white dark:bg-gray-700 shadow text-blue-600' : 'text-gray-500'}`}>Excel 批量导入</button>
                         <button onClick={() => setMode('MANUAL')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${mode === 'MANUAL' ? 'bg-white dark:bg-gray-700 shadow text-blue-600' : 'text-gray-500'}`}>手动录入</button>
                     </div>
                 </div>
             </div>
             
             {mode === 'EXCEL' && (
                 <>
                    {step === 1 && (
                        <div className="bg-white dark:bg-gray-900 p-12 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-center">
                            <Icons.Package size={48} className="mx-auto text-blue-500 mb-4" />
                            <h3 className="text-lg font-bold mb-2">上传 Excel 文件</h3>
                            <p className="text-sm text-gray-500 mb-6">请上传 .xlsx 文件。系统将自动列出所有列 (F0, F1...) 供您映射。</p>
                            <input type="file" accept=".xlsx" onChange={handleFileUpload} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                        </div>
                    )}

                    {step === 2 && (
                        <div className="bg-white dark:bg-gray-900 p-6 rounded-xl border dark:border-gray-700 shadow-sm">
                            <h3 className="text-lg font-bold mb-4">步骤 2: 映射列 (F0, F1...)</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                                {Object.keys(FIELD_LABELS).map(key => (
                                    <div key={key} className="space-y-1">
                                        <label className={`text-sm font-bold ${REQUIRED_FIELDS.includes(key) ? 'text-red-500' : 'text-gray-600 dark:text-gray-300'}`}>
                                            {FIELD_LABELS[key]} {REQUIRED_FIELDS.includes(key) && '*'}
                                        </label>
                                        <select 
                                            className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600"
                                            value={mapping[key] || ''}
                                            onChange={e => setMapping({...mapping, [key]: e.target.value})}
                                        >
                                            <option value="">(忽略)</option>
                                            {headers.map(h => <option key={h} value={h}>{h} (列 {h.substring(1)})</option>)}
                                        </select>
                                    </div>
                                ))}
                            </div>
                            
                            <h4 className="font-bold mb-2 text-sm text-gray-500">数据预览 (前 5 行)</h4>
                            <div className="overflow-x-auto border rounded dark:border-gray-700 mb-6">
                                <table className="w-full text-xs text-left whitespace-nowrap">
                                    <thead className="bg-gray-100 dark:bg-gray-800 font-mono">
                                        <tr>
                                            {headers.map(h => <th key={h} className="p-2 border dark:border-gray-700 text-blue-600">{h}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y dark:divide-gray-700">
                                        {fileData.slice(0, 5).map((r, i) => (
                                            <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                                {headers.map((_, j) => <td key={j} className="p-2 border-r dark:border-gray-700 max-w-[150px] truncate">{r[j]}</td>)}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex justify-end gap-4">
                                <button onClick={()=>setStep(1)} className="px-4 py-2 text-gray-500">重新上传</button>
                                <button onClick={executeExcelImport} className="px-6 py-2 bg-blue-600 text-white rounded font-bold shadow-md hover:bg-blue-700">开始导入</button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="bg-white dark:bg-gray-900 p-8 rounded-xl text-center">
                            <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                            <p className="font-bold">正在处理数据...</p>
                            <div className="mt-4 text-left bg-black text-green-400 p-4 rounded h-48 overflow-y-auto font-mono text-xs">
                                {logs.map((l,i) => <div key={i}>{l}</div>)}
                            </div>
                            <button onClick={()=>setStep(1)} className="mt-4 text-blue-500 underline">返回</button>
                        </div>
                    )}
                 </>
             )}

             {mode === 'MANUAL' && (
                 <div className="bg-white dark:bg-gray-900 p-8 rounded-xl border dark:border-gray-700 shadow-sm max-w-3xl mx-auto">
                     <h3 className="text-lg font-bold mb-6">手动录入商品</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div className="md:col-span-2">
                             <label className="text-sm font-bold text-red-500">商品名称 *</label>
                             <input className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600" value={manualForm.name} onChange={e => setManualForm({...manualForm, name: e.target.value})} />
                         </div>
                         <div>
                             <label className="text-sm font-bold text-gray-600 dark:text-gray-300">SKU</label>
                             <input className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600" value={manualForm.sku} onChange={e => setManualForm({...manualForm, sku: e.target.value})} />
                         </div>
                         <div>
                             <label className="text-sm font-bold text-gray-600 dark:text-gray-300">类别</label>
                             <input className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600" value={manualForm.category} onChange={e => setManualForm({...manualForm, category: e.target.value})} />
                         </div>
                         <div className="grid grid-cols-3 gap-2 md:col-span-2">
                             <div>
                                 <label className="text-sm font-bold text-gray-600 dark:text-gray-300">大单位</label>
                                 <input className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600" value={manualForm.unit_name} onChange={e => setManualForm({...manualForm, unit_name: e.target.value})} />
                             </div>
                             <div>
                                 <label className="text-sm font-bold text-gray-600 dark:text-gray-300">小单位</label>
                                 <input className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600" value={manualForm.split_unit_name} onChange={e => setManualForm({...manualForm, split_unit_name: e.target.value})} />
                             </div>
                             <div>
                                 <label className="text-sm font-bold text-gray-600 dark:text-gray-300">换算率</label>
                                 <input type="number" className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600" value={manualForm.split_ratio} onChange={e => setManualForm({...manualForm, split_ratio: Number(e.target.value)})} />
                             </div>
                         </div>
                         <div className="relative">
                             <label className="text-sm font-bold text-red-500">批号 *</label>
                             <div className="flex">
                                <input className="w-full border p-2 rounded-l dark:bg-gray-800 dark:border-gray-600" value={manualForm.batch_number} onChange={e => setManualForm({...manualForm, batch_number: e.target.value})} />
                                <button onClick={startScanner} className="bg-gray-200 dark:bg-gray-700 px-3 rounded-r border border-l-0 dark:border-gray-600">
                                    <Icons.Store size={18} />
                                </button>
                             </div>
                         </div>
                         <div>
                             <label className="text-sm font-bold text-red-500">数量 *</label>
                             <input type="number" className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600" value={manualForm.quantity} onChange={e => setManualForm({...manualForm, quantity: Number(e.target.value)})} />
                         </div>
                         <div>
                             <label className="text-sm font-bold text-gray-600 dark:text-gray-300">有效期</label>
                             <input type="date" className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600" value={manualForm.expiry_date} onChange={e => setManualForm({...manualForm, expiry_date: e.target.value})} />
                         </div>
                     </div>
                     
                     <div className={`${isScanning ? 'block' : 'hidden'} w-full max-w-sm mx-auto p-2 bg-black rounded-lg mt-4`}>
                        <div id="import-reader" className="w-full"></div>
                        <button onClick={stopScanner} className="w-full bg-red-600 text-white mt-2 rounded py-1">停止扫描</button>
                    </div>

                     <div className="mt-8 text-right">
                         <button onClick={handleManualSubmit} className="px-8 py-3 bg-blue-600 text-white rounded font-bold shadow hover:bg-blue-700">保存录入</button>
                     </div>
                 </div>
             )}
        </div>
    );
};
