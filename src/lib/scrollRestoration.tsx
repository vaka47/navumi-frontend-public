'use client';

import React from 'react';

const KEY_PREFIX = 'scroll:';

export function saveMainScroll() {
  if (typeof window === 'undefined') return;
  try {
    const el = document.getElementById('app-main');
    if (!el) return;
    const key = KEY_PREFIX + window.location.pathname;
    const top = (el as HTMLElement).scrollTop || 0;
    sessionStorage.setItem(key, String(top));
  } catch {}
}

// Сохраняем путь текущей страницы для ручного возврата (SPA-навигация не меняет document.referrer)
export function savePrevPath(key = 'nav:last') {
  if (typeof window === 'undefined') return;
  try {
    const path = window.location.pathname + window.location.search + window.location.hash;
    sessionStorage.setItem(key, path);
  } catch {}
}

// React node that restores scroll for current pathname when mounted or when pathname changes
export function restoreMainScroll(pathname: string | null) {
  if (typeof window === 'undefined') return null;
  // Use a component to run an effect tied to pathname changes
  const Effect: React.FC<{ path: string | null }> = ({ path }) => {
    React.useEffect(() => {
      if (!path) return;
      try {
        const key = KEY_PREFIX + path;
        const v = sessionStorage.getItem(key);
        if (v != null) {
          const el = document.getElementById('app-main');
          if (el) {
            // apply immediately without smooth behavior
            const root = document.documentElement;
            const prev = root.style.scrollBehavior;
            root.style.scrollBehavior = 'auto';
            (el as HTMLElement).scrollTop = Number(v) || 0;
            // restore behavior next frame
            requestAnimationFrame(() => { root.style.scrollBehavior = prev; });
          }
          // one-time restore for this path
          sessionStorage.removeItem(key);
        }
      } catch {}
    }, [path]);
    return null;
  };
  return React.createElement(Effect, { path: pathname });
}
