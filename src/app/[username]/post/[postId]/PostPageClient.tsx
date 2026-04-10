'use client';

import SmartImage from '@/components/SmartImage';
import Link from 'next/link';
import { absUrl } from '@/components/camp/campNormalize';
import { Calendar } from 'lucide-react';
import { useEffect, useMemo, useState, useCallback, useRef, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { flushSync } from 'react-dom';
import CreatePostModal from '@/components/post/CreatePostModal';
import ReportAbuseModal, { type ReportModalProps } from '@/components/common/ReportModal';
import React from 'react';
import MobilePostPageClient from '@/app/m/[username]/post/[postId]/MobilePostPageClient';
import { Dialog, DialogPortal, DialogOverlay } from '@/components/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { createPortal } from 'react-dom';
import PostActionSheet from '@/components/post/mobile/PostActionSheet';
import { consumeReturn, navigateBack, rememberReturn } from '@/lib/navBack';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';
import { useSearchOverlay } from '@/hooks/useSearchOverlay';
import { useAppNavigation } from '@/hooks/useAppNavigation';
import { useCampOverlay } from '@/hooks/useCampOverlay';
import { buildPhotoSearchUrl, normalizePhotoSearchUrlFromServer, PHOTO_SEARCH_TAB_PARAM } from '@/lib/photoSearchParams';
import { hasTemporaryToken } from '@/lib/checkTemporaryToken';
import CompleteProfileActionModal from '@/components/CompleteProfileActionModal';
import { useLayerStack } from '@/context/LayerStackContext';
//import { campPathFrom } from '@/components/post/helpers/campPath';
import { getBrowserApiBase } from '@/lib/apiBase';
import MentionedProfileInline from '@/components/post/MentionedProfileInline';


type Author = { username: string; avatar_url?: string | null } | null;

type ProfileMini = { id: number; username: string; avatar_url?: string | null; role?: string | null };

type Named = { id: number; name: string };

const dateOnly = (s?: string | null, locale = 'ru-RU') =>
  s ? new Date(s).toLocaleDateString(locale) : '';

export type PostFull = {
  id: number;
  author: Author;
  text?: string | null;
  images?: string[];
  created_at?: string | null;
  location_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  camp_latitude?: number | null;
  camp_longitude?: number | null;
  location_search_url?: string | null;
  likes_count?: number;
  liked?: boolean;
  comments_count?: number;

  camp_id?: number | null;
  camp_title?: string | null;
  camp_slug?: string | null;
  profiles_count?: number | null;
  profiles?: ProfileMini[];
  camp_owner_username?: string | null;

  camp_public_key?: string | null;
  camp_url?: string | null;

  activities?: Named[];
  hashtags?: Named[];

  camp_starts_at?: string | null;
  camp_ends_at?: string | null;
};

type PostPageClientProps = {
  username: string;
  postId: string;
  initialPost?: PostFull | null;
};


type CommentItem = {
  id: number;
  author: string;                   // username
  author_avatar_url?: string | null;
  text: string;
  created_at: string;
  likes_count: number;
  liked_by_me?: boolean;
  parent_id: number | null;
  is_deleted?: boolean;
};

// Глобальная навигация на профиль (надёжная — через полную загрузку)
function goToProfile(uname: string) {
  try { window.location.assign(`/${uname}`); }
  catch { window.location.href = `/${uname}`; }
}

// Хук навигации на профиль: в оверлее открывает оверлей профиля,
// на обычной странице делает полную навигацию.
function useProfileNav() {
  const overlayEnv = useOverlayEnvironment();
  const { navigateProfile } = useAppNavigation();

  return useCallback((
    event: React.MouseEvent<HTMLElement>,
    uname?: string | null,
  ) => {
    const usernameSafe = (uname || '').trim();
    if (!usernameSafe) {
      event.preventDefault();
      return;
    }
    if (overlayEnv.isOverlay) {
      const handled = navigateProfile(event as React.MouseEvent<HTMLElement>, { username: usernameSafe });
      if (!handled) {
        event.preventDefault();
        goToProfile(usernameSafe);
      }
    } else {
      event.preventDefault();
      goToProfile(usernameSafe);
    }
  }, [overlayEnv.isOverlay, navigateProfile]);
}


// рядом с другими утилитами/хуками
function useIsDesktop(breakpoint = 768) {
  const get = () => (typeof window !== 'undefined' ? window.innerWidth >= breakpoint : true);
  const [is, setIs] = React.useState(get);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(min-width:${breakpoint}px)`);
    const on = () => setIs(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [breakpoint]);
  return is;
}


const dbg = (...args: unknown[]) => {
  try { if (typeof window !== 'undefined') console.log('[PostDesktopPage]', ...args); } catch { }
};




type PostComment = CommentItem;

type PostCommentNode = PostComment & { replies: PostCommentNode[] };

const cmpReplyAsc = (a: PostCommentNode, b: PostCommentNode) =>
  new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

// сортировка корней «как в кэмпе»:
const cmpMainOthers = (a: PostCommentNode, b: PostCommentNode) =>
  (b.likes_count - a.likes_count) ||
  (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); // старые выше при равных лайках

const cmpMainMine = (a: PostCommentNode, b: PostCommentNode) =>
  (b.likes_count - a.likes_count) ||
  (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); // мои — новые выше

function lastMyReplyAt(root: PostCommentNode, me?: string | null): number | null {
  if (!me) return null;
  for (let i = root.replies.length - 1; i >= 0; i--) {
    const r = root.replies[i];
    if (!r.is_deleted && r.author === me) return new Date(r.created_at).getTime();
  }
  return null;
}


function formatCampRange(start?: string | null, end?: string | null) {
  if (!start && !end) return '';

  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;

  const fmtDM = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
  const fmtD = new Intl.DateTimeFormat('ru-RU', { day: 'numeric' });

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const dm = (d: Date) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;

  if (s && e) {
    const sameDay = s.toDateString() === e.toDateString();
    const sameMonth = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth();

    if (sameDay) return fmtDM.format(s);                       // 13 окт.
    if (sameMonth) return `${fmtD.format(s)}–${fmtDM.format(e)}`; // 13–21 окт.
    return `${dm(s)} - ${dm(e)}`;                                 // 13.10 - 21.11
  }

  if (s && !e) return 'с ' + fmtDM.format(s);   // с 13 окт.
  if (!s && e) return 'до ' + fmtDM.format(e);  // до 21 ноя.
  return '';
}




function buildTree(flat: PostComment[]): PostCommentNode[] {
  const map = new Map<number, PostCommentNode>();
  const roots: PostCommentNode[] = [];
  for (const c of flat) {
    if (c.is_deleted) continue;
    map.set(c.id, { ...c, replies: [] });
  }
  for (const c of map.values()) {
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.replies.push(c);
    } else {
      roots.push(c);
    }
  }
  // ответы строго по времени ASC
  for (const r of roots) r.replies.sort(cmpReplyAsc);
  return roots;
}



const CLAMP_LINES = 4; //
const LONG_TEXT_CHARS = 320; //
const COMMENT_MAX_LEN = 1000;    //


function CollapsibleText({
  text,
  className = '',
  lines = CLAMP_LINES,
  expandLabel = 'Развернуть',
  collapseLabel = 'Свернуть',
  containerClassName = 'mt-1.5',
  renderText,
}: {
  text: string;
  className?: string;
  lines?: number;
  expandLabel?: string;
  collapseLabel?: string;
  containerClassName?: string;
  renderText?: (text: string) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const expandedRef = useRef(expanded);
  useEffect(() => { expandedRef.current = expanded; }, [expanded]);

  const showToggle = useMemo(
    () => text.length > LONG_TEXT_CHARS || text.split('\n').length > lines,
    [text, lines]
  );

  const boxRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef(false);

  const scrollParentRef = useRef<HTMLElement | null>(null);
  const lastTopRef = useRef(0);
  const dirRef = useRef<'up' | 'down' | 'none'>('none');
  const lastPosRef = useRef<'above' | 'inside' | 'below'>('inside');

  const findScrollParent = useCallback((el: HTMLElement | null): HTMLElement | null => {
    let n: HTMLElement | null = el?.parentElement ?? null;
    while (n) {
      const oy = getComputedStyle(n).overflowY;
      if (oy === 'auto' || oy === 'scroll') return n;
      n = n.parentElement;
    }
    return null;
  }, []);



  const measureCollapsedHeight = useCallback(() => {
    const el = contentRef.current;
    if (!el) return 0;
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight || '20');
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const brdY = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    return Math.ceil(lh * lines + padY + brdY);
  }, [lines]);

  const fullHeight = () => contentRef.current?.scrollHeight ?? 0;

  const resetAnimStyles = () => {
    const box = boxRef.current;
    if (!box) return;
    box.style.transition = '';
    box.style.maxHeight = '';
    box.style.overflow = '';
  };


  const collapseAboveKeepingViewport = useCallback(() => {
    if (!expandedRef.current || animRef.current) return;

    const box = boxRef.current;
    const inner = contentRef.current;
    if (!box || !inner) { setExpanded(false); return; }

    // считаем delta ДО изменения layout
    const from = Math.max(box.clientHeight, fullHeight());
    const to = measureCollapsedHeight();
    const delta = Math.max(0, Math.round(from - to));
    if (delta <= 0) { setExpanded(false); return; }

    // скролл-контейнер
    const root = (scrollParentRef.current ?? findScrollParent(inner));
    scrollParentRef.current = root;

    const getTop = () => (root ? root.scrollTop : window.scrollY);
    const setTop = (val: number) => {
      if (root) root.scrollTop = val;
      else window.scrollTo({ top: val }); // ниже отключим smooth, если есть
    };

    // мгновенно (без переходов)
    resetAnimStyles();

    // на время — выключим smooth-scroll только для window-скролла
    let restore: (() => void) | null = null;
    if (!root) {
      const el = document.documentElement;
      const prev = el.style.scrollBehavior;
      el.style.scrollBehavior = 'auto';
      restore = () => { el.style.scrollBehavior = prev; };
    }

    const prevTop = getTop();

    // ⬇️ синхронно схлопываем и тут же компенсируем на delta вверх — в один кадр
    try {
      flushSync(() => setExpanded(false));
    } finally {
      setTop(prevTop - delta);
      if (restore) requestAnimationFrame(restore);
    }
  }, [measureCollapsedHeight, findScrollParent]);




  const animateCollapse = useCallback(() => {
    if (animRef.current || !expandedRef.current) return;
    const box = boxRef.current;
    const inner = contentRef.current;
    if (!box || !inner) { setExpanded(false); return; }

    animRef.current = true;

    const from = Math.max(box.clientHeight, fullHeight());
    const to = measureCollapsedHeight();

    box.style.willChange = 'max-height';
    box.style.overflow = 'hidden';
    box.style.maxHeight = from + 'px';
    // force reflow
    void box.offsetHeight;

    box.style.transition = 'max-height 220ms ease';
    box.style.maxHeight = to + 'px';

    const onEnd = () => {
      box.removeEventListener('transitionend', onEnd);
      resetAnimStyles();
      box.style.willChange = '';
      animRef.current = false;
      setExpanded(false);
    };
    box.addEventListener('transitionend', onEnd);
  }, [measureCollapsedHeight]);

  // какой прямоугольник считаем «всем комментом, который надо дождаться из вьюпорта»
  const getObservedBoxPos = useCallback((rootEl: HTMLElement | null) => {
    const box = boxRef.current;
    if (!box) {
      const rr = rootEl ? rootEl.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      return { pos: 'inside' as 'above' | 'inside' | 'below', inView: true, rr };
    }

    // wrapper — <div className="mt-0.5"> вокруг boxRef
    const wrapper = box.parentElement as HTMLElement | null;

    // top/bottom текста (+ кнопка «свернуть», т.к. она внутри wrapper, но вне boxRef — нам важен низ всего блока)
    const boxRect = box.getBoundingClientRect();
    const top = boxRect.top;
    let bottom = boxRect.bottom;

    // ищем следующий sibling со строкой действий: лайк/ответить/…
    const actions = wrapper?.nextElementSibling as HTMLElement | null;
    if (actions && actions.hasAttribute('data-comment-actions')) {
      const actB = actions.getBoundingClientRect().bottom;
      if (actB > bottom) bottom = actB; // низ «общего» блока = низ строки действий
    } else {
      // на всякий случай — если нет строки действий, низ остаётся как у текста
    }

    const rr = rootEl ? rootEl.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };

    // небольшой гистерезис на 1px, чтобы не «дёргалось» на границе
    const EPS = 1;
    const MARGIN = 8;
    const above = bottom <= rr.top + EPS + MARGIN;
    const below = top >= rr.bottom - EPS;
    const inView = !(above || below);
    const pos: 'above' | 'inside' | 'below' = inView ? 'inside' : (above ? 'above' : 'below');
    return { pos, inView, rr };
  }, []);

  // направление скролла + принятие решений тут же
  useEffect(() => {
    if (!showToggle) return;

    const inner = contentRef.current; if (!inner) return;
    const root = scrollParentRef.current ?? findScrollParent(inner);
    scrollParentRef.current = root;

    const getTop = () => (root ? root.scrollTop : window.scrollY);

    const decide = () => {
      const { pos, inView } = getObservedBoxPos(root ?? null);

      if (expandedRef.current && !animRef.current) {
        if (pos === 'below' && !inView) {
          // ушли ВНИЗ (редкий кейс) — можно мгновенно схлопнуть
          resetAnimStyles();
          setExpanded(false);
        } else if (
          pos === 'inside' &&
          lastPosRef.current === 'below' &&
          dirRef.current === 'up'
        ) {
          // вернулись ВВЕРХ из «низа» — красиво схлопываем
          animateCollapse();
        } else if (
          // НОВОЕ: весь блок (текст+toggle+actions) ушёл ВВЕРХ при движении вниз
          pos === 'above' &&
          lastPosRef.current === 'inside' &&
          dirRef.current === 'down'
        ) {
          // схлопываем с компенсацией — без скачка
          collapseAboveKeepingViewport();
        }
      }

      lastPosRef.current = pos;
    };



    const onScroll = () => {
      const t = getTop();
      dirRef.current = t < lastTopRef.current ? 'up' : (t > lastTopRef.current ? 'down' : dirRef.current);
      lastTopRef.current = t;
      decide();
    };

    // init
    lastTopRef.current = getTop();
    decide();

    if (root) root.addEventListener('scroll', onScroll, { passive: true });
    else window.addEventListener('scroll', onScroll, { passive: true });

    // на ресайзах тоже проверяем
    const onResize = () => decide();
    window.addEventListener('resize', onResize);

    return () => {
      if (root) root.removeEventListener('scroll', onScroll);
      else window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [showToggle, findScrollParent, getObservedBoxPos, animateCollapse, collapseAboveKeepingViewport]);

  const expandNow = useCallback(() => {
    const box = boxRef.current;
    if (!box) { setExpanded(true); return; }
    box.style.overflow = 'hidden';
    const to = Math.max(box.clientHeight, fullHeight());
    box.style.maxHeight = to + 'px';
    requestAnimationFrame(() => {
      resetAnimStyles();
      setExpanded(true);
    });
  }, []);




  return (
    <div className={containerClassName}>
      <div ref={boxRef} style={{ overflow: 'hidden' }} className="collapsible-anchor-fix">
        <div
          ref={contentRef}
            className={[
              className,
              'whitespace-pre-wrap break-words',
              (!expanded && !animRef.current) ? 'comment-4l' : ''
            ].join(' ')}
        >
          {(renderText ?? renderWithMentions)(text)}
        </div>
      </div>

      {showToggle && (
        <button
          type="button"
          onClick={() => (expanded ? animateCollapse() : expandNow())}
          className="mt-1 text-xs text-gray-600 hover:underline"
          aria-expanded={expanded}
        >
          {expanded ? collapseLabel : expandLabel}
        </button>
      )}
    </div>
  );
}


function MoreButton({
  onClick,
  title = 'Ещё',
  scope = 'comment', // 'comment' | 'reply' | 'post'
}: {
  onClick: () => void;
  title?: string;
  scope?: 'comment' | 'reply' | 'post';
}) {
  const scopeClass =
    scope === 'reply'
      ? 'group-hover/reply:opacity-100'
      : scope === 'post'
        ? 'group-hover/post-head:opacity-100 group-hover/post-row:opacity-100'
        : 'group-hover/comment-head:opacity-100';

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`opacity-0 ${scopeClass} focus:opacity-100 transition-opacity
                  text-gray-500 hover:text-gray-800 text-[18px] leading-none
                  w-8 h-8 -m-1.5 p-1.5 rounded-full hover:bg-gray-100`}
    >
      ⋯
    </button>
  );
}

function CommentActionSheet({
  open,
  canReport,
  canDelete,
  onClose,
  onReport,
  onDelete,
}: {
  open: boolean;
  canReport?: boolean;
  canDelete?: boolean;
  onClose: () => void;
  onReport?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!open || !mounted) return null;

  const doAndClose = (fn?: () => void | Promise<void>) => async () => {
    try { await fn?.(); } finally { onClose(); }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[50000] bg-black/40 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-[min(540px,92vw)] rounded-[24px] bg-white shadow-xl overflow-hidden">
        {canReport && (
          <>
            <button
              className="w-full py-4 text-[17px] font-semibold text-red-600 hover:bg-red-50"
              onClick={doAndClose(onReport)}
            >
              Пожаловаться
            </button>
            {(canDelete || true) && <div className="h-px bg-gray-200" />}
          </>
        )}

        {canDelete && (
          <>
            <button
              className="w-full py-4 text-[17px] font-semibold text-red-600 hover:bg-red-50"
              onClick={doAndClose(onDelete)}
            >
              Удалить
            </button>
            <div className="h-px bg-gray-200" />
          </>
        )}

        <button className="w-full py-4 text-[17px] hover:bg-gray-50" onClick={onClose}>
          Отмена
        </button>
      </div>
    </div>,
    document.body
  );
}




function PostReplies({
  root,
  me,
  onReply,
  onLike,
  onShowLikers,
  onReport,
  onDelete,
  expandToId,
  canPostAuthorDelete = false,
  renderText,
}: {
  root: PostCommentNode;
  me: string | null;
  onReply: (username: string) => void;
  onLike: (id: number) => void;
  onShowLikers: (id: number) => void;
  onReport: (id: number) => void;
  onDelete: (id: number) => void;
  expandToId?: number;
  canPostAuthorDelete?: boolean;
  renderText?: (text: string) => ReactNode;
}) {

  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastPosRef = useRef<'above' | 'inside' | 'below'>('inside');

  const [sheet, setSheet] = useState<{ open: boolean; onReport?: () => void | Promise<void>; onDelete?: () => void | Promise<void> }>({ open: false });
  const handleProfileClick = useProfileNav();


  // как "getObservedBoxPos" у комментариев, только для ветки
  const getObservedRepliesPos = useCallback((rootEl: HTMLElement | null) => {
    const host = rootRef.current;
    const rr = rootEl ? rootEl.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    if (!host) return { pos: 'inside' as 'above' | 'inside' | 'below', inView: true, rr };

    // базовый прямоугольник самой ветки
    const hr = host.getBoundingClientRect();

    // низ считаем как максимум: низ ветки ИЛИ низ строки с кнопками (если есть)
    const controls = host.querySelector('[data-replies-controls]') as HTMLElement | null;
    let bottom = hr.bottom;
    if (controls) {
      const cb = controls.getBoundingClientRect().bottom;
      if (cb > bottom) bottom = cb;
    }

    const top = hr.top;

    // чуть гистерезиса как в комментариях
    const EPS = 1;
    const MARGIN = 8;
    const above = bottom <= rr.top + EPS + MARGIN;
    const below = top >= rr.bottom - EPS;
    const inView = !(above || below);
    const pos: 'above' | 'inside' | 'below' = inView ? 'inside' : (above ? 'above' : 'below');
    return { pos, inView, rr };
  }, []);


  const replies = useMemo(() => root.replies ?? [], [root.replies]);
  const total = replies.length;
  const [visible, setVisible] = useState(Math.min(total, 1));

  useEffect(() => {
    if (!expandToId || !replies.length) return;
    const idx = replies.findIndex(r => r.id === expandToId);
    if (idx >= 0) setVisible(v => Math.max(v, idx + 1));
  }, [expandToId, replies]);

  useEffect(() => {
    setVisible(Math.min(replies.length, 1));
  }, [replies]);


  // В НАЧАЛЕ PostReplies (после useState/useMemo)
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


  const collapseRepliesWithoutJump = useCallback(() => {
    if (visible <= 1) return;

    const host = rootRef.current;
    if (!host) { setVisible(1); return; }

    const root = (scrollParentRef.current ?? findScrollParent(host));
    scrollParentRef.current = root;

    const getTop = () => (root ? root.scrollTop : window.scrollY);
    const setTop = (val: number) => {
      if (root) root.scrollTop = val;
      else window.scrollTo({ top: val });
    };

    // где находится блок относительно вьюпорта
    const { pos } = getObservedRepliesPos(root ?? null);

    // измеряем ДО
    const before = host.getBoundingClientRect();
    const prevTop = getTop();

    // временно выключим smooth для window
    let restore: (() => void) | null = null;
    if (!root) {
      const el = document.documentElement;
      const prev = el.style.scrollBehavior;
      el.style.scrollBehavior = 'auto';
      restore = () => { el.style.scrollBehavior = prev; };
    }

    const prevTransform = host.style.transform;
    const prevWillChange = host.style.willChange;
    const prevOpacity = host.style.opacity;
    host.style.willChange = 'transform';
    host.style.transform = 'translateZ(0)';
    host.style.opacity = '0.999';

    try {
      // синхронно схлопываем список до 1
      flushSync(() => setVisible(1));

      // измеряем ПОСЛЕ и считаем delta
      const after = host.getBoundingClientRect();
      //const delta = Math.max(0, Math.round(before.height - after.height));
      const dpr = window.devicePixelRatio || 1;
      const raw = Math.max(0, before.height - after.height);
      const delta = Math.round(raw * dpr) / dpr;

      // компенсируем скролл ТОЛЬКО если вся ветка уже была выше экрана
      if (pos === 'above' && delta > 0) {
        host.style.transform = `translate3d(0, ${delta}px, 0)`;
        requestAnimationFrame(() => {
          setTop(prevTop - delta);
          requestAnimationFrame(() => {
            host.style.transform = prevTransform;
            host.style.willChange = prevWillChange;
            host.style.opacity = prevOpacity;
          });
        });
      } else {
        requestAnimationFrame(() => {
          host.style.transform = prevTransform;
          host.style.willChange = prevWillChange;
          host.style.opacity = prevOpacity;
        });
      }
    } finally {
      if (restore) requestAnimationFrame(restore);
    }
  }, [visible, findScrollParent, getObservedRepliesPos]);


  // авто-сворачивание, если ушли из зоны
  useEffect(() => {
    const el = rootRef.current; if (!el) return;
    const root = (scrollParentRef.current ?? findScrollParent(el));
    scrollParentRef.current = root;

    const getTop = () => (root ? root.scrollTop : window.scrollY);

    const decide = () => {
      if (visible <= 1) { lastPosRef.current = 'inside'; return; }

      const { pos } = getObservedRepliesPos(root ?? null);

      // как у комментариев: схлопываем ТОЛЬКО при переходе inside → above при движении вниз
      if (pos === 'above' && lastPosRef.current === 'inside' && dirRef.current === 'down') {
        collapseRepliesWithoutJump();
      }

      if (pos === 'below' && lastPosRef.current === 'inside' && dirRef.current === 'up') {
        collapseRepliesWithoutJump();
      }
      lastPosRef.current = pos;
    };

    const onScroll = () => {
      const t = getTop();
      dirRef.current = t < lastTopRef.current ? 'up' : (t > lastTopRef.current ? 'down' : dirRef.current);
      lastTopRef.current = t;
      decide();
    };

    // init
    lastTopRef.current = getTop();
    decide();

    if (root) root.addEventListener('scroll', onScroll, { passive: true });
    else window.addEventListener('scroll', onScroll, { passive: true });

    const onResize = () => decide();
    window.addEventListener('resize', onResize);

    return () => {
      if (root) root.removeEventListener('scroll', onScroll);
      else window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [visible, findScrollParent, getObservedRepliesPos, collapseRepliesWithoutJump]);

  useEffect(() => {
    if (!expandToId || !replies?.length) return;
    const idx = replies.findIndex(r => r.id === expandToId);
    if (idx >= 0) {
      setVisible(v => Math.max(v, idx + 1));  // раскрыть до нужного элемента
    }
  }, [expandToId, replies]);



  const lastMyIdx = useMemo(() => {
    if (!me) return -1;
    for (let i = replies.length - 1; i >= 0; i--) {
      const r = replies[i];
      if (!r.is_deleted && r.author === me) return i;
    }
    return -1;
  }, [replies, me]);

  const toShow = visible === 1 && lastMyIdx >= 0 ? [replies[lastMyIdx]] : replies.slice(0, visible);
  const remaining = Math.max(0, total - visible);
  const nextStep = Math.min(10, remaining);

  return (
    <div ref={rootRef} className="replies-anchor-fix mt-1">
      {!!replies.length && (
        <ul className="mt-2 pl-4 border-l border-gray-200">
          {toShow.map((r) => (
            <li
              key={r.id}
              id={`comment-${r.id}`}
              className="mt-2.5"
              style={{ scrollMarginBottom: 'var(--bottom-gap)' }}
            >
              <div className="flex items-start gap-2 group/reply">
                <Avatar
                  href={`/${r.author}`}
                  src={r.author_avatar_url}
                  size={24}
                  onClick={(e) => handleProfileClick(e, r.author)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-end gap-2">
                    <Link
                      href={`/${r.author}`}
                      className="text-[13px] font-semibold leading-none text-gray-900 hover:underline"
                      prefetch={false}
                      onClick={(e) => handleProfileClick(e, r.author)}
                    >
                      {r.author}
                    </Link>
                  </div>

                  <CollapsibleText
                    text={r.text}
                    className="text-[13px]"
                    containerClassName="mt-2.5"
                    renderText={renderText}
                  />

                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-600" data-comment-actions>
                    <button onClick={() => onLike(r.id)} className="inline-flex items-center gap-1" aria-label={r.liked_by_me ? 'Убрать лайк' : 'Поставить лайк'}>
                      <span className={['text-sm leading-none select-none', r.liked_by_me ? 'text-red-500' : (r.likes_count > 0 ? 'text-black' : 'text-gray-400')].join(' ')}>♥</span>
                    </button>
                    {r.likes_count > 0 && (
                      <button type="button" className="tabular-nums hover:underline" title="Кто оценил" onClick={() => onShowLikers(r.id)}>
                        {r.likes_count}
                      </button>
                    )}

                    <button type="button" className="hover:underline" onClick={() => onReply(r.author)}>
                      Ответить
                    </button>

                    {(() => {
                      const canReport = !!(me && me !== r.author);
                      const canDelete = (me === r.author) || canPostAuthorDelete;
                      if (!canReport && !canDelete) return null;
                      return (
                        <MoreButton
                          scope="reply"
                          onClick={() => setSheet({
                            open: true,
                            onReport: canReport ? () => onReport(r.id) : undefined,
                            onDelete: canDelete ? () => onDelete(r.id) : undefined,
                          })}
                        />
                      );
                    })()}

                    <span className="ml-auto text-[12px] leading-none text-gray-500/40 whitespace-nowrap">
                      {dateOnly(r.created_at)}
                    </span>
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
                setVisible(v => {
                  if (v <= 1 && lastMyIdx >= 0) {
                    // первый клик — раскрыть сразу до моего последнего ответа
                    return lastMyIdx + 1;
                  }
                  return v + nextStep;
                });
              }}
              className="hover:underline"
            >
              {visible <= 1
                ? `Показать остальные ${remaining} ответов`
                : `Показать следующие ${nextStep} ответов`}
            </button>
          )}
          {total > 1 && visible > 1 && (
            <button onClick={collapseRepliesWithoutJump} className="hover:underline">
              Свернуть ответы
            </button>
          )}

        </div>
      )}
      <CommentActionSheet
        open={sheet.open}
        canReport={!!sheet.onReport}
        canDelete={!!sheet.onDelete}
        onClose={() => setSheet({ open: false })}
        onReport={sheet.onReport}
        onDelete={sheet.onDelete}
      />
    </div>
  );
}






// ↑ рядом с import'ами (после react hooks)
function useAutoRowsTextarea(
  ref: React.RefObject<HTMLTextAreaElement | null>, // ← вот так
  linesMin = 1,
  linesMax = 3
) {
  const resize = useCallback(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const cs = window.getComputedStyle(ta);
    const lh = parseFloat(cs.lineHeight || '20');         // запас
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const brdY = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const minH = lh * linesMin + padY + brdY;
    const maxH = lh * linesMax + padY + brdY;
    const next = Math.min(maxH, Math.max(minH, ta.scrollHeight));
    ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > maxH ? 'auto' : 'hidden';
  }, [ref, linesMin, linesMax]);

  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(ta);
    window.addEventListener('resize', resize);
    return () => { ro.disconnect(); window.removeEventListener('resize', resize); };
  }, [ref, resize]);

  return resize;
}


function IconHeart({ filled }: { filled: boolean }) {
  return filled ? (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 21s-6.716-4.35-9.333-7.2C.778 11.87 1.2 8.8 3.6 7.2 6 5.6 8.4 6.4 12 9.2c3.6-2.8 6-3.6 8.4-2 2.4 1.6 2.822 4.67.933 6.6C18.716 16.65 12 21 12 21z" fill="currentColor" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path d="M20.84 4.61c-1.54-1.28-3.77-1.28-5.31 0L12 7.09 8.47 4.61c-1.54-1.28-3.77-1.28-5.31 0-1.73 1.44-1.9 4.02-.39 5.64C5.12 13 12 19 12 19s6.88-6 9.23-8.75c1.51-1.62 1.34-4.2-.39-5.64z" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}



function IconShare() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 16V4m0 0l-4 4m4-4l4 4" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
function IconArrowUp() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 5v14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 11l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconComment() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path d="M21 12a8 8 0 1 1-3.3-6.5L21 6v6z" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="9" cy="11.5" r="0.8" fill="currentColor" />
      <circle cx="12" cy="11.5" r="0.8" fill="currentColor" />
      <circle cx="15" cy="11.5" r="0.8" fill="currentColor" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}







function Avatar({
  href, src, size = 32, alt = '', onClick,
}: { href: string; src?: string | null; size?: number; alt?: string; onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void }) {
  const fallback = (process.env.NEXT_PUBLIC_BASE_PATH || '') + '/avatars/question3.jpg';
  const finalSrc = absUrl(src || '') || src || fallback;
  return (
    <Link href={href} className="shrink-0" prefetch={false} onClick={onClick}>
      <SmartImage
        src={finalSrc}
        alt={alt}
        width={size}
        height={size}
        className="rounded-full border object-cover"
        sizes={`${size}px`}
      />
    </Link>
  );
}

const MENTION_RE = /@([a-z0-9_]{1,50})/gi;
function renderWithMentions(text: string) {
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


function ConfirmDeletePostModal({ open, onClose, onConfirm, busy = false }: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next && !busy) onClose(); }}
    >
      <DialogPortal>
        {/* общий контейнер — создаём новый «этаж» поверх остального UI */}
        <div className="fixed inset-0 z-[60000]">
          {/* фон диалога: ЧУТЬ ниже контента */}
          <DialogOverlay className="fixed inset-0 bg-black/40 z-[60000]" />

          {/* карточка подтверждения: ВСЕГДА выше оверлея */}
          <DialogPrimitive.Content
            aria-describedby="delete-post-desc"
            className={[
              "fixed z-[60001] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
              "max-w-sm w-full bg-white rounded-xl p-6 shadow-lg",
              "focus:outline-none",
            ].join(" ")}
            onInteractOutside={(e) => { if (busy) e.preventDefault(); }}
            onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
          >
            <DialogPrimitive.Title className="sr-only">Подтверждение удаления поста</DialogPrimitive.Title>
            <DialogPrimitive.Description id="delete-post-desc" className="sr-only">
              Окно подтверждения удаления поста.
            </DialogPrimitive.Description>

            <h3 className="text-base font-semibold mb-2">Удалить пост?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Это действие необратимо. Пост и все его комментарии будут удалены.
            </p>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="text-sm text-gray-600 hover:text-black disabled:opacity-50"
                onClick={onClose}
                disabled={busy}
              >
                Отмена
              </button>
              <button
                type="button"
                className="text-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                onClick={onConfirm}
                disabled={busy}
              >
                {busy ? 'Удаляем…' : 'Да, удалить'}
              </button>
            </div>
          </DialogPrimitive.Content>
        </div>
      </DialogPortal>
    </Dialog>
  );
}


// Простая модалка подтверждения (как на странице кэмпа)
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
      if ((e.key === 'Enter' || e.key === 'NumpadEnter') && !busy) { e.preventDefault(); void handleConfirm(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy]);

  if (!open) return null;
  const handleConfirm = async () => { try { setBusy(true); await onConfirm(); onCancel(); } finally { setBusy(false); } };
  const node = (
    <div className="fixed inset-0 z-[50000] bg-black/40 flex items-center justify-center px-4"
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

type CampRefLike = {
  camp_url?: string | null;
  camp_owner_username?: string | null;
  camp_number?: string | number | null;
  camp_slug?: string | number | null;
  camp_public_key?: string | number | null;
  camp_id?: number | null;
} | null | undefined;

// Утилита: аккуратно превращаем string | number | null | undefined → string | undefined
function toMaybeString(v: string | number | null | undefined): string | undefined {
  if (typeof v === 'string' && v.trim() !== '') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
}

// Локальный хелпер для сборки ссылки на кэмп.
// ВАЖНО: сначала используем camp_number, затем slug, и только потом public_key —
// чтобы не получать «неправильную» ссылку сразу после сохранения.
function campPathFrom(
  owner?: string,
  opts?: { camp_number?: string; slug?: string; public_key?: string }
): string | undefined {
  if (!owner) return undefined;
  if (opts?.camp_number) return `/${owner}/camp/${opts.camp_number}`;
  if (opts?.slug) return `/${owner}/camp/${opts.slug}`;
  if (opts?.public_key) return `/${owner}/camp/${opts.public_key}`;
  return undefined;
}

function campHrefFromPost(p: CampRefLike): string {
  if (!p) return '';

  // camp_url может быть null — отфильтруем
  const direct = (typeof p.camp_url === 'string' && p.camp_url.trim()) ? p.camp_url : undefined;

  // Нормализуем всё к строкам (или undefined)
  const owner = toMaybeString(p.camp_owner_username);
  // Не подставляем public_key в camp_number — это ломало ссылку сразу после сохранения
  const numberLike = toMaybeString(p.camp_number);
  const slug = toMaybeString(p.camp_slug);
  const publicKey = toMaybeString(p.camp_public_key);

  const path = campPathFrom(owner, {
    camp_number: numberLike,
    slug,
    public_key: publicKey,
  });

  return direct ?? path ?? '';
}

// эффект для подтягивания правильной ссылки будет внутри PostDesktopPage


function PostDesktopPage({ username, postId, initialPost }: PostPageClientProps) {

  const RIGHT_W = 420;   // ширина правой колонки в обычном режиме
  //const GUTTER  = 28;
  const router = useRouter();
  const overlayEnv = useOverlayEnvironment();
  const openSearchOverlay = useSearchOverlay();
  const openCampOverlay = useCampOverlay();

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Версия выбирается на уровне middleware (UA), здесь редиректов нет


  const [rootSheet, setRootSheet] = useState<{ open: boolean; onReport?: () => void | Promise<void>; onDelete?: () => void | Promise<void> }>({ open: false });

  const API_BASE = getBrowserApiBase();

  const [post, setPost] = useState<PostFull | null>(initialPost ?? null);
  const [loading, setLoading] = useState(!initialPost);
  const [error, setError] = useState<string | null>(null);

  const campHref = campHrefFromPost(post);

  const locationForSearch = useMemo(() => (post?.location_name ?? '').trim(), [post?.location_name]);
  const locationCoords = useMemo(() => {
    const toNum = (v: unknown): number | null => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string' && v.trim()) {
        const n = Number(v.trim());
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };
    const pick = (lat?: unknown, lng?: unknown) => {
      const a = toNum(lat); const b = toNum(lng);
      return a != null && b != null ? { lat: a, lng: b } : null;
    };
    return pick(post?.latitude, post?.longitude) ?? pick(post?.camp_latitude, post?.camp_longitude);
  }, [post?.latitude, post?.longitude, post?.camp_latitude, post?.camp_longitude]);
  const locationSearchTarget = useMemo(() => {
    const fromServer = normalizePhotoSearchUrlFromServer(post?.location_search_url);
    if (fromServer) return fromServer;
    if (!locationForSearch) return null;
    return buildPhotoSearchUrl({
      location: locationForSearch,
      latitude: locationCoords?.lat,
      longitude: locationCoords?.lng,
    });
  }, [locationCoords?.lat, locationCoords?.lng, locationForSearch, post?.location_search_url]);
  const hasPhotos = (post?.images?.length ?? 0) > 0;
  const appendCollapsed = useCallback((input: string) => {
    try {
      const url = new URL(input, 'https://navumi.app');
      url.searchParams.set('collapsed', '1');
      return url.pathname + url.search + url.hash;
    } catch {
      const glue = input.includes('?') ? '&' : '?';
      return `${input}${glue}collapsed=1`;
    }
  }, []);

  const goToPhotoLocationSearch = useCallback(() => {
    if (!locationForSearch) return;
    try { rememberReturn('post'); } catch { /* noop */ }
    try {
      if (typeof window !== 'undefined') console.debug('[ProfilePostDesktop] goToPhotoLocationSearch', { locationForSearch, target: locationSearchTarget });
    } catch { /* noop */ }
    if (hasPhotos) {
      if (!locationSearchTarget) return;
      openSearchOverlay(appendCollapsed(locationSearchTarget));
      return;
    }
    const params = new URLSearchParams();
    params.set('tab', 'articles');
    params.set('collapsed', '1');
    params.set('location', locationForSearch);
    if (locationCoords?.lat != null && locationCoords?.lng != null) {
      params.set('latitude', String(locationCoords.lat));
      params.set('longitude', String(locationCoords.lng));
    }
    openSearchOverlay(params);
  }, [locationForSearch, locationSearchTarget, openSearchOverlay, hasPhotos, locationCoords?.lat, locationCoords?.lng, appendCollapsed]);

  const goToPhotoFilter = useCallback((key: 'activities' | 'hashtags', id?: number | string, name?: string) => {
    try { rememberReturn('post'); } catch { /* noop */ }
    const p = new URLSearchParams();
    p.set('tab', hasPhotos ? PHOTO_SEARCH_TAB_PARAM : 'articles');
    p.set('collapsed', '1');
    if (key === 'activities' && id != null) {
      p.append('activities', String(id));
    } else if (key === 'hashtags' && id != null) {
      p.append('hashtags', String(id));
    } else if (name) {
      p.set('query', name.replace(/^#/, ''));
    }
    openSearchOverlay(p);
  }, [openSearchOverlay, hasPhotos]);
  const handleProfileClick = useProfileNav();

  const handleCampClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!post) return;
    if (overlayEnv.isOverlay) {
      event.preventDefault();
      openCampOverlay({
        username: post.camp_owner_username || undefined,
        campPath: campHref || undefined,
        campId: post.camp_id ?? null,
      });
      return;
    }
    try {
      rememberReturn('camp');
    } catch {
      /* noop */
    }
  }, [overlayEnv.isOverlay, openCampOverlay, post, campHref]);

  // кто залогинен (для сортировок/меню)
  const [me, setMe] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/check-auth/`, { credentials: 'include', cache: 'no-store' });
        if (!r.ok) { if (!cancelled) setMe(null); return; }
        const j = await r.json();
        const u = j?.profile?.username as string | undefined;
        if (!cancelled) setMe(u ?? null);
      } catch { if (!cancelled) setMe(null); }
    })();
    return () => { cancelled = true; };
  }, [API_BASE]);

  // После сохранения поста сервер может не прислать camp_url (и даже slug/number).
  // Дотягиваем детали по camp_id (владелец может быть неизвестен на этом шаге).
  useEffect(() => {
    const owner = post?.camp_owner_username || undefined;
    const id = post?.camp_id || undefined;
    const hasUrl = typeof post?.camp_url === 'string' && !!post?.camp_url?.trim();
    if (!id || hasUrl) return;

    let cancelled = false;
    (async () => {
      const endpoints = owner
        ? [
          `${API_BASE}/api/clubs/${encodeURIComponent(owner)}/camps/${id}/`,
          `${API_BASE}/api/camps/${id}/`,
        ]
        : [
          `${API_BASE}/api/camps/${id}/`,
        ];
      for (const ep of endpoints) {
        try {
          const r = await fetch(ep, { credentials: 'include', cache: 'no-store' });
          if (!r.ok) continue;
          const d = await r.json();
          const owner2 = (d?.owner_username as string | undefined)
            ?? (d?.club_username as string | undefined)
            ?? owner;
          const numberLike = toMaybeString((d?.camp_number as string | number | undefined) ?? (d?.number as string | number | undefined));
          const slug = toMaybeString(d?.slug as string | undefined);
          const publicKey = toMaybeString((d?.public_key as string | number | undefined) ?? (d?.key as string | number | undefined) ?? (d?.pk as string | number | undefined));
          const url = campPathFrom(owner2, { camp_number: numberLike, slug, public_key: publicKey });
          // Попробуем вытащить координаты кэмпа (если есть) — пригодится для перехода в поиск
          const toNum = (v: unknown): number | null => {
            if (typeof v === 'number' && Number.isFinite(v)) return v;
            if (typeof v === 'string' && v.trim()) { const n = Number(v.trim()); return Number.isFinite(n) ? n : null; }
            return null;
          };
          const campLat = toNum((d?.latitude as unknown) ?? (d?.lat as unknown));
          const campLng = toNum((d?.longitude as unknown) ?? (d?.lng as unknown));

          if (!cancelled) {
            setPost((prev: PostFull | null) => (prev ? {
              ...prev,
              camp_url: url || prev.camp_url,
              camp_owner_username: owner2 ?? prev.camp_owner_username,
              camp_slug: slug ?? prev.camp_slug,
              camp_public_key: publicKey ?? prev.camp_public_key,
              camp_latitude: prev.camp_latitude ?? campLat ?? null,
              camp_longitude: prev.camp_longitude ?? campLng ?? null,
            } : prev));
          }
          if (url) {
            return;
          }
        } catch { /* ignore and try next endpoint */ }
      }
    })();

    return () => { cancelled = true; };
  }, [post?.camp_id, post?.camp_owner_username, post?.camp_url, API_BASE]);


  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [editOpen, setEditOpen] = useState(false);


  const [reportPostOpen, setReportPostOpen] = useState(false);
  const [confirmUntagOpen, setConfirmUntagOpen] = useState(false);
  const [reportCommentId, setReportCommentId] = useState<number | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);

  const shareCurrentPost = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const origin = window.location.origin.replace(/\/+$/, '');
    const slug = (username || '').replace(/^@+/, '').trim();
    const path = slug ? `/${slug}/post/${postId}` : `/post/${postId}`;
    const url = origin + path;
    try {
      if (navigator.share) {
        await navigator.share({ url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        window.prompt('Скопируйте ссылку:', url);
      }
    } catch {
      // ignore share errors
    }
  }, [postId, username]);

  const isAuthor = !!(me && post?.author?.username && me === post.author.username);

  // Форматирование счётчиков: 99+
  const cap99 = (n: number | null | undefined): string => {
    const num = typeof n === 'number' && Number.isFinite(n) ? n : 0;
    return num >= 100 ? '99+' : String(num);
  };

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };

    const listenerOptions: AddEventListenerOptions = { capture: true };

    if (menuOpen) document.addEventListener('click', onDocClick, listenerOptions);
    return () => document.removeEventListener('click', onDocClick, listenerOptions);
  }, [menuOpen]);



  async function handleDeletePost() {
    if (!post || deleting) return;

    setDeleting(true);
    try {
      const r = await fetch(`${API_BASE}/api/posts/${post.id}/delete/`, {
        method: 'POST',
        credentials: 'include',
      });

      if (r.status === 403) throw new Error('У вас нет прав удалять этот пост');

      if (r.status === 404) {
        // уже удалён/не найден — просто закрываем
        setConfirmDeleteOpen(false);
        closeModal();
        return;
      }

      if (!r.ok) {
        let msg = 'Не удалось удалить пост';
        try {
          const j = await r.json();
          if (j?.error) msg = j.error;
        } catch { }
        throw new Error(msg);
      }

      // успех — закрываем модалку подтверждения и уходим со страницы
      setConfirmDeleteOpen(false);
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('profile_post_deleted', {
              detail: { id: post.id },
            }),
          );
        }
      } catch {
        /* noop */
      }
      closeModal();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не удалось удалить пост');
    } finally {
      setDeleting(false);
    }
  }


  const [deleting, setDeleting] = useState(false);

  const postIdNum = Number(postId);
  const isValidPostId = Number.isInteger(postIdNum) && postIdNum > 0;

  useEffect(() => {
    if (!isValidPostId) { setError('Некорректный id поста'); setLoading(false); return; }

    const initialId = initialPost ? String(initialPost.id) : null;
    if (initialId && String(postIdNum) === initialId) {
      setPost(initialPost ?? null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`${API_BASE}/api/posts/${postIdNum}/`, { credentials: 'include', cache: 'no-store' });

        // подстрахуемся от HTML 404
        const ct = r.headers.get('content-type') || '';
        if (!r.ok) {
          if (r.status === 404 || r.status === 403) {
            throw new Error('Контент не найден');
          }
          const text = ct.includes('application/json') ? JSON.stringify(await r.json()).slice(0, 300)
            : (await r.text()).slice(0, 300);
          throw new Error(text || 'Контент не найден');
        }
        if (!ct.includes('application/json')) throw new Error('Неверный ответ сервера');

        const j: PostFull = await r.json();
        if (!cancelled) { setPost(j); setActiveIdx(0); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [API_BASE, isValidPostId, postIdNum, initialPost]);


  const [activeIdx, setActiveIdx] = useState(0);


  const dateOnly = (s?: string | null) =>
    s ? new Date(s).toLocaleDateString('ru-RU') : '';


  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentErr, setCommentErr] = useState<string | null>(null);


  const [limitHit, setLimitHit] = useState(false);
  const limitTimerRef = useRef<number | null>(null);

  const pingLimit = useCallback(() => {
    setLimitHit(true);
    if (limitTimerRef.current) window.clearTimeout(limitTimerRef.current);
    limitTimerRef.current = window.setTimeout(() => setLimitHit(false), 1800);
  }, []);

  useEffect(() => {
    return () => { if (limitTimerRef.current) window.clearTimeout(limitTimerRef.current); };
  }, []);



  const [profilesOpen, setProfilesOpen] = useState(false);
  const profilesCount = (post?.profiles_count ?? post?.profiles?.length ?? 0);
  const openProfiles = () => { if (profilesCount > 0) setProfilesOpen(true); };
  const closeProfiles = () => setProfilesOpen(false);

  const [readingMode, setReadingMode] = useState(false);



  // Гейт: незалогиненные — модалка «Войти»
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

  // Лайкнувшие (модалка «Оценили»): теперь используем engagement-эндпоинт
  type SimpleUser = { id?: number; username: string; avatar: string | null };
  const [likersOpen, setLikersOpen] = useState(false);
  const [likers, setLikers] = useState<SimpleUser[] | null>(null);
  const [likersErr, setLikersErr] = useState<string | null>(null);
  const [likersLoading, setLikersLoading] = useState(false);
  const [likersTitle, setLikersTitle] = useState<string>('Оценили');
  const engagementCacheRef = useRef<{ json: unknown | null; byComment: Record<number, SimpleUser[]>; post: SimpleUser[]; totalComments?: number | null } | null>(null);

  const API_ORIGIN = useMemo(() => getBrowserApiBase().replace(/\/+$/, ''), []);

  // Навигация на профиль см. глобальный helper goToProfile(uname)

  // CSRF utils (локально, как в CampFeedTabs*)
  function readCookie(name: string) {
    const re = new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)');
    const m = typeof document !== 'undefined' ? document.cookie.match(re) : null;
    return m ? decodeURIComponent(m[1]) : '';
  }
  function getCsrf() { return readCookie('csrftoken'); }
  let csrfPromise: Promise<void> | null = null;
  async function ensureCsrf() {
    if (getCsrf()) return;
    if (!API_ORIGIN) return;
    if (!csrfPromise) {
      csrfPromise = fetch(`${API_ORIGIN}/api/csrf/`, { credentials: 'include' })
        .then(() => { })
        .finally(() => { csrfPromise = null; });
    }
    await csrfPromise;
  }

  const normalizeUsers = useCallback((j: unknown): SimpleUser[] => {
    type UnknownRecord = Record<string, unknown>;
    const root = (j ?? {}) as UnknownRecord;

    const arr: unknown[] = Array.isArray(j)
      ? (j as unknown[])
      : Array.isArray(root.results as unknown[])
        ? ((root.results as unknown[]))
        : Array.isArray(root.users as unknown[])
          ? ((root.users as unknown[]))
          : Array.isArray(root.likers as unknown[])
            ? ((root.likers as unknown[]))
            : Array.isArray(root.data as unknown[])
              ? ((root.data as unknown[]))
              : Array.isArray((root as UnknownRecord)['likes'] as unknown[])
                ? (((root as UnknownRecord)['likes'] as unknown[]))
                : Array.isArray((root as UnknownRecord)['items'] as unknown[])
                  ? (((root as UnknownRecord)['items'] as unknown[]))
                  : Array.isArray((root as UnknownRecord)['list'] as unknown[])
                    ? (((root as UnknownRecord)['list'] as unknown[]))
                    : Array.isArray((root as UnknownRecord)['objects'] as unknown[])
                      ? (((root as UnknownRecord)['objects'] as unknown[]))
                      : [];

    const getStringProp = (o?: UnknownRecord | null, k?: string) => {
      if (!o || !k) return undefined;
      const v = o[k];
      return typeof v === 'string' ? v : undefined;
    };
    const getNumberProp = (o?: UnknownRecord | null, k?: string) => {
      if (!o || !k) return undefined;
      const v = o[k];
      return typeof v === 'number' ? v : undefined;
    };
    const firstNested = (
      o: UnknownRecord,
      keys: string[] = ['user', 'author', 'profile', 'owner', 'liker', 'account', 'actor']
    ): UnknownRecord | null => {
      for (const key of keys) {
        const v = o[key];
        if (v && typeof v === 'object') return v as UnknownRecord;
      }
      return null;
    };
    const usernameFrom = (o?: UnknownRecord | null) => {
      if (!o) return undefined;
      const keys = [
        'username', 'login', 'nick', 'name', 'handle',
        'user', 'author', 'liker', 'account', 'profile', 'owner',
        'author_username', 'user_username', 'profile_username'
      ];
      for (const k of keys) {
        const v = o[k];
        if (typeof v === 'string' && v.trim()) return v.replace(/^@+/, '').trim();
      }
      return undefined;
    };
    const absUrl = (url?: string | null): string | null => {
      if (!url) return null;
      const s = String(url).trim();
      if (!s) return null;
      if (/^(https?:)?\/\//i.test(s) || s.startsWith('data:') || s.startsWith('blob:')) return s;
      return s.startsWith('/') ? `${API_ORIGIN}${s}` : `${API_ORIGIN}/${s}`;
    };
    const avatarFrom = (o?: UnknownRecord | null) => {
      const raw = (
        getStringProp(o, 'avatar')
        || getStringProp(o, 'avatar_url')
        || getStringProp(o, 'profile_picture')
        || getStringProp(o, 'photo')
        || getStringProp(o, 'photo_url')
        || getStringProp(o, 'image')
        || getStringProp(o, 'picture')
        || getStringProp(o, 'author_avatar')
        || getStringProp(o, 'author_avatar_url')
        || getStringProp(o, 'user_avatar')
        || getStringProp(o, 'user_avatar_url')
        || getStringProp(o, 'liker_avatar')
        || getStringProp(o, 'liker_avatar_url')
        || getStringProp(o, 'profile_avatar')
        || getStringProp(o, 'profile_avatar_url')
        || getStringProp(o, 'avatar_small')
        || getStringProp(o, 'photo_small')
        || null
      );
      return absUrl(raw);
    };

    return arr.map((raw) => {
      if (typeof raw === 'string' && raw.trim()) {
        const uname = raw.replace(/^@+/, '').trim();
        return { id: undefined, username: uname, avatar: null } as SimpleUser;
      }
      const u = raw as UnknownRecord;
      const nested = firstNested(u);
      const id = getNumberProp(u, 'id') ?? getNumberProp(nested ?? undefined, 'id');
      const username = (usernameFrom(u) as string | undefined) || (usernameFrom(nested) as string | undefined) || '';
      const avatar = avatarFrom(u) || avatarFrom(nested) || null;
      return { id, username, avatar } as SimpleUser;
    }).filter(x => !!x.username);
  }, [API_ORIGIN]);

  const extractFromEngagement = useCallback((json: unknown): {
    post: SimpleUser[];
    byComment: Record<number, SimpleUser[]>;
    total: number | null;
  } => {
    const post: SimpleUser[] = [];
    const byComment: Record<number, SimpleUser[]> = {};
    const root = (json ?? {}) as Record<string, unknown>;
    const pickNumber = (o: Record<string, unknown> | null | undefined, keys: string[]): number | null => {
      if (!o) return null;
      for (const k of keys) {
        const v = (o as Record<string, unknown>)[k];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string' && v.trim() && !isNaN(Number(v))) return Number(v);
      }
      return null;
    };

    // post likers: try common keys first
    const postObj: Record<string, unknown> | null =
      typeof root['post'] === 'object' && root['post'] !== null
        ? (root['post'] as Record<string, unknown>)
        : null;
    const postCandidates: unknown[] = [
      (root['post_likers']),
      (root['post_likes']),
      (root['liked_by']),
      (postObj ? postObj['likers'] : undefined),
      (postObj ? postObj['likes'] : undefined),
    ].filter(Boolean);
    for (const val of postCandidates) {
      const arr = normalizeUsers(val);
      if (arr.length) { post.splice(0, post.length, ...arr); break; }
    }

    // comments/replies likers: поддерживаем оба формата —
    // 1) object-map: { "11": [...], "12": [...] }
    // 2) array: [{comment_id|reply_id|id, likers|liked_by|likes|users: [...]}, ...]
    const cmLikesCandidates: unknown[] = [
      root['comment_likers'],
      root['comments_likers'],
      root['likes_by_comment'],
      root['comment_likes'],
      // возможные ключи для ответов
      root['reply_likers'],
      root['replies_likers'],
      root['likes_by_reply'],
      root['reply_likes'],
      root['replies_likes'],
      root['comment_replies_likers'],
    ].filter(Boolean);

    for (const cand of cmLikesCandidates) {
      if (!cand || typeof cand !== 'object') continue;

      if (Array.isArray(cand)) {
        for (const it of cand as unknown[]) {
          const o = (it ?? {}) as Record<string, unknown>;
          const id =
            (typeof o['comment_id'] === 'number' ? (o['comment_id'] as number) :
              typeof o['reply_id'] === 'number' ? (o['reply_id'] as number) :
                typeof o['id'] === 'number' ? (o['id'] as number) : null);
          if (!id) continue;
          const users = (o['likers'] ?? o['liked_by'] ?? o['likes'] ?? o['users']) as unknown;
          const arr = normalizeUsers(users);
          if (arr.length) byComment[id] = arr;
        }
      } else {
        for (const [k, v] of Object.entries(cand as Record<string, unknown>)) {
          const id = Number(k);
          if (!Number.isFinite(id)) continue;
          const arr = normalizeUsers(v);
          if (arr.length) byComment[id] = arr;
        }
      }
    }

    // Фоллбек: список элементов comments/replies с вложенными пользователями
    const listObj = (root['comments'] || root['replies'] || root['comment_items'] || root['comment_details']) as unknown;
    if (Array.isArray(listObj)) {
      for (const it of listObj as unknown[]) {
        const o = (it ?? {}) as Record<string, unknown>;
        const id = typeof o.id === 'number' ? o.id
          : typeof (o['comment_id']) === 'number' ? (o['comment_id'] as number)
            : typeof (o['reply_id']) === 'number' ? (o['reply_id'] as number)
              : undefined;
        if (!id) continue;
        const users = (o['likers'] ?? o['liked_by'] ?? o['likes'] ?? o['users']) as unknown;
        const arr = normalizeUsers(users);
        if (arr.length) byComment[id] = arr;
      }
    }

    // total comments (roots + replies)
    const postObj2: Record<string, unknown> | null =
      typeof root['post'] === 'object' && root['post'] !== null ? (root['post'] as Record<string, unknown>) : null;
    const total =
      pickNumber(root, ['total_comments', 'comments_total', 'comments_count', 'comments'])
      ?? pickNumber(postObj2, ['total_comments', 'comments_total', 'comments_count', 'comments'])
      ?? null;

    return { post, byComment, total };
  }, [normalizeUsers]);

  const ensureEngagementLoaded = useCallback(async (): Promise<{ post: SimpleUser[]; byComment: Record<number, SimpleUser[]>; total: number | null } | null> => {
    if (!post || !API_ORIGIN) return null;
    if (engagementCacheRef.current?.json) {
      return { post: engagementCacheRef.current.post, byComment: engagementCacheRef.current.byComment, total: engagementCacheRef.current.totalComments ?? null };
    }
    try {
      const url = `${API_ORIGIN}/api/posts/${post.id}/engagement/`;
      let r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!r.ok && (r.status === 401 || r.status === 403)) {
        r = await fetch(url, { credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } });
      }
      if (!r.ok) throw new Error('failed');
      const j = await r.json();
      const pack = extractFromEngagement(j);
      engagementCacheRef.current = { json: j, byComment: pack.byComment, post: pack.post, totalComments: pack.total };
      return pack;
    } catch {
      return null;
    }
  }, [API_ORIGIN, post, extractFromEngagement]);

  // Всегда перезагружает engagement с сервера и обновляет кэш
  const refreshEngagement = useCallback(async (): Promise<{ post: SimpleUser[]; byComment: Record<number, SimpleUser[]>; total: number | null } | null> => {
    if (!post || !API_ORIGIN) return null;
    try {
      const url = `${API_ORIGIN}/api/posts/${post.id}/engagement/`;
      let r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!r.ok && (r.status === 401 || r.status === 403)) {
        r = await fetch(url, { credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } });
      }
      if (!r.ok) throw new Error('failed');
      const j = await r.json();
      const pack = extractFromEngagement(j);
      engagementCacheRef.current = { json: j, byComment: pack.byComment, post: pack.post, totalComments: pack.total };
      return pack;
    } catch {
      return null;
    }
  }, [API_ORIGIN, post, extractFromEngagement]);

  // Используем engagement для раннего точного счёта комментариев (корневые + ответы)
  const [engagementCommentsTotal, setEngagementCommentsTotal] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pack = await ensureEngagementLoaded();
      if (!cancelled) setEngagementCommentsTotal(pack?.total ?? null);
    })();
    return () => { cancelled = true; };
  }, [ensureEngagementLoaded, post?.id]);

  // Открыть модалку «Оценили» для поста — как раньше (engagement → прямые ручки), но с принудительным обновлением engagement
  const openLikers = useCallback(async () => {
    if (!post) return;
    setLikersOpen(true);
    setLikersErr(null);
    setLikers(null);
    setLikersTitle('Оценили');
    setLikersLoading(true);

    // 1) принудительно обновляем engagement и используем его
    const pack = await refreshEngagement();
    if (pack && pack.post.length) {
      setLikers(pack.post);
      setLikersLoading(false);
      return;
    }

    // 2) фоллбэки на прежние ручки
    const API = API_ORIGIN;
    if (!API) { setLikers([]); setLikersLoading(false); return; }
    const pid = post.id;
    const urls = [
      `${API}/api/posts/${pid}/likers/`,
      `${API}/api/posts/${pid}/likes/`,
      `${API}/api/posts/${pid}/liked-by/`,
      `${API}/api/post/${pid}/likers/`,
      `${API}/api/post/${pid}/likes/`,
      `${API}/api/posts/${pid}/likes/list/`,
      `${API}/api/likes/?target_type=post&target_id=${pid}`,
      `${API}/api/likes/?post=${pid}`,
    ];
    try {
      let loaded: SimpleUser[] | null = null;
      for (const u of urls) {
        try {
          let r = await fetch(u, { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } });
          if (!r.ok && (r.status === 401 || r.status === 403)) {
            r = await fetch(u, { credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } });
          }
          if (r.ok) {
            const j = await r.json();
            const norm = normalizeUsers(j);
            if (norm.length) { loaded = norm; break; }
          }
        } catch { }
      }
      setLikers(loaded ?? []);
    } catch {
      setLikersErr('Не удалось загрузить список');
      setLikers([]);
    } finally {
      setLikersLoading(false);
    }
  }, [post, API_ORIGIN, refreshEngagement, normalizeUsers]);

  // Открыть модалку «Оценили» для комментария/ответа — как раньше (engagement → прямые ручки), но обновляем engagement
  const openCommentLikers = useCallback(async (commentId: number) => {
    setLikersOpen(true);
    setLikersErr(null);
    setLikers(null);
    setLikersTitle('Оценили комментарий');
    setLikersLoading(true);

    // 1) принудительно обновляем engagement и пробуем из него
    const pack = await refreshEngagement();
    const fromFresh = pack?.byComment?.[commentId] ?? engagementCacheRef.current?.byComment?.[commentId];
    if (fromFresh && fromFresh.length) {
      setLikers(fromFresh);
      setLikersLoading(false);
      return;
    }

    // 2) прямые ручки (как фоллбэк)
    try {
      const API = API_ORIGIN;
      const urls = [
        `${API}/api/comments/${commentId}/likers/`,
        `${API}/api/comments/${commentId}/likes/`,
        `${API}/api/comments/${commentId}/liked-by/`,
        `${API}/api/likes/?target_type=comment&target_id=${commentId}`,
        `${API}/api/posts/comments/${commentId}/likers/`,
        `${API}/api/posts/comments/${commentId}/likes/`,
        `${API}/api/posts/comments/${commentId}/liked-by/`,
      ];
      let loaded: SimpleUser[] | null = null;
      for (const u of urls) {
        try {
          let r = await fetch(u, { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } });
          if (!r.ok && (r.status === 401 || r.status === 403)) {
            r = await fetch(u, { credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } });
          }
          if (r.ok) {
            const j = await r.json();
            const norm = normalizeUsers(j);
            loaded = norm;
            break;
          }
        } catch { }
      }
      setLikers(loaded ?? []);
    } catch {
      setLikersErr('Не удалось загрузить список');
      setLikers([]);
    } finally {
      setLikersLoading(false);
    }
  }, [API_ORIGIN, refreshEngagement, normalizeUsers]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLikersOpen(false); };
    if (likersOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [likersOpen]);

  // Открыть модалку для поста
  function openReportPost() {
    if (!me) { setLoginRequiredOpen(true); return; }
    if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
    setReportPostOpen(true);
  }

  // Открыть модалку для комментария
  function openReportComment(id: number) {
    if (!me) { setLoginRequiredOpen(true); return; }
    if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
    setReportCommentId(id);
  }






  // цель для ответа (rootId и username, как в кэмпе)
  const [replyTarget, setReplyTarget] = useState<null | { rootId: number; username: string }>(null);


  // твой comments: PostComment[] (как у тебя сейчас)
  const roots = useMemo(() => buildTree(comments as PostComment[]), [comments]);

  // Базовый порядок по правилам (как в кэмпе)
  const defaultOrderedRoots = useMemo(() => {
    if (me === undefined) return roots;                // ещё не знаем «кто я»
    if (!me) return roots.slice().sort(cmpMainOthers); // гость

    const mine = roots.filter(r => r.author === me).slice().sort(cmpMainMine);

    const withMyReplies = roots
      .filter(r => r.author !== me)
      .map(r => ({ r, t: lastMyReplyAt(r, me) }))
      .filter(x => x.t !== null)
      .sort((a, b) => (b.t! - a.t!))
      .map(x => x.r);

    const restIds = new Set([...mine, ...withMyReplies].map(r => r.id));
    const rest = roots.filter(r => !restIds.has(r.id)).slice().sort(cmpMainOthers);

    return [...mine, ...withMyReplies, ...rest];
  }, [roots, me]);

  // Фиксируем порядок корней до перезагрузки/перезагрузки списка
  const [rootOrder, setRootOrder] = useState<number[] | null>(null);

  // Инициализация/синхронизация порядка: добавляем новые id в конец, удалённые — убираем
  useEffect(() => {
    const ids = defaultOrderedRoots.map(r => r.id);
    setRootOrder(prev => {
      if (!prev) return ids;
      const existing = prev.filter(id => ids.includes(id));
      const newcomers = ids.filter(id => !prev.includes(id));
      const merged = existing.concat(newcomers);
      if (merged.length !== prev.length || merged.some((v, i) => v !== prev[i])) return merged;
      return prev;
    });
  }, [defaultOrderedRoots]);

  const orderedRoots = useMemo(() => {
    if (!rootOrder) return defaultOrderedRoots;
    const pos = new Map<number, number>(rootOrder.map((id, i) => [id, i]));
    const fallbackPos = new Map<number, number>(defaultOrderedRoots.map((r, i) => [r.id, i]));
    return defaultOrderedRoots.slice().sort((a, b) => {
      const ai = pos.has(a.id) ? (pos.get(a.id) as number) : (100000 + (fallbackPos.get(a.id) as number));
      const bi = pos.has(b.id) ? (pos.get(b.id) as number) : (100000 + (fallbackPos.get(b.id) as number));
      return ai - bi;
    });
  }, [rootOrder, defaultOrderedRoots]);

  // Показ/скрытие кнопки «Наверх»: когда первый комментарий ушёл выше вьюпорта
  const [showScrollUp, setShowScrollUp] = useState(false);
  // Когда появляется кнопка «Наверх», прячем выпадающее меню, если оно открыто
  useEffect(() => {
    if (showScrollUp && menuOpen) setMenuOpen(false);
  }, [showScrollUp, menuOpen]);
  const recomputeScrollUp = useCallback(() => {
    const cont = scrollRef.current;
    if (!cont) { setShowScrollUp(false); return; }
    const first = orderedRoots[0];
    if (!first) { setShowScrollUp(false); return; }
    const el = document.getElementById(`comment-${first.id}`);
    if (!el) { setShowScrollUp(false); return; }
    const cr = cont.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const EPS = 1; // небольшой гистерезис
    const fullyAbove = er.bottom <= cr.top + EPS;
    setShowScrollUp(fullyAbove);
  }, [orderedRoots]);

  useEffect(() => {
    const cont = scrollRef.current;
    if (!cont) return;
    const onScroll = () => recomputeScrollUp();
    const onResize = () => recomputeScrollUp();
    cont.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    // первичный расчёт
    recomputeScrollUp();
    return () => {
      cont.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [recomputeScrollUp]);

  const scrollToTop = useCallback(() => {
    const cont = scrollRef.current;
    if (!cont) return;
    cont.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const { navigateProfile } = useAppNavigation();

  const renderCommentText = useCallback((text: string): ReactNode => {
    const out: ReactNode[] = [];
    const re = /@([a-z0-9_]{1,50})/gi;
    let last = 0;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(text.slice(last, m.index));
      const uname = m[1];
      const handleClick = (e: React.MouseEvent<HTMLElement>) => {
        const target = (uname || '').replace(/^@+/, '').trim();
        if (!target) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        e.stopPropagation();
        const handled = navigateProfile(e as React.MouseEvent<HTMLElement>, { username: target });
        if (!handled) {
          try {
            e.preventDefault();
          } catch {
            /* noop */
          }
          goToProfile(target);
        }
      };
      out.push(
        <Link
          key={`${m.index}-${uname}`}
          href={`/${uname}`}
          className="text-blue-600 hover:underline"
          onClick={handleClick}
        >
          @{uname}
        </Link>
      );
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }, [navigateProfile]);



  const focusReply = useCallback((rootId: number, usernameRaw: string) => {
    const uname = usernameRaw.replace(/^@+/, '');
    const mention = `@${uname} `;
    setReplyTarget({ rootId, username: uname });
    setCommentText(mention);
    requestAnimationFrame(() => {
      taRef.current?.focus();
      const p = mention.length;
      taRef.current?.setSelectionRange(p, p);
    });
  }, []);


  const cancelReply = useCallback(() => {
    if (replyTarget) {
      // сносим упоминание из начала + пробелы после него
      const re = new RegExp(`^@+${replyTarget.username}\\b\\s*`, 'i');
      setCommentText(t => t.replace(re, ''));
    }
    setReplyTarget(null);
    requestAnimationFrame(() => taRef.current?.focus());
  }, [replyTarget]);






  async function likeComment(id: number) {
    if (!me) { setLoginRequiredOpen(true); return; }
    if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
    try {
      const r = await fetch(`${API_BASE}/api/posts/comments/${id}/like-toggle/`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!r.ok) throw new Error();
      const j = await r.json() as { liked: boolean; likes_count: number };
      setComments(prev => prev.map(c => c.id === id ? { ...c, liked_by_me: j.liked, likes_count: j.likes_count } : c));
    } catch { }
  }

  async function deleteComment(id: number) {
    if (!confirm('Удалить комментарий?')) return;
    // оптимистично уменьшаем счётчик сразу
    setPost(p => (p ? { ...p, comments_count: Math.max(0, (p.comments_count ?? 0) - 1) } : p));
    setCommentDelta((d) => d - 1);

    try {
      const r = await fetch(`${API_BASE}/api/posts/comments/${id}/delete/`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!r.ok) throw new Error();

      const nextCount = await loadComments(); // подтягиваем фактическое
      if (nextCount !== undefined) {
        setPost(p => (p ? { ...p, comments_count: nextCount } : p));
      }
    } catch {
      // если не получилось удалить — откатываем оптимистичное изменение
      setPost(p => (p ? { ...p, comments_count: (p.comments_count ?? 0) + 1 } : p));
      setCommentDelta((d) => d + 1);
    }
  }




  const target = useMemo(
    () => (reportCommentId ? comments.find(c => c.id === reportCommentId) ?? null : null),
    [comments, reportCommentId]
  );

  // ↓ измеряем высоту приклеенного низа, чтобы дать паддинг скроллу
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [bottomH, setBottomH] = useState(0);
  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    const update = () => setBottomH(el.offsetHeight || 0);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, []);


  // textarea: авто-рост до 3 строк
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const resizeTA = useAutoRowsTextarea(taRef, 1, 3);
  useEffect(() => { resizeTA(); }, [commentText, resizeTA]);


  const modalRef = useRef<HTMLDivElement | null>(null);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);


  // Показ/скрытие кнопки «Наверх» — логика добавлена ниже, после вычисления orderedRoots


  // вместо текущего useMemo для images
  const images = useMemo(() => {
    const urlFrom = (s: string) => (
      s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:') || s.startsWith('blob:')
        ? s
        : (s.startsWith('/') ? `${API_BASE}${s}` : `${API_BASE}/${s}`)
    );
    const clean = (arr: unknown[]): string[] => arr
      .map(u => {
        if (typeof u === 'string') return u.trim();
        if (u && typeof u === 'object' && !Array.isArray(u)) {
          const r = u as Record<string, unknown>;
          const cand = r['url'] ?? r['image'] ?? r['src'] ?? r['thumb'] ?? r['thumbnail_url'];
          return typeof cand === 'string' ? cand.trim() : '';
        }
        return '';
      })
      .filter(s => s && s !== 'null' && s !== 'undefined' && s !== 'None' && s !== 'NULL' && s !== 'NONE')
      .map(urlFrom);

    const tryKeys = (rec: Record<string, unknown>, keys: string[]): string[] => {
      for (const k of keys) {
        const v = rec[k];
        if (Array.isArray(v)) {
          const c = clean(v);
          if (c.length) return c;
        }
      }
      return [];
    };

    const singleFrom = (rec: Record<string, unknown>, keys: string[]): string[] => {
      for (const k of keys) {
        const v = rec[k];
        if (typeof v === 'string' && v.trim()) return [urlFrom(v.trim())];
      }
      return [];
    };

    const rec = (post || {}) as Record<string, unknown>;
    let abs: string[] = [];
    // массивы
    abs = tryKeys(rec, ['images', 'photos', 'media', 'attachments']);
    if (!abs.length) abs = singleFrom(rec, ['image', 'photo', 'first_image', 'first_image_url', 'thumbnail_url', 'thumb_url', 'cover', 'preview']);

    dbg('images normalized', { count: abs.length, abs });
    return abs;
  }, [post, API_BASE]);



  // Флаг: список комментариев загружен хотя бы раз (чтобы не считать 0 как «корректное значение»)
  const [commentsFetched, setCommentsFetched] = useState(false);
  // Оптимистичные изменения количества комментов (пока не подтянули список)
  const [commentDelta, setCommentDelta] = useState(0);



  // ПОСЛЕ const images = useMemo(...)

  const isDesktop = useIsDesktop(768);
  const forceReading = !!(isDesktop && post && images.length === 0);

  // В профиле: если пост без изображений (только текст) — сразу открываем в режиме чтения
  useEffect(() => {
    if (!post) return; // не трогаем до загрузки
    const next = isDesktop && images.length === 0;
    dbg('init readingMode after post load', { postId: post.id, imagesLen: images.length, next });
    setReadingMode(next);
  }, [post?.id, isDesktop]);


  useEffect(() => {
    const info = { isDesktop, isProfilePost: !!(post && !post.camp_id), imagesLen: images.length, forceReading, readingMode };
    if (forceReading) {
      dbg('forceReading → setReadingMode(true)', info);
      setReadingMode(true);
    } else {
      dbg('forceReading not applied', info);
    }
  }, [isDesktop, post?.camp_id, images.length, forceReading]);

  // лог текущей раскладки сетки — чтобы видеть, чем реально отрендерилось
  useEffect(() => {
    dbg('grid mode', { mode: (forceReading || readingMode) ? 'reading' : 'gallery' });
  }, [forceReading, readingMode]);

  // // чтобы внутреннее состояние не расходилось с «жёсткой» логикой
  // React.useEffect(() => {
  //   if (forceReading) setReadingMode(true);
  // }, [forceReading]);



  const loadComments = useCallback(async (): Promise<number | undefined> => {
    setCommentsLoading(true);
    setCommentErr(null);
    try {
      const r = await fetch(`${API_BASE}/api/posts/${postIdNum}/comments/list/?with_replies=1&per_page=500`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!r.ok) { setComments([]); return undefined; }
      const j = await r.json();
      const arr = Array.isArray(j?.comments) ? (j.comments as CommentItem[]) : [];
      setComments(arr);
      setCommentDelta(0); // список актуализирован — сбрасываем оптимистичный дельта-счётчик

      // считаем только не удалённые (то, что реально показываем)
      const visibleCount = arr.filter(c => !c.is_deleted).length;
      return visibleCount;
    } catch {
      setComments([]);
      return undefined; // не трогаем счётчик, если не удалось
    } finally {
      setCommentsLoading(false);
      setCommentsFetched(true);
    }
  }, [API_BASE, postIdNum]);


  useEffect(() => {
    if (!isValidPostId) return;
    (async () => {
      const cnt = await loadComments();
      if (cnt !== undefined) {
        setPost(p => (p ? { ...p, comments_count: cnt } : p));
      }
    })().catch(() => { });
  }, [loadComments, isValidPostId]);

  // При любом изменении списка комментариев синхронизируем счётчик в посте
  useEffect(() => {
    const total = comments.reduce((n, c) => n + (c.is_deleted ? 0 : 1), 0);
    setPost(p => (p ? { ...p, comments_count: total } : p));
  }, [comments]);



  // после загрузки comments
  const [hashCommentId, setHashCommentId] = useState<number | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.location.hash.match(/^#comment-(\d+)$/);
    setHashCommentId(m ? Number(m[1]) : null);
  }, [postIdNum]);

  // когда комментарии загружены — проскроллим и подсветим
  useEffect(() => {
    if (!hashCommentId || !comments.length) return;

    // задержка, чтобы DOM успел отрендериться после возможного expandToId
    const t = setTimeout(() => {
      const el = document.getElementById(`comment-${hashCommentId}`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.add('ring-2', 'ring-amber-400', 'bg-amber-50');
        setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400', 'bg-amber-50'), 2400);
      }
    }, 60);

    return () => clearTimeout(t);
  }, [hashCommentId, comments]);



  const closeModal = () => {
    if (overlayEnv.isOverlay) {
      overlayEnv.close();
      return;
    }
    const ctx = consumeReturn('post');
    if (ctx) {
      router.replace(ctx);
      return;
    }
    navigateBack(router, { fallback: '/search' });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
      if (!images.length) return;
      if (e.key === 'ArrowLeft') setActiveIdx((i) => (i - 1 + images.length) % images.length);
      if (e.key === 'ArrowRight') setActiveIdx((i) => (i + 1) % images.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length]); // eslint-disable-line


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setProfilesOpen(false); };
    if (profilesOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [profilesOpen]);

  const toggleLike = async () => {
    if (!post) return;
    if (!me) { setLoginRequiredOpen(true); return; }
    if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
    const prevLiked = !!post.liked;
    const prevCount = post.likes_count ?? 0;
    setPost({ ...post, liked: !prevLiked, likes_count: prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1 });
    try {
      const r = await fetch(`${API_BASE}/api/posts/${post.id}/like-toggle/`, {
        method: 'POST',
        credentials: 'include',
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'Ошибка лайка');
      setPost((p) => (p ? { ...p, liked: !!j?.liked, likes_count: j?.likes_count ?? p.likes_count } : p));
    } catch {
      setPost((p) => (p ? { ...p, liked: prevLiked, likes_count: prevCount } : p));
    }
  };



  // === SWIPE / DRAG логика для левой панели (десктоп) ===
  const [viewportW, setViewportW] = useState(0);
  const vwRef = useRef(0);
  useEffect(() => { vwRef.current = viewportW; }, [viewportW]);
  const log = (...args: unknown[]) => { try { console.debug('[PostDesktopPage]', ...args); } catch { } };

  useEffect(() => {
    const el = leftRef.current;
    if (!el) return;
    const measure = () => {
      // Пытаемся через getBoundingClientRect (иногда точнее)
      const w = Math.round(el.getBoundingClientRect().width) || el.clientWidth || 0;
      if (w === 0 && modalRef.current) {
        // Фолбэк: ширина модалки минус ширина правой колонки
        const modalW = Math.round(modalRef.current.getBoundingClientRect().width) || 0;
        const effective = Math.max(0, modalW - RIGHT_W);
        setViewportW(effective);
        log('measure:fallback', { modalW, RIGHT_W, effective });
        return;
      }
      setViewportW(w);
      log('measure', { w });
    };
    measure();
    if (viewportW === 0) {
      requestAnimationFrame(measure);
      setTimeout(measure, 50);
      window.addEventListener('load', measure, { once: true });
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [RIGHT_W, viewportW]);

  const slideCount = images.length;

  const prevImg = useCallback(() => {
    if (!slideCount) return;
    setActiveIdx((i) => {
      const next = (i - 1 + slideCount) % slideCount;
      log('arrow:prev', { from: i, to: next, slideCount, viewportW: vwRef.current });
      return next;
    });
  }, [slideCount]);

  const nextImg = useCallback(() => {
    if (!slideCount) return;
    setActiveIdx((i) => {
      const next = (i + 1) % slideCount;
      log('arrow:next', { from: i, to: next, slideCount, viewportW: vwRef.current });
      return next;
    });
  }, [slideCount]);


  useEffect(() => {
    setActiveIdx((i) => (images.length ? Math.min(i, images.length - 1) : 0));
  }, [images.length]);



  const editInitial = useMemo(() => {
    if (!post) return undefined; // ← пусть будет undefined, prop у модалки optional
    return {
      postId: post.id,
      text: post.text ?? '',
      images: (post.images ?? []).map(u =>
        u.startsWith('http') ? u : `${API_BASE}${u}`
      ),
      camp: post.camp_id
        ? {
          id: post.camp_id,
          title: post.camp_title ?? '',
          start_date: post.camp_starts_at ?? undefined,
          end_date: post.camp_ends_at ?? undefined,
        }
        : null,
      taggedProfiles: (post.profiles ?? []).map(p => ({
        id: p.id,
        username: p.username,
        avatar_url: p.avatar_url ?? undefined,
      })),
      activityIds: (post.activities ?? []).map(a => String(a.id)),
      hashtagIds: (post.hashtags ?? []).map(h => String(h.id)),
      location_name: post.location_name ?? '',
      latitude: post.latitude != null ? String(post.latitude) : '',
      longitude: post.longitude != null ? String(post.longitude) : '',
    };
  }, [post, API_BASE]);



  useEffect(() => {
    console.log('[PostPage] editOpen =', editOpen);
  }, [editOpen]);

  const submitComment = async () => {
    setCommentErr(null);
    if (!me) { setLoginRequiredOpen(true); return; }
    if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
    const raw = commentText;
    const trimmed = raw.trim();
    if (trimmed.length > COMMENT_MAX_LEN) {
      setCommentErr(`Максимальная длина комментария — ${COMMENT_MAX_LEN} символов`);
      return;
    }
    if (!trimmed) return;

    // если это ответ — гарантируем mention в начале
    const text =
      replyTarget && !trimmed.startsWith(`@${replyTarget.username}`)
        ? `@${replyTarget.username} ${trimmed}`
        : trimmed;

    const fd = new FormData();
    fd.set('text', text);
    if (replyTarget?.rootId) fd.set('parent_id', String(replyTarget.rootId));
    // Оптимистично увеличиваем счётчик сразу при отправке
    const prevCount = post?.comments_count ?? 0;
    setCommentDelta((d) => d + 1);
    setPost((p) => (p ? { ...p, comments_count: prevCount + 1 } : p));

    try {
      const r = await fetch(`${API_BASE}/api/posts/${postIdNum}/comments/`, { method: 'POST', credentials: 'include', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'Не удалось отправить');

      setCommentText('');
      setReplyTarget(null);

      const nextCount = await loadComments();
      if (nextCount !== undefined) {
        setPost(p => (p ? { ...p, comments_count: nextCount } : p));
      }
    } catch (e: unknown) {
      // Откатываем оптимизм
      setCommentDelta((d) => Math.max(0, d - 1));
      setPost(p => (p ? { ...p, comments_count: Math.max(0, prevCount) } : p));
      setCommentErr(e instanceof Error ? e.message : 'Ошибка');
    }
  };


  if (loading) {
    return (
      <div className="fixed inset-0 z-[40000] bg-black/70 flex items-center justify-center">
        <div className="w-full max-w-5xl h-[min(84vh,800px)] bg-white rounded-xl overflow-hidden grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_420px]">
          <div className="bg-black" />
          <div className="p-4 space-y-3">
            <div className="h-6 w-40 bg-gray-200 rounded" />
            <div className="h-4 w-3/4 bg-gray-200 rounded" />
            <div className="h-4 w-2/3 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!isValidPostId) return <div className="max-w-2xl mx-auto p-4 text-red-600">Некорректный id поста</div>;
  if (error) return <div className="max-w-2xl mx-auto p-4 text-red-600">{error}</div>;
  if (!post) return null;

  // const campHref =
  //   post.camp_url
  //   ?? (post.camp_owner_username && post.camp_public_key
  //     ? `/${post.camp_owner_username}/camp/${post.camp_public_key}`
  //     : (post.camp_owner_username
  //       ? `/${post.camp_owner_username}/camp/${post.camp_slug ?? post.camp_id}`
  //       : (post.camp_slug ? `/camp/${post.camp_slug}` : `/camp/${post.camp_id}`)));


  const avatar = post.author?.avatar_url
    ? (post.author.avatar_url.startsWith('http') ? post.author.avatar_url : `${API_BASE}${post.author.avatar_url}`)
    : '';

  type ReportKind = ReportModalProps['kind'];

  const postReportKind: ReportKind = post?.camp_id ? 'camp_post' : 'profile_post';
  const commentReportKind: ReportKind = post?.camp_id ? 'camp_comment' : 'post_comment';




  return (
    <div className="fixed inset-0 z-[40000]">
      {/* затемнение + клик снаружи для закрытия */}
      <div className="absolute inset-0 bg-black/70" onClick={closeModal} />

      {/* Модалка: добавили min-h-0 */}
      <div
        ref={modalRef}
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
              w-full max-w-5xl h-[min(84vh,800px)] min-h-0 bg-white rounded-xl overflow-hidden
              grid grid-cols-1
              md:[transition-property:grid-template-columns] md:duration-300 md:ease-in-out
              ${(forceReading || readingMode)
            ? 'md:grid-cols-[28px_minmax(0,1fr)]'   // слева тонкий «хэндл», справа — всё остальное
            : 'md:grid-cols-[minmax(0,1fr)_420px]'} // обычный режим
              shadow-2xl`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Левая панель: min-h-0 + max-h ...  */}
        <div
          ref={leftRef}
          className="relative h-full min-h-0 max-h-[min(84vh,800px)] overflow-hidden bg-black group"
        >
          {/* Канва для картинки */}
          {/* Канва для галереи со свайпом */}
          <div className="absolute inset-0 overflow-hidden">
            {images.length > 0 ? (
              <div
                className="h-full flex select-none cursor-default"
                style={
                  (viewportW > 0)
                    ? {
                      width: `${viewportW * images.length}px`,
                      transition: 'transform 320ms cubic-bezier(0.22, 0.61, 0.36, 1)',
                      transform: `translate3d(${(-activeIdx * viewportW)}px, 0, 0)`,
                      willChange: 'transform',
                    }
                    : {
                      /* ФОЛБЭК НА %: работает даже если измерение ширины не успело */
                      width: `${images.length * 100}%`,
                      transition: 'transform 320ms cubic-bezier(0.22, 0.61, 0.36, 1)',
                      transform: `translate3d(${(-activeIdx * 100) / images.length}%, 0, 0)`,
                      willChange: 'transform',
                    }
                }
              >
                {images.map((src, i) => (
                  <div
                    key={`${src}-${i}`}
                    className="relative h-full shrink-0 grow-0"
                    style={{
                      width: (viewportW > 0) ? `${viewportW}px` : `${100 / images.length}%`
                    }}
                  >
                    <SmartImage
                      src={src}
                      alt=""
                      fill
                      className="object-contain pointer-events-none select-none"
                      sizes="(max-width: 768px) 100vw, 840px"
                      priority={i === activeIdx}
                      draggable={false}
                    />
                  </div>
                ))}
              </div>
            ) : (
              !readingMode ? <div className="grid place-items-center h-full text-gray-500 text-sm">Нет изображений</div> : null
            )}
          </div>


          {/* Стрелки перелистывания показываем только при множестве фото */}
          {images.length > 1 && (
            <>
              <button
                onClick={prevImg}
                onMouseDown={(e) => e.preventDefault()}
                className="absolute z-[80] left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/70 text-white rounded-full w-8 h-8 grid place-items-center pointer-events-auto"
                aria-label="Предыдущее фото"
                type="button"
              >‹</button>

              <button
                onClick={nextImg}
                onMouseDown={(e) => e.preventDefault()}
                className="absolute z-[80] right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/70 text-white rounded-full w-8 h-8 grid place-items-center pointer-events-auto"
                aria-label="Следующее фото"
                type="button"
              >›</button>

              {/* Точки по центру снизу */}
              <div className="absolute inset-x-0 bottom-3 md:bottom-4 flex items-center justify-center gap-1 pointer-events-none px-4">
                {images.map((_, i) => (
                  <span
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full ${i === activeIdx ? 'bg-white' : 'bg-white/50'}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>


        {/* === ГРАНИЦА СПРАВА: белый оверлей, зона сдвинута SENSE_L влево и SENSE_R вправо === */}
        {!readingMode && !forceReading && (
          <div className="hidden md:block absolute inset-0 z-30 pointer-events-none">
            {(() => {
              const SENSE_L = 7;    // ⬅️ чуть влево (в галерею)
              const SENSE_R = 12;   // ➡️ чуть вправо (в правую колонку)
              const SENSE_W = SENSE_L + SENSE_R;

              const OVER_W = 24;   // поуже оверлей
              const boundary = `calc(100% - ${RIGHT_W}px)`; // граница колонок

              // сенсор начинается на SENSE_L левее границы и уходит на SENSE_R вправо
              const leftPos = `calc(${boundary} - ${SENSE_L}px)`;

              return (
                <button
                  type="button"
                  onClick={() => { dbg('user click → setReadingMode(true)'); setReadingMode(true); }}
                  aria-label="Развернуть правую колонку"
                  className="pointer-events-auto absolute top-0 h-full group focus:outline-none"
                  style={{ left: leftPos, width: SENSE_W }}
                >
                  {/* белый оверлей — не перехватывает мышь */}
                  <span
                    className="pointer-events-none absolute top-0 h-full rounded-l-md bg-white/80 backdrop-blur
                       opacity-0 scale-x-0 transition-all duration-200 ease-out
                       group-hover:opacity-100 group-hover:scale-x-100"
                    style={{
                      left: `${SENSE_L}px`,             // правая кромка = граница
                      transformOrigin: 'right center',  // растём влево
                      transform: 'translateX(-100%)',
                      width: OVER_W,
                    }}
                    aria-hidden="true"
                  />
                  {/* стрелки вправо */}
                  <span
                    className="pointer-events-none absolute flex flex-col items-center gap-0.5
                       opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                    style={{
                      top: '20%',
                      left: `${SENSE_L}px`,
                      transform: `translate(-${OVER_W - 10}px, -50%)`,
                      zIndex: 1,
                    }}
                    aria-hidden="true"
                  >
                    {[0, 1].map(i => (
                      <svg key={i} width="12" height="12" viewBox="0 0 24 24">
                        <path d="M15 6l-6 6 6 6" fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ))}
                  </span>
                </button>
              );
            })()}
          </div>
        )}


        {/* === ГРАНИЦА СЛЕВА (readingMode): тёмный оверлей, зона SENSE_L влево + SENSE_R вправо === */}
        {readingMode && !forceReading && (
          <div className="hidden md:block absolute inset-0 z-30 pointer-events-none">
            {(() => {
              const SENSE_L = 24;
              const SENSE_R = 7;
              const SENSE_W = SENSE_L + SENSE_R;

              const OVER_W = 24;
              const boundary = `28px`;


              const leftPos = `calc(${boundary} - ${SENSE_L}px)`;

              return (
                <button
                  type="button"
                  onClick={() => { dbg('user click → setReadingMode(false)'); setReadingMode(false); }}
                  aria-label="Свернуть правую колонку (вернуть галерею)"
                  className="pointer-events-auto absolute top-0 h-full group focus:outline-none"
                  style={{ left: leftPos, width: SENSE_W }}
                >
                  {/* тёмный оверлей — не перехватывает события */}
                  <span
                    className="pointer-events-none absolute top-0 h-full rounded-r-md bg-black/70 backdrop-blur
                       opacity-0 scale-x-0 transition-all duration-200 ease-out
                       group-hover:opacity-100 group-hover:scale-x-100"
                    style={{
                      left: `${SENSE_L}px`,
                      transformOrigin: 'left center',
                      transform: 'translateX(0)',
                      width: OVER_W,
                    }}
                    aria-hidden="true"
                  />
                  {/* стрелки у левого края тёмного оверлея */}
                  <span
                    className="pointer-events-none absolute flex flex-col items-center gap-0.5
             opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                    style={{
                      top: '20%',
                      left: `${SENSE_L}px`,
                      transform: `translate(4px, -50%)`,
                      zIndex: 1,
                    }}
                    aria-hidden="true"
                  >
                    {[0, 1].map(i => (
                      <svg key={i} width="12" height="12" viewBox="0 0 24 24">
                        <path
                          d="M9 6l6 6-6 6"
                          fill="none" stroke="white" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round"
                        />
                      </svg>
                    ))}
                  </span>

                </button>
              );
            })()}
          </div>
        )}


        {/* правая панель — как в Instagram */}
        <div className="relative flex flex-col h-full min-w-0 min-h-0 overflow-hidden">

          <style jsx global>{`
  .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  .no-scrollbar::-webkit-scrollbar { display: none; }
  .collapsible-anchor-fix { overflow-anchor: none; }
  .collapsible-anchor-fix,
  .replies-anchor-fix{
    overflow-anchor: none;
    contain: layout paint; 
    backface-visibility: hidden;
    isolation: isolate;
  }

  .camp-title-2l{
    display:-webkit-box;
    -webkit-box-orient:vertical;
    -webkit-line-clamp:2;
    overflow:hidden;
    text-overflow:ellipsis;
    word-break:break-word;
    overflow-wrap:anywhere;
  }

  /* НОВОЕ: одна строка + троеточие */
  .camp-title-1l{
    display:block;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }

  /* комментарий в 4 строки (по умолчанию) */
  .comment-4l{
    display:-webkit-box;
    -webkit-box-orient:vertical;
    -webkit-line-clamp:4;
    overflow:hidden;
    text-overflow:ellipsis;
    word-break:break-word;
    overflow-wrap:anywhere;
  }
`}</style>

          {/* header (один, без вложенного дубля) */}
          <div className="flex items-center gap-3 px-4 py-2 border-b">
            {(() => { const headerU = post?.author?.username ?? ''; return (
            <Link
              href={`/${headerU}`}
              className="flex items-center gap-3"
              prefetch={false}
              onClick={(e) => handleProfileClick(e, headerU)}
            >
              {avatar ? (
                <SmartImage src={avatar} alt="" width={32} height={32} className="rounded-full border object-cover" />
              ) : (
                <SmartImage src={(process.env.NEXT_PUBLIC_BASE_PATH || '') + '/avatars/question3.jpg'} alt="" width={32} height={32} className="rounded-full border object-cover" />
              )}
              <div className="flex flex-col leading-tight">
                <span className="text-[13px] font-semibold leading-tight md:mt-1">{headerU}</span>
                {post.location_name && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); goToPhotoLocationSearch(); }}
                    className={[
                      'text-left text-[12px] text-gray-500 truncate mt-1 transition-[max-width] duration-300 underline-offset-2 hover:underline',
                      readingMode ? 'max-w-[520px]' : 'max-w-[240px]',
                      'bg-transparent border-0 p-0'
                    ].join(' ')}
                    title={post.location_name}
                  >
                    {post.location_name}
                  </button>
                )}
              </div>
            </Link> ); })()}

            <div className="ml-auto flex items-center gap-1">
              {/* три точки → стрелка "наверх" при уходе первого комментария */}
              <div ref={menuRef} className="relative">
                {showScrollUp ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); scrollToTop(); }}
                    className="rounded-md px-2 py-1 hover:bg-gray-100"
                    title="Наверх"
                    aria-label="Наверх"
                  >
                    <IconArrowUp />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setActionsOpen(true); }}
                      aria-haspopup="dialog"
                      aria-expanded={actionsOpen}
                      className="rounded-md px-2 py-1 hover:bg-gray-100"
                      title="Действия"
                    >
                      ⋯
                    </button>
                  </>
                )}
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); closeModal(); }}
                className="rounded-md px-2 py-1 hover:bg-gray-100"
                title="Закрыть"
              >
                ✕
              </button>
            </div>
          </div>




          {/* поток: текст + комментарии (scroll) */}
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar"
            style={{
              //paddingBottom: bottomH + 12,
              scrollPaddingBottom: bottomH + 12,
              // прокинем переменную, чтобы не таскать bottomH по пропсам
              ['--bottom-gap']: `${bottomH + 12}px`,
            } as React.CSSProperties & { ['--bottom-gap']: string }
            }
          >
            {/* текст поста как отдельный item */}
            {(post.text || post.created_at) && (
              <div className="px-4 py-3">
                {post.text && (
                  <div
                    className={`${readingMode ? 'text-[15px] md:text-[16px]' : 'text-sm'} whitespace-pre-wrap leading-relaxed`}
                  >
                    <MentionedProfileInline text={post.text} />
                  </div>
                )}

                {/* чипсы (не показываем, если пусто) */}
                {(post.activities?.length || post.hashtags?.length) ? (
                  <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
                    {post.activities?.map(a => (
                      <span
                        key={`act-${a.id}`}
                        role="link"
                        tabIndex={0}
                        onClick={() => goToPhotoFilter('activities', a?.id, a?.name)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToPhotoFilter('activities', a?.id, a?.name); } }}
                        title={a?.name ? `Показать фотопосты по активности: ${a.name}` : 'Показать фотопосты по активности'}
                        className="px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-700 cursor-pointer hover:bg-gray-100"
                      >
                        {a.name}
                      </span>
                    ))}
                    {post.hashtags?.map(h => (
                      <span
                        key={`tag-${h.id}`}
                        role="link"
                        tabIndex={0}
                        onClick={() => goToPhotoFilter('hashtags', h?.id, h?.name)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToPhotoFilter('hashtags', h?.id, h?.name); } }}
                        title={h?.name ? `Показать фотопосты по тегу: #${h.name}` : 'Показать фотопосты по тегу'}
                        className="px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-700 cursor-pointer hover:bg-gray-100"
                      >
                        #{h.name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            {/* ⬇️ УБРАЛИ отсюда «кэмп» и «service row» — они будут приклеены внизу */}

            {/* комментарии под текстом */}
            <div className="px-4 py-3">
              {commentsLoading ? (
                <p className="text-sm text-gray-500">Загружаем комментарии…</p>
              ) : orderedRoots.length ? (
                <ul className="space-y-3">
                  {orderedRoots.map((root) => {
                    const expandForThisRoot =
                      hashCommentId &&
                        comments.some(c => c.id === hashCommentId && (c.parent_id === root.id))  // таргет — ответ в этой ветке
                        ? hashCommentId
                        : undefined;

                    const highlightRoot = hashCommentId === root.id;

                    return (
                      <li
                        key={root.id}
                        id={`comment-${root.id}`}
                        className={[
                          'flex flex-col',
                          highlightRoot ? 'ring-2 ring-amber-400 rounded bg-amber-50/50' : ''
                        ].join(' ')}
                        style={{ scrollMarginBottom: 'var(--bottom-gap)' }}
                      >
                        <div className="flex items-start gap-2">
                          <Avatar
                            href={`/${root.author}`}
                            src={root.author_avatar_url}
                            size={32}
                            onClick={(e) => handleProfileClick(e, root.author)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="group/comment-head">
                              <div className="flex items-end gap-2">
                                <Link
                                  href={`/${root.author}`}
                                  className="text-[13px] font-semibold leading-none text-gray-900 hover:underline"
                                  prefetch={false}
                                  onClick={(e) => handleProfileClick(e, root.author)}
                                >
                                  {root.author}
                                </Link>
                              </div>

                              <CollapsibleText
                                text={root.text}
                                className="text-sm"
                                containerClassName="mt-2.5"
                                renderText={renderCommentText}
                              />

                              <div className="mt-2 flex items-center gap-3 text-xs text-gray-600" data-comment-actions>
                                <button onClick={() => likeComment(root.id)} className="inline-flex items-center gap-1" aria-label={root.liked_by_me ? 'Убрать лайк' : 'Поставить лайк'}>
                                  <span className={[
                                    'text-sm leading-none select-none',
                                    root.liked_by_me ? 'text-red-500' : (root.likes_count > 0 ? 'text-black' : 'text-gray-400')
                                  ].join(' ')}>♥</span>
                                </button>
                                {root.likes_count > 0 && (
                                  <button type="button" className="tabular-nums hover:underline" title="Кто оценил" onClick={() => openCommentLikers(root.id)}>
                                    {root.likes_count}
                                  </button>
                                )}

                                <button type="button" className="hover:underline" onClick={() => focusReply(root.id, root.author)}>
                                  Ответить
                                </button>

                                {(() => {
                                  const canReport = !!(me && me !== root.author);
                                  const canDelete = (me === root.author) || isAuthor;
                                  if (!canReport && !canDelete) return null;
                                  return (
                                    <MoreButton
                                      scope="comment"
                                      onClick={() => setRootSheet({
                                        open: true,
                                        onReport: canReport ? () => openReportComment(root.id) : undefined,
                                        onDelete: canDelete ? () => deleteComment(root.id) : undefined,
                                      })}
                                    />
                                  );
                                })()}

                                <span className="ml-auto text-[12px] leading-none text-gray-500/40 whitespace-nowrap">
                                  {dateOnly(root.created_at)}
                                </span>
                              </div>
                            </div>
                            <PostReplies
                              root={root}
                              me={me || null}
                              onReply={(uname) => focusReply(root.id, uname)}
                              onLike={likeComment}
                              onShowLikers={openCommentLikers}
                              onReport={openReportComment}
                              onDelete={deleteComment}
                              expandToId={expandForThisRoot}
                              canPostAuthorDelete={isAuthor}
                              renderText={renderCommentText}
                            />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">Будьте первым, кто оставит комментарий</p>
              )}
            </div>




            {/* === ПРИКЛЕЕННЫЙ НИЗ ПРАВОЙ КОЛОНКИ === */}
            <div
              ref={bottomRef}
              className="sticky bottom-0 z-20 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75 border-t"
            >
              {/* строка: отмеченный кэмп (если есть) */}
              {(post.camp_id || post.camp_title) && (
                <div className="px-5 pt-3 pb-2">
                  {/* БЫЛО inline-flex → СТАЛО flex + w-full + min-w-0 */}
                  <div className="relative flex items-baseline gap-2 group w-full min-w-0">
                    {(() => {
                      const range = formatCampRange(post.camp_starts_at, post.camp_ends_at);
                      return range ? (
                        post.camp_id ? (
                          <Link
                            href={campHref}
                            className="text-[12px] text-gray-500 tabular-nums whitespace-nowrap shrink-0"
                            onClick={handleCampClick}
                          >
                            {range}
                          </Link>
                        ) : (
                          <span className="text-[12px] text-gray-500 tabular-nums whitespace-nowrap shrink-0">
                            {range}
                          </span>
                        )
                      ) : null;
                    })()}

                    {/* заголовок занимает остаток ширины */}
                    <div className="flex-1 min-w-0">
                      {post.camp_id ? (
                        <Link
                          href={campHref}
                          className="flex items-center gap-2 pr-12 min-w-0 text-sm leading-tight text-gray-700"
                          title={post.camp_title || undefined}
                          onClick={handleCampClick}
                        >
                          <Calendar className="w-4 h-4 text-blue-600 shrink-0" aria-hidden />
                          <span className="truncate block">{post.camp_title || 'Кэмп'}</span>
                        </Link>
                      ) : (
                        <div
                          className="flex items-center gap-2 pr-12 min-w-0 text-sm leading-tight text-gray-700"
                          title={post.camp_title || undefined}
                        >
                          <Calendar className="w-4 h-4 text-blue-600 shrink-0" aria-hidden />
                          <span className="truncate block">{post.camp_title}</span>
                        </div>
                      )}
                    </div>

                    {/* подчёркивание группы */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute left-0 right-0 -bottom-[2px] h-px bg-gray-700 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                    />
                  </div>
                </div>
              )}



              {/* строка: экшны + дата (счётчики только >0) */}
              <div className="px-4 py-0 flex items-center justify-between">
                <div className="flex items-center gap-3 text-gray-700">
                  {/* like */}
                  <button
                    onClick={toggleLike}
                    aria-pressed={!!post.liked}
                    title={post.liked ? 'Убрать лайк' : 'Поставить лайк'}
                    className={[
                      'inline-flex items-center justify-center w-8 h-8 hover:bg-gray-50 transition',
                      post.liked ? 'text-red-500' : 'text-gray-700'
                    ].join(' ')}
                  >
                    <IconHeart filled={!!post.liked} />
                  </button>

                  {(post.likes_count ?? 0) > 0 && (
                    <button type="button" className="text-sm tabular-nums hover:underline" onClick={openLikers} title="Кто оценил">
                      {cap99(post.likes_count)}
                    </button>
                  )}

                  {/* comments: стабильно показываем корректное число (корневые + ответы) */}
                  {(() => {
                    const scrollToCommentsTop = () => {
                      const first = orderedRoots[0];
                      if (first) {
                        const el = document.getElementById(`comment-${first.id}`);
                        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
                      }
                      const cont = scrollRef.current;
                      if (cont) cont.scrollTo({ top: 0, behavior: 'smooth' });
                    };
                    const computed = comments.reduce((n, c) => n + (c.is_deleted ? 0 : 1), 0);
                    const baseWhenFetched = Math.max(0, computed + commentDelta);
                    const baseWhenNotFetched = (engagementCommentsTotal ?? post.comments_count ?? 0) + commentDelta;
                    const toShow = commentsFetched ? baseWhenFetched : baseWhenNotFetched;
                    return toShow > 0 ? (
                      <button type="button" onClick={scrollToCommentsTop} className="inline-flex items-center gap-1 text-gray-700" title="Перейти к комментариям">
                        <span className="inline-flex items-center justify-center w-8 h-8"><IconComment /></span>
                        <span className="text-sm tabular-nums">{cap99(toShow)}</span>
                      </button>
                    ) : null;
                  })()}

                  {/* profiles (только если есть) */}
                  {profilesCount > 0 && (
                    <button
                      onClick={openProfiles}
                      className="inline-flex items-center gap-1 text-gray-700"
                      title="Показать отмеченных"
                      type="button"
                    >
                      <span className="inline-flex items-center justify-center w-8 h-8"><IconUser /></span>
                      <span className="text-sm tabular-nums">{profilesCount}</span>
                    </button>
                  )}

                  {/* share */}
                  <button
                    onClick={shareCurrentPost}
                    title="Поделиться"
                    className="inline-flex items-center justify-center w-8 h-8 hover:bg-gray-50 transition"
                  >
                    <IconShare />
                  </button>
                </div>

                <div className="text-[12px] text-gray-500 ml-4">{dateOnly(post.created_at)}</div>
              </div>


              {/* строка: поле ввода с кнопкой-стрелкой */}
              <div className="px-4 py-3">
                <div className="relative flex-1">
                  {replyTarget && (
                    <div className="px-4 mb-1.5 text-xs text-gray-500">
                      Ответ для @{replyTarget.username}{' '}
                      <button onClick={cancelReply} className="ml-2 underline">Отмена</button>
                    </div>
                  )}


                  <textarea
                    ref={taRef}
                    value={commentText}
                    onChange={(e) => {
                      const v = e.target.value;

                      // если только что «уперлись» в предел — покажем уведомление
                      if (v.length === COMMENT_MAX_LEN && commentText.length < COMMENT_MAX_LEN) {
                        pingLimit();
                      }

                      // жёстко обрезаем до лимита (на случай paste/IME и т.п.)
                      setCommentText(v.slice(0, COMMENT_MAX_LEN));
                    }}
                    onInput={() => resizeTA()}
                    rows={1}
                    placeholder="Добавить комментарий…"
                    maxLength={COMMENT_MAX_LEN}
                    className="w-full resize-none rounded-2xl border border-gray-300 bg-white px-3 pr-12 py-[10px] text-[15px] leading-[20px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    style={{ height: 'auto' }}
                  />

                  {limitHit && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="absolute right-0 -top-6 px-2 py-1 rounded-md bg-black/80 text-white text-[12px] shadow transition-opacity"
                    >
                      Вы достигли лимита длины комментария. Полегче 🙂
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={submitComment}
                    disabled={!commentText.trim()}
                    aria-label="Отправить"
                    className="absolute right-3 bottom-[13px] inline-flex items-center justify-center w-7 h-7 rounded-full text-white transition bg-[var(--brand,#2563eb)] hover:bg-[var(--brand-hover,#1d4ed8)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
                      <path d="M12 5v14M12 5l-5 5M12 5l5 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
                {commentErr && <p className="mt-2 text-sm text-red-600">{commentErr}</p>}
              </div>
            </div>


            {/* окно со списком отмеченных профилей */}
            {profilesOpen && (
              <div
                className="fixed inset-0 z-[2000] flex items-center justify-center"
                aria-modal="true"
                role="dialog"
              >
                {/* фон */}
                <button
                  className="absolute inset-0 bg-black/40"
                  aria-label="Закрыть"
                  onClick={closeProfiles}
                />
                {/* карточка */}
                <div
                  className="relative z-[2001] w-[min(420px,92vw)] max-h-[70vh] bg-white rounded-xl shadow-2xl border p-4 overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">Отмеченные профили</h3>
                    <button onClick={closeProfiles} className="rounded-md px-2 py-1 hover:bg-gray-100">✕</button>
                  </div>

                  {Array.isArray(post?.profiles) && post!.profiles.length > 0 ? (
                    <ul className="divide-y">
                      {post!.profiles.map((pr) => (
                        <li key={pr.id} className="py-2">
                          <div className="flex items-center justify-between gap-2 hover:bg-gray-50 rounded-md px-2 py-1">
                            <Link
                              href={`/${pr.username}`}
                              className="flex items-center gap-3 min-w-0"
                              onClick={(e) => handleProfileClick(e, pr.username)}
                            >
                              {pr.avatar_url ? (
                                <SmartImage src={pr.avatar_url} alt="" width={36} height={36} className="rounded-full" sizes="36px" />
                              ) : (
                                <SmartImage src={(process.env.NEXT_PUBLIC_BASE_PATH || '') + '/avatars/question3.jpg'} alt="" width={36} height={36} className="rounded-full" sizes="36px" />
                              )}
                              <div className="flex flex-col min-w-0">
                                <span className="text-sm font-semibold truncate">{pr.username}</span>
                                {pr.role && <span className="text-xs text-gray-500">{pr.role}</span>}
                              </div>
                            </Link>
                            {me && pr.username === me && (
                              <button
                                type="button"
                                aria-label="Удалить отметку своего профиля"
                                className="ml-3 px-3 py-1 text-[13px] rounded-full border border-gray-200 hover:bg-gray-50 text-gray-700"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmUntagOpen(true); }}
                              >
                                Удалить
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500 px-2 py-6 text-center">
                      Никого не отметили
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Список лайкнувших ("Оценили") */}
            {likersOpen && (
              <div
                className="fixed inset-0 z-[50000] flex items-center justify-center"
                aria-modal="true"
                role="dialog"
              >
                {/* фон */}
                <button
                  className="absolute inset-0 bg-black/40"
                  aria-label="Закрыть"
                  onClick={() => setLikersOpen(false)}
                />
                {/* карточка */}
                <div
                  className="relative z-[50001] w-[min(420px,92vw)] max-h-[70vh] bg-white rounded-xl shadow-2xl border p-4 overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">{likersTitle}</h3>
                    <button onClick={() => setLikersOpen(false)} className="rounded-md px-2 py-1 hover:bg-gray-100">✕</button>
                  </div>

                  {likersLoading ? (
                    <p className="text-sm text-gray-500 px-2 py-6 text-center">Загружаем…</p>
                  ) : likersErr ? (
                    <p className="text-sm text-red-600 px-2 py-6 text-center">{likersErr}</p>
                  ) : (likers?.length ?? 0) > 0 ? (
                    <ul className="divide-y">
                      {likers!.map((u, i) => (
                        <li key={u.username + i} className="py-2">
                          <Link
                            href={`/${u.username}`}
                            className="flex items-center gap-3 hover:bg-gray-50 rounded-md px-2 py-1"
                            onClick={(e) => handleProfileClick(e, u.username)}
                          >
                            {u.avatar ? (
                              <SmartImage src={u.avatar} alt="" width={36} height={36} className="rounded-full" sizes="36px" />
                            ) : (
                              <SmartImage src={(process.env.NEXT_PUBLIC_BASE_PATH || '') + '/avatars/question3.jpg'} alt="" width={36} height={36} className="rounded-full" sizes="36px" />
                            )}
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold">{u.username}</span>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500 px-2 py-6 text-center">Ещё нет оценок</p>
                  )}
                </div>
              </div>
            )}


          </div>
        </div>
      </div>
      {/* Жалоба на пост */}
      {post && (
        <ReportAbuseModal
          open={reportPostOpen}
          onClose={() => setReportPostOpen(false)}
          kind={postReportKind}
          targetId={post.id}
          linkHint={`${location.origin}/${username}/post/${postId}`}
        />
      )}

      {/* Центровая модалка действий по посту (десктоп) */}
      <PostActionSheet
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        actions={isAuthor ? [
          { label: 'Поделиться', onClick: () => shareCurrentPost() },
          { label: 'Редактировать', onClick: () => setEditOpen(true) },
          { label: 'Удалить', destructive: true, onClick: () => setConfirmDeleteOpen(true) },
        ] : [
          { label: 'Поделиться', onClick: () => shareCurrentPost() },
          { label: 'Пожаловаться', destructive: true, onClick: () => openReportPost() },
        ]}
      />

      <CommentActionSheet
        open={rootSheet.open}
        canReport={!!rootSheet.onReport}
        canDelete={!!rootSheet.onDelete}
        onClose={() => setRootSheet({ open: false })}
        onReport={rootSheet.onReport}
        onDelete={rootSheet.onDelete}
      />

      <ConfirmModal
        open={confirmUntagOpen}
        onCancel={() => setConfirmUntagOpen(false)}
        onConfirm={async () => {
          if (!post || !API_ORIGIN) return;
          try {
            await ensureCsrf();
            const r = await fetch(`${API_ORIGIN}/api/posts/${post.id}/untag-self/`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'X-CSRFToken': getCsrf() },
            });
            if (!r.ok) throw new Error('Не удалось удалить отметку');
            let srvCount: number | undefined;
            try {
              const j = await r.json();
              if (j && typeof j.profiles_count === 'number') srvCount = j.profiles_count as number;
            } catch { /* ignore non-json */ }
            setConfirmUntagOpen(false);
            setPost(prev => {
              if (!prev) return prev;
              const nextProfiles = (prev.profiles ?? []).filter(p => p.username !== me);
              const prevCount = (prev.profiles_count ?? (prev.profiles?.length ?? 0));
              const nextCount = (typeof srvCount === 'number') ? srvCount : Math.max(0, prevCount - 1);
              return { ...prev, profiles: nextProfiles, profiles_count: nextCount } as PostFull;
            });
          } catch (e) {
            alert(e instanceof Error ? e.message : 'Ошибка');
          }
        }}
        title="Удалить отметку?"
        message="Уверены, что хотите удалить отметку своего профиля из данного поста?"
        cancelLabel="Отмена"
        confirmLabel="Удалить"
      />


      {/* Жалоба на комментарий / ответ в ветке */}
      {post && reportCommentId !== null && (
        <ReportAbuseModal
          open={reportCommentId !== null}
          onClose={() => setReportCommentId(null)}
          kind={commentReportKind}
          targetId={reportCommentId}
          linkHint={`${location.origin}/${username}/post/${postId}#comment-${reportCommentId}`}
          isReply={!!target?.parent_id}
          commentAuthor={target?.author ?? undefined}
          commentText={target?.text ?? undefined}
        />
      )}

      {/* Гейт: нужно войти */}
      <ConfirmModal
        open={loginRequiredOpen}
        onCancel={() => setLoginRequiredOpen(false)}
        onConfirm={onLogin}
        title="Данное действие доступно только для авторизованных пользователей"
        cancelLabel="Отмена"
        confirmLabel="Войти"
      />
      <CompleteProfileActionModal
        open={completeProfileModalOpen}
        onClose={() => setCompleteProfileModalOpen(false)}
      />


      {/* Редактирование поста (используем расширенную CreatePostModal) */}

      <CreatePostModal
        key={post.id}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        mode="edit"
        initial={editInitial}
        onSaved={(updated) => {
          // ← закрываем модалку гарантированно
          setEditOpen(false);

          // Обновление данных поста — по возможности
          if (updated && typeof updated === 'object') {
            const patch = updated as Partial<PostFull>;
            setPost((prev: PostFull | null) => (prev ? { ...prev, ...patch } : prev));
          }
          // других типов (string/number) просто игнорим — сервер уже сохранил
        }}
      />



      <ConfirmDeletePostModal
        open={confirmDeleteOpen}
        onClose={() => { if (!deleting) setConfirmDeleteOpen(false); }}
        onConfirm={handleDeletePost}
        busy={deleting}
      />
    </div>
  );
}

// client-only media query helper
function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.matchMedia(query);
    const onChange = () => setMatches(m.matches);
    onChange();
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export default function PostPageClient({ username, postId, initialPost }: PostPageClientProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  return isMobile
    ? <MobilePostPageClient username={username} postId={postId} initialPost={initialPost} />
    : <PostDesktopPage username={username} postId={postId} initialPost={initialPost} />;
}
