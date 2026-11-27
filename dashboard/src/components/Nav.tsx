'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

function role() {
  if (typeof document === 'undefined') return '';
  return document.cookie.split('; ').find((c) => c.startsWith('cb_role='))?.split('=')[1] ?? '';
}

export default function Nav() {
  const path = usePathname();
  const router = useRouter();
  if (path === '/login' || path === '/forgot') return null;
  const isAdmin = role() === 'ADMIN';
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }
  return (
    <nav>
      <b>Campus<span style={{ color: '#d4a017' }}>Bite</span></b>
      {isAdmin ? (
        <>
          <Link href="/admin">نظرة عامة</Link>
          <Link href="/admin/universities">الجامعات</Link>
          <Link href="/admin/canteens">المطاعم</Link>
          <Link href="/admin/students">الطلاب</Link>
          <Link href="/admin/orders">الطلبات</Link>
          <Link href="/admin/settings">إعدادات المنصة</Link>
        </>
      ) : (
        <>
          <Link href="/">الطلبات</Link>
          <Link href="/menu">المنيو</Link>
          <Link href="/settings">الإعدادات</Link>
        </>
      )}
      <button onClick={logout}>خروج</button>
    </nav>
  );
}
