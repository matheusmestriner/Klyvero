import { ScrollView, Text, View } from 'react-native';
import { useAuth } from '../lib/auth-context';
import { Avatar, Button, Card, ListRow, Pill, Screen } from '../components/ui';
import { spacing } from '../theme';

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  MANAGER: 'Gestor',
  SDR: 'SDR',
  MEMBER: 'Membro',
  VIEWER: 'Visualizador',
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'U';
}

export default function ProfileScreen() {
  const { theme, user, branding, logout, themePreference, setThemePreference } = useAuth();

  return (
    <Screen>
      <View style={{ padding: spacing.lg, paddingBottom: 6 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>Perfil</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: 14, paddingBottom: 40 }}>
        <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
          <Avatar label={initials(user?.name ?? 'U')} size={64} />
          <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800', marginTop: 12 }}>{user?.name}</Text>
          <Text style={{ color: theme.muted, fontSize: 12.5 }}>{user?.email}</Text>
          <View style={{ marginTop: 8 }}>
            <Pill label={ROLE_LABEL[user?.role ?? ''] ?? user?.role ?? ''} variant="solid" />
          </View>
        </Card>

        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.brand }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{branding?.branding?.productName || 'Klyvero'}</Text>
            <Text style={{ color: theme.muted, fontSize: 11.5 }}>WORKSPACE</Text>
          </View>
        </Card>

        <Card>
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14, marginBottom: 10 }}>Tema</Text>
          <View style={{ flexDirection: 'row', backgroundColor: theme.tint(0.06), borderRadius: 11, padding: 3, gap: 2 }}>
            {(['light', 'dark', 'system'] as const).map((mode) => (
              <View
                key={mode}
                onTouchEnd={() => setThemePreference(mode)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 8,
                  borderRadius: 9,
                  backgroundColor: themePreference === mode ? theme.card : 'transparent',
                }}
              >
                <Text style={{ color: themePreference === mode ? theme.text : theme.muted, fontSize: 12, fontWeight: '700' }}>
                  {mode === 'light' ? 'Claro' : mode === 'dark' ? 'Escuro' : 'Sistema'}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        <Card style={{ padding: 4 }}>
          <ListRow icon="bell" title="Notificações" />
          <ListRow icon="crm" title="Segurança" />
          <ListRow icon="inbox" title="Ajuda e suporte" />
        </Card>

        <Button label="Sair da conta" onPress={logout} full />
      </ScrollView>
    </Screen>
  );
}
