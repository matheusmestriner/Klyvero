import { useQuery } from '@tanstack/react-query';
import { ScrollView, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Card, ErrorNotice, Screen } from '../components/ui';
import { spacing } from '../theme';

type Summary = {
  leads: number; replied: number; qualified: number; meetings: number; deals: number;
  wonDeals: number; wonRevenue: number; threads: number; campaigns: number;
  replyRate: number; qualificationRate: number;
};

function money(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export default function AnalyticsScreen() {
  const { theme } = useAuth();
  const { data, error, isLoading } = useQuery<Summary>({ queryKey: ['analytics-summary'], queryFn: () => api('/analytics/summary') });

  const tiles = data
    ? [
        { label: 'Leads', value: String(data.leads) },
        { label: 'Responderam', value: String(data.replied) },
        { label: 'Qualificados', value: String(data.qualified) },
        { label: 'Reuniões', value: String(data.meetings) },
        { label: 'Negócios', value: String(data.deals) },
        { label: 'Ganhos', value: String(data.wonDeals) },
        { label: 'Receita ganha', value: money(data.wonRevenue) },
        { label: 'Conversas', value: String(data.threads) },
      ]
    : [];

  return (
    <Screen>
      <View style={{ padding: spacing.lg, paddingBottom: 6 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>Analytics</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: 14, paddingBottom: 40 }}>
        {error ? <ErrorNotice message={(error as Error).message} /> : null}
        {isLoading ? <Text style={{ color: theme.muted }}>Carregando…</Text> : null}
        {data ? (
          <>
            <Card style={{ alignItems: 'center', paddingVertical: 16 }}>
              <Text style={{ color: theme.muted, fontSize: 12 }}>Taxa de resposta</Text>
              <Text style={{ color: theme.brand, fontSize: 38, fontWeight: '800', marginTop: 4 }}>{data.replyRate}%</Text>
            </Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {tiles.map((t) => (
                <Card key={t.label} style={{ width: '47%', padding: 14 }}>
                  <Text style={{ color: theme.muted, fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase' }}>{t.label}</Text>
                  <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', marginTop: 6 }}>{t.value}</Text>
                </Card>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
