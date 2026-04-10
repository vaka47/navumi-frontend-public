'use client';

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, Target, Send, Phone as PhoneIcon, Globe } from 'lucide-react';
import type { Camp } from './CampInfoSwitcher';
import { parseDateYYYYMMDD, formatRuDateRange } from '@/utils/safeDate';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import CampPostCreateDesktopModal from '@/components/camp/CreateCampPostModalDesktop';
import CreateCampPostMobile from '@/components/camp/CreateCampPostMobile';
import CampFeedTabs, { type CampFeedTab } from './CampFeedTabs';
import { createPortal } from 'react-dom';
import CreatePostModal from '@/components/post/CreatePostModal';
import ReportAbuseModal from '@/components/common/ReportModal';
import { useAuth } from '@/context/AuthContext';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import SmartImage from '@/components/SmartImage';
import { hasTemporaryToken } from '@/lib/checkTemporaryToken';
import CompleteProfileActionModal from '@/components/CompleteProfileActionModal';
import { absUrl, pickImageArray } from '@/components/camp/campNormalize';
import Link from 'next/link';
import { consumeReturn, navigateBack, rememberReturn, rememberHere } from '@/lib/navBack';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';
import { useLayerStack } from '@/context/LayerStackContext';
import { useSearchOverlay } from '@/hooks/useSearchOverlay';
import { useAppNavigation } from '@/hooks/useAppNavigation';
import { getBrowserApiBase } from '@/lib/apiBase';
import { startTelegramLinkFlow } from '@/lib/telegramNotifications';
import MentionedProfileInline from '@/components/post/MentionedProfileInline';


type CampDebug = {
  scroll: () => void;
  dump: () => void;
};

declare global {
  interface Window {
    google?: typeof google;
    __campDebug?: CampDebug;
  }
}

const API = getBrowserApiBase();

const FEED_TAB_VALUES: readonly CampFeedTab[] = ['comments', 'posts', 'marks', 'subscribers'];
type Tab = CampFeedTab | 'feed';
const LEGACY_FEED_TAB_ALIASES: Record<string, CampFeedTab> = { info: 'comments', feed: 'comments' };

const normalizeStoredFeedTab = (value: unknown): CampFeedTab | null => {
  if (typeof value !== 'string') return null;
  const candidate = LEGACY_FEED_TAB_ALIASES[value] ?? (value as CampFeedTab);
  return (FEED_TAB_VALUES as readonly string[]).includes(candidate) ? candidate : null;
};


// ↓ где-нибудь над export default function CampInfo …
function formatDot(d?: Date | null): string {
  if (!d) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}


function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const cs = getComputedStyle(node);
    const oy = cs.overflowY;
    const ox = cs.overflowX;
    const isScrollable =
      (oy === 'auto' || oy === 'scroll' || oy === 'overlay' || oy === 'hidden') && node.scrollHeight > node.clientHeight + 1 ||
      (ox === 'auto' || ox === 'scroll' || ox === 'overlay') && node.scrollWidth > node.clientWidth + 1;
    if (isScrollable) return node;
    node = node.parentElement;
  }
  return null; // → значит, скроллит окно/документ
}


function CampActionSheet({
  open,
  canReport,
  canDelete,
  canShare,
  onClose,
  onReport,
  onDelete,
  onShare,
}: {
  open: boolean;
  canReport?: boolean;
  canDelete?: boolean;
  canShare?: boolean;
  onClose: () => void;
  onReport?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onShare?: () => void | Promise<void>;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!open || !mounted) return null;

  const doAndClose = (fn?: () => void | Promise<void>) => async () => { try { await fn?.(); } finally { onClose(); } };

  const actions: { key: string; label: string; destructive?: boolean; fn?: () => void | Promise<void> }[] = [];

  if (canShare && onShare) {
    actions.push({ key: 'share', label: 'Поделиться кэмпом', fn: onShare });
  }

  if (canReport && onReport) {
    actions.push({ key: 'report', label: 'Пожаловаться', destructive: true, fn: onReport });
  }

  if (canDelete && onDelete) {
    actions.push({ key: 'delete', label: 'Удалить', destructive: true, fn: onDelete });
  }

  const node = (
    <div className="fixed inset-0 z-[20000] bg-black/40 flex items-center justify-center px-4"
      role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-[min(540px,92vw)] rounded-[24px] bg-white shadow-xl overflow-hidden">
        {actions.map((action, index) => (
          <React.Fragment key={action.key}>
            <button
              className={[
                'w-full py-4 text-[17px] font-semibold',
                action.destructive ? 'text-red-600 hover:bg-red-50' : 'hover:bg-gray-50',
              ].join(' ')}
              onClick={doAndClose(action.fn)}
            >
              {action.label}
            </button>
            {index < actions.length - 1 && <div className="h-px bg-gray-200" />}
          </React.Fragment>
        ))}
        <button className="w-full py-4 text-[17px] hover:bg-gray-50" onClick={onClose}>Отмена</button>
      </div>
    </div>
  );
  return createPortal(node, document.body);
}

function ConfirmModal({
  open, title, message, cancelLabel = 'Отмена', confirmLabel = 'Да', onCancel, onConfirm,
}: {
  open: boolean; title: string; message?: React.ReactNode;
  cancelLabel?: string; confirmLabel?: string;
  onCancel: () => void; onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
      if ((e.key === 'Enter' || e.key === 'NumpadEnter') && !busy) {
        e.preventDefault();
        void handleConfirm();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy]);

  if (!open) return null;

  const handleConfirm = async () => {
    try { setBusy(true); await onConfirm(); onCancel(); }
    finally { setBusy(false); }
  };

  const node = (
    <div className="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center px-4"
      onClick={(e) => { if (busy) return; if (e.target === e.currentTarget) onCancel(); }}>
      <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-lg">
        <h2 className="text-base font-semibold mb-2">{title}</h2>
        {message && <p className="text-sm text-gray-600 mb-4">{message}</p>}
        <div className="flex justify-end gap-3">
          <button className="text-sm text-gray-600 hover:text-black" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button className="text-sm font-semibold text-red-600 hover:text-red-700" onClick={handleConfirm} disabled={busy}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
  if (typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}



function SmartDateRange({
  start,
  end,
  long,
  className = '',
}: {
  start: Date | null | undefined;
  end: Date | null | undefined;
  long?: string | null;
  className?: string;
}) {
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const measureRef = React.useRef<HTMLSpanElement | null>(null);
  const [useShort, setUseShort] = React.useState(false);

  const longText = long ?? '';
  const shortText = React.useMemo(() => {
    if (!start && !end) return '';
    const a = formatDot(start);
    const b = formatDot(end);
    return end ? `${a} - ${b}` : a;
  }, [start, end]);

  const recompute = React.useCallback(() => {
    const box = boxRef.current;
    const m = measureRef.current;
    if (!box || !m) return;
    // если длинный вариант шире доступной ширины контейнера — переключаемся на короткий
    const willOverflow = m.scrollWidth > box.clientWidth + 1;
    setUseShort(willOverflow);
  }, []);

  React.useLayoutEffect(() => {
    recompute();
  }, [recompute, longText, shortText]);

  React.useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(recompute);
    ro.observe(box);
    return () => ro.disconnect();
  }, [recompute]);

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <span className="whitespace-nowrap truncate" title={longText}>
        {useShort ? shortText : longText}
      </span>
      {/* Невидимый измеритель длинного текста с теми же стилями шрифта */}
      <span
        ref={measureRef}
        className="absolute invisible whitespace-nowrap pointer-events-none"
      >
        {longText}
      </span>
    </div>
  );
}



const AVATAR_PLACEHOLDER_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || '') + '/avatars/question3.jpg';

function AvatarImg({ src, alt, className = '' }: { src?: string | null; alt: string; className?: string }) {
  const [broken, setBroken] = React.useState(false);
  const fallback = React.useMemo(() => {
    if (typeof window === 'undefined') return AVATAR_PLACEHOLDER_PATH;
    try { return new URL(AVATAR_PLACEHOLDER_PATH, window.location.origin).href; }
    catch { return AVATAR_PLACEHOLDER_PATH; }
  }, []);
  const safe = !src || broken ? fallback : src;
  return (
    <img
      src={safe}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => { if (safe !== fallback) setBroken(true); }}
    />
  );
}




// === Список лайкнувших ===
type SimpleUser = { id: number; username: string; avatar: string | null };
type LikeSource =
  | { kind: 'comment'; id: number }
  | { kind: 'post'; campId: number; id: number }
  | { kind: 'camp'; campId: number };

