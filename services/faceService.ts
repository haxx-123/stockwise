
// Phase 3: Face Recognition Service using face-api.js
// Implements the "Browser-side Computation, Server-side Verification" architecture

declare const faceapi: any;

class FaceService {
    private modelsLoaded = false;
    private MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

    async loadModels() {
        if (this.modelsLoaded) return;
        
        try {
            console.log("Loading Face API models...");
            // Load Tiny Face Detector (lightweight) and Face Landmark/Recognition models
            await faceapi.nets.tinyFaceDetector.loadFromUri(this.MODEL_URL);
            await faceapi.nets.faceLandmark68Net.loadFromUri(this.MODEL_URL);
            await faceapi.nets.faceRecognitionNet.loadFromUri(this.MODEL_URL);
            this.modelsLoaded = true;
            console.log("Face API models loaded successfully");
        } catch (error) {
            console.error("Failed to load face models:", error);
            throw new Error("人脸模型加载失败，请检查网络连接");
        }
    }

    async getFaceDescriptor(videoElement: HTMLVideoElement): Promise<Float32Array | null> {
        if (!this.modelsLoaded) await this.loadModels();

        // Use Tiny Face Detector Options for performance on mobile
        const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
        
        const detection = await faceapi.detectSingleFace(videoElement, options)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) return null;
        
        return detection.descriptor; // Returns Float32Array(128)
    }

    // Calculate Euclidean Distance between two descriptors
    // Threshold usually 0.4 - 0.6. Lower is stricter.
    matchFace(descriptor: Float32Array, storedDescriptorStr: string, threshold = 0.5): boolean {
        try {
            const storedDescriptor = new Float32Array(Object.values(JSON.parse(storedDescriptorStr)));
            const distance = faceapi.euclideanDistance(descriptor, storedDescriptor);
            console.log(`Face Match Distance: ${distance} (Threshold: ${threshold})`);
            return distance < threshold;
        } catch (e) {
            console.error("Face match error", e);
            return false;
        }
    }
}

export const faceService = new FaceService();
