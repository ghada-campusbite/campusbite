'use client';
import { useState } from 'react';

export default function Login() {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr('');
    const f = new FormData(e.currentTarget);
    const r = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: f.get('email'), password: f.get('password') }),
    });
    if (r.ok) { window.location.href = '/'; return; }
    setErr((await r.json().catch(() => ({}))).message ?? 'حصلت مشكلة'); setBusy(false);
  }
  return (
    <form className="box" onSubmit={submit}>
      <h2 style={{ margin: 0, color: 'var(--violet)' }}>دخول المطعم</h2>
      <input name="email" type="email" placeholder="الإيميل" required autoComplete="username" />
      <input name="password" type="password" placeholder="الباسورد" required autoComplete="current-password" />
      {err && <div className="err">{err}</div>}
      <button className="gold" disabled={busy}>{busy ? '...' : 'دخول'}</button>
    <p style={{ textAlign: 'center', marginTop: 12 }}><a href="/forgot" style={{ color: '#6b21a8', textDecoration: 'underline' }}>نسيت كلمة السر؟</a></p>
    </form>
  );
}
