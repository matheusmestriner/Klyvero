import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal, ScrollView, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Button, Card, EmptyState, ErrorNotice, Fab, Pill, Screen, TextField } from '../components/ui';
import { Icon } from '../components/icons';
import { spacing } from '../theme';
import { useCampaignAction, useCreateCampaign } from '../lib/hooks';

type Campaign = { id: string; name: string; status: string; channel: 'EMAIL' | 'WHATSAPP' | 'MULTICHANNEL'; _count?: { enrollments: number } };

const STATUS_VARIANT: Record<string, 'default' | 'solid' | 'outline' | 'danger'> = {
  ACTIVE: 'solid',
  DRAFT: 'outline',
  PAUSED: 'default',
  COMPLETED: 'outline',
  ARCHIVED: 'outline',
};
const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Ativa', DRAFT: 'Rascunho', PAUSED: 'Pausada', COMPLETED: 'Concluída', ARCHIVED: 'Arquivada' };

export default function CampaignsScreen() {
  const { theme } = useAuth();
  const { data, isLoading, error } = useQuery<Campaign[]>({ queryKey: ['campaigns'], queryFn: () => api('/campaigns') });
  const [showCreate, setShowCreate] = useState(false);
  const action = useCampaignAction();

  return (
    <Screen>
      <View style={{ padding: spacing.lg, paddingBottom: 6 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>Campanhas</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: 10, paddingBottom: 100 }}>
        {error ? <ErrorNotice message={(error as Error).message} /> : null}
        {isLoading ? <Text style={{ color: theme.muted }}>Carregando…</Text> : null}
        {!isLoading && !data?.length ? <EmptyState icon="campaigns" title="Nenhuma campanha" /> : null}
        {data?.map((c) => (
          <Card key={c.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: theme.tint(0.08), alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={c.channel === 'WHATSAPP' ? 'whatsapp' : 'email'} size={17} color={theme.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{c.name}</Text>
                <Text style={{ color: theme.muted, fontSize: 12 }}>{c._count?.enrollments ?? 0} inscrito(s)</Text>
              </View>
              <Pill label={STATUS_LABEL[c.status] ?? c.status} variant={STATUS_VARIANT[c.status] ?? 'default'} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Button label="Ativar" variant="ghost" full onPress={() => action.mutate({ id: c.id, action: 'start' })} disabled={c.status === 'ACTIVE'} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Pausar" variant="ghost" full onPress={() => action.mutate({ id: c.id, action: 'pause' })} disabled={c.status !== 'ACTIVE'} />
              </View>
            </View>
          </Card>
        ))}
      </ScrollView>
      <Fab onPress={() => setShowCreate(true)} />
      <CreateCampaignModal visible={showCreate} onClose={() => setShowCreate(false)} />
    </Screen>
  );
}

function CreateCampaignModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useAuth();
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<'EMAIL' | 'WHATSAPP'>('WHATSAPP');
  const create = useCreateCampaign();

  async function submit() {
    await create.mutateAsync({ name, channel });
    setName('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: theme.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: 12 }}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }}>Nova campanha</Text>
          <TextField label="Nome" value={name} onChangeText={setName} placeholder="Reativação clientes frios" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['WHATSAPP', 'EMAIL'] as const).map((ch) => (
              <View
                key={ch}
                onTouchEnd={() => setChannel(ch)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center', backgroundColor: channel === ch ? theme.brand : theme.card, borderWidth: 1, borderColor: channel === ch ? theme.brand : theme.border }}
              >
                <Text style={{ color: channel === ch ? (theme.mode === 'dark' ? '#101114' : '#fff') : theme.text, fontWeight: '700', fontSize: 13 }}>{ch === 'WHATSAPP' ? 'WhatsApp' : 'E-mail'}</Text>
              </View>
            ))}
          </View>
          {create.isError ? <ErrorNotice message={(create.error as Error).message} /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button label="Cancelar" variant="ghost" full onPress={onClose} /></View>
            <View style={{ flex: 1 }}><Button label="Salvar" variant="primary" full onPress={submit} loading={create.isPending} disabled={!name} /></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
