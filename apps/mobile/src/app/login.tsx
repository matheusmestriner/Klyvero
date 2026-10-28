import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { getItem, setItem } from '@/lib/storage';
import { useSession } from '@/lib/session';
import { usePalette } from '@/lib/theme';
import { useEffect } from 'react';

const WORKSPACE_KEY = 'klyvero.workspace';

export default function Login() {
  const c = usePalette();
  const { signIn } = useSession();
  const [workspace, setWorkspace] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getItem(WORKSPACE_KEY).then((saved) => saved && setWorkspace(saved));
  }, []);

  const valid = workspace.trim().length >= 1 && email.includes('@') && password.length >= 8;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn({ tenantSlug: workspace, email, password });
      await setItem(WORKSPACE_KEY, workspace.trim().toLowerCase());
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 401
          ? 'Workspace, e-mail ou senha incorretos.'
          : e instanceof ApiError && e.status === 429
            ? 'Muitas tentativas. Aguarde alguns minutos.'
            : e instanceof Error && e.message
              ? e.message
              : 'Não foi possível entrar.',
      );
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 4, marginBottom: 12 }}>
            <Text style={{ color: c.primary, fontSize: 32, fontWeight: '800' }}>Klyvero</Text>
            <Text style={{ color: c.muted, fontSize: 16 }}>Entre para ver suas conversas, leads e agenda.</Text>
          </View>
          <Field label="Workspace" value={workspace} onChangeText={setWorkspace} autoCapitalize="none" autoCorrect={false} placeholder="minha-empresa" />
          <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" autoComplete="email" />
          <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" autoComplete="current-password" onSubmitEditing={submit} />
          {error ? <Text accessibilityRole="alert" style={{ color: c.danger }}>{error}</Text> : null}
          <Button title="Entrar" onPress={submit} busy={busy} disabled={!valid} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
