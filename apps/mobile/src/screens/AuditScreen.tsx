import { useQuery } from '@tanstack/react-query';
import { FlatList, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { EmptyState, ErrorNotice, ListRow, Screen } from '../components/ui';
import { spacing } from '../theme';

type AuditRow = { id: string; action: string; actorEmail?: string; createdAt: string };

export default function AuditScreen() {
  const { theme } = useAuth();
  const { data, isLoading, error, refetch } = useQuery<AuditRow[]>({ queryKey: ['audit'], queryFn: () => api('/audit') });

  return (
    <Screen>
      <View style={{ padding: spacing.lg, paddingBottom: 6 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>Auditoria</Text>
      </View>
      {error ? <View style={{ paddingHorizontal: spacing.lg }}><ErrorNotice message={(error as Error).message} /></View> : null}
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
        refreshing={isLoading}
        onRefresh={refetch}
        ListEmptyComponent={!isLoading ? <EmptyState icon="audit" title="Nenhum evento registrado" /> : null}
        renderItem={({ item }) => (
          <ListRow
            icon="audit"
            title={item.action}
            subtitle={`${item.actorEmail ?? 'Sistema'} · ${new Date(item.createdAt).toLocaleString('pt-BR')}`}
          />
        )}
      />
    </Screen>
  );
}
