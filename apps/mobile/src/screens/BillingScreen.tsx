import { useQuery, useMutation } from '@tanstack/react-query';
import { Linking, ScrollView, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Button, Card, ErrorNotice, Pill, Screen } from '../components/ui';
import { spacing } from '../theme';

type Plan = { id: string; code: string; name: string; monthlyPrice: number };
type Me = { plan?: Plan | null; status?: string };

function money(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function BillingScreen() {
  const { theme } = useAuth();
  const { data: plans } = useQuery<Plan[]>({ queryKey: ['plans'], queryFn: () => api('/billing/plans') });
  const { data: me, error } = useQuery<Me>({ queryKey: ['billing-me'], queryFn: () => api('/billing/me') });
  const checkout = useMutation({ mutationFn: (planId: string) => api('/billing/checkout', { method: 'POST', body: JSON.stringify({ planId }) }) });
  const portal = useMutation({ mutationFn: () => api('/billing/portal', { method: 'POST' }) });

  async function openCheckout(planId: string) {
    const out = await checkout.mutateAsync(planId);
    if (out?.url) Linking.openURL(out.url);
  }

  async function openPortal() {
    const out = await portal.mutateAsync();
    if (out?.url) Linking.openURL(out.url);
  }

  return (
    <Screen>
      <View style={{ padding: spacing.lg, paddingBottom: 6 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>Plano e cobrança</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: 12, paddingBottom: 40 }}>
        {error ? <ErrorNotice message={(error as Error).message} /> : null}

        {me?.plan ? (
          <Card>
            <Text style={{ color: theme.muted, fontSize: 12 }}>Plano atual</Text>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800', marginTop: 4 }}>{me.plan.name}</Text>
            <View style={{ marginTop: 8 }}>
              <Pill label={me.status ?? 'Ativo'} variant="solid" />
            </View>
            <View style={{ marginTop: 14 }}>
              <Button label="Gerenciar assinatura" variant="ghost" full onPress={openPortal} loading={portal.isPending} />
            </View>
          </Card>
        ) : null}

        <Text style={{ color: theme.muted, fontSize: 11.5, fontWeight: '800', textTransform: 'uppercase' }}>Planos disponíveis</Text>
        {plans?.map((plan) => (
          <Card key={plan.id}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>{plan.name}</Text>
            <Text style={{ color: theme.brand, fontSize: 26, fontWeight: '800', marginTop: 6 }}>
              {money(plan.monthlyPrice)}<Text style={{ fontSize: 12, color: theme.muted, fontWeight: '500' }}>/mês</Text>
            </Text>
            <View style={{ marginTop: 12 }}>
              <Button label="Assinar" variant="primary" full onPress={() => openCheckout(plan.id)} loading={checkout.isPending} />
            </View>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
