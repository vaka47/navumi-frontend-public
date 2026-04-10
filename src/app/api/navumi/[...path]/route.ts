/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Надёжный базовый адрес бэка, даже если переменная окружения не задана
const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_BASE_URL ||
  'https://api.navumi.com'
).replace(/\/+$/, '');

const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

async function handleProxy(req: Request, params: { path?: string[] }) {
  if (!API_BASE) {
    return NextResponse.json({ error: 'API base URL is not configured' }, { status: 500 });
  }

  const pathSegments = Array.isArray(params?.path) ? params.path : [];
  let targetPath = pathSegments.join('/');
  // Django-стиль: у REST-эндпоинтов должен быть завершающий '/'.
  // Если путь без расширения и без завершающего '/', добавим его.
  // Это покрывает и api/..., и camp/..., и subscribe/... и т.п.
  const hasExt = /\.[a-z0-9]+$/i.test(targetPath);
  if (!hasExt && !targetPath.endsWith('/')) {
    targetPath += '/';
  }
  const currentUrl = new URL(req.url);
  const targetUrl = `${API_BASE}/${targetPath}${currentUrl.search}`;

  const method = req.method.toUpperCase();
  const hasBody = !['GET', 'HEAD'].includes(method);
  const body = hasBody ? await req.arrayBuffer() : undefined;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (hopByHopHeaders.has(key.toLowerCase())) return;
    if (key.toLowerCase() === 'host') return;
    headers.set(key, value);
  });

  // Keep origin consistent with upstream host to avoid CORS/csrf surprises
  try {
    const apiOrigin = new URL(API_BASE);
    // Не перезаписываем Origin, если он уже проставлен браузером — это важно для CSRF.
    if (!headers.has('origin')) headers.set('origin', apiOrigin.origin);
  } catch {
    // ignore
  }

  if (body && !headers.has('content-type')) {
    headers.set('content-type', 'application/octet-stream');
  }

  const upstreamResponse = await fetch(targetUrl, {
    method,
    headers,
    body,
    redirect: 'follow',
  });

  const responseHeaders = new Headers();
  upstreamResponse.headers.forEach((value, key) => {
    if (hopByHopHeaders.has(key.toLowerCase())) return;
    responseHeaders.append(key, value);
  });

  // Next.js already sets its own content-length
  responseHeaders.delete('content-length');
  responseHeaders.delete('content-encoding');

  // Пробрасываем диагностический заголовок для быстрой проверки в Network
  responseHeaders.set('x-navumi-proxy-target', targetUrl);

  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

async function withParams(context: any) {
  if (context && typeof context.params?.then === 'function') {
    return (await context.params) ?? {};
  }
  return (context && context.params) || {};
}

export async function GET(req: Request, context: any) {
  const params = await withParams(context);
  return handleProxy(req, params);
}

export async function POST(req: Request, context: any) {
  const params = await withParams(context);
  return handleProxy(req, params);
}

export async function PUT(req: Request, context: any) {
  const params = await withParams(context);
  return handleProxy(req, params);
}

export async function DELETE(req: Request, context: any) {
  const params = await withParams(context);
  return handleProxy(req, params);
}

export async function PATCH(req: Request, context: any) {
  const params = await withParams(context);
  return handleProxy(req, params);
}

export async function OPTIONS(req: Request, context: any) {
  const params = await withParams(context);
  return handleProxy(req, params);
}

export async function HEAD(req: Request, context: any) {
  const params = await withParams(context);
  return handleProxy(req, params);
}
