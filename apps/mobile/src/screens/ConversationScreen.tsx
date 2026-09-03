import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { ErrorNotice, Screen } from '../components/ui';
import { Icon } from '../components/icons';
import { spacing } from '../theme';
import type { InboxStackParamList } from '../navigation/types';
import { useSendWhatsapp } from '../lib/hooks';
import { WHATSAPP_SESSION_ID } from '../lib/constants';

type Message = { id: string; direction: 'INBOUND' | 'OUTBOUND'; text: string; createdAt: string };
type Thread = { id: string; messages: Message[] };

type Props = NativeStackScreenProps<InboxStackParamList, 'Conversation'>;

export default function ConversationScreen({ route, navigation }: Props) {
  const { theme } = useAuth();
  const { threadId, label, phone } = route.params;
  const { data: threads, refetch } = useQuery<Thread[]>({ queryKey: ['inbox'], queryFn: () => api('/inbox') });
  const thread = threads?.find((t) => t.id === threadId);
  const [text, setText] = useState('');
  const send = useSendWhatsapp();

  async function submit() {
    if (!text.trim() || !phone) return;
    const body = text;
    setText('');
    await send.mutateAsync({ sessionId: WHATSAPP_SESSION_ID, to: phone, text: body });
    refetch();
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.lg, paddingBottom: 6 }}>
        <Pressable onPress={() => navigation.goBack()}>
          <Icon name="chevronLeft" size={20} color={theme.text} />
        </Pressable>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 17, flex: 1 }} numberOfLines={1}>{label}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 8 }}>
          {thread?.messages.length ? (
            thread.messages.map((m) => (
              <View
                key={m.id}
                style={{
                  maxWidth: '75%',
                  alignSelf: m.direction === 'OUTBOUND' ? 'flex-end' : 'flex-start',
                  backgroundColor: m.direction === 'OUTBOUND' ? theme.tint(0.14) : theme.tint(0.06),
                  borderRadius: 14,
                  padding: 11,
                }}
              >
                <Text style={{ color: theme.text, fontSize: 13.5 }}>{m.text}</Text>
                <Text style={{ color: theme.muted, fontSize: 10, marginTop: 5 }}>
                  {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            ))
          ) : (
            <Text style={{ color: theme.muted, textAlign: 'center', marginTop: 30 }}>Sem mensagens ainda.</Text>
          )}
        </ScrollView>

        {send.isError ? (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <ErrorNotice message={(send.error as Error).message} />
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, padding: spacing.md, borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.card }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={phone ? 'Escreva uma mensagem...' : 'Sem telefone cadastrado'}
            placeholderTextColor={theme.muted}
            editable={!!phone}
            style={{ flex: 1, color: theme.text, fontSize: 13.5, backgroundColor: theme.bg, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 11, borderWidth: 1, borderColor: theme.border }}
          />
          <Pressable
            onPress={submit}
            disabled={send.isPending || !text.trim() || !phone}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.brand, alignItems: 'center', justifyContent: 'center', opacity: !text.trim() || !phone ? 0.5 : 1 }}
          >
            <Icon name="send" size={16} color={theme.mode === 'dark' ? '#101114' : '#fff'} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
