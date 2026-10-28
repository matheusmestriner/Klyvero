import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';
import { getItem, removeItem, setItem } from './storage';

const TOKEN_KEY = 'klyvero.pushToken';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** Asks for permission, gets the Expo token and registers it with the API. Silent when push is unavailable. */
export async function registerForPush(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'Mensagens', importance: Notifications.AndroidImportance.HIGH });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api('/devices', { method: 'POST', body: { token, platform: Platform.OS, deviceName: Device.deviceName ?? undefined } });
    await setItem(TOKEN_KEY, token);
  } catch {
    // Push is a convenience: never block the app on it.
  }
}

export async function unregisterPush(): Promise<void> {
  const token = await getItem(TOKEN_KEY);
  if (!token) return;
  await api('/devices/unregister', { method: 'POST', body: { token } }).catch(() => undefined);
  await removeItem(TOKEN_KEY);
}

/** Thread id carried by a notification the API sent for an inbound message. */
export function threadIdOf(response: Notifications.NotificationResponse): string | null {
  const data = response.notification.request.content.data as { type?: string; threadId?: string } | undefined;
  return data?.type === 'message' && data.threadId ? data.threadId : null;
}
