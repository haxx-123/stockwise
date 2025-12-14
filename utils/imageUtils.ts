
import imageCompression from 'browser-image-compression';
import { getSupabaseClient } from '../services/supabaseClient';

export const compressImage = async (file: File): Promise<File> => {
    const options = {
        maxSizeMB: 0.2, // 200KB
        maxWidthOrHeight: 1024,
        useWebWorker: true
    };
    try {
        return await imageCompression(file, options);
    } catch (error) {
        console.error("Compression failed:", error);
        return file; // Fallback to original
    }
};

export const uploadImage = async (file: File): Promise<string | null> => {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
        const compressed = await compressImage(file);
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${file.name.split('.').pop()}`;
        
        const { data, error } = await client.storage
            .from('images') // Ensure this bucket exists in Supabase
            .upload(fileName, compressed);

        if (error) throw error;

        const { data: publicData } = client.storage.from('images').getPublicUrl(fileName);
        return publicData.publicUrl;
    } catch (e) {
        console.error("Upload failed:", e);
        return null;
    }
};
