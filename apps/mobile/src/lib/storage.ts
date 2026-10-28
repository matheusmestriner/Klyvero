import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// SecureStore is native-only; the web target (used for browser checks) falls back to localStorage.
const web = Platform.OS === 'web';

export async function getItem(key: string): Promise<string | null> {
  try {
    return web ? globalThis.localStorage?.getItem(key) ?? null : await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string) {
  if (web) globalThis.localStorage?.setItem(key, value);
  else await SecureStore.setItemAsync(key, value);
}

export async function removeItem(key: string) {
  try {
    if (web) globalThis.localStorage?.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  } catch {
    // nothing stored, nothing to remove
  }
}
