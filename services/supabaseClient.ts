import { createClient, SupabaseClient } from "@supabase/supabase-js";

const STORAGE_KEY_URL = 'stockwise_sb_url';
const STORAGE_KEY_KEY = 'stockwise_sb_key';

// Hardcoded configuration
const HARDCODED_URL = 'https://stockwise.art/api';
const HARDCODED_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyY3Jtd2xlaHFlZGpwenRxamhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDIzODksImV4cCI6MjA4MDQ3ODM4OX0.Z_XK7Zb0iC598aG4Rx7YqSP4VM7Q5NmuPCK-gOWf7GI';

export const getSupabaseConfig = () => {
  let url = localStorage.getItem(STORAGE_KEY_URL);
  let key = localStorage.getItem(STORAGE_KEY_KEY);

  // Auto-migration: If URL is missing or is the old supabase.co address, enforce the new hardcoded URL
  if (!url || url.includes('supabase.co')) {
      url = HARDCODED_URL;
      localStorage.setItem(STORAGE_KEY_URL, HARDCODED_URL);
  }

  // Ensure Key is set
  if (!key) {
      key = HARDCODED_KEY;
      localStorage.setItem(STORAGE_KEY_KEY, HARDCODED_KEY);
  }

  return {
    url: url || HARDCODED_URL,
    key: key || HARDCODED_KEY
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
