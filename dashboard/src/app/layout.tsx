import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import './globals.css';

export const metadata: Metadata = { title: 'CampusBite | لوحة المطعم' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body><Nav /><main>{children}</main></body>
    </html>
  );
}
