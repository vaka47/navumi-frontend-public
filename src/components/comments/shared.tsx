'use client';

import React, {
  ReactNode, useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect
} from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import SmartImage from '@/components/SmartImage';
import HeartIcon from '@/components/ui/HeartIcon';
import { absUrl } from '@/components/camp/campNormalize';
import { getBrowserApiBase } from '@/lib/apiBase';

const API_BASE = getBrowserApiBase();
const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '');
const FALLBACK_AVATAR = `${BASE_PATH}/avatars/question3.jpg`;

const PLACEHOLDER_RE = /^(?:\/[A-Za-z0-9._-]+)?\/avatars\/question(\d+)?\.jpg$/i;
const MEDIA_PREFIX_RE = /^\/?(media|uploads|profile_pictures|avatars)\//i;

const ensureLeadingSlash = (path: string) => (path.startsWith('/') ? path : `/${path}`);
const prependApiHost = (path: string) => {
  if (!API_BASE) return ensureLeadingSlash(path);
  const normalizedPath = ensureLeadingSlash(path);
  return `${API_BASE}${normalizedPath}`;
};

export const normalizeCommentAvatarSrc = (raw?: string | null): string => {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();
  const isAbsolute = /^(https?:)?\/\//i.test(trimmed) || lower.startsWith('data:') || lower.startsWith('blob:') || lower.startsWith('gs://');
  if (isAbsolute) {
    const normalized = absUrl(trimmed) || trimmed;
    try {
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.debug('[Avatar] normalizeCommentAvatarSrc:absolute', { raw, normalized });
      }
    } catch { /* noop */ }
    return normalized;
  }

  const normalizedPath = ensureLeadingSlash(trimmed);
  const isPlaceholder = PLACEHOLDER_RE.test(normalizedPath);
  const needsApiHost = MEDIA_PREFIX_RE.test(trimmed) && !isPlaceholder;

  if (isPlaceholder) {
    const alreadyWithBase = BASE_PATH && normalizedPath.startsWith(`${BASE_PATH}/`);
    return alreadyWithBase ? normalizedPath : `${BASE_PATH}${normalizedPath}`;
  }

  const candidate = needsApiHost ? prependApiHost(normalizedPath) : normalizedPath;
  const out = absUrl(candidate) || candidate;
  try {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.debug('[Avatar] normalizeCommentAvatarSrc:relative', { raw, candidate, out });
    }
  } catch { /* noop */ }
  return out;
};





/** ===== Типы ===== */
export type CommentItem = {
  id: number;
  author: string;
  author_avatar_url?: string | null;
  text: string;
  created_at: string;
  likes_count: number;
  liked_by_me?: boolean;
  parent_id: number | null;
  is_deleted?: boolean;
  // optional flags that backend may provide
  can_delete?: boolean;
};
export type CommentNode = CommentItem & { replies: CommentNode[] };

/** ===== Константы (как в посте) ===== */
export const CLAMP_LINES = 4;
export const LONG_TEXT_CHARS = 320;
export const COMMENT_MAX_LEN = 1000;

/** ===== Вспомогалки ===== */
export const dateOnly = (s?: string | null, locale = 'ru-RU') =>
  s ? new Date(s).toLocaleDateString(locale) : '';

export const cmpReplyAsc = (a: CommentNode, b: CommentNode) =>
  new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

