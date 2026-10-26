import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, FlatList, Modal, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Button, EmptyState, ErrorNotice, Fab, ListRow, Pill, Screen, SearchBar, TextField } from '../components/ui';
import { spacing } from '../theme';
import { useCreateCompany, useDeleteCompany } from '../lib/hooks';

type Company = { id: string; name: string; city?: string; industry?: string; _count?: { contacts: number } };

export default function CompaniesScreen() {
  const { theme } = useAuth();
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const { data, isLoading, error, refetch } = useQuery<Company[]>({ queryKey: ['companies'], queryFn: () => api('/companies') });
  const deleteCompany = useDeleteCompany();

  const filtered = (data ?? []).filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Screen>
      <View style={{ padding: spacing.lg, gap: 10 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>Empresas</Text>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar empresa..." />
      </View>
      {error ? <View style={{ paddingHorizontal: spacing.lg }}><ErrorNotice message={(error as Error).message} /></View> : null}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
        refreshing={isLoading}
        onRefresh={refetch}
        ListEmptyComponent={!isLoading ? <EmptyState icon="companies" title="Nenhuma empresa" /> : null}
        renderItem={({ item }) => (
          <ListRow
            icon="companies"
            title={item.name}
            subtitle={[item.industry, item.city].filter(Boolean).join(' · ') || '—'}
            trailing={<Pill label={`${item._count?.contacts ?? 0} contato(s)`} variant="outline" />}
            onPress={() =>
              Alert.alert(item.name, 'O que deseja fazer?', [
                { text: 'Excluir', style: 'destructive', onPress: () => deleteCompany.mutate(item.id) },
                { text: 'Fechar', style: 'cancel' },
              ])
            }
          />
        )}
      />
      <Fab onPress={() => setShowCreate(true)} />
      <CreateCompanyModal visible={showCreate} onClose={() => setShowCreate(false)} />
    </Screen>
  );
}

function CreateCompanyModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useAuth();
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [industry, setIndustry] = useState('');
  const create = useCreateCompany();

  async function submit() {
    await create.mutateAsync({ name, city: city || undefined, industry: industry || undefined });
    setName('');
    setCity('');
    setIndustry('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: theme.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: 12 }}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }}>Nova empresa</Text>
          <TextField label="Nome" value={name} onChangeText={setName} />
          <TextField label="Cidade" value={city} onChangeText={setCity} />
          <TextField label="Segmento" value={industry} onChangeText={setIndustry} />
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
