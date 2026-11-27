'use client';
import { useCallback, useEffect, useState } from 'react';

type Canteen = { id: string; name: string; prepMinutes: number; openMin: number | null; closeMin: number | null; maxOrdersPerSlot: number; university: { name: string } };
type Summary = { date: string; orders: number; cancelled: number; collectedCents: number; inProgressCents: number; topItems: { name: string; quantity: number }[] };

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toTime = (m: number | null) => (m == null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);

export default function Settings() {
  const [c, setC] = useState<Canteen | null>(null);
  const [sum, setSum] = useState<Summary | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const [r1, r2] = await Promise.all([fetch('/api/proxy/canteen/mine', { cache: 'no-store' }), fetch('/api/proxy/canteen/summary', { cache: 'no-store' })]);
    if (r1.status === 401) { window.location.href = '/login'; return; }
    if (r1.ok) setC(await r1.json());
    if (r2.ok) setSum(await r2.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(''); setErr('');
    const f = new FormData(e.currentTarget);
    const open = String(f.get('open')), close = String(f.get('close'));
    const body: any = {
      name: String(f.get('name')).trim(),
      prepMinutes: Number(f.get('prepMinutes')),
      maxOrdersPerSlot: Number(f.get('maxOrdersPerSlot')),
      openMin: open ? toMin(open) : undefined,
      closeMin: close ? toMin(close) : undefined,
    };
    const r = await fetch('/api/proxy/canteen/mine', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) { setMsg('اتحفظ ✅'); load(); } else setErr((await r.json().catch(() => ({}))).message ?? 'ما اتحفظش');
  }

  if (!c) return <p className="muted">بنحمّل...</p>;
  return (
    <>
      {sum && (
        <div className="card">
          <h2 style={{ marginTop: 0, color: 'var(--violet)' }}>ملخص النهاردة ({sum.date})</h2>
          <div className="row">
            <span>الطلبات: <b>{sum.orders}</b> (ملغي: {sum.cancelled})</span>
            <span>مبيعات مُسلَّمة: <b>{(sum.collectedCents / 100).toFixed(2)} ج.م</b></span>
            <span className="muted">طلبات شغالة بقيمة {(sum.inProgressCents / 100).toFixed(2)} ج.م</span>
          </div>
          {sum.topItems.length > 0 && <p className="muted">الأكثر طلبًا: {sum.topItems.map((t) => `${t.name} (${t.quantity})`).join('، ')}</p>}
        </div>
      )}
      <form className="card" onSubmit={save} style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0, color: 'var(--violet)' }}>إعدادات المطعم</h2>
        <p className="muted">{c.university.name}</p>
        <label>الاسم<input name="name" defaultValue={c.name} required minLength={2} maxLength={120} /></label>
        <label>وقت التحضير (دقيقة)<input name="prepMinutes" type="number" min={1} max={120} defaultValue={c.prepMinutes} required /></label>
        <label>مواعيد الفتح والقفل (ساعي، اختياري)
          <span style={{ display: 'flex', gap: 8 }}>
            <input name="open" type="time" defaultValue={toTime(c.openMin)} />
            <input name="close" type="time" defaultValue={toTime(c.closeMin)} />
          </span>
        </label>
        <label>أقصى عدد طلبات في المعاد الواحد<input name="maxOrdersPerSlot" type="number" min={1} max={200} defaultValue={c.maxOrdersPerSlot} required /></label>
        {msg && <p>{msg}</p>}{err && <p className="err">{err}</p>}
        <button className="gold">حفظ</button>
      </form>
    </>
  );
}
