import { Text, View } from 'react-native';
import { Button, Card } from '@/components/ui';
import { API_URL } from '@/lib/config';
import { useSession } from '@/lib/session';
import { usePalette } from '@/lib/theme';
import { useState } from 'react';

export default function More() {
  const c = usePalette();
  const { state, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  if (state.status !== 'in') return null;
  const { user, tenant } = state.session;
  return (
    <View style={{ flex: 1, padding: 16, gap: 16, backgroundColor: c.bg }}>
      <Card>
        <Text style={{ color: c.text, fontSize: 18, fontWeight: '700' }}>{user.name}</Text>
        <Text style={{ color: c.muted }}>{user.email}</Text>
        <Text style={{ color: c.muted }}>{tenant.name} · {user.role}</Text>
      </Card>
      <Text style={{ color: c.muted, fontSize: 12 }}>Servidor: {API_URL}</Text>
      <Button
        title="Sair"
        tone="danger"
        busy={busy}
        onPress={() => {
          setBusy(true);
          void signOut().finally(() => setBusy(false));
        }}
      />
    </View>
  );
}
