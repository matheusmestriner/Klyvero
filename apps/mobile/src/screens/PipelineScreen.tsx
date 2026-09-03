import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Modal, ScrollView, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Button, Card, Chip, ErrorNotice, Fab, Pill, Screen, TextField } from '../components/ui';
import { spacing } from '../theme';
import { useCloseDeal, useCreateDeal, useMoveDeal } from '../lib/hooks';

type Deal = { id: string; title: string; value: number; company?: { name: string } | null; updatedAt: string };
type Stage = { id: string; name: string; probability: number; deals: Deal[] };
type Pipeline = { id: string; name: string; stages: Stage[] };

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export default function PipelineScreen() {
  const { theme } = useAuth();
  const { data, isLoading, error, refetch } = useQuery<Pipeline[]>({ queryKey: ['pipelines'], queryFn: () => api('/crm/pipelines') });
  const pipeline = data?.[0];
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const moveDeal = useMoveDeal();
  const closeDeal = useCloseDeal();

  const stages = pipeline?.stages ?? [];
  const stage = stages.find((s) => s.id === activeStage) ?? stages[0];
  const weighted = stages.reduce((sum, s) => sum + s.deals.reduce((inner, d) => inner + Number(d.value) * (s.probability / 100), 0), 0);

  function dealActions(deal: Deal) {
    const options = stages.filter((s) => s.id !== stage?.id).map((s) => ({ text: `Mover para ${s.name}`, onPress: () => moveDeal.mutate({ id: deal.id, stageId: s.id }) }));
    Alert.alert(
      deal.title,
      undefined,
      [
        ...options,
        { text: 'Marcar como ganho', onPress: () => closeDeal.mutate({ id: deal.id, status: 'WON' }) },
        { text: 'Marcar como perdido', style: 'destructive', onPress: () => closeDeal.mutate({ id: deal.id, status: 'LOST' }) },
        { text: 'Cancelar', style: 'cancel' },
      ],
    );
  }

  return (
    <Screen>
      <View style={{ padding: spacing.lg, gap: 10 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>CRM</Text>
        {error ? <ErrorNotice message={(error as Error).message} /> : null}
        <Card style={{ alignItems: 'center', paddingVertical: 14 }}>
          <Text style={{ color: theme.muted, fontSize: 12 }}>Valor ponderado do pipeline</Text>
          <Text style={{ color: theme.brand, fontSize: 28, fontWeight: '800', marginTop: 4 }}>{money(weighted)}</Text>
        </Card>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {stages.map((s) => (
            <Chip key={s.id} label={`${s.name} · ${s.deals.length}`} active={stage?.id === s.id} onPress={() => setActiveStage(s.id)} />
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 10, paddingBottom: 100 }}>
        {isLoading ? <Text style={{ color: theme.muted }}>Carregando…</Text> : null}
        {stage?.deals.length === 0 ? <Text style={{ color: theme.muted, padding: 12 }}>Nenhum negócio nesta etapa.</Text> : null}
        {stage?.deals.map((deal) => (
          <Card key={deal.id} style={{ padding: 13 }} >
            <View onTouchEnd={() => dealActions(deal)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13.5 }}>{deal.title}</Text>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>{money(Number(deal.value))} · {deal.company?.name ?? 'Sem empresa'}</Text>
                </View>
              </View>
              <View style={{ marginTop: 9 }}>
                <Pill label={`${stage?.probability ?? 0}% prob.`} variant="outline" />
              </View>
            </View>
          </Card>
        ))}
      </ScrollView>

      <Fab onPress={() => setShowCreate(true)} />
      {pipeline ? (
        <CreateDealModal
          visible={showCreate}
          onClose={() => setShowCreate(false)}
          pipelineId={pipeline.id}
          stageId={stage?.id ?? stages[0]?.id ?? ''}
        />
      ) : null}
    </Screen>
  );
}

function CreateDealModal({ visible, onClose, pipelineId, stageId }: { visible: boolean; onClose: () => void; pipelineId: string; stageId: string }) {
  const { theme } = useAuth();
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const createDeal = useCreateDeal();

  async function submit() {
    await createDeal.mutateAsync({ pipelineId, stageId, title, value: value ? Number(value.replace(',', '.')) : undefined });
    setTitle('');
    setValue('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: theme.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: 12 }}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }}>Novo negócio</Text>
          <TextField label="Título" value={title} onChangeText={setTitle} placeholder="Ex: Contrato anual" />
          <TextField label="Valor (R$)" value={value} onChangeText={setValue} keyboardType="numeric" placeholder="0" />
          {createDeal.isError ? <ErrorNotice message={(createDeal.error as Error).message} /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button label="Cancelar" variant="ghost" full onPress={onClose} /></View>
            <View style={{ flex: 1 }}><Button label="Salvar" variant="primary" full onPress={submit} loading={createDeal.isPending} disabled={!title} /></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
