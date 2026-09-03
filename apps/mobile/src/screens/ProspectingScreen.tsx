import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollView, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Button, Card, EmptyState, ErrorNotice, ListRow, Screen, TextField } from '../components/ui';
import { spacing } from '../theme';
import { useConvertProspect, useProspectingSearch } from '../lib/hooks';

type Prospect = { id: string; firstName?: string; lastName?: string; companyName?: string; city?: string; status: string };

export default function ProspectingScreen() {
  const { theme } = useAuth();
  const [keyword, setKeyword] = useState('');
  const [city, setCity] = useState('');
  const search = useProspectingSearch();
  const { data: prospects, refetch } = useQuery<Prospect[]>({
    queryKey: ['prospects'],
    queryFn: () => api('/prospecting/prospects'),
  });
  const convert = useConvertProspect();

  async function runSearch() {
    await search.mutateAsync({ query: { keyword, city } });
    refetch();
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 14, paddingBottom: 60 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>Prospecção</Text>

        <Card>
          <TextField label="Palavra-chave / nicho" value={keyword} onChangeText={setKeyword} placeholder="salão de beleza" />
          <View style={{ height: 10 }} />
          <TextField label="Cidade, UF" value={city} onChangeText={setCity} placeholder="Curitiba, PR" />
          {search.isError ? (
            <View style={{ marginTop: 10 }}>
              <ErrorNotice message={(search.error as Error).message} />
            </View>
          ) : null}
          <View style={{ marginTop: 14 }}>
            <Button label="Buscar" variant="primary" full icon="search" onPress={runSearch} loading={search.isPending} disabled={!keyword} />
          </View>
        </Card>

        <Text style={{ color: theme.muted, fontSize: 11.5, fontWeight: '800', textTransform: 'uppercase' }}>
          {prospects?.length ?? 0} resultado(s)
        </Text>

        <Card style={{ padding: prospects?.length ? 4 : spacing.lg }}>
          {!prospects?.length ? (
            <EmptyState icon="prospecting" title="Nenhum resultado ainda" hint="Faça uma busca acima para encontrar prospects." />
          ) : (
            prospects.map((p) => (
              <ListRow
                key={p.id}
                icon="companies"
                title={p.companyName || [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Sem nome'}
                subtitle={p.city || '—'}
                trailing={
                  <Button
                    label={p.status === 'CONVERTED' ? 'Convertido' : 'Adicionar'}
                    variant="ghost"
                    onPress={() => convert.mutate(p.id)}
                    disabled={p.status === 'CONVERTED'}
                  />
                }
              />
            ))
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}
