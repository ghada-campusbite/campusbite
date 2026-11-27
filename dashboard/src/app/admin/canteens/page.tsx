'use client';
import { useCallback, useEffect, useState } from 'react';

type Uni = { id: string; name: string; campuses?: { id: string; name: string }[] };
type Canteen = { id: string; name: string; active: boolean; university: { name: string }; staff: { id: string; name: string; email: string; suspendedAt: string | null }[]; _count: { items: number; orders: number } };

export default function Canteens() {
  const [list, setList] = useState<Canteen[]>([]);
  const [unis, setUnis] = useState<Uni[]>([]);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const [r1, r2] = await Promise.all([fetch('/api/proxy/admin/canteens', { cache: 'no-store' }), fetch('/api/proxy/admin/universities', { cache: 'no-store' })]);
    if (r1.status === 401) { window.location.href = '/login'; return; }
    if (r1.ok) setList(await r1.json());
    if (r2.ok) setUnis(await r2.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await fetch('/api/proxy/admin/canteens', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify((() => {
        const campusId = String(f.get('campusId') || '');
        const uni = campusId ? unis.find((u) => u.campuses?.some((c) => c.id === campusId))?.id : String(f.get('universityId'));
        return { name: String(f.get('name')).trim(), universityId: uni, ...(campusId ? { campusId } : {}), prepMinutes: Number(f.get('prepMinutes')) };
      })()),
    });
    if (r.ok) { (e.target as HTMLFormElement).reset(); load(); } else setErr('ما اتضافش');
  }
  async function toggle(c: Canteen) {
    await fetch(`/api/proxy/admin/canteens/${c.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ active: !c.active }) });
    load();
  }
  async function addStaff(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await fetch('/api/proxy/admin/staff', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ canteenId: f.get('canteenId'), email: f.get('email'), name: f.get('staffName'), password: f.get('password') }),
    });
    if (r.ok) { form.reset(); setErr(''); load(); } else setErr((await r.json().catch(() => ({}))).message ?? 'ما اتضافش الموظف');
  }
  async function toggleUser(id: string, suspended: boolean) {
    await fetch(`/api/proxy/admin/users/${id}/${suspended ? 'unsuspend' : 'suspend'}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' });
    load();
  }
  return (
    <>
      <form className="card" onSubmit={add} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input name="name" placeholder="اسم المطعم" required minLength={2} maxLength={120} style={{ flex: 1 }} />
        <select name="universityId" required style={{ padding: 10, borderRadius: 10 }}>
          {unis.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select name="campusId" defaultValue="" title="المجمع (اختياري)" style={{ padding: 10, borderRadius: 10 }}>
          <option value="">من غير مجمع</option>
          {unis.flatMap((u) => (u.campuses ?? []).map((c) => <option key={c.id} value={c.id}>{u.name} / {c.name}</option>))}
        </select>
        <input name="prepMinutes" type="number" min={1} max={120} defaultValue={10} title="وقت التحضير بالدقائق" style={{ width: 110 }} />
        <button className="gold">إضافة</button>
      </form>
      {err && <p className="err">{err}</p>}
      {list.map((c) => (
        <div className="card" key={c.id} style={c.active ? {} : { opacity: 0.6 }}>
          <div className="row">
            <b>{c.name}</b>
            <span>
              <span className="muted">{c.university.name} — {c._count.items} صنف، {c._count.orders} طلب </span>
              <button className={c.active ? 'ghost' : 'gold'} onClick={() => toggle(c)}>{c.active ? 'إيقاف' : 'تشغيل'}</button>
            </span>
          </div>
          {c.staff.map((s) => (
            <div className="row" key={s.id}>
              <span>{s.name} <span className="muted">({s.email}){s.suspendedAt ? ' — موقوف' : ''}</span></span>
              <button className="ghost" onClick={() => toggleUser(s.id, !!s.suspendedAt)}>{s.suspendedAt ? 'فك الإيقاف' : 'إيقاف'}</button>
            </div>
          ))}
          <form onSubmit={addStaff} style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <input type="hidden" name="canteenId" value={c.id} />
            <input name="staffName" placeholder="اسم الموظف" required minLength={2} style={{ width: 140 }} />
            <input name="email" type="email" placeholder="الإيميل" required style={{ flex: 1 }} />
            <input name="password" type="password" placeholder="باسورد 12+ حرف" required minLength={12} style={{ width: 150 }} autoComplete="new-password" />
            <button>+ موظف</button>
          </form>
        </div>
      ))}
    </>
  );
}
