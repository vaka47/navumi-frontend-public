'use client';

import React, {
  useState, useMemo, useEffect, useLayoutEffect,
  useRef, useCallback,
} from 'react';
import Link from 'next/link';
import { flushSync, createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { dateOnly } from '@/components/comments/shared';
import { useAuth } from '@/context/AuthContext';
import CreateCampPostModalDesktop from '@/components/camp/CreateCampPostModalDesktop';
import CreateCampPostMobile from '@/components/camp/CreateCampPostMobile';
import CreatePostModal from '@/components/post/CreatePostModal';
import ReportAbuseModal from '@/components/common/ReportModal';
import { hasTemporaryToken } from '@/lib/checkTemporaryToken';
import CompleteProfileActionModal from '@/components/CompleteProfileActionModal';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import {
  CAMP_POST_CREATED_EVENT,
  type CampPostCreatedDetail,
  CAMP_COMMENT_CREATED_EVENT,
  type CampCommentCreatedDetail,
  CAMP_MARK_ADDED_EVENT,
  emitCampCommentCreated,
} from '@/lib/campPostEvents';
import { rememberHere } from '@/lib/navBack';
import { setPostFeedContext } from '@/lib/postFeedContext';
import SmartImage from '@/components/SmartImage';
import HeartIcon from '@/components/ui/HeartIcon';
import { useAppNavigation } from '@/hooks/useAppNavigation';
import { useLayerStack } from '@/context/LayerStackContext';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';
import { getBrowserApiBase } from '@/lib/apiBase';
import MentionedProfileInline from '@/components/post/MentionedProfileInline';


/* =========================
   БАЗОВЫЕ КОНСТАНТЫ/ТИПЫ
========================= */

const API = getBrowserApiBase();

const TABS = ['comments', 'posts', 'marks', 'subscribers'] as const;
const FEED_TAB_VALUES: readonly typeof TABS[number][] = [...TABS];
type Tab = typeof TABS[number];

export type CampFeedTab = Tab;

export type FeedViewer = {
  username?: string;
  isOrganizer?: boolean; // текущий пользователь — организатор этого кэмпа
  isOwner?: boolean;     // = isOrganizer || есть права владельца (если отличаешь)
};


const LEGACY_TAB_ALIASES: Record<string, Tab> = { info: 'comments' };

type UnknownRecord = Record<string, unknown>;
export type Camp = { id: number | string };

const rememberProfileReturn = (hash?: string) => {
  if (hash && !hash.startsWith('#')) {
    rememberHere('profile', `#${hash}`);
    return;
  }
  rememberHere('profile', hash || '');
};

function useProfileReturnNavigation() {
  const { navigateProfile } = useAppNavigation();
  return React.useCallback((
    event: React.MouseEvent<HTMLElement>,
    username?: string | null,
    hash?: string,
  ) => {
    const target = (username ?? '').replace(/^@+/, '').trim();
    if (!target) return false;
    if (hash) {
      rememberProfileReturn(hash);
    }
    return navigateProfile(event, { username: target }, hash ? { remember: false } : undefined);
  }, [navigateProfile]);
}

type CommentUser = { username: string; avatar: string | null };
type CommentItem = {
  id: number;
  author: CommentUser;
  content: string;
  is_deleted: boolean;
  likes_count: number;
  created_at: string;
  can_delete: boolean;
  replies: CommentItem[];
  liked_by_me?: boolean;
  root_comment_id?: number | null;
};

type CampPost = {
  id: number;
  title: string | null;
  content: string | null;
  image: string | null;
  created_at: string;
  replies_count?: number;
  likes_count?: number;
  liked_by_me?: boolean;
  can_delete?: boolean;
  root_comment_id?: number;
  is_pinned?: boolean;
};

export function useFixedViewportHeight(
  headerRef: React.RefObject<HTMLElement | null>,
  stickyTopPx?: number,
) {
  const [h, setH] = React.useState<number | null>(null);

  const recalc = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    const header = headerRef.current;
    const rootStyle = getComputedStyle(document.documentElement);
    const bottomGap = parseFloat(rootStyle.getPropertyValue('--bottom-gap') || '0') || 0;

    const headerHeight = header?.offsetHeight ?? 0;
    const top = (typeof stickyTopPx === 'number' && Number.isFinite(stickyTopPx))
      ? Math.max(0, stickyTopPx) + headerHeight
      : header
        ? Math.max(0, header.getBoundingClientRect().bottom)
        : 0;

    const next = Math.max(160, window.innerHeight - top - bottomGap);
    setH(next);
  }, [headerRef, stickyTopPx]);

  React.useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    recalc();
    const onResize = () => recalc();
    const onScroll = () => recalc();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
    };
  }, [recalc]);

  return h;
}

const COMMENT_LIKE_KEYS: string[] = [
  'liked_by_me',
  'liked',
  'is_liked',
  'likedByMe',
  'isLiked',
  'liked_by_current_user',
];

async function fetchCampPostsList(apiBase: string, campId: number, signal?: AbortSignal): Promise<CampPost[]> {
  if (!apiBase || !campId) return [];
  const url = `${apiBase}/api/camps/${campId}/posts/`;
  const tryFetch = async (cred: RequestCredentials) => {
    const opts: RequestInit = { credentials: cred, cache: 'no-store' };
    if (signal) opts.signal = signal;
    return fetch(url, opts);
  };
  let r: Response | null = null;
  try {
    r = await tryFetch('include');
    if (!r.ok && (r.status === 401 || r.status === 403)) throw new Error(String(r.status));
  } catch {
    try { r = await tryFetch('omit'); } catch { /* noop */ }
  }
  if (!r || !r.ok) throw new Error(String(r ? r.status : 'fetch_failed'));
  const j: unknown = await r.json();
  const root = j as UnknownRecord;
  const arr: UnknownRecord[] = Array.isArray(j)
    ? (j as UnknownRecord[])
    : Array.isArray(root['results'])
      ? (root['results'] as UnknownRecord[])
      : Array.isArray(root['posts'])
        ? (root['posts'] as UnknownRecord[])
        : [];
  const norm: CampPost[] = arr.map((it) => ({
    id: Number(it['id']),
    title: pickString(it, ['title']),
    content: pickString(it, ['content', 'text']),
    image: absUrl(pickString(it, ['image']) || undefined),
    created_at: pickString(it, ['created_at']) || '',
    replies_count: pickNumber(it, ['replies_count']) ?? 0,
    likes_count: pickNumber(it, ['likes_count', 'likes']) ?? 0,
    liked_by_me: !!pickBool(it, COMMENT_LIKE_KEYS),
    can_delete: !!pickBool(it, ['can_delete']),
    root_comment_id: pickNumber(it, ['root_comment_id', 'root_comment', 'root_id', 'comment_root_id', 'thread_root_id', 'thread_root', 'root']) ?? undefined,
    is_pinned: !!pickBool(it, ['is_pinned', 'pinned']),
  })).filter((p) => Number.isFinite(p.id));

  norm.sort(sortPostsByCreatedDesc);
  const pinned = norm.find(p => p.is_pinned);
  return pinned ? [pinned, ...norm.filter(x => x.id !== pinned.id)] : norm;
}




type SimpleUser = { id: number; username: string; avatar: string | null };
type LikeSource =
  | { kind: 'comment'; id: number }
  | { kind: 'post'; campId: number; id: number }
  | { kind: 'camp'; campId: number };

const fadeCollapse = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, height: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 },
  transition: { duration: 0.18 },
} as const;

/* =========================
   УТИЛИТЫ (без any)
========================= */

const isString = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

const asNumber = (v: unknown): number | null => {
  if (isNum(v)) return v;
  if (isString(v) && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
};
// Рендерит текст с кликабельными @username по всей строке (не только в начале)
function renderLeadingMentionAsLink(text: string): React.ReactNode {
  return <MentionedProfileInline text={text} />;
}
function pickString(obj: UnknownRecord, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (isString(v) && v.trim()) return v.trim();
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
function pickDateString(obj: UnknownRecord, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (isString(v) && v.trim()) return v;
  }
  return null;
}
function absUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const s0 = String(url).trim();
  if (!s0 || s0.toLowerCase() === 'null' || s0.toLowerCase() === 'undefined') return null;
  if (/^gs:\/\//i.test(s0)) {
    const m = s0.match(/^gs:\/\/([^/]+)\/(.+)$/i);
    if (!m) return null;
    const bucket = m[1]; const object = m[2];
    const mediaBase = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL || '').replace(/\/+$/, '');
    return mediaBase ? `${mediaBase}/${object}` : `https://storage.googleapis.com/${bucket}/${object}`;
  }
  if (/^https?:\/\/storage\.cloud\.google\.com\//i.test(s0)) {
    return s0.replace(/^https?:\/\/storage\.cloud\.google\.com\//i, 'https://storage.googleapis.com/');
  }
  if (/^(https?:)?\/\//i.test(s0) || s0.startsWith('data:') || s0.startsWith('blob:')) return s0;
  const path = s0.startsWith('/') ? s0 : '/' + s0;
  const apiBase = API;
  const mediaBase = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL || '').replace(/\/+$/, '');
  const isMedia = /^\/(media|uploads|static|profile_pictures|avatars?)\//i.test(path);
  if (isMedia) return mediaBase ? mediaBase + path : path;
  return apiBase ? apiBase + path : path;
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

// lazy-лоад статусы
function useDelayedTrue(on: boolean, ms = 120) {
  const [v, setV] = React.useState(false);
  React.useEffect(() => {
    if (on) {
      const t = setTimeout(() => setV(true), ms);
      return () => clearTimeout(t);
    }
    setV(false);
  }, [on, ms]);
  return v;
}

type CacheSetter<T> = (next: T | null | ((prev: T | null) => T | null)) => void;
function useSessionCache<T>(key: string, initial: T | null = null) {
  const [val, setVal] = React.useState<T | null>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  const setCached = React.useCallback<CacheSetter<T>>((next) => {
    setVal((prev) => {
      const v = typeof next === 'function'
        ? (next as (p: T | null) => T | null)(prev)
        : next;
      try {
        if (v == null) sessionStorage.removeItem(key);
        else sessionStorage.setItem(key, JSON.stringify(v));
      } catch { }
      return v;
    });
  }, [key]);

  return [val, setCached] as const;
}

// кто скроллер
const findScrollParent = (el: HTMLElement | null): HTMLElement | null => {
  let n: HTMLElement | null = el?.parentElement ?? null;
  while (n) {
    const cs = getComputedStyle(n);
    const oy = (cs.overflowY || cs.overflow) as string;
    if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') return n;
    n = n.parentElement;
  }
  return null;
};

type AnchorPadState = { target: number; filler: number } | null;

type AnchorSwitchOpts = {
  resetToTop?: boolean;
  alignToTop?: boolean;
};

function useTabSwitchAnchor(
  anchorRef: React.RefObject<HTMLElement | null>,
  setPad?: React.Dispatch<React.SetStateAction<AnchorPadState>>,
  stickyTopPx?: number,
) {
  const busyRef = React.useRef(false);

  return React.useCallback(
    (mutate: () => void, opts?: AnchorSwitchOpts) => {
      if (busyRef.current) return;

      const anchor = anchorRef.current;
      const scroller = findScrollParent(anchor);
      const getTop = () => (scroller ? scroller.scrollTop : window.scrollY);
      const setTop = (val: number) => {
        if (scroller) scroller.scrollTop = val;
        else window.scrollTo({ top: val });
      };
      const getViewportH = () => (scroller ? scroller.clientHeight : window.innerHeight);
      const getScrollEl = () => (scroller ?? document.documentElement);
      const getMaxScroll = () => {
        const viewportH = getViewportH();
        if (viewportH <= 0) return 0;
        return Math.max(0, getScrollEl().scrollHeight - viewportH);
      };

      const target = (scroller ?? document.documentElement) as HTMLElement;
      const prevBehavior = target.style.scrollBehavior;

      busyRef.current = true;
      target.style.scrollBehavior = 'auto';

      // 👉 режим: при переключении вкладки всегда скроллим в самый верх
      if (opts?.resetToTop) {
        flushSync(mutate);
        // на всякий случай убираем возможную «прокладку»
        if (setPad) flushSync(() => setPad(prev => (prev ? null : prev)));
        requestAnimationFrame(() => {
          setTop(0);
          target.style.scrollBehavior = prevBehavior;
          busyRef.current = false;
        });
        return;
      }

      // если нет якоря — просто применяем изменения и выходим
      if (!anchor) {
        flushSync(mutate);
        if (setPad) flushSync(() => setPad(prev => (prev ? null : prev)));
        requestAnimationFrame(() => {
          target.style.scrollBehavior = prevBehavior;
          busyRef.current = false;
        });
        return;
      }

      // ===== классический режим «сохранить положение» =====
      const topBefore = anchor.getBoundingClientRect().top;
      const scrollBefore = getTop();
      const absoluteBefore = scrollBefore + topBefore;

      flushSync(mutate);

      requestAnimationFrame(() => {
        const topAfter = anchor.getBoundingClientRect().top;
        const stickyTop = (() => {
          if (typeof stickyTopPx === 'number') return Math.max(0, stickyTopPx);
          const cssTopRaw = anchor ? getComputedStyle(anchor).top : '0';
          const parsed = parseFloat(cssTopRaw || '0');
          return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
        })();

        let scrollTarget = absoluteBefore - topAfter;
        if (opts?.alignToTop) {
          const delta = Math.max(0, topAfter - stickyTop);
          scrollTarget = scrollBefore + delta;
        }

        let maxScroll = getMaxScroll();

        if (scrollTarget > maxScroll && setPad) {
          const fillerNeeded = Math.ceil(scrollTarget - maxScroll);
          flushSync(() => {
            setPad(prev => {
              const next: AnchorPadState = {
                target: scrollTarget,
                filler: Math.max(0, fillerNeeded),
              };
              if (
                prev &&
                Math.abs(prev.filler - next.filler) < 1 &&
                Math.abs(prev.target - next.target) < 1
              ) {
                return prev;
              }
              return next;
            });
          });
          maxScroll = getMaxScroll();
        } else if (setPad) {
          flushSync(() => {
            setPad(prev => (prev ? null : prev));
          });
          maxScroll = getMaxScroll();
        }

        const clamped = Math.max(0, Math.min(scrollTarget, maxScroll));
        setTop(clamped);

        target.style.scrollBehavior = prevBehavior;
        busyRef.current = false;
      });
    },
    [anchorRef, setPad, stickyTopPx]
  );
}



// позиция replies относительно видимой области
function getObservedRepliesPos(rootHost: HTMLElement | null, rootEl: HTMLElement | null) {
  const rr = rootEl ? rootEl.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  if (!rootHost) return { pos: 'inside' as 'above' | 'inside' | 'below', inView: true, rr };
  const hr = rootHost.getBoundingClientRect();
  const controls = rootHost.querySelector('[data-replies-controls]') as HTMLElement | null;
  let bottom = hr.bottom;
  if (controls) bottom = Math.max(bottom, controls.getBoundingClientRect().bottom);
  const top = hr.top;
  const EPS = 1, MARGIN = 8;
  const above = bottom <= rr.top + EPS + MARGIN;
  const below = top >= rr.bottom - EPS;
  const inView = !(above || below);
  const pos: 'above' | 'inside' | 'below' = inView ? 'inside' : (above ? 'above' : 'below');
  return { pos, inView, rr };
}

// есть ли развёрнутый CollapsibleText в зоне видимости
function hasExpandedReplyInView(rootHost: HTMLElement, rootEl: HTMLElement | null) {
  const rr = rootEl ? rootEl.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  const el = rootHost.querySelector(
    '[aria-expanded="true"], [data-expanded="true"], [data-collapsible-expanded="true"], .is-expanded, .expanded, .open'
  ) as HTMLElement | null;
  if (!el) return false;
  const host = (el.closest('li') as HTMLElement) || el;
  const r = host.getBoundingClientRect();
  const MARGIN = 6;
  const verticallyInView = r.bottom > rr.top + MARGIN && r.top < rr.bottom - MARGIN;
  return verticallyInView;
}

const SCROLL_HANDOFF_GAP_PX = 120; // Увеличиваем зону плавного перехода

function TabViewport({
  //loading,
  status,
  className = '',
  children,
  //resetSignal,
  // 🆕 кто прилипает (контейнер шапки с вкладками)
  headerRef: _headerRef,
  stuck = false,
  currentTab = 'comments', // 🆕 текущая вкладка для оптимизации скролла
  fixedHeightMode = false, // 🆕 режим фиксированной высоты
  fixedViewportHeight, // 🆕 фиксированная высота viewport'а
}: {
  loading: boolean;
  status?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  resetSignal?: unknown;
  headerRef?: React.RefObject<HTMLElement | null>; // 🆕
  stuck?: boolean;                            // 🆕
  currentTab?: Tab;                           // 🆕
  fixedHeightMode?: boolean;                  // 🆕
  fixedViewportHeight?: number;               // 🆕
}) {
  void _headerRef;
  const ref = React.useRef<HTMLDivElement | null>(null);
  const statusRef = React.useRef<HTMLDivElement | null>(null);
  //const [lockH,] = React.useState<number | null>(null);
  const [statusH,] = React.useState(0);
  const pointerInsideRef = React.useRef(false);
  const scrollParentRef = React.useRef<HTMLElement | Window | null>(null);
  const lastScrollTimeRef = React.useRef(0);
  const scrollDirectionRef = React.useRef<'up' | 'down' | null>(null);
  const scrollVelocityRef = React.useRef(0);
  const lastDeltaRef = React.useRef(0);

  // Функция для получения оптимальных параметров скролла в зависимости от типа вкладки
  const getScrollParams = (tab: Tab) => {
    switch (tab) {
      case 'comments':
        return { gapMultiplier: 1.0, thresholdMultiplier: 1.0, smoothingFactor: 0.7 };
      case 'posts':
        return { gapMultiplier: 1.2, thresholdMultiplier: 0.8, smoothingFactor: 0.5 };
      case 'subscribers':
        return { gapMultiplier: 1.1, thresholdMultiplier: 0.9, smoothingFactor: 0.6 };
      case 'marks':
        return { gapMultiplier: 1.2, thresholdMultiplier: 0.8, smoothingFactor: 0.5 };
      default:
        return { gapMultiplier: 1.0, thresholdMultiplier: 1.0, smoothingFactor: 0.7 };
    }
  };




  // === вычисляем видимую высоту ТОЛЬКО когда шапка прилипла ===
  const [maxH, setMaxH] = React.useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = React.useState(false);
  const [initialHeight, setInitialHeight] = React.useState<number | null>(null);
  const hasBeenStuckRef = React.useRef(false); // 🆕 Отслеживаем, было ли приклеивание

  // === вычисляем/фиксируем высоту вьюпорта
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 👉 если пришёл фиксированный размер — просто ставим его и выходим
    if (fixedHeightMode && typeof fixedViewportHeight === 'number') {
      const h = Math.max(160, fixedViewportHeight);
      setMaxH(h);
      setIsTransitioning(false);
      hasBeenStuckRef.current = true; // не важно, прилип хедер или нет — высота фикс
      return;
    }

    // ↓↓↓ прежняя логика, если фикс-режим не используется
    if (!stuck) {
      setIsTransitioning(true);
      const timer = setTimeout(() => {
        setMaxH(null);
        hasBeenStuckRef.current = false;
        setInitialHeight(null);
        setIsTransitioning(false);
      }, 100);
      return () => clearTimeout(timer);
    }

    setIsTransitioning(true);
    hasBeenStuckRef.current = true;

    const compute = () => {
      let h: number;
      if (initialHeight === null) {
        const top = el.getBoundingClientRect().top;
        const bottomGap = parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--bottom-gap') || '0'
        ) || 0;
        const calculatedHeight = Math.max(160, window.innerHeight - top - bottomGap);
        setInitialHeight(calculatedHeight);
        h = calculatedHeight;
      } else {
        h = initialHeight;
      }
      setMaxH(h);
      setTimeout(() => setIsTransitioning(false), 50);
    };

    const timer = setTimeout(compute, 16);
    const onResize = () => { if (initialHeight === null) compute(); };
    window.addEventListener('resize', onResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, [stuck, fixedHeightMode, fixedViewportHeight, initialHeight]);



  // сброс внутреннего скролла при смене вкладки
  // сброс внутреннего скролла/поддержка прежнего поведения
  React.useLayoutEffect(() => {
    // 👉 в фикс-режиме высота уже задана — тут ничего не пересчитываем
    if (fixedHeightMode && typeof fixedViewportHeight === 'number') {
      setMaxH(Math.max(160, fixedViewportHeight));
      return;
    }

    const el = ref.current;
    if (!el) return;

    const compute = () => {
      let top: number;
      const hdr = _headerRef?.current || null;
      if (hdr) {
        top = Math.max(0, hdr.getBoundingClientRect().bottom);
      } else {
        top = el.getBoundingClientRect().top;
      }
      const bottomGap = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--bottom-gap') || '0'
      ) || 0;
      const h = Math.max(160, window.innerHeight - top - bottomGap);
      setMaxH(h);
    };

    compute();
    const onResize = () => compute();
    const onScroll = () => compute();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
    };
  }, [_headerRef, fixedHeightMode, fixedViewportHeight]);


  // ↓ раньше у тебя buffer всегда добавлялся — уберём его при stuck,
  //   чтобы «внешняя» высота не гуляла и внутренний скролл был честным.
  // Изменяем логику: используем консистентный буфер для предотвращения изменения высоты viewport
  const bottomBuffer =
    currentTab === 'comments'
      ? '0px'
      : 'calc(var(--bottom-gap, 0px) + 24px)';


  // const handlePointerEnter = React.useCallback(() => {
  //   pointerInsideRef.current = true;
  // }, []);

  // const handlePointerLeave = React.useCallback(() => {
  //   pointerInsideRef.current = false;
  // }, []);

  React.useEffect(() => {
    if (!stuck) {
      pointerInsideRef.current = false;
    }
  }, [stuck]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!stuck) {
      scrollParentRef.current = null;
      return;
    }
    const host = ref.current;
    if (!host) return;
    const parent = findScrollParent(host);
    scrollParentRef.current = parent ?? window;
  }, [stuck]);

  React.useEffect(() => {
    if (!stuck) return;
    const el = ref.current;
    if (!el) return;

    const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

    const applyScrollDelta = (deltaY: number) => {
      if (!el) return 0;
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      if (max <= 0) return 0;
      const prev = el.scrollTop;
      const next = Math.max(0, Math.min(max, prev + deltaY));
      el.scrollTop = next;
      return next - prev;
    };

    const scrollOuter = (deltaY: number) => {
      if (!deltaY) return;
      const target = scrollParentRef.current;
      if (!target) return;
      if (target === window) {
        window.scrollBy({ top: deltaY, behavior: 'auto' });
      } else {
        const node = target as HTMLElement;
        const max = Math.max(0, node.scrollHeight - node.clientHeight);
        if (max <= 0) return;
        node.scrollTop = Math.max(0, Math.min(max, node.scrollTop + deltaY));
      }
    };

    const distributeDelta = (deltaY: number) => {
      if (deltaY === 0) return;

      const now = performance.now();
      const timeSinceLastScroll = now - lastScrollTimeRef.current;
      lastScrollTimeRef.current = now;

      // Вычисляем скорость скролла для адаптивной логики
      const velocity = timeSinceLastScroll > 0 ? Math.abs(deltaY) / timeSinceLastScroll : 0;
      scrollVelocityRef.current = velocity;

      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      if (max <= 0) {
        scrollOuter(deltaY);
        return;
      }

      // Адаптивная зона перехода в зависимости от скорости скролла и типа вкладки
      const scrollParams = getScrollParams(currentTab);
      const baseGap = Math.min(SCROLL_HANDOFF_GAP_PX, max / 1.5);
      const velocityMultiplier = Math.min(2, Math.max(0.5, 1 + velocity * 0.1));
      const gap = baseGap * velocityMultiplier * scrollParams.gapMultiplier;

      const topBefore = el.scrollTop;
      let shareRatio = 0;

      // Определяем направление скролла
      const currentDirection = deltaY > 0 ? 'down' : 'up';
      const directionChanged = scrollDirectionRef.current && scrollDirectionRef.current !== currentDirection;
      scrollDirectionRef.current = currentDirection;

      if (deltaY > 0) {
        const distanceDown = Math.max(0, max - topBefore);
        if (gap > 0 && distanceDown < gap) {
          // Используем более плавную кривую для shareRatio
          const normalizedDistance = distanceDown / gap;
          shareRatio = clamp01(Math.pow(1 - normalizedDistance, 1.5)); // Более мягкая кривая
        } else if (distanceDown <= 0) {
          shareRatio = 1;
        }
      } else {
        const distanceUp = Math.max(0, topBefore);
        if (gap > 0 && distanceUp < gap) {
          // Используем более плавную кривую для shareRatio
          const normalizedDistance = distanceUp / gap;
          shareRatio = clamp01(Math.pow(1 - normalizedDistance, 1.5)); // Более мягкая кривая
        } else if (distanceUp <= 0) {
          shareRatio = 1;
        }
      }

      // Улучшенная логика стабилизации при смене направления
      if (directionChanged) {
        if (timeSinceLastScroll < 50) {
          shareRatio = Math.max(0, shareRatio - 0.4);
        }
        // Дополнительная стабилизация при высокой скорости
        if (velocity > 2) {
          shareRatio = Math.max(0, shareRatio - 0.2);
        }
      }

      // Смягчаем резкие изменения deltaY с учетом типа вкладки
      const smoothingFactor = scrollParams.smoothingFactor;
      const smoothedDelta = lastDeltaRef.current * (1 - smoothingFactor) + deltaY * smoothingFactor;
      lastDeltaRef.current = smoothedDelta;

      const innerDelta = smoothedDelta * (1 - shareRatio);
      const consumed = applyScrollDelta(innerDelta);
      const leftover = smoothedDelta - consumed;

      // Адаптивный порог для передачи скролла внешнему контейнеру
      const baseThreshold = Math.max(1, 3 - velocity * 0.5);
      const threshold = baseThreshold * scrollParams.thresholdMultiplier;
      if (Math.abs(leftover) > threshold) {
        scrollOuter(leftover);
      }
    };

    const shouldIntercept = (eventTarget: EventTarget | null) => {
      if (!eventTarget) return false;
      if (pointerInsideRef.current) return true;
      if (!(eventTarget instanceof Node)) return false;
      return el.contains(eventTarget);
    };

    const onWheel = (event: WheelEvent) => {
      if (!shouldIntercept(event.target)) return;

      const deltaMode = event.deltaMode;
      const lineUnit = event.DOM_DELTA_LINE ?? 1;
      const pageUnit = event.DOM_DELTA_PAGE ?? 2;
      const factor = deltaMode === lineUnit
        ? 16
        : deltaMode === pageUnit
          ? el.clientHeight
          : 1;
      const deltaY = event.deltaY * factor;

      if (deltaY === 0) return;

      // Дополнительная проверка для предотвращения слишком резких движений
      const now = performance.now();
      const timeSinceLastScroll = now - lastScrollTimeRef.current;

      // Ограничиваем частоту обработки wheel событий для стабильности
      if (timeSinceLastScroll < 8) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      distributeDelta(deltaY);
    };

    let touchStartY = 0;

    const onTouchStart = (event: TouchEvent) => {
      if (!shouldIntercept(event.target)) return;
      pointerInsideRef.current = true;
      touchStartY = event.touches[0]?.clientY ?? 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!shouldIntercept(event.target)) return;
      if (event.touches.length !== 1) return;
      const currentY = event.touches[0]?.clientY ?? 0;
      const deltaY = touchStartY - currentY;

      // Добавляем минимальный порог для предотвращения микро-движений
      if (Math.abs(deltaY) < 2) {
        return;
      }

      touchStartY = currentY;
      event.preventDefault();
      event.stopPropagation();
      distributeDelta(deltaY);
    };

    const onTouchEnd = () => {
      pointerInsideRef.current = false;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [stuck]);

  return (
    <div
      ref={ref}
      className={`tab-viewport relative min-h-0 ${maxH != null ? 'overflow-y-auto' : 'overflow-visible'} ${className}`}
      style={{
        ...(maxH != null ? {
          height: maxH,
          maxHeight: maxH,
          minHeight: maxH,      // ← не даём схлопнуться даже на пустых вкладках
        } : null),
        overscrollBehavior: 'contain',
        overscrollBehaviorY: 'contain',
        WebkitOverflowScrolling: 'touch',
        scrollBehavior: 'auto',
        transition: isTransitioning ? 'height 0.1s ease-out' : 'none',
        flexShrink: 0,
      }}
    >
      {status ? (
        <div className="absolute inset-x-0 top-0 z-10 pointer-events-none">
          <div ref={statusRef} className="px-4 py-3 text-gray-500" style={{ pointerEvents: 'auto' }}>
            {status}
          </div>
        </div>
      ) : null}
      <div style={statusH ? { paddingTop: statusH } : undefined}>
        {children}
        <div
          aria-hidden
          className="pointer-events-none"
          style={{ height: `var(--feed-bottom-buffer, ${bottomBuffer})` }}
        />
      </div>
    </div>
  );
}