function CampLikersModal({
  campId,
}: {
  campId: number;
}) {
  const [items, setItems] = React.useState<SimpleUser[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const { navigateProfile } = useAppNavigation();
  const { close } = useOverlayEnvironment();

  const normalize = (j: unknown): SimpleUser[] => {
    type MaybeLists = { results?: unknown; users?: unknown; likers?: unknown; data?: unknown };
    const root = (j ?? {}) as MaybeLists;

    const arr: unknown[] =
      Array.isArray(j) ? (j as unknown[]) :
        Array.isArray(root.results) ? (root.results as unknown[]) :
          Array.isArray(root.users) ? (root.users as unknown[]) :
            Array.isArray(root.likers) ? (root.likers as unknown[]) :
              Array.isArray(root.data) ? (root.data as unknown[]) :
                [];

    const usernameFrom = (o?: UnknownRecord | null) =>
      o ? (pickString(o, ['username', 'login', 'nick', 'name']) ?? null) : null;

    const avatarFrom = (o?: UnknownRecord | null) =>
      o ? absUrl(
        pickString(o, [
          'avatar', 'avatar_url', 'profile_picture', 'profilePicture',
          'photo', 'photo_url', 'image', 'picture'
        ]) ?? undefined
      ) : null;

    return arr
      .map((raw) => {
        const u = raw as UnknownRecord;

        // возможные вложенности: user/author/profile/owner/liker/account
        const nested =
          (u['user'] as UnknownRecord | undefined) ??
          (u['author'] as UnknownRecord | undefined) ??
          (u['profile'] as UnknownRecord | undefined) ??
          (u['owner'] as UnknownRecord | undefined) ??
          (u['liker'] as UnknownRecord | undefined) ??
          (u['account'] as UnknownRecord | undefined);

        const id =
          asNumber(u['id']) ??
          asNumber(u['pk']) ??
          asNumber(u['user_id']) ??
          (nested ? asNumber(nested['id']) : null) ?? 0;

        const username =
          usernameFrom(u) ??
          usernameFrom(nested) ??
          '';

        const avatar =
          avatarFrom(u) ??
          avatarFrom(nested);

        return { id, username, avatar: avatar ?? null } as SimpleUser;
      })
      .filter(x => !!x.username);
  };




  React.useEffect(() => {
    if (!API || !campId) return;
    let cancelled = false;
    (async () => {
      setErr(null);
      setItems(null);
      const urls: string[] = [
        `${API}/api/camps/${campId}/likers/`,
        `${API}/api/camps/${campId}/likes/`,
        `${API}/api/camps/${campId}/liked-by/`,
        `${API}/api/likes/?target_type=camp&target_id=${campId}`,
      ];

      let loaded: SimpleUser[] | null = null;
      for (const u of urls) {
        try {
          const r = await fetch(u, {
            credentials: 'include',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
          });
          if (r.status === 401 || r.status === 403) {
            setErr('Нужно войти в аккаунт');
            break;
          }
          if (r.status === 404) continue; // пробуем следующий вариант
          if (!r.ok) {
            setErr('Ошибка сервера при загрузке списка лайков');
            break;
          }
          const j = await r.json();
          loaded = normalize(j);
          break;
        } catch { }
      }
      if (!cancelled) {
        if (loaded) setItems(loaded);
        else { setItems([]); setErr('Не удалось загрузить список лайкнувших'); }
      }
    })();
    return () => { cancelled = true; };
  }, [campId, API]);

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center px-4"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-[min(520px,92vw)] rounded-2xl bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold text-[15px]">Оценили</div>
          <button
            onClick={close}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
            aria-label="Закрыть"
          >✕</button>
        </div>

        {/* показываем 10 на экран, при >10 появится вертикальный скролл */}
        <div className="max-h-[440px] overflow-y-auto">
          {items === null ? (
            <div className="px-4 py-6 text-gray-500">Загрузка…</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-6 text-gray-500">{err || 'Пока никто не лайкнул.'}</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {items.map(u => (
                <li key={u.id}>
                  <Link
                    href={`/${u.username}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
                    onClick={(event) => {
                      rememberHere('profile');
                      const handled = navigateProfile(event as unknown as React.MouseEvent<HTMLElement>, { username: u.username }, { remember: false });
                      if (!handled) {
                        event.preventDefault();
                        try { window.location.assign(`/${u.username}`); }
                        catch { window.location.href = `/${u.username}`; }
                      }
                    }}
                  >
                    <AvatarImg
                      src={u.avatar}
                      alt={`@${u.username}`}
                      className="w-8 h-8 rounded-full object-cover border border-gray-200"
                    />
                    <span className="text-[14px] font-semibold">{u.username}</span>
                  </Link>
                </li>
              ))}
            </ul>

          )}
        </div>
      </div>
    </div>
  );
}



function ImageLightbox({
  open,
  images,
  index,
  onClose,
  onIndexChange,
}: {
  open: boolean;
  images: string[];
  index: number;
  onClose: () => void;
  onIndexChange: (next: number) => void;
}) {
  const [zoom, setZoom] = React.useState(1);
  const [tx, setTx] = React.useState(0);
  const [ty, setTy] = React.useState(0);
  const dragRef = React.useRef<{ x: number; y: number; tx0: number; ty0: number } | null>(null);

  // сброс зума/позиции при смене кадра/открытии
  React.useEffect(() => { if (open) { setZoom(1); setTx(0); setTy(0); } }, [open, index]);

  const count = images.length;
  const canPrev = count > 1;
  const canNext = count > 1;

  const goPrev = React.useCallback(() => {
    if (!canPrev) return;
    onIndexChange((index - 1 + count) % count);
  }, [index, count, canPrev, onIndexChange]);

  const goNext = React.useCallback(() => {
    if (!canNext) return;
    onIndexChange((index + 1) % count);
  }, [index, count, canNext, onIndexChange]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
      if ((e.key === '+' || e.key === '=') && zoom < 3) setZoom(z => Math.min(3, z + 0.2));
      if ((e.key === '-' || e.key === '_') && zoom > 1) setZoom(z => Math.max(1, z - 0.2));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, goPrev, goNext, onClose, zoom]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[12000] bg-black/90 text-white flex items-center justify-center select-none"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* верхняя панель */}
      <div className="absolute top-3 left-0 right-0 px-4 flex items-center justify-between pointer-events-none">
        <div className="text-sm opacity-80 pointer-events-auto">{index + 1} / {count}</div>
        <button
          onClick={onClose}
          className="pointer-events-auto w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
          aria-label="Закрыть"
        >
          ✕
        </button>
      </div>

      {/* кнопки навигации */}
      {count > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
            aria-label="Предыдущее фото"
          >
            ‹
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
            aria-label="Следующее фото"
          >
            ›
          </button>
        </>
      )}

      {/* сама картинка с зумом/перетаскиванием */}
      <div
        className="max-w-[95vw] max-h-[80vh] overflow-hidden rounded-xl bg-black/30 border border-white/10 shadow-xl"
        onWheel={(e) => {
          // pinch-zoom на трекпаде увеличивает deltaY малыми шагами → поддержим
          if (e.ctrlKey) {
            e.preventDefault();
            setZoom(z => {
              const next = Math.min(3, Math.max(1, z - e.deltaY * 0.01));
              return next;
            });
          }
        }}
        onDoubleClick={() => setZoom(z => z > 1 ? 1 : 2)}
        onPointerDown={(e) => {
          if (zoom === 1) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          dragRef.current = { x: e.clientX, y: e.clientY, tx0: tx, ty0: ty };
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return;
          const d = dragRef.current;
          setTx(d.tx0 + (e.clientX - d.x));
          setTy(d.ty0 + (e.clientY - d.y));
        }}
        onPointerUp={() => { dragRef.current = null; }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[index]}
          alt=""
          className="block object-contain"
          style={{
            maxWidth: '95vw',
            maxHeight: '80vh',
            transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
            transition: dragRef.current ? 'none' : 'transform 80ms linear',
            touchAction: zoom > 1 ? 'none' : 'auto',
            cursor: zoom > 1 ? 'grab' : 'zoom-in',
          }}
        />
      </div>

      {/* нижняя панель с зумом (без кнопки «Сброс») */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-[min(640px,92vw)] bg-white/10 backdrop-blur rounded-full px-4 py-2 border border-white/15">
        <div className="flex items-center gap-3">
          <span className="text-sm opacity-80 w-10">Зум</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-full accent-white"
          />
        </div>
      </div>

    </div>
  );
}





function readCookie(name: string) {
  const re = new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)');
  const m = document.cookie.match(re);
  return m ? decodeURIComponent(m[1]) : '';
}
function getCsrf() {
  return readCookie('csrftoken');
}
let csrfPromise: Promise<void> | null = null;

async function ensureCsrf() {
  if (getCsrf()) return;
  if (!API) return;
  if (!csrfPromise) {
    csrfPromise = fetch(`${API}/api/csrf/`, { credentials: 'include' })
      .then(() => { })                // ← превращаем в Promise<void>
      .finally(() => { csrfPromise = null; });
  }
  await csrfPromise;
}


// === System feed helpers: create / find / delete posts by exact title ===
const SYSTEM_TITLES = {
  SOLD_OUT: 'Случился SOLD OUT. Следите за нашими обновлениями, места могу еще появиться.',
  PLACES: 'У нас появились места. Успейте забронировать.',
  HOT: 'Горящее предложение! Цена снижена!',
} as const;

// лок от повторов в пределах пары секунд (на случай двойных вызовов)
const _systemPostLocks = new Map<string, number>();
const _LOCK_MS = 3000;
const _lk = (campId: number, title: string) => `${campId}::${title}`;


/** Пин поста */
async function pinPost(campId: number, postId?: number) {
  if (!API || !campId || !postId) return;
  await ensureCsrf();
  try {
    await fetch(`${API}/api/camps/${campId}/posts/${postId}/pin/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRFToken': getCsrf() },
    });
  } catch { /* мягко игнорим */ }
}

/** Создать системный пост, если подряд такого же ещё нет; при needPin — закрепить */
async function ensureSystemPost(
  campId: number,
  title: string,
  { needPin = false }: { needPin?: boolean } = {}
) {
  if (!API || !campId || !title.trim()) return;

  // мягкий дебаунс/лок от «двойных» вызовов
  const key = _lk(campId, title);
  const now = Date.now();
  const last = _systemPostLocks.get(key) || 0;
  if (now - last < _LOCK_MS) return;
  _systemPostLocks.set(key, now);

  try {
    // проверим крайний пост тем же заголовком и, если он уже есть, просто допиним его
    const list = await listCampPostsMini(campId); // обновили ниже, теперь с created_at и сортировкой
    const lastPost = list[0];
    if (lastPost && (lastPost.title || '').trim() === title.trim()) {
      if (needPin) await pinPost(campId, lastPost.id);
      return;
    }

    // создаём и при необходимости закрепляем
    const id = await createSystemPost(campId, title);
    if (needPin && id) await pinPost(campId, id);
  } finally {
    setTimeout(() => {
      if (_systemPostLocks.get(key) === now) _systemPostLocks.delete(key);
    }, _LOCK_MS);
  }
}


async function createSystemPost(campId: number, title: string) {
  if (!API || !campId) return;
  await ensureCsrf();

  const fd = new FormData();
  fd.append('title', title);
  fd.append('content', title);  // для API где поле называется content
  fd.append('text', title);     // для API где поле называется text

  const r = await fetch(`${API}/api/camps/${campId}/posts/`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'X-CSRFToken': getCsrf(),
      'Accept': 'application/json',
      // ВАЖНО: не указывать Content-Type, его выставит браузер
    },
    body: fd,
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`createSystemPost ${r.status}: ${txt}`);
  }

  try {
    const j: unknown = await r.json();
    const root = (j ?? {}) as Record<string, unknown>;
    const idDirect = Number(root['id']);
    const idNested = typeof root['post'] === 'object' && root['post'] !== null
      ? Number((root['post'] as Record<string, unknown>)['id'])
      : NaN;
    return Number.isFinite(idDirect) ? idDirect : (Number.isFinite(idNested) ? idNested : undefined);
  } catch {
    return undefined;
  }
}




type _MiniPost = { id: number; title: string | null; created_at?: string | null };

async function listCampPostsMini(campId: number): Promise<_MiniPost[]> {
  if (!API || !campId) return [];
  const r = await fetch(`${API}/api/camps/${campId}/posts/`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!r.ok) return [];
  const j = await r.json() as unknown;
  const root = j as Record<string, unknown>;
  const arr: Record<string, unknown>[] = Array.isArray(j)
    ? (j as Record<string, unknown>[])
    : Array.isArray(root['results'])
      ? (root['results'] as Record<string, unknown>[])
      : Array.isArray(root['posts'])
        ? (root['posts'] as Record<string, unknown>[])
        : [];
  return arr
    .map(it => ({
      id: Number(it['id']),
      title: pickString(it as UnknownRecord, ['title']),
      created_at: pickString(it as UnknownRecord, ['created_at']) || null,
    }))
    .filter(p => Number.isFinite(p.id))
    .sort((a, b) =>
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
}


async function deletePostsByExactTitle(campId: number, title: string) {
  if (!API || !campId) return;
  const list = await listCampPostsMini(campId);
  const targets = list.filter(p => (p.title || '').trim() === title.trim());
  if (!targets.length) return;

  await ensureCsrf();
  for (const p of targets) {
    const r = await fetch(`${API}/api/camps/${campId}/posts/${p.id}/delete/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRFToken': getCsrf() },
    });
    // мягко игнорим не-ок, чтобы не ронять цепочку
    void r;
  }
}



// === простые SVG-иконки ===
function IconHeart({ filled }: { filled: boolean }) {

  return filled ? (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 21s-6.716-4.35-9.333-7.2C.778 11.87 1.2 8.8 3.6 7.2 6 5.6 8.4 6.4 12 9.2c3.6-2.8 6-3.6 8.4-2 2.4 1.6 2.822 4.67.933 6.6C18.716 16.65 12 21 12 21z" fill="currentColor" />
    </svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path d="M20.84 4.61c-1.54-1.28-3.77-1.28-5.31 0L12 7.09 8.47 4.61c-1.54-1.28-3.77-1.28-5.31 0-1.73 1.44-1.9 4.02-.39 5.64C5.12 13 12 19 12 19s6.88-6 9.23-8.75c1.51-1.62 1.34-4.2-.39-5.64z" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}


function IconUser() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function IconShare() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 16V4m0 0l-4 4m4-4l4 4" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function IconComment() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path d="M21 12a8 8 0 1 1-3.3-6.5L21 6v6z" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="9" cy="11.5" r="0.8" fill="currentColor" />
      <circle cx="12" cy="11.5" r="0.8" fill="currentColor" />
      <circle cx="15" cy="11.5" r="0.8" fill="currentColor" />
    </svg>
  );
}




function MiniMap({ lat, lng }: { lat: number; lng: number }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current || lat == null || lng == null) return;

    const center = { lat, lng };

    const init = () => {
      if (!window.google?.maps || !ref.current) return;
      const map = new window.google.maps.Map(ref.current, {
        center,
        zoom: 8,
        disableDefaultUI: true,
        clickableIcons: false,
        gestureHandling: 'greedy',
        mapTypeId: 'roadmap',
      });
      new window.google.maps.Marker({
        position: center,
        map,
        clickable: false,
      });
    };

    // Уже загружено
    if (window.google?.maps) {
      init();
      return;
    }

    // Подгружаем один раз
    const scriptId = 'gmaps';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&v=weekly&language=ru`;
      script.async = true;
      document.head.appendChild(script);
    }

    script.addEventListener('load', init);
    return () => {
      script?.removeEventListener('load', init);
    };
  }, [lat, lng]);

  return (
    <div className="mt-0 relative w-full aspect-[3/2] rounded-2xl overflow-hidden border border-gray-200">
      <div ref={ref} className="absolute inset-0" />
      <a
        href={`https://www.google.com/maps?q=${lat},${lng}`}
        target="_blank"
        rel="noreferrer"
        className="absolute left-2 top-2 rounded-full bg-white/90 backdrop-blur px-3 py-1 text-sm border border-gray-200 hover:bg-white transition"
      >
        Увеличить карту
      </a>
    </div>
  );
}




