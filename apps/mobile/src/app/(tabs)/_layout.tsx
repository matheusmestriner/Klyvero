import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { usePalette } from '@/lib/theme';

const glyph = (symbol: string) =>
  function TabIcon({ color }: { color: unknown }) {
    return <Text style={{ color: color as string, fontSize: 20 }}>{symbol}</Text>;
  };

export default function TabsLayout() {
  const c = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.card },
        headerTintColor: c.text,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
      }}
    >
      <Tabs.Screen name="inbox" options={{ title: 'Inbox', tabBarIcon: glyph('✉') }} />
      <Tabs.Screen name="leads" options={{ title: 'Leads', tabBarIcon: glyph('☺') }} />
      <Tabs.Screen name="agenda" options={{ title: 'Agenda', tabBarIcon: glyph('▦') }} />
      <Tabs.Screen name="more" options={{ title: 'Conta', tabBarIcon: glyph('⚙') }} />
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  );
}
