import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal, ScrollView, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Button, Card, EmptyState, ErrorNotice, Fab, Pill, Screen, TextField } from '../components/ui';
import { spacing } from '../theme';
import { useCreateIntegration } from '../lib/hooks';

type Integration = { id: string; name: string; type: string; status: string };
const TYPES = ['WHATSAPP', 'SMTP', 'GOOGLE_CALENDAR', 'OPENAI', 'WEBHOOK', 'PROSPECTING', 'STRIPE', 'CUSTOM'] as const;

export default function IntegrationsScreen() {
  const { theme } = useAuth();
  const { data, isLoading, error } = useQuery<Integration[]>({ queryKey: ['integrations'], queryFn: () => api('/integrations') });
  const [showCreate, setShowCreate] = useState(false);

  return (
    <Screen>
      <View style={{ padding: spacing.lg, paddingBottom: 6 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>Integrações</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: 10, paddingBottom: 100 }}>
        {error ? <ErrorNotice message={(error as Error).message} /> : null}
        {isLoading ? <Text style={{ color: theme.muted }}>Carregando…</Text> : null}
        {!isLoading && !data?.length ? <EmptyState icon="integrations" title="Nenhuma integração" /> : null}
        {data?.map((i) => (
          <Card key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{i.name}</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>{i.type}</Text>
            </View>
            <Pill label={i.status} variant={i.status === 'CONNECTED' ? 'solid' : i.status === 'ERROR' ? 'danger' : 'outline'} />
          </Card>
        ))}
      </ScrollView>
      <Fab onPress={() => setShowCreate(true)} />
      <CreateIntegrationModal visible={showCreate} onClose={() => setShowCreate(false)} />
    </Screen>
  );
}

function CreateIntegrationModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useAuth();
  const [name, setName] = useState('');
  const [type, setType] = useState<(typeof TYPES)[number]>('CUSTOM');
  const create = useCreateIntegration();

  async function submit() {
    await create.mutateAsync({ name, type });
    setName('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: theme.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: 12, maxHeight: '85%' }}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }}>Nova integração</Text>
          <TextField label="Nome" value={name} onChangeText={setName} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {TYPES.map((t) => (
              <View
                key={t}
                onTouchEnd={() => setType(t)}
                style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 99, backgroundColor: type === t ? theme.brand : theme.card, borderWidth: 1, borderColor: type === t ? theme.brand : theme.border }}
              >
                <Text style={{ color: type === t ? (theme.mode === 'dark' ? '#101114' : '#fff') : theme.muted, fontSize: 12, fontWeight: '700' }}>{t}</Text>
              </View>
            ))}
          </ScrollView>
          {create.isError ? <ErrorNotice message={(create.error as Error).message} /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button label="Cancelar" variant="ghost" full onPress={onClose} /></View>
            <View style={{ flex: 1 }}><Button label="Salvar" variant="primary" full onPress={submit} loading={create.isPending} disabled={!name} /></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
