/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Простая прокладка к GCS с корректным content-type + кэширование
const BUCKET = (process.env.NEXT_PUBLIC_GCS_BUCKET || 'navumi-media').replace(/\/+$/, '');
const MEDIA_BASE = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL || `https://storage.googleapis.com/${BUCKET}`).replace(/\/+$/, '');

const EXT_TO_CT: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.jpe': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.avif': 'image/avif', '.svg': 'image/svg+xml', '.bmp': 'image/bmp',
  '.tif': 'image/tiff', '.tiff': 'image/tiff', '.heic': 'image/heic',
};

function guessContentType(path: string): string {
  const m = path.toLowerCase().match(/\.[a-z0-9]+$/);
  if (!m) return 'image/*';
  return EXT_TO_CT[m[0]] || 'image/*';
}

export async function GET(req: Request, context: any) {
  try {
    const params = (context?.params?.path || []) as string[];
    const objectPath = params.join('/');
    const target = `${MEDIA_BASE}/${objectPath}`;

    const r = await fetch(target, { redirect: 'follow' });
    if (!r.ok || !r.body) {
      return NextResponse.json({ error: 'media_not_found', status: r.status }, { status: r.status || 502 });
    }

    const headers = new Headers(r.headers);
    // Проставим корректный Content-Type, если его нет/он общий
    const ct = headers.get('content-type');
    if (!ct || !/^image\//i.test(ct)) headers.set('content-type', guessContentType(objectPath));

    // Кэшируем агрессивно на CDN/браузере, но позволяем обновление через SWR
    headers.set('cache-control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
    headers.delete('content-length'); // стрим
    headers.set('x-media-proxy-target', target);

    return new NextResponse(r.body, { status: r.status, headers });
  } catch {
    return NextResponse.json({ error: 'media_proxy_error' }, { status: 502 });
  }
}