export function getBrowserApiBase(): string {
  const fallback = '/api/navumi';
  const env = process.env.NEXT_PUBLIC_API_BASE_URL;

  try {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname.toLowerCase();
      if (host === 'navumi.com' || host.endsWith('.navumi.com')) {
        return fallback;
      }
    }
  } catch {
    // ignore
  }

  return (env || fallback).replace(/\/+$/, '');
}

