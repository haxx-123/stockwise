

import React, { useState } from 'react';
import { Icons } from '../components/Icons';
import { dataService } from '../services/dataService';
import { DEFAULT_SPLIT_UNIT } from '../utils/formatters';

declare const window: any;

export const Import: React.FC<{currentStore: string}> = ({ currentStore }) => {
    const [step, setStep] = useState(1);
    const [excelData, setExcelData] = useState<any[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [mappings, setMappings] = useState<any>({ name: '', code: '', cost: '', qty: '', min: '' });
    const [manualForm, setManualForm] = useState({ name: '', qty_big: 0, qty_small: 0, batch: '', image: '' });

    // Step 1: File Upload
    const handleFile = (e: any) => {
        const file = e.target.files[0];
        if (!file || !(window as any).XLSX) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            const wb = (window as any).XLSX.read(evt.target?.result, { type: 'binary' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const json = (window as any).XLSX.utils.sheet_to_json(ws, { header: 1 });
            if (json.length > 0) {
                setHeaders(json[0]);
                setExcelData(json.slice(1));
                setStep(2);
            }
        };
        reader.readAsBinaryString(file);
    };

    // Step 2: Mapping
    const handleMap = (field: string, colIndex: string) => {
        setMappings({ ...mappings, [field]: colIndex });
    };

    // Step 3: Import
    const executeImport = async () => {
        if (currentStore === 'all') return alert("请选门店");
        // Logic to iterate excelData using mappings and call createBatch
        alert(`模拟导入 ${excelData.length} 条数据`);
        setStep(1);
    };

    return (
        <div className="p-4 md:p-8 animate-fade-in-up space-y-8">
            <h1 className="text-3xl font-black">商品导入</h1>

            {/* Manual Import Card */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700">
                <h3 className="font-bold mb-4 text-lg">手动 / 拍照导入</h3>
                <div className="grid grid-cols-2 gap-4">
                    <input value={manualForm.name} onChange={e=>setManualForm({...manualForm, name: e.target.value})} placeholder="商品名称" className="p-3 bg-gray-50 rounded-xl"/>
                    <input value={manualForm.batch} onChange={e=>setManualForm({...manualForm, batch: e.target.value})} placeholder="批号" className="p-3 bg-gray-50 rounded-xl"/>
                    <input type="number" value={manualForm.qty_big} onChange={e=>setManualForm({...manualForm, qty_big: Number(e.target.value)})} placeholder="整" className="p-3 bg-gray-50 rounded-xl font-bold text-blue-600"/>
                    <div onClick={()=>alert("Camera")} className="p-3 bg-gray-100 rounded-xl flex items-center justify-center cursor-pointer"><Icons.Camera/></div>
                </div>
                <button className="w-full mt-4 bg-black text-white py-3 rounded-xl font-bold">保存并入库</button>
            </div>

            {/* Excel Wizard */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700">
                <h3 className="font-bold mb-4 text-lg">Excel 批量导入 (向导模式)</h3>
                
                {step === 1 && (
                    <div className="border-2 border-dashed h-32 rounded-xl flex items-center justify-center relative bg-gray-50">
                        <input type="file" onChange={handleFile} className="absolute inset-0 opacity-0 cursor-pointer"/>
                        <div className="text-center text-gray-400">
                            <Icons.FileSpreadsheet size={32} className="mx-auto mb-2"/>
                            点击选择 Excel 文件
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4">
                        <p className="text-sm text-gray-500">请选择 Excel 列对应的属性 (红色必填)</p>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-red-500 font-bold text-xs">商品名称</label>
                                <select onChange={e=>handleMap('name', e.target.value)} className="w-full p-2 border rounded">
                                    <option>请选择列...</option>
                                    {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-red-500 font-bold text-xs">数量</label>
                                <select onChange={e=>handleMap('qty', e.target.value)} className="w-full p-2 border rounded">
                                    <option>请选择列...</option>
                                    {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                                </select>
                            </div>
                            {/* Add more mappings */}
                        </div>
                        <div className="bg-gray-100 p-2 text-xs font-mono h-24 overflow-auto rounded">
                            {/* Preview Table */}
                            {excelData.slice(0, 3).map((row, i) => <div key={i}>{JSON.stringify(row)}</div>)}
                        </div>
                        <button onClick={executeImport} className="w-full bg-green-600 text-white py-3 rounded-xl font-bold">开始导入</button>
                    </div>
                )}
            </div>
        </div>
    );
};