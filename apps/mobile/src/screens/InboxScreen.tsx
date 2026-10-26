import { useQuery } from '@tanstack/react-query';
import { FlatList, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Avatar, EmptyState, ErrorNotice, Pill, Screen } from '../components/ui';
import { spacing } from '../theme';
import type { InboxStackParamList } from '../navigation/types';

type Message = { id: string; direction: 'INBOUND' | 'OUTBOUND'; text: string; createdAt: string };
type Thread = {
  id: string;
  contact?: { firstName?: string; lastName?: string; phone?: string } | null;
  messages: Message[];
  lastMessageAt: string;
};

type Props = NativeStackScreenProps<InboxStackParamList, 'Inbox'>;

function initials(t: Thread) {
  const name = `${t.contact?.firstName ?? ''} ${t.contact?.lastName ?? ''}`.trim();
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '#';
}

function timeLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function InboxScreen({ navigation }: Props) {
  const { theme } = useAuth();
  const { data, isLoading, error, refetch } = useQuery<Thread[]>({ queryKey: ['inbox'], queryFn: () => api('/inbox') });

  return (
    <Screen>
      <View style={{ padding: spacing.lg, paddingBottom: 6 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>Inbox</Text>
      </View>
      {error ? <View style={{ paddingHorizontal: spacing.lg }}><ErrorNotice message={(error as Error).message} /></View> : null}
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
        refreshing={isLoading}
        onRefresh={refetch}
        ListEmptyComponent={!isLoading ? <EmptyState icon="inbox" title="Nenhuma conversa" hint="Conecte o WhatsApp em Mais → WhatsApp." /> : null}
        renderItem={({ item }) => {
          const last = item.messages[item.messages.length - 1];
          const name = `${item.contact?.firstName ?? ''} ${item.contact?.lastName ?? ''}`.trim() || item.contact?.phone || 'Contato';
          return (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}
              onTouchEnd={() => navigation.navigate('Conversation', { threadId: item.id, label: name, phone: item.contact?.phone })}
            >
              <Avatar label={initials(item)} size={44} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{name}</Text>
                <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 12, marginTop: 1 }}>{last?.text ?? 'Sem mensagens'}</Text>
              </View>
              <Text style={{ color: theme.muted, fontSize: 10.5 }}>{timeLabel(item.lastMessageAt)}</Text>
            </View>
          );
        }}
      />
    </Screen>
  );
}
