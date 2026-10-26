import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { useAuth } from '../lib/auth-context';
import { radius, spacing, Theme } from '../theme';
import { Icon, IconName } from './icons';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { theme } = useAuth();
  return (
    <View
      style={[
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          borderWidth: 1,
          borderRadius: radius.lg,
          padding: spacing.lg,
          shadowColor: '#000',
          shadowOpacity: theme.mode === 'dark' ? 0.3 : 0.05,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 1,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function CardTitle({ title, hint }: { title: string; hint?: string }) {
  const { theme } = useAuth();
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{title}</Text>
      {hint ? <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>{hint}</Text> : null}
    </View>
  );
}

type PillVariant = 'default' | 'solid' | 'outline' | 'danger';

export function Pill({ label, variant = 'default' }: { label: string; variant?: PillVariant }) {
  const { theme } = useAuth();
  const styleByVariant: Record<PillVariant, ViewStyle & { color: string }> = {
    default: { backgroundColor: theme.tint(0.08), color: theme.brand },
    solid: { backgroundColor: theme.brand, color: theme.mode === 'dark' ? '#101114' : '#fff' },
    outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.border, color: theme.muted },
    danger: { backgroundColor: theme.dangerBg, color: theme.danger },
  };
  const s = styleByVariant[variant];
  return (
    <View style={{ backgroundColor: s.backgroundColor, borderWidth: (s as any).borderWidth, borderColor: (s as any).borderColor, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' }}>
      <Text style={{ color: s.color, fontSize: 10.5, fontWeight: '800' }}>{label}</Text>
    </View>
  );
}

type BtnVariant = 'primary' | 'ghost' | 'default';

export function Button({
  label,
  onPress,
  variant = 'default',
  full,
  loading,
  disabled,
  icon,
}: {
  label: string;
  onPress?: () => void;
  variant?: BtnVariant;
  full?: boolean;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
}) {
  const { theme } = useAuth();
  const bg = variant === 'primary' ? theme.brand : variant === 'ghost' ? 'transparent' : theme.card;
  const borderColor = variant === 'primary' ? theme.brand : theme.border;
  const color = variant === 'primary' ? (theme.mode === 'dark' ? '#101114' : '#fff') : theme.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderWidth: 1,
          borderColor,
          borderRadius: radius.md,
          paddingVertical: 11,
          paddingHorizontal: 16,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 7,
          width: full ? '100%' : undefined,
          opacity: pressed || disabled ? 0.6 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} size="small" />
      ) : (
        <>
          {icon ? <Icon name={icon} size={15} color={color} /> : null}
          <Text style={{ color, fontWeight: '700', fontSize: 13.5 }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'sentences',
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  multiline?: boolean;
}) {
  const { theme } = useAuth();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.muted }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.muted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        style={{
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.card,
          borderRadius: radius.md,
          paddingHorizontal: 13,
          paddingVertical: 12,
          fontSize: 13.5,
          color: theme.text,
          minHeight: multiline ? 90 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

export function ListRow({
  icon,
  title,
  subtitle,
  trailing,
  onPress,
  solidIcon,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  solidIcon?: boolean;
}) {
  const { theme } = useAuth();
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }}>
      {icon ? (
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: solidIcon ? theme.brand : theme.tint(0.08),
          }}
        >
          <Icon name={icon} size={18} color={solidIcon ? (theme.mode === 'dark' ? '#101114' : '#fff') : theme.brand} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 12, marginTop: 1 }}>{subtitle}</Text> : null}
      </View>
      {trailing}
      {onPress ? <Icon name="chevronRight" size={16} color={theme.muted} /> : null}
    </Wrapper>
  );
}

export function Avatar({ label, size = 38, solidBg }: { label: string; size?: number; solidBg?: string }) {
  const { theme } = useAuth();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: solidBg ?? theme.brand,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: theme.mode === 'dark' ? '#101114' : '#fff', fontWeight: '800', fontSize: size * 0.34 }}>{label}</Text>
    </View>
  );
}

export function SearchBar({ value, onChangeText, placeholder }: { value: string; onChangeText: (v: string) => void; placeholder: string }) {
  const { theme } = useAuth();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: radius.md, paddingHorizontal: 13, paddingVertical: 11 }}>
      <Icon name="search" size={16} color={theme.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.muted}
        style={{ flex: 1, color: theme.text, fontSize: 13.5, padding: 0 }}
      />
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const { theme } = useAuth();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 13,
        paddingVertical: 7,
        borderRadius: radius.pill,
        backgroundColor: active ? theme.brand : theme.card,
        borderWidth: 1,
        borderColor: active ? theme.brand : theme.border,
      }}
    >
      <Text style={{ color: active ? (theme.mode === 'dark' ? '#101114' : '#fff') : theme.muted, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({ icon = 'search', title, hint }: { icon?: IconName; title: string; hint?: string }) {
  const { theme } = useAuth();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
      <Icon name={icon} size={30} color={theme.muted} />
      <Text style={{ color: theme.text, fontWeight: '700' }}>{title}</Text>
      {hint ? <Text style={{ color: theme.muted, fontSize: 12.5, textAlign: 'center' }}>{hint}</Text> : null}
    </View>
  );
}

export function Fab({ onPress }: { onPress: () => void }) {
  const { theme } = useAuth();
  return (
    <Pressable
      onPress={onPress}
      style={{
        position: 'absolute',
        right: 18,
        bottom: 24,
        width: 56,
        height: 56,
        borderRadius: 18,
        backgroundColor: theme.brand,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: theme.brand,
        shadowOpacity: 0.4,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 4,
      }}
    >
      <Icon name="plus" size={22} color={theme.mode === 'dark' ? '#101114' : '#fff'} />
    </Pressable>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  const { theme } = useAuth();
  return (
    <View style={{ backgroundColor: theme.dangerBg, borderRadius: radius.md, padding: 12 }}>
      <Text style={{ color: theme.danger, fontSize: 13 }}>{message}</Text>
    </View>
  );
}

export function Screen({ children }: { children: React.ReactNode }) {
  const { theme } = useAuth();
  return <View style={{ flex: 1, backgroundColor: theme.bg }}>{children}</View>;
}

export function useThemeColors(): Theme {
  return useAuth().theme;
}
