import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { secureStorage } from './secureStorage';

const webMemoryStorage = new Map<string, string>();

const webStorage = {
  async getItem(key: string): Promise<string | null> {
    if (typeof window !== 'undefined') return window.localStorage.getItem(key);
    return webMemoryStorage.get(key) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
      return;
    }
    webMemoryStorage.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(key);
      return;
    }
    webMemoryStorage.delete(key);
  },
};

const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const configuredKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(configuredUrl && configuredKey);

export const supabase = createClient(
  configuredUrl ?? 'https://not-configured.supabase.co',
  configuredKey ?? 'sb_publishable_not_configured',
  {
    auth: {
      storage: Platform.OS === 'web' ? webStorage : secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
