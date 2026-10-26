import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, ScrollView, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Avatar, Button, Card, EmptyState, ErrorNotice, Fab, Pill, Screen, TextField } from '../components/ui';
import { spacing } from '../theme';

type Member = { id: string; name: string; email: string; role: string; active: boolean };
const ROLES = ['ADMIN', 'MANAGER', 'SDR', 'MEMBER', 'VIEWER'] as const;

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'U';
}

export default function TeamScreen() {
  const { theme, user } = useAuth();
  const tenantId = user!.tenantId;
  const { data, isLoading, error } = useQuery<Member[]>({ queryKey: ['team', tenantId], queryFn: () => api(`/tenants/${tenantId}/users`) });
  const [showCreate, setShowCreate] = useState(false);

  return (
    <Screen>
      <View style={{ padding: spacing.lg, paddingBottom: 6 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>Equipe</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: 10, paddingBottom: 100 }}>
        {error ? <ErrorNotice message={(error as Error).message} /> : null}
        {isLoading ? <Text style={{ color: theme.muted }}>Carregando…</Text> : null}
        {!isLoading && !data?.length ? <EmptyState icon="team" title="Nenhum membro" /> : null}
        {data?.map((m) => (
          <Card key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar label={initials(m.name)} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{m.name}</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>{m.email}</Text>
            </View>
            <Pill label={m.role} variant="outline" />
          </Card>
        ))}
      </ScrollView>
      <Fab onPress={() => setShowCreate(true)} />
      <CreateMemberModal visible={showCreate} onClose={() => setShowCreate(false)} tenantId={tenantId} />
    </Screen>
  );
}

function CreateMemberModal({ visible, onClose, tenantId }: { visible: boolean; onClose: () => void; tenantId: string }) {
  const { theme } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>('MEMBER');
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/tenants/${tenantId}/users`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team', tenantId] }),
  });

  async function submit() {
    await create.mutateAsync({ name, email, password, role });
    setName('');
    setEmail('');
    setPassword('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: theme.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: 12 }}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }}>Novo membro</Text>
          <TextField label="Nome" value={name} onChangeText={setName} />
          <TextField label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <TextField label="Senha provisória (mín. 12 caracteres)" value={password} onChangeText={setPassword} secureTextEntry />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {ROLES.map((r) => (
              <View
                key={r}
                onTouchEnd={() => setRole(r)}
                style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 99, backgroundColor: role === r ? theme.brand : theme.card, borderWidth: 1, borderColor: role === r ? theme.brand : theme.border }}
              >
                <Text style={{ color: role === r ? (theme.mode === 'dark' ? '#101114' : '#fff') : theme.muted, fontSize: 12, fontWeight: '700' }}>{r}</Text>
              </View>
            ))}
          </ScrollView>
          {create.isError ? <ErrorNotice message={(create.error as Error).message} /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button label="Cancelar" variant="ghost" full onPress={onClose} /></View>
            <View style={{ flex: 1 }}><Button label="Convidar" variant="primary" full onPress={submit} loading={create.isPending} disabled={!name || !email || password.length < 12} /></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
