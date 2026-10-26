import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Modal, ScrollView, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Button, Card, EmptyState, ErrorNotice, Fab, ListRow, Pill, Screen, TextField } from '../components/ui';
import { spacing } from '../theme';
import { useCreateWebhook, useTestWebhook } from '../lib/hooks';

type Webhook = { id: string; name: string; url: string; events: string[] };
const EVENTS = ['lead.created', 'deal.won', 'deal.lost', 'campaign.completed', 'whatsapp.message.received'];

export default function WebhooksScreen() {
  const { theme } = useAuth();
  const { data, isLoading, error } = useQuery<Webhook[]>({ queryKey: ['webhooks'], queryFn: () => api('/webhooks') });
  const [showCreate, setShowCreate] = useState(false);
  const test = useTestWebhook();

  return (
    <Screen>
      <View style={{ padding: spacing.lg, paddingBottom: 6 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>Webhooks</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: 10, paddingBottom: 100 }}>
        {error ? <ErrorNotice message={(error as Error).message} /> : null}
        {isLoading ? <Text style={{ color: theme.muted }}>Carregando…</Text> : null}
        {!isLoading && !data?.length ? <EmptyState icon="webhooks" title="Nenhum webhook" /> : null}
        {data?.map((w) => (
          <Card key={w.id}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{w.name}</Text>
            <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>{w.url}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {w.events.map((e) => <Pill key={e} label={e} variant="outline" />)}
            </View>
            <View style={{ marginTop: 12 }}>
              <Button
                label="Testar"
                variant="ghost"
                onPress={() => test.mutate(w.id, { onSuccess: () => Alert.alert('Ok', 'Webhook testado com sucesso.'), onError: (e: any) => Alert.alert('Erro', e?.message ?? 'Falha ao testar.') })}
                loading={test.isPending}
              />
            </View>
          </Card>
        ))}
      </ScrollView>
      <Fab onPress={() => setShowCreate(true)} />
      <CreateWebhookModal visible={showCreate} onClose={() => setShowCreate(false)} />
    </Screen>
  );
}

function CreateWebhookModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useAuth();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const create = useCreateWebhook();

  function toggle(event: string) {
    setEvents((prev) => (prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]));
  }

  async function submit() {
    await create.mutateAsync({ name, url, events });
    setName('');
    setUrl('');
    setEvents([]);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: theme.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: 12, maxHeight: '85%' }}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }}>Novo webhook</Text>
          <TextField label="Nome" value={name} onChangeText={setName} />
          <TextField label="URL" value={url} onChangeText={setUrl} autoCapitalize="none" placeholder="https://..." />
          <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '700' }}>Eventos</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {EVENTS.map((e) => (
              <View
                key={e}
                onTouchEnd={() => toggle(e)}
                style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 99, backgroundColor: events.includes(e) ? theme.brand : theme.card, borderWidth: 1, borderColor: events.includes(e) ? theme.brand : theme.border }}
              >
                <Text style={{ color: events.includes(e) ? (theme.mode === 'dark' ? '#101114' : '#fff') : theme.muted, fontSize: 11, fontWeight: '700' }}>{e}</Text>
              </View>
            ))}
          </View>
          {create.isError ? <ErrorNotice message={(create.error as Error).message} /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button label="Cancelar" variant="ghost" full onPress={onClose} /></View>
            <View style={{ flex: 1 }}><Button label="Salvar" variant="primary" full onPress={submit} loading={create.isPending} disabled={!name || !url || !events.length} /></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
