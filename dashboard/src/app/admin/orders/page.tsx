'use client';
import { useCallback, useEffect, useState } from 'react';

type Order = { id: string; status: string; totalCents: number; pickupAt: string; createdAt: string; cancelledBy: string | null; user: { name: string; email: string }; canteen: { name: string }; items: { quantity: number; menuItem: { name: string } }[] };
const STATUSES = ['', 'PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'];
const AR: Record<string, string> = { PENDING: 'جديد', PREPARING: 'بيتحضّر', READY: 'جاهز', COMPLETED: 'تم التسليم', CANCELLED: 'ملغي' };
const fmt = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Cairo' });

export default function AdminOrders() {
  const [list, setList] = useState<Order[]>([]);
  const [status, setStatus] = useState('');
  const load = useCallback(async (s: string) => {
    const r = await fetch(`/api/proxy/admin/orders${s ? `?status=${s}` : ''}`, { cache: 'no-store' });
    if (r.status === 401) { window.location.href = '/login'; return; }
    if (r.ok) setList(await r.json());
  }, []);
  useEffect(() => { load(status); const t = setInterval(() => load(status), 15_000); return () => clearInterval(t); }, [status, load]);
  return (
    <>
      <select value={status} onChange={(e) => setStatus(e.target.value)} className="card" style={{ padding: 10 }}>
        {STATUSES.map((s) => <option key={s} value={s}>{s ? AR[s] : 'كل الحالات'}</option>)}
      </select>
      {list.map((o) => (
        <div className="card" key={o.id}>
          <div className="row">
            <b>#{o.id.slice(-4).toUpperCase()} — {AR[o.status]}{o.cancelledBy ? ` (ألغاه ${o.cancelledBy === 'STAFF' ? 'المطعم' : 'الطالب'})` : ''}</b>
            <b>{(o.totalCents / 100).toFixed(2)} ج.م</b>
          </div>
          <div className="muted">{o.user.name} ({o.user.email}) — {o.canteen.name}</div>
          <div className="muted">استلام {fmt.format(new Date(o.pickupAt))} — اتعمل {fmt.format(new Date(o.createdAt))}</div>
          <div>{o.items.map((i) => `${i.quantity}× ${i.menuItem.name}`).join('، ')}</div>
        </div>
      ))}
    </>
  );
}
