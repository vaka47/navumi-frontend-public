import "@/app/globals.css";
import type { Metadata, Viewport } from "next";
import { HighlightInit } from '@highlight-run/next/client';
import { RootLayoutClient } from "@/components/monitoring/RootLayoutClient";
import Layout from "@/components/layout";
import { ErrorBoundary } from "@/components/monitoring/ErrorBoundary";
import { Suspense } from "react";
import { AuthProvider } from "@/context/AuthContext";
import DisableProdDebug from "@/components/monitoring/DisableProdDebug";





const APP_BASE = process.env.NEXT_PUBLIC_APP_BASE_URL || 'https://navumi.com';

const buildGlobalStructuredData = () => {
    const baseUrl = APP_BASE.replace(/\/+$/, '');
    const org = {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Navumi',
        url: baseUrl,
    };
    const website = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Navumi',
        url: baseUrl,
        potentialAction: {
            '@type': 'SearchAction',
            target: `${baseUrl}/search?query={search_term_string}`,
            'query-input': 'required name=search_term_string',
        },
    };
    return [org, website];
};

export const metadata: Metadata = {
    metadataBase: new URL(APP_BASE),
    title: "Navumi – Do you wanna camp?",
    description: "Платформа для поиска спортивных кэмпов и клубов",
    icons: {
        icon: { url: "/favicon.jpg", type: "image/jpeg" },
    },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
};

