import { NextRequest, NextResponse } from 'next/server';

function isMobileUA(ua: string): boolean {
  const s = ua || '';
  return /Mobi|Android|iPhone|iPad|iPod|Mobile/i.test(s);
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const ua = req.headers.get('user-agent') || '';
  const mobile = isMobileUA(ua);

  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/navumi/')) {
    const url = req.nextUrl.clone();
    const rest = pathname.slice(4) || '/'; // начинается с '/'
    const q = url.search || '';
    // Обеспечиваем завершающий слэш для REST-путей (без расширения)
    const pathOnly = rest;
    const needsSlash = !pathOnly.endsWith('/') && !pathOnly.includes('.') && !pathOnly.endsWith('/_next');
    const normalized = needsSlash ? (pathOnly + '/') : pathOnly;
    url.pathname = `/api/navumi/api${normalized}`;
    // search сохранится из url
    return NextResponse.rewrite(url);
  }

  // /m/:username/post/:postId → /:username/post/:postId on desktop
  const m = pathname.match(/^\/m\/([^/]+)\/post\/([^/]+)\/?$/);
  if (m && !mobile) {
    const target = `/${m[1]}/post/${m[2]}${search || ''}`;
    const url = new URL(target, req.url);
    return NextResponse.rewrite(url);
  }

  // /:username/post/:postId → /m/:username/post/:postId on mobile
  const d = pathname.match(/^\/([^/]+)\/post\/([^/]+)\/?$/);
  if (d && mobile) {
    const target = `/m/${d[1]}/post/${d[2]}${search || ''}`;
    const url = new URL(target, req.url);
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/m/:username/post/:postId',
    '/:username/post/:postId',
    '/api/:path*',
  ],
};
