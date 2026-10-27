import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { ErrorNote } from '@/components/ui';
import { api } from '@/lib/api';
import { dayHeading, dayKey, personName, timeLabel } from '@/lib/format';
import { usePalette } from '@/lib/theme';
import type { Message, Thread } from '@/lib/types';
import { useResource } from '@/lib/use-resource';

type Page = { thread: Omit<Thread, 'lastMessage' | 'unread'>; items: Message[]; hasMore: boolean };

export default function ThreadScreen() {
  const c = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, refetch } = useResource<Page>(`/inbox/threads/${id}/messages`);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [olderPages, setOlderPages] = useState<{ items: Message[]; hasMore: boolean } | null>(null);
  const list = useRef<FlatList<Message>>(null);

  const older = olderPages?.items ?? [];
  const messages = data ? [...older, ...data.items] : [];
  const hasMore = olderPages ? olderPages.hasMore : (data?.hasMore ?? false);

  // Opening the conversation marks what arrived as read.
  useEffect(() => {
    if (data?.items.some((message) => message.direction === 'INBOUND')) void api(`/inbox/threads/${id}/read`, { method: 'POST' }).catch(() => undefined);
  }, [data, id]);

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest) return;
    const page = await api<Page>(`/inbox/threads/${id}/messages?before=${encodeURIComponent(oldest.createdAt)}`);
    setOlderPages({ items: [...page.items, ...older], hasMore: page.hasMore });
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await api(`/inbox/threads/${id}/reply`, { method: 'POST', body: { text } });
      setDraft('');
      await refetch();
      setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Não foi possível enviar');
    } finally {
      setSending(false);
    }
  }

  const title = data ? personName(data.thread.contact, data.thread.externalKey ?? 'Conversa') : 'Conversa';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90} style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title }} />
      {loading && !data ? <ActivityIndicator style={{ marginTop: 32 }} color={c.primary} /> : null}
      {error && !data ? <ErrorNote message={error} onRetry={refetch} /> : null}
      {data ? (
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(message) => message.id}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          onContentSizeChange={() => older.length === 0 && list.current?.scrollToEnd({ animated: false })}
          ListHeaderComponent={hasMore ? <Pressable onPress={loadOlder} style={{ padding: 10, alignItems: 'center' }}><Text style={{ color: c.primary }}>Carregar anteriores</Text></Pressable> : undefined}
          renderItem={({ item, index }) => {
            const out = item.direction === 'OUTBOUND';
            const newDay = index === 0 || dayKey(messages[index - 1].createdAt) !== dayKey(item.createdAt);
            return (
              <View>
                {newDay ? <Text style={{ color: c.muted, textAlign: 'center', fontSize: 12, marginVertical: 8 }}>{dayHeading(dayKey(item.createdAt))}</Text> : null}
                <View style={{ alignSelf: out ? 'flex-end' : 'flex-start', maxWidth: '82%', backgroundColor: out ? c.bubbleOut : c.bubbleIn, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: c.border, gap: 2 }}>
                  {item.subject ? <Text style={{ color: c.text, fontWeight: '700' }}>{item.subject}</Text> : null}
                  <Text style={{ color: c.text, fontSize: 15 }}>{item.text}</Text>
                  <Text style={{ color: item.status === 'FAILED' ? c.danger : c.muted, fontSize: 11, alignSelf: 'flex-end' }}>
                    {timeLabel(item.createdAt)}{item.status === 'FAILED' ? ' · falhou' : ''}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      ) : null}
      {sendError ? <Text accessibilityRole="alert" style={{ color: c.danger, paddingHorizontal: 12 }}>{sendError}</Text> : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.card }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Escreva uma resposta"
          placeholderTextColor={c.muted}
          multiline
          style={{ flex: 1, maxHeight: 120, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 10, color: c.text, fontSize: 16 }}
        />
        <Pressable
          accessibilityRole="button"
          onPress={send}
          disabled={!draft.trim() || sending}
          style={{ height: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: c.primary, justifyContent: 'center', opacity: !draft.trim() || sending ? 0.5 : 1 }}
        >
          {sending ? <ActivityIndicator color={c.onPrimary} /> : <Text style={{ color: c.onPrimary, fontWeight: '700' }}>Enviar</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
