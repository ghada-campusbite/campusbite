import { useEffect } from 'react';
import { I18nManager } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { registerForPush } from '../src/push';
import { AuthProvider, useAuth } from '../src/auth';
import { colors } from '../src/theme';
import { BottomNav } from '../src/BottomNav';
import { View } from 'react-native';

// RTL is set natively at build time by expo-localization; this is the dev fallback (needs one app reload)
if (!I18nManager.isRTL) { I18nManager.allowRTL(true); I18nManager.forceRTL(true); }

function Gate() {
  const { ready, signedIn, verified } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    const seg = segments[0];
    const publicScreen = seg === 'login' || seg === 'forgot';
    if (!signedIn && !publicScreen) router.replace('/login');
    else if (signedIn && verified === false && seg !== 'verify') router.replace('/verify');
    else if (signedIn && verified === true && (publicScreen || seg === 'verify')) router.replace('/');
  }, [ready, signedIn, verified, segments]);
  useEffect(() => { if (ready && signedIn) registerForPush(false); }, [ready, signedIn]);
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(() => router.push('/orders'));
    return () => sub.remove();
  }, []);
  return (
    <View style={{ flex: 1 }}>
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.violet }, headerTintColor: '#fff', contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="index" options={{ title: 'المطاعم' }} />
      <Stack.Screen name="canteen/[id]" options={{ title: 'اطلب' }} />
      <Stack.Screen name="orders" options={{ title: 'طلباتي' }} />
      <Stack.Screen name="forgot" options={{ title: 'نسيت الباسورد' }} />
      <Stack.Screen name="verify" options={{ headerShown: false }} />
      <Stack.Screen name="account" options={{ title: 'حسابي' }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
    </Stack>
    {signedIn && verified !== false && <BottomNav />}
    </View>
  );
}

export default function Root() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Gate />
    </AuthProvider>
  );
}
