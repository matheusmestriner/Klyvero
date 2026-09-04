import { useQuery } from '@tanstack/react-query';
import { Alert, Linking, ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Avatar, Button, Card, ErrorNotice, Pill, Screen } from '../components/ui';
import { Icon } from '../components/icons';
import { spacing } from '../theme';
import type { CrmStackParamList } from '../navigation/types';
import { useDeleteLead, useUpdateLead } from '../lib/hooks';

type Lead = {
  id: string; firstName?: string; lastName?: string; companyName?: string; email?: string; phone?: string;
  status: string; source?: string; jobTitle?: string; notes?: string;
};

type Props = NativeStackScreenProps<CrmStackParamList, 'LeadDetail'>;

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
}

export default function LeadDetailScreen({ route, navigation }: Props) {
  const { theme } = useAuth();
  const { data: leads } = useQuery<Lead[]>({ queryKey: ['leads'], queryFn: () => api('/leads') });
  const lead = leads?.find((l) => l.id === route.params.id);
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();

  if (!lead) {
    return (
      <Screen>
        <View style={{ padding: spacing.lg }}>
          <Text style={{ color: theme.muted }}>Carregando lead…</Text>
        </View>
      </Screen>
    );
  }

  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Sem nome';

  function callAction(kind: 'whatsapp' | 'mail' | 'call') {
    if (kind === 'whatsapp' && lead!.phone) Linking.openURL(`https://wa.me/${lead!.phone.replace(/\D/g, '')}`);
    else if (kind === 'mail' && lead!.email) Linking.openURL(`mailto:${lead!.email}`);
    else if (kind === 'call' && lead!.phone) Linking.openURL(`tel:${lead!.phone}`);
    else Alert.alert('Sem dado', 'Este lead não tem essa informação de contato.');
  }

  async function advance() {
    await updateLead.mutateAsync({ id: lead!.id, body: { status: 'QUALIFIED' } });
  }

  function remove() {
    Alert.alert('Excluir lead', `Remover "${name}" permanentemente?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await deleteLead.mutateAsync(lead!.id);
          navigation.goBack();
        },
      },
    ]);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 14, paddingBottom: 40 }}>
        <Card style={{ alignItems: 'center', paddingVertical: 22 }}>
          <Avatar label={initials(name)} size={64} />
          <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800', marginTop: 12 }}>{name}</Text>
          <Text style={{ color: theme.muted, fontSize: 12.5 }}>{lead.companyName || '—'}</Text>
          <View style={{ marginTop: 8 }}>
            <Pill label={lead.status} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            {(['whatsapp', 'mail', 'call'] as const).map((kind) => (
              <View
                key={kind}
                onTouchEnd={() => callAction(kind)}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.brand, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name={kind === 'call' ? 'phoneCall' : kind === 'mail' ? 'email' : 'whatsapp'} size={19} color={theme.mode === 'dark' ? '#101114' : '#fff'} />
              </View>
            ))}
          </View>
        </Card>

        <Card>
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14, marginBottom: 8 }}>Informações</Text>
          {[
            ['E-mail', lead.email || '—'],
            ['Telefone', lead.phone || '—'],
            ['Origem', lead.source || '—'],
            ['Cargo', lead.jobTitle || '—'],
          ].map(([label, value]) => (
            <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border }}>
              <Text style={{ color: theme.muted, fontSize: 12.5 }}>{label}</Text>
              <Text style={{ color: theme.text, fontSize: 12.5, fontWeight: '700' }}>{value}</Text>
            </View>
          ))}
        </Card>

        {lead.notes ? (
          <Card>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14, marginBottom: 6 }}>Notas</Text>
            <Text style={{ color: theme.muted, fontSize: 13 }}>{lead.notes}</Text>
          </Card>
        ) : null}

        {updateLead.isError ? <ErrorNotice message={(updateLead.error as Error).message} /> : null}

        <Button label="Marcar como qualificado" variant="primary" full onPress={advance} loading={updateLead.isPending} />
        <Button label="Excluir lead" variant="ghost" full onPress={remove} loading={deleteLead.isPending} />
      </ScrollView>
    </Screen>
  );
}
