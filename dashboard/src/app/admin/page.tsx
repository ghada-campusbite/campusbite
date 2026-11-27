'use client';
import { useEffect, useState } from 'react';

type A = { students: number; staff: number; canteens: number; universities: number; ordersToday: number; collectedTodayCents: number; byStatus: Record<string, number> };

export default function AdminHome() {
  const [a, setA] = useState<A | null>(null);
  useEffect(() => {
    fetch('/api/proxy/admin/analytics', { cache: 'no-store' }).then(async (r) => {
      if (r.status === 401) { window.location.href = '/login'; return; }
      if (r.ok) setA(await r.json());
    });
  }, []);
  if (!a) return <p className="muted">بنحمّل...</p>;
  const cells: [string, string | number][] = [
    ['الجامعات', a.universities], ['المطاعم', a.canteens], ['الطلاب', a.students], ['الموظفين', a.staff],
    ['طلبات النهاردة', a.ordersToday], ['مبيعات النهاردة (طلبات مُسلَّمة)', `${(a.collectedTodayCents / 100).toFixed(2)} ج.م`],
  ];
  return (
    <>
      <div className="cols">
        {cells.map(([k, v]) => <div className="card" key={k}><div className="muted">{k}</div><h2 style={{ margin: '4px 0 0', color: 'var(--violet)' }}>{v}</h2></div>)}
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0, color: 'var(--violet)' }}>الطلبات حسب الحالة</h3>
        <p className="muted">{Object.entries(a.byStatus).map(([k, v]) => `${({ PENDING: 'جديد', PREPARING: 'بيتحضّر', READY: 'جاهز', COMPLETED: 'تم التسليم', CANCELLED: 'ملغي' } as Record<string, string>)[k] ?? k}: ${v}`).join(' — ') || 'لسه مفيش طلبات'}</p>
      </div>
    </>
  );
}
