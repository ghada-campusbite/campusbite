import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../src/api';
import { colors } from '../src/theme';

export default function Forgot() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setErr('');
    try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const sendCode = () => run(async () => {
    await api('/auth/forgot', { method: 'POST', body: { email: email.trim() }, auth: false });
    setStep(2);
  });
  const reset = () => run(async () => {
    if (pw.length < 10) throw new Error('الباسورد لازم 10 حروف على الأقل');
    await api('/auth/reset', { method: 'POST', body: { email: email.trim(), code: code.trim(), newPassword: pw }, auth: false });
    Alert.alert('تمام ✅', 'الباسورد اتغيّر، سجّل دخول بيه');
    router.replace('/login');
  });

  return (
    <View style={s.wrap}>
      {step === 1 ? (
        <>
          <Text style={s.p}>اكتب إيميلك وهنبعتلك كود من 6 أرقام.</Text>
          <TextInput style={s.input} placeholder="الإيميل" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          {!!err && <Text style={s.err}>{err}</Text>}
          <Pressable style={[s.btn, (!email || busy) && s.off]} disabled={!email || busy} onPress={sendCode}>
            {busy ? <ActivityIndicator color={colors.violetDark} /> : <Text style={s.btnText}>ابعت الكود</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={s.p}>لو الإيميل مسجّل عندنا، الكود وصله (صالح 15 دقيقة). شوف الـ Spam كمان.</Text>
          <TextInput style={s.input} placeholder="الكود (6 أرقام)" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
          <TextInput style={s.input} placeholder="الباسورد الجديد" value={pw} onChangeText={setPw} secureTextEntry maxLength={128} />
          {!!err && <Text style={s.err}>{err}</Text>}
          <Pressable style={[s.btn, (code.length !== 6 || !pw || busy) && s.off]} disabled={code.length !== 6 || !pw || busy} onPress={reset}>
            {busy ? <ActivityIndicator color={colors.violetDark} /> : <Text style={s.btnText}>غيّر الباسورد</Text>}
          </Pressable>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, padding: 20, gap: 12 },
  p: { color: colors.muted, textAlign: 'right' },
  input: { backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 16, textAlign: 'right' },
  btn: { backgroundColor: colors.gold, borderRadius: 12, padding: 14, alignItems: 'center' },
  btnText: { color: colors.violetDark, fontWeight: '800', fontSize: 16 },
  off: { opacity: 0.45 },
  err: { color: colors.red, textAlign: 'center' },
});
