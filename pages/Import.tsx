
import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { dataService } from '../services/dataService';
import { uploadImage } from '../utils/imageUtils';
import { calculateSimilarity } from '../utils/searchHelper';
import { Product } from '../types';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { createPortal } from 'react-dom';

declare const window: any;

export const Import: React.FC<{currentStore: string, initialMode?: 'MANUAL' | 'EXCEL'}> = ({ currentStore, initialMode }) => {
    const [mode, setMode] = useState<'MANUAL' | 'EXCEL'>(initialMode || 'MANUAL');
    const [products, setProducts] = useState<Product[]>([]);
    
    // Sync if prop changes
    useEffect(() => {
        if (initialMode) setMode(initialMode);
    }, [initialMode]);

    // --- State for Manual Import ---
    const [manualForm, setManualForm] = useState({ 
        name: '', 
        sku: '',
        category: '',
        unit_name: '件',
        split_unit_name: '个',
        split_ratio: 1,
        qty_big: 0, 
        qty_small: 0, 
        batch: '', 
        expiry: '',
        remark: '',
        imageFile: null as File | null 
    });
    const [previewUrl, setPreviewUrl] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Similarity Check
    const [similarityModal, setSimilarityModal] = useState<{ match: Product, newName: string } | null>(null);

    // --- State for Excel Import ---
    const [excelStep, setExcelStep] = useState(1);
    const [excelFile, setExcelFile] = useState<File | null>(null);
    const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
    const [excelData, setExcelData] = useState<any[]>([]);
    const [columnMapping, setColumnMapping] = useState({
        name: '',       // Required
        code: '',
        category: '',
        qty: '',        // Required (Big Unit)
        batch: '',      // Required
        expiry: '',
        unit: '',
        cost: '',
        price: ''
    });
    const [excelProgress, setExcelProgress] = useState(0);

    // Scanner
    const [showScanner, setShowScanner] = useState(false);

    useEffect(() => {
        dataService.getProducts().then(setProducts);
    }, []);

    // --- Manual Import Logic ---

    const handleImgSelect = (e: any) => {
        if(e.target.files[0]) {
            setManualForm({...manualForm, imageFile: e.target.files[0]});
            setPreviewUrl(URL.createObjectURL(e.target.files[0]));
        }
    };

    const checkSimilarity = () => {
        if (!manualForm.name) return false;
        // Find best match
        let bestMatch: Product | null = null;
        let maxSim = 0;

        products.forEach(p => {
            const sim = calculateSimilarity(manualForm.name, p.name);
            if (sim > maxSim) {
                maxSim = sim;
                bestMatch = p;
            }
        });

        if (bestMatch && maxSim >= 0.8 && maxSim < 1.0) { // 1.0 is exact match, handled normally
            setSimilarityModal({ match: bestMatch!, newName: manualForm.name });
            return true; 
        }
        return false;
    };

    const handleManualSubmit = async (forceMergeProduct?: Product) => {
        if(currentStore==='all') return alert("请选择具体门店");
        if(!manualForm.name) return alert("名称必填");
        if(!manualForm.batch) return alert("批号必填");
        if(!manualForm.qty_big && !manualForm.qty_small) return alert("数量必填");

        if (!forceMergeProduct && checkSimilarity()) {
            return; // Wait for modal
        }

        setIsSubmitting(true);
        try {
            let imgUrl = '';
            if (manualForm.imageFile) {
                const url = await uploadImage(manualForm.imageFile);
                if (url) imgUrl = url;
            }

            // Determine Target Product ID
            let productId = '';
            
            // 1. Force Merge (User clicked "Yes" in similarity modal)
            if (forceMergeProduct) {
                productId = forceMergeProduct.id;
            } else {
                // 2. Exact Match or New Product
                const exactMatch = products.find(p => p.name === manualForm.name);
                if (exactMatch) {
                    productId = exactMatch.id;
                } else {
                    // Create New Product
                    productId = await dataService.createProduct({
                        name: manualForm.name,
                        sku: manualForm.sku,
                        category: manualForm.category,
                        unit_name: manualForm.unit_name,
                        split_unit_name: manualForm.split_unit_name,
                        split_ratio: Number(manualForm.split_ratio),
                        image_url: imgUrl,
                        remark: manualForm.remark
                    }) as string;
                }
            }

            if (productId) {
                const qty = (Number(manualForm.qty_big) * Number(manualForm.split_ratio)) + Number(manualForm.qty_small);
                
                await dataService.createBatch({
                    product_id: productId,
                    store_id: currentStore,
                    batch_number: manualForm.batch,
                    quantity: qty,
                    expiry_date: manualForm.expiry ? new Date(manualForm.expiry).toISOString() : null,
                    image_url: imgUrl,
                    remark: manualForm.remark
                });

                alert("入库成功");
                // Reset
                setManualForm({ 
                    name: '', sku: '', category: '', unit_name: '件', split_unit_name: '个', split_ratio: 1,
                    qty_big: 0, qty_small: 0, batch: '', expiry: '', remark: '', imageFile: null 
                });
                setPreviewUrl('');
                setSimilarityModal(null);
                window.dispatchEvent(new Event('REFRESH_APP_DATA'));
            }
        } catch(e: any) {
            alert("失败: " + e.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- Excel Import Logic ---

    const handleExcelFile = (e: any) => {
        const file = e.target.files[0];
        if(!file) return;
        setExcelFile(file);
        
        const reader = new FileReader();
        reader.onload = (evt: any) => {
            const bstr = evt.target.result;
            const wb = (window as any).XLSX.read(bstr, {type: 'binary'});
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            // Convert to JSON array of arrays (header + data)
            const data = (window as any).XLSX.utils.sheet_to_json(ws, {header: 1});
            
            if (data && data.length > 0) {
                // Assume Row 0 is headers
                const headers = data[0].map((h: any, idx: number) => h ? h.toString() : `Column ${idx}`);
                setExcelHeaders(headers);
                setExcelData(data.slice(1)); // The rest is data
                setExcelStep(2);
            }
        };
        reader.readAsBinaryString(file);
    };

    const runExcelImport = async () => {
        if (!columnMapping.name || !columnMapping.qty || !columnMapping.batch) {
            return alert("请至少映射红色必填项：商品名、数量、批号");
        }
        if(currentStore==='all') return alert("请选择具体门店");

        setExcelProgress(0);
        setIsSubmitting(true);

        const mapIdx = (key: keyof typeof columnMapping) => {
            const headerName = columnMapping[key];
            return excelHeaders.indexOf(headerName);
        };

        const idxName = mapIdx('name');
        const idxQty = mapIdx('qty');
        const idxBatch = mapIdx('batch');
        const idxCode = mapIdx('code');
        const idxCat = mapIdx('category');
        const idxExp = mapIdx('expiry');

        let successCount = 0;
        
        try {
            const currentProducts = await dataService.getProducts(); // Fresh list

            for (let i = 0; i < excelData.length; i++) {
                const row = excelData[i];
                if (!row[idxName]) continue; // Skip empty names

                const pName = row[idxName].toString().trim();
                const pBatch = row[idxBatch]?.toString().trim() || 'DefaultBatch';
                const pQty = Number(row[idxQty]) || 0;
                
                // 1. Find or Create Product
                let pid = currentProducts.find(p => p.name === pName)?.id;
                
                if (!pid) {
                    pid = await dataService.createProduct({
                        name: pName,
                        sku: idxCode > -1 ? row[idxCode]?.toString() : undefined,
                        category: idxCat > -1 ? row[idxCat]?.toString() : undefined,
                        unit_name: '件', 
                        split_ratio: 1
                    }) as string;
                    // Mock push to local list to avoid refetching
                    currentProducts.push({ id: pid, name: pName } as Product);
                }

                // 2. Create Batch
                let expiry = null;
                if (idxExp > -1 && row[idxExp]) {
                    // Try parse date
                    try { expiry = new Date(row[idxExp]).toISOString(); } catch {}
                }

                await dataService.createBatch({
                    product_id: pid,
                    store_id: currentStore,
                    batch_number: pBatch,
                    quantity: pQty, // Assuming whole units
                    expiry_date: expiry
                });

                successCount++;
                setExcelProgress(Math.round(((i + 1) / excelData.length) * 100));
            }
            alert(`批量导入完成！成功: ${successCount} 条`);
            setExcelStep(1);
            setExcelFile(null);
            setColumnMapping({ name: '', code: '', category: '', qty: '', batch: '', expiry: '', unit: '', cost: '', price: '' });
        } catch (e: any) {
            alert("导入中断: " + e.message);
        } finally {
            setIsSubmitting(false);
            setExcelProgress(0);
        }
    };

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 pb-24">
            {/* Mode Switcher - Keeping this allows user to switch inside the page too */}
            <div className="flex gap-4 mb-6">
                <button onClick={()=>setMode('MANUAL')} className={`flex-1 py-4 rounded-2xl font-black text-lg transition-all ${mode==='MANUAL' ? 'bg-black text-white shadow-xl' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                    📸 单品录入 (拍照)
                </button>
                <button onClick={()=>setMode('EXCEL')} className={`flex-1 py-4 rounded-2xl font-black text-lg transition-all ${mode==='EXCEL' ? 'bg-green-600 text-white shadow-xl' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                    📊 Excel 批量映射
                </button>
            </div>

            {/* --- MANUAL MODE --- */}
            {mode === 'MANUAL' && (
                <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 animate-fade-in">
                    <div className="flex flex-col lg:flex-row gap-8">
                        {/* Left: Image Upload */}
                        <div className="w-full lg:w-1/3 space-y-4">
                            <div className="aspect-square bg-gray-100 dark:bg-gray-700 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center relative overflow-hidden group">
                                {previewUrl ? (
                                    <img src={previewUrl} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="text-center text-gray-400">
                                        <Icons.Camera size={48} className="mx-auto mb-2"/>
                                        <span className="font-bold">点击添加商品图</span>
                                        <div className="text-xs mt-1">自动压缩至 200KB</div>
                                    </div>
                                )}
                                <input type="file" accept="image/*" onChange={handleImgSelect} className="absolute inset-0 opacity-0 cursor-pointer"/>
                            </div>
                        </div>

                        {/* Right: Inputs */}
                        <div className="flex-1 space-y-6">
                            {/* Product Basic Info */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-red-500">商品名称 *</label>
                                    <input value={manualForm.name} onChange={e=>setManualForm({...manualForm, name: e.target.value})} className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 font-bold" placeholder="例如：感冒灵颗粒"/>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500">条形码 / SKU</label>
                                    <input value={manualForm.sku} onChange={e=>setManualForm({...manualForm, sku: e.target.value})} className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700"/>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500">分类</label>
                                    <input value={manualForm.category} onChange={e=>setManualForm({...manualForm, category: e.target.value})} className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700" placeholder="例如：感冒药"/>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500">备注</label>
                                    <input value={manualForm.remark} onChange={e=>setManualForm({...manualForm, remark: e.target.value})} className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700"/>
                                </div>
                            </div>

                            {/* Units Config */}
                            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl grid grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500">大单位 (整)</label>
                                    <input value={manualForm.unit_name} onChange={e=>setManualForm({...manualForm, unit_name: e.target.value})} className="w-full p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200"/>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500">换算率</label>
                                    <input type="number" value={manualForm.split_ratio} onChange={e=>setManualForm({...manualForm, split_ratio: Number(e.target.value)})} className="w-full p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200"/>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500">小单位 (散)</label>
                                    <input value={manualForm.split_unit_name} onChange={e=>setManualForm({...manualForm, split_unit_name: e.target.value})} className="w-full p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200"/>
                                </div>
                            </div>

                            {/* Batch Info */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1 relative">
                                    <label className="text-xs font-bold text-red-500">批号 * (可扫码)</label>
                                    <div className="flex gap-2">
                                        <input value={manualForm.batch} onChange={e=>setManualForm({...manualForm, batch: e.target.value})} className="flex-1 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 font-mono" placeholder="生产批号 / 扫码录入"/>
                                        <button onClick={()=>setShowScanner(true)} className="p-3 bg-gray-200 dark:bg-gray-700 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"><Icons.Scan size={20}/></button>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500">有效期</label>
                                    <input type="date" value={manualForm.expiry} onChange={e=>setManualForm({...manualForm, expiry: e.target.value})} className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700"/>
                                </div>
                            </div>

                            {/* Quantity */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-red-500">数量 ({manualForm.unit_name})</label>
                                    <input type="number" value={manualForm.qty_big || ''} onChange={e=>setManualForm({...manualForm, qty_big: Number(e.target.value)})} className="w-full p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 text-xl font-black text-blue-600"/>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500">数量 ({manualForm.split_unit_name})</label>
                                    <input type="number" value={manualForm.qty_small || ''} onChange={e=>setManualForm({...manualForm, qty_small: Number(e.target.value)})} className="w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 text-xl font-bold"/>
                                </div>
                            </div>

                            <button onClick={()=>handleManualSubmit()} disabled={isSubmitting} className="w-full py-4 bg-black text-white rounded-xl font-bold shadow-lg hover:scale-[1.02] transition-transform disabled:opacity-50">
                                {isSubmitting ? '正在提交并上传图片...' : '保存并入库'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- EXCEL MODE --- */}
            {mode === 'EXCEL' && (
                <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-sm border border-gray-100 animate-fade-in">
                    {/* Step 1: Upload */}
                    {excelStep === 1 && (
                        <div className="text-center py-10 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-3xl bg-gray-50 dark:bg-gray-900">
                            <Icons.FileSpreadsheet size={64} className="mx-auto text-green-500 mb-4"/>
                            <h3 className="text-xl font-bold mb-2 dark:text-white">第 1 步：选择 Excel 文件</h3>
                            <p className="text-gray-400 mb-6 text-sm">系统将自动读取表头，无需使用特定模板</p>
                            <label className="cursor-pointer bg-black text-white px-8 py-3 rounded-xl font-bold hover:scale-105 transition-transform inline-block">
                                点击上传
                                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelFile} />
                            </label>
                        </div>
                    )}

                    {/* Step 2: Mapping */}
                    {excelStep === 2 && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xl font-bold dark:text-white">第 2 步：建立列映射</h3>
                                <button onClick={()=>{setExcelStep(1); setExcelData([]);}} className="text-red-500 font-bold text-sm">重选文件</button>
                            </div>
                            
                            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-xl text-yellow-800 dark:text-yellow-200 text-sm">
                                请在下拉框中选择您的 Excel 表头对应的属性。红色项为必填。
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                <div className="space-y-2">
                                    <label className="font-bold text-red-500">商品名称 (必填)</label>
                                    <select className="w-full p-3 border rounded-xl bg-gray-50 dark:bg-gray-900 dark:text-white" value={columnMapping.name} onChange={e=>setColumnMapping({...columnMapping, name: e.target.value})}>
                                        <option value="">请选择列...</option>
                                        {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="font-bold text-red-500">批号 (必填)</label>
                                    <select className="w-full p-3 border rounded-xl bg-gray-50 dark:bg-gray-900 dark:text-white" value={columnMapping.batch} onChange={e=>setColumnMapping({...columnMapping, batch: e.target.value})}>
                                        <option value="">请选择列...</option>
                                        {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="font-bold text-red-500">数量 (整) (必填)</label>
                                    <select className="w-full p-3 border rounded-xl bg-gray-50 dark:bg-gray-900 dark:text-white" value={columnMapping.qty} onChange={e=>setColumnMapping({...columnMapping, qty: e.target.value})}>
                                        <option value="">请选择列...</option>
                                        {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="font-bold text-gray-500">条形码 / SKU</label>
                                    <select className="w-full p-3 border rounded-xl bg-gray-50 dark:bg-gray-900 dark:text-white" value={columnMapping.code} onChange={e=>setColumnMapping({...columnMapping, code: e.target.value})}>
                                        <option value="">请选择列...</option>
                                        {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="font-bold text-gray-500">有效期</label>
                                    <select className="w-full p-3 border rounded-xl bg-gray-50 dark:bg-gray-900 dark:text-white" value={columnMapping.expiry} onChange={e=>setColumnMapping({...columnMapping, expiry: e.target.value})}>
                                        <option value="">请选择列...</option>
                                        {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="font-bold text-gray-500">分类</label>
                                    <select className="w-full p-3 border rounded-xl bg-gray-50 dark:bg-gray-900 dark:text-white" value={columnMapping.category} onChange={e=>setColumnMapping({...columnMapping, category: e.target.value})}>
                                        <option value="">请选择列...</option>
                                        {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="pt-6 border-t dark:border-gray-700">
                                {isSubmitting && (
                                    <div className="mb-4">
                                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-green-500 transition-all duration-300" style={{width: `${excelProgress}%`}}></div>
                                        </div>
                                        <p className="text-center text-xs mt-2 text-gray-500">正在导入: {excelProgress}%</p>
                                    </div>
                                )}
                                <button onClick={runExcelImport} disabled={isSubmitting} className="w-full py-4 bg-green-600 text-white rounded-xl font-bold shadow-lg hover:scale-[1.01] transition-transform disabled:opacity-50">
                                    {isSubmitting ? '导入处理中...' : '开始批量导入'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Similarity Check Modal */}
            {similarityModal && createPortal(
                <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-scale-in">
                    <div className="bg-white dark:bg-gray-900 w-full max-w-md p-6 rounded-3xl shadow-2xl">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4 text-yellow-600">
                                <Icons.AlertTriangle size={32}/>
                            </div>
                            <h3 className="text-xl font-black dark:text-white mb-2">发现相似商品</h3>
                            <p className="text-sm text-gray-500">
                                您输入的 "<strong>{similarityModal.newName}</strong>" 与库中商品 "<strong>{similarityModal.match.name}</strong>" 高度相似。
                            </p>
                        </div>
                        <div className="flex flex-col gap-3">
                            <button 
                                onClick={() => handleManualSubmit(similarityModal.match)} 
                                className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold"
                            >
                                是，合并到该商品 (新增批号)
                            </button>
                            <button 
                                onClick={() => { setSimilarityModal(null); handleManualSubmit(); }} 
                                className="w-full py-3 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-white rounded-xl font-bold"
                            >
                                否，这是新商品
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Replaced Scanner Overlay with Component */}
            {showScanner && (
                <BarcodeScanner 
                    onScan={(code) => {
                        setManualForm(prev => ({ ...prev, batch: code }));
                        setShowScanner(false);
                    }}
                    onClose={() => setShowScanner(false)}
                    title="扫码录入批号"
                />
            )}
        </div>
    );
};
