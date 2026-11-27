'use client';
import { useCallback, useEffect, useState } from 'react';

type Status = 'PENDING' | 'PREPARING' | 'READY';
type Order = { id: string; status: Status; totalCents: number; pickupAt: string; items: { id: string; quantity: number; menuItem: { name: string } }[] };

const COLS: { status: Status; title: string }[] = [
  { status: 'PENDING', title: 'جديد' },
  { status: 'PREPARING', title: 'بيتحضّر' },
  { status: 'READY', title: 'جاهز للاستلام' },
];
const NEXT: Record<Status, { to: string; label: string }> = {
  PENDING: { to: 'PREPARING', label: 'ابدأ التحضير' },
  PREPARING: { to: 'READY', label: 'جاهز' },
  READY: { to: 'COMPLETED', label: 'تم التسليم' },
};
const fmt = new Intl.DateTimeFormat('ar-EG', { timeStyle: 'short', timeZone: 'Africa/Cairo' });

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [moveErr, setMoveErr] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/proxy/orders/canteen', { cache: 'no-store' });
    if (r.status === 401) { window.location.href = '/login'; return; }
    if (!r.ok) { setError('مش قادر أجيب الطلبات، بحاول تاني...'); return; }
    setError(''); setOrders(await r.json());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  async function move(id: string, status: string) {
    // handing over needs the 4-digit code the student sees in their order
    let code: string | undefined;
    if (status === 'COMPLETED') {
      const c = prompt('اكتب كود الاستلام (4 أرقام) اللي ظاهر مع الطالب:');
      if (c == null) return;
      code = c.trim();
    }
    setBusyId(id);
    const r = await fetch(`/api/proxy/orders/${id}/status`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status, ...(code ? { code } : {}) }),
    });
    if (r.status === 429) setMoveErr('محاولات كتير غلط على الكود، جرّب بعد 10 دقايق');
    else if (r.status === 400 && status === 'COMPLETED') setMoveErr('كود الاستلام غلط، اسأل الطالب عن الكود اللي ظاهر في طلبه');
    else if (!r.ok && r.status !== 409) setMoveErr('ما اتحفظش التغيير، جرّب تاني');
    else setMoveErr('');
    setBusyId(''); load();
  }

  return (
    <>
      {error && <p className="err">{error}</p>}
      {moveErr && <p className="err">{moveErr}</p>}
      <div className="cols">
        {COLS.map((c) => (
          <section className="col" key={c.status}>
            <h2>{c.title} ({orders.filter((o) => o.status === c.status).length})</h2>
            {orders.filter((o) => o.status === c.status).map((o) => {
              const mins = Math.round((new Date(o.pickupAt).getTime() - Date.now()) / 60000);
              return (
                <div className={`card ${mins < 0 && o.status !== 'READY' ? 'late' : ''}`} key={o.id}>
                  <div className="row"><b>#{o.id.slice(-4).toUpperCase()}</b><span>استلام {fmt.format(new Date(o.pickupAt))}</span></div>
                  <div className="muted">{mins >= 0 ? `بعد ${mins} دقيقة` : `متأخر ${-mins} دقيقة`}</div>
                  <ul style={{ margin: '8px 0', paddingInlineStart: 18 }}>
                    {o.items.map((i) => <li key={i.id}>{i.quantity}× {i.menuItem.name}</li>)}
                  </ul>
                  <div className="row">
                    <b>{(o.totalCents / 100).toFixed(2)} ج.م</b>
                    <span>
                      {o.status !== 'READY' && <button className="ghost" disabled={busyId === o.id} onClick={() => confirm('إلغاء الطلب؟') && move(o.id, 'CANCELLED')}>إلغاء</button>}{' '}
                      <button className="gold" disabled={busyId === o.id} onClick={() => move(o.id, NEXT[o.status].to)}>{NEXT[o.status].label}</button>
                    </span>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </>
  );
}
