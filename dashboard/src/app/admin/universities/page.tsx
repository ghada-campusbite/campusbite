'use client';
import { useCallback, useEffect, useState } from 'react';

type Uni = { campuses: { id: string; name: string }[]; id: string; name: string; breaks: { id: string; startMin: number; endMin: number }[]; _count: { canteens: number } };
const t = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

export default function Universities() {
  const [list, setList] = useState<Uni[]>([]);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const r = await fetch('/api/proxy/admin/universities', { cache: 'no-store' });
    if (r.status === 401) { window.location.href = '/login'; return; }
    if (r.ok) setList(await r.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await fetch('/api/proxy/admin/universities', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: String(f.get('name')).trim() }) });
    if (r.ok) { (e.target as HTMLFormElement).reset(); setErr(''); load(); } else setErr('ما اتضافتش');
  }
  async function addCampus(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await fetch('/api/proxy/admin/campuses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ universityId: f.get('universityId'), name: String(f.get('name')).trim() }) });
    if (r.ok) { (e.target as HTMLFormElement).reset(); setErr(''); load(); } else setErr('المجمع ما اتضافش');
  }
  async function addBreak(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await fetch('/api/proxy/admin/breaks', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ universityId: f.get('universityId'), startMin: toMin(String(f.get('start'))), endMin: toMin(String(f.get('end'))) }),
    });
    if (r.ok) { setErr(''); load(); } else setErr('راجع المعاد (النهاية بعد البداية)');
  }
  return (
    <>
      <form className="card" onSubmit={add} style={{ display: 'flex', gap: 8 }}>
        <input name="name" placeholder="اسم الجامعة / المجمع" required minLength={2} maxLength={120} />
        <button className="gold">إضافة</button>
      </form>
      {err && <p className="err">{err}</p>}
      {list.map((u) => (
        <div className="card" key={u.id}>
          <div className="row"><b>{u.name}</b><span className="muted">{u._count.canteens} مطعم</span></div>
          <p className="muted">البريكات: {u.breaks.length ? u.breaks.map((b) => `${t(b.startMin)}–${t(b.endMin)}`).join('، ') : 'لسه مفيش'}</p>
          <p className="muted">المجمعات: {u.campuses.length ? u.campuses.map((c) => c.name).join('، ') : 'لسه مفيش'}</p>
          <form onSubmit={addCampus} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input type="hidden" name="universityId" value={u.id} />
            <input name="name" placeholder="اسم المجمع" required minLength={2} maxLength={120} />
            <button>+ مجمع</button>
          </form>
          <form onSubmit={addBreak} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="hidden" name="universityId" value={u.id} />
            <input name="start" type="time" required style={{ width: 120 }} />
            <input name="end" type="time" required style={{ width: 120 }} />
            <button>+ بريك</button>
          </form>
        </div>
      ))}
    </>
  );
}
