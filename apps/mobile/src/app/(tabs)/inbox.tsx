import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { Avatar, Chip, Empty, ErrorNote } from '@/components/ui';
import { personName, relativeTime } from '@/lib/format';
import type { Thread } from '@/lib/types';
import { usePalette } from '@/lib/theme';
import { useResource } from '@/lib/use-resource';

type Filter = 'ALL' | 'WHATSAPP' | 'EMAIL';
const FILTERS: [Filter, string][] = [['ALL', 'Todas'], ['WHATSAPP', 'WhatsApp'], ['EMAIL', 'E-mail']];

export default function Inbox() {
  const c = usePalette();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('ALL');
  const query = filter === 'ALL' ? '' : `?channel=${filter}`;
  const { data, error, loading, refetch } = useResource<{ items: Thread[] }>(`/inbox/threads${query}`);
  const [refreshing, setRefreshing] = useState(false);

  // Coming back from a conversation: unread counters changed.
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', gap: 8, padding: 12 }}>
        {FILTERS.map(([value, label]) => <Chip key={value} label={label} active={filter === value} onPress={() => setFilter(value)} />)}
      </View>
      {loading && !data ? <ActivityIndicator style={{ marginTop: 32 }} color={c.primary} /> : null}
      {error && !data ? <ErrorNote message={error} onRetry={refetch} /> : null}
      {data ? (
        <FlatList
          data={data.items}
          keyExtractor={(thread) => thread.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} />}
          ListEmptyComponent={<Empty title="Nenhuma conversa ainda" hint="As respostas de leads aparecem aqui." />}
          renderItem={({ item }) => <ThreadRow thread={item} onPress={() => router.push(`/thread/${item.id}`)} />}
        />
      ) : null}
    </View>
  );
}

function ThreadRow({ thread, onPress }: { thread: Thread; onPress: () => void }) {
  const c = usePalette();
  const name = personName(thread.contact, thread.externalKey ?? 'Contato');
  const preview = thread.lastMessage?.text?.trim() || thread.lastMessage?.subject || thread.subject || '';
  const unread = thread.unread > 0;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? c.chip : 'transparent', borderBottomWidth: 1, borderBottomColor: c.border })}>
      <Avatar name={name} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 16, fontWeight: unread ? '700' : '600' }}>{name}</Text>
          <Text style={{ color: unread ? c.primary : c.muted, fontSize: 12 }}>{relativeTime(thread.lastMessageAt)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text numberOfLines={1} style={{ flex: 1, color: unread ? c.text : c.muted }}>
            {thread.lastMessage?.direction === 'OUTBOUND' ? 'Você: ' : ''}{preview}
          </Text>
          {unread ? (
            <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: c.onPrimary, fontSize: 12, fontWeight: '700' }}>{thread.unread}</Text>
            </View>
          ) : null}
        </View>
        <Text style={{ color: c.muted, fontSize: 11 }}>{thread.channel === 'WHATSAPP' ? 'WhatsApp' : 'E-mail'}</Text>
      </View>
    </Pressable>
  );
}
