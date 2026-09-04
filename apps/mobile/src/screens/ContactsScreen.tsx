import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, FlatList, Linking, Modal, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Avatar, Button, EmptyState, ErrorNotice, Fab, ListRow, Screen, SearchBar, TextField } from '../components/ui';
import { Icon } from '../components/icons';
import { spacing } from '../theme';
import { useCreateContact, useDeleteContact } from '../lib/hooks';

type Contact = { id: string; firstName?: string; lastName?: string; phone?: string; jobTitle?: string; company?: { name: string } | null };

function initials(c: Contact) {
  const label = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
  return label.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
}

export default function ContactsScreen() {
  const { theme } = useAuth();
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const { data, isLoading, error, refetch } = useQuery<Contact[]>({ queryKey: ['contacts'], queryFn: () => api('/contacts') });
  const deleteContact = useDeleteContact();

  const filtered = (data ?? []).filter((c) => `${c.firstName ?? ''} ${c.lastName ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Screen>
      <View style={{ padding: spacing.lg, gap: 10 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>Contatos</Text>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar contato..." />
      </View>
      {error ? <View style={{ paddingHorizontal: spacing.lg }}><ErrorNotice message={(error as Error).message} /></View> : null}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
        refreshing={isLoading}
        onRefresh={refetch}
        ListEmptyComponent={!isLoading ? <EmptyState icon="contacts" title="Nenhum contato" /> : null}
        renderItem={({ item }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}>
            <Avatar label={initials(item)} size={42} />
            <View
              style={{ flex: 1 }}
              onTouchEnd={() =>
                Alert.alert(`${item.firstName ?? ''} ${item.lastName ?? ''}`.trim(), 'O que deseja fazer?', [
                  { text: 'Excluir', style: 'destructive', onPress: () => deleteContact.mutate(item.id) },
                  { text: 'Fechar', style: 'cancel' },
                ])
              }
            >
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{`${item.firstName ?? ''} ${item.lastName ?? ''}`.trim() || 'Sem nome'}</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>{[item.company?.name, item.jobTitle].filter(Boolean).join(' · ') || '—'}</Text>
            </View>
            {item.phone ? (
              <View
                onTouchEnd={() => Linking.openURL(`https://wa.me/${item.phone!.replace(/\D/g, '')}`)}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.brand, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="whatsapp" size={14} color={theme.mode === 'dark' ? '#101114' : '#fff'} />
              </View>
            ) : null}
          </View>
        )}
      />
      <Fab onPress={() => setShowCreate(true)} />
      <CreateContactModal visible={showCreate} onClose={() => setShowCreate(false)} />
    </Screen>
  );
}

function CreateContactModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const create = useCreateContact();

  async function submit() {
    await create.mutateAsync({ firstName, lastName, phone: phone || undefined, jobTitle: jobTitle || undefined });
    setFirstName('');
    setLastName('');
    setPhone('');
    setJobTitle('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: theme.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: 12 }}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }}>Novo contato</Text>
          <TextField label="Nome" value={firstName} onChangeText={setFirstName} />
          <TextField label="Sobrenome" value={lastName} onChangeText={setLastName} />
          <TextField label="Telefone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <TextField label="Cargo" value={jobTitle} onChangeText={setJobTitle} />
          {create.isError ? <ErrorNotice message={(create.error as Error).message} /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button label="Cancelar" variant="ghost" full onPress={onClose} /></View>
            <View style={{ flex: 1 }}><Button label="Salvar" variant="primary" full onPress={submit} loading={create.isPending} disabled={!firstName} /></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
