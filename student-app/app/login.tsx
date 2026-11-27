import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/auth';
import { colors } from '../src/theme';

export default function Login() {
  const { signIn, register } = useAuth();
  const router = useRouter();
  const [signup, setSignup] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr('');
    if (signup && name.trim().length < 2) return setErr('اكتب اسمك');
    if (signup && password.length < 10) return setErr('الباسورد لازم 10 حروف على الأقل');
    setBusy(true);
    try { signup ? await register(name, email.trim(), password) : await signIn(email.trim(), password); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={s.logo}>CampusBite</Text>
      <Text style={s.sub}>اطلب أكلك واستلمه في البريك</Text>
      {signup && <TextInput style={s.input} placeholder="الاسم" value={name} onChangeText={setName} maxLength={80} />}
      <TextInput style={s.input} placeholder="الإيميل" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <TextInput style={s.input} placeholder="الباسورد" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" maxLength={128} />
      {!!err && <Text style={s.err}>{err}</Text>}
      <Pressable style={[s.btn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.violetDark} /> : <Text style={s.btnText}>{signup ? 'إنشاء حساب' : 'دخول'}</Text>}
      </Pressable>
      <Pressable onPress={() => { setSignup(!signup); setErr(''); }}>
        <Text style={s.link}>{signup ? 'عندي حساب' : 'مستخدم جديد؟ سجّل'}</Text>
      </Pressable>
      {!signup && <Pressable onPress={() => router.push('/forgot')}><Text style={s.link}>نسيت الباسورد؟</Text></Pressable>}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.violetDark },
  logo: { color: colors.gold, fontSize: 34, fontWeight: '800', textAlign: 'center' },
  sub: { color: '#fff', textAlign: 'center', marginBottom: 16 },
  input: { backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 16, textAlign: 'right' },
  btn: { backgroundColor: colors.gold, borderRadius: 12, padding: 14, alignItems: 'center' },
  btnText: { color: colors.violetDark, fontWeight: '800', fontSize: 16 },
  link: { color: '#fff', textAlign: 'center', marginTop: 8 },
  err: { color: '#fecaca', textAlign: 'center' },
});
