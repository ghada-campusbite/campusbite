import { NextRequest, NextResponse } from 'next/server';
import { API } from '@/lib/server';

// menu images are served by the API from the database at /menu/:id/image;
// expose them same-origin so the dashboard's <img> tags work without CORS
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!/^[0-9a-fA-F-]{36}$/.test(params.id)) return new NextResponse(null, { status: 404 });
  const r = await fetch(`${API}/menu/${params.id}/image`, { cache: 'no-store' });
  if (!r.ok) return new NextResponse(null, { status: r.status });
  return new NextResponse(Buffer.from(await r.arrayBuffer()), {
    headers: { 'content-type': r.headers.get('content-type') ?? 'image/jpeg', 'cache-control': 'public, max-age=60' },
  });
}
