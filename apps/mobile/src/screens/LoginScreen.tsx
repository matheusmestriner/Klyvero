import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useAuth } from '../lib/auth-context';
import { Button, ErrorNotice, TextField } from '../components/ui';
import { spacing } from '../theme';

const markLight = require('../assets/klyvero-mark.png');
const markDark = require('../assets/klyvero-mark-white.png');

export default function LoginScreen() {
  const { login, theme } = useAuth();
  const [tenantSlug, setTenantSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await login(tenantSlug.trim().toLowerCase(), email.trim().toLowerCase(), password);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível entrar. Confira workspace, e-mail e senha.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.xl }} keyboardShouldPersistTaps="handled">
        <View
          style={{
            backgroundColor: theme.card,
            borderColor: theme.border,
            borderWidth: 1,
            borderRadius: 24,
            padding: 24,
            gap: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Image source={theme.mode === 'dark' ? markDark : markLight} style={{ width: 32, height: 32, borderRadius: 10 }} />
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 19 }}>Klyvero</Text>
          </View>
          <View>
            <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 }}>Acesse seu workspace</Text>
            <Text style={{ color: theme.muted, fontSize: 13, marginTop: 4 }}>Prospecção, cadências, CRM, WhatsApp e IA no mesmo lugar.</Text>
          </View>

          <TextField label="Workspace" value={tenantSlug} onChangeText={setTenantSlug} placeholder="sua-empresa" autoCapitalize="none" />
          <TextField label="E-mail" value={email} onChangeText={setEmail} placeholder="voce@empresa.com" autoCapitalize="none" keyboardType="email-address" />
          <TextField label="Senha" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />

          {error ? <ErrorNotice message={error} /> : null}

          <Button label="Entrar" variant="primary" full onPress={submit} loading={busy} disabled={!tenantSlug || !email || !password} />

          <Text style={{ textAlign: 'center', color: theme.muted, fontSize: 11 }}>© {new Date().getFullYear()} Klyvero</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
