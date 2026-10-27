import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Text, View } from 'react-native';
import { Button, Card, Chip, ErrorNote, Field, SectionTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { LEAD_STATUSES, LEAD_STATUS_LABEL, dialDigits, personName, relativeTime } from '@/lib/format';
import { usePalette } from '@/lib/theme';
import type { LeadDetail } from '@/lib/types';
import { useResource } from '@/lib/use-resource';

export default function LeadScreen() {
  const c = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, refetch, setData } = useResource<LeadDetail>(`/leads/${id}`);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'note' | 'status' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function changeStatus(status: string) {
    if (!data || data.status === status || busy) return;
    const previous = data;
    setData({ ...data, status }); // optimistic; rolled back if the API refuses
    setBusy('status');
    setProblem(null);
    try {
      await api(`/leads/${id}`, { method: 'PATCH', body: { status } });
      await refetch();
    } catch (e) {
      setData(previous);
      setProblem(e instanceof Error ? e.message : 'Não foi possível alterar o status');
    } finally {
      setBusy(null);
    }
  }

  async function addNote() {
    const body = note.trim();
    if (!body || busy) return;
    setBusy('note');
    setProblem(null);
    try {
      await api(`/leads/${id}/notes`, { method: 'POST', body: { body } });
      setNote('');
      await refetch();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Não foi possível salvar a nota');
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) return <ActivityIndicator style={{ marginTop: 32 }} color={c.primary} />;
  if (!data) return <ErrorNote message={error ?? 'Lead não encontrado'} onRetry={refetch} />;

  const name = personName(data);
  const digits = dialDigits(data.phone);

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: name }} />
      <View style={{ gap: 2 }}>
        <Text style={{ color: c.text, fontSize: 22, fontWeight: '800' }}>{name}</Text>
        <Text style={{ color: c.muted }}>{[data.jobTitle, data.companyName].filter(Boolean).join(' · ')}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {digits ? <Button title="Ligar" tone="quiet" onPress={() => Linking.openURL(`tel:+${digits}`)} /> : null}
        {digits ? <Button title="WhatsApp" tone="quiet" onPress={() => Linking.openURL(`https://wa.me/${digits}`)} /> : null}
        {data.email ? <Button title="E-mail" tone="quiet" onPress={() => Linking.openURL(`mailto:${data.email}`)} /> : null}
      </View>

      <SectionTitle>Status</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {LEAD_STATUSES.map((value) => <Chip key={value} label={LEAD_STATUS_LABEL[value]} active={data.status === value} onPress={() => changeStatus(value)} />)}
      </View>
      {problem ? <Text accessibilityRole="alert" style={{ color: c.danger }}>{problem}</Text> : null}

      <SectionTitle>Contato</SectionTitle>
      <Card>
        <Text style={{ color: c.text }}>{data.email || 'Sem e-mail'}</Text>
        <Text style={{ color: c.text }}>{data.phone || 'Sem telefone'}</Text>
        {data.source ? <Text style={{ color: c.muted }}>Origem: {data.source}</Text> : null}
        {data.score != null ? <Text style={{ color: c.muted }}>Score: {data.score}</Text> : null}
      </Card>

      {data.enrollments.length ? (
        <>
          <SectionTitle>Campanhas</SectionTitle>
          {data.enrollments.map((enrollment) => (
            <Card key={enrollment.id}>
              <Text style={{ color: c.text, fontWeight: '600' }}>{enrollment.campaign.name}</Text>
              <Text style={{ color: c.muted }}>{enrollment.status}</Text>
            </Card>
          ))}
        </>
      ) : null}

      <SectionTitle>Nova nota</SectionTitle>
      <Field label="Anotação" value={note} onChangeText={setNote} multiline placeholder="O que aconteceu neste contato?" />
      <Button title="Salvar nota" onPress={addNote} busy={busy === 'note'} disabled={!note.trim()} />

      <SectionTitle>Histórico</SectionTitle>
      {data.activities.length === 0 ? <Text style={{ color: c.muted }}>Nada registrado ainda.</Text> : null}
      {data.activities.map((activity) => (
        <Card key={activity.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ color: c.text, fontWeight: '600', flex: 1 }}>{activity.title}</Text>
            <Text style={{ color: c.muted, fontSize: 12 }}>{relativeTime(activity.createdAt)}</Text>
          </View>
          {activity.body ? <Text style={{ color: c.muted }}>{activity.body}</Text> : null}
        </Card>
      ))}
    </ScrollView>
  );
}
