import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, Text, View } from 'react-native';
import { Empty, ErrorNote } from '@/components/ui';
import { dayHeading, groupByDay, timeLabel } from '@/lib/format';
import { usePalette } from '@/lib/theme';
import type { CalendarEvent } from '@/lib/types';
import { useResource } from '@/lib/use-resource';

const DAYS_AHEAD = 45;

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export default function Agenda() {
  const c = usePalette();
  const router = useRouter();
  const range = useMemo(() => {
    const from = startOfToday();
    const to = new Date(from);
    to.setDate(to.getDate() + DAYS_AHEAD);
    return `?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
  }, []);
  const { data, error, loading, refetch } = useResource<CalendarEvent[]>(`/calendar${range}`);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));

  const sections = useMemo(
    () => groupByDay((data ?? []).filter((event) => event.status !== 'CANCELLED')).map((group) => ({ title: dayHeading(group.key), data: group.items })),
    [data],
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {loading && !data ? <ActivityIndicator style={{ marginTop: 32 }} color={c.primary} /> : null}
      {error && !data ? <ErrorNote message={error} onRetry={refetch} /> : null}
      {data ? (
        <SectionList
          sections={sections}
          keyExtractor={(event) => event.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: 96 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} />}
          ListEmptyComponent={<Empty title="Nada agendado" hint={`Nos próximos ${DAYS_AHEAD} dias.`} />}
          renderSectionHeader={({ section }) => <Text style={{ color: c.muted, fontSize: 13, fontWeight: '700', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 }}>{section.title}</Text>}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/event/[id]', params: { id: item.id, event: JSON.stringify(item) } })}
              style={({ pressed }) => ({ marginHorizontal: 12, marginBottom: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: pressed ? c.chip : c.card, flexDirection: 'row', gap: 12 })}
            >
              <View style={{ width: 52 }}>
                <Text style={{ color: c.primary, fontWeight: '700' }}>{item.allDay ? 'Dia todo' : timeLabel(item.startsAt)}</Text>
                {!item.allDay ? <Text style={{ color: c.muted, fontSize: 12 }}>{timeLabel(item.endsAt)}</Text> : null}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>{item.title}</Text>
                {item.attendeeName ? <Text style={{ color: c.muted }}>{item.attendeeName}</Text> : null}
                {item.location ? <Text numberOfLines={1} style={{ color: c.muted }}>{item.location}</Text> : null}
              </View>
            </Pressable>
          )}
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Novo compromisso"
        onPress={() => router.push({ pathname: '/event/[id]', params: { id: 'new' } })}
        style={{ position: 'absolute', right: 20, bottom: 24, height: 56, paddingHorizontal: 22, borderRadius: 28, backgroundColor: c.primary, justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5 }}
      >
        <Text style={{ color: c.onPrimary, fontWeight: '700', fontSize: 16 }}>+ Novo</Text>
      </Pressable>
    </View>
  );
}
