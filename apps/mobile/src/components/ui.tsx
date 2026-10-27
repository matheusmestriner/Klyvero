import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { initials } from '@/lib/format';
import { usePalette } from '@/lib/theme';

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const c = usePalette();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: c.primary, fontWeight: '700', fontSize: size / 3 }}>{initials(name)}</Text>
    </View>
  );
}

export function Button({ title, onPress, busy, tone = 'primary', disabled, style }: { title: string; onPress: () => void; busy?: boolean; tone?: 'primary' | 'quiet' | 'danger'; disabled?: boolean; style?: ViewStyle }) {
  const c = usePalette();
  const bg = tone === 'primary' ? c.primary : 'transparent';
  const fg = tone === 'primary' ? c.onPrimary : tone === 'danger' ? c.danger : c.primary;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, borderColor: tone === 'primary' ? bg : c.border, opacity: busy || disabled ? 0.5 : pressed ? 0.8 : 1 }, style]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '600', fontSize: 16 }}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const c = usePalette();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.muted, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <TextInput
        placeholderTextColor={c.muted}
        {...props}
        style={[styles.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }, props.multiline && { minHeight: 90, textAlignVertical: 'top' }, props.style]}
      />
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const c = usePalette();
  return (
    <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: active ? c.primary : c.chip }]}>
      <Text style={{ color: active ? c.onPrimary : c.primary, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  const c = usePalette();
  return (
    <View style={{ padding: 32, alignItems: 'center', gap: 6 }}>
      <Text style={{ color: c.text, fontSize: 16, fontWeight: '600', textAlign: 'center' }}>{title}</Text>
      {hint ? <Text style={{ color: c.muted, textAlign: 'center' }}>{hint}</Text> : null}
    </View>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const c = usePalette();
  return (
    <View style={{ padding: 24, alignItems: 'center', gap: 12 }}>
      <Text style={{ color: c.danger, textAlign: 'center' }}>{message}</Text>
      {onRetry ? <Button title="Tentar de novo" tone="quiet" onPress={onRetry} /> : null}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const c = usePalette();
  return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: string }) {
  const c = usePalette();
  return <Text style={{ color: c.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 8 }}>{children}</Text>;
}

const styles = StyleSheet.create({
  button: { minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
});
