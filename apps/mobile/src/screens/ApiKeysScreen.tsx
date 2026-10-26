import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Modal, ScrollView, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Button, Card, EmptyState, ErrorNotice, Fab, ListRow, Screen, TextField } from '../components/ui';
import { spacing } from '../theme';
import { useCreateApiKey, useRevokeApiKey } from '../lib/hooks';

type ApiKey = { id: string; name: string; revokedAt?: string | null; createdAt: string };

export default function ApiKeysScreen() {
  const { theme } = useAuth();
  const { data, isLoading, error } = useQuery<ApiKey[]>({ queryKey: ['apiKeys'], queryFn: () => api('/api-keys') });
  const [showCreate, setShowCreate] = useState(false);
  const revoke = useRevokeApiKey();

  return (
    <Screen>
      <View style={{ padding: spacing.lg, paddingBottom: 6 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>API Keys</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: 10, paddingBottom: 100 }}>
        {error ? <ErrorNotice message={(error as Error).message} /> : null}
        {isLoading ? <Text style={{ color: theme.muted }}>Carregando…</Text> : null}
        {!isLoading && !data?.length ? <EmptyState icon="api" title="Nenhuma chave criada" /> : null}
        <Card style={{ padding: 4 }}>
          {data?.map((k) => (
            <ListRow
              key={k.id}
              icon="api"
              title={k.name}
              subtitle={k.revokedAt ? 'Revogada' : `Criada em ${new Date(k.createdAt).toLocaleDateString('pt-BR')}`}
              onPress={() =>
                !k.revokedAt &&
                Alert.alert('Revogar chave', `Revogar "${k.name}"? Essa ação não pode ser desfeita.`, [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Revogar', style: 'destructive', onPress: () => revoke.mutate(k.id) },
                ])
              }
            />
          ))}
        </Card>
      </ScrollView>
      <Fab onPress={() => setShowCreate(true)} />
      <CreateKeyModal visible={showCreate} onClose={() => setShowCreate(false)} />
    </Screen>
  );
}

function CreateKeyModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useAuth();
  const [name, setName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const create = useCreateApiKey();

  async function submit() {
    const result = await create.mutateAsync({ name, scopes: ['read', 'write'] });
    setCreatedKey(result?.key ?? result?.token ?? null);
  }

  function close() {
    setName('');
    setCreatedKey(null);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: theme.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: 12 }}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }}>Nova API key</Text>
          {createdKey ? (
            <>
              <Text style={{ color: theme.muted, fontSize: 12.5 }}>Copie agora — a chave não será mostrada novamente.</Text>
              <View style={{ backgroundColor: theme.tint(0.08), borderRadius: 11, padding: 12 }}>
                <Text selectable style={{ color: theme.text, fontFamily: 'monospace', fontSize: 12.5 }}>{createdKey}</Text>
              </View>
              <Button label="Concluir" variant="primary" full onPress={close} />
            </>
          ) : (
            <>
              <TextField label="Nome" value={name} onChangeText={setName} placeholder="Integração externa" />
              {create.isError ? <ErrorNotice message={(create.error as Error).message} /> : null}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Button label="Cancelar" variant="ghost" full onPress={close} /></View>
                <View style={{ flex: 1 }}><Button label="Criar" variant="primary" full onPress={submit} loading={create.isPending} disabled={!name} /></View>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
