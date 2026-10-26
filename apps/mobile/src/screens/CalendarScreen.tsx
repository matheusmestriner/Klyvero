import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Modal, ScrollView, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Button, Card, EmptyState, ErrorNotice, Fab, Screen, TextField } from '../components/ui';
import { spacing } from '../theme';
import { useCreateEvent, useDeleteEvent } from '../lib/hooks';

type Event = { id: string; title: string; startsAt: string; endsAt: string; attendeeName?: string };

export default function CalendarScreen() {
  const { theme } = useAuth();
  const { data, isLoading, error } = useQuery<Event[]>({ queryKey: ['calendar'], queryFn: () => api('/calendar') });
  const [showCreate, setShowCreate] = useState(false);
  const deleteEvent = useDeleteEvent();

  const upcoming = useMemo(() => (data ?? []).filter((e) => new Date(e.endsAt) >= new Date()).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)), [data]);

  return (
    <Screen>
      <View style={{ padding: spacing.lg, paddingBottom: 6 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>Agenda</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: 10, paddingBottom: 100 }}>
        {error ? <ErrorNotice message={(error as Error).message} /> : null}
        {isLoading ? <Text style={{ color: theme.muted }}>Carregando…</Text> : null}
        {!isLoading && !upcoming.length ? <EmptyState icon="calendar" title="Nada agendado" hint="Crie um evento com o botão +." /> : null}
        {upcoming.map((event) => {
          const start = new Date(event.startsAt);
          return (
            <Card
              key={event.id}
              style={{ flexDirection: 'row', gap: 12, paddingVertical: 13 }}
            >
              <View
                style={{ flex: 1, flexDirection: 'row', gap: 12 }}
                onTouchEnd={() =>
                  Alert.alert(event.title, undefined, [
                    { text: 'Excluir', style: 'destructive', onPress: () => deleteEvent.mutate(event.id) },
                    { text: 'Fechar', style: 'cancel' },
                  ])
                }
              >
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 13 }}>
                    {start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 10.5 }}>{start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</Text>
                </View>
                <View style={{ width: 1, backgroundColor: theme.border }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{event.title}</Text>
                  {event.attendeeName ? <Text style={{ color: theme.muted, fontSize: 12 }}>{event.attendeeName}</Text> : null}
                </View>
              </View>
            </Card>
          );
        })}
      </ScrollView>
      <Fab onPress={() => setShowCreate(true)} />
      <CreateEventModal visible={showCreate} onClose={() => setShowCreate(false)} />
    </Screen>
  );
}

function CreateEventModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useAuth();
  const [title, setTitle] = useState('');
  const [minutesFromNow, setMinutesFromNow] = useState('60');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const create = useCreateEvent();

  async function submit() {
    const startsAt = new Date(Date.now() + Number(minutesFromNow || 60) * 60_000);
    const endsAt = new Date(startsAt.getTime() + Number(durationMinutes || 30) * 60_000);
    await create.mutateAsync({ title, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
    setTitle('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: theme.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: 12 }}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }}>Novo evento</Text>
          <TextField label="Título" value={title} onChangeText={setTitle} placeholder="Reunião com cliente" />
          <TextField label="Começa em (minutos a partir de agora)" value={minutesFromNow} onChangeText={setMinutesFromNow} keyboardType="numeric" />
          <TextField label="Duração (minutos)" value={durationMinutes} onChangeText={setDurationMinutes} keyboardType="numeric" />
          {create.isError ? <ErrorNotice message={(create.error as Error).message} /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button label="Cancelar" variant="ghost" full onPress={onClose} /></View>
            <View style={{ flex: 1 }}><Button label="Salvar" variant="primary" full onPress={submit} loading={create.isPending} disabled={!title} /></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
