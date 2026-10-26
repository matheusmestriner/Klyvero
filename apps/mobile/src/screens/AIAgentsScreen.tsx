import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal, ScrollView, Switch, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Button, Card, EmptyState, ErrorNotice, Fab, Screen, TextField } from '../components/ui';
import { Icon } from '../components/icons';
import { spacing } from '../theme';
import { useCreateAgent, useToggleAgent } from '../lib/hooks';

type Agent = { id: string; name: string; description?: string; active: boolean; model?: string };

export default function AIAgentsScreen() {
  const { theme } = useAuth();
  const { data, isLoading, error } = useQuery<Agent[]>({ queryKey: ['agents'], queryFn: () => api('/ai-agents') });
  const [showCreate, setShowCreate] = useState(false);
  const toggle = useToggleAgent();

  return (
    <Screen>
      <View style={{ padding: spacing.lg, paddingBottom: 6 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>Agentes IA</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: 10, paddingBottom: 100 }}>
        {error ? <ErrorNotice message={(error as Error).message} /> : null}
        {isLoading ? <Text style={{ color: theme.muted }}>Carregando…</Text> : null}
        {!isLoading && !data?.length ? <EmptyState icon="ai" title="Nenhum agente configurado" /> : null}
        {data?.map((agent) => (
          <Card key={agent.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: theme.tint(0.08), alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="ai" size={19} color={theme.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{agent.name}</Text>
                <Text style={{ color: theme.muted, fontSize: 12 }}>{agent.model || 'Modelo padrão'}</Text>
              </View>
              <Switch
                value={agent.active}
                onValueChange={(value) => toggle.mutate({ id: agent.id, value })}
                trackColor={{ true: theme.brand, false: theme.border }}
              />
            </View>
            {agent.description ? <Text style={{ color: theme.muted, fontSize: 12.5, marginTop: 10 }}>{agent.description}</Text> : null}
          </Card>
        ))}
      </ScrollView>
      <Fab onPress={() => setShowCreate(true)} />
      <CreateAgentModal visible={showCreate} onClose={() => setShowCreate(false)} />
    </Screen>
  );
}

function CreateAgentModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useAuth();
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const create = useCreateAgent();

  async function submit() {
    await create.mutateAsync({ name, systemPrompt });
    setName('');
    setSystemPrompt('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: theme.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: 12 }}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }}>Novo agente</Text>
          <TextField label="Nome" value={name} onChangeText={setName} placeholder="Assistente de Vendas" />
          <TextField label="Instrução (prompt)" value={systemPrompt} onChangeText={setSystemPrompt} multiline placeholder="Responda dúvidas sobre..." />
          {create.isError ? <ErrorNotice message={(create.error as Error).message} /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button label="Cancelar" variant="ghost" full onPress={onClose} /></View>
            <View style={{ flex: 1 }}><Button label="Salvar" variant="primary" full onPress={submit} loading={create.isPending} disabled={!name || !systemPrompt} /></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
