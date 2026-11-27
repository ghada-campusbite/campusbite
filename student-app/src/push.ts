import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { store } from './api';
import Constants from 'expo-constants';
import { api } from './api';

// show the banner even while the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

// ask=false: only register if permission was already granted (no prompt at login).
// ask=true: show the permission prompt (we call this right after the first order, when it makes sense to the user).
export async function registerForPush(ask: boolean) {
  try {
    if (!Device.isDevice) return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('orders', { name: 'الطلبات', importance: Notifications.AndroidImportance.HIGH });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && ask) status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
    if (!projectId) { console.warn('push: run `npx eas init` to set the EAS projectId'); return; }
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api('/devices', { method: 'POST', body: { token } });
    await store.setItemAsync('pt', token);
  } catch (e) {
    console.warn('push registration failed', e);
  }
}

export async function unregisterPush() {
  const token = await store.getItemAsync('pt');
  if (!token) return;
  await api('/devices', { method: 'DELETE', body: { token } }).catch(() => {});
  await store.deleteItemAsync('pt');
}
