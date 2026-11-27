import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../src/api';
import { clock, colors, egp, STATUS_LABEL } from '../src/theme';

type Order = { pickupCode?: string; id: string; status: string; totalCents: number; pickupAt: string; items: { id: string; quantity: number; menuItem: { name: string } }[] };

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setOrders(await api<Order[]>('/orders/mine')); setErr(''); } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 15_000); return () => clearInterval(t); }, [load]);

  function cancel(id: string) {
    Alert.alert('إلغاء الطلب؟', undefined, [
      { text: 'لأ', style: 'cancel' },
      { text: 'إلغاء', style: 'destructive', onPress: async () => {
        try { await api(`/orders/${id}/cancel`, { method: 'PATCH' }); } catch (e: any) { Alert.alert('مقدرتش ألغي', e.message); }
        load();
      } },
    ]);
  }

  return (
    <FlatList
      contentContainerStyle={{ padding: 16 }} data={orders} keyExtractor={(o) => o.id}
      refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
      ListHeaderComponent={!!err ? <Text style={s.err}>{err}</Text> : null}
      ListEmptyComponent={<Text style={s.muted}>لسه معملتيش طلبات</Text>}
      renderItem={({ item: o }) => (
        <View style={[s.card, o.status === 'READY' && { borderStartColor: '#16a34a' }]}>
          <View style={s.row}>
            <Text style={[s.status, s.pill, o.status === 'READY' && s.pillReady, o.status === 'CANCELLED' && s.pillOff, o.status === 'COMPLETED' && s.pillOff]}>{STATUS_LABEL[o.status] ?? o.status}</Text>
            <Text style={s.muted}>استلام {clock(o.pickupAt)}</Text>
          </View>
          {o.items.map((i) => <Text key={i.id} style={s.line}>{i.quantity}× {i.menuItem.name}</Text>)}
          {!!o.pickupCode && ['PENDING', 'PREPARING', 'READY'].includes(o.status) && (
            <View style={s.codeBox}>
              <Text style={s.codeLabel}>كود الاستلام (قوله للمطعم)</Text>
              <Text style={s.code}>{o.pickupCode}</Text>
            </View>
          )}
          <View style={s.row}>
            <Text style={s.total}>{egp(o.totalCents)}</Text>
            {o.status === 'PENDING' && <Pressable onPress={() => cancel(o.id)}><Text style={s.cancel}>إلغاء</Text></Pressable>}
          </View>
        </View>
      )}
    />
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 14, marginBottom: 12, gap: 6, borderStartWidth: 5, borderStartColor: colors.gold },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { fontWeight: '800', color: colors.violet, fontSize: 16 },
  line: { color: colors.text, textAlign: 'right' },
  total: { fontWeight: '800', color: colors.text },
  pill: { backgroundColor: '#e9e3f7', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden', fontSize: 14 },
  pillReady: { backgroundColor: '#dcfce7', color: '#166534' },
  pillOff: { backgroundColor: '#eee', color: colors.muted },
  codeBox: { backgroundColor: '#f1ecfb', borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  codeLabel: { color: colors.muted, fontSize: 12 },
  code: { color: colors.violetDark, fontWeight: '800', fontSize: 28, letterSpacing: 6 },
  cancel: { color: colors.red, fontWeight: '700' },
  muted: { color: colors.muted, textAlign: 'center' },
  err: { color: colors.red, textAlign: 'center', marginBottom: 8 },
});
