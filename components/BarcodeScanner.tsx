
import React, { useEffect, useRef, useState } from 'react';
import { Icons } from './Icons';

declare const Html5Qrcode: any;
declare const Html5QrcodeSupportedFormats: any;

interface BarcodeScannerProps {
    onScan: (result: string) => void;
    onClose: () => void;
    title?: string;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScan, onClose, title = "扫描条码/二维码" }) => {
    const scannerRef = useRef<any>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        const initScanner = async () => {
            try {
                // Ensure DOM is ready
                await new Promise(resolve => setTimeout(resolve, 300));
                
                if (!document.getElementById("reader")) return;

                // Explicitly request permissions (helps in some WebViews)
                try {
                    await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                } catch (e: any) {
                    throw new Error("无法访问摄像头。请检查系统权限设置或确保使用 HTTPS/Localhost。");
                }

                // Configure formats: Support both 1D Barcodes and QR Codes
                const formats = [
                    Html5QrcodeSupportedFormats.QR_CODE,
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.CODE_39,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.UPC_E,
                    Html5QrcodeSupportedFormats.CODABAR
                ];

                const html5QrCode = new Html5Qrcode("reader");
                scannerRef.current = html5QrCode;

                const config = { 
                    fps: 10, 
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1.0,
                    formatsToSupport: formats,
                    experimentalFeatures: {
                        useBarCodeDetectorIfSupported: true
                    }
                };

                await html5QrCode.start(
                    { facingMode: "environment" }, 
                    config, 
                    (decodedText: string) => {
                        if (isMounted) {
                            // Audio feedback (optional beep)
                            // const audio = new Audio('/beep.mp3'); audio.play().catch(()=>{});
                            onScan(decodedText);
                        }
                    },
                    (errorMessage: any) => {
                        // Ignore frame parse errors
                    }
                );
            } catch (err: any) {
                console.error("Scanner Error:", err);
                if (isMounted) {
                    setErrorMsg(err.message || "无法启动摄像头");
                }
            }
        };

        initScanner();

        return () => {
            isMounted = false;
            if (scannerRef.current) {
                scannerRef.current.stop().then(() => {
                    scannerRef.current.clear();
                }).catch((err: any) => console.error("Failed to stop scanner", err));
            }
        };
    }, []);

    return (
        <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center animate-fade-in">
            <div className="absolute top-4 left-0 right-0 text-center z-10">
                <h3 className="text-white font-bold text-lg drop-shadow-md">{title}</h3>
                <p className="text-gray-400 text-xs mt-1">将条码或二维码放入框内</p>
            </div>

            <div className="relative w-full max-w-md aspect-square bg-black overflow-hidden">
                <div id="reader" className="w-full h-full"></div>
                
                {/* Visual Guide Overlay */}
                <div className="absolute inset-0 pointer-events-none border-[40px] border-black/50">
                    <div className="w-full h-full border-2 border-green-500/50 relative">
                        <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-green-500"></div>
                        <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-green-500"></div>
                        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-green-500"></div>
                        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-green-500"></div>
                        
                        {/* Scanning Line Animation */}
                        <div className="absolute left-0 right-0 h-0.5 bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-[scan_2s_infinite]"></div>
                    </div>
                </div>
            </div>

            {errorMsg && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white text-red-600 p-4 rounded-xl shadow-xl text-center w-3/4">
                    <Icons.AlertTriangle className="mx-auto mb-2"/>
                    <p className="text-sm font-bold">{errorMsg}</p>
                    <button onClick={onClose} className="mt-4 px-4 py-2 bg-gray-100 rounded-lg text-xs font-bold">关闭</button>
                </div>
            )}

            <button onClick={onClose} className="absolute bottom-10 px-8 py-3 bg-white/20 backdrop-blur-md text-white rounded-full font-bold border border-white/10 hover:bg-white/30 transition-colors flex items-center gap-2">
                <Icons.Minus size={18}/> 取消扫码
            </button>

            <style>{`
                @keyframes scan {
                    0% { top: 0%; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
            `}</style>
        </div>
    );
};
