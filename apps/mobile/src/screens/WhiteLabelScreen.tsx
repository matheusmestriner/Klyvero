import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import type { Branding } from '../lib/auth-context';
import { Button, Card, ErrorNotice, Screen, TextField } from '../components/ui';
import { Icon } from '../components/icons';
import { spacing } from '../theme';
import { useUpdateBranding } from '../lib/hooks';

const SWATCHES = ['#101114', '#0e7c66', '#4f46e5', '#b8562f', '#a1662f', '#0f766e', '#7c3aed', '#be123c'];

export default function WhiteLabelScreen() {
  const { theme, refreshMe } = useAuth();
  const { data } = useQuery<Branding>({ queryKey: ['branding'], queryFn: () => api('/branding/me') });
  const [productName, setProductName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const update = useUpdateBranding();

  useEffect(() => {
    if (data?.branding.productName) setProductName(data.branding.productName);
    if (data?.branding.primaryColor) setColor(data.branding.primaryColor);
  }, [data]);

  async function save() {
    await update.mutateAsync({ productName, primaryColor: color ?? undefined });
    await refreshMe();
  }

  return (
    <Screen>
      <View style={{ padding: spacing.lg, paddingBottom: 6 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>White-label</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: 14, paddingBottom: 60 }}>
        <Text style={{ color: theme.muted, fontSize: 12.5 }}>
          Personalize a marca deste workspace. As mudanças se aplicam ao app inteiro, para todo o seu time.
        </Text>

        <Card>
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14, marginBottom: 8 }}>Nome do produto</Text>
          <TextField label="Aparece no login e no menu" value={productName} onChangeText={setProductName} placeholder="Klyvero" />
        </Card>

        <Card>
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>Cor de marca</Text>
          <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2, marginBottom: 14 }}>Aplicada em botões, links e destaques do app</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {SWATCHES.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: color === c ? theme.text : 'transparent' }}
              >
                {color === c ? <Icon name="check" size={16} color="#fff" /> : null}
              </Pressable>
            ))}
          </View>
        </Card>

        {update.isError ? <ErrorNotice message={(update.error as Error).message} /> : null}

        <Button label="Salvar marca" variant="primary" full onPress={save} loading={update.isPending} disabled={!productName} />
      </ScrollView>
    </Screen>
  );
}