// --- НОРМАЛИЗАЦИЯ КОММЕНТОВ ---

function normalizeUser(u?: UnknownRecord | null): CommentUser {
  const username = pickString(u ?? {}, ['username', 'login', 'nick', 'name']) || '';
  const avatar = absUrl(pickString(u ?? {}, ['avatar', 'avatar_url', 'profile_picture', 'photo', 'photo_url', 'image']) || undefined);
  return { username, avatar: avatar ?? null };
}

function normalizeComment(o: UnknownRecord): CommentItem {
  const repliesRaw: unknown =
    o['replies'] ?? o['children'] ?? o['comments'] ?? [];
  const authorRaw: UnknownRecord | null =
    (typeof o['author'] === 'object' && o['author']) ? (o['author'] as UnknownRecord) :
      (typeof o['user'] === 'object' && o['user']) ? (o['user'] as UnknownRecord) :
        null;

  const id = pickNumber(o, ['id', 'pk']) ?? 0;
  const content = pickString(o, ['content', 'text', 'body']) || '';
  const is_deleted = !!pickBool(o, ['is_deleted', 'deleted']);
  const likes_count = pickNumber(o, ['likes_count', 'likes']) ?? 0;
  const created_at = pickDateString(o, ['created_at', 'createdAt', 'date', 'timestamp']) || new Date().toISOString();
  const can_delete = !!pickBool(o, ['can_delete', 'canDelete']);
  const liked_by_me = !!pickBool(o, COMMENT_LIKE_KEYS);

  const repliesArr: UnknownRecord[] = Array.isArray(repliesRaw) ? repliesRaw as UnknownRecord[] : [];

  return {
    id,
    author: normalizeUser(authorRaw),
    content,
    is_deleted,
    likes_count,
    created_at,
    can_delete,
    liked_by_me,
    replies: repliesArr.map(normalizeComment),
  };
}

// --- ВРЕМЯ МОЕГО ПОСЛЕДНЕГО ОТВЕТА В ВЕТКЕ ---
function lastMyReplyAt(root: CommentItem, myUsername: string): string | null {
  let last: string | null = null;
  const walk = (list: CommentItem[]) => {
    for (const c of list) {
      if (!c.is_deleted && c.author?.username === myUsername) {
        if (!last || new Date(c.created_at).getTime() > new Date(last).getTime()) {
          last = c.created_at;
        }
      }
      if (c.replies?.length) walk(c.replies);
    }
  };
  walk(root.replies || []);
  return last;
}

// --- УДАЛЕНИЕ КОММЕНТА ИЗ ДЕРЕВА ---
function removeCommentFromTree(arr: CommentItem[], id: number): { next: CommentItem[]; removed: number } {
  const countAll = (c: CommentItem): number => {
    let cnt = 1; // сам узел
    for (const r of (c.replies || [])) cnt += countAll(r);
    return cnt;
  };

  let removed = 0;
  const walk = (list: CommentItem[]): CommentItem[] => {
    const out: CommentItem[] = [];
    for (const c of list) {
      if (c.id === id) { removed += countAll(c); continue; }
      const nr = c.replies?.length ? walk(c.replies) : c.replies || [];
      out.push(nr !== c.replies ? { ...c, replies: nr } : c);
    }
    return out;
  };

  const next = walk(arr);
  return { next, removed };
}

// --- АЛИАС ДЛЯ ТЕКСТА ПОСТА (совместимость со старым кодом) ---
function PostText({ text, lines = 5, className = '', renderText, }: { text: string; lines?: number; className?: string; renderText?: (t: string) => React.ReactNode; }) {
  return <CollapsibleText text={text} lines={lines} className={className} renderText={renderText} />;
}

// --- ЖДАТЬ ПОКА ЭЛЕМЕНТ ПОЯВИТСЯ В ДОМЕ И СКРОЛЛАНУТЬ ---
function scrollWhenReady(domId: string, cb: (el: HTMLElement) => void, timeoutMs = 4000) {
  const start = Date.now();
  const tick = () => {
    const el = document.getElementById(domId);
    if (el) { cb(el as HTMLElement); return; }
    if (Date.now() - start > timeoutMs) return;
    requestAnimationFrame(tick);
  };
  tick();
}



/* =========================
   КУКИ/CSRF
========================= */

function readCookie(name: string) {
  const re = new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)');
  const m = document.cookie.match(re);
  return m ? decodeURIComponent(m[1]) : '';
}
function getCsrf() { return readCookie('csrftoken'); }
let csrfPromise: Promise<void> | null = null;
async function ensureCsrf() {
  if (getCsrf()) return;
  if (!API) return;
  if (!csrfPromise) {
    csrfPromise = fetch(`${API}/api/csrf/`, { credentials: 'include' })
      .then(() => { })
      .finally(() => { csrfPromise = null; });
  }
  await csrfPromise;
}

/* =========================
   КНОПКА ⋯ + МОДАЛКИ
========================= */

function MoreButton({
  onClick, title = 'Ещё', scope = 'comment',
}: { onClick: () => void; title?: string; scope?: 'comment' | 'reply' | 'post' | 'mark'; }) {
  const scopeShow =
    scope === 'reply'
      ? 'group-hover/reply:opacity-100 group-focus-within/reply:opacity-100'
      : scope === 'post'
        ? 'group-hover/post-head:opacity-100 group-hover/post-row:opacity-100 group-focus-within/post-row:opacity-100'
        : scope === 'mark'
          ? 'group-hover/mark:opacity-100 group-focus-within/mark:opacity-100'
          : 'group-hover/comment-head:opacity-100 group-focus-within/comment-head:opacity-100';


  const scopePE =
    scope === 'reply'
      ? 'group-hover/reply:pointer-events-auto group-focus-within/reply:pointer-events-auto'
      : scope === 'post'
        ? 'group-hover/post-head:pointer-events-auto group-hover/post-row:pointer-events-auto group-focus-within/post-row:pointer-events-auto'
        : scope === 'mark'
          ? 'group-hover/mark:pointer-events-auto group-focus-within/mark:pointer-events-auto'
          : 'group-hover/comment-head:pointer-events-auto group-focus-within/comment-head:pointer-events-auto';



  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`opacity-0 ${scopeShow} focus-visible:opacity-100 transition-opacity
                 pointer-events-none ${scopePE} focus-visible:pointer-events-auto
                 text-gray-500 hover:text-gray-800 text-[18px] leading-none
                 w-8 h-8 -m-1.5 p-1.5 rounded-full hover:bg-gray-100`}
    >
      ⋯
    </button>
  );
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



// === Список лайкнувших
function LikesModal({ source }: { source: LikeSource }) {
  const [items, setItems] = React.useState<SimpleUser[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const { navigateProfile } = useAppNavigation();
  const { close: closeOverlay } = useOverlayEnvironment();
  const hashForSource = React.useCallback(() => {
    if (!source) return '';
    switch (source.kind) {
      case 'comment': return `#comment-${source.id}`;
      case 'post': return `#post-${source.id}`;
      default: return '';
    }
  }, [source]);

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
    const usernameFrom = (o?: UnknownRecord | null) => o ? (pickString(o, ['username', 'login', 'nick', 'name']) ?? null) : null;
    const avatarFrom = (o?: UnknownRecord | null) => o ? absUrl(
      pickString(o, ['avatar', 'avatar_url', 'profile_picture', 'photo', 'photo_url', 'image', 'picture']) ?? undefined
    ) : null;

    return arr.map((raw) => {
      const u = raw as UnknownRecord;
      const nested =
        (u['user'] as UnknownRecord | undefined) ??
        (u['author'] as UnknownRecord | undefined) ??
        (u['profile'] as UnknownRecord | undefined) ??
        (u['owner'] as UnknownRecord | undefined) ??
        (u['liker'] as UnknownRecord | undefined) ??
        (u['account'] as UnknownRecord | undefined);
      const id = asNumber(u['id']) ?? asNumber(u['pk']) ?? asNumber(u['user_id']) ?? (nested ? asNumber(nested['id']) : null) ?? 0;
      const username = usernameFrom(u) ?? usernameFrom(nested) ?? '';
      const avatar = avatarFrom(u) ?? avatarFrom(nested);
      return { id, username, avatar: avatar ?? null } as SimpleUser;
    }).filter(x => !!x.username);
  };

  useEffect(() => {
    if (!source || !API) return;
    let cancelled = false;
    (async () => {
      setErr(null); setItems(null);
      const urls: string[] = (() => {
        const q = (type: 'camp' | 'post' | 'comment', id: number) => `${API}/api/likes/?target_type=${type}&target_id=${id}`;
        switch (source.kind) {
          case 'comment': return [
            `${API}/api/comments/${source.id}/likers/`,
            `${API}/api/comments/${source.id}/likes/`,
            `${API}/api/comments/${source.id}/liked-by/`,
            q('comment', source.id),
          ];
          case 'post': return [
            `${API}/api/camps/${source.campId}/posts/${source.id}/likers/`,
            `${API}/api/camps/${source.campId}/posts/${source.id}/likes/`,
            `${API}/api/camps/${source.campId}/posts/${source.id}/liked-by/`,
            q('post', source.id),
          ];
          case 'camp': return [
            `${API}/api/camps/${source.campId}/likers/`,
            `${API}/api/camps/${source.campId}/likes/`,
            `${API}/api/camps/${source.campId}/liked-by/`,
            q('camp', source.campId),
          ];
        }
      })();

      let loaded: SimpleUser[] | null = null;
      for (const u of urls) {
        try {
          let r = await fetch(u, { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } });
          if (r.status === 401 || r.status === 403) {
            // попробуем без куки, если эндпоинт публичный
            r = await fetch(u, { credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } });
          }
          if (r.status === 404) continue;
          if (!r.ok) { setErr('Ошибка сервера при загрузке списка лайков'); break; }
          const j = await r.json();
          loaded = normalize(j);
          break;
        } catch { }
      }
      if (!cancelled) setItems(loaded ?? []);
    })();
    return () => { cancelled = true; };
  }, [source, API]);

  if (!source) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center px-4"
      onClick={(e) => { if (e.target === e.currentTarget) closeOverlay(); }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-[min(520px,92vw)] rounded-2xl bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold text-[15px]">Оценили</div>
          <button
            type="button"
            onClick={closeOverlay}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
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
                      rememberHere('profile', hashForSource());
                      const handled = navigateProfile(event, { username: u.username }, { remember: false });
                      if (!handled) {
                        event.preventDefault();
                        try { window.location.assign(`/${u.username}`); }
                        catch { window.location.href = `/${u.username}`; }
                      }
                    }}
                  >
                    <AvatarImg src={u.avatar} alt={u.username} className="w-8 h-8 rounded-full object-cover border border-gray-200" />
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

// Лайтбокс
function ImageLightbox({
  open, images, index, onClose, onIndexChange,
}: { open: boolean; images: string[]; index: number; onClose: () => void; onIndexChange: (next: number) => void; }) {
  const [zoom, setZoom] = React.useState(1);
  const [tx, setTx] = React.useState(0);
  const [ty, setTy] = React.useState(0);
  const dragRef = React.useRef<{ x: number; y: number; tx0: number; ty0: number } | null>(null);

  React.useEffect(() => { if (open) { setZoom(1); setTx(0); setTy(0); } }, [open, index]);

  const count = images.length;
  const canPrev = count > 1;
  const canNext = count > 1;

  const goPrev = React.useCallback(() => { if (!canPrev) return; onIndexChange((index - 1 + count) % count); }, [index, count, canPrev, onIndexChange]);
  const goNext = React.useCallback(() => { if (!canNext) return; onIndexChange((index + 1) % count); }, [index, count, canNext, onIndexChange]);

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

  const node = (
    <div className="fixed inset-0 z-[12000] bg-black/90 text-white flex items-center justify-center select-none"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute top-3 left-0 right-0 px-4 flex items-center justify-between pointer-events-none">
        <div className="text-sm opacity-80 pointer-events-auto">{index + 1} / {count}</div>
        <button onClick={onClose} className="pointer-events-auto w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center" aria-label="Закрыть">✕</button>
      </div>

      {count > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); goPrev(); }} className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center" aria-label="Предыдущее фото">‹</button>
          <button onClick={(e) => { e.stopPropagation(); goNext(); }} className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center" aria-label="Следующее фото">›</button>
        </>
      )}

      <div
        className="max-w-[95vw] max-h-[80vh] overflow-hidden rounded-xl bg-black/30 border border-white/10 shadow-xl"
        onWheel={(e) => {
          if (e.ctrlKey) {
            e.preventDefault();
            setZoom(z => Math.min(3, Math.max(1, z - e.deltaY * 0.01)));
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

    </div>
  );
  if (typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}

/* =========================
   ПОСТЫ
========================= */

const sortPostsByCreatedDesc = (a: CampPost, b: CampPost) =>
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

function normalizeCampPostPayload(payload: unknown): CampPost | null {
  const rec = (payload ?? {}) as UnknownRecord;
  const id = pickNumber(rec, ['id', 'post_id', 'camp_post_id']);
  if (id == null) return null;
  const created_at =
    pickDateString(rec, ['created_at', 'createdAt', 'timestamp', 'date']) ||
    new Date().toISOString();
  return {
    id,
    title: pickString(rec, ['title']) || null,
    content: pickString(rec, ['content', 'text', 'body']) || null,
    image: absUrl(pickString(rec, ['image', 'photo', 'picture', 'thumbnail']) || undefined),
    created_at,
    replies_count: pickNumber(rec, ['replies_count', 'comments_count']) ?? 0,
    likes_count: pickNumber(rec, ['likes_count']) ?? 0,
    liked_by_me: !!pickBool(rec, ['liked_by_me', 'liked']),
    can_delete: !!pickBool(rec, ['can_delete']),
    root_comment_id: pickNumber(rec, ['root_comment_id', 'root']) ?? undefined,
    is_pinned: !!pickBool(rec, ['is_pinned', 'pinned']),
  };
}

type ThumbSize = { w: number; h: number };
const POST_THUMB_LONG = 130;

function PostThumb({
  src,
  onSize,
  onClick,
  className = '',
}: {
  src: string;
  onSize?: (sz: ThumbSize) => void;
  onClick?: () => void;
  className?: string;
}) {
  const [wh, setWh] = React.useState<{ w: number; h: number } | null>(null);
  const [error, setError] = React.useState(false);

  if (!src || error) return null;

  const aspect = wh ? wh.w / wh.h : 1;
  const isLandscape = aspect >= 1;
  const w = isLandscape ? POST_THUMB_LONG : Math.max(72, Math.round(POST_THUMB_LONG * aspect));
  const h = isLandscape ? Math.max(72, Math.round(POST_THUMB_LONG / aspect)) : POST_THUMB_LONG;

  return (
    <div className={className}>
      <div
        className="relative inline-block rounded-md border border-gray-200 bg-white overflow-hidden align-top"
        style={{ width: `${w}px`, height: `${h}px` }}
      >
        <button
          type="button"
          onClick={onClick}
          className="absolute inset-0 w-full h-full"
          aria-label={onClick ? 'Открыть фото' : undefined}
          tabIndex={onClick ? 0 : -1}
          style={{
            cursor: onClick ? 'zoom-in' : 'default',
            pointerEvents: onClick ? 'auto' : 'none',
          }}
        />
        <img
          src={src}
          alt=""
          className="absolute inset-0 w-full h-full object-contain"
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight) {
              const natW = img.naturalWidth;
              const natH = img.naturalHeight;
              const asp = natW / natH;
              const W = asp >= 1 ? POST_THUMB_LONG : Math.max(72, Math.round(POST_THUMB_LONG * asp));
              const H = asp >= 1 ? Math.max(72, Math.round(POST_THUMB_LONG / asp)) : POST_THUMB_LONG;
              setWh({ w: natW, h: natH });
              onSize?.({ w: W, h: H });
            }
          }}
          onError={() => setError(true)}
        />
      </div>
    </div>
  );
}

