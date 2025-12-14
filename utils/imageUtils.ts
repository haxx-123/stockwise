
import imageCompression from 'browser-image-compression';
import { getSupabaseClient } from '../services/supabaseClient';

export const compressImage = async (file: File): Promise<File> => {
    const options = {
        maxSizeMB: 0.2, // 200KB limit
        maxWidthOrHeight: 1024, // 1024px limit
        useWebWorker: true,
        fileType: 'image/jpeg' // Force convert to JPEG for consistency
    };
    try {
        return await imageCompression(file, options);
    } catch (error) {
        console.error("Compression failed:", error);
        return file; // Fallback to original if compression fails
    }
};

export const uploadImage = async (file: File): Promise<string | null> => {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
        const compressed = await compressImage(file);
        // Generate a random path: images/timestamp_random.jpg
        const fileExt = 'jpg';
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { data, error } = await client.storage
            .from('images') // Ensure this bucket exists in Supabase and is Public
            .upload(fileName, compressed, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) throw error;

        // Get Public URL
        const { data: publicData } = client.storage.from('images').getPublicUrl(fileName);
        return publicData.publicUrl;
    } catch (e) {
        console.error("Upload failed:", e);
        alert("图片上传失败，请检查网络或 Supabase 配置。");
        return null;
    }
};
