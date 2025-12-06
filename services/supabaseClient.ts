import { createClient, SupabaseClient } from "@supabase/supabase-js";

const STORAGE_KEY_URL = 'stockwise_sb_url';
const STORAGE_KEY_KEY = 'stockwise_sb_key';

export const getSupabaseConfig = () => {
  return {
    url: localStorage.getItem(STORAGE_KEY_URL) || '',
    key: localStorage.getItem(STORAGE_KEY_KEY) || ''
  };
};

export const saveSupabaseConfig = (url: string, key: string) => {
  localStorage.setItem(STORAGE_KEY_URL, url);
  localStorage.setItem(STORAGE_KEY_KEY, key);
};

export const isConfigured = () => {
  const { url, key } = getSupabaseConfig();
  return !!url && !!key;
};

export const getSupabaseClient = (): SupabaseClient | null => {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return null;
  try {
      return createClient(url, key);
  } catch (e) {
      console.error("Failed to create Supabase client", e);
      return null;
  }
};