export function cairoMinutes(d: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return get('hour') * 60 + get('minute');
}

const DAY_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

// UTC instant of 00:00 today in Africa/Cairo, without hardcoding the +02/+03 DST offset
export function cairoDayStartUtc(d: Date) {
  const parts = (t: number) => Object.fromEntries(DAY_FMT.formatToParts(new Date(t)).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  const now = parts(d.getTime());
  const target = `${now.year}-${now.month}-${now.day}`;
  // guess 4h before wall-clock midnight UTC, then walk forward; Cairo offset is always within 0..4h
  let t = Date.UTC(+now.year, +now.month - 1, +now.day) - 4 * 3_600_000;
  for (let i = 0; i < 16; i++) {
    const p = parts(t);
    if (`${p.year}-${p.month}-${p.day}` === target && p.hour === '00' && p.minute === '00') return new Date(t);
    t += 30 * 60_000;
  }
  throw new Error('could not resolve Cairo day start');
}
