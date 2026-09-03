import { ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../lib/auth-context';
import { Avatar, Card, ListRow, Screen } from '../components/ui';
import { spacing } from '../theme';
import type { MoreStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MoreStackParamList, 'More'>;

const ADMIN_ROLES = new Set(['OWNER', 'ADMIN']);

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'U';
}

export default function MoreScreen({ navigation }: Props) {
  const { theme, user } = useAuth();
  const isAdmin = user ? ADMIN_ROLES.has(user.role) : false;

  return (
    <Screen>
      <View style={{ padding: spacing.lg, paddingBottom: 6 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>Mais</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: 14, paddingBottom: 40 }}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }} onTouchEnd={() => navigation.navigate('Profile')}>
            <Avatar label={initials(user?.name ?? 'U')} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{user?.name}</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>{user?.email}</Text>
            </View>
          </View>
        </Card>

        <View>
          <Text style={{ color: theme.muted, fontSize: 11.5, fontWeight: '800', textTransform: 'uppercase', marginBottom: 6 }}>Vendas & outreach</Text>
          <Card style={{ padding: 4 }}>
            <ListRow icon="campaigns" title="Campanhas" onPress={() => navigation.navigate('Campaigns')} />
            <ListRow icon="analytics" title="Analytics" onPress={() => navigation.navigate('Analytics')} />
            <ListRow icon="whatsapp" title="WhatsApp" onPress={() => navigation.navigate('WhatsAppConnect')} />
          </Card>
        </View>

        <View>
          <Text style={{ color: theme.muted, fontSize: 11.5, fontWeight: '800', textTransform: 'uppercase', marginBottom: 6 }}>Inteligência</Text>
          <Card style={{ padding: 4 }}>
            <ListRow icon="ai" title="Agentes IA" onPress={() => navigation.navigate('AIAgents')} />
          </Card>
        </View>

        {isAdmin ? (
          <>
            <View>
              <Text style={{ color: theme.muted, fontSize: 11.5, fontWeight: '800', textTransform: 'uppercase', marginBottom: 6 }}>Administração</Text>
              <Card style={{ padding: 4 }}>
                <ListRow icon="integrations" title="Integrações" onPress={() => navigation.navigate('Integrations')} />
                <ListRow icon="branding" title="White-label" onPress={() => navigation.navigate('WhiteLabel')} />
                <ListRow icon="team" title="Equipe" onPress={() => navigation.navigate('Team')} />
              </Card>
            </View>

            <View>
              <Text style={{ color: theme.muted, fontSize: 11.5, fontWeight: '800', textTransform: 'uppercase', marginBottom: 6 }}>Desenvolvedor</Text>
              <Card style={{ padding: 4 }}>
                <ListRow icon="api" title="API Keys" onPress={() => navigation.navigate('ApiKeys')} />
                <ListRow icon="webhooks" title="Webhooks" onPress={() => navigation.navigate('Webhooks')} />
              </Card>
            </View>

            <View>
              <Text style={{ color: theme.muted, fontSize: 11.5, fontWeight: '800', textTransform: 'uppercase', marginBottom: 6 }}>Conta</Text>
              <Card style={{ padding: 4 }}>
                <ListRow icon="billing" title="Plano e cobrança" onPress={() => navigation.navigate('Billing')} />
                <ListRow icon="audit" title="Auditoria" onPress={() => navigation.navigate('Audit')} />
              </Card>
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