function fmtPrice(val: number | string | null | undefined, currency: string) {
  if (val == null) return '';
  const n = typeof val === 'string' ? Number(val) : val;
  const sym = currency === 'RUB' ? '₽' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency;
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + ` ${sym}`;
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  const className =
    'px-2 py-1 rounded-full text-xs bg-gray-100 border border-gray-200 text-gray-700 transition hover:bg-gray-200';
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${className} cursor-pointer`}
      >
        {children}
      </button>
    );
  }
  return <span className={className}>{children}</span>;
}

/* ===== утилиты без any ===== */
type UnknownRecord = Record<string, unknown>;
type Tag = { id: number | string; name: string } | string;
type TagObj = { id: number | string; name: string };

const isString = (v: unknown): v is string => typeof v === 'string';
const hasText = (v: unknown): v is string => isString(v) && v.trim().length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isTagObj = (v: Tag): v is TagObj => typeof v === 'object' && v !== null && 'name' in v;

const getTagSearchValue = (tag: Tag): string | number | null => {
  if (typeof tag === 'string') {
    const trimmed = tag.trim();
    return trimmed || null;
  }
  if (!tag) return null;
  if (tag.id != null) {
    const trimmed = String(tag.id).trim();
    if (trimmed) return trimmed;
  }
  const name = tag.name?.trim();
  return name || null;
};

const asNumber = (v: unknown): number | null => {
  if (isNum(v)) return v;
  if (isString(v) && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
};

function pickString(obj: UnknownRecord, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (hasText(v)) return v.trim();
  }
  return null;
}
function pickBool(obj: UnknownRecord, keys: string[]): boolean | null {
  for (const k of keys) {
    const v = obj[k];
    if (isBool(v)) return v;
    if (isString(v)) {
      if (v === 'true') return true;
      if (v === 'false') return false;
    }
  }
  return null;
}
function pickNumber(obj: UnknownRecord, keys: string[]): number | null {
  for (const k of keys) {
    const n = asNumber(obj[k]);
    if (n !== null) return n;
  }
  return null;
}


// === caps / форматирование счётчиков кэмпа ===
function cap99(n: unknown): string {
  const num = asNumber(n) ?? 0;
  return num >= 100 ? '99+' : String(num);
}



function pickDateString(obj: UnknownRecord, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (hasText(v)) return v;
  }
  return null;
}

/** абсолютим ссылку с бэка (в т.ч. GCS → публичный https) */



/** нормализация массивов тегов/хэштегов */
function toTags(val: unknown): Tag[] {
  if (Array.isArray(val)) {
    const items: Tag[] = [];
    for (const it of val) {
      if (isString(it) && it.trim()) {
        items.push(it.trim());
      } else if (isNum(it)) {
        items.push(String(it));
      } else if (typeof it === 'object' && it !== null) {
        const rec = it as UnknownRecord;
        const id = rec['id'];
        const name =
          rec['name'] ??
          rec['label'] ??
          rec['title'] ??
          rec['text'] ??
          rec['slug'];
        if (hasText(name) || isNum(id) || isString(id)) {
          items.push({
            id: (isNum(id) || isString(id)) ? (id as number | string) : String(name),
            name: String(name ?? id),
          });
        }
      }
    }
    return items;
  }
  if (isString(val)) {
    const parts = val.split(/[,\s#]+/g).map((s) => s.trim()).filter(Boolean);
    return parts;
  }
  return [];
}




function saveCampViewState(campId: number, activeTab: string) {
  try {
    const scroller = document.scrollingElement || document.documentElement;
    const y = scroller?.scrollTop ?? 0;
    sessionStorage.setItem(
      'camp:return',
      JSON.stringify({ campId, y, activeTab, ts: Date.now() })
    );
  } catch { }
}


export default function CampInfo({ camp }: { camp: Camp }) {

  const [profilePostCreateOpen, setProfilePostCreateOpen] = useState(false);
  const [full, setFull] = useState<UnknownRecord | null>(null);
  const router = useRouter();
  const { pushScreen } = useLayerStack();
  const [editOpen, setEditOpen] = useState(false);
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [postsReloadTick, setPostsReloadTick] = useState(0);

  const [subsReloadTick, setSubsReloadTick] = useState(0);

  // список лайкнувших
  const overlayEnv = useOverlayEnvironment();
  const { isOverlay, close: closeOverlay } = overlayEnv;
  const { navigateProfile } = useAppNavigation();
  const openSearchOverlay = useSearchOverlay();

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();


  //const prevFlagsRef = React.useRef<{ soldOut: boolean; hot: boolean } | null>(null);

  const handleCampSaved = React.useCallback(async (prev: UnknownRecord, next: UnknownRecord) => {
    const id =
      asNumber(prev['id']) ?? asNumber(prev['camp_id']) ??
      asNumber(next['id']) ?? asNumber(next['camp_id']) ?? 0;
    if (!id) return;

    const wasSoldOut = !!(pickBool(prev, ['is_sold_out']));
    const nowSoldOut = !!(pickBool(next, ['is_sold_out']));

    const wasHot = !!(pickBool(prev, ['is_hot_deal']));
    const nowHot = !!(pickBool(next, ['is_hot_deal']));

    try {
      if (!wasSoldOut && nowSoldOut) {
        await ensureSystemPost(id, SYSTEM_TITLES.SOLD_OUT, { needPin: true });
        await deletePostsByExactTitle(id, SYSTEM_TITLES.PLACES);
      }
      if (wasSoldOut && !nowSoldOut) {
        await ensureSystemPost(id, SYSTEM_TITLES.PLACES, { needPin: true });
        await deletePostsByExactTitle(id, SYSTEM_TITLES.SOLD_OUT);
      }
      if (!wasHot && nowHot) {
        await ensureSystemPost(id, SYSTEM_TITLES.HOT, { needPin: true });
      }
      if (wasHot && !nowHot) {
        await deletePostsByExactTitle(id, SYSTEM_TITLES.HOT);
      }

      setPostsReloadTick(t => t + 1);
    } catch (e) {
      console.error('handleCampSaved error', e);
    }
  }, []);

  // Action sheet и подтверждение удаления
  const [campActionsOpen, setCampActionsOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [telegramPromptOpen, setTelegramPromptOpen] = useState(false);
  // auth gating (объявляем до использования в callbacks ниже)
  const { authenticated, telegramNotificationsEnabled } = useAuth();
  const [authRequiredOpen, setAuthRequiredOpen] = useState(false);
  const onLogin = useCallback(() => {
    setAuthRequiredOpen(false);
    try { window.location.assign('/auth/login'); } catch { window.location.href = '/auth/login'; }
  }, []);

  const openCampActions = useCallback(() => {
    if (!authenticated) { setCampActionsOpen(false); setAuthRequiredOpen(true); return; }
    if (hasTemporaryToken()) { setCampActionsOpen(false); setCompleteProfileModalOpen(true); return; }
    setCampActionsOpen(true);
  }, [authenticated]);
  const closeCampActions = useCallback(() => setCampActionsOpen(false), []);

  const handleCampDeleteClick = useCallback(() => {
    // закрываем шторку и открываем подтверждение
    setCampActionsOpen(false);
    setConfirmDeleteOpen(true);
  }, []);



  const [reportCampOpen, setReportCampOpen] = useState(false);
  const [completeProfileModalOpen, setCompleteProfileModalOpen] = useState(false);

  // Канонический URL страницы кэмпа (то же, что в shareCamp)
  const getCanonicalCampUrl = useCallback(() => {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin.replace(/\/+$/, '');
    const path = (pathname || window.location.pathname || '/');
    const cleanPath = ('/' + path.replace(/^\/+/, '')).replace(/https?:\/\/.*$/i, '');
    const qs = searchParams?.toString();
    return origin + cleanPath + (qs ? `?${qs}` : '');
  }, [pathname, searchParams]);


  const handleReportCamp = useCallback(() => {
    setCampActionsOpen(false);
    requestAnimationFrame(() => setReportCampOpen(true));
    console.log('[camp] report clicked');
    // alert('Спасибо! Мы рассмотрим жалобу.'); // опционально, если нужен фидбек
  }, [setCampActionsOpen]);



  const organizerRowRef = React.useRef<HTMLDivElement | null>(null);
  //const tabsHeaderRef = React.useRef<HTMLDivElement | null>(null);
  const [stickyTop, setStickyTop] = React.useState(0);
  const [feedBlockHeight, setFeedBlockHeight] = useState<number | null>(null);

  React.useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const el = organizerRowRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const styles = window.getComputedStyle(el);
      const marginBottom = parseFloat(styles.marginBottom || '0') || 0;
      const offset = Math.max(0, Math.round(rect.bottom + marginBottom));
      setStickyTop(offset);
      document.documentElement.style.setProperty('--camp-topbar-h', `${offset}px`);
      console.debug('[camp] stickyTop measured', { rectBottom: rect.bottom, marginBottom, offset });
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true });

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure);
    };
  }, []);

  // видны ли исходные (левых) первичные кнопки в вьюпорте
  const leftPrimaryActionsRef = React.useRef<HTMLDivElement | null>(null);
  const [showRightActions, setShowRightActions] = React.useState(false);

  // следим за видимостью: как только левые кнопки ушли из вьюпорта — показываем правый трей
  React.useEffect(() => {
    const el = leftPrimaryActionsRef.current;
    if (!el) return;

    // учитываем перекрытие липкой верхней шапкой: всё, что под ней — считаем "невидимым"
    const marginTop = typeof stickyTop === 'number' ? -Math.max(0, Math.round(stickyTop)) : 0;

    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        const visible = e.isIntersecting && e.intersectionRatio > 0;
        setShowRightActions(!visible);
      },
      { root: null, threshold: [0, 0.01, 0.1], rootMargin: `${marginTop}px 0px 0px 0px` }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [stickyTop]);




  // прямо под другими useState в CampInfo
  const [lightbox, setLightbox] = useState<{ open: boolean; images: string[]; index: number }>({
    open: false,
    images: [],
    index: 0,
  });


  const closeImageGallery = React.useCallback(() => {
    setLightbox(v => ({ ...v, open: false }));
  }, []);

  useEffect(() => {
    if (isOverlay) return;
    // навешиваем флаг на html (или body — см. CSS ниже)
    // используем только для внутренних эффектов кэмпа, не для глобального BottomNavBar
    document.documentElement.classList.add('camp-no-header');
    return () => document.documentElement.classList.remove('camp-no-header');
  }, [isOverlay]);


  useEffect(() => {
    const raw = camp as unknown as UnknownRecord;
    const id =
      (raw['id'] as number | string | undefined) ??
      (raw['camp_id'] as number | string | undefined);
    if (id == null) return;

    if (!API) return;

    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}/api/camps/${id}/`, { credentials: 'include', cache: 'no-store' });
        if (!r.ok) return;
        const j = (await r.json()) as UnknownRecord;
        if (!cancelled) setFull(j);
      } catch {/* молча */ }
    })();
    return () => { cancelled = true; };
  }, [camp]);


  // 🔁 Если после гидрации у кэмпа всё ещё нет аватарки организатора —
  // дотянем её из профиля клуба по username
  useEffect(() => {
    if (!API) return;

    // merged-объект (то, что реально рендерим)
    const merged: UnknownRecord = { ...(camp as UnknownRecord), ...(full ?? {}) };

    // уже есть аватар?
    const avatarNow =
      pickString(merged, ['organizerProfilePicture', 'organizer_avatar', 'organizer_profile_picture', 'organizer_photo_url'])
      || (typeof merged.organizer === 'object' && merged.organizer
        ? pickString(merged.organizer as UnknownRecord, ['profile_picture', 'profilePicture', 'avatar', 'photo_url'])
        : null);

    if (hasText(avatarNow)) return; // всё ок — ничего не делаем

    // есть username организатора?
    const organizerUsername =
      pickString(merged, ['organizerUsername']) ||
      (typeof merged.organizer === 'object' && merged.organizer
        ? pickString(merged.organizer as UnknownRecord, ['username'])
        : null);

    if (!hasText(organizerUsername)) return;

    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}/api/profile/${organizerUsername}/?ts=${Date.now()}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!r.ok) return;
        const p = (await r.json()) as UnknownRecord;
        const pic = pickString(p, ['profile_picture']);
        if (hasText(pic) && !cancelled) {
          setFull(prev => ({
            ...(prev ?? {}),
            organizerProfilePicture: pic,               // чтобы сработал твой pick из верхнего уровня
            organizer: {
              ...((prev?.organizer as UnknownRecord) ?? {}),
              profile_picture: pic,                     // и на всякий случай в nested.organizer
            },
          }));
        }
      } catch { }
    })();

    return () => { cancelled = true; };
  }, [camp, full]);


  /* всё рендерим из merged-объекта */
  const raw: UnknownRecord = useMemo(
    () => ({ ...(camp as unknown as UnknownRecord), ...(full ?? {}) }),
    [camp, full]
  );

  // --- Организатор (аватар/имя)
  const organizerObj = (raw['organizer'] as UnknownRecord | undefined) ?? undefined;

  const organizerAvatarRaw =
    pickString(raw, ['organizerProfilePicture', 'organizer_avatar', 'organizer_profile_picture', 'organizer_photo_url']) ||
    (organizerObj ? pickString(organizerObj, ['profile_picture', 'profilePicture', 'avatar', 'photo_url']) : null);
  const organizerAvatar = absUrl(organizerAvatarRaw) || AVATAR_PLACEHOLDER_PATH;


  const organizerName =
    pickString(raw, ['organizerClubName', 'organizer_name', 'organizerUsername', 'club_name']) ||
    (organizerObj ? pickString(organizerObj, ['club_name', 'username', 'display_name', 'name']) : null) ||
    'Клуб';

  const organizerUsername =
    pickString(raw, ['organizerUsername']) ||
    (organizerObj ? pickString(organizerObj, ['username']) : null);


  const handleBackClick = useCallback(() => {
    if (isOverlay) {
      closeOverlay();
      return;
    }
    const ctx = consumeReturn('camp');
    if (ctx) {
      router.replace(ctx);
      return;
    }
    navigateBack(router, { fallback: '/search' });
  }, [router, isOverlay, closeOverlay]);


  // --- Активности и хэштеги
  const activities = toTags(raw['activities']);
  const hashtags = toTags(raw['hashtags'] ?? raw['tags']);

  const goToCampSearchWithFilter = useCallback((param: 'activities' | 'hashtags', rawValue: string | number | null) => {
    const valueStr = rawValue == null ? '' : String(rawValue).trim().replace(/^#+/, '');
    if (!valueStr) return;
    try { rememberReturn('camp'); } catch { /* noop */ }
    const params = new URLSearchParams();
    params.set('tab', 'camps');
    params.set('collapsed', '1');
    params.append(param, valueStr);
    openSearchOverlay(params);
  }, [openSearchOverlay]);

  const handleActivityChipClick = useCallback((tag: Tag) => {
    const value = getTagSearchValue(tag);
    if (value == null) return;
    goToCampSearchWithFilter('activities', value);
  }, [goToCampSearchWithFilter]);

  const handleHashtagChipClick = useCallback((tag: Tag) => {
    const value = getTagSearchValue(tag);
    if (value == null) return;
    goToCampSearchWithFilter('hashtags', value);
  }, [goToCampSearchWithFilter]);

  // --- Контакты
  const telegram =
    pickString(raw, ['telegram_nickname', 'telegram', 'telegramUsername', 'telegram_username']) ||
    (organizerObj ? pickString(organizerObj, ['telegram_username']) : null) ||
    null;
  const phone =
    pickString(raw, ['phone', 'phone_number', 'contact_phone']) ||
    (organizerObj ? pickString(organizerObj, ['phone', 'phone_number']) : null) ||
    null;
  const website =
    pickString(raw, ['website', 'site', 'url']) ||
    (organizerObj ? pickString(organizerObj, ['website', 'site', 'url']) : null) ||
    null;

  // --- Локация
  const locationName = pickString(raw, ['location_name', 'location', 'city']) || null;
  const lat = pickNumber(raw, ['latitude', 'lat']);
  const lng = pickNumber(raw, ['longitude', 'lng']);
  const goToMapSearch = useCallback(() => {
    if (!locationName && (lat == null || lng == null)) return;
    try { rememberReturn('camp'); } catch { /* noop */ }
    const params = new URLSearchParams();
    params.set('tab', 'map');
    params.set('collapsed', '1');
    const trimmed = (locationName || '').trim();
    if (trimmed) params.set('location', trimmed);
    if (lat != null && lng != null) {
      params.set('latitude', String(lat));
      params.set('longitude', String(lng));
    }
    openSearchOverlay(params);
  }, [openSearchOverlay, locationName, lat, lng]);

  const handleOrganizerProfileClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!organizerUsername) {
      event.preventDefault();
      return;
    }
    navigateProfile(event as unknown as React.MouseEvent<HTMLElement>, { username: organizerUsername });
  }, [navigateProfile, organizerUsername]);

  // --- Даты
  const startStr = pickDateString(raw, ['start_date', 'startDate', 'date_from']);
  const endStr = pickDateString(raw, ['end_date', 'endDate', 'date_to']);
  const start = parseDateYYYYMMDD(startStr ?? undefined);
  const end = parseDateYYYYMMDD(endStr ?? undefined);
  const dateRange = formatRuDateRange(start, end);

  // --- Прочее
  const title = pickString(raw, ['title']) || '';
  const isSoldOut = (pickBool(raw, ['is_sold_out']) ?? false);
  const isKids = (pickBool(raw, ['is_kids_camp']) ?? false);
  const hasKidsCoach = (pickBool(raw, ['has_kids_coach']) ?? false);
  const isHot = (pickBool(raw, ['is_hot_deal']) ?? false);
  const currency = pickString(raw, ['currency']) || 'RUB';
  const price = pickNumber(raw, ['price']);
  const hotPrice = pickNumber(raw, ['hot_deal_price']);
  const originalPrice = pickNumber(raw, ['original_price']);
  const displayPrice = (isHot && hotPrice != null) ? hotPrice : price;
  const displayOriginal = isHot ? (originalPrice ?? price) : null;


  // --- Счётчики кэмпа (сырые)
  const campSubsRaw =
    pickNumber(raw, ['subscribers_count', 'followers_count', 'subs', 'followers']) ?? 0;

  const campCommentsRaw =
    pickNumber(raw, ['comments_count', 'comments_total', 'comments']) ?? 0;



  const campIdNum =
    asNumber((raw as UnknownRecord)['id']) ??
    asNumber((raw as UnknownRecord)['camp_id']) ??
    0;

  // управлялка модалкой лайков
  const openLikers = React.useCallback((src: LikeSource) => {
    if (src.kind !== 'camp' || !campIdNum) return;
    pushScreen({
      node: <CampLikersModal campId={campIdNum} />,
      backdrop: 'dim',
      className: 'bg-transparent',
      ariaLabel: 'Список оценивших кэмп',
      dismissible: true,
      blockScroll: true,
    });
  }, [campIdNum, pushScreen]);



  // --- Счётчики кэмпа (сырые)
  const campLikesRaw =
    pickNumber(raw, ['likes_count', 'likes', 'camp_likes']) ?? 0;

  // 🔴 читаем "лайкнуто мной" из возможных ключей (оставим tri-state через null)
  const campLikedFromRaw = pickBool(raw, [
    'liked_by_me', 'liked', 'is_liked', 'likedByMe', 'isLiked', 'liked_by_current_user'
  ]);

  // Локальный кэш, чтобы при перезагрузке сразу подсветить сердце
  const campLikeCacheKey = React.useMemo(
    () => `camp:${campIdNum}:liked`,
    [campIdNum]
  );
  const readCampLikeCache = React.useCallback(() => {
    try { return localStorage.getItem(campLikeCacheKey) === '1'; } catch { return false; }
  }, [campLikeCacheKey]);
  const writeCampLikeCache = React.useCallback((v: boolean) => {
    try {
      if (v) localStorage.setItem(campLikeCacheKey, '1');
      else localStorage.removeItem(campLikeCacheKey);
    } catch { }
  }, [campLikeCacheKey]);

  // Локальный стейт: сразу берём из API если есть, иначе — из кэша
  const [campLiked, setCampLiked] = React.useState<boolean>(() =>
    (campLikedFromRaw ?? readCampLikeCache())
  );

  // Лайки/подписки — как было
  const [campLikes, setCampLikes] = React.useState<number>(campLikesRaw);
  React.useEffect(() => { setCampLikes(campLikesRaw); }, [campLikesRaw]);

  // Если с бэка приехал явный флаг — применяем его и обновляем кэш
  React.useEffect(() => {
    if (campLikedFromRaw != null) {
      setCampLiked(!!campLikedFromRaw);
      writeCampLikeCache(!!campLikedFromRaw);
    }
  }, [campLikedFromRaw, writeCampLikeCache]);




  const [campSubscribed, setCampSubscribed] = React.useState<boolean>(!!pickBool(raw, ['subscribed_by_me', 'is_subscribed']));
  const [campSubs, setCampSubs] = React.useState<number>(campSubsRaw);
  React.useEffect(() => { setCampSubs(campSubsRaw); }, [campSubsRaw]);

  const [campBusyLike, setCampBusyLike] = React.useState(false);
  const [campBusySub, setCampBusySub] = React.useState(false);


  const campSubscribedRaw = !!pickBool(raw, ['subscribed_by_me', 'is_subscribed']);
  React.useEffect(() => { setCampSubscribed(campSubscribedRaw); }, [campSubscribedRaw]);



  // --- Локальное состояние для «комментариев к кэмпу», т.к. они изменяются на странице
  const [campComments, setCampComments] = useState<number>(campCommentsRaw);
  useEffect(() => { setCampComments(campCommentsRaw); }, [campCommentsRaw]);

  // --- Отображаемые значения с «99+»
  const campLikesDisp = cap99(campLikes);
  const campSubsDisp = cap99(campSubs);
  const campCommentsDisp = cap99(campComments); // <- именно из state


  // --- Галерея

  const fileSig = (u: string) => {
    try {
      const url = new URL(u, 'https://x');
      const path = url.pathname || '';
      const name = path.split('/').pop() || path;
      return name.toLowerCase();
    } catch {
      const path = (u || '').split('?')[0];
      const name = path.split('/').pop() || path;
      return name.toLowerCase();
    }
  };


  // --- Галерея: используем массив картинок из бэка, без ручного дублирования обложки
  const gallery = useMemo(() => {
    const titleImage = absUrl(pickString(raw, ['title_image']) || undefined);
    const baseList = pickImageArray(raw, [
      'gallery',
      'gallery_images',
      'images',
      'photos',
      'media',
      'galleryImages',
      'gallery_photos',
    ]);

    // если бэк отдал явный список картинок — считаем его источником правды
    if (baseList.length > 0) {
      const seen = new Set<string>();
      const unique: string[] = [];
      for (const u of baseList) {
        const sig = fileSig(u);
        if (seen.has(sig)) continue;
        seen.add(sig);
        unique.push(u);
      }
      return unique.slice(0, 10);
    }

    // иначе показываем только обложку, если она есть
    return titleImage ? [titleImage] : [];
  }, [raw]);

  const thumbs = useMemo(() => gallery, [gallery]);


  const [activeIdx, setActiveIdx] = useState(0);
  const description = pickString(raw, ['description']) || '';



  useEffect(() => {
    if (overlayEnv.isOverlay) return;
    const root = document.documentElement;
    root.classList.add('camp-no-header');

    // обнуляем высоту хедера, чтобы layout не давал отступ
    const prev = root.style.getPropertyValue('--header-h');
    root.style.setProperty('--header-h', '0px');

    return () => {
      root.classList.remove('camp-no-header');
      if (prev) root.style.setProperty('--header-h', prev);
      else root.style.removeProperty('--header-h');
    };
  }, [overlayEnv.isOverlay]);

  const mapEmbedSrc = useMemo(() => {
    const zoom = 8;
    // Есть координаты → без маркера, только центр
    if (lat !== null && lng !== null) {
      return `https://www.google.com/maps?hl=ru&q=${lat},${lng}&ll=${lat},${lng}&z=${zoom}&t=m&output=embed&iwloc=near`;
    }
    // Только название → пробуем без инфо-окна
    if (locationName) {
      return `https://www.google.com/maps?hl=ru&q=${encodeURIComponent(locationName)}&z=${zoom}&t=m&output=embed&iwloc=near`;
    }
    return null;
  }, [lat, lng, locationName]);


  // айди кэмпа
  const campId = pickNumber(raw, ['id', 'camp_id']);

  // локальные состояния лайков/подписок (синхронизация при смене raw)
  const [, setLiked] = useState<boolean>(!!(pickBool(raw, ['is_liked']) ?? false));
  const [, setLikes] = useState<number>(pickNumber(raw, ['likes_count']) ?? 0);
  const [subscribed, setSubscribed] = useState<boolean>(!!(pickBool(raw, ['is_subscribed']) ?? false));
  const [, setSubs] = useState<number>(pickNumber(raw, ['subscribers_count']) ?? 0);
  // const [busyLike, ] = useState(false);
  const [busySub,] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLiked(!!(pickBool(raw, ['is_liked']) ?? false));
    setLikes(pickNumber(raw, ['likes_count']) ?? 0);
    setSubscribed(!!(pickBool(raw, ['is_subscribed']) ?? false));
    setSubs(pickNumber(raw, ['subscribers_count']) ?? 0);
  }, [raw]);



  // где-то рядом наверху файла можно добавить вспомогательный тип
  const toggleLike = React.useCallback(async () => {
    if (!authenticated) { setAuthRequiredOpen(true); return; }
    if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
    if (!API || !campIdNum || campBusyLike) return;

    const prevLiked = campLiked;
    const prevCount = campLikes;

    // ←←← ВОТ СЮДА твои три строки (оптимистичное обновление)
    const next = !prevLiked;
    const count = Math.max(0, prevCount + (next ? 1 : -1));
    setCampLiked(next);
    setCampLikes(count);
    writeCampLikeCache(next);

    try {
      setCampBusyLike(true);
      await ensureCsrf();
      const r = await fetch(`${API}/api/camps/${campIdNum}/like/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrf() },
      });
      if (!r.ok) throw new Error(String(r.status));

      // подтверждаем фактом с бэка (если формат другой — подставь свои ключи)
      const j = await r.json() as { liked?: boolean; likes_count?: number };
      const serverLiked = !!j.liked;
      const serverCount = Number.isFinite(j.likes_count as number) ? (j.likes_count as number) : count;

      setCampLiked(serverLiked);
      setCampLikes(serverCount);
      writeCampLikeCache(serverLiked); // чтобы кэш совпадал с сервером
    } catch {
      // откатываемся, если сеть/сервер упал
      setCampLiked(prevLiked);
      setCampLikes(prevCount);
      writeCampLikeCache(prevLiked);
    } finally {
      setCampBusyLike(false);
    }
  }, [API, campIdNum, campBusyLike, campLiked, campLikes, writeCampLikeCache]);

  // где-то рядом наверху файла можно добавить вспомогательный тип (ОБЪЯВИ ЕГО ОДИН РАЗ)
  type SubscribePayload = {
    subscribed?: boolean;
    subscribers_count?: number;
  };

  async function toggleSubscribe() {
    if (!authenticated) { setAuthRequiredOpen(true); return; }
    if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
    if (!API || !campIdNum || campBusySub) return;
    setCampBusySub(true);

    const optimistic = !campSubscribed;
    setCampSubscribed(optimistic);
    setCampSubs((c) => Math.max(0, c + (optimistic ? 1 : -1)));

    try {
      await ensureCsrf();

      const urls = [
        `${API}/api/camps/${campIdNum}/subscribe/`,
        `${API}/subscribe/camp/${campIdNum}/`,
      ];

      let data: SubscribePayload | null = null;
      let lastStatus = 0;

      for (const u of urls) {
        const res = await fetch(u, {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-CSRFToken': getCsrf(), 'Accept': 'application/json' },
        });
        lastStatus = res.status;

        if (res.status === 401) {
          setCampSubscribed(!optimistic);
          setCampSubs((c) => Math.max(0, c + (optimistic ? -1 : 1)));
          alert('Войдите, чтобы подписываться на кэмпы');
          return;
        }

        if (res.status === 403) {
          setCampSubscribed(!optimistic);
          setCampSubs((c) => Math.max(0, c + (optimistic ? -1 : 1)));
          let msg = 'Нет прав для подписки';
          try {
            const j = await res.json();
            msg = (j?.detail || j?.error || msg) as string;
          } catch { }
          alert(msg);
          return;
        }

        if (res.ok) {
          const j = await res.json().catch(() => ({}));
          if (j && typeof j === 'object') {
            const obj = j as Record<string, unknown>;
            data = {
              subscribed: typeof obj.subscribed === 'boolean' ? obj.subscribed : undefined,
              subscribers_count: typeof obj.subscribers_count === 'number' ? obj.subscribers_count : undefined,
            };
          }
          break;
        }

        if (![404, 405].includes(res.status)) break;
      }

      if (!data) throw new Error(`subscribe failed (${lastStatus})`);

      if (typeof data.subscribed === 'boolean') {
        setCampSubscribed(data.subscribed);
        if (data.subscribed && !telegramNotificationsEnabled) {
          setTelegramPromptOpen(true);
        }
      }
      if (typeof data.subscribers_count === 'number') setCampSubs(data.subscribers_count);

      setSubsReloadTick((t) => t + 1); // обновит вкладку "Подписчики"
    } catch (e) {
      setCampSubscribed(!optimistic);
      setCampSubs((c) => Math.max(0, c + (optimistic ? -1 : 1)));
      console.error('Subscribe error:', e);
    } finally {
      setCampBusySub(false);
    }
  }



  async function shareCamp() {
    if (typeof window === 'undefined') return;

    // 1) Собираем КАНОНИЧНЫЙ URL строго из origin + pathname (+ query)
    const origin = window.location.origin.replace(/\/+$/, '');
    const path = (pathname || window.location.pathname || '/');

    // страхуемся: режем всё, что внезапно похоже на встроенный в путь протокол
    // например "/vakaclub2/camp/1https://www" → "/vakaclub2/camp/1"
    const cleanPath = ('/' + path.replace(/^\/+/, '')).replace(/https?:\/\/.*$/i, '');

    const qs = searchParams?.toString();
    const url = origin + cleanPath + (qs ? `?${qs}` : '');

    try {
      // 2) В Web Share API передаём ТОЛЬКО url — без text/title,
      // чтобы Telegram/Reminders не дублировали и не склеивали строки
      if ('share' in navigator) {
        const data: ShareData = { url };
        // canShare может отсутствовать — это нормально
        if (!navigator.canShare || navigator.canShare(data)) {
          await navigator.share(data);
          return;
        }
      }
    } catch {
      // игнорируем отказ пользователя или неподдержку цели
    }

    // 3) Фолбэк: кладём ТОЛЬКО URL в буфер
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // самый старый фолбэк
      window.prompt('Скопируйте ссылку:', url);
    }
  }



  async function deleteCamp() {
    if (!API || !campId) return;

    const showError = async (r: Response) => {
      let detail = '';
      try {
        const j: Record<string, unknown> = await r.json();
        detail = String(j?.error || j?.detail || j?.details || '');
      } catch { /* не JSON — ок */ }

      const tail = detail ? `: ${detail}` : '';
      if (r.status === 401) { alert('Нужно войти в аккаунт' + tail); return; }
      if (r.status === 403) { alert('Нет прав на удаление кэмпа' + tail); return; }
      if (r.status === 404) { alert('Контент не найден' + tail); return; }
      if (r.status === 409) { alert('Нельзя удалить: есть связанные объекты (посты/комментарии/подписки)' + tail); return; }
      alert(`Ошибка удаления (код ${r.status})` + tail);
    };

    const afterDeleted = () => {
      const deletedId = campId ?? (campIdNum || null);
      try {
        if (typeof window !== 'undefined' && deletedId) {
          window.dispatchEvent(
            new CustomEvent('navumi:camp-deleted', { detail: { id: deletedId } })
          );
          try {
            // eslint-disable-next-line no-console
            console.info('[CampInfo] dispatched navumi:camp-deleted', { id: deletedId });
          } catch { /* noop */ }
          try {
            const raw = window.sessionStorage.getItem('navumi:deleted-camps');
            const list = raw ? (JSON.parse(raw) as number[]) : [];
            if (!list.includes(deletedId)) list.push(deletedId);
            window.sessionStorage.setItem('navumi:deleted-camps', JSON.stringify(list.slice(-50)));
          } catch { /* noop */ }
        }
      } catch { /* noop */ }

      // Если кэмп открыт в оверлее — просто закрываем его, базовый слой уже под ним.
      if (overlayEnv.isOverlay) {
        try { closeOverlay(); } catch { /* noop */ }
        return;
      }

      // Иначе это полноценная страница: уходим на профиль организатора или поиск.
      const fallback = organizerUsername ? `/${organizerUsername}` : '/search';
      router.replace(fallback);
    };

    try {
      await ensureCsrf();

      // 1) Каноничный путь — POST /delete/
      try {
        const r = await fetch(`${API}/api/camps/${campId}/delete/`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-CSRFToken': getCsrf(), 'Accept': 'application/json' },
        });
        if (r.ok || r.status === 204) {
          afterDeleted();
          return;
        }
        await showError(r);
      } catch { /* попробуем DELETE */ }

      // 2) Альтернатива — DELETE ресурс
      try {
        const r2 = await fetch(`${API}/api/camps/${campId}/`, {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'X-CSRFToken': getCsrf(), 'Accept': 'application/json' },
        });
        if (r2.ok || r2.status === 204) {
          afterDeleted();
          return;
        }
        await showError(r2);
      } catch { /* noop */ }
    } catch {
      alert('Не удалось удалить кэмп');
    }
  }



  const [, setComments] = useState<number>(pickNumber(raw, ['comments_count', 'commentsCount']) ?? 0);

  useEffect(() => {
    setLiked(!!(pickBool(raw, ['is_liked']) ?? false));
    setLikes(pickNumber(raw, ['likes_count']) ?? 0);
    setSubscribed(!!(pickBool(raw, ['is_subscribed']) ?? false));
    setSubs(pickNumber(raw, ['subscribers_count']) ?? 0);
    setComments(pickNumber(raw, ['comments_count', 'commentsCount']) ?? 0);
  }, [raw]);


  const topbarRef = React.useRef<HTMLDivElement | null>(null);


  const [activeTab, setActiveTab] = useState<Tab>('comments');
  const feedTabNormalized: CampFeedTab = (activeTab === 'feed' ? 'comments' : activeTab) as CampFeedTab;

  const activateTab = useCallback((tab: Tab) => {
    setActiveTab(tab);
  }, []);

  const scrollFeedIntoView = useCallback(() => {
    if (typeof window === 'undefined') return;

    // ⚠️ Убедись, что в CampFeedTabs заголовок имеет id="camp-feed-header" (см. ниже)
    const anchor =
      document.getElementById('camp-feed-header') ||
      document.getElementById('camp-feed-nav') ||
      document.getElementById('camp-feed');
    if (!anchor) {
      console.log('[camp] anchor not found');
      return;
    }

    const scroller = getScrollParent(anchor);
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    const behavior: ScrollBehavior = prefersReduced ? 'auto' : 'smooth';

    const topOffset = typeof stickyTop === 'number' ? stickyTop : 0;
    const extraGap = 12;

    if (scroller) {
      const aRect = anchor.getBoundingClientRect();
      const sRect = scroller.getBoundingClientRect();
      const relTop = aRect.top - sRect.top;

      const target = Math.max(0, Math.round(scroller.scrollTop + relTop - topOffset - extraGap));

      console.log('[camp] scrollFeedIntoView (SCROLLER)', {
        scrollerTag: scroller.tagName,
        scrollerId: scroller.id || null,
        anchorId: anchor.id || null,
        relTop,
        stickyTop,
        extraGap,
        currentScrollTop: scroller.scrollTop,
        target,
      });

      scroller.scrollTo({ top: target, behavior });

      // посмотрим, поехало ли
      setTimeout(() => {
        console.log('[camp] after-scroll (SCROLLER)', {
          afterScrollTop: scroller.scrollTop,
        });
      }, 120);
    } else {
      const rect = anchor.getBoundingClientRect();
      const currentScroll = window.scrollY || document.documentElement.scrollTop || 0;
      const target = Math.max(0, Math.round(currentScroll + rect.top - topOffset - extraGap));

      console.log('[camp] scrollFeedIntoView (WINDOW)', {
        anchorId: anchor.id || null,
        rectTop: rect.top,
        stickyTop,
        extraGap,
        currentScroll,
        target,
      });

      window.scrollTo({ top: target, behavior });

      setTimeout(() => {
        console.log('[camp] after-scroll (WINDOW)', {
          afterRectTop: anchor.getBoundingClientRect().top,
          afterScroll: window.scrollY || document.documentElement.scrollTop || 0,
        });
      }, 120);
    }
  }, [stickyTop]);





  const handleFeedTabChange = useCallback((tab: CampFeedTab) => {
    console.log('[camp] onTabChange →', tab);
    activateTab(tab);
    // даём реакт-цикл закончиться и скроллим
    requestAnimationFrame(() => scrollFeedIntoView());
  }, [activateTab, scrollFeedIntoView]);


  React.useLayoutEffect(() => {
    const el = topbarRef.current;
    if (!el) return;

    const ensureVariable = () => {
      if (typeof window === 'undefined') return;
      const current = document.documentElement.style.getPropertyValue('--camp-topbar-h');
      if (!current) {
        const rect = el.getBoundingClientRect();
        const height = rect.height || el.offsetHeight || 0;
        document.documentElement.style.setProperty('--camp-topbar-h', `${Math.max(0, Math.round(height))}px`);
      }
    };

    ensureVariable();
    const ro = new ResizeObserver(ensureVariable);
    ro.observe(el);

    return () => {
      ro.disconnect();
    };
  }, []);

  // открыть вкладку «Подписчики»
  function openSubscribersTab() {
    console.log('[camp] click: Subscribers icon');
    activateTab('subscribers');
    requestAnimationFrame(() => scrollFeedIntoView());
  }

  useEffect(() => {
    if (!campId) return;
    try {
      const raw = sessionStorage.getItem('camp:return');
      if (!raw) return;

      const obj = JSON.parse(raw) as {
        campId: number;
        y?: number;
        activeTab?: unknown;
        ts?: number;
      };
      if (obj?.campId !== campId) return;

      const restored = normalizeStoredFeedTab(obj.activeTab);

      if (restored) activateTab(restored);

      requestAnimationFrame(() => {
        const y = Math.max(0, Math.floor(obj.y ?? 0));
        window.scrollTo(0, y);
      });
    } catch {/* noop */ }
    finally {
      sessionStorage.removeItem('camp:return');
    }
  }, [campId, activateTab]);


  const clearCommentsDeepLink = useCallback(() => {
  }, []);

  // --- переход на вкладку "Комментарии" из Ленты/Постов/и т.п.
  function openCommentsTab() {
    console.log('[camp] click: Comments icon');
    saveCampViewState(campId!, 'feed');
    activateTab('comments');
    requestAnimationFrame(() => scrollFeedIntoView());
  }

  // ...после organizerUsername:
  const [meUsername, setMeUsername] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}/api/check-auth/`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!r.ok) { if (!cancelled) setMeUsername(null); return; }
        const j = await r.json();
        const u = j?.profile?.username as string | undefined;
        if (!cancelled) setMeUsername(u ?? null);
      } catch {
        if (!cancelled) setMeUsername(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const isOrganizer = !!(meUsername && organizerUsername && meUsername === organizerUsername);

  const isOwner = Boolean((camp as Partial<Camp>)?.is_owner) || isOrganizer;

  const viewer = React.useMemo(() => ({
    username: meUsername ?? undefined,
    isOrganizer,
    isOwner,
  }), [meUsername, isOrganizer, isOwner]);


  const editableInitial = useMemo(() => ({
    title: title || '',
    description: description || '',
    phone: phone || '',
    website: website || '',
    telegram_nickname: (telegram || '').replace(/^@+/, ''),
    is_sold_out: !!isSoldOut,
    is_hot_deal: !!isHot,
    hot_deal_price: hotPrice != null ? String(hotPrice) : '',
  }), [title, description, phone, website, telegram, isSoldOut, isHot, hotPrice]);


  const refetchCamp = React.useCallback(async () => {
    if (!API || !campId) return;
    try {
      const rr = await fetch(`${API}/api/camps/${campId}/`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (rr.ok) {
        const data = await rr.json();
        setFull(data);
      }
    } catch {/* no-op */ }
  }, [campId]);

  useEffect(() => {
    if (activeTab !== 'comments') {
      clearCommentsDeepLink();
    }
  }, [activeTab, clearCommentsDeepLink]);


  const prefillCampForProfilePost = campIdNum ? {
    id: campIdNum,
    title,
    start_date: startStr ?? undefined,
    end_date: endStr ?? undefined,
  } : null;


  console.debug('HASHTAGS from API:', raw['hashtags']);

  useEffect(() => {
    const dbg: CampDebug = {
      scroll: scrollFeedIntoView,
      dump() {
        const header = document.getElementById('camp-feed-header');
        const nav = document.getElementById('camp-feed-nav');
        const rect = header?.getBoundingClientRect();
        console.log('[camp] dump', {
          stickyTop,
          headerFound: !!header,
          navFound: !!nav,
          headerRectTop: rect?.top,
          varCampTopbarH: getComputedStyle(document.documentElement).getPropertyValue('--camp-topbar-h'),
          scrollY: window.scrollY,
          docScrollTop: document.documentElement.scrollTop,
        });
      },
    };

    window.__campDebug = dbg;

    return () => {
      // можно так, чтобы линтер не ругался на delete:
      window.__campDebug = undefined;
      // или так (если допускается):
      // delete window.__campDebug;
    };
  }, [scrollFeedIntoView, stickyTop]);


  return (
    <div className="bg-white">
      <div className="max-w-6xl mx-auto px-4 py-0 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* LEFT (2/3) */}
        <section className="md:col-span-2">
          {/* 🔁 была "sticky top-16 border-b ..." — делаем плоскую шапку без подчёркивания */}
          <div className="bg-white">
            {/* верхняя строка: слева клуб, справа Назад */}
            <div
              ref={topbarRef}
              id="camp-topbar"
              className="sticky top-0 z-[1200] bg-white supports-[backdrop-filter]:bg-white/95 backdrop-blur">

              {/* верхняя строка: слева стрелка назад + @username организатора */}
              <div
                ref={organizerRowRef}
                className="py-6 flex items-center justify-between"
              >
                {/* слева: «назад» + аватар + @username */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleBackClick}
                    className="w-8 h-8 rounded-full hover:bg-gray-100 text-gray-900 flex items-center justify-center"
                    aria-label="Назад"
                    title="Назад"
                  >
                    <ChevronLeft className="w-[18px] h-[18px]" strokeWidth={2.6} />
                  </button>
                  <a
                    href={organizerUsername ? `/${organizerUsername}` : '#'}
                    onClick={handleOrganizerProfileClick}
                    className="flex items-center gap-3 group"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={organizerAvatar}
                      alt={organizerUsername ? organizerUsername : 'Организатор'}
                      className="w-10 h-10 rounded-full object-cover border border-gray-200 group-hover:border-gray-300 transition-colors"
                    />
                    <div className="leading-tight">
                      <div className="font-semibold text-gray-900">
                        {organizerUsername || organizerName}
                      </div>
                    </div>
                  </a>
                </div>
              </div>

            </div>

            {/* Заголовок */}
            <div className="pb-3 min-w-0">
              <h1 className="text-2xl font-semibold break-words line-clamp-2">{title}</h1>
            </div>

            {/* Активности */}
            {activities.length > 0 ? (
              <div className="pb-4 flex flex-wrap gap-2">
                {activities.map((a) => {
                  const label = isTagObj(a) ? a.name : a;
                  return (
                    <Chip key={`a-${isTagObj(a) ? a.id : label}`} onClick={() => handleActivityChipClick(a)}>
                      <span className="inline-flex items-center gap-1">
                        <Target className="w-3.5 h-3.5 text-blue-600" aria-hidden />
                        <span>{label}</span>
                      </span>
                    </Chip>
                  );
                })}
              </div>
            ) : null}

            {/* Действия */}
            <div className="pb-4 grid grid-cols-[1fr_auto] items-end gap-x-2">
              {/* левая часть — кнопки */}
              <div className="flex flex-wrap items-center gap-2">
                {isOwner ? (
                  <>
                    <div ref={leftPrimaryActionsRef} className="flex flex-wrap items-center gap-2">
                      <button
                        className="px-4 py-2 rounded-full border border-gray-300 text-sm hover:bg-gray-50"
                        onClick={() => setPostModalOpen(true)}
                      >
                        Добавить пост
                      </button>

                      <button
                        className="px-4 py-2 rounded-full bg-black text-white text-sm hover:bg-black/90"
                        onClick={() => setEditOpen(true)}
                      >
                        Редактировать
                      </button>
                    </div>

                    <button
                      className="px-4 py-2 rounded-full border border-gray-300 text-sm hover:bg-gray-50"
                      onClick={() => {
                        console.log('[camp] click: Feed button');
                        scrollFeedIntoView();
                      }}
                    >
                      Лента
                    </button>
                  </>
                ) : (
                  <>
                    <div ref={leftPrimaryActionsRef} className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={toggleSubscribe}
                        disabled={campBusySub}
                        aria-pressed={subscribed}
                        className={[
                          'px-4 py-2 rounded-full text-sm transition',
                          'bg-black text-white hover:bg-black/90',
                          busySub ? 'opacity-60 cursor-not-allowed' : '',
                        ].join(' ')}
                      >
                        {campSubscribed ? 'Отписаться' : 'Подписаться'}
                      </button>
                      <button
                        className="px-4 py-2 rounded-full border border-gray-300 text-sm hover:bg-gray-50"
                        onClick={() => { 
                          if (!authenticated) { setAuthRequiredOpen(true); return; }
                          if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
                          setProfilePostCreateOpen(true); 
                        }}
                      >
                        Отметить кэмп
                      </button>
                    </div>

                    <button
                      className="px-4 py-2 rounded-full border border-gray-300 text-sm hover:bg-gray-50"
                      onClick={() => {
                        console.log('[camp] click: Feed button');
                        scrollFeedIntoView();
                      }}
                    >
                      Лента
                    </button>
                  </>
                )}
              </div>

              {/* правая часть — просто "..." без обводки, прижатые к низу строки */}
              <button
                type="button"
                onClick={openCampActions}
                className="justify-self-end self-end px-3 py-0 text-2xl leading-none text-gray-600 hover:text-black focus:outline-none"
                aria-haspopup="dialog"
                aria-expanded={campActionsOpen ? 'true' : 'false'}
                title="Действия"
                aria-label="Действия"
              >
                ⋯
              </button>
            </div>


            {/* Скроллящаяся часть */}
            <div className="pt-4">
              {!!gallery.length && (
                <>
                  {/* добавили group */}
                  <div className="relative w-full aspect-[3/2] rounded-2xl overflow-hidden bg-gray-100 group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <SmartImage src={gallery[activeIdx]} alt="" fill className="object-cover" sizes="(max-width: 640px) 100vw, 50vw" />

                    {isSoldOut && (
                      <div className="absolute top-2 left-2 rounded-md bg-black/70 text-white text-xs px-2 py-0.5">SOLD OUT</div>
                    )}
                    {isHot && !isSoldOut && (
                      <div className="absolute top-2 left-2 rounded-md bg-red-600 text-white text-xs px-2 py-0.5">Горящее</div>
                    )}

                    {/* ↓↓↓ стрелки появляются только при наведении на фото (или при фокусе с клавиатуры) ↓↓↓ */}
                    {gallery.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setActiveIdx(i => (i - 1 + gallery.length) % gallery.length)}
                          className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/35 text-white hover:bg-black/45 focus:outline-none focus:ring-2 focus:ring-white/60 flex items-center justify-center
                         opacity-0 pointer-events-none transition-opacity duration-150
                         group-hover:opacity-100 group-hover:pointer-events-auto
                         focus:opacity-100 focus:pointer-events-auto"
                          aria-label="Предыдущее фото"
                          title="Предыдущее фото"
                        >
                          <span className="text-2xl leading-none select-none">‹</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveIdx(i => (i + 1) % gallery.length)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/35 text-white hover:bg-black/45 focus:outline-none focus:ring-2 focus:ring-white/60 flex items-center justify-center
                         opacity-0 pointer-events-none transition-opacity duration-150
                         group-hover:opacity-100 group-hover:pointer-events-auto
                         focus:opacity-100 focus:pointer-events-auto"
                          aria-label="Следующее фото"
                          title="Следующее фото"
                        >
                          <span className="text-2xl leading-none select-none">›</span>
                        </button>
                      </>
                    )}
                    {/* ↑↑↑ конец правок для стрелок ↑↑↑ */}
                  </div>

                  {thumbs.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <div className="flex gap-2 pr-2">
                        {thumbs.map((src, i) => (
                          <button
                            key={src + i}
                            type="button"
                            onClick={() => setActiveIdx(i)}
                            aria-label={`Фото ${i + 1}`}
                            aria-current={i === activeIdx ? 'true' : undefined} // доступность, но без визуалки
                            className="relative w-20 h-14 rounded-md overflow-hidden border border-gray-200 flex-shrink-0 hover:border-gray-300 focus:outline-none"
                          >
                            <SmartImage src={src} alt="" fill className="object-cover" sizes="(max-width: 640px) 100vw, 50vw" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {description && (
                <div className="mt-6 prose prose-sm max-w-none">
                  <p
                    className="whitespace-pre-wrap break-words"
                    style={{ overflowWrap: 'anywhere' }}
                    lang="ru"
                  >
                    {/* Описание кэмпа с кликабельными @username‑упоминаниями */}
                    <MentionedProfileInline text={description} />
                  </p>
                </div>

              )}

              {/* Хэштеги под описанием */}
              {hashtags.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {hashtags.map((h) =>
                    isTagObj(h)
                      ? (
                        <Chip key={`h-${h.id}`} onClick={() => handleHashtagChipClick(h)}>
                          #{h.name}
                        </Chip>
                      )
                      : (
                        <Chip key={`h-${h}`} onClick={() => handleHashtagChipClick(h)}>
                          #{h}
                        </Chip>
                      )
                  )}
                </div>
              ) : null}

              <div

                className="mt-8"
                style={feedBlockHeight ? { minHeight: feedBlockHeight } : undefined}
              >
                <CampFeedTabs
                  camp={raw as unknown as Camp}
                  activeTab={feedTabNormalized}
                  onTabChange={handleFeedTabChange}
                  postsReloadKey={postsReloadTick}
                  subscribersReloadKey={subsReloadTick}
                  onCommentsCountChange={(delta) =>
                    setCampComments((c) => Math.max(0, c + delta))
                  }
                  viewer={viewer}
                  //headerRef={tabsHeaderRef}
                  stickyTopPx={stickyTop}
                  // 🆕 Оптимизация: используем фиксированную высоту для предотвращения пересчета высоты страницы
                  fixedHeightMode={true}
                  onViewportHeightChange={setFeedBlockHeight}
                //fixedViewportHeight={window.innerHeight - stickyTop - 64} // 64px для отступов
                />
              </div>
            </div>

            {isOwner && campId && (
              <EditCampModalDesktop
                open={editOpen}
                onClose={() => setEditOpen(false)}
                campId={campId}
                initial={editableInitial}
                currencyCode={currency}
                onApplied={(next) => {
                  // снимок состояния ДО сохранения (для сравнения флажков)
                  const prevSnap: UnknownRecord = { ...(camp as UnknownRecord), ...(full ?? {}) };

                  setFull(prev => {
                    // аккуратно достаём числа из prev без any
                    const p = (prev ?? {}) as { price?: unknown; original_price?: unknown };

                    const prevPrice =
                      typeof p.price === 'number'
                        ? p.price
                        : (typeof p.price === 'string' && p.price.trim() !== ''
                          ? Number(p.price)
                          : null);

                    const prevOriginal =
                      typeof p.original_price === 'number'
                        ? p.original_price
                        : (typeof p.original_price === 'string' && p.original_price.trim() !== ''
                          ? Number(p.original_price)
                          : null);

                    // включили «горящее»
                    if (next.is_hot_deal && next.hot_deal_price) {
                      const newPrice = Number(next.hot_deal_price.replace(',', '.'));
                      return {
                        ...(prev ?? {}),
                        title: next.title,
                        description: next.description,
                        phone: next.phone || null,
                        website: next.website || null,
                        telegram_nickname: next.telegram_nickname || null,
                        is_sold_out: next.is_sold_out,
                        is_hot_deal: true,
                        // базовую цену НЕ трогаем (её хранит backend)
                        price: prevPrice,
                        // если original ещё не было — запомним текущую базовую
                        original_price: (prevOriginal ?? prevPrice) ?? null,
                        // скидочная цена отображения
                        hot_deal_price: newPrice,
                      };
                    }

                    // выключили «горящее»
                    return {
                      ...(prev ?? {}),
                      title: next.title,
                      description: next.description,
                      phone: next.phone || null,
                      website: next.website || null,
                      telegram_nickname: next.telegram_nickname || null,
                      is_sold_out: next.is_sold_out,
                      is_hot_deal: false,
                      // базовую цену НЕ трогаем
                      price: prevPrice,
                      // history можно оставить как есть (или null — по желанию)
                      original_price: prevOriginal ?? null,
                      hot_deal_price: null,
                    };
                  });

                  // 🚀 важно: после локального обновления — запостить/удалить системные посты
                  void handleCampSaved(prevSnap, next);
                }}

                onRefetch={refetchCamp}
              />
            )}


            {isMobile ? (
              <CreateCampPostMobile
                open={postModalOpen}
                onClose={() => setPostModalOpen(false)}
                campId={camp.id}
                onCreated={async () => {
                  setPostModalOpen(false);
                  activateTab('posts');
                  await refetchCamp();
                  setPostsReloadTick((x) => x + 1);
                }}
              />
            ) : (
              <CampPostCreateDesktopModal
                open={postModalOpen}
                onClose={() => setPostModalOpen(false)}
                campId={camp.id}
                onCreated={async () => {
                  setPostModalOpen(false);
                  activateTab('posts');
                  await refetchCamp();
                  setPostsReloadTick((x) => x + 1);
                }}
              />
            )}

            <CreatePostModal
              open={profilePostCreateOpen}
              onClose={() => setProfilePostCreateOpen(false)}
              prefillCamp={prefillCampForProfilePost}
              onSaved={() => {
                setProfilePostCreateOpen(false);
                // чтобы «Отметки» подтянулись свежие — уберём кэш и переключим вкладку
                try { sessionStorage.removeItem(`camp:${campIdNum}:marks`); } catch { }
                activateTab('marks');
                scrollFeedIntoView();
              }}
            />

            <ImageLightbox
              open={lightbox.open}
              images={lightbox.images}
              index={lightbox.index}
              onClose={closeImageGallery}
              onIndexChange={(i) => setLightbox((v) => ({ ...v, index: i }))}
            />

            {/* Action-sheet «кэмп» */}
            <CampActionSheet
              open={campActionsOpen}
              canDelete={isOwner}          // у организатора показываем «Удалить»
              canReport={!isOwner}         // у остальных — «Пожаловаться»
              canShare={true}
              onClose={closeCampActions}
              onDelete={handleCampDeleteClick}
              onReport={handleReportCamp}
              onShare={shareCamp}
            />

            {/* Подтверждение удаления кэмпа */}
            <ConfirmModal
              open={confirmDeleteOpen}
              title="Удалить кэмп?"
              message="Это действие нельзя отменить."
              cancelLabel="Отмена"
              confirmLabel="Удалить"
              onCancel={() => setConfirmDeleteOpen(false)}
              onConfirm={async () => { await deleteCamp(); }}
            />

            {Number.isFinite(campIdNum) && campIdNum > 0 && (
              <>
            <CompleteProfileActionModal
                  open={completeProfileModalOpen}
                  onClose={() => setCompleteProfileModalOpen(false)}
                />
                <ReportAbuseModal
                  open={reportCampOpen}
                  onClose={() => setReportCampOpen(false)}
                  kind="camp"
                  targetId={campIdNum}
                  linkHint={getCanonicalCampUrl()}
                />
              </>
            )}

            <ConfirmModal
              open={authRequiredOpen}
              onCancel={() => setAuthRequiredOpen(false)}
              onConfirm={onLogin}
              title="Это действие доступно только авторизованным пользователям"
              cancelLabel="Отмена"
              confirmLabel="Войти"
            />
            <Dialog open={telegramPromptOpen} onOpenChange={setTelegramPromptOpen}>
                <DialogContent className="sm:max-w-[380px] rounded-xl p-6 focus:outline-none">
                    <h3 className="text-base font-semibold mb-2">Включить уведомления в Telegram?</h3>
                    <p className="text-sm text-gray-600 mb-4">
                        Мы будем присылать обновления этого кэмпа в Telegram.
                    </p>
                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            className="text-sm text-gray-600 hover:text-black"
                            onClick={() => setTelegramPromptOpen(false)}
                        >
                            Нет
                        </button>
                        <button
                            type="button"
                            className="text-sm font-semibold text-blue-600 hover:text-blue-700"
                            onClick={async () => {
                                setTelegramPromptOpen(false);
                                await startTelegramLinkFlow();
                            }}
                        >
                            Да
                        </button>
                    </div>
                </DialogContent>
            </Dialog>


          </div>
        </section>


        {/* RIGHT (1/3) */}
        <aside className="md:col-span-1">
          <div className="mt-16 md:mt-[88px] md:sticky md:top-[88px] md:h-[calc(100vh-88px)] md:overflow-hidden">
            <div className="px-4 pt-0 pb-4 rounded-2xl bg-white flex flex-col gap-3">
              <div className="flex items-center gap-2">
                {isSoldOut && (
                  <span className="shrink-0 px-2 py-0.5 rounded-md text-xs bg-black text-white">
                    SOLD&nbsp;OUT
                  </span>
                )}

                <div className="min-w-0">
                  {isHot && displayOriginal != null ? (
                    <div className="flex items-baseline gap-3">
                      <span className="text-2xl font-semibold text-red-600">
                        {fmtPrice(displayPrice, currency)}
                      </span>
                      <span className="line-through text-gray-400">
                        {fmtPrice(displayOriginal, currency)}
                      </span>
                    </div>
                  ) : (
                    <div className="text-2xl font-semibold">
                      {fmtPrice(displayPrice, currency)}
                    </div>
                  )}
                </div>
              </div>



              {(isKids || hasKidsCoach) && (
                <div className="flex flex-wrap gap-2">
                  {isKids && <Chip>Детский кэмп</Chip>}
                  {hasKidsCoach && <Chip>Будет детский тренер</Chip>}
                </div>
              )}

              {(start || end) && (
                <SmartDateRange
                  className="text-base text-gray-700 px-1"
                  start={start}
                  end={end}
                  long={dateRange}
                />
              )}


              {locationName && (
                <div className="text-base min-w-0 px-1">
                  <button
                    type="button"
                    onClick={goToMapSearch}
                    className="block w-full truncate text-left underline underline-offset-2 hover:no-underline text-black bg-transparent border-0 p-0"
                  >
                    {locationName}
                  </button>
                </div>
              )}

              {lat !== null && lng !== null ? (
                <MiniMap lat={lat} lng={lng} />
              ) : mapEmbedSrc && (
                <div className="mt-0 relative w-full aspect-[3/2] rounded-2xl overflow-hidden border border-gray-200">
                  <iframe
                    src={mapEmbedSrc}
                    className="absolute inset-0 w-full h-full"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    allowFullScreen
                  />

                  {/* Кнопка «Увеличить карту» поверх, вместо большой плашки */}
                  <button
                    type="button"
                    onClick={goToMapSearch}
                    className="absolute left-2 top-2 rounded-full bg-white/90 backdrop-blur px-3 py-1 text-sm border border-gray-200 hover:bg-white transition"
                  >
                    Показать на карте
                  </button>
                </div>
              )}


              <div className="h-px bg-gray-200 my-0" />

              <div className="flex flex-col gap-2">

                {telegram && (
                  <a
                    href={`https://t.me/${telegram}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50 inline-flex items-center justify-center gap-2"
                    aria-label="Открыть Telegram"
                  >
                    <Send className="w-4 h-4 text-[#229ED9]" />
                    @{telegram}
                  </a>
                )}

                {phone && (
                  <a
                    href={`tel:${phone}`}
                    className="px-3 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50 inline-flex items-center justify-center gap-2"
                    aria-label="Позвонить"
                  >
                    <PhoneIcon className="w-4 h-4 text-[#229ED9]" />
                    {phone}
                  </a>
                )}
                {website && (
                  <a
                    href={website.startsWith('http') ? website : `https://${website}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50 inline-flex items-center justify-center gap-2 truncate"
                    aria-label="Перейти на сайт"
                  >
                    <Globe className="w-4 h-4 text-[#229ED9]" />
                    <span className="truncate max-w-[16ch]">Сайт</span>
                  </a>
                )}
              </div>
              {/* лайк / подписка / шаринг */}
              <div className="mt-0 pt-2 border-t border-gray-200 flex justify-center">
                <div className="flex items-center gap-6 py-2">
                  <div className="flex items-center gap-2">

                    {/* ЛАЙК */}
                    <button
                      type="button"
                      onClick={toggleLike}
                      disabled={campBusyLike}
                      aria-pressed={campLiked}
                      title={campLiked ? 'Убрать лайк' : 'Поставить лайк'}
                      className={[
                        'inline-flex items-center justify-center w-9 h-9 rounded-full border text-gray-700 hover:bg-gray-50 transition',
                        campLiked ? 'border-red-500 text-red-600' : 'border-gray-300',
                        campBusyLike ? 'opacity-60 cursor-not-allowed' : ''
                      ].join(' ')}
                    >
                      <IconHeart filled={campLiked} />
                    </button>

                    {/* кликабельный счётчик лайков кэмпа */}
                    {campLikes > 0 && (
                      <button
                        type="button"
                        className="text-sm tabular-nums leading-none hover:underline"
                        onClick={() => openLikers({ kind: 'camp', campId: campIdNum })}
                        title="Кто лайкнул этот кэмп"
                      >
                        {campLikesDisp}
                      </button>
                    )}
                  </div>

                  {/* Счётчики кэмпа */}





                  {/* ПОДПИСКА */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={openSubscribersTab}
                      title="Подписчики"
                      className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
                    >
                      <IconUser />
                    </button>

                    {campSubs > 0 && (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); openSubscribersTab(); }}
                        title="Подписчики"
                        className="text-sm tabular-nums leading-none hover:underline"
                      >
                        {campSubsDisp}
                      </button>
                    )}
                  </div>



                  {/* КОММЕНТАРИИ */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openCommentsTab()}
                      title="Комментарии"
                      className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
                    >
                      <IconComment />
                    </button>

                    {campComments > 0 && (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); openCommentsTab(); }}
                        title="Комментарии"
                        className="text-sm tabular-nums leading-none hover:underline"
                      >
                        {campCommentsDisp}
                      </button>
                    )}
                  </div>


                  {/* ПОДЕЛИТЬСЯ */}
                  <button
                    type="button"
                    onClick={shareCamp}
                    title="Поделиться кэмпом"
                    className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
                  >
                    <IconShare />
                  </button>


                </div>
              </div>

              {/* ↓↓↓ Правый трей действий — центр и ближе к строке экшенов */}
              <div className="hidden md:block">
                <div className="overflow-hidden">
                  <div
                    className={[
                      'flex justify-center',           // центр по горизонтали
                      'transition-all duration-300 ease-out',
                      showRightActions
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 translate-y-3 pointer-events-none',
                      'mt-1'                          // слегка подтянуть вверх к строке экшенов
                    ].join(' ')}
                  >
                    {isOwner ? (
                      <div className="inline-flex items-center gap-2">
                        <button
                          className="px-4 py-2 rounded-full border border-gray-300 text-sm hover:bg-gray-50"
                          onClick={() => setPostModalOpen(true)}
                        >
                          Добавить пост
                        </button>
                        <button
                          className="px-4 py-2 rounded-full bg-black text-white text-sm hover:bg-black/90"
                          onClick={() => setEditOpen(true)}
                        >
                          Редактировать
                        </button>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={toggleSubscribe}
                          disabled={campBusySub}
                          aria-pressed={campSubscribed}
                          className={[
                            'px-4 py-2 rounded-full text-sm transition',
                            'bg-black text-white hover:bg-black/90',
                            campBusySub ? 'opacity-60 cursor-not-allowed' : '',
                          ].join(' ')}
                        >
                          {campSubscribed ? 'Отписаться' : 'Подписаться'}
                        </button>
                        <button
                          className="px-4 py-2 rounded-full border border-gray-300 text-sm hover:bg-gray-50"
                          onClick={() => { 
                            if (!authenticated) { setAuthRequiredOpen(true); return; }
                            if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
                            setProfilePostCreateOpen(true); 
                          }}
                        >
                          Отметить кэмп
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-0 h-4 text-xs text-gray-400 text-center" aria-live="polite">
                {copied && <span>Ссылка скопирована</span>}
              </div>

            </div>
          </div>
        </aside>


      </div>
    </div>

  );
}

const CURRENCY_SIGNS: Record<string, string> = {
  RUB: '₽',
  RUR: '₽',
  USD: '$',
  EUR: '€',
  KZT: '₸',
  TRY: '₺',
  GBP: '£',
  AED: 'د.إ',
  UAH: '₴',
  BYN: 'Br',
};


function getCurrencySign(code?: string) {
  return CURRENCY_SIGNS[(code || 'RUB').toUpperCase()] ?? code ?? '₽';
}

function isHttpUrlLike(v: string) {
  return /^https?:\/\//i.test(v);
}

function normalizeWebsite(v: string) {
  const t = v.trim();
  if (!t) return '';
  return isHttpUrlLike(t) ? t : `https://${t}`;
}

function isValidWebsite(input: string) {
  const v = normalizeWebsite(input);
  try {
    const u = new URL(v);
    // только http/https и реальный хост с точкой
    if (!/^https?:$/.test(u.protocol)) return false;
    if (!u.hostname || !u.hostname.includes('.')) return false;
    return true;
  } catch {
    return false;
  }
}


type EditPayload = {
  title: string;
  description: string;
  phone: string;
  website: string;
  telegram_nickname: string;
  is_sold_out: boolean;
  is_hot_deal: boolean;
  hot_deal_price: string;
};


function ExpandingTextareaEdit({
  value,
  onChange,
  placeholder = 'Описание',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const previewH = 144;
  const panelH = 540;
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);

  return (
    <>
      {/* свёрнутый превью-блок — не двигает форму */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen(true)}
        className="w-full overflow-y-auto text-sm text-black border-b border-gray-150 px-1 py-0 cursor-text whitespace-pre-wrap rounded-[2px]"
        style={{ minHeight: previewH, maxHeight: previewH }}
        aria-label="Редактировать описание"
      >
        {value?.trim() ? value : (
          <span className="text-gray-400 block mt-[20px]">{placeholder}</span>
        )}
      </div>

      {/* оверлей внутри модалки, центр через flex */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onKeyDownCapture={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setOpen(false);
              }
            }}
          >
            {/* фон */}
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setOpen(false)}
            />

            {/* карточка редактора */}
            <motion.div
              className="relative z-[61] w-[min(920px,92vw)] max-h-[92vh] bg-white rounded-xl shadow-xl border border-gray-200 p-4"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-500">Описание</div>
                {/* 🔴 кнопку "Готово" убрали */}
              </div>

              <textarea
                ref={taRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Опишите что поменялось: расписание, тренеры, проживание…"
                className="w-full bg-white border border-gray-300 focus:border-gray-400 focus:outline-none p-3 rounded-md text-sm placeholder:text-gray-400"
                style={{ height: panelH, minHeight: 320, maxHeight: '70vh' }}
              />

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600"
                  aria-label="Сохранить"
                >
                  ✓
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}


function validate(values: EditPayload) {
  const errors: string[] = [];
  if (!values.title || !values.title.trim()) {
    errors.push('Укажите название кэмпа.');
  }
  if (values.is_hot_deal) {
    const v = (values.hot_deal_price || '').trim();
    const n = Number(v.replace(',', '.'));
    if (!v || !Number.isFinite(n) || n <= 0) {
      errors.push('Цена hot deal должна быть числом больше 0.');
    }
  }
  return { ok: errors.length === 0, errors };
}


function EditCampModalDesktop({
  open,
  onClose,
  campId,
  initial,
  onApplied,
  currencyCode = 'RUB',
  onRefetch,
}: {
  open: boolean;
  onClose: () => void;
  campId: number;
  initial: EditPayload;
  onApplied: (next: EditPayload) => void;
  currencyCode?: string;
  onRefetch?: () => void | Promise<void>;
}) {
  const [values, setValues] = useState<EditPayload>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>('');
  const [descFocused, setDescFocused] = useState(false);
  const descContainerRef = useRef<HTMLDivElement | null>(null);

  const currencySign = useMemo(() => getCurrencySign(currencyCode), [currencyCode]);

  const TITLE_MAX = 50;
  const TITLE_LEN_MSG = 'допустимая длинна названия кэмпа 50 знаков';

  useEffect(() => {
    if (err === TITLE_LEN_MSG) {
      const t = setTimeout(() => setErr(''), 2000);
      return () => clearTimeout(t);
    }
  }, [err]);

  // ↓ рядом с другими memo
  const isWebsiteValid = React.useMemo(() => {
    if (!values.website) return true;
    return isValidWebsite(values.website);
  }, [values.website]);

  const validation = validate(values);

  useEffect(() => {
    if (!open) return;            // <-- условие внутрь эффекта
    setValues(initial);
    setErr('');
    setDescFocused(false);
  }, [open, initial]);

  useEffect(() => {
    if (!descFocused) return;     // <-- тоже внутрь
    const onClick = (e: MouseEvent) => {
      if (descContainerRef.current && !descContainerRef.current.contains(e.target as Node)) {
        setDescFocused(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [descFocused]);


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!API || !campId || saving) return;
    const v = validate(values);
    if (!v.ok) {
      setErr(v.errors[0] || 'Проверьте поля формы.');
      return;
    }

    // 🔎 Локальная валидация (как в CreateCampModal / forms.py)


    const phoneRegex = /^\+?[0-9 ()-]+$/;
    if (values.phone && !phoneRegex.test(values.phone)) {
      setErr('Номер телефона может содержать только цифры, пробелы, скобки и дефисы.');
      return;
    }

    if (values.telegram_nickname && values.telegram_nickname.includes('@')) {
      setErr("Укажите телеграм без символа '@'.");
      return;
    }


    if (!isWebsiteValid) {                      // ← стопим прямо тут
      setErr('Некорректный сайт.');
      return;
    }

    const websiteNormalized = normalizeWebsite(values.website);


    if (values.is_hot_deal) {
      const v = values.hot_deal_price.trim();
      if (!v) {
        setErr('Укажите цену для горячего предложения.');
        return;
      }
      const n = Number(v.replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0) {
        setErr('Цена hot deal должна быть числом больше 0.');
        return;
      }
    }

    const titleTrimmed = (values.title || '').trim();
    if (!titleTrimmed) {
      setErr('Укажите название кэмпа.');
      return;
    }
    if (titleTrimmed.length > TITLE_MAX) {
      setErr(TITLE_LEN_MSG);
      return;
    }

    // если всё ок — собираем payload
    const payload: EditPayload = {
      title: titleTrimmed,
      description: values.description.trim(),
      phone: values.phone.trim(),
      //website: normalizeWebsite(values.website),
      telegram_nickname: values.telegram_nickname.trim().replace(/^@+/, ''),
      is_sold_out: !!values.is_sold_out,
      is_hot_deal: !!values.is_hot_deal,
      hot_deal_price: values.is_hot_deal ? values.hot_deal_price.trim() : '',
      website: websiteNormalized,
    };

    setSaving(true);
    setErr('');
    try {
      await ensureCsrf();
      const body = new URLSearchParams();
      body.append('title', payload.title);
      body.append('description', payload.description);
      body.append('phone', payload.phone);
      body.append('website', payload.website);
      body.append('telegram_nickname', payload.telegram_nickname);
      body.append('is_sold_out', payload.is_sold_out ? 'true' : 'false');
      body.append('is_hot_deal', payload.is_hot_deal ? 'true' : 'false');
      body.append('hot_deal_price', payload.is_hot_deal ? payload.hot_deal_price : '');


      // основной запрос
      const r = await fetch(`${API}/camp/${campId}/edit/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-CSRFToken': getCsrf(),
          'X-Requested-With': 'XMLHttpRequest',
        },
        body,
      });

      const ct = r.headers.get('content-type') || '';
      let serverMsg = '';

      // пробуем достать понятное сообщение об ошибке из JSON
      if (ct.includes('application/json')) {
        const j = await r.json().catch(() => null);
        if (j) {
          serverMsg =
            (j.errors?.website && (Array.isArray(j.errors.website) ? j.errors.website[0] : j.errors.website)) ||
            (j.errors?.__all__ && (Array.isArray(j.errors.__all__) ? j.errors.__all__[0] : j.errors.__all__)) ||
            j.detail || j.message || '';
          if (j.ok === false) {
            throw new Error(serverMsg || 'Проверьте поля формы.');
          }
        }
      } else if (!r.ok) {
        // если не JSON — читаем текст ответа
        serverMsg = await r.text().catch(() => '');
      }

      if (!r.ok) {
        throw new Error(serverMsg || 'Проверьте поля формы.');
      }

      // успех
      onApplied(payload);
      onClose();
      await onRefetch?.();



    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : 'Не удалось сохранить изменения. Попробуйте позже.');
    } finally {
      setSaving(false);
    }
  }


  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving && !next) onClose(); }}>
      {open && (
        <DialogContent
          className="w-full max-w-2xl min-w-0 bg-white overflow-visible"
          style={{ maxHeight: '96vh' }}
          onOpenAutoFocus={(e) => e.preventDefault()}   // ← не фокусировать ничего при открытии
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {/* компактный алерт сверху — как в модалке профиля */}
          {err && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-red-100 border border-red-300 text-red-800 rounded-md text-sm shadow-md max-w-[90%] text-center">
              {err}
            </div>
          )}

          <div className="max-h-[92vh] overflow-y-auto px-1">
            <h2 className="text-lg font-semibold text-center mt-1">Редактировать кэмп</h2>

            <form onSubmit={handleSubmit} className="flex flex-col gap-y-3.5 px-1 mt-4 text-sm">

              {/* Название */}
              <div className="border-b border-gray-150">
                <div className="flex items-center min-w-0">
                  <span className="w-28 shrink-0 text-gray-400 text-sm px-1">Название</span>
                  <input
                    value={values.title}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (next.length > TITLE_MAX) {
                        setErr(TITLE_LEN_MSG);
                        setValues(v => ({ ...v, title: next.slice(0, TITLE_MAX) }));
                      } else {
                        setErr(prev => (prev === TITLE_LEN_MSG ? '' : prev));
                        setValues(v => ({ ...v, title: next }));
                      }
                    }}
                    onKeyDown={(e) => {
                      // показываем баннер, когда пользователь пытается печатать сверх лимита (maxLength заблокирует ввод)
                      const isChar = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
                      if (!isChar) return;
                      const el = e.currentTarget as HTMLInputElement;
                      const start = el.selectionStart ?? el.value.length;
                      const end = el.selectionEnd ?? start;
                      const currentLen = el.value.length - (end - start); // с учётом выделенного фрагмента
                      if (currentLen >= TITLE_MAX) setErr(TITLE_LEN_MSG);
                    }}
                    onPaste={(e) => {
                      // если вставка не помещается — покажем баннер (сам ввод ограничит maxLength)
                      const el = e.currentTarget as HTMLInputElement;
                      const paste = e.clipboardData.getData('text') ?? '';
                      const start = el.selectionStart ?? el.value.length;
                      const end = el.selectionEnd ?? start;
                      const free = TITLE_MAX - (el.value.length - (end - start));
                      if (paste.length > free) setErr(TITLE_LEN_MSG);
                    }}
                    className="w-0 flex-1 bg-transparent border-0 px-1 py-2 focus:outline-none"
                    placeholder="Например: Новогодний кэмп в горах"
                    maxLength={TITLE_MAX}
                    required
                  />

                </div>
              </div>


              {/* 1-я строка: Телефон | Telegram */}
              <div className="grid grid-cols-2 gap-4">
                {/* Телефон */}
                <div className="border-b border-gray-150">
                  <div className="flex items-center min-w-0">
                    <span className="w-28 shrink-0 text-gray-400 text-sm px-1">Телефон</span>
                    <input
                      value={values.phone}
                      onChange={e => setValues(v => ({ ...v, phone: e.target.value }))}
                      className="w-0 flex-1 bg-transparent border-0 px-1 py-2 focus:outline-none"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      pattern="\\+?[0-9 ()-]+"
                      placeholder="+7 (999) 888-77-66"
                    />
                  </div>
                </div>

                {/* Telegram */}
                <div className="border-b border-gray-150">
                  <div className="flex items-center min-w-0">
                    <span className="w-28 shrink-0 text-gray-400 text-sm px-1">Telegram</span>
                    <div className="flex items-center w-0 flex-1">
                      <span className="inline-flex items-center px-2 text-gray-500">@</span>
                      <input
                        value={values.telegram_nickname}
                        onChange={e => setValues(v => ({
                          ...v,
                          telegram_nickname: e.target.value.replace(/^@+/, ''),
                        }))}
                        className="w-0 flex-1 bg-transparent border-0 px-1 py-2 focus:outline-none"
                        placeholder="username"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 2-я строка: Сайт */}
              <div className="border-b border-gray-150">
                <div className="flex items-center min-w-0">
                  <span className="w-28 shrink-0 text-gray-400 text-sm px-1">Сайт</span>
                  <input
                    value={values.website}
                    onChange={e => setValues(v => ({ ...v, website: e.target.value }))}
                    className="w-0 flex-1 bg-transparent border-0 px-1 py-2 focus:outline-none"
                    placeholder="https://example.com"
                  />
                </div>
              </div>

              <div className="text-gray-400 text-sm px-1">Описание</div>


              {/* Описание с тем же UX, что в модалке создания */}
              <ExpandingTextareaEdit
                value={values.description}
                onChange={(t) => setValues(v => ({ ...v, description: t }))}
                placeholder="Описание"
              />

              <div className="grid grid-cols-4 gap-4 mt-1 items-center">
                {/* 1/4 — Sold out */}
                <label className="flex items-center gap-2 py-2 px-3 rounded-md select-none cursor-pointer">
                  <input
                    type="checkbox"
                    checked={values.is_sold_out}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, is_sold_out: e.target.checked }))
                    }
                    className="h-4 w-4"
                    
                  />
                  <span className="font-medium">Sold out</span>
                </label>

                {/* 2/4 — Горящее предложение */}
                <label className="flex items-center gap-2 py-2 px-3 rounded-md select-none cursor-pointer">
                  <input
                    type="checkbox"
                    checked={values.is_hot_deal}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        is_hot_deal: e.target.checked,
                        hot_deal_price: e.target.checked ? v.hot_deal_price : "",
                      }))
                    }
                    className="h-4 w-4"
                  />
                  <span className="font-medium">Горящее предложение</span>
                </label>

                {/* 3-4/4 — Правая половина */}
                <div className="col-span-2">
                  {values.is_hot_deal && (
                    <div className="grid grid-cols-3 gap-2 items-center">
                      {/* 1/3 — Лейбл */}
                      <span className="text-gray-400 text-sm px-1">Новая цена</span>

                      {/* 2/3 — Подчеркнутый инпут */}
                      <div className="relative col-span-2 flex items-center">
                        <input
                          inputMode="decimal"
                          type="text"
                          value={values.hot_deal_price}
                          onChange={(e) => {
                            const t = e.target.value.replace(/[^\d.,]/g, "");
                            setValues((v) => ({ ...v, hot_deal_price: t }));
                          }}

                          className="w-full bg-transparent border-0 border-b border-gray-300 px-1 py-2 pr-6 focus:outline-none placeholder:text-gray-400 text-sm"
                          aria-label="Новая цена по акции"
                        />
                        <span className="absolute right-1 bottom-2 text-sm text-gray-600 select-none">
                          {currencySign}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>


              <Button
                type="submit"
                disabled={saving || !validation.ok || !isWebsiteValid}
                className="w-full bg-black text-white py-2 rounded-full hover:bg-black/80 transition"
              >
                {saving ? 'Сохраняем…' : 'Сохранить изменения'}
              </Button>
            </form>

          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

//
