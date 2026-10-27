import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { threadIdOf } from '@/lib/push';
import { SessionProvider, useSession } from '@/lib/session';
import { usePalette } from '@/lib/theme';

void SplashScreen.preventAutoHideAsync();

/** A tap on a push notification opens that conversation (also when the app was closed). Native only. */
function NotificationLinks({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const threadId = response ? threadIdOf(response) : null;
    if (signedIn && threadId) router.push(`/thread/${threadId}`);
  }, [response, signedIn, router]);
  return null;
}

function Routes() {
  const { state } = useSession();
  const c = usePalette();
  const signedIn = state.status === 'in';

  useEffect(() => {
    if (state.status !== 'loading') void SplashScreen.hideAsync();
  }, [state.status]);

  if (state.status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <>
    {Platform.OS !== 'web' ? <NotificationLinks signedIn={signedIn} /> : null}
    <Stack screenOptions={{ headerStyle: { backgroundColor: c.card }, headerTintColor: c.text, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="thread/[id]" options={{ title: 'Conversa' }} />
        <Stack.Screen name="lead/[id]" options={{ title: 'Lead' }} />
        <Stack.Screen name="event/[id]" options={{ title: 'Compromisso', presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
    </>
  );
}

export default function RootLayout() {
  const c = usePalette();
  return (
    <SessionProvider>
      <StatusBar style={c.bg === '#0B1220' ? 'light' : 'dark'} />
      <Routes />
    </SessionProvider>
  );
}