function CollapsibleText({
  text,
  lines = 4,
  className = '',
  autoCollapseWhenOut = false,   // 🆕 главное: вкл/выкл авто-сворачивания
  renderText,
}: {
  text: string;
  lines?: number;
  className?: string;
  autoCollapseWhenOut?: boolean;
  renderText?: (t: string) => React.ReactNode;
}) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const measureRef = React.useRef<HTMLDivElement | null>(null);

  const [expanded, setExpanded] = React.useState(false);
  const [needToggle, setNeedToggle] = React.useState(false);

  // ===== измерения, как было =====
  const recompute = React.useCallback(() => {
    const box = boxRef.current; const measure = measureRef.current;
    if (!box || !measure) return;
    const w = Math.ceil(box.getBoundingClientRect().width || 0);
    measure.style.width = w ? `${w}px` : 'auto';
    const fullH = measure.scrollHeight;
    const cs = getComputedStyle(box);
    const lh = parseFloat(cs.lineHeight || '0') || 0;
    const clampH = Math.round(lh * lines);
    setNeedToggle(fullH > clampH + 1);
  }, [lines, text]);

  useLayoutEffect(() => { recompute(); }, [recompute, text, lines]);
  useEffect(() => {
    const box = boxRef.current; if (!box) return;
    const ro = new ResizeObserver(recompute);
    ro.observe(box);
    const onResize = () => recompute();
    window.addEventListener('resize', onResize);
    return () => { ro.disconnect(); window.removeEventListener('resize', onResize); };
  }, [recompute]);

  // ===== авто-сворачивание «без рывков» при выходе из вьюпорта =====
  const scrollParentRef = React.useRef<HTMLElement | null>(null);
  const lastTopRef = React.useRef(0);
  const dirRef = React.useRef<'up' | 'down' | 'none'>('none');
  const lastPosRef = React.useRef<'inside' | 'above' | 'below'>('inside');
  const cooldownRef = React.useRef(0);

  const collapseWithoutJump = React.useCallback(() => {
    if (!expanded) return;
    const host = hostRef.current;
    if (!host) { setExpanded(false); return; }

    const rootScroll = (scrollParentRef.current ?? findScrollParent(host));
    scrollParentRef.current = rootScroll;
    const getTop = () => (rootScroll ? rootScroll.scrollTop : window.scrollY);
    const setTop = (v: number) => { if (rootScroll) rootScroll.scrollTop = v; else window.scrollTo({ top: v }); };

    // где находимся относительно вьюпорта
    const { pos } = getObservedRepliesPos(host, rootScroll ?? null);

    // замер «до»
    const beforeRect = host.getBoundingClientRect();
    const prevTop = getTop();

    // отключим smooth-scroll на время
    let restore: (() => void) | null = null;
    if (!rootScroll) {
      const el = document.documentElement;
      const prev = el.style.scrollBehavior;
      el.style.scrollBehavior = 'auto';
      restore = () => { el.style.scrollBehavior = prev; };
    }

    // маленькая стабилизация рендера
    const prevTransform = host.style.transform;
    const prevWillChange = host.style.willChange;
    host.style.willChange = 'transform';
    host.style.transform = 'translateZ(0)';

    // сворачиваем синхронно, затем компенсируем дельту
    flushSync(() => setExpanded(false));

    const afterRect = host.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const rawDelta = beforeRect.bottom - afterRect.bottom;
    const delta = Math.round(rawDelta * dpr) / dpr;
    const EPS = 1.25 / dpr;

    const cleanup = () => {
      host.style.transform = prevTransform;
      host.style.willChange = prevWillChange;
      restore?.();
      cooldownRef.current = performance.now() + 200; // небольшая блокировка от повторных триггеров
    };

    // компенсируем только когда блок «ушёл наверх» (уменьшение высоты над вьюпортом)
    if (pos === 'above' && delta > EPS) {
      requestAnimationFrame(() => { setTop(prevTop - delta); requestAnimationFrame(cleanup); });
    } else {
      requestAnimationFrame(cleanup);
    }
  }, [expanded]);

  useEffect(() => {
    if (!autoCollapseWhenOut || !expanded) return;
    const host = hostRef.current; if (!host) return;

    const rootScroll = (scrollParentRef.current ?? findScrollParent(host));
    scrollParentRef.current = rootScroll;
    const getTop = () => (rootScroll ? rootScroll.scrollTop : window.scrollY);

    const decide = () => {
      if (!expanded) { lastPosRef.current = 'inside'; return; }
      // Не дергаем слишком часто
      if (performance.now() < cooldownRef.current) return;

      const { pos } = getObservedRepliesPos(host, rootScroll ?? null);
      if (pos === 'inside') { lastPosRef.current = 'inside'; return; }

      // сворачиваем при выходе «вверх» когда скроллим вниз, и при выходе «вниз» когда скроллим вверх
      if (pos === 'above' && lastPosRef.current === 'inside' && dirRef.current === 'down') collapseWithoutJump();
      if (pos === 'below' && lastPosRef.current === 'inside' && dirRef.current === 'up') collapseWithoutJump();

      lastPosRef.current = pos;
    };

    const onScroll = () => {
      const t = getTop();
      dirRef.current = t < lastTopRef.current ? 'up' : (t > lastTopRef.current ? 'down' : dirRef.current);
      lastTopRef.current = t;
      decide();
    };

    lastTopRef.current = getTop();
    decide();
    if (rootScroll) rootScroll.addEventListener('scroll', onScroll, { passive: true });
    else window.addEventListener('scroll', onScroll, { passive: true });
    const onResize = () => decide();
    window.addEventListener('resize', onResize);
    return () => {
      if (rootScroll) rootScroll.removeEventListener('scroll', onScroll);
      else window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [autoCollapseWhenOut, expanded, collapseWithoutJump]);

  return (
    <div ref={hostRef} className={['collapsible-anchor-fix', className].join(' ')} data-collapsible-root>
      <div
        ref={boxRef}
        className="whitespace-pre-wrap break-words"
        style={expanded ? undefined : {
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical' as const,
          WebkitLineClamp: String(lines),
          overflow: 'hidden',
        }}
        aria-expanded={expanded}
        data-collapsible-expanded={expanded}
      >
        {renderText ? renderText(text) : text}
      </div>

      {needToggle && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="mt-1 text-xs text-gray-400 hover:text-gray-600"
        >
          {expanded ? 'свернуть' : 'развернуть'}
        </button>
      )}

      {/* невидимый измеритель */}
      <div
        ref={measureRef}
        className="absolute invisible pointer-events-none whitespace-pre-wrap break-words"
        aria-hidden
        style={{ left: 0, top: 0, position: 'absolute' }}
      >
        {renderText ? renderText(text) : text}
      </div>
    </div>
  );
}


function usePostLike(campId: number) {
  return useCallback(async (post: CampPost, set: (liked: boolean, likes: number) => void) => {
    const liked = !!post.liked_by_me;
    const likes = post.likes_count ?? 0;
    const optimistic = !liked;
    set(optimistic, Math.max(0, likes + (optimistic ? 1 : -1)));
    try {
      await ensureCsrf();
      const r = await fetch(`${API}/api/camps/${campId}/posts/${post.id}/like/`, {
        method: 'POST', credentials: 'include', headers: { 'X-CSRFToken': getCsrf() },
      });
      if (!r.ok) throw new Error();
      const j = await r.json() as { liked: boolean; likes_count: number };
      set(!!j.liked, j.likes_count ?? 0);
    } catch {
      set(!optimistic, Math.max(0, likes + (optimistic ? -1 : 1)));
    }
  }, [campId]);
}

const POST_LIKES_CACHE_PREFIX = 'camp:posts:likes:';
const postLikesCacheKey = (me: string | null) => `${POST_LIKES_CACHE_PREFIX}${me ?? 'guest'}`;

function readPostLikesCache(me: string | null): Record<number, true> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(postLikesCacheKey(me));
    return raw ? (JSON.parse(raw) as Record<number, true>) : {};
  } catch { return {}; }
}

function writePostLikesCache(me: string | null, map: Record<number, true>) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(postLikesCacheKey(me), JSON.stringify(map)); }
  catch { }
}

function setPostLikeCache(me: string | null, id: number, liked: boolean) {
  const map = readPostLikesCache(me);
  if (liked) map[id] = true;
  else delete map[id];
  writePostLikesCache(me, map);
}

function applyPostLikesCacheToList(list: CampPost[], me: string | null): CampPost[] {
  if (!Array.isArray(list) || !list.length) return list;
  const cached = readPostLikesCache(me);
  let mutated = false;
  const next = list.map((p) => {
    const liked = !!(cached[p.id] || p.liked_by_me);
    if (liked !== p.liked_by_me) {
      mutated = true;
      return { ...p, liked_by_me: liked };
    }
    return p;
  });
  return mutated ? next : list;
}

function IconPushpin(props: { className?: string }) {
  return (
    <svg className={props.className} width="14" height="14" viewBox="0 0 24 24" aria-hidden>
      <path d="M7 4h10v2c0 2.2-1.8 4-4 4v3l2.5 2.5V17H8.5v-1.5L11 13V10C8.8 10 7 8.2 7 6V4z"
        fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 17v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CampPostCard({
  p, campId, organizerAvatar, organizerUsername, isOrganizer,
  onOpenComments, below, onOpenPhoto, controlsVariant = 'post',
  onDeleted, onPinnedChange, onOpenLikers, rowId, onReportPost, onPostLike,
}: {
  p: CampPost; campId: number; organizerAvatar: string; organizerUsername?: string | null;
  isOrganizer: boolean; onOpenComments: (rootCommentId?: number, post?: CampPost, wantReply?: boolean) => void;
  below?: React.ReactNode; controlsVariant?: 'post' | 'comment'; onDeleted?: (post: CampPost) => void;
  onOpenPhoto?: () => void; onPinnedChange?: (postId: number, pinned: boolean) => void;
  onOpenLikers?: (src: LikeSource) => void; rowId?: string;
  onReportPost?: (post: CampPost) => void;
  onPostLike?: (postId: number, liked: boolean, likes: number) => void;
}) {
  const rowRef = React.useRef<HTMLElement | null>(null);

  // auth gating for desktop post card
  const { authenticated } = useAuth();
  const [loginRequiredOpen, setLoginRequiredOpen] = React.useState(false);
  const [completeProfileModalOpen, setCompleteProfileModalOpen] = React.useState(false);
  const onLogin = React.useCallback(() => {
    setLoginRequiredOpen(false);
    try { window.location.assign('/auth/login'); } catch { window.location.href = '/auth/login'; }
  }, []);

  const [liked, setLiked] = React.useState(!!p.liked_by_me);
  const [likes, setLikes] = React.useState(p.likes_count ?? 0);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [pinBusy, setPinBusy] = React.useState(false);
  const [postActionsOpen, setPostActionsOpen] = React.useState(false);
  const handleProfileNav = useProfileReturnNavigation();


  const avatarSize = controlsVariant === 'comment' ? 'w-8 h-8' : 'w-9 h-9';

  useEffect(() => { setLiked(!!p.liked_by_me); setLikes(p.likes_count ?? 0); }, [p.liked_by_me, p.likes_count]);
  const likePost = usePostLike(campId);
  const canReport = !isOrganizer;
  const canDelete = !!p.can_delete || !!isOrganizer;
  const handleLikeClick = () => {
    if (!authenticated) { setLoginRequiredOpen(true); return; }
    if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
    likePost(p, (L, C) => {
      setLiked(L);
      setLikes(C);
      onPostLike?.(p.id, L, C);
    });
  };

  async function deletePost() {
    try {
      await ensureCsrf();
      const r = await fetch(`${API}/api/camps/${campId}/posts/${p.id}/delete/`, {
        method: 'POST', credentials: 'include', headers: { 'X-CSRFToken': getCsrf() },
      });
      if (!r.ok) throw new Error();
      onDeleted?.(p);
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('profile_post_deleted', {
              detail: { id: p.id },
            }),
          );
        }
      } catch {
        /* noop */
      }
    } catch { alert('Не удалось удалить пост'); }
  }

  async function reportPost() {
    if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
    try {
      const reason = prompt('Опишите причину жалобы (необязательно):') || '';
      await ensureCsrf();
      await fetch(`${API}/api/camps/${campId}/posts/${p.id}/report/`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify({ reason }),
      });
      alert('Жалоба отправлена');
    } catch {/* no-op */ }
  }

  async function togglePin() {
    if (!API) return;
    try {
      setPinBusy(true);
      await ensureCsrf();
      const url = p.is_pinned
        ? `${API}/api/camps/${campId}/posts/${p.id}/unpin/`
        : `${API}/api/camps/${campId}/posts/${p.id}/pin/`;
      const r = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'X-CSRFToken': getCsrf() } });
      if (!r.ok) throw new Error();
      onPinnedChange?.(p.id, !p.is_pinned);
    } catch { alert('Не удалось изменить закрепление поста'); }
    finally { setPinBusy(false); }
  }

  return (
    <li id={rowId} ref={rowRef as React.RefObject<HTMLLIElement>} className="py-2 relative group/post">
      <div className="flex items-start gap-3 mt-3">
        {organizerUsername ? (
          <Link
            href={`/${organizerUsername}`}
            className="flex-shrink-0 self-start inline-block"
            onClick={(event) => handleProfileNav(event, organizerUsername)}
          >
            <img
              src={organizerAvatar || AVATAR_PLACEHOLDER_PATH}
              alt=""
              className={`${avatarSize} rounded-full object-cover border border-gray-200`}
            />
          </Link>
        ) : (
          <img
            src={organizerAvatar || AVATAR_PLACEHOLDER_PATH}
            alt=""
            className={`${avatarSize} rounded-full object-cover border border-gray-200 flex-shrink-0 self-start`}
          />
        )}

        <div className="flex-1 min-w-0 relative">
          <div className="absolute right-0 top-0 translate-y-[-2px] flex items-center gap-1">
            {p.is_pinned && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-gray-200 bg-gray-50 text-[11px] leading-none text-gray-600">
                <IconPushpin className="w-[14px] h-[14px] text-gray-400 -rotate-12" />
                закреплено организатором
              </span>
            )}
          </div>

          <div className="group/post-head">
            {organizerUsername && (
              <div className="text-sm mt-0">
                <Link
                  href={`/${organizerUsername}`}
                  className="font-semibold hover:underline"
                  onClick={(event) => handleProfileNav(event, organizerUsername)}
                >
                  {organizerUsername}
                </Link>
              </div>
            )}

            {p.title && <div className={`font-semibold ${organizerUsername ? (p.content ? 'mt-2' : 'mt-1') : ''}`}>{p.title}</div>}

            {p.image && (
              <div role={onOpenPhoto ? 'button' : undefined}
                onClick={onOpenPhoto}
                className={['inline-block', p.title ? 'mt-2' : 'mt-3', onOpenPhoto ? 'cursor-zoom-in' : ''].join(' ')}
                aria-label={onOpenPhoto ? 'Открыть фото поста' : undefined}>
                <PostThumb src={p.image} />
              </div>
            )}

            {p.content && p.content.trim() !== (p.title || '').trim() && (
              <CollapsibleText text={p.content} className={`text-[14px] ${p.image ? 'mt-2' : (p.title ? 'mt-2' : 'mt-3')}`} lines={4} autoCollapseWhenOut renderText={renderLeadingMentionAsLink} />
            )}

            {controlsVariant === 'comment' ? (
              <div className="mt-3 flex items-center gap-3 text-xs text-gray-600 group/post-row">
                <button onClick={handleLikeClick}
                  className="inline-flex items-center gap-1"
                  aria-label={liked ? 'Убрать лайк с поста' : 'Поставить лайк посту'}
                  aria-pressed={liked} title={liked ? 'Убрать лайк' : 'Поставить лайк'}>
                  <HeartIcon
                    filled={liked}
                    className={['text-sm leading-none select-none', liked ? 'text-red-500' : (likes > 0 ? 'text-black' : 'text-gray-400')].join(' ')}
                  />
                </button>
                {likes > 0 && (
                  <button type="button" className="tabular-nums leading-none hover:underline"
                    onClick={() => onOpenLikers?.({ kind: 'post', campId, id: p.id })} title="Кто лайкнул">
                    {likes}
                  </button>
                )}

                <button type="button" className="hover:underline" onClick={() => { if (!authenticated) { setLoginRequiredOpen(true); return; } onOpenComments(p.root_comment_id, p, true); }} disabled={!p.root_comment_id}>
                  Ответить
                </button>

                {isOrganizer && (
                  <button onClick={togglePin} className="hover:underline disabled:opacity-50 disabled:pointer-events-none" disabled={pinBusy}>
                    {p.is_pinned ? 'Открепить' : 'Закрепить'}
                  </button>
                )}

                {(canReport || canDelete) && (
                  <MoreButton scope="post" title="Действия" onClick={() => setPostActionsOpen(true)} />
                )}

                <span className="ml-auto text-[12px] leading-none text-gray-500/40 whitespace-nowrap">{dateOnly(p.created_at)}</span>
              </div>
            ) : (
              <div className="mt-3 text-xs text-gray-500 flex items-center gap-4 group/post-row">
                {(p.replies_count ?? 0) > 0 && (
                  <button type="button" className="hover:underline" onClick={() => onOpenComments(p.root_comment_id, p, false)}
                    disabled={!p.root_comment_id} title="Открыть ветку ответов">
                    ответы: {p.replies_count}
                  </button>
                )}

                <button type="button" className="hover:underline" onClick={() => onOpenComments(p.root_comment_id, p, true)}
                  title="Ответить на пост" disabled={!p.root_comment_id}>
                  Ответить
                </button>

                <button onClick={handleLikeClick}
                  aria-label={liked ? 'Убрать лайк с поста' : 'Поставить лайк посту'}
                  className="inline-flex items-center gap-1" aria-pressed={liked} title={liked ? 'Убрать лайк' : 'Поставить лайк'}>
                  <HeartIcon
                    filled={liked}
                    className={['text-sm leading-none select-none', liked ? 'text-red-500' : (likes > 0 ? 'text-black' : 'text-gray-400')].join(' ')}
                  />
                </button>

                {likes > 0 && (
                  <button type="button" className="tabular-nums leading-none hover:underline"
                    onClick={() => onOpenLikers?.({ kind: 'post', campId, id: p.id })} title="Кто лайкнул">
                    {likes}
                  </button>
                )}

                {isOrganizer && (
                  <button onClick={togglePin} className="hover:underline disabled:opacity-50 disabled:pointer-events-none" disabled={pinBusy}>
                    {p.is_pinned ? 'Открепить' : 'Закрепить'}
                  </button>
                )}

                {(canReport || canDelete) && (
                  <MoreButton scope="post" title="Действия" onClick={() => setPostActionsOpen(true)} />
                )}

                <span className="ml-auto text-[12px] leading-none text-gray-500/40 whitespace-nowrap">{dateOnly(p.created_at)}</span>
              </div>
            )}
          </div>

          {controlsVariant === 'comment' && below ? <div className="mt-2">{below}</div> : null}
        </div>
      </div>

  <CommentActionSheet
      open={postActionsOpen}
      canReport={!isOrganizer}
      canDelete={!!p.can_delete || !!isOrganizer}
      onClose={() => setPostActionsOpen(false)}
      onReport={() => {
        if (!authenticated) { setLoginRequiredOpen(true); return; }
        if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
        if (onReportPost) {
          onReportPost(p);
        } else {
          void reportPost();
        }
      }}
      onDelete={() => setDeleteOpen(true)}
    />

      <ConfirmModal
        open={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={deletePost}
        title="Удалить пост?"
        message="Действие нельзя будет отменить. Вы уверены, что хотите удалить пост?"
        confirmLabel="Да, удалить"
      />

  {controlsVariant !== 'comment' && below ? <div className="mt-2">{below}</div> : null}

  <CompleteProfileActionModal
    open={completeProfileModalOpen}
    onClose={() => setCompleteProfileModalOpen(false)}
  />
  <ConfirmModal
    open={loginRequiredOpen}
    onCancel={() => setLoginRequiredOpen(false)}
    onConfirm={onLogin}
    title="Это действие доступно только авторизованным пользователям"
    cancelLabel="Отмена"
    confirmLabel="Войти"
  />
    </li>
  );
}

/* =========================
   CampReplies (как было)
========================= */

function CommentActionSheet({
  open, canReport, canDelete, onClose, onReport, onDelete,
}: {
  open: boolean; canReport?: boolean; canDelete?: boolean;
  onClose: () => void; onReport?: () => void | Promise<void>; onDelete?: () => void | Promise<void>;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!open || !mounted) return null;

  const doAndClose = (fn?: () => void | Promise<void>) => async () => { try { await fn?.(); } finally { onClose(); } };

  const node = (
    <div className="fixed inset-0 z-[20000] bg-black/40 flex items-center justify-center px-4"
      role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-[min(540px,92vw)] rounded-[24px] bg-white shadow-xl overflow-hidden">
        {canReport && (
          <>
            <button className="w-full py-4 text-[17px] font-semibold text-red-600 hover:bg-red-50"
              onClick={doAndClose(onReport)}>Пожаловаться</button>
            {canDelete && <div className="h-px bg-gray-200" />}
          </>
        )}
        {canDelete && (
          <>
            <button className="w-full py-4 text-[17px] font-semibold text-red-600 hover:bg-red-50"
              onClick={doAndClose(onDelete)}>Удалить</button>
            <div className="h-px bg-gray-200" />
          </>
        )}
        <button className="w-full py-4 text-[17px] hover:bg-gray-50" onClick={onClose}>Отмена</button>
      </div>
    </div>
  );
  return createPortal(node, document.body);
}

