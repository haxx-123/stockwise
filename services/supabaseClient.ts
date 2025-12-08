
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const STORAGE_KEY_URL = 'stockwise_sb_url';
const STORAGE_KEY_KEY = 'stockwise_sb_key';

// Default Values
const DEFAULT_URL = 'https://yrcrmwlehqedjpztqjho.supabase.co';
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyY3Jtd2xlaHFlZGpwenRxamhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDIzODksImV4cCI6MjA4MDQ3ODM4OX0.Z_XK7Zb0iC598aG4Rx7YqSP4VM7Q5NmuPCK-gOWf7GI';

export const getSupabaseConfig = () => {
  return {
    url: localStorage.getItem(STORAGE_KEY_URL) || DEFAULT_URL,
    key: localStorage.getItem(STORAGE_KEY_KEY) || DEFAULT_KEY
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