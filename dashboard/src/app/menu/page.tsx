'use client';
import { useCallback, useEffect, useState } from 'react';

type Item = { id: string; name: string; description: string; category: string; imageUrl: string | null; priceCents: number; offerPriceCents: number | null; available: boolean };
const CATEGORIES = ['سندوتشات', 'وجبات', 'مشروبات', 'حلويات', 'سناكس'];
export default function Menu() {
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/proxy/menu/mine', { cache: 'no-store' });
    if (r.status === 401) { window.location.href = '/login'; return; }
    if (r.ok) setItems(await r.json()); else setErr('مش قادر أجيب المنيو');
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(i: Item) {
    await fetch(`/api/proxy/menu/${i.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ available: !i.available }) });
    load();
  }
  async function remove(i: Item) {
    if (!confirm(`تحذف "${i.name}"؟ هيتشال من المنيو (الطلبات القديمة مش بتتأثر)`)) return;
    await fetch(`/api/proxy/menu/${i.id}`, { method: 'DELETE' });
    load();
  }
  async function edit(i: Item) {
    const price = prompt(`سعر "${i.name}" بالجنيه:`, (i.priceCents / 100).toString());
    if (price == null) return;
    const p = Number(price);
    if (!(p > 0)) { setErr('السعر لازم يكون أكبر من صفر'); return; }
    const r = await fetch(`/api/proxy/menu/${i.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ priceCents: Math.round(p * 100) }) });
    if (r.ok) { setErr(''); load(); } else setErr('ما اتحفظش السعر');
  }
  async function offer(i: Item) {
    const v = prompt(`سعر العرض لـ "${i.name}" بالجنيه (لازم أقل من ${(i.priceCents / 100).toFixed(2)}). سيبيه فاضي لإلغاء العرض:`, i.offerPriceCents ? (i.offerPriceCents / 100).toString() : '');
    if (v == null) return;
    const p = v.trim() === '' ? null : Math.round(Number(v) * 100);
    if (p !== null && !(p > 0 && p < i.priceCents)) { setErr('سعر العرض لازم يكون أقل من السعر الأصلي'); return; }
    const r = await fetch(`/api/proxy/menu/${i.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ offerPriceCents: p }) });
    if (r.ok) { setErr(''); load(); } else setErr('ما اتحفظش العرض');
  }
  async function upload(i: Item, file: File | null) {
    if (!file) return;
    const form = new FormData();
    form.append('image', file);
    const r = await fetch(`/api/proxy/menu/${i.id}/image`, { method: 'POST', body: form });
    if (r.ok) { setErr(''); load(); } else setErr((await r.json().catch(() => ({}))).message ?? 'الصورة ما اترفعتش');
  }
  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const price = Number(f.get('price'));
    if (!(price > 0)) { setErr('السعر لازم يكون أكبر من صفر'); return; }
    const r = await fetch('/api/proxy/menu', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: String(f.get('name')).trim(), priceCents: Math.round(price * 100),
        description: String(f.get('description') ?? '').trim(), category: String(f.get('category') ?? ''),
      }),
    });
    if (r.ok) { form.reset(); setErr(''); load(); } else setErr('ما اتضافش الصنف، راجع البيانات');
  }

  const byCat = CATEGORIES.map((cat) => ({ cat, list: items.filter((i) => i.category === cat) })).filter((g) => g.list.length);
  const uncategorized = items.filter((i) => !CATEGORIES.includes(i.category));
  return (
    <>
      <form onSubmit={add} className="card" style={{ display: 'grid', gap: 8 }}>
        <div className="addrow" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8 }}>
          <input name="name" placeholder="اسم الصنف" required minLength={2} maxLength={80} />
          <input name="price" type="number" step="0.5" min="0.5" placeholder="السعر (ج.م)" required />
          <select name="category" defaultValue="سندوتشات" style={{ padding: 10, borderRadius: 10 }}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <button className="gold">إضافة</button>
        </div>
        <input name="description" placeholder="وصف قصير (اختياري)" maxLength={300} />
      </form>
      {err && <p className="err">{err}</p>}
      {[...byCat, ...(uncategorized.length ? [{ cat: 'أخرى', list: uncategorized }] : [])].map((g) => (
        <section key={g.cat}>
          <h2 style={{ color: 'var(--violet)' }}>{g.cat}</h2>
          {g.list.map((i) => (
            <div className="card" key={i.id}>
              <div className="row">
                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {i.imageUrl && <img src={i.imageUrl} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8 }} />}
                  <span><b>{i.name}</b> <span className="muted">— {i.offerPriceCents ? <><s>{(i.priceCents / 100).toFixed(2)}</s> <b style={{ color: 'var(--violet)' }}>{(i.offerPriceCents / 100).toFixed(2)} ج.م (عرض)</b></> : `${(i.priceCents / 100).toFixed(2)} ج.م`}</span>
                    {i.description && <div className="muted">{i.description}</div>}</span>
                </span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <label style={{ cursor: 'pointer', color: 'var(--violet)', textDecoration: 'underline' }}>
                    صورة
                    <input type="file" accept=".jpg,.jpeg,.png,.webp" hidden onChange={(e) => upload(i, e.target.files?.[0] ?? null)} />
                  </label>
                  <button onClick={() => edit(i)}>السعر</button>
                  <button onClick={() => offer(i)}>عرض</button>
                  <button className={i.available ? '' : 'ghost'} onClick={() => toggle(i)}>{i.available ? 'متاح' : 'غير متاح'}</button>
                  <button className="ghost" onClick={() => remove(i)}>حذف</button>
                </span>
              </div>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
