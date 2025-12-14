
import React, { useRef, useEffect, useState } from 'react';

declare const faceapi: any;

interface FaceAuthProps {
    onSuccess: () => void;
    onCancel: () => void;
    mode?: 'LOGIN' | 'REGISTER';
    existingDescriptor?: string; // For login match
    onCapture?: (descriptor: string) => void; // For register
}

export const FaceAuth: React.FC<FaceAuthProps> = ({ onSuccess, onCancel, mode = 'LOGIN', existingDescriptor, onCapture }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [status, setStatus] = useState('初始化视觉引擎...');
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [stream, setStream] = useState<MediaStream | null>(null);

    useEffect(() => {
        const loadModels = async () => {
            try {
                // Load simplified models from CDN
                await faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/');
                await faceapi.nets.faceLandmark68Net.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/');
                await faceapi.nets.faceRecognitionNet.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/');
                setIsModelLoaded(true);
                startCamera();
            } catch (e) {
                setStatus("模型加载失败，请检查网络");
            }
        };
        loadModels();
        return () => stopCamera();
    }, []);

    const startCamera = async () => {
        try {
            const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            setStream(s);
            if (videoRef.current) {
                videoRef.current.srcObject = s;
            }
            setStatus("请正对摄像头，保持光线充足...");
        } catch (e) {
            setStatus("无法访问摄像头");
        }
    };

    const stopCamera = () => {
        if (stream) stream.getTracks().forEach(t => t.stop());
    };

    const handleVideoPlay = () => {
        const interval = setInterval(async () => {
            if (!videoRef.current || !canvasRef.current || videoRef.current.paused || videoRef.current.ended) return;

            const displaySize = { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight };
            faceapi.matchDimensions(canvasRef.current, displaySize);

            const detections = await faceapi.detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptors();
            
            // Clear canvas
            const ctx = canvasRef.current.getContext('2d');
            ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

            if (detections.length > 0) {
                const det = detections[0];
                const box = det.detection.box;
                
                // Draw Green Box
                if (ctx) {
                    ctx.strokeStyle = '#00ff00';
                    ctx.lineWidth = 4;
                    ctx.strokeRect(box.x, box.y, box.width, box.height);
                }

                if (mode === 'REGISTER') {
                    if (det.descriptor) {
                        clearInterval(interval);
                        setStatus("采集成功！");
                        // Serialize float32array to string
                        const descStr = JSON.stringify(Array.from(det.descriptor));
                        if(onCapture) onCapture(descStr);
                        setTimeout(onSuccess, 1000);
                    }
                } else if (mode === 'LOGIN' && existingDescriptor) {
                    const stored = new Float32Array(JSON.parse(existingDescriptor));
                    const dist = faceapi.euclideanDistance(det.descriptor, stored);
                    if (dist < 0.6) { // Threshold
                        clearInterval(interval);
                        setStatus("识别通过！");
                        setTimeout(onSuccess, 1000);
                    } else {
                        setStatus("人脸不匹配");
                    }
                }
            } else {
                setStatus("未检测到人脸...");
            }
        }, 500);
        return () => clearInterval(interval);
    };

    return (
        <div className="fixed inset-0 bg-black/90 z-[100] flex flex-col items-center justify-center p-4">
            <div className="relative w-full max-w-md aspect-square bg-gray-900 rounded-3xl overflow-hidden border-2 border-white/20 shadow-2xl">
                <video 
                    ref={videoRef} 
                    autoPlay 
                    muted 
                    onPlay={handleVideoPlay}
                    className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
                
                {/* Overlay UI */}
                <div className="absolute inset-0 border-[20px] border-black/50 rounded-3xl pointer-events-none"></div>
                <div className="absolute bottom-4 left-0 right-0 text-center">
                    <span className="bg-black/60 text-white px-4 py-2 rounded-full font-bold text-sm backdrop-blur-md">
                        {status}
                    </span>
                </div>
            </div>
            <button onClick={()=>{stopCamera(); onCancel();}} className="mt-8 px-8 py-3 bg-white/10 text-white rounded-xl border border-white/20 font-bold hover:bg-white/20">
                取消
            </button>
        </div>
    );
};
