import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Avatar, Chip, Empty, ErrorNote } from '@/components/ui';
import { LEAD_STATUSES, LEAD_STATUS_LABEL, personName } from '@/lib/format';
import { usePalette } from '@/lib/theme';
import type { Lead } from '@/lib/types';
import { useResource } from '@/lib/use-resource';

export default function Leads() {
  const c = usePalette();
  const router = useRouter();
  const { data, error, loading, refetch } = useResource<Lead[]>('/leads');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data ?? []).filter((lead) => {
      if (status && lead.status !== status) return false;
      if (!needle) return true;
      return [personName(lead, ''), lead.companyName, lead.email, lead.phone].some((value) => value?.toLowerCase().includes(needle));
    });
  }, [data, query, status]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ padding: 12, gap: 10 }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por nome, empresa, e-mail ou telefone"
          placeholderTextColor={c.muted}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, paddingHorizontal: 14, color: c.text, fontSize: 16 }}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="Todos" active={status === null} onPress={() => setStatus(null)} />
          {LEAD_STATUSES.map((value) => <Chip key={value} label={LEAD_STATUS_LABEL[value]} active={status === value} onPress={() => setStatus(status === value ? null : value)} />)}
        </ScrollView>
      </View>
      {loading && !data ? <ActivityIndicator style={{ marginTop: 32 }} color={c.primary} /> : null}
      {error && !data ? <ErrorNote message={error} onRetry={refetch} /> : null}
      {data ? (
        <FlatList
          data={visible}
          keyExtractor={(lead) => lead.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} />}
          ListEmptyComponent={<Empty title={data.length ? 'Nenhum lead com esse filtro' : 'Nenhum lead ainda'} hint={data.length ? undefined : 'Importe ou cadastre leads na versão web.'} />}
          renderItem={({ item }) => {
            const name = personName(item);
            return (
              <Pressable accessibilityRole="button" onPress={() => router.push(`/lead/${item.id}`)} style={({ pressed }) => ({ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? c.chip : 'transparent', borderBottomWidth: 1, borderBottomColor: c.border })}>
                <Avatar name={name} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text numberOfLines={1} style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{name}</Text>
                  <Text numberOfLines={1} style={{ color: c.muted }}>{[item.jobTitle, item.companyName].filter(Boolean).join(' · ') || item.email || item.phone || ''}</Text>
                </View>
                <Text style={{ color: c.primary, fontSize: 12, fontWeight: '600' }}>{LEAD_STATUS_LABEL[item.status] ?? item.status}</Text>
              </Pressable>
            );
          }}
        />
      ) : null}
    </View>
  );
}
