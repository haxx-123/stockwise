
import React, { useRef, useEffect, useState } from 'react';
import { Icons } from './Icons';

declare const faceapi: any;

interface FaceAuthProps {
    onSuccess: () => void;
    onCancel: () => void;
    mode: 'LOGIN' | 'REGISTER';
    existingDescriptor?: string; // JSON string of float array
    onCapture?: (descriptor: string) => void;
}

export const FaceAuth: React.FC<FaceAuthProps> = ({ onSuccess, onCancel, mode, existingDescriptor, onCapture }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [status, setStatus] = useState('正在启动视觉引擎...');
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Cleanup function to stop camera
    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    useEffect(() => {
        let isMounted = true;

        const startProcess = async () => {
            try {
                // 1. Load Models
                setStatus("正在加载 AI 模型...");
                const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
                ]);

                if (!isMounted) return;

                // 2. Start Camera
                setStatus("正在请求摄像头权限...");
                const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
                setStream(s);
                
                if (videoRef.current) {
                    videoRef.current.srcObject = s;
                }
                
                setStatus("请正对摄像头，保持光线充足");
                setIsProcessing(true);

            } catch (e: any) {
                console.error(e);
                setStatus(`设备不支持或权限被拒绝`);
            }
        };

        startProcess();

        return () => {
            isMounted = false;
            stopCamera();
        };
    }, []);

    // Detection Loop
    useEffect(() => {
        if (!isProcessing || !videoRef.current || !canvasRef.current) return;

        const interval = setInterval(async () => {
            if (videoRef.current && !videoRef.current.paused && !videoRef.current.ended) {
                // Prepare Canvas
                const displaySize = { 
                    width: videoRef.current.videoWidth, 
                    height: videoRef.current.videoHeight 
                };
                
                // Avoid 0x0 errors
                if (displaySize.width === 0 || displaySize.height === 0) return;

                faceapi.matchDimensions(canvasRef.current, displaySize);

                // Detect Face (Single)
                const detection = await faceapi.detectSingleFace(
                    videoRef.current, 
                    new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
                ).withFaceLandmarks().withFaceDescriptor();

                const ctx = canvasRef.current.getContext('2d');
                if (!ctx) return;
                ctx.clearRect(0, 0, displaySize.width, displaySize.height);

                if (detection) {
                    const { box } = detection.detection;
                    const score = detection.detection.score;

                    // Validate Quality (Score > 0.8)
                    const isHighQuality = score > 0.8;

                    // Draw Box
                    ctx.lineWidth = 4;
                    ctx.strokeStyle = isHighQuality ? '#00ff00' : '#00aaff'; // Green if good, Blue if detecting
                    ctx.strokeRect(box.x, box.y, box.width, box.height);

                    // Draw Score
                    ctx.fillStyle = isHighQuality ? '#00ff00' : '#00aaff';
                    ctx.font = '16px Arial';
                    ctx.fillText(`${Math.round(score * 100)}%`, box.x, box.y - 10);

                    if (isHighQuality) {
                        // Logic Branch
                        if (mode === 'REGISTER') {
                            setStatus("采集成功！正在处理...");
                            clearInterval(interval);
                            const descStr = JSON.stringify(Array.from(detection.descriptor));
                            if (onCapture) onCapture(descStr);
                            setTimeout(() => {
                                stopCamera();
                                onSuccess();
                            }, 500);
                        } 
                        else if (mode === 'LOGIN' && existingDescriptor) {
                            try {
                                const stored = new Float32Array(JSON.parse(existingDescriptor));
                                const dist = faceapi.euclideanDistance(detection.descriptor, stored);
                                
                                // Distance Threshold (Lower is stricter, usually 0.6 is good)
                                if (dist < 0.6) {
                                    setStatus("身份验证通过！");
                                    ctx.strokeStyle = '#00ff00';
                                    ctx.strokeRect(box.x, box.y, box.width, box.height);
                                    clearInterval(interval);
                                    setTimeout(() => {
                                        stopCamera();
                                        onSuccess();
                                    }, 500);
                                } else {
                                    setStatus("人脸不匹配，请重试");
                                    ctx.strokeStyle = '#ff0000'; // Red for mismatch
                                    ctx.strokeRect(box.x, box.y, box.width, box.height);
                                }
                            } catch (e) {
                                setStatus("人脸数据解析错误");
                            }
                        }
                    } else {
                        setStatus("请靠近一点，保持不动...");
                    }
                } else {
                    setStatus("未检测到人脸...");
                }
            }
        }, 200); // 5 FPS check

        return () => clearInterval(interval);
    }, [isProcessing, mode, existingDescriptor]);

    return (
        <div className="fixed inset-0 bg-black/95 z-[9999] flex flex-col items-center justify-center p-4 animate-fade-in">
            <div className="relative w-full max-w-sm aspect-[3/4] bg-gray-900 rounded-3xl overflow-hidden border-2 border-white/20 shadow-2xl">
                <video 
                    ref={videoRef} 
                    autoPlay 
                    muted 
                    playsInline
                    className="w-full h-full object-cover transform scale-x-[-1]" // Mirror effect
                />
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none transform scale-x-[-1]" />
                
                {/* Visual Overlay - Scanning Grid */}
                <div className="absolute inset-0 pointer-events-none opacity-20" 
                     style={{
                         backgroundImage: 'linear-gradient(rgba(0,255,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,0,0.1) 1px, transparent 1px)',
                         backgroundSize: '40px 40px'
                     }}>
                </div>
                
                {/* Status Bar */}
                <div className="absolute bottom-6 left-0 right-0 text-center z-10">
                    <span className="inline-block bg-black/60 backdrop-blur-md text-white px-6 py-3 rounded-full font-bold text-sm border border-white/10 shadow-lg">
                        {status}
                    </span>
                </div>
                
                {/* Close Button */}
                <button 
                    onClick={() => { stopCamera(); onCancel(); }}
                    className="absolute top-4 right-4 p-3 bg-black/40 text-white rounded-full hover:bg-white/20 transition-colors"
                >
                    <Icons.Minus size={24}/>
                </button>
            </div>
            
            <p className="text-gray-500 mt-6 text-sm">
                Powered by FaceAPI • TinyFaceDetector
            </p>
        </div>
    );
};
