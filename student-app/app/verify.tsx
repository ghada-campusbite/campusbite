import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../src/api';
import { useAuth } from '../src/auth';
import { colors } from '../src/theme';

export default function Verify() {
  const { refreshMe, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('بعتنالك كود من 6 أرقام على إيميلك.');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(60); // matches the server-side 60s cooldown

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function submit() {
    setBusy(true); setErr('');
    try { await api('/auth/verify-email', { method: 'POST', body: { code: code.trim() } }); await refreshMe(); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  }
  async function resend() {
    setErr('');
    try { await api('/auth/verify-email/send', { method: 'POST' }); setInfo('بعتنالك كود جديد.'); setWait(60); }
    catch (e: any) { setErr(e.message); }
  }

  return (
    <View style={s.wrap}>
      <Text style={s.h}>أكّد إيميلك 📧</Text>
      <Text style={s.p}>{info} شوف الـ Spam كمان لو ماوصلش.</Text>
      <TextInput style={s.input} placeholder="الكود (6 أرقام)" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
      {!!err && <Text style={s.err}>{err}</Text>}
      <Pressable style={[s.btn, (code.length !== 6 || busy) && { opacity: 0.45 }]} disabled={code.length !== 6 || busy} onPress={submit}>
        {busy ? <ActivityIndicator color={colors.violetDark} /> : <Text style={s.btnText}>تأكيد</Text>}
      </Pressable>
      <Pressable disabled={wait > 0} onPress={resend}>
        <Text style={[s.link, wait > 0 && { opacity: 0.5 }]}>{wait > 0 ? `ابعت كود تاني بعد ${wait} ثانية` : 'ابعت كود تاني'}</Text>
      </Pressable>
      <Pressable onPress={signOut}><Text style={s.link}>خروج</Text></Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.violetDark },
  h: { color: colors.gold, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  p: { color: '#fff', textAlign: 'center' },
  input: { backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 20, textAlign: 'center', letterSpacing: 6 },
  btn: { backgroundColor: colors.gold, borderRadius: 12, padding: 14, alignItems: 'center' },
  btnText: { color: colors.violetDark, fontWeight: '800', fontSize: 16 },
  link: { color: '#fff', textAlign: 'center', marginTop: 6 },
  err: { color: '#fecaca', textAlign: 'center' },
});
