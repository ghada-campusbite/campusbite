import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../src/api';
import { useAuth } from '../src/auth';
import { colors } from '../src/theme';

export default function Account() {
  const { signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<{ name: string; email: string; emailVerified: boolean } | null>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { api<{ name: string; email: string; emailVerified: boolean }>('/auth/me').then(setMe).catch(() => {}); }, []);

  async function remove() {
    setConfirming(false);
    setBusy(true); setErr('');
    try { await api('/auth/me', { method: 'DELETE', body: { password } }); await signOut(); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <View style={s.wrap}>
      <View style={s.profile}>
        <View style={s.avatar}><Text style={s.avatarText}>{(me?.name ?? '؟').trim().charAt(0)}</Text></View>
        <Text style={s.name}>{me?.name ?? '...'}</Text>
        <Text style={s.email}>{me?.email ?? ''}</Text>
        {me && <View style={[s.badge, !me.emailVerified && { backgroundColor: '#fef3c7' }]}><Text style={[s.badgeText, !me.emailVerified && { color: '#92400e' }]}>{me.emailVerified ? 'الإيميل مؤكَّد' : 'الإيميل لسه مش مؤكَّد'}</Text></View>}
      </View>
      <Pressable style={s.out} onPress={signOut}><Text style={s.outText}>تسجيل الخروج</Text></Pressable>
      <View style={s.danger}>
        <Text style={s.h}>حذف الحساب</Text>
        <Text style={s.p}>اكتب الباسورد عشان نتأكد إنه انتِ.</Text>
        <TextInput style={s.input} placeholder="الباسورد" secureTextEntry value={password} onChangeText={setPassword} maxLength={128} />
        {!!err && <Text style={s.err}>{err}</Text>}
        <Pressable style={[s.btn, (!password || busy) && { opacity: 0.45 }]} disabled={!password || busy} onPress={() => setConfirming(true)}>
          <Text style={s.btnText}>حذف حسابي نهائيًا</Text>
        </Pressable>
      </View>
      {/* in-app confirm: Alert.alert is a no-op on web, this modal works everywhere */}
      <Modal visible={confirming} transparent animationType="fade" onRequestClose={() => setConfirming(false)}>
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Text style={s.dialogH}>حذف الحساب نهائيًا؟</Text>
            <Text style={s.dialogP}>هيتمسح اسمك وإيميلك وأي طلبات شغالة هتتلغي. مش هينفع تتراجعي.</Text>
            <View style={s.dialogRow}>
              <Pressable style={s.dialogCancel} onPress={() => setConfirming(false)}><Text style={s.dialogCancelText}>لأ</Text></Pressable>
              <Pressable style={s.dialogDelete} onPress={remove}><Text style={s.dialogDeleteText}>احذف</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  profile: { backgroundColor: '#fff', borderRadius: 16, padding: 20, alignItems: 'center', gap: 6 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.violet, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.gold, fontSize: 28, fontWeight: '800' },
  name: { fontSize: 18, fontWeight: '800', color: colors.violetDark },
  email: { color: colors.muted },
  badge: { backgroundColor: '#dcfce7', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, marginTop: 4 },
  badgeText: { color: '#166534', fontWeight: '700', fontSize: 12 },
  out: { backgroundColor: colors.violet, borderRadius: 12, padding: 14, alignItems: 'center' },
  outText: { color: '#fff', fontWeight: '800' },
  danger: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10, marginTop: 12, borderWidth: 1, borderColor: '#fecaca' },
  wrap: { flex: 1, padding: 20, gap: 12 },
  h: { fontSize: 20, fontWeight: '800', color: colors.red, textAlign: 'right' },
  p: { color: colors.muted, textAlign: 'right' },
  input: { backgroundColor: colors.bg, borderRadius: 12, padding: 14, fontSize: 16, textAlign: 'right' },
  btn: { backgroundColor: colors.red, borderRadius: 12, padding: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800' },
  err: { color: colors.red, textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: '#fff', borderRadius: 16, padding: 20, gap: 10, maxWidth: 340, width: '100%' },
  dialogH: { fontSize: 18, fontWeight: '800', color: colors.red, textAlign: 'right' },
  dialogP: { color: colors.muted, textAlign: 'right' },
  dialogRow: { flexDirection: 'row-reverse', gap: 10, marginTop: 6 },
  dialogCancel: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center', backgroundColor: colors.bg },
  dialogCancelText: { color: colors.violetDark, fontWeight: '800' },
  dialogDelete: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center', backgroundColor: colors.red },
  dialogDeleteText: { color: '#fff', fontWeight: '800' },
});
