import Constants from 'expo-constants';

/** EXPO_PUBLIC_API_URL wins (local development); otherwise the URL declared in app.json. */
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'http://localhost:4000'
).replace(/\/+$/, '');

export const API_BASE = `${API_URL}/api/v1`;