export default function RootLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
    const interClass = 'font-sans';
    const structuredData = buildGlobalStructuredData();
    return (
        <html lang="ru" style={{ touchAction: 'manipulation' }}>
        <head>
            <link rel="preconnect" href="https://storage.googleapis.com" crossOrigin="" />
            <link rel="preconnect" href="https://api.navumi.com" crossOrigin="" />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
            />
        </head>

        <body className={interClass}>
            {/* Safari/old browsers: soft polyfill for ResizeObserver to prevent runtime crash */}
            <script dangerouslySetInnerHTML={{ __html: `
                (function(){
                  try {
                    if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'undefined') {
                      window.ResizeObserver = function() { return { observe: function(){}, unobserve: function(){}, disconnect: function(){} }; };
                    }
                  } catch(e) {}
                })();
            ` }} />
            <script dangerouslySetInnerHTML={{ __html: `
                (function(){
                  var API_BASE = ${JSON.stringify(process.env.NEXT_PUBLIC_API_BASE_URL || '')};
                  var PROXY_PREFIX = '/api/navumi';
                  var API_PATH_PREFIX = '/api/';
                  var LOG_LABEL = '[navumi-fetch-proxy]';
                  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
                  var trimmed = (API_BASE || '').replace(/\\/+$/, '');
                  var onNavumiDomain = /\\.navumi\\.com$/i.test(window.location.hostname);
                  if (!trimmed && !onNavumiDomain) return;
                  if (window.__navumiFetchPatched) return;
                  window.__navumiFetchPatched = true;
                  var originalFetch = window.fetch;
                  // simple in-flight deduper for GETs (collapses bursts of identical requests)
                  var inflight = new Map(); // key -> { p: Promise<Response>, settled: boolean, t: number }
                  var inflightCleanupMs = 1500;
                  function now(){ return Date.now(); }
                  var originApiPrefix = window.location.origin + API_PATH_PREFIX;
                  function normalizePath(rest) {
                    if (!rest || rest === '/') return '/';
                    return rest.charAt(0) === '/' ? rest : '/' + rest;
                  }
                  function ensureApiTrailingSlash(s) {
                    if (!s) return s;
                    var i = s.indexOf('?');
                    var p = i >= 0 ? s.slice(0, i) : s;
                    if (p.indexOf(API_PATH_PREFIX) === 0 && !p.endsWith('/')) p = p + '/';
                    return i >= 0 ? (p + s.slice(i)) : p;
                  }
                  function toProxy(rest) {
                    var normalized = normalizePath(rest || '/');
                    normalized = ensureApiTrailingSlash(normalized);
                    if (normalized.indexOf(PROXY_PREFIX) === 0) return normalized;
                    return PROXY_PREFIX + normalized;
                  }
                  function rewriteUrl(url) {
                    if (!url) return null;
                    if (url.indexOf(PROXY_PREFIX) === 0 || url.indexOf(window.location.origin + PROXY_PREFIX) === 0) {
                      return null;
                    }
                    if (trimmed && url.indexOf(trimmed) === 0) {
                      var remainder = url.slice(trimmed.length) || '/';
                      // тяжёлые upload-эндпоинты (create-post / create-camp) оставляем прямыми,
                      // чтобы не упираться в лимит тела запроса Vercel-функций
                      if (/^\/api\/(create-post|create-camp)\//.test(remainder)) {
                        return null;
                      }
                      return toProxy(remainder);
                    }
                    if (url.indexOf(originApiPrefix) === 0) {
                      var rest = url.slice(originApiPrefix.length);
                      return toProxy(API_PATH_PREFIX + rest);
                    }
                    if (!/^https?:/i.test(url) && url.indexOf(API_PATH_PREFIX) === 0) {
                      var rel = url.slice(API_PATH_PREFIX.length);
                      return toProxy(API_PATH_PREFIX + rel);
                    }
                    return null;
                  }
                  try { console.info(LOG_LABEL, 'patch enabled', { trimmed: trimmed || null, onNavumiDomain }); } catch (_) {}
                  window.fetch = function(input, init) {
                    var proxied = null;
                    var method = (init && init.method) || 'GET';
                    try {
                      var url = '';
                      if (typeof input === 'string') url = input;
                      else if (input instanceof URL) url = input.href;
                      else if (input && typeof input.url === 'string') url = input.url;
                      proxied = rewriteUrl(url);
                      if (!proxied) return originalFetch.call(this, input, init);
                      try { console.debug(LOG_LABEL, 'proxy', { from: url, to: proxied }); } catch (_) {}
                      if (typeof input === 'string' || input instanceof URL) {
                        input = proxied;
                      } else if (input instanceof Request) {
                        var cloned = input.clone();
                        method = cloned.method || method;
                        input = new Request(proxied, {
                          method: cloned.method,
                          headers: cloned.headers,
                          body: cloned.body,
                          mode: cloned.mode,
                          credentials: cloned.credentials,
                          cache: cloned.cache,
                          redirect: cloned.redirect,
                          referrer: cloned.referrer,
                          referrerPolicy: cloned.referrerPolicy,
                          integrity: cloned.integrity,
                          keepalive: cloned.keepalive,
                          signal: cloned.signal,
                        });
                      } else {
                        input = proxied;
                      }
                    } catch (err) {
                      try { console.error(LOG_LABEL, 'proxy error', err); } catch (_) {}
                      return originalFetch.call(this, input, init);
                    }
                    // Dedupe only GET requests to our proxy path
                    try { method = (method || (init && init.method) || 'GET').toUpperCase(); } catch (_) {}
                    var isGet = method === 'GET';
                    var urlStr = (typeof input === 'string') ? input : ((input && typeof input.url === 'string') ? input.url : '');
                    var isProxyPath = (typeof urlStr === 'string' && urlStr.indexOf(PROXY_PREFIX) === 0);
                    if (isGet && isProxyPath) {
                      var canon = String(urlStr);
                      // нормализуем слэш в конце, чтобы 15 и 15/ считались одним ключом
                      if (canon.length > PROXY_PREFIX.length + 1 && canon.endsWith('/')) {
                        canon = canon.slice(0, -1);
                      }
                      var key = method + ' ' + canon;
                      var entry = inflight.get(key);
                      if (entry && entry.p) {
                        if (!entry.settled) {
                          try { console.debug(LOG_LABEL, 'dedupe', key); } catch(_){}
                          return entry.p.then(function(res){ return res.clone(); });
                        }
                        if (entry.settled && inflight.get(key) === entry) {
                          inflight.delete(key);
                        }
                      }
                      // ВАЖНО: используем canon только для ключа, но сам запрос оставляем как есть,
                      // чтобы не ломать завершающий слэш у REST-эндпоинтов (иначе будут 308/потеря тела у POST)
                      var p = originalFetch.call(this, input, init);
                      var record = { p: p, t: now(), settled: false };
                      inflight.set(key, record);
                      p.finally(function(){
                        record.settled = true;
                        setTimeout(function(){
                          if (inflight.get(key) === record) inflight.delete(key);
                        }, inflightCleanupMs);
                      });
                      return p;
                    }
                    return originalFetch.call(this, input, init);
                  };
                })();
            ` }} />
            <DisableProdDebug />
            <AuthProvider>

                <HighlightInit
                    projectId={'kgr042og'}
                    serviceName="navumi-frontend"
                    tracingOrigins
                    networkRecording={{
                        enabled: true,
                        recordHeadersAndBody: true,
                        urlBlocklist: [],
                    }}
                />
                <RootLayoutClient />
                <ErrorBoundary>
                    <Suspense fallback={null}>
                        <Layout>{children}</Layout>
                    </Suspense>
                    {modal}
                </ErrorBoundary>
            </AuthProvider>
        </body>
        </html>
    )
}
