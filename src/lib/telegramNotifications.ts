'use client';

import { getBrowserApiBase } from '@/lib/apiBase';
import { ensureCsrfUpToDate } from '@/lib/csrf';

export async function startTelegramLinkFlow(): Promise<void> {
  const apiBase = getBrowserApiBase().replace(/\/+$/, '');
  const token = await ensureCsrfUpToDate(apiBase);

  // iOS Safari и некоторые мобильные браузеры блокируют window.open,
  // если оно вызывается не в прямом обработчике клика. Поэтому
  // сразу открываем «пустое» окно/вкладку в ответ на клик и потом
  // уже меняем location, когда получим URL от бэкенда.
  let popup: Window | null = null;
  if (typeof window !== 'undefined') {
    try {
      popup = window.open('', '_blank');
    } catch {
      popup = null;
    }
  }

  try {
    const res = await fetch(`${apiBase}/api/telegram/link-start/`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRFToken': token,
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      if (popup) {
        try { popup.close(); } catch { /* noop */ }
      }
      return;
    }

    const data = await res.json().catch(() => ({}));
    const url = typeof (data as { url?: unknown })?.url === 'string' ? (data as { url: string }).url : null;
    if (!url || typeof window === 'undefined') {
      if (popup) {
        try { popup.close(); } catch { /* noop */ }
      }
      return;
    }

    try {
      if (popup) {
        popup.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch {
      try {
        window.location.href = url;
      } catch {
        // ignore
      }
    }
  } catch {
    if (popup) {
      try { popup.close(); } catch { /* noop */ }
    }
  }
}

export async function disableTelegramNotifications(): Promise<boolean> {
  const apiBase = getBrowserApiBase().replace(/\/+$/, '');
  const token = await ensureCsrfUpToDate(apiBase);

  try {
    const res = await fetch(`${apiBase}/api/telegram/disable/`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRFToken': token,
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    return Boolean((data as { success?: boolean }).success);
  } catch {
    return false;
  }
}