export const cmpMainOthers = (a: CommentNode, b: CommentNode) =>
  (b.likes_count - a.likes_count) ||
  (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

export const cmpMainMine = (a: CommentNode, b: CommentNode) =>
  (b.likes_count - a.likes_count) ||
  (new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

export function lastMyReplyAt(root: CommentNode, me?: string | null): number | null {
  if (!me) return null;
  for (let i = root.replies.length - 1; i >= 0; i--) {
    const r = root.replies[i];
    if (!r.is_deleted && r.author === me) return new Date(r.created_at).getTime();
  }
  return null;
}

export function buildTree(flat: CommentItem[]): CommentNode[] {
  const map = new Map<number, CommentNode>();
  const roots: CommentNode[] = [];
  for (const c of flat) {
    if (c.is_deleted) continue;
    map.set(c.id, { ...c, replies: [] });
  }
  for (const c of map.values()) {
    if (c.parent_id && map.has(c.parent_id)) map.get(c.parent_id)!.replies.push(c);
    else roots.push(c);
  }
  for (const r of roots) r.replies.sort(cmpReplyAsc);
  return roots;
}

const MENTION_RE = /@([a-z0-9_]{1,50})/gi;
export function renderWithMentions(text: string) {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const uname = m[1];
    out.push(
      <Link key={`${m.index}-${uname}`} href={`/${uname}`} className="text-blue-600 hover:underline">
        @{uname}
      </Link>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Avatar({
  href,
  src,
  size = 32,
  alt = '',
  onClick,
}: {
  href: string;
  src?: string | null;
  size?: number;
  alt?: string;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const wh = `${size}px`;
  const normalized = useMemo(() => normalizeCommentAvatarSrc(src), [src]);
  const [broken, setBroken] = useState(false);
  const errorCountRef = useRef(0);

  useEffect(() => {
    setBroken(false);
    errorCountRef.current = 0;
  }, [normalized]);

  const displaySrc = broken ? FALLBACK_AVATAR : (normalized || FALLBACK_AVATAR);

  const handleError = useCallback(() => {
    if (broken) return;
    const next = errorCountRef.current + 1;
    errorCountRef.current = next;
    if (next >= 2) setBroken(true);
  }, [broken]);

  return (
    <Link href={href} className="shrink-0" onClick={onClick}>
      <SmartImage
        src={displaySrc}
        alt={alt}
        width={size}
        height={size}
        className="rounded-full object-cover border"
        sizes={`${size}px`}
        style={{ width: wh, height: wh }}
        forceUnoptimized
        noFade
        noSkeleton
        priority
        onError={handleError}
      />
    </Link>
  );
}

type CollapsibleTextProps = {
  text: string;
  className?: string;
  lines?: number;
  expandLabel?: string;
  collapseLabel?: string;
  renderText?: (text: string) => ReactNode;
};


/** ===== Сворачиваемый текст (ровно как в посте) ===== */
export function CollapsibleText({
  text,
  className = '',
  lines = CLAMP_LINES,
  expandLabel = 'развернуть',
  collapseLabel = 'свернуть',
  renderText,
}: CollapsibleTextProps) {
  const [expanded, setExpanded] = useState(false);
  const expandedRef = useRef(expanded);
  useEffect(() => { expandedRef.current = expanded; }, [expanded]);

  // реальное измерение переполнения
  const [showToggle, setShowToggle] = useState(false);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef(false);

  // ——— clamp инлайном, чтобы уважать `lines` и не лезть в глобальные стили
  const setClamp = useCallback((on: boolean) => {
    const style = contentRef.current?.style;
    if (!style) return;
    style.setProperty('display', on ? '-webkit-box' : '');
    style.setProperty('-webkit-box-orient', on ? 'vertical' : '');
    style.setProperty('-webkit-line-clamp', on ? String(lines) : '');
    style.setProperty('overflow', on ? 'hidden' : '');
    style.setProperty('white-space', 'pre-wrap');
    style.setProperty('word-break', 'break-word');
  }, [lines]);

  // ——— показать ли «развернуть»
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    setClamp(true);
    requestAnimationFrame(() => {
      const need = el.scrollHeight > el.clientHeight + 1;
      setShowToggle(need);
      if (expanded) setClamp(false);
    });
  }, [text, lines, expanded, setClamp]);

  // ——— измерения
  const measureCollapsedHeight = useCallback(() => {
    const el = getComputedStyle(contentRef.current!);
    const lh   = parseFloat(el.lineHeight || '20');
    const padY = parseFloat(el.paddingTop) + parseFloat(el.paddingBottom);
    const brdY = parseFloat(el.borderTopWidth) + parseFloat(el.borderBottomWidth);
    return Math.ceil(lh * lines + padY + brdY);
  }, [lines]);

  const fullHeight = () => contentRef.current?.scrollHeight ?? 0;
  const resetAnimStyles = () => {
    const box = boxRef.current;
    if (!box) return;
    box.style.transition = '';
    box.style.maxHeight  = '';
    box.style.overflow   = '';
  };

  // ——— открытие (плавно)
  const expandNow = useCallback(() => {
    const box = boxRef.current;
    if (!box) { setExpanded(true); return; }
    const from = box.getBoundingClientRect().height;
    setClamp(false);
    const to = Math.max(from, fullHeight());

    box.style.willChange = 'max-height';
    box.style.overflow   = 'hidden';
    box.style.maxHeight  = from + 'px';
    void box.offsetHeight;
    box.style.transition = 'max-height 220ms ease';
    box.style.maxHeight  = to + 'px';

    const onEnd = () => {
      box.removeEventListener('transitionend', onEnd);
      resetAnimStyles();
      box.style.willChange = '';
      setExpanded(true);
    };
    box.addEventListener('transitionend', onEnd);
  }, [setClamp]);

  // ——— сворачивание (плавно)
  const animateCollapse = useCallback(() => {
    if (animRef.current || !expandedRef.current) return;
    const box = boxRef.current;
    if (!box) { setExpanded(false); return; }
    animRef.current = true;

    const from = box.getBoundingClientRect().height;
    const to = measureCollapsedHeight();

    box.style.willChange = 'max-height';
    box.style.overflow   = 'hidden';
    box.style.maxHeight  = from + 'px';
    void box.offsetHeight;
    box.style.transition = 'max-height 220ms ease';
    box.style.maxHeight  = to + 'px';

    const onEnd = () => {
      box.removeEventListener('transitionend', onEnd);
      setClamp(true);            // включаем clamp только после анимации
      resetAnimStyles();
      box.style.willChange = '';
      animRef.current = false;
      setExpanded(false);
    };
    box.addEventListener('transitionend', onEnd);
  }, [measureCollapsedHeight, setClamp]);

  // ——— авто-сворачивание «как в профиле»
  const scrollParentRef = useRef<HTMLElement | null>(null);
  const lastTopRef = useRef(0);
  const dirRef  = useRef<'up'|'down'|'none'>('none');
  const lastPosRef = useRef<'above'|'inside'|'below'>('inside');

  const findScrollParent = useCallback((el: HTMLElement | null): HTMLElement | null => {
    let n: HTMLElement | null = el?.parentElement ?? null;
    while (n) {
      const oy = getComputedStyle(n).overflowY;
      if (oy === 'auto' || oy === 'scroll') return n;
      n = n.parentElement;
    }
    return null;
  }, []);

  // какая часть считать «блоком»: текст + возможная строка действий под ним
  const getObservedBoxPos = useCallback((rootEl: HTMLElement | null) => {
    const box = boxRef.current;
    const rr = rootEl ? rootEl.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    if (!box) return { pos: 'inside' as 'above'|'inside'|'below', inView: true, rr };

    // wrapper — внешний <div className="mt-0.5"> вокруг boxRef
    const wrapper = box.parentElement as HTMLElement | null;
    const br = box.getBoundingClientRect();
    const top = br.top;
    let bottom = br.bottom;

    // пробуем захватить «строку действий» (лайк/ответить/…)
    // поддерживаем несколько атрибутов, чтобы работало и в профиле, и в кэмпе
    const actions = (wrapper?.nextElementSibling as HTMLElement | null);
    const matchesActions = (el: Element | null) =>
      !!el && (el.matches?.('[data-comment-actions]') ||
               el.matches?.('[data-replies-controls]') ||
               el.matches?.('[data-camp-actions]') ||
               el.matches?.('[data-collapsible-actions]'));
    if (matchesActions(actions)) {
      const actB = (actions as HTMLElement).getBoundingClientRect().bottom;
      if (actB > bottom) bottom = actB;
    }

    const EPS = 1;
    const MARGIN = 8;
    const above = bottom <= rr.top + EPS + MARGIN;
    const below = top >= rr.bottom - EPS;
    const inView = !(above || below);
    const pos: 'above'|'inside'|'below' = inView ? 'inside' : (above ? 'above' : 'below');
    return { pos, inView, rr };
  }, []);

  // мгновенный «схлоп» без скачка, с компенсацией скролла, когда блок уехал ВВЕРХ
  const collapseAboveKeepingViewport = useCallback(() => {
    if (!expandedRef.current || animRef.current) return;
    const box = boxRef.current;
    const inner = contentRef.current;
    if (!box || !inner) { setExpanded(false); return; }

    // Найдём контейнер, включающий текст и нижнюю строку действий
    const wrapper = box.parentElement as HTMLElement | null; // внешний div вокруг текста
    const container = (wrapper?.parentElement as HTMLElement | null) ?? wrapper ?? box; // общий контейнер контента
    const actions = (wrapper?.nextElementSibling as HTMLElement | null);

    const root = (scrollParentRef.current ?? findScrollParent(inner));
    scrollParentRef.current = root;
    const getTop = () => (root ? root.scrollTop : window.scrollY);
    const setTop = (val: number) => { if (root) root.scrollTop = val; else window.scrollTo({ top: val }); };

    // Измеряем «до»: низ объединённого блока (текст + возможные действия под ним)
    const beforeText = box.getBoundingClientRect();
    const beforeActionsBottom = actions ? (actions.getBoundingClientRect().bottom) : beforeText.bottom;
    const beforeBottom = Math.max(beforeText.bottom, beforeActionsBottom);

    // Выключаем анимации прокрутки в документе, если скроллер — window
    let restoreScrollBehavior: (() => void) | null = null;
    if (!root) {
      const el = document.documentElement;
      const prev = el.style.scrollBehavior;
      el.style.scrollBehavior = 'auto';
      restoreScrollBehavior = () => { el.style.scrollBehavior = prev; };
    }

    const prevTop = getTop();

    // Защита от «мигания»: временно фиксируем слой контейнера
    const prevTransform = container.style.transform;
    const prevWillChange = container.style.willChange;
    container.style.willChange = 'transform';
    container.style.transform = 'translateZ(0)';

    // Схлопываем синхронно
    flushSync(() => setExpanded(false));

    // Измеряем «после» и компенсируем скролл на точную дельту
    const afterText = box.getBoundingClientRect();
    const afterActionsBottom = actions ? (actions.getBoundingClientRect().bottom) : afterText.bottom;
    const afterBottom = Math.max(afterText.bottom, afterActionsBottom);
    const dpr = window.devicePixelRatio || 1;
    const deltaRaw = beforeBottom - afterBottom;
    const delta = Math.round(deltaRaw * dpr) / dpr;

    if (Math.abs(delta) > 0) setTop(prevTop - delta);

    // Снимаем фиксацию слоя на следующий кадр
    requestAnimationFrame(() => {
      container.style.transform = prevTransform;
      container.style.willChange = prevWillChange;
      if (restoreScrollBehavior) requestAnimationFrame(restoreScrollBehavior);
    });
  }, [findScrollParent]);

  // слежение за скроллом/размером
  useEffect(() => {
    if (!showToggle) return; // нечего сворачивать
    const inner = contentRef.current; if (!inner) return;
    const root = scrollParentRef.current ?? findScrollParent(inner);
    scrollParentRef.current = root;

    const getTop = () => (root ? root.scrollTop : window.scrollY);

    const decide = () => {
      const { pos, inView } = getObservedBoxPos(root ?? null);

      if (expandedRef.current && !animRef.current) {
        if (pos === 'below' && !inView) {
          // уехали ВНИЗ — можно сразу схлопнуть
          resetAnimStyles();
          setExpanded(false);
        } else if (pos === 'inside' && lastPosRef.current === 'below' && dirRef.current === 'up') {
          // вернулись ВВЕРХ из «низа» — красиво схлопываем
          animateCollapse();
        }
      }
      lastPosRef.current = pos;
    };

    // init
    lastTopRef.current = getTop();
    decide();

    const onScroll = () => {
      const t = getTop();
      dirRef.current = t < lastTopRef.current ? 'up' : (t > lastTopRef.current ? 'down' : dirRef.current);
      lastTopRef.current = t;
      decide();
    };
    const onResize = () => decide();

    if (root) root.addEventListener('scroll', onScroll, { passive: true });
    else window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    return () => {
      if (root) root.removeEventListener('scroll', onScroll);
      else window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [showToggle, findScrollParent, getObservedBoxPos, animateCollapse, collapseAboveKeepingViewport]);

  return (
    <div className="mt-0.5">
      <div ref={boxRef} className="collapsible-anchor-fix" style={{ overflow: 'hidden' }}>
        <div
          ref={contentRef}
          className={['whitespace-pre-wrap break-words', className].join(' ')}
          aria-expanded={expanded}
        >
          {(renderText ?? renderWithMentions)(text)}
        </div>
      </div>

      {showToggle && (
        <button
          type="button"
          onClick={() => (expanded ? animateCollapse() : expandNow())}
          className="mt-1 text-xs text-gray-500/70 hover:underline"
          aria-expanded={expanded}
        >
          {expanded ? collapseLabel : expandLabel}
        </button>
      )}
    </div>
  );
}



/** ===== Ветка ответов (со сворачиванием без рывков) ===== */
export function RepliesThread({
  root,
  me,
  expandToId,
  onReply,
  onLike,
  onReport,
  onDelete,
}: {
  root: CommentNode;
  me: string | null;
  expandToId?: number;
  onReply: (username: string) => void;
  onLike: (id: number) => void;
  onReport: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastPosRef = useRef<'above'|'inside'|'below'>('inside');

  const getObservedRepliesPos = useCallback((rootEl: HTMLElement | null) => {
    const host = rootRef.current;
    const rr = rootEl ? rootEl.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    if (!host) return { pos: 'inside' as 'above'|'inside'|'below', inView: true, rr };

    const hr = host.getBoundingClientRect();
    const controls = host.querySelector('[data-replies-controls]') as HTMLElement | null;
    let bottom = hr.bottom;
    if (controls) {
      const cb = controls.getBoundingClientRect().bottom;
      if (cb > bottom) bottom = cb;
    }
    const top = hr.top;
    const EPS = 1, MARGIN = 8;
    const above = bottom <= rr.top + EPS + MARGIN;
    const below = top >= rr.bottom - EPS;
    const inView = !(above || below);
    const pos: 'above'|'inside'|'below' = inView ? 'inside' : (above ? 'above' : 'below');
    return { pos, inView, rr };
  }, []);

  const replies = useMemo(() => root.replies ?? [], [root.replies]);
  const total = replies.length;
  const [visible, setVisible] = useState(Math.min(total, 1));
  const [lastMyIdx, setLastMyIdx] = useState(-1);

  const scrollParentRef = useRef<HTMLElement | null>(null);
  const lastTopRef = useRef(0);
  const dirRef = useRef<'up' | 'down' | 'none'>('none');

  const findScrollParent = useCallback((el: HTMLElement | null): HTMLElement | null => {
    let n: HTMLElement | null = el?.parentElement ?? null;
    while (n) {
      const oy = getComputedStyle(n).overflowY;
      if (oy === 'auto' || oy === 'scroll') return n;
      n = n.parentElement;
    }
    return null;
  }, []);

  useEffect(() => {
    setVisible(Math.min(replies.length, 1));
    if (me) {
      for (let i = replies.length - 1; i >= 0; i--) {
        const r = replies[i];
        if (!r.is_deleted && r.author === me) { setLastMyIdx(i); break; }
      }
    } else setLastMyIdx(-1);
  }, [replies, me]);

  useEffect(() => {
    if (!expandToId || !replies.length) return;
    const idx = replies.findIndex(r => r.id === expandToId);
    if (idx >= 0) setVisible(v => Math.max(v, idx + 1));
  }, [expandToId, replies]);

  const collapseRepliesWithoutJump = useCallback(() => {
    if (visible <= 1) return;
    const host = rootRef.current;
    if (!host) { setVisible(1); return; }

    const rootEl = (scrollParentRef.current ?? findScrollParent(host));
    scrollParentRef.current = rootEl;
    const getTop = () => (rootEl ? rootEl.scrollTop : window.scrollY);
    const setTop = (val: number) => { if (rootEl) rootEl.scrollTop = val; else window.scrollTo({ top: val }); };

    const { pos } = getObservedRepliesPos(rootEl ?? null);
    const before = host.getBoundingClientRect();
    const prevTop = getTop();

    let restore: (() => void) | null = null;
    if (!rootEl) {
      const el = document.documentElement;
      const prev = el.style.scrollBehavior;
      el.style.scrollBehavior = 'auto';
      restore = () => { el.style.scrollBehavior = prev; };
    }

    const prevTransform   = host.style.transform;
    const prevWillChange  = host.style.willChange;
    const prevOpacity     = host.style.opacity;
    host.style.willChange = 'transform';
    host.style.transform  = 'translateZ(0)';
    host.style.opacity    = '0.999';

    try {
      flushSync(() => setVisible(1));
      const after = host.getBoundingClientRect();
      const dpr   = window.devicePixelRatio || 1;
      const raw   = Math.max(0, before.height - after.height);
      const delta = Math.round(raw * dpr) / dpr;

      if (pos === 'above' && delta > 0) {
        host.style.transform = `translate3d(0, ${delta}px, 0)`;
        requestAnimationFrame(() => {
          setTop(prevTop - delta);
          requestAnimationFrame(() => {
            host.style.transform  = prevTransform;
            host.style.willChange = prevWillChange;
            host.style.opacity    = prevOpacity;
          });
        });
      } else {
        requestAnimationFrame(() => {
          host.style.transform  = prevTransform;
          host.style.willChange = prevWillChange;
          host.style.opacity    = prevOpacity;
        });
      }
    } finally {
      if (restore) requestAnimationFrame(restore);
    }
  }, [visible, findScrollParent, getObservedRepliesPos]);

  useEffect(() => {
    const el = rootRef.current; if (!el) return;
    const rootEl = (scrollParentRef.current ?? findScrollParent(el));
    scrollParentRef.current = rootEl;
    const getTop = () => (rootEl ? rootEl.scrollTop : window.scrollY);

    const decide = () => {
      if (visible <= 1) { lastPosRef.current = 'inside'; return; }
      const { pos } = getObservedRepliesPos(rootEl ?? null);
      // автосворачивание только когда блок уходит вниз из видимой области
      if (pos === 'below' && lastPosRef.current === 'inside' && dirRef.current === 'up') collapseRepliesWithoutJump();
      lastPosRef.current = pos;
    };

    lastTopRef.current = getTop(); decide();
    const onScroll = () => {
      const t = getTop();
      dirRef.current = t < lastTopRef.current ? 'up' : (t > lastTopRef.current ? 'down' : dirRef.current);
      lastTopRef.current = t;
      decide();
    };
    const onResize = () => decide();

    if (rootEl) rootEl.addEventListener('scroll', onScroll, { passive: true });
    else window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      if (rootEl) rootEl.removeEventListener('scroll', onScroll);
      else window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [visible, findScrollParent, getObservedRepliesPos, collapseRepliesWithoutJump]);

  const toShow = useMemo(() => {
    if (visible === 1 && lastMyIdx >= 0) return [replies[lastMyIdx]];
    return replies.slice(0, visible);
  }, [replies, visible, lastMyIdx]);

  const remaining = Math.max(0, total - visible);
  const nextStep = Math.min(10, remaining);

  return (
    <div ref={rootRef} className="replies-anchor-fix">
      {!!replies.length && (
        <ul className="mt-2 pl-4 border-l border-gray-200">
          {toShow.map((r) => (
            <li key={r.id} id={`comment-${r.id}`} className="mt-2" style={{ scrollMarginBottom: 'var(--bottom-gap)' }}>
              <div className="flex items-start gap-2">
                <Avatar href={`/${r.author}`} src={r.author_avatar_url} size={24} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-end gap-2">
                    <Link href={`/${r.author}`} className="text-[13px] font-medium leading-none text-gray-900 hover:underline">
                      @{r.author}
                    </Link>
                  </div>

                  <CollapsibleText text={r.text} className="text-[13px]" />

                  <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-600" data-comment-actions>
                    <button onClick={() => onLike(r.id)} className="inline-flex items-center gap-1">
                      <HeartIcon
                        filled={!!r.liked_by_me}
                        className={['text-sm leading-none select-none', r.liked_by_me ? 'text-red-500' : (r.likes_count > 0 ? 'text-black' : 'text-gray-400')].join(' ')}
                      />
                      {r.likes_count > 0 && <span className="tabular-nums">{r.likes_count}</span>}
                    </button>

                    <button type="button" className="hover:underline" onClick={() => onReply(r.author)}>
                      Ответить
                    </button>

                    {me && me !== r.author && (
                      <button type="button" className="hover:underline" onClick={() => onReport(r.id)}>
                        Пожаловаться
                      </button>
                    )}
                    {me && me === r.author && (
                      <button type="button" className="text-red-600 hover:underline" onClick={() => onDelete(r.id)}>
                        Удалить
                      </button>
                    )}
                    <span className="ml-auto text-[12px] leading-none text-gray-500/40 whitespace-nowrap">{dateOnly(r.created_at)}</span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {total > 0 && (
        <div className="ml-4 mt-1 flex gap-4 text-xs text-gray-500" data-replies-controls>
          {remaining > 0 && (
            <button
              onClick={() => {
                setVisible(v => (v <= 1 && lastMyIdx >= 0) ? lastMyIdx + 1 : v + nextStep);
              }}
              className="hover:underline"
            >
              {visible <= 1 ? `Показать остальные ${remaining} ответов` : `Показать следующие ${nextStep} ответов`}
            </button>
          )}
          {total > 1 && visible > 1 && (
            <button onClick={collapseRepliesWithoutJump} className="hover:underline">Свернуть ответы</button>
          )}
        </div>
      )}
    </div>
  );
}

/** ===== Глобальные стили, если не подключены на странице ===== */
export function CommentGlobalStyles() {
  return (
    <style jsx global>{`
      .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      .no-scrollbar::-webkit-scrollbar { display: none; }
      .collapsible-anchor-fix,
      .replies-anchor-fix {
        overflow-anchor: none;
        contain: layout paint;
        backface-visibility: hidden;
        isolation: isolate;
      }
     
    `}</style>
  );
}
