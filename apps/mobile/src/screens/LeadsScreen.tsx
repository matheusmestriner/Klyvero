import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FlatList, Modal, ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Button, Card, Chip, EmptyState, ErrorNotice, Fab, ListRow, Pill, Screen, SearchBar, TextField } from '../components/ui';
import { spacing } from '../theme';
import type { CrmStackParamList } from '../navigation/types';
import { useCreateLead } from '../lib/hooks';

type Lead = { id: string; firstName?: string; lastName?: string; companyName?: string; status: string; email?: string };

const STATUS_LABEL: Record<string, string> = {
  NEW: 'Novo',
  CONTACTED: 'Contatado',
  REPLIED: 'Respondeu',
  QUALIFIED: 'Qualificado',
  UNQUALIFIED: 'Desqualificado',
  CONVERTED: 'Convertido',
  LOST: 'Perdido',
};
const STATUS_VARIANT: Record<string, 'default' | 'solid' | 'outline' | 'danger'> = {
  NEW: 'default',
  QUALIFIED: 'solid',
  CONTACTED: 'outline',
  REPLIED: 'outline',
  LOST: 'danger',
  UNQUALIFIED: 'danger',
  CONVERTED: 'solid',
};

type Props = NativeStackScreenProps<CrmStackParamList, 'Leads'>;

export default function LeadsScreen({ navigation }: Props) {
  const { theme } = useAuth();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const { data, isLoading, error, refetch } = useQuery<Lead[]>({ queryKey: ['leads'], queryFn: () => api('/leads') });

  const filtered = useMemo(() => {
    let rows = data ?? [];
    if (filter) rows = rows.filter((r) => r.status === filter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      rows = rows.filter((r) => `${r.firstName ?? ''} ${r.lastName ?? ''} ${r.companyName ?? ''}`.toLowerCase().includes(q));
    }
    return rows;
  }, [data, filter, query]);

  return (
    <Screen>
      <View style={{ padding: spacing.lg, gap: 10 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>Leads</Text>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar lead..." />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="Todos" active={!filter} onPress={() => setFilter(null)} />
          {Object.entries(STATUS_LABEL).map(([key, label]) => (
            <Chip key={key} label={label} active={filter === key} onPress={() => setFilter(key)} />
          ))}
        </ScrollView>
      </View>

      {error ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <ErrorNotice message={(error as Error).message} />
        </View>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
        refreshing={isLoading}
        onRefresh={refetch}
        ListEmptyComponent={!isLoading ? <EmptyState icon="leads" title="Nenhum lead" hint="Crie um lead ou traga contatos pela Prospecção." /> : null}
        renderItem={({ item }) => (
          <ListRow
            icon="leads"
            title={[item.firstName, item.lastName].filter(Boolean).join(' ') || 'Sem nome'}
            subtitle={item.companyName || item.email || '—'}
            trailing={<Pill label={STATUS_LABEL[item.status] ?? item.status} variant={STATUS_VARIANT[item.status] ?? 'default'} />}
            onPress={() => navigation.navigate('LeadDetail', { id: item.id })}
          />
        )}
      />

      <Fab onPress={() => setShowCreate(true)} />
      <CreateLeadModal visible={showCreate} onClose={() => setShowCreate(false)} onCreated={refetch} />
    </Screen>
  );
}

function CreateLeadModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: () => void }) {
  const { theme } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const create = useCreateLead();

  async function submit() {
    await create.mutateAsync({ firstName, lastName, companyName, email: email || undefined, phone: phone || undefined });
    setFirstName('');
    setLastName('');
    setCompanyName('');
    setEmail('');
    setPhone('');
    onCreated();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: theme.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: 12, maxHeight: '85%' }}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }}>Novo lead</Text>
          <TextField label="Nome" value={firstName} onChangeText={setFirstName} />
          <TextField label="Sobrenome" value={lastName} onChangeText={setLastName} />
          <TextField label="Empresa" value={companyName} onChangeText={setCompanyName} />
          <TextField label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <TextField label="Telefone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          {create.isError ? <ErrorNotice message={(create.error as Error).message} /> : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <View style={{ flex: 1 }}>
              <Button label="Cancelar" variant="ghost" full onPress={onClose} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Salvar" variant="primary" full onPress={submit} loading={create.isPending} disabled={!firstName && !companyName} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
