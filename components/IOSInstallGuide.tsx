
import React from 'react';
import { Icons } from './Icons';

interface IOSInstallGuideProps {
    onClose: () => void;
}

export const IOSInstallGuide: React.FC<IOSInstallGuideProps> = ({ onClose }) => {
    return (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative animate-slide-in-up" onClick={e => e.stopPropagation()}>
                 <div className="flex justify-between items-center mb-4">
                     <h3 className="font-bold text-lg dark:text-white">安装到 iPhone/iPad</h3>
                     <button onClick={onClose} className="p-1 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-500"><Icons.Minus size={20}/></button>
                 </div>
                 
                 <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
                     <p>由于 iOS 系统限制，请按照以下步骤操作：</p>
                     
                     <div className="flex items-center gap-4 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                         <div className="w-10 h-10 flex items-center justify-center bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 rounded-lg font-bold text-lg shadow-sm">1</div>
                         <div className="flex-1">
                             点击浏览器底部的 <span className="font-bold text-blue-600 dark:text-blue-400">分享按钮</span> 
                             <span className="inline-block align-middle ml-2 p-1 bg-gray-200 dark:bg-gray-600 rounded">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600 dark:text-blue-300"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                             </span>
                         </div>
                     </div>

                     <div className="flex items-center gap-4 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                         <div className="w-10 h-10 flex items-center justify-center bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 rounded-lg font-bold text-lg shadow-sm">2</div>
                         <div className="flex-1">
                             向下滑动菜单，选择 <br/>
                             <span className="font-bold text-gray-900 dark:text-white flex items-center gap-1 mt-1">
                                 <span className="p-1 bg-gray-200 dark:bg-gray-600 rounded"><Icons.Plus size={14}/></span>
                                 添加到主屏幕
                             </span>
                         </div>
                     </div>
                 </div>

                 <div className="mt-6 text-center">
                     <button onClick={onClose} className="text-blue-600 dark:text-blue-400 font-bold text-sm hover:underline">我知道了</button>
                 </div>

                 {/* Decorative Pointer Arrow for Safari Bottom Bar */}
                 <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 translate-y-full w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[12px] border-t-white dark:border-t-gray-800 md:hidden drop-shadow-sm"></div>
            </div>
        </div>
    );
};
