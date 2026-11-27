'use client';
import { useEffect, useState } from 'react';

export default function PlatformSettings() {
  const [pct, setPct] = useState('0');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    fetch('/api/proxy/admin/settings', { cache: 'no-store' }).then(async (r) => {
      if (r.status === 401) { window.location.href = '/login'; return; }
      if (r.ok) setPct(String((await r.json()).commissionPercent));
    });
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(pct);
    if (!(n >= 0 && n <= 30)) { setMsg('النسبة لازم تكون من 0 لـ 30'); return; }
    const r = await fetch('/api/proxy/admin/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ commissionPercent: n }) });
    setMsg(r.ok ? 'اتحفظ' : 'ما اتحفظش');
  }
  return (
    <form onSubmit={save} className="card" style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
      <h2 style={{ margin: 0, color: 'var(--violet)' }}>إعدادات المنصة</h2>
      <label>نسبة العمولة (%)
        <input type="number" step="0.5" min="0" max="30" value={pct} onChange={(e) => setPct(e.target.value)} />
      </label>
      <p className="muted" style={{ margin: 0 }}>الافتراضي 0. ده إعداد مسجّل بس: التطبيق مابيحصّلش أي فلوس. أي نسبة تتفق عليها مع المطاعم بتتحاسب بره التطبيق.</p>
      <button className="gold">حفظ</button>
      {msg && <p className="muted">{msg}</p>}
    </form>
  );
}
