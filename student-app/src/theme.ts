export const colors = { violet: '#4c1d95', violetDark: '#2e1065', gold: '#d4a017', bg: '#f6f3fb', card: '#ffffff', text: '#1f1b2e', muted: '#6b6580', red: '#b91c1c' };
export const STATUS_LABEL: Record<string, string> = {
  PENDING: 'مستني التأكيد', PREPARING: 'بيتحضّر', READY: 'جاهز، تعالى استلم', COMPLETED: 'تم الاستلام', CANCELLED: 'ملغي',
};
export const egp = (cents: number) => `${(cents / 100).toFixed(2)} ج.م`;
export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' });

export const hhmm = (m: number | null | undefined) => (m == null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
