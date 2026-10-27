import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { Button, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { dayKey, localParts, parseLocal } from '@/lib/format';
import { usePalette } from '@/lib/theme';
import type { CalendarEvent } from '@/lib/types';

function plusHour(time: string) {
  const [h, m] = time.split(':').map(Number);
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function EventScreen() {
  const c = usePalette();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; event?: string }>();
  const existing = useMemo(() => (params.event ? (JSON.parse(params.event) as CalendarEvent) : null), [params.event]);
  const start = existing ? localParts(existing.startsAt) : { date: dayKey(new Date()), time: '09:00' };
  const end = existing ? localParts(existing.endsAt) : { date: start.date, time: plusHour(start.time) };

  const [title, setTitle] = useState(existing?.title ?? '');
  const [date, setDate] = useState(start.date);
  const [from, setFrom] = useState(start.time);
  const [to, setTo] = useState(end.time);
  const [location, setLocation] = useState(existing?.location ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const startsAt = parseLocal(date, from);
    const endsAt = parseLocal(date, to);
    if (!title.trim()) return setError('Informe um título.');
    if (!startsAt || !endsAt) return setError('Use a data como 2026-03-05 e a hora como 14:30.');
    if (endsAt <= startsAt) return setError('O término precisa ser depois do início.');
    setBusy('save');
    setError(null);
    try {
      const body = { title: title.trim(), startsAt, endsAt, location: location.trim() || undefined, description: description.trim() || undefined };
      if (existing) await api(`/calendar/${existing.id}`, { method: 'PATCH', body });
      else await api('/calendar', { method: 'POST', body });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar');
      setBusy(null);
    }
  }

  async function remove() {
    if (!existing) return;
    setBusy('delete');
    try {
      await api(`/calendar/${existing.id}`, { method: 'DELETE' });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível excluir');
      setBusy(null);
    }
  }

  function confirmRemove() {
    if (Platform.OS === 'web') return void remove();
    Alert.alert('Excluir compromisso?', existing?.title, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Excluir', style: 'destructive', onPress: () => void remove() }]);
  }

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: existing ? 'Editar compromisso' : 'Novo compromisso' }} />
      <Field label="Título" value={title} onChangeText={setTitle} />
      <Field label="Data (AAAA-MM-DD)" value={date} onChangeText={setDate} autoCapitalize="none" keyboardType="numbers-and-punctuation" />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}><Field label="Início (HH:MM)" value={from} onChangeText={setFrom} keyboardType="numbers-and-punctuation" /></View>
        <View style={{ flex: 1 }}><Field label="Término (HH:MM)" value={to} onChangeText={setTo} keyboardType="numbers-and-punctuation" /></View>
      </View>
      <Field label="Local ou link" value={location} onChangeText={setLocation} autoCapitalize="none" />
      <Field label="Descrição" value={description} onChangeText={setDescription} multiline />
      {error ? <Text accessibilityRole="alert" style={{ color: c.danger }}>{error}</Text> : null}
      <Button title="Salvar" onPress={save} busy={busy === 'save'} disabled={busy !== null} />
      {existing ? <Button title="Excluir" tone="danger" onPress={confirmRemove} busy={busy === 'delete'} disabled={busy !== null} /> : null}
    </ScrollView>
  );
}
