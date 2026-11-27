import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { colors } from './theme';

const TABS: { path: '/' | '/orders' | '/account'; label: string }[] = [
  { path: '/', label: 'المطاعم' },
  { path: '/orders', label: 'طلباتي' },
  { path: '/account', label: 'حسابي' },
];

export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  if (!TABS.some((t) => t.path === pathname)) return null;
  return (
    <View style={s.bar}>
      {TABS.map((t) => {
        const on = pathname === t.path;
        return (
          <Pressable key={t.path} style={s.tab} onPress={() => !on && router.replace(t.path)} accessibilityRole="button" accessibilityLabel={t.label}>
            <Text style={[s.label, on && s.labelOn]}>{t.label}</Text>
            {on && <View style={s.dot} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: '#e4def2', paddingTop: 8, paddingBottom: 14 },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  label: { color: colors.muted, fontWeight: '700', fontSize: 14 },
  labelOn: { color: colors.violet },
  dot: { width: 18, height: 3, borderRadius: 2, backgroundColor: colors.gold, marginTop: 2 },
});
