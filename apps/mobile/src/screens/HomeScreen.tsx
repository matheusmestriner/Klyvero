import { useQuery } from '@tanstack/react-query';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Avatar, Card, CardTitle, Chip, ErrorNotice, Screen } from '../components/ui';
import { Icon } from '../components/icons';
import { spacing } from '../theme';

type DashboardStage = { id: string; name: string; deals: number; value: number };
type Dashboard = {
  summary: { leads: number; deals: number; wonRevenue: number; replyRate: number; qualificationRate: number };
  recentLeads: { id: string; firstName?: string; lastName?: string; companyName?: string; status: string; createdAt: string }[];
  pipeline: { name: string; stages: DashboardStage[] } | null;
  upcomingEvents: { id: string; title: string; startsAt: string }[];
};

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'U';
}

export default function HomeScreen() {
  const { theme, user, branding } = useAuth();
  const { data, isLoading, error, refetch, isRefetching } = useQuery<Dashboard>({
    queryKey: ['dashboard'],
    queryFn: () => api('/analytics/dashboard'),
  });

  const productName = branding?.branding?.productName || 'Klyvero';
  const maxStageDeals = Math.max(1, ...(data?.pipeline?.stages.map((s) => s.deals) ?? [1]));

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 22, gap: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.brand} />}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 20 }}>Olá, {user?.name?.split(' ')[0] ?? ''}</Text>
            <Text style={{ color: theme.muted, fontSize: 12.5 }}>{productName}</Text>
          </View>
          <Avatar label={initials(user?.name ?? 'U')} />
        </View>

        {error ? <ErrorNotice message={(error as Error).message} /> : null}

        {data ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {[
                { label: 'Leads', value: String(data.summary.leads) },
                { label: 'Negócios', value: String(data.summary.deals) },
                { label: 'Receita ganha', value: money(data.summary.wonRevenue) },
                { label: 'Taxa de resposta', value: `${data.summary.replyRate}%` },
              ].map((m) => (
                <Card key={m.label} style={{ width: '47%', padding: 14 }}>
                  <Text style={{ color: theme.muted, fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase' }}>{m.label}</Text>
                  <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800', marginTop: 6 }}>{m.value}</Text>
                </Card>
              ))}
            </View>

            <Card>
              <CardTitle title="Taxa de qualificação" hint="Leads qualificados sobre o total" />
              <Text style={{ color: theme.brand, fontSize: 38, fontWeight: '800' }}>{data.summary.qualificationRate}%</Text>
            </Card>

            {data.pipeline ? (
              <Card>
                <CardTitle title={data.pipeline.name} />
                {data.pipeline.stages.map((stage) => (
                  <View key={stage.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                    <Text style={{ width: 90, fontSize: 12, fontWeight: '700', color: theme.text }} numberOfLines={1}>{stage.name}</Text>
                    <View style={{ flex: 1, height: 7, borderRadius: 99, backgroundColor: theme.tint(0.08), overflow: 'hidden' }}>
                      <View style={{ width: `${Math.max(6, (stage.deals / maxStageDeals) * 100)}%`, height: '100%', backgroundColor: theme.brand, borderRadius: 99 }} />
                    </View>
                    <Text style={{ width: 22, textAlign: 'right', fontSize: 12, color: theme.muted }}>{stage.deals}</Text>
                  </View>
                ))}
              </Card>
            ) : null}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip label="+ Novo lead" active />
              <Chip label="Nova prospecção" />
              <Chip label="Disparar campanha" />
            </ScrollView>

            <Text style={{ color: theme.muted, fontSize: 11.5, fontWeight: '800', textTransform: 'uppercase', marginTop: 4 }}>Leads recentes</Text>
            <Card style={{ paddingVertical: 4 }}>
              {data.recentLeads.length ? (
                data.recentLeads.map((lead, idx) => (
                  <View
                    key={lead.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingVertical: 12,
                      borderBottomWidth: idx === data.recentLeads.length - 1 ? 0 : 1,
                      borderBottomColor: theme.border,
                    }}
                  >
                    <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: theme.tint(0.08), alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="leads" size={18} color={theme.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{[lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Sem nome'}</Text>
                      <Text style={{ color: theme.muted, fontSize: 12 }}>{lead.companyName || 'Sem empresa'}</Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={{ color: theme.muted, padding: 12 }}>Nenhum lead ainda.</Text>
              )}
            </Card>
          </>
        ) : isLoading ? (
          <Text style={{ color: theme.muted }}>Carregando…</Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
