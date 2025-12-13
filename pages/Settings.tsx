

import React, { useState } from 'react';
import { getSupabaseConfig } from '../services/supabaseClient';
import { authService } from '../services/authService';

export const Settings: React.FC<{ subPage?: string; onThemeChange?: (theme: string) => void }> = ({ subPage, onThemeChange }) => {
    const user = authService.getCurrentUser();
    const is00 = user?.role_level === 0;

    const SQL_CODE = `
    -- StockWise Upgrade
    ALTER TABLE users ADD COLUMN IF NOT EXISTS face_descriptor float4[];
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES stores(id);
    -- No Reset Needed
    `;

    if (subPage === 'account') {
        return (
            <div className="p-8 max-w-2xl mx-auto space-y-6">
                <h1 className="text-3xl font-black">账户设置</h1>
                <div className="bg-white p-6 rounded-3xl shadow-lg">
                    <div className="space-y-4">
                        <div className="bg-gray-100 p-3 rounded-xl font-mono text-xs text-gray-500">ID: {user?.id}</div>
                        <input defaultValue={user?.username} className="w-full p-3 border rounded-xl font-bold"/>
                        <button onClick={()=>alert("启动摄像头录入人脸...")} className="w-full py-3 bg-blue-50 text-blue-600 rounded-xl font-bold border border-blue-200">
                            👤 设置人脸识别
                        </button>
                    </div>
                    <div className="flex gap-4 mt-6">
                        <button className="flex-1 py-3 bg-black text-white rounded-xl font-bold">保存</button>
                        <button onClick={()=>authService.logout()} className="flex-1 py-3 bg-red-100 text-red-600 rounded-xl font-bold">退出登录</button>
                    </div>
                </div>
            </div>
        );
    }

    if (subPage === 'perms') {
        return (
            <div className="p-8">
                <h1 className="text-3xl font-black mb-6">权限设置</h1>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Mock Permission Cards */}
                    {[1, 2, 3].map(lvl => (
                        <div key={lvl} className="bg-white p-6 rounded-2xl shadow border">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-lg">等级 {String(lvl).padStart(2,'0')}</h3>
                                <button className="text-blue-600 font-bold text-sm">设置</button>
                            </div>
                            <div className="space-y-2 text-sm text-gray-500">
                                <div>日志权限: <span className="font-bold text-black">B级</span></div>
                                <div>隐藏审计大厅: <span className="text-green-600">开启</span></div>
                            </div>
                        </div>
                    ))}
                </div>
                {/* Independent Modal for specific editing would go here */}
            </div>
        );
    }

    if (subPage === 'config' && is00) {
        return (
            <div className="p-8">
                <pre className="bg-gray-900 text-green-400 p-4 rounded-xl overflow-auto text-xs">{SQL_CODE}</pre>
            </div>
        );
    }

    return null;
};