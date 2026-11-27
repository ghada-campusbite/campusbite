import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, ORIGIN } from '../../src/api';
import { registerForPush } from '../../src/push';
import { clock, colors, egp } from '../../src/theme';

const eff = (i: { priceCents: number; offerPriceCents?: number | null }) => (i.offerPriceCents != null && i.offerPriceCents < i.priceCents ? i.offerPriceCents : i.priceCents);
type Item = { id: string; name: string; description: string; category: string; imageUrl: string | null; priceCents: number; offerPriceCents?: number | null; popular?: boolean; available: boolean };

export default function Canteen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [menu, setMenu] = useState<Item[] | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [slot, setSlot] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api<Item[]>(`/canteens/${id}/menu`, { auth: false }), api<string[]>(`/canteens/${id}/slots`, { auth: false })])
      .then(([m, sl]) => { setMenu(m); setSlots(sl); })
      .catch((e) => setErr(e.message));
  }, [id]);

  const sections = useMemo(() => {
    const byCat = new Map<string, Item[]>();
    for (const m of menu ?? []) {
      const cat = m.category || 'أخرى';
      byCat.set(cat, [...(byCat.get(cat) ?? []), m]);
    }
    return [...byCat.entries()].map(([title, data]) => ({ title, data }));
  }, [menu]);

  const lines = useMemo(() => (menu ?? []).filter((m) => qty[m.id] > 0), [menu, qty]);
  const total = lines.reduce((sum, m) => sum + eff(m) * qty[m.id], 0); // display only; server recalculates
  const change = (itemId: string, d: number) => setQty((q) => ({ ...q, [itemId]: Math.max(0, Math.min(20, (q[itemId] ?? 0) + d)) }));

  async function order() {
    setBusy(true); setErr('');
    try {
      await api('/orders', { method: 'POST', body: { canteenId: id, pickupAt: slot, items: lines.map((m) => ({ menuItemId: m.id, quantity: qty[m.id] })) } });
      registerForPush(true); // first order is when we explain-by-context and ask for notification permission
      Alert.alert('تمام ✅', 'طلبك اتبعت للمطعم');
      router.replace('/orders');
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (!menu && !err) return <ActivityIndicator color={colors.violet} style={{ marginTop: 40 }} />;
  const ready = lines.length > 0 && !!slot && !busy;

  return (
    <View style={{ flex: 1 }}>
      <SectionList
        contentContainerStyle={{ padding: 16 }} sections={sections} keyExtractor={(m) => m.id}
        ListEmptyComponent={<Text style={s.muted}>المنيو فاضي دلوقتي</Text>}
        renderSectionHeader={({ section }) => <Text style={s.h}>{section.title}</Text>}
        renderItem={({ item }) => (
          <View style={[s.card, !item.available && { opacity: 0.5 }]}>
            {item.imageUrl && <Image source={{ uri: `${ORIGIN}/api/v1${item.imageUrl}` }} style={s.img} />}
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.name}</Text>
              {!!item.description && <Text style={s.desc}>{item.description}</Text>}
              <View style={s.priceRow}>
                {item.offerPriceCents != null && item.offerPriceCents < item.priceCents ? (
                  <>
                    <Text style={s.offerPrice}>{egp(item.offerPriceCents)}</Text>
                    <Text style={s.oldPrice}>{egp(item.priceCents)}</Text>
                    <Text style={s.badgeGold}>عرض</Text>
                  </>
                ) : <Text style={s.price}>{egp(item.priceCents)}</Text>}
                {item.popular && <Text style={s.badgeViolet}>الأكثر طلباً</Text>}
                {!item.available && <Text style={s.muted}>مش متاح دلوقتي</Text>}
              </View>
            </View>
            {item.available && (
              <>
                <Pressable style={s.step} onPress={() => change(item.id, -1)}><Text style={s.stepText}>−</Text></Pressable>
                <Text style={s.qty}>{qty[item.id] ?? 0}</Text>
                <Pressable style={s.step} onPress={() => change(item.id, 1)}><Text style={s.stepText}>+</Text></Pressable>
              </>
            )}
          </View>
        )}
        ListFooterComponent={
          <View>
            <Text style={s.h}>وقت الاستلام (جوه البريك)</Text>
            {slots.length === 0 ? <Text style={s.muted}>مفيش أوقات متاحة دلوقتي</Text> : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {slots.map((sl) => (
                  <Pressable key={sl} style={[s.chip, slot === sl && s.chipOn]} onPress={() => setSlot(sl)}>
                    <Text style={[s.chipText, slot === sl && { color: colors.violetDark }]}>{clock(sl)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        }
      />
      <View style={s.footer}>
        {!!err && <Text style={s.err}>{err}</Text>}
        <Pressable style={[s.cta, !ready && s.ctaOff]} disabled={!ready} onPress={order}>
          {busy ? <ActivityIndicator color={colors.violetDark} /> : <Text style={[s.ctaText, !ready && { color: colors.violet }]}>{lines.length === 0 ? 'اختار صنف الأول' : !slot ? 'اختار وقت الاستلام' : `اطلب — ${egp(total)}`}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 18, padding: 12, marginBottom: 10, shadowColor: '#2a1466', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  img: { width: 68, height: 68, borderRadius: 14 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'right' },
  desc: { color: colors.muted, fontSize: 12, textAlign: 'right' },
  muted: { color: colors.muted, textAlign: 'right' },
  step: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.violet, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  qty: { width: 24, textAlign: 'center', fontWeight: '800', fontSize: 16 },
  h: { fontWeight: '800', fontSize: 17, color: colors.violet, marginTop: 18, marginBottom: 10, textAlign: 'right' },
  chip: { backgroundColor: '#e9e3f7', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  chipOn: { backgroundColor: colors.gold },
  chipText: { color: colors.violet, fontWeight: '700' },
  footer: { padding: 16, backgroundColor: colors.card, gap: 8 },
  cta: { backgroundColor: colors.gold, borderRadius: 14, padding: 16, alignItems: 'center' },
  ctaOff: { backgroundColor: '#ddd6ee' },
  ctaText: { color: colors.violetDark, fontWeight: '800', fontSize: 17 },
  err: { color: colors.red, textAlign: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  price: { color: colors.violet, fontWeight: '800', fontSize: 15 },
  offerPrice: { color: colors.violet, fontWeight: '800', fontSize: 15 },
  oldPrice: { color: colors.muted, textDecorationLine: 'line-through', fontSize: 13 },
  badgeGold: { backgroundColor: colors.gold, color: colors.violetDark, fontWeight: '800', fontSize: 11, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  badgeViolet: { backgroundColor: '#e9e3f7', color: colors.violet, fontWeight: '800', fontSize: 11, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
});
