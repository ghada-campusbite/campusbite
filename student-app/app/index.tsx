import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { store } from '../src/api';
import { api, ORIGIN } from '../src/api';
import { useAuth } from '../src/auth';
import { clock, colors, egp, hhmm, STATUS_LABEL } from '../src/theme';

type Uni = { id: string; name: string };
type Campus = { id: string; name: string };
type Canteen = { previewImages?: string[]; id: string; name: string; prepMinutes: number; openMin: number | null; closeMin: number | null };
type Order = { id: string; status: string; totalCents: number; pickupAt: string; items: { quantity: number; menuItem: { name: string } }[] };

const UNI_KEY = 'uni_id';

export default function Home() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [unis, setUnis] = useState<Uni[]>([]);
  const [uniId, setUniId] = useState<string>('');
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [campusId, setCampusId] = useState('');
  const [items, setItems] = useState<Canteen[] | null>(null);
  const [upcoming, setUpcoming] = useState<Order[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<Uni[]>('/universities', { auth: false })
      .then(async (u) => {
        setUnis(u);
        const saved = await store.getItemAsync(UNI_KEY);
        setUniId(saved && u.some((x) => x.id === saved) ? saved : (u[0]?.id ?? ''));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setCampusId('');
    if (!uniId) return;
    api<Campus[]>(`/universities/${uniId}/campuses`, { auth: false }).then(async (list) => {
      setCampuses(list);
      try { const me = await api<{ campusId?: string | null }>('/auth/me'); if (me.campusId && list.some((c) => c.id === me.campusId)) setCampusId(me.campusId); } catch { /* guest */ }
    }).catch(() => setCampuses([]));
  }, [uniId]);

  const load = useCallback(() => {
    if (!uniId) return;
    api<Canteen[]>(`/canteens?universityId=${uniId}${campusId ? `&campusId=${campusId}` : ''}`, { auth: false }).then(setItems).catch((e) => setErr(e.message));
  }, [uniId, campusId]);
  useEffect(() => { load(); }, [load]);

  // refresh the "upcoming orders" strip whenever the home tab is focused again
  useFocusEffect(useCallback(() => {
    api<Order[]>('/orders/mine')
      .then((o) => setUpcoming(o.filter((x) => ['PENDING', 'PREPARING', 'READY'].includes(x.status)).slice(0, 5)))
      .catch(() => {});
  }, []));

  const pickUni = async (id: string) => { setUniId(id); setItems(null); await store.setItemAsync(UNI_KEY, id); };

  return (
    <View style={s.wrap}>
      <View style={s.hero}><Pressable onPress={signOut} style={s.out}><Text style={s.outT}>خروج</Text></Pressable><Text style={s.heroT}>اطلب في البريك من غير طابور</Text><Text style={s.heroS}>اختار صنفك، حدد وقت الاستلام، واستلمه جاهز.</Text></View>
      {unis.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
          {unis.map((u) => (
            <Pressable key={u.id} style={[s.chip, uniId === u.id && s.chipOn]} onPress={() => pickUni(u.id)}>
              <Text style={[s.chipText, uniId === u.id && { color: colors.violetDark }]}>{u.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {campuses.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
          {[{ id: '', name: 'كل المجمعات' }, ...campuses].map((c) => (
            <Pressable key={c.id || 'all'} style={[s.chip, campusId === c.id && s.chipOn]} onPress={() => { setCampusId(c.id); setItems(null); if (c.id) api('/auth/me/campus', { method: 'PATCH', body: { campusId: c.id } }).catch(() => {}); }}>
              <Text style={[s.chipText, campusId === c.id && { color: colors.violetDark }]}>{c.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {upcoming.length > 0 && (
        <View style={s.upcoming}>
          <Text style={s.h}>طلباتك الجاية</Text>
          {upcoming.map((o) => (
            <Pressable key={o.id} onPress={() => router.push('/orders')} style={s.upRow}>
              <Text style={s.upText}>{STATUS_LABEL[o.status]} — استلام {clock(o.pickupAt)}</Text>
              <Text style={s.upText}>{egp(o.totalCents)}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {!items && !err && <ActivityIndicator color={colors.violet} style={{ marginTop: 40 }} />}
      {!!err && <Pressable onPress={() => { setErr(''); load(); }}><Text style={s.err}>{err} — اضغط للمحاولة تاني</Text></Pressable>}
      <FlatList
        data={items ?? []} keyExtractor={(c) => c.id}
        ListEmptyComponent={items ? <Text style={s.muted}>مفيش مطاعم متاحة دلوقتي</Text> : null}
        renderItem={({ item }) => (
          <Pressable style={s.card} onPress={() => router.push({ pathname: '/canteen/[id]', params: { id: item.id } })}>
            {!!item.previewImages?.length && (
              <View style={s.strip}>
                {item.previewImages.map((u) => <Image key={u} source={{ uri: `${ORIGIN}/api/v1${u}` }} style={s.thumb} />)}
              </View>
            )}
            <Text style={s.name}>{item.name}</Text>
            <Text style={s.muted}>التحضير حوالي {item.prepMinutes} دقيقة{item.openMin != null && item.closeMin != null ? ` — مفتوح ${hhmm(item.openMin)} لـ ${hhmm(item.closeMin)}` : ''}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, padding: 16 },
  bar: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  pill: { backgroundColor: colors.violet, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  pillText: { color: '#fff', fontWeight: '700' },
  chip: { backgroundColor: '#e9e3f7', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  chipOn: { backgroundColor: colors.gold },
  chipText: { color: colors.violet, fontWeight: '700' },
  upcoming: { backgroundColor: colors.card, borderRadius: 16, padding: 12, marginBottom: 12, borderStartWidth: 5, borderStartColor: colors.violet },
  h: { fontWeight: '800', color: colors.violet, textAlign: 'right', marginBottom: 6 },
  upRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  upText: { color: colors.text, fontWeight: '600' },
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 18, marginBottom: 12, borderStartWidth: 6, borderStartColor: colors.gold, shadowColor: '#2a1466', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  strip: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  thumb: { flex: 1, height: 74, borderRadius: 12, backgroundColor: '#e9e3f7' },
  out: { position: 'absolute', top: 12, left: 14, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 },
  outT: { color: '#fff', fontWeight: '700', fontSize: 12 },
  hero: { backgroundColor: colors.violet, borderRadius: 20, padding: 18, marginBottom: 14 },
  heroT: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'right' },
  heroS: { color: '#e4dcfb', marginTop: 4, textAlign: 'right' },
  name: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'right' },
  muted: { color: colors.muted, textAlign: 'right', marginTop: 4 },
  err: { color: colors.red, textAlign: 'center', marginTop: 24 },
});
