'use client';
import { useState } from 'react';

export default function Forgot() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr('');
    const em = String(new FormData(e.currentTarget).get('email'));
    const r = await fetch('/api/proxy/auth/forgot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: em }) });
    setBusy(false);
    if (r.ok) { setEmail(em); setStep(2); setMsg('لو الإيميل مسجل، وصله كود استعادة'); } else setErr('حصلت مشكلة، جرّب تاني');
  }
  async function reset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr('');
    const f = new FormData(e.currentTarget);
    const r = await fetch('/api/proxy/auth/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, code: f.get('code'), newPassword: f.get('newPassword') }) });
    setBusy(false);
    if (r.ok) { window.location.href = '/login'; } else setErr((await r.json().catch(() => ({}))).message ?? 'الكود غلط أو منتهي');
  }
  return (
    <form className="box" onSubmit={step === 1 ? send : reset}>
      <h2 style={{ margin: 0, color: 'var(--violet)' }}>استعادة الباسورد</h2>
      {step === 1 ? (
        <input name="email" type="email" placeholder="الإيميل" required />
      ) : (
        <>
          <input name="code" inputMode="numeric" pattern="[0-9]{6}" placeholder="كود الـ 6 أرقام" required />
          <input name="newPassword" type="password" placeholder="الباسورد الجديد (12+ حرف)" minLength={12} required autoComplete="new-password" />
        </>
      )}
      {msg && <div>{msg}</div>}{err && <div className="err">{err}</div>}
      <button className="gold" disabled={busy}>{busy ? '...' : step === 1 ? 'ابعت الكود' : 'غيّر الباسورد'}</button>
    </form>
  );
}
