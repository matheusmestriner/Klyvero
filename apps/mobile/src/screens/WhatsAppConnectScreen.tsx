import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Image, ScrollView, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Button, Card, ErrorNotice, Pill, Screen } from '../components/ui';
import { spacing } from '../theme';
import { useConnectWhatsapp } from '../lib/hooks';
import { WHATSAPP_SESSION_ID } from '../lib/constants';

type Status = { connected: boolean; loggedIn: boolean };
type QrPayload = { qr?: string; qrCode?: string; image?: string };

export default function WhatsAppConnectScreen() {
  const { theme } = useAuth();
  const connect = useConnectWhatsapp();
  const [attempted, setAttempted] = useState(false);

  const { data: status, refetch: refetchStatus, error: statusError } = useQuery<Status>({
    queryKey: ['whatsapp-status'],
    queryFn: () => api(`/whatsapp/${WHATSAPP_SESSION_ID}/status`),
    enabled: attempted,
    refetchInterval: (query) => (query.state.data?.loggedIn ? false : 3500),
  });

  const { data: qr } = useQuery<QrPayload>({
    queryKey: ['whatsapp-qr'],
    queryFn: () => api(`/whatsapp/${WHATSAPP_SESSION_ID}/qr`),
    enabled: attempted && !!status && !status.loggedIn,
    refetchInterval: 4000,
  });

  useEffect(() => {
    if (!attempted) {
      connect.mutate({ sessionId: WHATSAPP_SESSION_ID, displayName: 'Klyvero' });
      setAttempted(true);
    }
  }, [attempted, connect]);

  const qrValue = qr?.qr || qr?.qrCode;
  const qrImage = qr?.image;

  return (
    <Screen>
      <View style={{ padding: spacing.lg, paddingBottom: 6 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>WhatsApp</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: 14, paddingBottom: 40 }}>
        {statusError ? <ErrorNotice message={(statusError as Error).message} /> : null}
        {connect.isError ? <ErrorNotice message={(connect.error as Error).message} /> : null}

        <Card style={{ alignItems: 'center', gap: 6 }}>
          <Pill label={status?.loggedIn ? 'Conectado' : status?.connected ? 'Aguardando leitura do QR' : 'Conectando…'} variant={status?.loggedIn ? 'solid' : 'outline'} />
          <Text style={{ color: theme.muted, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
            {status?.loggedIn ? 'Este número está pronto para enviar e receber mensagens.' : 'Abra o WhatsApp no celular do número que vai atender, vá em Aparelhos conectados e escaneie o código.'}
          </Text>
        </Card>

        {!status?.loggedIn ? (
          <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
            {qrImage ? (
              <Image source={{ uri: qrImage }} style={{ width: 220, height: 220 }} resizeMode="contain" />
            ) : qrValue ? (
              <QRCode value={qrValue} size={220} />
            ) : (
              <Text style={{ color: theme.muted }}>Gerando código…</Text>
            )}
          </Card>
        ) : null}

        <Button label="Atualizar status" variant="ghost" full onPress={() => refetchStatus()} />
      </ScrollView>
    </Screen>
  );
}