function CampReplies({
  root, me, onReply, onLike, onReport, onDelete, expandToId, openActions, onOpenLikers, onOpenReportComment,
}: {
  root: CommentItem; me: string | null | undefined;
  onReply: (username: string) => void; onLike: (id: number) => void;
  onReport: (id: number) => void; onDelete: (id: number) => void;
  expandToId?: number;
  openActions?: (opts: { onReport?: () => void | Promise<void>; onDelete?: () => void | Promise<void> }) => void;
  onOpenLikers?: (src: LikeSource) => void;
  onOpenReportComment?: (payload: CampCommentReport) => void;
}) {
  const replies = React.useMemo(() => root.replies ?? [], [root.replies]);
  const total = replies.length;
  const handleProfileNav = useProfileReturnNavigation();

  const [visible, setVisible] = React.useState(Math.min(total, 1));
  const visibleRef = React.useRef(visible);
  React.useEffect(() => { visibleRef.current = visible; }, [visible]);

  React.useEffect(() => {
    if (!expandToId || !replies.length) return;
    const idx = replies.findIndex(r => r.id === expandToId);
    if (idx >= 0) setVisible(v => Math.max(v, idx + 1));
  }, [expandToId, replies]);

  useEffect(() => { setVisible(v => (replies.length < v ? Math.max(1, replies.length) : v)); }, [replies.length]);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const scrollParentRef = React.useRef<HTMLElement | null>(null);
  const lastTopRef = React.useRef(0);
  const dirRef = React.useRef<'up' | 'down' | 'none'>('none');
  const lastPosRef = React.useRef<'above' | 'inside' | 'below'>('inside');

  const collapseRepliesWithoutJump = React.useCallback(() => {
    const was = visibleRef.current;
    if (was <= 1) return;
    const host = rootRef.current;
    if (!host) { setVisible(1); return; }
    const rootScroll = (scrollParentRef.current ?? findScrollParent(host));
    scrollParentRef.current = rootScroll;
    const getTop = () => (rootScroll ? rootScroll.scrollTop : window.scrollY);
    const setTop = (val: number) => { if (rootScroll) rootScroll.scrollTop = val; else window.scrollTo({ top: val }); };

    const { pos } = getObservedRepliesPos(host, rootScroll ?? null);
    const beforeRect = host.getBoundingClientRect();
    const controlsBefore = host.querySelector('[data-replies-controls]') as HTMLElement | null;
    const beforeBottom = controlsBefore ? Math.max(beforeRect.bottom, controlsBefore.getBoundingClientRect().bottom) : beforeRect.bottom;
    const prevTop = getTop();

    let restore: (() => void) | null = null;
    if (!rootScroll) {
      const el = document.documentElement; const prev = el.style.scrollBehavior;
      el.style.scrollBehavior = 'auto'; restore = () => { el.style.scrollBehavior = prev; };
    }

    const prevTransform = host.style.transform;
    const prevWillChange = host.style.willChange;
    host.style.willChange = 'transform';
    host.style.transform = 'translateZ(0)';

    flushSync(() => setVisible(1));

    const afterRect = host.getBoundingClientRect();
    const controlsAfter = host.querySelector('[data-replies-controls]') as HTMLElement | null;
    const afterBottom = controlsAfter ? Math.max(afterRect.bottom, controlsAfter.getBoundingClientRect().bottom) : afterRect.bottom;

    const dpr = window.devicePixelRatio || 1;
    const rawDelta = beforeBottom - afterBottom;
    const delta = Math.round(rawDelta * dpr) / dpr;
    const EPS = 1.25 / dpr;

    const cleanup = () => {
      host.style.transform = prevTransform;
      host.style.willChange = prevWillChange;
      restore?.();
    };

    if (pos === 'above' && was > 1 && delta > EPS) {
      requestAnimationFrame(() => { setTop(prevTop - delta); requestAnimationFrame(cleanup); });
    } else {
      requestAnimationFrame(cleanup);
    }
  }, []);

  React.useEffect(() => {
    const el = rootRef.current; if (!el) return;
    const rootScroll = (scrollParentRef.current ?? findScrollParent(el));
    scrollParentRef.current = rootScroll;
    const getTop = () => (rootScroll ? rootScroll.scrollTop : window.scrollY);

    const decide = () => {
      if (visibleRef.current <= 1) { lastPosRef.current = 'inside'; return; }
      if (hasExpandedReplyInView(el, rootScroll ?? null)) { lastPosRef.current = 'inside'; return; }
      const { pos } = getObservedRepliesPos(el, rootScroll ?? null);
      if (pos === 'above' && lastPosRef.current === 'inside' && dirRef.current === 'down') collapseRepliesWithoutJump();
      if (pos === 'below' && lastPosRef.current === 'inside' && dirRef.current === 'up') collapseRepliesWithoutJump();
      lastPosRef.current = pos;
    };

    const onScroll = () => {
      const t = getTop();
      dirRef.current = t < lastTopRef.current ? 'up' : (t > lastTopRef.current ? 'down' : dirRef.current);
      lastTopRef.current = t;
      decide();
    };

    lastTopRef.current = getTop();
    decide();
    if (rootScroll) rootScroll.addEventListener('scroll', onScroll, { passive: true });
    else window.addEventListener('scroll', onScroll, { passive: true });
    const onResize = () => decide();
    window.addEventListener('resize', onResize);
    return () => {
      if (rootScroll) rootScroll.removeEventListener('scroll', onScroll);
      else window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [collapseRepliesWithoutJump]);

  const lastMyIdx = React.useMemo(() => {
    if (!me) return -1;
    for (let i = replies.length - 1; i >= 0; i--) {
      const r = replies[i];
      if (!r.is_deleted && r.author?.username === me) return i;
    }
    return -1;
  }, [replies, me]);

  const singleIdx = React.useMemo(() => (lastMyIdx >= 0 ? lastMyIdx : 0), [lastMyIdx]);
  const remaining = visible > 1 ? Math.max(0, total - visible) : Math.max(0, total - 1);
  const nextStep = Math.min(10, remaining);

  return (
    <div ref={rootRef} className="replies-anchor-fix mt-1">
      {!!replies.length && (
        <ul className="mt-2 pl-4 border-l border-gray-200">
          {replies.map((r, idx) => {
            const show = visible > 1 ? idx < visible : idx === singleIdx;
            const isMine = me && r.author?.username && me === r.author.username;
            const canReport = !isMine && !r.is_deleted;
            const canDelete = !!r.can_delete;
            return (
              <li key={r.id} id={`comment-${r.id}`} className="mt-2.5" hidden={!show}>
                <div className="flex items-start gap-2 group/reply">
                  <Link
                    href={`/${r.author?.username ?? ''}`}
                    className="shrink-0"
                    onClick={(event) => handleProfileNav(event, r.author?.username, `#comment-${r.id}`)}
                  >
                    <SmartImage src={r.author?.avatar || AVATAR_PLACEHOLDER_PATH} alt="" width={24} height={24}
                      className="rounded-full object-cover border" sizes="24px" style={{ width: 24, height: 24 }} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-end gap-2">
                      <Link
                        href={`/${r.author?.username ?? ''}`}
                        className="text-[13px] font-semibold leading-none hover:underline"
                        onClick={(event) => handleProfileNav(event, r.author?.username, `#comment-${r.id}`)}
                      >
                        {r.author?.username}
                      </Link>
                    </div>
                    {r.content && (
                      <CollapsibleText
                        text={r.content}
                        lines={4}
                        className="mt-3 text-[14px]"
                        autoCollapseWhenOut
                        renderText={renderLeadingMentionAsLink}
                      />
                    )}
                    <div className="mt-1.5 text-xs text-gray-600 flex items-center gap-3">
                      <button onClick={() => onLike(r.id)} className="inline-flex items-center gap-1"
                        aria-pressed={!!r.liked_by_me} title={r.liked_by_me ? 'Убрать лайк' : 'Поставить лайк'}>
                        <HeartIcon
                          filled={!!r.liked_by_me}
                          className={['text-sm leading-none select-none',
                            r.liked_by_me ? 'text-red-500' : (r.likes_count > 0 ? 'text-black' : 'text-gray-400')].join(' ')}
                        />
                      </button>
                      {r.likes_count > 0 && (
                        <button
                          type="button"
                          className="tabular-nums leading-none hover:underline"
                          onClick={() => onOpenLikers?.({ kind: 'comment', id: r.id })} // 🆕
                          title="Кто лайкнул"
                        >
                          {r.likes_count}
                        </button>
                      )}

                      {!r.is_deleted && (
                        <button className="hover:underline" onClick={() => onReply(r.author?.username || '')}>Ответить</button>
                      )}
                      {(canReport || canDelete) && (
                        <MoreButton
                          scope="reply"
                          onClick={() => {
                            // готовим обработчики с учётом опциональности
                            const handleReport =
                              canReport
                                ? () => {
                                  if (onOpenReportComment) {
                                    onOpenReportComment({
                                      id: r.id,
                                      isReply: true,                    // это ответ в ветке
                                      author: r.author?.username,
                                      text: r.content,
                                    });
                                  } else {
                                    // на случай, если новый проп не прокинут
                                    onReport(r.id);
                                  }
                                }
                                : undefined;

                            const handleDelete = canDelete ? () => onDelete(r.id) : undefined;

                            // openActions может быть undefined → безопасный вызов
                            openActions?.({ onReport: handleReport, onDelete: handleDelete });
                          }}
                        />
                      )}

                      <span className="ml-auto text-[12px] leading-none text-gray-500/40 whitespace-nowrap">
                        {dateOnly(r.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {total > 1 && remaining > 0 && (
        <div className="mt-2" data-replies-controls>
          <button type="button" className="text-xs text-gray-400 hover:text-gray-600"
            onClick={() => setVisible(v => Math.min(total, v + nextStep))}>
            показать ещё {Math.min(nextStep, remaining)}
          </button>
        </div>
      )}

      {/* ⬇️ новый блок — показывается, когда всё раскрыто */}
      {total > 1 && remaining === 0 && visible > 1 && (
        <div className="mt-2" data-replies-controls>
          <button
            type="button"
            className="text-xs text-gray-400 hover:text-gray-600"
            onClick={collapseRepliesWithoutJump}
          >
            свернуть
          </button>
        </div>
      )}
    </div>
  );
}

/* =========================
   ВКЛАДКА "ПОСТЫ"
========================= */

function CampPostsTab({
  campId, organizerAvatar, organizerUsername, reloadKey = 0, isOrganizer,
  onOpenComments, onOpenImageGallery, onOpenLikers, onCreatePost, viewportResetSignal, headerRef, stuck, fixedViewportHeight, onReportPost
}: {
  campId: number; organizerAvatar: string; organizerUsername?: string | null;
  reloadKey?: number; isOrganizer: boolean;
  onOpenComments: (rootCommentId?: number, post?: CampPost, wantReply?: boolean) => void;
  onOpenImageGallery: (images: string[], startIndex: number) => void;
  onOpenLikers: (src: LikeSource) => void;
  onCreatePost?: (opts?: { prefillCampTag?: number }) => void;
  onReportPost?: (post: CampPost) => void;
  viewportResetSignal?: unknown;
  headerRef?: React.RefObject<HTMLElement | null>;
  stuck?: boolean;
  fixedViewportHeight?: number;
}) {
  const cacheKey = React.useMemo(() => `camp:${campId}:posts`, [campId]);
  const [items, setItemsCached] = useSessionCache<CampPost[]>(cacheKey, null);
  const { profile } = useAuth();
  const meUsername = profile?.username ?? null;
  const mergePostsWithCache = useCallback((list: CampPost[]) => applyPostLikesCacheToList(list, meUsername), [meUsername]);

  const [error, setError] = React.useState<string | null>(null);

  // Локально вычисляем, если проп не задан сверху
  const [isOrganizerResolved, setIsOrganizerResolved] = React.useState<boolean>(() => isOrganizer === true);

  React.useEffect(() => {
    if (isOrganizer === true) { setIsOrganizerResolved(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}/api/check-auth/`, { credentials: 'include', cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        const meU = String(j?.profile?.username ?? j?.user?.username ?? j?.username ?? '')
          .trim().replace(/^@+/, '').toLowerCase();
        const orgU = String(organizerUsername ?? '')
          .trim().replace(/^@+/, '').toLowerCase();
        if (!cancelled) setIsOrganizerResolved(!!meU && !!orgU && meU === orgU);
      } catch { }
    })();
    return () => { cancelled = true; };
  }, [isOrganizer, organizerUsername]);


  const imagesOfPosts = React.useMemo(
    () => (items || []).map(p => p.image).filter((u): u is string => !!u),
    [items]
  );

  const [loading, setLoading] = React.useState(() => items === null);
  const showLoader = useDelayedTrue(loading, 120);
  const statusNode =
    error ? <div className="text-red-600">Не удалось загрузить посты.</div> :
      (loading && showLoader) ? <div>Загрузка постов…</div> :
        !items?.length ? (
          isOrganizerResolved ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onCreatePost?.({ prefillCampTag: campId })}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                <span className="text-base leading-none">+</span>
                <span>добавить пост</span>
              </button>
            </div>
          ) : (
            <div>Организатор пока не добавил пост</div>
          )
        ) : null;

  React.useEffect(() => {
    setItemsCached((prev) => {
      if (!prev) return prev;
      const merged = mergePostsWithCache(prev);
      return merged === prev ? prev : merged;
    });
  }, [mergePostsWithCache, setItemsCached]);

  const updatePostLikeState = useCallback((postId: number, liked: boolean, likes: number) => {
    setItemsCached((prev) => {
      if (!prev) return prev;
      let mutated = false;
      const next = prev.map((post) => {
        if (post.id !== postId) return post;
        const nextLikes = likes ?? 0;
        if (post.liked_by_me === liked && (post.likes_count ?? 0) === nextLikes) return post;
        mutated = true;
        return { ...post, liked_by_me: liked, likes_count: nextLikes };
      });
      return mutated ? next : prev;
    });
    setPostLikeCache(meUsername, postId, liked);
  }, [setItemsCached, meUsername]);


  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<CampPostCreatedDetail>).detail;
      if (!detail || detail.campId !== campId) return;
      const normalized = normalizeCampPostPayload(detail.post);
      if (!normalized) return;
      setItemsCached((prev) => {
        const prevArr = prev ?? [];
        const existingIdx = prevArr.findIndex(p => p.id === normalized.id);
        if (existingIdx >= 0) {
          const next = prevArr.slice();
          next[existingIdx] = { ...next[existingIdx], ...normalized };
          return next;
        }
        const next = [normalized, ...prevArr];
        const pinned = next.find(p => p.is_pinned);
        return pinned
          ? [pinned, ...next.filter(x => x.id !== pinned.id)]
          : next.sort(sortPostsByCreatedDesc);
      });
    };
    window.addEventListener(CAMP_POST_CREATED_EVENT, handler as EventListener);
    return () => window.removeEventListener(CAMP_POST_CREATED_EVENT, handler as EventListener);
  }, [campId, setItemsCached]);

  React.useEffect(() => {
    if (!API || !campId) return;
    let cancelled = false;


    const run = async (silent: boolean) => {
      if (!silent) {
        setError(null);
        setLoading(true);
      }
      try {
        const fresh = await fetchCampPostsList(API, campId);
        if (!cancelled) setItemsCached(mergePostsWithCache(fresh));
      } catch {
        if (!cancelled) {
          setError('Не удалось загрузить посты.');
          if (!silent) setItemsCached([]);
        }
      } finally {
        if (!cancelled && !silent) setLoading(false);
      }
    };

    if (items !== null && reloadKey === 0) {
      run(true);
      return () => { cancelled = true; };
    }

    run(false);
    return () => { cancelled = true; };
  }, [API, campId, reloadKey, mergePostsWithCache]);

  // eslint-disable-next-line react-hooks/exhaustive-deps

  return (
    <TabViewport
      loading={loading}
      status={statusNode}
      resetSignal={viewportResetSignal}
      headerRef={headerRef}
      stuck={!!stuck}
      currentTab="posts"
      fixedHeightMode={true}
      fixedViewportHeight={fixedViewportHeight}
    >
      {!!items?.length && (
        <ul
          className="divide-y divide-gray-100"
          style={{ paddingBottom: 'calc(var(--bottom-gap, 0px) + 24px)' }}
        >
          {items.map((p) => {
            const idx = p.image ? imagesOfPosts.indexOf(p.image) : -1;
            return (
              <CampPostCard
                key={p.id}
                p={p}
                campId={campId}
                organizerAvatar={organizerAvatar}
                organizerUsername={organizerUsername}
                isOrganizer={isOrganizerResolved}
                onOpenComments={onOpenComments}
                onDeleted={(post) => setItemsCached((prev) => (prev ?? []).filter((x) => x.id !== post.id))}
                onOpenPhoto={p.image ? () => onOpenImageGallery(imagesOfPosts, Math.max(0, idx)) : undefined}
                onPinnedChange={(postId, pinned) => {
                  setItemsCached((prev) => {
                    const next = (prev ?? []).map((x) => ({ ...x, is_pinned: x.id === postId ? pinned : false }));
                    const pin = next.find((x) => x.is_pinned);
                    return pin ? [pin, ...next.filter((x) => x.id !== pin.id)] : next.sort(sortPostsByCreatedDesc);
                  });
                }}
                onOpenLikers={onOpenLikers}
                rowId={`post-${p.id}`}
                onReportPost={onReportPost}
                onPostLike={updatePostLikeState}
              />
            );
          })}
        </ul>
      )}
    </TabViewport>
  );
}

/* =========================
   ВКЛАДКА "ОТМЕТКИ"
========================= */


function MarkActionSheet({
  open, onClose, onUnmark,
}: {
  open: boolean;
  onClose: () => void;
  onUnmark: () => void | Promise<void>;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!open || !mounted) return null;

  const handle = (fn?: () => void | Promise<void>) => async () => {
    try { await fn?.(); } finally { onClose(); }
  };

  const node = (
    <div
      className="fixed inset-0 z-[20000] bg-black/40 flex items-center justify-center px-4"
      role="dialog" aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-[min(540px,92vw)] rounded-[24px] bg-white shadow-xl overflow-hidden">
        <button
          className="w-full py-4 text-[17px] font-semibold text-red-600 hover:bg-red-50"
          onClick={handle(onUnmark)}
        >
          Удалить отметку
        </button>
        <div className="h-px bg-gray-200" />
        <button className="w-full py-4 text-[17px] hover:bg-gray-50" onClick={onClose}>
          Отмена
        </button>
      </div>
    </div>
  );
  return createPortal(node, document.body);
}



type ProfileMarkedPost = {
  id: number;
  markId?: number | null;
  author: { username: string; avatar_url: string | null };
  content: string;
  images: string[];
  created_at: string;
};


function buildProfilePostUrl(post: ProfileMarkedPost): string {
  // 👇 если у вас другой маршрут — поменяйте строку ниже
  return `/${post.author.username}/post/${post.id}`;
}

function toImageArray(val: unknown): string[] {
  const out: string[] = [];
  const push = (u?: unknown) => {
    if (!u) return;
    if (typeof u === 'string' && u.trim()) {
      const abs = absUrl(u);
      if (abs) out.push(abs);
    } else if (typeof u === 'object') {
      const rec = u as Record<string, unknown>;
      const url = (rec['url'] as string) ?? (rec['image'] as string) ?? (rec['src'] as string);
      if (url) { const abs = absUrl(url); if (abs) out.push(abs); }
    }
  };
  if (Array.isArray(val)) val.forEach(push);
  else push(val);
  return out;
}

function ProfilePostCard({
  post,
  campId,
  onOpen,
  canUnmark = false,
  onUnmark,
}: {
  post: ProfileMarkedPost;
  campId: number;
  onOpen?: (p: ProfileMarkedPost) => void;
  canUnmark?: boolean;
  onUnmark?: (p: ProfileMarkedPost) => void;
}) {
  const first = post.images[0] || null;
  const extra = Math.max(0, (post.images.length || 0) - 1);
  const showBadge = extra > 0;
  const badgeText = extra >= 9 ? '+9' : `+${extra}`;
  const href = buildProfilePostUrl(post);

  const [actionsOpen, setActionsOpen] = React.useState(false);
  const { navigatePost, navigateProfile } = useAppNavigation();

  const handleOpenPost = React.useCallback((event: React.MouseEvent<HTMLElement>, target: ProfileMarkedPost) => {
    const handled = navigatePost(event, { username: target.author.username, postId: target.id });
    if (!handled) return;
    onOpen?.(target);
    if (campId) {
      setPostFeedContext({ source: 'camp_marks', campId, postId: target.id });
    }
  }, [navigatePost, onOpen, campId]);

  return (
    <li className="py-1.5">
      <div className="flex items-start gap-3 mt-3">
        <Link
          href={`/${post.author.username}`}
          className="flex-shrink-0 self-start inline-block"
          onClick={(event) => navigateProfile(event, { username: post.author.username })}
        >
          <img
            src={post.author.avatar_url || AVATAR_PLACEHOLDER_PATH}
            alt=""
            className="w-8 h-8 rounded-full object-cover border border-gray-200"
          />
        </Link>

        <div className="flex-1 min-w-0 group/mark">
          <div className="text-sm flex items-baseline">
              <Link
                href={`/${post.author.username}`}
                className="font-semibold hover:underline"
                onClick={(event) => navigateProfile(event, { username: post.author.username })}
              >
                {post.author.username}
              </Link>
            <div className="ml-auto flex items-center gap-3">
              {canUnmark && (
                <MoreButton
                  scope="mark"
                  title="Действия"
                  onClick={() => setActionsOpen(true)}
                />
              )}
              <span className="text-[12px] leading-none text-gray-500/60 whitespace-nowrap">
                {dateOnly(post.created_at)}
              </span>
            </div>
          </div>

          {first && (
            <Link
              href={href}
              scroll={false}
              onClick={(event) => handleOpenPost(event, post)}
              className="mt-3 relative inline-block rounded-md border border-gray-200 bg-white overflow-hidden align-top"
              style={{ width: 130, height: 130 }}
              aria-label="Открыть пост"
            >
              <SmartImage src={first} alt="" fill className="object-cover" sizes="130px" />
              {showBadge && (
                <span className="absolute right-1.5 top-1.5 text-[11px] px-1.5 py-0.5 rounded bg-black/70 text-white">
                  {badgeText}
                </span>
              )}
            </Link>
          )}

          {post.content && (
            <div className="mt-3">
              <div
                className="whitespace-pre-wrap leading-snug break-words clamped overflow-hidden no-anchor"
                style={{ WebkitLineClamp: 4 } as React.CSSProperties}
              >
                {post.content}
              </div>

              <Link
                href={href}
                scroll={false}
                onClick={(event) => handleOpenPost(event, post)}
                className="mt-1 inline-block text-xs text-gray-400 hover:text-gray-600"
              >
                развернуть
              </Link>
              <style jsx>{`.clamped{display:-webkit-box;-webkit-box-orient:vertical;}`}</style>
            </div>
          )}
        </div>
      </div>
      {canUnmark && (
        <MarkActionSheet
          open={actionsOpen}
          onClose={() => setActionsOpen(false)}
          onUnmark={() => onUnmark?.(post)}
        />
      )}
    </li>
  );
}

async function fetchCampMarksList(apiBase: string, campId: number, signal?: AbortSignal): Promise<ProfileMarkedPost[]> {
  if (!apiBase || !campId) return [];
  const urls = [
    `${apiBase}/api/camps/${campId}/marks/`,
    `${apiBase}/api/camps/${campId}/tagged-posts/`,
    `${apiBase}/api/camps/${campId}/profile-posts/`,
    `${apiBase}/api/camps/${campId}/mentions/`,
  ];

  for (const u of urls) {
    try {
      const base: RequestInit = { cache: 'no-store' };
      const withInclude: RequestInit = { ...base, credentials: 'include' };
      const withOmit: RequestInit = { ...base, credentials: 'omit' };
      if (signal) { withInclude.signal = signal; withOmit.signal = signal; }
      let r = await fetch(u, withInclude);
      if (!r.ok && (r.status === 401 || r.status === 403)) {
        r = await fetch(u, withOmit);
      }
      if (!r.ok) continue;
      const j: unknown = await r.json();
      const root = j as Record<string, unknown>;
      const arr: Record<string, unknown>[] = Array.isArray(j)
        ? (j as Record<string, unknown>[])
        : Array.isArray(root['results'])
          ? (root['results'] as Record<string, unknown>[])
          : Array.isArray(root['posts'])
            ? (root['posts'] as Record<string, unknown>[])
            : [];

      const norm: ProfileMarkedPost[] = arr
        .map((it) => {
          const authorObj =
            (typeof it['author'] === 'object' && it['author']) ? (it['author'] as UnknownRecord) :
              (typeof it['user'] === 'object' && it['user']) ? (it['user'] as UnknownRecord) :
                (typeof it['profile'] === 'object' && it['profile']) ? (it['profile'] as UnknownRecord) :
                  (typeof it['creator'] === 'object' && it['creator']) ? (it['creator'] as UnknownRecord) :
                    undefined;

          const username =
            (authorObj ? (pickString(authorObj, ['username', 'nick', 'login'])) : null) ||
            pickString(it, ['author_username', 'username']) || '';

          const avatarRaw =
            (authorObj ? (pickString(authorObj, ['avatar', 'avatar_url', 'profile_picture', 'photo', 'photo_url'])) : null) ||
            pickString(it, ['avatar', 'avatar_url', 'profile_picture']);

          let images: string[] = [
            ...toImageArray(it['images']), ...toImageArray(it['photos']),
            ...toImageArray(it['media']), ...toImageArray(it['attachments']),
          ];
          if (!images.length) {
            const one = pickString(it, ['image', 'photo', 'picture', 'thumbnail']);
            const abs = absUrl(one || undefined); if (abs) images = [abs];
          }
          const content = pickString(it, ['content', 'text', 'body', 'caption', 'description']) || '';
          const created_at = pickDateString(it, ['created_at', 'createdAt', 'timestamp', 'date']) || new Date().toISOString();

          const postId =
            pickNumber(it, ['post_id', 'postId', 'post', 'original_post_id']) ??
            (typeof it['post'] === 'object' ? pickNumber(it['post'] as UnknownRecord, ['id']) : null) ??
            (Array.isArray(root['posts']) ? pickNumber(it, ['id', 'pk']) : null) ?? 0;

          const markId =
            pickNumber(it, ['mark_id', 'markId']) ??
            (it['post_id'] != null ? pickNumber(it, ['id']) : null) ??
            (typeof it['mark'] === 'object' ? pickNumber(it['mark'] as UnknownRecord, ['id']) : null) ??
            null;

          const norm: ProfileMarkedPost = {
            id: postId,
            markId,
            author: { username, avatar_url: absUrl(avatarRaw || undefined) },
            content,
            images,
            created_at,
          };
          return norm;
        })
        .filter(x => !!x.author.username && Number.isFinite(x.id))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      if (norm.length) return norm;
      continue;
    } catch {
      if (signal?.aborted) break;
    }
  }

  return [];
}

function CampMarksTab({
  campId,
  isOrganizer = false,
  onCreatePost,
  viewportResetSignal,
  headerRef,
  stuck,
  fixedViewportHeight,
}: {
  campId: number;
  isOrganizer?: boolean;
  onCreatePost?: (opts?: { prefillCampTag?: number }) => void;
  viewportResetSignal?: unknown;
  headerRef?: React.RefObject<HTMLElement | null>;   // 🆕
  stuck?: boolean;
  fixedViewportHeight?: number;
}) {
  const { authenticated } = useAuth();
  const [loginRequiredOpen, setLoginRequiredOpen] = React.useState(false);
  const [completeProfileModalOpen, setCompleteProfileModalOpen] = React.useState(false);
  const { clearScreens } = useLayerStack();
  const onLogin = React.useCallback(() => {
    setLoginRequiredOpen(false);
    clearScreens();
    setTimeout(() => {
      try { window.location.assign('/auth/login'); } catch { window.location.href = '/auth/login'; }
    }, 150);
  }, [clearScreens]);
  const [items, setItems] = React.useState<ProfileMarkedPost[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadingRaw = items === null;
  const showLoader = useDelayedTrue(loadingRaw, 120);
  const statusNode =
    error ? <div className="text-red-600">Не удалось загрузить посты.</div> :
      (loadingRaw && showLoader) ? <div>Загрузка постов…</div> :
        !items?.length ? (
          isOrganizer ? (
            <button
              type="button"
              onClick={() => {
                if (!authenticated) { setLoginRequiredOpen(true); return; }
                if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
                onCreatePost?.({ prefillCampTag: campId });
              }}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              Отметить кэмп
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (!authenticated) { setLoginRequiredOpen(true); return; }
                if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
                onCreatePost?.({ prefillCampTag: campId });
              }}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              Отмечайте наш кэмп
            </button>
          )
        ) : null;


  const cacheKey = React.useMemo(() => `camp:${campId}:marks`, [campId]);

  async function unmarkPost(p: ProfileMarkedPost): Promise<boolean> {
    if (!API) return false;
    await ensureCsrf();
    const json = { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() };
    try {
      const r = await fetch(`${API}/api/camps/${campId}/marks/remove/`, {
        method: 'POST', credentials: 'include', headers: json, body: JSON.stringify({ post_id: p.id }),
      });
      return r.ok;
    } catch { return false; }
  }

  const handleUnmark = React.useCallback(async (p: ProfileMarkedPost) => {
    const ok = await unmarkPost(p);
    if (!ok) { alert('Не удалось удалить отметку'); return; }
    setItems((prev) => {
      const next = (prev ?? []).filter(x => x.id !== p.id);
      try { sessionStorage.setItem(cacheKey, JSON.stringify(next)); } catch { }
      return next;
    });
  }, [cacheKey]);



  React.useEffect(() => {
    if (!API || !campId) return;
    let cancelled = false;

    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw) as ProfileMarkedPost[];
        if (!cancelled && Array.isArray(cached)) setItems(cached);
      }
    } catch { }

    (async () => {
      try {
        setError(null);

        const loaded = await fetchCampMarksList(API, campId);

        if (!cancelled) {
          setItems(loaded);
          try { sessionStorage.setItem(cacheKey, JSON.stringify(loaded)); } catch { }
        }
      } catch {
        if (!cancelled) setError('Не удалось загрузить отметки');
      }
    })();

    return () => { cancelled = true; };
  }, [API, campId, cacheKey]);

  // После создания нового profile‑post с тегом кэмпа (отметка) перезагружаем список отметок
  React.useEffect(() => {
    if (typeof window === 'undefined' || !API || !campId) return;
    let cancelled = false;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ campId: number }>).detail;
      if (!detail || detail.campId !== campId) return;
      (async () => {
        try {
          const fresh = await fetchCampMarksList(API, campId);
          if (!cancelled) {
            setItems(fresh);
            try { sessionStorage.setItem(cacheKey, JSON.stringify(fresh)); } catch { /* noop */ }
          }
        } catch {
          /* мягко игнорируем – просто не обновим список */
        }
      })();
    };
    window.addEventListener(CAMP_MARK_ADDED_EVENT, handler as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener(CAMP_MARK_ADDED_EVENT, handler as EventListener);
    };
  }, [API, campId, cacheKey]);

  // Дополнительно следим за глобальными событиями профиля (создание/удаление поста),
  // чтобы список отметок кэмпа обновлялся даже если отметка добавлена/удалена вне ленты кэмпа.
  React.useEffect(() => {
    if (typeof window === 'undefined' || !API || !campId) return;
    let cancelled = false;

    const reloadMarks = async () => {
      try {
        const fresh = await fetchCampMarksList(API, campId);
        if (!cancelled) {
          setItems(fresh);
          try { sessionStorage.setItem(cacheKey, JSON.stringify(fresh)); } catch { /* noop */ }
        }
      } catch {
        /* мягко игнорируем – просто не обновим список */
      }
    };

    const onProfilePostCreated = (event: Event) => {
      const detail = (event as CustomEvent<{ post?: unknown | null }>).detail;
      const post = detail?.post;
      if (!post || typeof post !== 'object') return;
      const rec = post as Record<string, unknown>;
      const postCampId = Number(rec['camp_id']);
      if (!Number.isFinite(postCampId) || postCampId !== campId) return;
      void reloadMarks();
    };

    const onProfilePostDeleted = () => {
      // При удалении поста с отметкой кэмпа backend снимает отметку;
      // надёжнее всего просто перезагрузить список отметок для этого campId.
      void reloadMarks();
    };

    window.addEventListener('profile_post_created', onProfilePostCreated as EventListener);
    window.addEventListener('profile_post_deleted', onProfilePostDeleted as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener('profile_post_created', onProfilePostCreated as EventListener);
      window.removeEventListener('profile_post_deleted', onProfilePostDeleted as EventListener);
    };
  }, [API, campId, cacheKey]);

  return (
    <TabViewport
      loading={loadingRaw}
      status={statusNode}
      resetSignal={viewportResetSignal}
      headerRef={headerRef}
      stuck={!!stuck}
      currentTab="marks"
      fixedHeightMode={true}
      fixedViewportHeight={fixedViewportHeight}
    >
      <ul
        className="divide-y divide-gray-100"
        style={{ paddingBottom: 'calc(var(--bottom-gap, 0px) + 24px)' }}
      >
        {(items ?? []).map((p) => (
          <ProfilePostCard
            key={p.id}
            post={p}
            campId={campId}
            canUnmark={!!isOrganizer}
            onUnmark={handleUnmark}
          />
        ))}
      </ul>
      <CompleteProfileActionModal
        open={completeProfileModalOpen}
        onClose={() => setCompleteProfileModalOpen(false)}
      />
      <ConfirmModal
        open={loginRequiredOpen}
        onCancel={() => setLoginRequiredOpen(false)}
        onConfirm={onLogin}
        title="Это действие доступно только авторизованным пользователям"
        cancelLabel="Отмена"
        confirmLabel="Войти"
      />
      <CompleteProfileActionModal
        open={completeProfileModalOpen}
        onClose={() => setCompleteProfileModalOpen(false)}
      />
    </TabViewport>
  );
}

/* =========================
   ВКЛАДКА "ПОДПИСЧИКИ"
========================= */


async function fetchCampSubscribersList(apiBase: string, campId: number, signal?: AbortSignal): Promise<{ id: number; username: string; avatar: string | null }[]> {
  if (!apiBase || !campId) return [];
  const url = `${apiBase}/api/camps/${campId}/subscribers/`;
  const tryFetch = async (cred: RequestCredentials) => {
    const opts: RequestInit = { credentials: cred, cache: 'no-store' };
    if (signal) opts.signal = signal;
    return fetch(url, opts);
  };
  let r: Response | null = null;
  try {
    r = await tryFetch('include');
    if (!r.ok && (r.status === 401 || r.status === 403)) throw new Error(String(r.status));
  } catch {
    try { r = await tryFetch('omit'); } catch { /* noop */ }
  }
  if (!r || !r.ok) throw new Error(String(r ? r.status : 'fetch_failed'));
  const j = (await r.json()) as { results?: UnknownRecord[] } | UnknownRecord[];
  const arr: UnknownRecord[] = Array.isArray(j)
    ? (j as UnknownRecord[])
    : Array.isArray((j as { results?: UnknownRecord[] })?.results)
      ? ((j as { results?: UnknownRecord[] }).results as UnknownRecord[])
      : [];
  return arr.map((u) => ({
    id: asNumber(u['id']) ?? 0,
    username: pickString(u, ['username']) ?? '',
    avatar: absUrl(pickString(u, ['avatar', 'avatar_url', 'profile_picture', 'photo', 'photo_url']) ?? undefined),
  })).filter((u) => Number.isFinite(u.id) && !!u.username);
}

function CampSubscribersTab({ campId, reloadKey = 0, viewportResetSignal, headerRef, stuck, fixedViewportHeight }: { campId: number; reloadKey?: number; viewportResetSignal?: unknown; headerRef?: React.RefObject<HTMLElement | null>; stuck?: boolean; fixedViewportHeight?: number; }) {
  const cacheKey = React.useMemo(() => `camp:${campId}:subscribers`, [campId]);
  const [items, setItemsCached] = useSessionCache<{ id: number; username: string; avatar: string | null }[]>(cacheKey, null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(() => items === null);
  const showLoader = useDelayedTrue(loading, 120);
  const { navigateProfile } = useAppNavigation();

  useEffect(() => {
    if (!API || !campId) return;
    let cancelled = false;

    if (items !== null && reloadKey === 0) {
      (async () => {
        try {
          const fresh = await fetchCampSubscribersList(API, campId);
          if (!cancelled) setItemsCached(fresh);
        } catch {/* silent */ }
      })();
      return () => { cancelled = true; };
    }

    setErr(null);
    setLoading(true);


    (async () => {
      try {
        const fresh = await fetchCampSubscribersList(API, campId);
        if (!cancelled) setItemsCached(fresh);
      } catch {
        if (!cancelled) {
          setErr('Не удалось загрузить подписчиков.');
          setItemsCached([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API, campId, reloadKey]);

  return (
    <TabViewport
      loading={loading}
      resetSignal={viewportResetSignal}
      headerRef={headerRef}
      stuck={!!stuck}
      currentTab="subscribers"
      fixedHeightMode={true}
      fixedViewportHeight={fixedViewportHeight}
    >
      {err ? (
        <div className="px-4 py-3 text-red-600">Не удалось загрузить подписчиков.</div>
      ) : loading && showLoader ? (
        <div className="px-4 py-3 text-gray-500">Подписчики загружаются…</div>
      ) : !items?.length ? (
        <div className="px-4 py-3 text-gray-500">тут пока пусто, но вы подписывайтесь</div>
      ) : (
        <ul
          className="divide-y divide-gray-100"
          style={{ paddingBottom: 'calc(var(--bottom-gap, 0px) + 24px)' }}
        >
          {items.map(u => (
            <li key={u.id} className="px-4 py-3">
              <Link
                href={`/${u.username}`}
                className="flex items-center gap-3 no-underline hover:underline"
                onClick={(event) => navigateProfile(event, { username: u.username })}
              >
                <AvatarImg src={u.avatar} alt={`@${u.username}`} className="w-8 h-8 rounded-full object-cover" />
                <span className="font-semibold">{u.username}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </TabViewport>
  );
}


/* =========================
   ВКЛАДКА "КОММЕНТАРИИ / ЛЕНТА"
========================= */

type CampCommentReport = {
  id: number;
  isReply?: boolean;
  author?: string;
  text?: string;
};



function escRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function Comments({
  campId, onCountChange, scrollToRootId, postPreview, organizerUsername,
  isOrganizer, initialReplyTarget, onInitialReplyTargetUsed, organizerAvatar,
  onOpenImageGallery, onOpenLikers, ioBottomMarginPx = 2000, viewportResetSignal, headerRef, stuck,
  fixedViewportHeight, onReportPost, onOpenReportComment,
}: {
  campId: number;
  onCountChange?: (delta: number) => void;
  scrollToRootId?: number;
  postPreview?: CampPost | null;
  organizerUsername?: string | null;
  isOrganizer?: boolean;
  initialReplyTarget?: { rootId: number; username: string } | null;
  onInitialReplyTargetUsed?: () => void;
  organizerAvatar: string;
  onOpenImageGallery: (images: string[], startIndex: number) => void;
  onOpenLikers: (src: LikeSource) => void;
  ioBottomMarginPx?: number;
  viewportResetSignal?: unknown;
  headerRef?: React.RefObject<HTMLElement | null>;
  stuck?: boolean;
  fixedViewportHeight?: number;
  onReportPost?: (post: CampPost) => void;
  onOpenReportComment?: (payload: CampCommentReport) => void;
}) {
  const { authenticated } = useAuth();
  const [loginRequiredOpen, setLoginRequiredOpen] = useState(false);
  const [completeProfileModalOpen, setCompleteProfileModalOpen] = useState(false);
  const { clearScreens } = useLayerStack();
  const onLogin = React.useCallback(() => {
    setLoginRequiredOpen(false);
    clearScreens();
    setTimeout(() => {
      try { window.location.assign('/auth/login'); } catch { window.location.href = '/auth/login'; }
    }, 150);
  }, [clearScreens]);

  // должно вернуть первую страницу + next
  async function fetchCommentsFirstPage(campId: number): Promise<{ items: CommentItem[]; next: string | null }> {
    const url = `${API}/api/camps/${campId}/comments/`;
    const makeReq = (cred: RequestCredentials) => fetch(url, { credentials: cred, cache: 'no-store', headers: { Accept: 'application/json' } });
    let r: Response | null = null;
    let text: string | null = null;
    try {
      r = await makeReq('include');
      if (!r.ok && (r.status === 401 || r.status === 403)) throw new Error(String(r.status));
      // Иногда сервер отдаёт HTML с 200 (редирект/логин). Проверим тип/парсинг.
      try { return await parseCommentsResponse(await r.clone().json()); } catch {
        text = await r.text();
        throw new Error('bad_json');
      }
    } catch {
      try {
        r = await makeReq('omit');
        if (!r.ok) throw new Error(String(r.status));
        try { return await parseCommentsResponse(await r.clone().json()); } catch {
          // если снова не JSON — падаем
          text = await r.text();
          throw new Error('bad_json');
        }
      } catch {
        throw new Error(text ? 'fetch_non_json' : String((r && r.status) || 'fetch_failed'));
      }
    }
  }

  function parseCommentsResponse(j: unknown): { items: CommentItem[]; next: string | null } {
    const root = j as Record<string, unknown>;
    const arr = Array.isArray(j)
      ? j
      : Array.isArray(root['results']) ? (root['results'] as unknown[]) :
        Array.isArray(root['comments']) ? (root['comments'] as unknown[]) :
          [];
    const items = (arr as UnknownRecord[])
      .map(normalizeComment)
      .filter(x => x.id);
    const next = (typeof root['next'] === 'string' ? root['next'] : null);
    return { items, next };
  }

  async function fetchCommentsNext(
    url: string
  ): Promise<{ chunk: CommentItem[]; next: string | null }> {
    const makeReq = (cred: RequestCredentials) => fetch(url, { credentials: cred, cache: 'no-store', headers: { Accept: 'application/json' } });
    let r: Response | null = null;
    let text: string | null = null;
    try {
      r = await makeReq('include');
      if (!r.ok && (r.status === 401 || r.status === 403)) throw new Error(String(r.status));
      try { return await parseCommentsNextResponse(await r.clone().json()); } catch {
        text = await r.text();
        throw new Error('bad_json');
      }
    } catch {
      try {
        r = await makeReq('omit');
        if (!r.ok) throw new Error(String(r.status));
        try { return await parseCommentsNextResponse(await r.clone().json()); } catch {
          text = await r.text();
          throw new Error('bad_json');
        }
      } catch {
        throw new Error(text ? 'fetch_non_json' : String((r && r.status) || 'fetch_failed'));
      }
    }
  }

  function parseCommentsNextResponse(j: unknown): { chunk: CommentItem[]; next: string | null } {
    const root = j as Record<string, unknown>;
    const arr = Array.isArray(j)
      ? (j as unknown[])
      : Array.isArray(root['results'])
        ? (root['results'] as unknown[])
        : Array.isArray(root['comments'])
          ? (root['comments'] as unknown[])
          : [];
    const chunk = (arr as UnknownRecord[]).map(normalizeComment).filter((x) => x.id);
    const next = typeof root['next'] === 'string' ? root['next'] : null;
    return { chunk, next };
  }



  const cacheKey = React.useMemo(() => `camp:${campId}:comments`, [campId]);
  const [items, setItemsCached] = useSessionCache<CommentItem[]>(cacheKey, null);
  const [err, setErr] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(() => items === null);
  const showLoader = useDelayedTrue(initialLoading, 120);

  // статус вычислим ниже, когда узнаем есть ли посты (postItems)

  React.useEffect(() => {
    let cancelled = false;

    // если в кэше уже есть — рендерим мгновенно без «Загрузка…»
    if (items !== null) {
      // фоновая «тихая» актуализация без сброса стейта
      (async () => {
        try {
          const { items: fresh, next } = await fetchCommentsFirstPage(campId); // ← вернём next
          if (!cancelled && fresh) {
            const withCache = applyLikesCacheToTree(fresh, meRef.current ?? null);
            setItemsCached(withCache);
            setNextUrl(next ?? null);
          }
        } catch {/* no-op */ }
      })();
      return () => { cancelled = true; };
    }

    // если кэша нет — обычная первичная загрузка
    (async () => {
      setErr(null);
      setInitialLoading(true);
      try {
        const { items: first, next } = await fetchCommentsFirstPage(campId);
        if (!cancelled) {
          const withCache = applyLikesCacheToTree(first || [], meRef.current ?? null);
          setItemsCached(withCache);
          setNextUrl(next ?? null);
        }
      } catch {
        if (!cancelled) { setErr('Не удалось загрузить комментарии.'); setItemsCached([]); }
      } finally {
        if (!cancelled) setInitialLoading(false);
      }

    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campId]); // важно: не сбрасываем items в null на каждый возврат на вкладку

  // Синхронизация новых комментариев между страницей кэмпа и оверлеями
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<CampCommentCreatedDetail>).detail;
      if (!detail || detail.campId !== campId) return;
      const raw = detail.comment as CommentItem | undefined;
      if (!raw || !raw.id) return;

      setItemsCached((prev) => {
        const prevArr: CommentItem[] = prev ?? [];

        const rawObj = raw as unknown as Record<string, unknown>;
        const explicitRoot =
          typeof detail.rootId === 'number' ? detail.rootId :
            detail.rootId === null ? null : undefined;
        const parentId =
          explicitRoot ??
          pickNumber(rawObj, ['root_comment_id', 'root_id', 'root']) ??
          pickNumber(rawObj, ['parent_id', 'parent']) ??
          null;

        const isReply =
          typeof detail.isReply === 'boolean'
            ? detail.isReply
            : parentId !== null;

        // логируем приход события для отладки дублей
        try {
          console.debug('[CampComments][event] incoming', {
            campId,
            commentId: raw.id,
            root_comment_id: (rawObj['root_comment_id'] ?? null),
            parentId,
            isReply,
            prevRoots: prevArr.map((c) => c.id),
          });
        } catch { /* noop */ }

        if (isReply && parentId) {
          // ответ: добавляем только во вложенные replies соответствующего корня, без дублей
          const next = prevArr.map((root) => {
            if (root.id !== parentId) return root;
            const replies = root.replies || [];
            if (replies.some((r) => r.id === raw.id)) return root;
            return { ...root, replies: [...replies, raw] };
          });
          return next;
        }

        // корневой коммент: добавляем в список корней, избегая дублей
        const exists = prevArr.some(c => c.id === raw.id);
        if (exists) return prevArr;
        return [...prevArr, raw];
      });
    };
    window.addEventListener(CAMP_COMMENT_CREATED_EVENT, handler as EventListener);
    return () => window.removeEventListener(CAMP_COMMENT_CREATED_EVENT, handler as EventListener);
  }, [campId, setItemsCached]);


  const [replyTarget, setReplyTarget] = useState<null | { rootId: number; username: string }>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const textRef = useRef<string>(""); // текущее значение textarea без перерисовок

  const [hasText, setHasText] = useState(false);

  const [actionSheet, setActionSheet] = useState<{
    open: boolean;
    onReport?: () => void | Promise<void>;
    onDelete?: () => void | Promise<void>;
  }>({ open: false });

  const openActions = useCallback((opts: {
    onReport?: () => void | Promise<void>;
    onDelete?: () => void | Promise<void>;
  }) => {
    const wrapped = {
      onDelete: opts.onDelete,
      onReport: opts.onReport
        ? async () => {
          if (!authenticated) { setLoginRequiredOpen(true); return; }
          await opts.onReport?.();
        }
        : undefined,
    };
    setActionSheet({ open: true, ...wrapped });
  }, [authenticated]);


  const sentinelRef = React.useRef<HTMLLIElement | null>(null);
  const ioRef = React.useRef<IntersectionObserver | null>(null);
  const ioRootRef = React.useRef<HTMLElement | null>(null);

  // признаки пагинации
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [pagingBusy, setPagingBusy] = useState(false);

  const [me, setMe] = useState<string | null | undefined>(undefined);
  const [meAvatar, setMeAvatar] = useState<string | null>(null);
  const meRef = React.useRef<string | null | undefined>(me);
  React.useEffect(() => { meRef.current = me; }, [me]);

  // ваш существующий loadMore, только без завязки на window
  const loadMore = React.useCallback(async () => {
    if (!nextUrl || pagingBusy) return;
    setPagingBusy(true);
    try {
      const { chunk, next } = await fetchCommentsNext(nextUrl);
      const fixed = applyLikesCacheToTree(chunk, me ?? null);
      setItemsCached(prev => ([...(prev ?? []), ...fixed]));
      setNextUrl(next ?? null);
    } catch {/* no-op */ }
    finally { setPagingBusy(false); }
  }, [nextUrl, pagingBusy, setItemsCached, me, applyLikesCacheToTree]);


  // создаём IO строго на скроллер вкладки
  React.useEffect(() => {
    const s = sentinelRef.current;
    if (!s) return;

    const bottom = Math.max(2000, Number.isFinite(ioBottomMarginPx) ? ioBottomMarginPx : 2000);
    let io: IntersectionObserver | null = null;
    let currentRoot: Element | null = null;

    const attach = () => {
      const newRoot = findScrollParent(s);
      if (newRoot === currentRoot && io) return;
      if (io) io.disconnect();
      currentRoot = newRoot;
      io = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      }, {
        root: (currentRoot ?? null),
        rootMargin: `800px 0px ${bottom}px 0px`,
        threshold: 0,
      });
      io.observe(s);
      ioRef.current = io;
      ioRootRef.current = currentRoot as HTMLElement | null;
    };

    attach();

    const recheck = () => attach();
    window.addEventListener('scroll', recheck, { passive: true });
    window.addEventListener('resize', recheck);
    const ro = new ResizeObserver(recheck);
    ro.observe(document.documentElement);

    return () => {
      window.removeEventListener('scroll', recheck);
      window.removeEventListener('resize', recheck);
      ro.disconnect();
      io?.disconnect();
    };
  }, [loadMore, ioBottomMarginPx]);





  const rootById = useMemo(() => {
    const m = new Map<number, CommentItem>();
    (items || []).forEach(c => m.set(c.id, c));
    return m;
  }, [items])

  const inputWrapRef = useRef<HTMLDivElement | null>(null);         //контейнер инпута


  const [sending, setSending] = useState(false);
  const { isOverlay } = useOverlayEnvironment();

  // На отдельной странице кэмпа подстраиваем глобальный bottom-gap под высоту
  // блока ввода комментария. В оверлее кэмпа этого делать нельзя, иначе
  // будет ломаться layout базовой страницы (поиска и т.п.), поэтому
  // в режиме isOverlay просто пропускаем этот эффект.
  useLayoutEffect(() => {
    if (isOverlay) return;
    const el = inputWrapRef.current;
    if (!el) return;
    const root = document.documentElement;
    const prevInline = root.style.getPropertyValue('--bottom-gap');
    const setGap = () => {
      const h = el.offsetHeight || 0;
      root.style.setProperty('--bottom-gap', `${h + 12}px`);
    };
    setGap();
    const ro = new ResizeObserver(setGap);
    ro.observe(el);
    window.addEventListener('resize', setGap);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', setGap);
      if (prevInline) root.style.setProperty('--bottom-gap', prevInline);
      else root.style.removeProperty('--bottom-gap');
    };
  }, [isOverlay]);



  // --- локальный кэш моих лайков комментариев (по username) ---
  const likesCacheKey = (me: string | null) => `camp:comments:likes:${me ?? 'guest'}`;

  function readCommentLikes(me: string | null): Record<number, true> {
    try {
      const raw = localStorage.getItem(likesCacheKey(me));
      return raw ? (JSON.parse(raw) as Record<number, true>) : {};
    } catch { return {}; }
  }

  function writeCommentLikes(me: string | null, map: Record<number, true>) {
    try { localStorage.setItem(likesCacheKey(me), JSON.stringify(map)); } catch { }
  }

  function setCachedLike(me: string | null, id: number, liked: boolean) {
    const map = readCommentLikes(me);
    if (liked) map[id] = true;
    else delete map[id];
    writeCommentLikes(me, map);
  }

function applyLikesCacheToTree(list: CommentItem[], meUser: string | null): CommentItem[] {
  const cached = readCommentLikes(meUser);
  const walk = (arr: CommentItem[]): CommentItem[] =>
    arr.map((c) => {
      const liked_by_me = !!(cached[c.id] || c.liked_by_me);
      const replies = c.replies?.length ? walk(c.replies) : [];
        if (liked_by_me !== c.liked_by_me || replies !== c.replies) {
          return { ...c, liked_by_me, replies };
        }
        return c;
      });

    return walk(list);
  }


  // выравнивание таргета ровно над инпутом
  // было: const scroller = document.scrollingElement || document.documentElement;
  const alignAboveInputById = useCallback((domId: string) => {
    const el = document.getElementById(domId);
    const inputEl = inputWrapRef.current;
    if (!el || !inputEl) return;

    const scroller = findScrollParent(el); // ← ключевое
    const getTop = () =>
      scroller ? scroller.scrollTop :
        window.scrollY || document.documentElement.scrollTop || 0;
    const setTop = (v: number) => {
      if (scroller) scroller.scrollTop = v;
      else window.scrollTo({ top: v, behavior: 'auto' });
    };

    const targetRect = el.getBoundingClientRect();
    const inputRect = inputEl.getBoundingClientRect();
    const gap = 8;

    // сколько надо докрутить, округляем к DPR — это тоже лечит webkit-неточности
    const dpr = window.devicePixelRatio || 1;
    const rawDelta = targetRect.bottom - (inputRect.top - gap);
    const delta = Math.round(rawDelta * dpr) / dpr;
    if (Math.abs(delta) < 0.5 / dpr) return;

    // временно убираем smooth-scroll именно на НУЖНОМ скроллере
    let restore: (() => void) | null = null;
    if (scroller) {
      const prev = scroller.style.scrollBehavior;
      scroller.style.scrollBehavior = 'auto';
      restore = () => { scroller.style.scrollBehavior = prev; };
    } else {
      const elDoc = document.documentElement;
      const prev = elDoc.style.scrollBehavior;
      elDoc.style.scrollBehavior = 'auto';
      restore = () => { elDoc.style.scrollBehavior = prev; };
    }

    const prevTop = getTop();
    setTop(prevTop + delta);
    restore?.();
  }, []);


  // единая функция "начать ответ": ставим @, фокус и позиционируем таргет
  const focusReply = useCallback((rootId: number, username: string, targetDomId: string) => {
    const uname = (username || "").replace(/^@+/, "");
    const mention = `@${uname} `;

    // ВАЖНО: жёстко перезаписываем контент инпута
    flushSync(() => {
      setReplyTarget({ rootId, username: uname });
      setTextareaValue(mention);
    });

    requestAnimationFrame(() => {
      alignAboveInputById(targetDomId);
      const el = inputRef.current;
      if (el) {
        try { el.focus({ preventScroll: true }); } catch { el.focus(); }
        el.setSelectionRange(mention.length, mention.length);
      }
    });
  }, [alignAboveInputById]);

  // ↓ узнаём своего пользователя, чтобы спрятать «Пожаловаться»



  const [postItems, setPostItems] = useState<CampPost[] | null>(null);
  const [, setPostsError] = useState<string | null>(null);


  useEffect(() => {
    if (!API || !campId) return;
    let cancelled = false;

    (async () => {
      setPostsError(null);
      try {
        const r = await fetch(`${API}/api/camps/${campId}/posts/`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!r.ok) throw new Error(String(r.status));
        const j: unknown = await r.json();
        const root = j as UnknownRecord;
        const arr: UnknownRecord[] = Array.isArray(j)
          ? (j as UnknownRecord[])
          : Array.isArray(root['results'])
            ? (root['results'] as UnknownRecord[])
            : Array.isArray(root['posts'])
              ? (root['posts'] as UnknownRecord[])
              : [];

        const norm: CampPost[] = arr
          .map((it) => ({
            id: Number(it['id']),
            title: pickString(it, ['title']),
            content: pickString(it, ['content', 'text']),
            image: absUrl(pickString(it, ['image']) || undefined),
            created_at: pickString(it, ['created_at']) || '',
            replies_count: pickNumber(it, ['replies_count']) ?? 0,
            likes_count: pickNumber(it, ['likes_count']) ?? 0,
            liked_by_me: !!pickBool(it, ['liked_by_me']),
            can_delete: !!pickBool(it, ['can_delete']),
            root_comment_id: pickNumber(it, ['root_comment_id']) ?? undefined,

            is_pinned: !!pickBool(it, ['is_pinned', 'pinned']),
          }))
          .filter((p) => Number.isFinite(p.id));

        norm.sort(sortPostsByCreatedDesc);


        if (!cancelled) setPostItems(norm);
      } catch {
        if (!cancelled) {
          setPostsError('Не удалось загрузить посты.');
          setPostItems([]);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [API, campId]);

  const updateFeedPostLike = useCallback((postId: number, liked: boolean, likes: number) => {
    setPostItems((prev) => {
      if (!prev) return prev;
      let mutated = false;
      const next = prev.map((post) => {
        if (post.id !== postId) return post;
        const nextLikes = likes ?? 0;
        if (post.liked_by_me === liked && (post.likes_count ?? 0) === nextLikes) return post;
        mutated = true;
        return { ...post, liked_by_me: liked, likes_count: nextLikes };
      });
      return mutated ? next : prev;
    });
    setPostLikeCache(me ?? null, postId, liked);
  }, [setPostItems, me]);



  const postRootIdSet = React.useMemo(() => {
    const ids = new Set<number>();
    (postItems || []).forEach(p => { if (p.root_comment_id) ids.add(p.root_comment_id); });
    return ids;
  }, [postItems]);
  const isPostStub = (c: CommentItem) =>
    !!c.content && /^(post|пост)$/i.test(c.content.trim());
  const visibleCommentRoots = React.useMemo(
    () => (items || []).filter(c => !postRootIdSet.has(c.id) && !isPostStub(c)),
    [items, postRootIdSet]
  );

  // Статус пустоты: скрываем «Напишите первый комментарий», если на вкладке отображаются посты кэмпа
  const hasCampPosts = (postItems?.length ?? 0) > 0;
  const statusNode =
    err ? <div className="text-red-600">Не удалось загрузить комментарии.</div> :
      (initialLoading && showLoader) ? <div>Загрузка комментариев…</div> :
        (!items?.length && !hasCampPosts) ? <div>Напишите первый комментарий</div> : null;


  const normalizeUsername = (u: string | null | undefined) => {
    if (!u) return null;
    const trimmed = u.trim().replace(/^@+/, '').toLowerCase();
    return trimmed || null;
  };
  const meUsername = normalizeUsername(me ?? null);
  const organizerUsernameNormalized = normalizeUsername(organizerUsername ?? null);

  const isOrganizerResolved =
    (typeof isOrganizer === 'boolean' ? isOrganizer : false) ||
    (!!meUsername && !!organizerUsernameNormalized && meUsername === organizerUsernameNormalized);

  const countReplies = (root?: CommentItem | null) =>
    (root?.replies || []).filter(r => !r.is_deleted).length;

  useEffect(() => {
    if (me === undefined || items === null) return;
    setItemsCached(prev => applyLikesCacheToTree(prev ?? [], me));
  }, [me]);

  // Жёсткая синхронизация liked_by_me для комментариев к кэмпу:
  // если в локальном кэше есть мой лайк на комментарии/ответе, сердечко обязано быть красным.
  useEffect(() => {
    if (!authenticated) return;
    if (me === undefined || items === null) return;
    const meUser = me ?? null;
    const cached = readCommentLikes(meUser);
    // проверяем только случаи, когда в локальном кэше есть лайк,
    // а в дереве комментариев liked_by_me === false.
    const differs = (arr: CommentItem[]): boolean =>
      arr.some((c) => {
        const hasCachedLike = !!cached[c.id];
        if (hasCachedLike && !c.liked_by_me) return true;
        return c.replies?.length ? differs(c.replies) : false;
      });
    if (!differs(items)) return;
    setItemsCached(prev => applyLikesCacheToTree(prev ?? [], meUser));
  }, [authenticated, me, items, setItemsCached, applyLikesCacheToTree]);



  type FeedEntry =
    | { kind: 'comment'; ts: number; likes: number; replies: number; mine: boolean; engaged: boolean; comment: CommentItem }
    | { kind: 'post'; ts: number; likes: number; replies: number; mine: boolean; engaged: boolean; post: CampPost };


  const pinnedPost = React.useMemo(
    () => (postItems || []).find(p => p.is_pinned),
    [postItems]
  );


  const nonPinnedPosts = React.useMemo(
    () => (postItems || []).filter(p => !p.is_pinned),
    [postItems]
  );

  const feedOrderRef = React.useRef<Map<string, number>>(new Map());
  const feedOrderSeqRef = React.useRef(0);

  useEffect(() => {
    feedOrderRef.current.clear();
    feedOrderSeqRef.current = 0;
  }, [campId]);


  const feedWithoutPinned = React.useMemo(() => {
    const list: FeedEntry[] = [];

    // комментарии (корни, не являющиеся пост-стабами)
    visibleCommentRoots.forEach((c) => {
      const ts = new Date(c.created_at).getTime();
      const likes = c.likes_count ?? 0;
      const replies = countReplies(c);
      const mine = !!meUsername && normalizeUsername(c.author?.username) === meUsername;
      const engaged = !mine && !!meUsername && lastMyReplyAt(c, meUsername) !== null;

      list.push({
        kind: 'comment',
        ts: Number.isFinite(ts) ? ts : 0,
        likes,
        replies,
        mine,
        engaged,
        comment: c,
      });
    });

    // посты (кроме закреплённого)
    nonPinnedPosts.forEach((p) => {
      const ts = new Date(p.created_at).getTime();
      const likes = p.likes_count ?? 0;
      const root = p.root_comment_id ? rootById.get(p.root_comment_id) : undefined;
      const replies =
        typeof p.replies_count === 'number' ? p.replies_count : countReplies(root);

      const rootAuthor = normalizeUsername(root?.author?.username);
      const mine =
        !isOrganizerResolved && !!meUsername &&
        ((!!rootAuthor && rootAuthor === meUsername) ||
          (!!organizerUsernameNormalized &&
            organizerUsernameNormalized === meUsername));

      const engaged =
        !mine && !!meUsername && root
          ? lastMyReplyAt(root, meUsername) !== null
          : false;

      list.push({
        kind: 'post',
        ts: Number.isFinite(ts) ? ts : 0,
        likes,
        replies: replies ?? 0,
        mine,
        engaged,
        post: p,
      });
    });

    // разложим по трём корзинам
    const mineArr = list.filter((e) => e.mine);
    const engagedArr = list.filter((e) => !e.mine && e.engaged);
    const othersArr = list.filter((e) => !e.mine && !e.engaged);

    const byMine = (a: FeedEntry, b: FeedEntry) =>
      b.likes - a.likes || b.replies - a.replies || b.ts - a.ts;
    const byEngaged = (a: FeedEntry, b: FeedEntry) =>
      b.likes - a.likes || a.ts - b.ts;
    const byDefault = (a: FeedEntry, b: FeedEntry) =>
      b.likes - a.likes || a.ts - b.ts;

    mineArr.sort(byMine);
    engagedArr.sort(byEngaged);
    othersArr.sort(byDefault);

    const combined = [...mineArr, ...engagedArr, ...othersArr];

    const entryKey = (e: FeedEntry) =>
      e.kind === 'post' ? `post:${e.post.id}` : `comment:${e.comment.id}`;

    const orderMap = feedOrderRef.current;
    const seqRef = feedOrderSeqRef;

    // инициализация: один раз фиксируем изначальный порядок
    if (orderMap.size === 0) {
      combined.forEach((e) => {
        const k = entryKey(e);
        if (!orderMap.has(k)) orderMap.set(k, seqRef.current++);
      });
    }

    // добавляем новые ключи в конец
    combined.forEach((e) => {
      const k = entryKey(e);
      if (!orderMap.has(k)) orderMap.set(k, seqRef.current++);
    });

    // вычищаем ключи, которых больше нет
    const present = new Set(combined.map(entryKey));
    Array.from(orderMap.keys()).forEach((k) => {
      if (!present.has(k)) orderMap.delete(k);
    });

    // стабильно упорядочиваем по зафиксированным индексам
    const ordered = combined.slice().sort((a, b) => {
      const ka = entryKey(a), kb = entryKey(b);
      const oa = orderMap.get(ka) ?? Number.MAX_SAFE_INTEGER;
      const ob = orderMap.get(kb) ?? Number.MAX_SAFE_INTEGER;
      return oa - ob;
    });

    return ordered.map((entry) =>
      entry.kind === 'post'
        ? ({ kind: 'post' as const, p: entry.post })
        : ({ kind: 'comment' as const, c: entry.comment })
    );
  }, [
    visibleCommentRoots,
    nonPinnedPosts,
    rootById,
    meUsername,
    organizerUsernameNormalized,
    isOrganizer
  ]);



  const feed: Array<{ kind: 'comment'; c: CommentItem } | { kind: 'post'; p: CampPost }> =
    React.useMemo(() => {
      if (!pinnedPost) return feedWithoutPinned;
      return [{ kind: 'post' as const, p: pinnedPost }, ...feedWithoutPinned];
    }, [feedWithoutPinned, pinnedPost]);


  const handlePostDeleted = useCallback((post: CampPost) => {
    // убираем сам пост из ленты постов
    setPostItems(prev => (prev ?? []).filter(x => x.id !== post.id));

    // и выпиливаем корневую ветку комментариев поста, если она есть
    if (post.root_comment_id) {
      setItemsCached((prev) => {
        const prevArr: CommentItem[] = prev ?? [];
        const { next, removed } = removeCommentFromTree(prevArr, post.root_comment_id!);
        onCountChange?.(-removed);
        return next;
      });
    }
  }, [onCountChange]);


  const pendingReplyRef = useRef<{ rootId: number; username?: string } | null>(null);


  const prefilledOnceRef = useRef(false);

  const tryPrefillReply = useCallback(() => {
    if (prefilledOnceRef.current) return false;
    const p = pendingReplyRef.current;
    if (!p) return false;

    const candidate =
      // если это ответ на пост — приоритет имени организатора
      (postPreview && postPreview.root_comment_id === p.rootId && organizerUsername
        ? organizerUsername
        : undefined)
      // если из внешнего контекста всё-таки пришло имя — уважаем его
      || p.username
      // иначе берём автора корня, если есть
      || rootById.get(p.rootId)?.author?.username
      // и последний фолбэк — организатор
      || organizerUsername
      || "";

    const finalUname = candidate.replace(/^@+/, "");
    if (!finalUname) return false;
    const mention = `@${finalUname} `;


    flushSync(() => {
      setReplyTarget({ rootId: p.rootId, username: finalUname });
      setTextareaValue(mention);
    });

    pendingReplyRef.current = null;
    prefilledOnceRef.current = true;

    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        try { el.focus({ preventScroll: true }); } catch { el.focus(); }
        el.setSelectionRange(mention.length, mention.length);
      }
    });

    return true;
  }, [rootById, organizerUsername, onInitialReplyTargetUsed, postPreview]);


  // 1) кладём «намерение» в ref и пытаемся сразу (если username уже есть)
  useLayoutEffect(() => {
    if (!initialReplyTarget) return;
    pendingReplyRef.current = initialReplyTarget;
    tryPrefillReply();
  }, [initialReplyTarget, tryPrefillReply]);

  // 2) если данные подтянулись позже (items/rootById обновились) — дожимаем префилл
  useEffect(() => {
    tryPrefillReply();
  }, [tryPrefillReply]);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}/api/check-auth/`, { credentials: 'include', cache: 'no-store' });
        if (!r.ok) { if (!cancelled) { setMe(null); setMeAvatar(null); } return; }
        const j = await r.json();
        const u = (j?.profile?.username ?? j?.user?.username ?? j?.username) as string | undefined;
        const pic = (j?.profile?.profile_picture ?? j?.user?.profile_picture ?? j?.profile_picture) as string | undefined;
        if (!cancelled) {
          setMe(u ?? null);
          setMeAvatar(absUrl(pic || undefined));
        }
      } catch {
        if (!cancelled) { setMe(null); setMeAvatar(null); }
      }
    })();
    return () => { cancelled = true; };
  }, []);


  const maxLines = 5.5;
  const resizeTextarea = useCallback(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const cs = window.getComputedStyle(ta);
    const lh = parseFloat(cs.lineHeight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const brdY = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const minH = lh + padY + brdY;                 // 1 строка
    const maxH = lh * maxLines + padY + brdY;      // 5.5 строки
    const next = Math.min(maxH, Math.max(minH, ta.scrollHeight));
    ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > maxH ? 'auto' : 'hidden';
  }, []);

  const setTextareaValue = useCallback((val: string) => {
    textRef.current = val;
    const el = inputRef.current;
    if (el) {
      el.value = val;
      resizeTextarea();
    }
    setHasText(val.trim().length > 0);   // ← добавили
  }, [resizeTextarea]);


  useLayoutEffect(() => { resizeTextarea(); }, [resizeTextarea]);
  useEffect(() => {
    window.addEventListener('resize', resizeTextarea);
    return () => window.removeEventListener('resize', resizeTextarea);
  }, [resizeTextarea]);


  function PostPreviewBox({ p, onDeleted, onOpenPhoto, onReportPost, onPostLike }: { p: CampPost; onDeleted: (post: CampPost) => void; onOpenPhoto?: () => void; onReportPost?: (post: CampPost) => void; onPostLike?: (postId: number, liked: boolean, likes: number) => void; }) {

    const [busyLike,] = useState(false);
    const [liked, setLiked] = useState(!!p.liked_by_me);
    const [likes, setLikes] = useState(p.likes_count ?? 0);
    const [deleteOpen, setDeleteOpen] = useState(false);

    const [, setPostActionsOpen] = useState(false);

    // внутри PostPreviewBox
    const [pinBusy, setPinBusy] = useState(false);
    const [pinned, setPinned] = useState(!!p.is_pinned);
    useEffect(() => setPinned(!!p.is_pinned), [p.is_pinned]);

    async function togglePin() {
      if (!API) return;
      const optimistic = !pinned;
      try {
        setPinBusy(true);
        setPinned(optimistic); // оптимистично меняем текст кнопки

        await ensureCsrf();
        const url = optimistic
          ? `${API}/api/camps/${campId}/posts/${p.id}/pin/`
          : `${API}/api/camps/${campId}/posts/${p.id}/unpin/`;
        const r = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-CSRFToken': getCsrf() },
        });
        if (!r.ok) throw new Error();

        // отражаем изменение в общем списке постов: один закреплённый максимум
        setPostItems(prev => {
          const list = (prev ?? []).length ? (prev as CampPost[]) : [p];
          return list.map(x => ({ ...x, is_pinned: x.id === p.id ? optimistic : false }));
        });
      } catch {
        setPinned(!optimistic);
        alert('Не удалось изменить закрепление поста');
      } finally {
        setPinBusy(false);
      }
    }


    useEffect(() => {
      setLiked(!!p.liked_by_me);
      setLikes(p.likes_count ?? 0);
    }, [p.liked_by_me, p.likes_count]);

    const likePost = usePostLike(campId);
    const handleLike = () => {
      if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
      likePost(p, (L, C) => {
        setLiked(L);
        setLikes(C);
        onPostLike?.(p.id, L, C);
      });
    };

    async function deletePost() {
      try {
        await ensureCsrf();
        const r = await fetch(`${API}/api/camps/${campId}/posts/${p.id}/delete/`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-CSRFToken': getCsrf() },
        });
        if (!r.ok) throw new Error();
        // ✅ пост удалён на бэке → жесткая перезагрузка страницы
        //window.location.reload();
        onDeleted(p);
      } catch {
        alert('Не удалось удалить пост');
        // } finally {
        //     setDeleteOpen(false);
      }
    }


    return (
      <div id={`post-${p.id}`} className="mb-3 rounded-lg border border-gray-200 p-3 bg-white group/post-head">
        {p.title && <div className="font-semibold">{p.title}</div>}
        {p.image && (
          <PostThumb
            src={p.image}
            onClick={onOpenPhoto}
            className={p.title ? 'mt-2' : ''}
          />
        )}
        {p.content && (
          <PostText
            text={p.content}
            lines={5}
            className={p.image ? 'mt-2' : ''}
            renderText={renderLeadingMentionAsLink}
          />
        )}


        {/* 🆕 такой же низ, как у комментариев */}
        <div className="mt-3 flex items-center gap-3 text-xs text-gray-600 group/post-row">
          <button
            onClick={handleLike}
            className="inline-flex items-center gap-1"
            aria-pressed={liked}
            disabled={busyLike}
            title={liked ? 'Убрать лайк' : 'Поставить лайк'}
          >
            <HeartIcon
              filled={liked}
              className={[
                'text-sm leading-none select-none',
                liked ? 'text-red-500' : (likes > 0 ? 'text-black' : 'text-gray-400')
              ].join(' ')}
            />
          </button>
          {likes > 0 && (
            <button
              type="button"
              className="tabular-nums leading-none hover:underline"
              onClick={() => onOpenLikers({ kind: 'post', campId, id: p.id })}
            >
              {likes}
            </button>
          )}

          <button
            type="button"
            className="hover:underline"
            disabled={!p.root_comment_id}
            title="Ответить на пост"
            onClick={() => {
              if (!p.root_comment_id) return;
              const uname =
                organizerUsername ||
                rootById.get(p.root_comment_id)?.author?.username; // ← фолбэк
              if (!uname) return; // нет имени — не префилим
              focusReply(p.root_comment_id, uname, `post-${p.id}`);
            }}
          >
            Ответить
          </button>

          {isOrganizerResolved && (
            <button
              onClick={togglePin}
              className="hover:underline disabled:opacity-50 disabled:pointer-events-none"
              disabled={pinBusy}
            >
              {pinned ? 'Открепить' : 'Закрепить'}
            </button>
          )}

          {(() => {
            const canReport = !isOrganizerResolved;
            const canDelete = !!p.can_delete || !!isOrganizerResolved;
            if (!canReport && !canDelete) return null;
            return (
              <MoreButton
                scope="post"
                title="Действия"
                onClick={() => setPostActionsOpen(true)}
              />
            );
          })()}


          {!isOrganizerResolved && (
            <button onClick={() => {
              if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
              onReportPost?.(p);
            }} className="hover:underline">Пожаловаться</button>
          )}

          {isOrganizerResolved && (
            <>
              <button onClick={() => setDeleteOpen(true)} className="text-red-600 hover:underline">
                Удалить
              </button>
              <ConfirmModal
                open={deleteOpen}
                onCancel={() => setDeleteOpen(false)}
                onConfirm={deletePost}
                title="Удалить пост?"
                message="Действие нельзя будет отменить. Вы уверены, что хотите удалить пост?"
                confirmLabel="Да, удалить"
              />
            </>
          )}
          <span className="ml-auto text-[12px] leading-none text-gray-500/40 whitespace-nowrap">
            {dateOnly(p.created_at)}
          </span>
        </div>
      </div>
    );
  }




  async function send(raw: string) {
    if (!API || !campId) return;
    if (sending) return;                 // защита от дабл-клика
    if (!authenticated) { setLoginRequiredOpen(true); return; }
    if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }

    const trimmed = raw.trim();
    if (!trimmed) return;

    setSending(true);
    try {
      // если отвечаем — гарантируем mention в начале
      const content =
        replyTarget && !trimmed.startsWith(`@${replyTarget.username}`)
          ? `@${replyTarget.username} ${trimmed}`
          : trimmed;

      const parent_id = replyTarget?.rootId;

      await ensureCsrf();
      const r = await fetch(`${API}/api/camps/${campId}/comments/`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrf() },
        body: JSON.stringify({ content, parent_id }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { comment: CommentItem };

      try {
        console.debug('[CampComments][send] created', {
          campId,
          parent_id,
          commentId: j.comment?.id,
          isReply: !!parent_id,
        });
      } catch { /* noop */ }

      if (parent_id) {
        setItemsCached((prev) => {
          const prevArr: CommentItem[] = prev ?? [];
          return prevArr.map((root: CommentItem) => {
            if (root.id !== parent_id) return root;
            const replies = root.replies || [];
            // защита от дублей в ветке
            if (replies.some((r) => r.id === j.comment.id)) return root;
            return { ...root, replies: [...replies, j.comment] };
          });
        });
      } else {
        setItemsCached((prev) => {
          const prevArr: CommentItem[] = prev ?? [];
          // не добавляем дубликат, если корень уже есть
          if (prevArr.some((c) => c.id === j.comment.id)) return prevArr;
          return [...prevArr, j.comment];
        });
      }

      try {
        emitCampCommentCreated({ campId, comment: j.comment, rootId: parent_id ?? null, isReply: !!parent_id });
      } catch {
        /* noop */
      }

      onCountChange?.(+1);
      setTextareaValue("");
      setReplyTarget(null);
      prefilledOnceRef.current = false;
      pendingReplyRef.current = null;
      onInitialReplyTargetUsed?.();
    } catch {
      alert("Не удалось отправить комментарий");
    } finally {
      setSending(false);
    }
  }




  async function likeComment(id: number) {
    if (!API) return;
    if (!authenticated) { setLoginRequiredOpen(true); return; }
    if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
    try {
      await ensureCsrf();
      const r = await fetch(`${API}/api/comments/${id}/like/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrf() },
      });
      if (!r.ok) throw new Error();
      const j = await r.json() as { liked: boolean; likes_count: number };

      // ✅ обновляем локальный кэш моего лайка
      setCachedLike(me ?? null, id, !!j.liked);

      const upd = (arr: CommentItem[]): CommentItem[] =>
        arr.map(c =>
          c.id === id
            ? { ...c, likes_count: j.likes_count, liked_by_me: j.liked }
            : { ...c, replies: upd(c.replies || []) }
        );

      setItemsCached((prev) => upd(prev ?? []));
    } catch { }
  }



  async function doDeleteComment(id: number) {
    if (!API) return;
    await ensureCsrf();
    const r = await fetch(`${API}/api/comments/${id}/delete/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRFToken': getCsrf() },
    });
    if (!r.ok) throw new Error();
    setItemsCached((prev) => {
      const prevArr: CommentItem[] = prev ?? [];
      const { next, removed } = removeCommentFromTree(prevArr, id);
      if (removed > 0) onCountChange?.(-removed);
      return next;
    });

  }




  async function reportComment(id: number) {
    if (!API) return;
    if (!authenticated) { setLoginRequiredOpen(true); return; }
    if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
    const reason = prompt('Опишите причину жалобы (необязательно):') || '';
    try {
      await ensureCsrf();
      await fetch(`${API}/api/comments/${id}/report/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify({ reason }),
      });
      alert('Жалоба отправлена');
    } catch { }
  }

  // ⬇︎ Item знает корень ветки (threadRootId). Для ответов на ответы используем root как parent_id.
  const Item = React.memo(function Item(
    { c, depth = 0, threadRootId }: { c: CommentItem; depth?: number; threadRootId: number }
  ) {


    const isMine = me && c.author?.username && me === c.author.username;


    // const [delOpen, setDelOpen] = useState(false);


    const isRoot = depth === 0;
    const isPostRoot = isRoot && postPreview && c.id === postPreview.root_comment_id;
    const isStubContent =
      isPostRoot &&
      (!c.content || /^(пост|post)$/i.test(c.content.trim()));




    const handleProfileNav = useProfileReturnNavigation();

    return (
      <motion.li
        id={`comment-${c.id}`}
        className="py-1.5"
        layout
        {...fadeCollapse}
      >
        <div className="flex items-start gap-3 mt-3 group/comment-head">
          <Link
            href={`/${c.author.username}`}
            className="flex-shrink-0 self-start inline-block"
            onClick={(event) => handleProfileNav(event, c.author.username, `#comment-${c.id}`)}
          >
            <img
              src={c.author.avatar || AVATAR_PLACEHOLDER_PATH}
              alt=""
              className="w-8 h-8 rounded-full object-cover border border-gray-200"
            />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="group/comment-head"></div>
            <div className="text-sm">
              <Link
                href={`/${c.author.username}`}
                className="font-semibold hover:underline"
                onClick={(event) => handleProfileNav(event, c.author.username, `#comment-${c.id}`)}
              >
                {c.author.username}
              </Link>
              {/* Если вместо контента показывается превью поста (у корня нет своей «нижней строки»),
      оставляем дату рядом с юзернеймом, чтобы не потерять её вовсе */}
              {isStubContent && postPreview ? (
                <span className="text-gray-400 ml-2">{dateOnly(c.created_at)}</span>
              ) : null}
            </div>

            {isStubContent && postPreview ? (
              <div className="mt-1">
                <PostPreviewBox
                  p={postPreview}
                  onDeleted={handlePostDeleted}
                  onOpenPhoto={
                    postPreview.image
                      ? () => {
                        const idx = postImages.indexOf(postPreview.image!);
                        onOpenImageGallery(postImages, Math.max(0, idx));
                      }
                      : undefined
                  }
                  onReportPost={onReportPost}
                  onPostLike={updateFeedPostLike}
                />
              </div>
            ) : (
              <>
                <CollapsibleText
                  text={c.content || ''}
                  className="mt-2.5 text-[14px]"
                  lines={4}
                  autoCollapseWhenOut
                  renderText={renderLeadingMentionAsLink}
                />

                <div
                  className="mt-2 flex items-center gap-3 text-xs text-gray-600"
                  data-comment-actions
                >
                  {/* сердце для лайков */}
                  <button
                    onClick={() => likeComment(c.id)}
                    className="inline-flex items-center gap-1"
                    title={c.liked_by_me ? 'Убрать лайк' : 'Поставить лайк'}
                    aria-pressed={!!c.liked_by_me}
                  >
                    <HeartIcon
                      filled={!!c.liked_by_me}
                      className={[
                        'text-sm leading-none select-none',
                        c.liked_by_me
                          ? 'text-red-500'
                          : (c.likes_count > 0 ? 'text-black' : 'text-gray-400')
                      ].join(' ')}
                    />
                  </button>
                  {c.likes_count > 0 && (
                    <button
                      type="button"
                      className="tabular-nums leading-none hover:underline"
                      onClick={() => onOpenLikers({ kind: 'comment', id: c.id })}
                      title="Кто лайкнул"
                    >
                      {c.likes_count}
                    </button>
                  )}

                  {!c.is_deleted && (
                    <button
                      onClick={() => {
                        if (!authenticated) { setLoginRequiredOpen(true); return; }
                        focusReply(threadRootId, c.author?.username || "", `comment-${c.id}`);
                      }}
                      className="hover:underline"
                      disabled={c.is_deleted}
                    >
                      Ответить
                    </button>
                  )}
                  {(() => {
                    const canReport = !c.is_deleted && !isMine;
                    const canDelete = !!c.can_delete;
                    if (!canReport && !canDelete) return null;
                    return (
                      <MoreButton
                        scope="comment"
                        onClick={() => openActions({
                          onReport: canReport
                            ? () => {
                              if (!authenticated) { setLoginRequiredOpen(true); return; }
                              onOpenReportComment?.({
                                id: c.id,
                                isReply: depth > 0,
                                author: c.author?.username,
                                text: c.content,
                              });
                            }
                            : undefined,
                          onDelete: canDelete ? () => doDeleteComment(c.id) : undefined,
                        })}
                      />
                    );
                  })()}


                  {!isStubContent && (
                    <span className="ml-auto text-[12px] leading-none text-gray-500/40 whitespace-nowrap">
                      {dateOnly(c.created_at)}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        {depth === 0 && (
          // держим replies ВНЕ group/comment-head, но визуально в правой колонке
          <div className="ml-11">
            <CampReplies
              root={c}
              me={me ?? null}
              onReply={(uname) => { if (!authenticated) { setLoginRequiredOpen(true); return; } focusReply(threadRootId, uname, `comment-${c.id}`); }}
              onLike={(id) => { 
                if (!authenticated) { setLoginRequiredOpen(true); return; }
                if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
                likeComment(id); 
              }}
              onReport={(id) => { 
                if (!authenticated) { setLoginRequiredOpen(true); return; }
                if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
                reportComment(id); 
              }}
              onDelete={doDeleteComment}
              openActions={openActions}
              onOpenLikers={onOpenLikers}
              onOpenReportComment={onOpenReportComment}
            />
          </div>
        )}

      </motion.li>
    );
  }, (prev, next) => (
    prev.threadRootId === next.threadRootId &&
    prev.depth === next.depth &&
    prev.c === next.c // объект неизменен — не рендерим заново
  ));

  useEffect(() => {
    // цель: post-{id} при клике из «Постов», иначе comment-{rootId}
    const targetId =
      postPreview ? `post-${postPreview.id}` :
        scrollToRootId ? `comment-${scrollToRootId}` :
          null;
    if (!targetId) return;

    let tries = 0;
    let raf = 0;

    const tryScroll = () => {
      const el = document.getElementById(targetId);
      if (el) {
        // 1) грубо подтягиваем блок в видимую область
        el.scrollIntoView({ block: 'nearest' });
        // 2) на следующий кадр — точное выравнивание под ваше поле ввода
        requestAnimationFrame(() => alignAboveInputById(targetId));
      } else if (tries < 240) { // ~4 сек @ 60fps — ждём пока дорендерятся списки
        tries += 1;
        raf = requestAnimationFrame(tryScroll);
      }
    };

    raf = requestAnimationFrame(tryScroll);
    return () => cancelAnimationFrame(raf);

  }, [postPreview?.id, scrollToRootId, (items?.length ?? 0), (postItems?.length ?? 0), alignAboveInputById]);



  // useEffect(() => {
  //   const targetId = postPreview ? `post-${postPreview.id}` :
  //     scrollToRootId ? `comment-${scrollToRootId}` : null;
  //   if (!targetId) return;
  //   scrollWhenReady(targetId, (el) => el.scrollIntoView({ block: 'end' }));
  // }, [postPreview?.id, scrollToRootId, (items?.length ?? 0), (postItems?.length ?? 0)]);


  const postImages = React.useMemo(
    () => (postItems || []).map(p => p.image).filter((u): u is string => !!u),
    [postItems]
  );



  return (

    <div>
      <CommentActionSheet
        open={actionSheet.open}
        canReport={!!actionSheet.onReport}
        canDelete={!!actionSheet.onDelete}
        onReport={actionSheet.onReport}
        onDelete={actionSheet.onDelete}
        onClose={() => setActionSheet({ open: false })}
      />
      <TabViewport
        loading={initialLoading}
        status={statusNode}
        resetSignal={viewportResetSignal}
        headerRef={headerRef}
        stuck={!!stuck}
        currentTab="comments"
        fixedHeightMode={true}
        fixedViewportHeight={fixedViewportHeight}
      >
        {!!feed.length && (
          <ul
            className="divide-y divide-gray-100"
            style={{ paddingBottom: 'var(--bottom-gap, 64px)' }}
          >
            <AnimatePresence initial={false}>
              {feed.map(it =>
                it.kind === 'post'
                  ? (
                    <CampPostCard
                      key={'p' + it.p.id}
                      rowId={`post-${it.p.id}`}
                      p={it.p}
                      campId={campId}
                      organizerAvatar={organizerAvatar}
                      organizerUsername={organizerUsername || null}
                      isOrganizer={isOrganizerResolved}
                      controlsVariant="comment"
                      onReportPost={onReportPost}
                      onPostLike={updateFeedPostLike}
                      below={
                        it.p.root_comment_id
                          ? (() => {
                            const root = rootById.get(it.p.root_comment_id!);
                            return root ? (
                              <CampReplies
                                root={root}
                                me={me ?? null}
                                onReply={(uname) => focusReply(root.id, uname, `post-${it.p.id}`)}
                                onLike={(id) => { 
                                  if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
                                  likeComment(id); 
                                }}
                                onReport={(id) => { 
                                  if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
                                  reportComment(id); 
                                }}
                                onDelete={doDeleteComment}
                                openActions={openActions}
                                onOpenLikers={onOpenLikers}
                                onOpenReportComment={onOpenReportComment}
                              />
                            ) : null;
                          })()
                          : null
                      }

                      onOpenComments={(rootId, post, wantReply) => {
                        if (!rootId) return;
                        if (wantReply) {
                          if (organizerUsername) {
                            // было: `post-${p.id}`
                            focusReply(rootId, organizerUsername, `post-${post?.id}`);
                          }
                        } else {
                          alignAboveInputById(`post-${post?.id}`);
                        }
                      }}
                      onDeleted={handlePostDeleted}
                      onOpenPhoto={
                        it.p.image
                          ? () => {
                            const idx = postImages.indexOf(it.p.image!);
                            onOpenImageGallery(postImages, Math.max(0, idx));
                          }
                          : undefined
                      }
                      onPinnedChange={(postId, pinned) => {
                        setPostItems((prev) => {
                          const next = (prev ?? []).map(x => ({ ...x, is_pinned: x.id === postId ? pinned : false }));
                          const pin = next.find(x => x.is_pinned);
                          return pin
                            ? [pin, ...next.filter(x => x.id !== pin.id)]
                            : next.sort(sortPostsByCreatedDesc);
                        });
                      }}
                      onOpenLikers={onOpenLikers}
                    />

                  ) : (
                    <Item key={'c' + it.c.id} c={it.c} depth={0} threadRootId={it.c.id} />
                  )
              )}
            </AnimatePresence>
            <li ref={sentinelRef} id="comments-sentinel" className="h-2"></li>
            {/* плавающий индикатор подгрузки внутри вкладки (не тянет шапку) */}
            {pagingBusy && (
              <div className="sticky bottom-2 -mb-2 w-full flex justify-end pr-3 pointer-events-none">
                <div className="pointer-events-auto rounded-full px-2.5 py-1 text-xs bg-black/70 text-white">
                  Загружаем ещё…
                </div>
              </div>
            )}

          </ul>
        )}
      </TabViewport>



      {/* ⬇️ единая форма внизу — показываем только авторизованным */}
      {authenticated && (
      <div
        ref={inputWrapRef}
        className="sticky bottom-0 left-0 right-0 z-10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75 border-t"
      >
        {/* индикатор ответа */}
        {replyTarget && (
          <div className="px-3 pt-2 text-xs text-gray-500">
            Ответ @{replyTarget.username}{' '}
            <button
              onClick={() => {
                // оставляю вашу текущую логику очистки/снятия префилла
                const u = replyTarget.username;
                const headRe = new RegExp(`^\\s*@+${escRe(u)}\\b\\s*`, 'i');
                const anyRe = new RegExp(`(^|\\s)@+${escRe(u)}\\b\\s*`, 'i');
                setReplyTarget(null);
                if (inputRef.current) {
                  const v = inputRef.current.value;
                  const nv = v.replace(headRe, '').replace(anyRe, '$1');
                  inputRef.current.value = nv;
                  textRef.current = nv;
                  setHasText(nv.trim().length > 0);
                  requestAnimationFrame(() => inputRef.current?.focus());
                }
                onInitialReplyTargetUsed?.();
              }}
              className="text-blue-600 hover:underline"
            >
              Отмена
            </button>
          </div>
        )}

        {/* сам инпут (прежняя форма) */}
        <div className="p-3">
          <div className="flex items-end gap-3">
            <a
              href={me ? `/${me}` : '#'}
              className="flex-shrink-0 transform -translate-y-[5px]"
            >
              <img
                src={meAvatar || ((process.env.NEXT_PUBLIC_BASE_PATH || '') + '/avatars/question3.jpg')}
                alt=""
                className="w-9 h-9 rounded-full object-cover border border-gray-200"
              />
            </a>

            <div className="flex-1">
              <div className="relative">
                <textarea
                  ref={inputRef}
                  defaultValue={textRef.current}
                  onInput={(e) => {
                    const v = e.currentTarget.value;   // ← объявили v
                    textRef.current = v;
                    resizeTextarea();
                    setHasText(v.trim().length > 0);   // ← используем v
                  }}
                  rows={1}
                  placeholder={
                    replyTarget ? `Ответ @${replyTarget.username}…` : 'Оставьте комментарий…'
                  }
                  className="
              w-full resize-none rounded-2xl border border-gray-200 bg-white
              px-3 py-2 pr-12 text-[15px] leading-5
              shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]
              placeholder:text-gray-400
              focus:outline-none focus:ring-2 focus:ring-blue-500/40
            "
                  style={{ height: 'auto' }}
                />

                {/* кнопка-стрелка — маленькая круглая, как раньше */}
                <button
                  type="button"
                  onClick={() => send(textRef.current)}
                  disabled={!hasText || sending}
                  aria-label="Отправить"
                  className="
              absolute right-3 bottom-[10px]
              inline-flex items-center justify-center
              w-7 h-7 rounded-full text-white transition
              bg-[var(--brand,#2563eb)] hover:bg-[var(--brand-hover,#1d4ed8)]
              disabled:opacity-50 disabled:cursor-not-allowed
            "
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
                    <path
                      d="M12 5v14M12 5l-5 5M12 5l5 5"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      <CompleteProfileActionModal
        open={completeProfileModalOpen}
        onClose={() => setCompleteProfileModalOpen(false)}
      />
      <ConfirmModal
        open={loginRequiredOpen}
        onCancel={() => setLoginRequiredOpen(false)}
        onConfirm={onLogin}
        title="Это действие доступно только авторизованным пользователям"
        cancelLabel="Отмена"
        confirmLabel="Войти"
      />




    </div>
  );
}

/* =========================
   ГЛАВНЫЙ КОМПОНЕНТ ЛЕНТЫ
========================= */
type CampFeedTabsProps = {
  camp: Camp;
  activeTab?: CampFeedTab;
  defaultTab?: CampFeedTab;
  onTabChange?: (tab: CampFeedTab) => void;
  postsReloadKey?: number;
  subscribersReloadKey?: number;
  onCommentsCountChange?: (delta: number) => void;
  viewer?: FeedViewer;
  onCreatePost?: (opts?: { prefillCampTag?: number }) => void;
  stickyTopPx?: number;
  // 🆕 Режим фиксированной высоты для предотвращения пересчета высоты страницы
  fixedHeightMode?: boolean;
  onViewportHeightChange?: (height: number | null) => void;
};

export default function CampFeedTabs({
  camp,
  activeTab: controlledTab,
  defaultTab = 'comments',
  onTabChange,
  postsReloadKey,
  subscribersReloadKey,
  onCommentsCountChange,
  viewer,
  onCreatePost,
  stickyTopPx,
  onViewportHeightChange,
}: CampFeedTabsProps) {

  const headerRef = React.useRef<HTMLElement | null>(null);
  const fixedViewportHeight =
    (useFixedViewportHeight(headerRef, stickyTopPx) ?? undefined) as number | undefined;

  const campIdNum = asNumber((camp as UnknownRecord)['id']) ?? asNumber((camp as UnknownRecord)['camp_id']) ?? 0;
  const tabStorageKey = React.useMemo(() => (campIdNum ? `camp:${campIdNum}:tab` : null), [campIdNum]);

  const v = viewer ?? {};
  const isOrgView = !!(v.isOwner || v.isOrganizer);
  const isMobile = useIsMobile();

  const [reportCampPostId, setReportCampPostId] = useState<number | null>(null);

  function openReportCampPost(post: CampPost) {
    setReportCampPostId(post.id);
  }

  // пример: когда тянем посты — добавим флаг для бэка
  const query = new URLSearchParams();
  if (isOrgView) query.set('organizer', '1');


  const [campPostOpen, setCampPostOpen] = useState(false);
  const [profilePostOpen, setProfilePostOpen] = useState(false);

  const [reportCampComment, setReportCampComment] = useState<CampCommentReport | null>(null);



  // удобные хэндлеры
  const openAddCampPost = useCallback(() => setCampPostOpen(true), []);
  const openMarkCampPost = useCallback(() => setProfilePostOpen(true), []);

  // достанем нормализованный заголовок/даты для префилла проф. модалки
  const campTitle =
    pickString(camp as UnknownRecord, ['title', 'name', 'camp_title']) ||
    `Кэмп #${campIdNum}`;
  const campStart =
    pickDateString(camp as UnknownRecord, ['start_date', 'startDate', 'starts_at']) || undefined;
  const campEnd =
    pickDateString(camp as UnknownRecord, ['end_date', 'endDate', 'ends_at']) || undefined;
  const prefillCamp = { id: campIdNum, title: campTitle, start_date: campStart, end_date: campEnd };


  const [postPreview, setPostPreview] = useState<CampPost | null>(null);
  const [scrollToRootId, setScrollToRootId] = useState<number | undefined>(undefined);
  const [initialReplyTarget, setInitialReplyTarget] = useState<null | { rootId: number; username: string }>(null);


  // данные организатора (как раньше, если нужно дотягивать — можно расширить)
  const organizerObj = (camp as UnknownRecord)['organizer'] as UnknownRecord | undefined;
  const organizerAvatarRaw =
    pickString(camp as UnknownRecord, ['organizerProfilePicture', 'organizer_avatar', 'organizer_profile_picture', 'organizer_photo_url']) ||
    (organizerObj ? pickString(organizerObj, ['profile_picture', 'profilePicture', 'avatar', 'photo_url']) : null);
  const organizerAvatar = absUrl(organizerAvatarRaw) || AVATAR_PLACEHOLDER_PATH;
  const organizerUsername =
    pickString(camp as UnknownRecord, ['organizerUsername']) ||
    (organizerObj ? pickString(organizerObj, ['username']) : null) || undefined;


  // табы
  const [internalTab, setInternalTab] = useState<Tab>(defaultTab);
  const isControlled = controlledTab !== undefined;
  const tab = isControlled ? controlledTab! : internalTab;

  useEffect(() => {
    if (typeof window === 'undefined' || !tabStorageKey || isControlled) return;
    try {
      const stored = sessionStorage.getItem(tabStorageKey) as Tab | null;
      const validTabs: readonly string[] = [...FEED_TAB_VALUES, 'feed'];
      if (stored && validTabs.includes(stored) && stored !== internalTab) {
        setInternalTab(stored as Tab);
      }
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined' || !tabStorageKey) return;
    try { sessionStorage.setItem(tabStorageKey, tab); } catch { /* noop */ }
  }, [tab, tabStorageKey]);

  const feedAnchorRef = React.useRef<HTMLDivElement | null>(null);

  const [headerEl, setHeaderEl] = React.useState<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = React.useState(0);
  const [isFeedStuck, setIsFeedStuck] = React.useState(false);


  const [anchorPad, setAnchorPad] = useState<AnchorPadState>(null);
  const withFeedAnchor = useTabSwitchAnchor(feedAnchorRef, setAnchorPad, stickyTopPx);



  const ioBottomMarginPx = Math.max(2000, anchorPad?.filler ?? 0);

  React.useEffect(() => {
    return () => {
      onViewportHeightChange?.(null);
    };
  }, [onViewportHeightChange]);

  React.useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const el = headerEl;
    if (!el) return;

    const update = () => setHeaderHeight(el.offsetHeight || 0);
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [headerEl]);

  React.useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const el = headerEl;
    if (!el) return;

    let raf: number | null = null;

    const readTop = () => {
      if (typeof stickyTopPx === 'number') return stickyTopPx;
      const cssTop = parseFloat(getComputedStyle(el).top || '0') || 0;
      return cssTop;
    };

    const compute = () => {
      raf = null;
      const top = el.getBoundingClientRect().top;
      const threshold = readTop() + 0.5;
      const newStuck = top <= threshold;

      // Добавляем гистерезис для предотвращения частых переключений
      if (newStuck !== isFeedStuck) {
        // Небольшая задержка для стабилизации
        setTimeout(() => {
          const currentTop = el.getBoundingClientRect().top;
          const currentThreshold = readTop() + 0.5;
          setIsFeedStuck(currentTop <= currentThreshold);
        }, 10);
      }
    };

    const schedule = () => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };

    compute();

    const scroller = findScrollParent(el);
    const scrollTarget: HTMLElement | Window = scroller ?? window;
    scrollTarget.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(el);

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      scrollTarget.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      ro.disconnect();
    };
  }, [headerEl, stickyTopPx]);

  React.useEffect(() => {
    const viewport = typeof fixedViewportHeight === 'number'
      ? Math.max(0, Math.round(fixedViewportHeight))
      : null;
    const headerH = Math.max(0, Math.round(headerHeight));
    const total = viewport != null ? viewport + headerH : null;

    onViewportHeightChange?.(total);

    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    const viewportValue = viewport != null ? `${viewport}px` : null;
    const totalValue = total != null ? `${total}px` : null;

    if (viewportValue) root.style.setProperty('--camp-feed-viewport-h', viewportValue);
    else root.style.removeProperty('--camp-feed-viewport-h');

    if (totalValue) root.style.setProperty('--camp-feed-total-h', totalValue);
    else root.style.removeProperty('--camp-feed-total-h');

    return () => {
      if (viewportValue) root.style.removeProperty('--camp-feed-viewport-h');
      if (totalValue) root.style.removeProperty('--camp-feed-total-h');
    };
  }, [fixedViewportHeight, headerHeight, onViewportHeightChange]);


  useLayoutEffect(() => {
    if (!anchorPad) return;
    const anchor = feedAnchorRef.current;
    if (!anchor) return;
    const scroller = findScrollParent(anchor);
    const scrollEl = scroller ?? document.documentElement;
    const viewportEl: HTMLElement | Window = scroller ?? window;

    const measure = () => {
      const viewportH = scroller ? scroller.clientHeight : window.innerHeight;
      if (viewportH <= 0) return;
      const maxScroll = Math.max(0, scrollEl.scrollHeight - viewportH);
      const needed = Math.max(0, Math.ceil(anchorPad.target - maxScroll));
      setAnchorPad((prev) => {
        if (!prev) return prev;
        if (Math.abs((prev.filler ?? 0) - needed) < 1) return prev;
        if (needed <= 0) return null;
        return { target: prev.target, filler: needed };
      });
    };

    measure();

    const resizeObserver = new ResizeObserver(() => measure());
    if (scrollEl instanceof HTMLElement) resizeObserver.observe(scrollEl);
    else resizeObserver.observe(document.body);

    if (viewportEl !== window) {
      (viewportEl as HTMLElement).addEventListener('scroll', measure, { passive: true });
    }
    window.addEventListener('resize', measure);

    return () => {
      resizeObserver.disconnect();
      if (viewportEl !== window) {
        (viewportEl as HTMLElement).removeEventListener('scroll', measure);
      }
      window.removeEventListener('resize', measure);
    };
  }, [anchorPad]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!campIdNum) return;
    const apiBase = API;
    if (!apiBase) return;

    const controller = new AbortController();
    const { signal } = controller;

    const ensurePrefetch = <T,>(key: string, loader: () => Promise<T>, force = false) => {
      try {
        if (!force) {
          const cached = sessionStorage.getItem(key);
          if (cached) {
            loader()
              .then((data) => {
                try { sessionStorage.setItem(key, JSON.stringify(data)); }
                catch { /* ignore */ }
              })
              .catch(() => { /* silent */ });
            return;
          }
        }
      } catch { /* ignore quota errors */ }

      loader()
        .then((data) => {
          try { sessionStorage.setItem(key, JSON.stringify(data)); }
          catch { /* ignore */ }
        })
        .catch(() => { /* silent */ });
    };

    const postsKey = `camp:${campIdNum}:posts`;
    const marksKey = `camp:${campIdNum}:marks`;
    const subsKey = `camp:${campIdNum}:subscribers`;

    ensurePrefetch(postsKey, () => fetchCampPostsList(apiBase, campIdNum, signal), true);
    ensurePrefetch(marksKey, () => fetchCampMarksList(apiBase, campIdNum, signal), true);
    ensurePrefetch(subsKey, () => fetchCampSubscribersList(apiBase, campIdNum, signal), true);

    return () => controller.abort();
  }, [campIdNum, postsReloadKey, subscribersReloadKey]);

  const applyTab = useCallback((next: Tab) => {
    if (!isControlled) setInternalTab(next);
    onTabChange?.(next);
  }, [isControlled, onTabChange]);

  const switchTab = useCallback((next: Tab, anchor = false) => {
    if (anchor) withFeedAnchor(() => applyTab(next), { alignToTop: true });
    else applyTab(next);
  }, [applyTab, withFeedAnchor]);

  useEffect(() => {
    // поддержка legacy алиаса в урле ?tab=info → feed (опционально можно прочитать из searchParams)
    const url = new URL(window.location.href);
    const qTab = url.searchParams.get('tab');
    if (qTab) {
      const v = (LEGACY_TAB_ALIASES[qTab] || qTab) as string;
      if ((TABS as readonly string[]).includes(v)) switchTab(v as Tab);
    }
  }, [switchTab]);


  const handleOpenComments = useCallback(
    (rootCommentId?: number, post?: CampPost, wantReply?: boolean) => {
      if (!rootCommentId) return;

      setPostPreview(post ?? null);
      setScrollToRootId(rootCommentId);

      // ✅ ключевая строка — переключаем видимую вкладку
      switchTab('comments', true); // true — с сохранением якоря, чтобы не прыгал скролл

      // при желании — оставить твой центрирующий скролл:
      scrollWhenReady(`comment-${rootCommentId}`, (el) => {
        const root = findScrollParent(el) || (document.scrollingElement as HTMLElement) || document.documentElement;
        const vpH = (findScrollParent(el)?.clientHeight) || window.innerHeight;
        const r = el.getBoundingClientRect();
        const current = root.scrollTop;
        const targetTop = current + r.top + r.height / 2 - vpH / 2;
        root.scrollTop = targetTop;
      });

      if (wantReply) {
        const uname = (organizerUsername || '').replace(/^@+/, '');
        if (uname) setInitialReplyTarget({ rootId: rootCommentId, username: uname });
      }
    },
    [switchTab, organizerUsername]
  );


  // лайкнувшие
  const [likersSrc, setLikersSrc] = useState<LikeSource | null>(null);
  const { pushScreen, popScreen } = useLayerStack();
  const likersScreenRef = useRef<string | null>(null);

  const openLikers = React.useCallback((src: LikeSource) => setLikersSrc(src), []);

  useEffect(() => {
    if (!likersSrc) {
      if (likersScreenRef.current) {
        popScreen(likersScreenRef.current);
        likersScreenRef.current = null;
      }
      return;
    }
    const id = pushScreen({
      node: <LikesModal source={likersSrc as LikeSource} />,
      backdrop: 'dim',
      className: 'bg-transparent',
      ariaLabel: 'Список оценивших',
      dismissible: true,
      blockScroll: true,
      onClose: () => setLikersSrc(null),
    });
    likersScreenRef.current = id;
  }, [likersSrc, pushScreen, popScreen]);

  // лайтбокс
  const [lightbox, setLightbox] = useState<{ open: boolean; images: string[]; index: number }>({
    open: false, images: [], index: 0,
  });
  const openImageGallery = React.useCallback((images: string[], startIndex = 0) => {
    const arr = images.filter(Boolean);
    const idx = Math.min(Math.max(0, startIndex), Math.max(0, arr.length - 1));
    if (!arr.length) return;
    setLightbox({ open: true, images: arr, index: idx });
  }, []);
  const closeImageGallery = React.useCallback(() => setLightbox(v => ({ ...v, open: false })), []);


  // служебные хелперы для вкладки Posts/Feed
  const handleCommentsDelta = useCallback((delta: number) => {
    onCommentsCountChange?.(delta);
  }, [onCommentsCountChange]);

  const isOrganizer = !!pickBool((camp as UnknownRecord), ['is_organizer', 'am_i_organizer', 'i_am_organizer']);



  // helper: объединяем feedAnchorRef + headerRef от родителя
  const setHeaderElRef = React.useCallback((el: HTMLDivElement | null) => {
    feedAnchorRef.current = el;
    setHeaderEl(el);

    if (headerRef && 'current' in headerRef) {
      (headerRef as React.MutableRefObject<HTMLElement | null>).current = el;
    }
  }, [headerRef]);

  React.useEffect(() => {
    const el = document.getElementById('camp-feed-header');
    console.info('[camp] Tabs header mount', {
      found: !!el,
      stickyTopPx,
      pos: el ? getComputedStyle(el).position : 'n/a',
      cssTop: el ? getComputedStyle(el).top : 'n/a',
    });
  }, [stickyTopPx]);

  // наверх
  const scrollToTop = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    const scroller = headerEl ? findScrollParent(headerEl) : null;
    const prefersReduced =
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    const behavior: ScrollBehavior = prefersReduced ? 'auto' : 'smooth';

    if (scroller && scroller instanceof HTMLElement) {
      scroller.scrollTo({ top: 0, behavior });
    } else {
      window.scrollTo({ top: 0, behavior });
    }
  }, [headerEl]);


  return (
    <div>
      <div
        id="camp-feed-header"
        ref={setHeaderElRef}
        className="sticky z-[900] bg-white supports-[backdrop-filter]:bg-white/80 backdrop-blur border-b border-gray-100 mt-3"
        style={{ top: `var(--camp-topbar-h, ${stickyTopPx ?? 0}px)` }}
      >
        <div className="border-b border-gray-200">
          <div className="flex items-end justify-between mt-3">
            <nav id="camp-feed-nav" className="-mb-px flex gap-6 text-sm">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => switchTab(t, true)}
                  className={[
                    'pb-2',
                    tab === t
                      ? 'border-b-2 border-black font-medium'
                      : 'text-gray-400 hover:text-gray-700',
                  ].join(' ')}
                >
                  {t === 'comments'
                    ? 'Комментарии'
                    : t === 'posts'
                      ? 'Посты'
                      : t === 'marks'
                        ? 'Отметки'
                        : 'Подписчики'}
                </button>
              ))}
            </nav>
            <button
              type="button"
              onClick={scrollToTop}
              className="pb-2 ml-4 text-xs text-gray-400 hover:text-gray-600 hover:underline"
              aria-label="Прокрутить к началу страницы"
              title="Прокрутить к началу страницы"
            >
              наверх
            </button>
          </div>
        </div>
      </div>

      <div className="py-0 text-sm">
        <style jsx global>{`
          .collapsible-anchor-fix,
          .replies-anchor-fix {
            overflow-anchor: none;
            contain: layout paint;
            backface-visibility: hidden;
            isolation: isolate;
          }
        `}</style>
        <div className="min-h-0">
          {tab === 'posts' && (
            <CampPostsTab
              campId={campIdNum}
              organizerAvatar={organizerAvatar}
              organizerUsername={organizerUsername || null}
              isOrganizer={isOrganizer}
              reloadKey={postsReloadKey}
              onOpenComments={handleOpenComments}
              onOpenImageGallery={openImageGallery}
              onOpenLikers={openLikers}
              onCreatePost={
                onCreatePost
                  ? () => onCreatePost({ prefillCampTag: campIdNum })
                  : openAddCampPost
              }
              onReportPost={openReportCampPost}
              viewportResetSignal={tab}
              headerRef={headerRef}
              stuck={isFeedStuck}
              fixedViewportHeight={fixedViewportHeight}
            />
          )}

          {tab === 'comments' && (
            <Comments
              campId={campIdNum}
              organizerAvatar={organizerAvatar}
              organizerUsername={organizerUsername || null}
              isOrganizer={isOrganizer}
              onOpenImageGallery={openImageGallery}
              onOpenLikers={openLikers}
              onCountChange={handleCommentsDelta}
              postPreview={postPreview}
              scrollToRootId={scrollToRootId}
              initialReplyTarget={initialReplyTarget}
              onInitialReplyTargetUsed={() => setInitialReplyTarget(null)}
              ioBottomMarginPx={ioBottomMarginPx}
              viewportResetSignal={tab}
              headerRef={headerRef}
              stuck={isFeedStuck}
              fixedViewportHeight={fixedViewportHeight}
              onReportPost={openReportCampPost}
              onOpenReportComment={(payload) => setReportCampComment(payload)}
            />
          )}


          {tab === 'marks' && (
            <CampMarksTab
              campId={campIdNum}
              isOrganizer={!!viewer?.isOrganizer}
              onCreatePost={
                onCreatePost
                  ? () => onCreatePost({ prefillCampTag: campIdNum })
                  : openMarkCampPost
              }
              viewportResetSignal={tab}
              headerRef={headerRef}
              stuck={isFeedStuck}
              fixedViewportHeight={fixedViewportHeight}
            />
          )}

          {tab === 'subscribers' && (
            <CampSubscribersTab campId={campIdNum} reloadKey={subscribersReloadKey} viewportResetSignal={tab} headerRef={headerRef} stuck={isFeedStuck} fixedViewportHeight={fixedViewportHeight} />
          )}
        </div>
      </div>

      {anchorPad?.filler ? (
        <div aria-hidden style={{ height: anchorPad.filler }} />
      ) : null}

      {/* модалки */}
      <ImageLightbox
        open={lightbox.open}
        images={lightbox.images}
        index={lightbox.index}
        onClose={closeImageGallery}
        onIndexChange={(i) => setLightbox(v => ({ ...v, index: i }))}
      />
      {isMobile ? (
        <CreateCampPostMobile
          open={campPostOpen}
          onClose={() => setCampPostOpen(false)}
          campId={campIdNum}
          onCreated={() => {
            setCampPostOpen(false);
            // (при желании) переключиться на вкладку «Посты»:
            // switchTab('posts', true);
          }}
        />
      ) : (
        <CreateCampPostModalDesktop
          open={campPostOpen}
          onClose={() => setCampPostOpen(false)}
          campId={campIdNum}
          onCreated={() => {
            setCampPostOpen(false);
            // (при желании) переключиться на вкладку «Посты»:
            // switchTab('posts', true);
          }}
        />
      )}
      <CreatePostModal
        open={profilePostOpen}
        onClose={() => setProfilePostOpen(false)}
        mode="create"
        prefillCamp={prefillCamp}
        onSaved={() => setProfilePostOpen(false)}
      />
      {reportCampPostId !== null && (
        <ReportAbuseModal
          open={reportCampPostId !== null}
          onClose={() => setReportCampPostId(null)}
          kind="camp_post"
          targetId={reportCampPostId}
          // якорь на карточку поста в текущем урле:
          linkHint={`${location.href.split('#')[0]}#post-${reportCampPostId}`}
        />
      )}
      {reportCampComment && (
        <ReportAbuseModal
          open={!!reportCampComment}
          onClose={() => setReportCampComment(null)}
          kind="camp_comment"
          targetId={reportCampComment.id}
          linkHint={`${location.href.split('#')[0]}#comment-${reportCampComment.id}`}
          isReply={!!reportCampComment.isReply}
          commentAuthor={reportCampComment.author}
          commentText={reportCampComment.text}
        />
      )}
    </div>
  );
}
