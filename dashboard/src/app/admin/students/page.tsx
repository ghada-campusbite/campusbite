'use client';
import { useCallback, useEffect, useState } from 'react';

type Student = { id: string; email: string; name: string; emailVerifiedAt: string | null; suspendedAt: string | null; createdAt: string; _count: { orders: number } };

export default function Students() {
  const [list, setList] = useState<Student[]>([]);
  const [q, setQ] = useState('');
  const load = useCallback(async (query: string) => {
    const r = await fetch(`/api/proxy/admin/students${query ? `?q=${encodeURIComponent(query)}` : ''}`, { cache: 'no-store' });
    if (r.status === 401) { window.location.href = '/login'; return; }
    if (r.ok) setList(await r.json());
  }, []);
  useEffect(() => { const t = setTimeout(() => load(q), 300); return () => clearTimeout(t); }, [q, load]);

  async function toggle(s: Student) {
    await fetch(`/api/proxy/admin/users/${s.id}/${s.suspendedAt ? 'unsuspend' : 'suspend'}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' });
    load(q);
  }
  return (
    <>
      <input placeholder="دور بالاسم أو الإيميل..." value={q} onChange={(e) => setQ(e.target.value)} className="card" style={{ width: '100%' }} />
      {list.map((s) => (
        <div className="card row" key={s.id}>
          <span>
            <b>{s.name}</b> <span className="muted">({s.email})</span>
            <span className="muted"> — {s._count.orders} طلب{s.emailVerifiedAt ? '' : ' — إيميل مش مفعّل'}{s.suspendedAt ? ' — موقوف' : ''}</span>
          </span>
          <button className={s.suspendedAt ? 'gold' : 'ghost'} onClick={() => toggle(s)}>{s.suspendedAt ? 'فك الإيقاف' : 'إيقاف'}</button>
        </div>
      ))}
    </>
  );
}
