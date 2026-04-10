'use client';

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import ConfirmModal from '@/components/ui/ConfirmModal';
import ReportModal from '@/components/common/ReportModal';
import HeartIcon from '@/components/ui/HeartIcon';
import {
  CommentItem as SharedCommentItem,
  CommentNode,
  buildTree,
  CollapsibleText,
  dateOnly,
  Avatar as SharedAvatar,
  cmpMainOthers,
  normalizeCommentAvatarSrc,
} from '@/components/comments/shared';
import { useAppNavigation } from '@/hooks/useAppNavigation';
import { useProfileOverlay } from '@/hooks/useProfileOverlay';
import { useCommentLikersModal } from '@/hooks/useCommentLikersModal';
import { useCommentActionSheetModal } from '@/hooks/useCommentActionSheetModal';
import { hasTemporaryToken } from '@/lib/checkTemporaryToken';
import CompleteProfileActionModal from '@/components/CompleteProfileActionModal';
import { useLayerStack } from '@/context/LayerStackContext';
import { getBrowserApiBase } from '@/lib/apiBase';

type CommentItem = SharedCommentItem;
type CommentId = number;

const API_BASE = getBrowserApiBase();
const log = (...args: unknown[]) => {
  try {
    if (typeof window !== 'undefined')
      console.log('[CommentsMobile]', ...args);
  } catch {
    // ignore
  }
};
const AVA_PH = (process.env.NEXT_PUBLIC_BASE_PATH || '') + '/avatars/question3.jpg';
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => v !== null && typeof v === 'object';
const extractAuthor = (src: unknown): string | undefined => {
  if (!isDict(src)) return undefined;
  const a = src['post_author'] ?? src['author'] ?? src['author_username'] ?? src['owner'];
  return typeof a === 'string' ? a : undefined;
};

type HasParentId = {
  id: number;
  parent_id?: number;
  root_id?: number;
  reply_to?: number;
};
const getParentId = (c: HasParentId) =>
  (c.parent_id ?? c.root_id ?? c.reply_to ?? 0) as number;

function ArrowDownIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MoreButton({
  onClick,
  title = 'Действия',
  visible = false,
}: {
  onClick: () => void;
  title?: string;
  visible?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={[
        'transition-opacity text-gray-500 hover:text-gray-800 text-[18px] leading-none',
        'w-8 h-8 -m-1.5 p-1.5 rounded-full hover:bg-gray-100',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      ⋯
    </button>
  );
}

// const tapOnly = <T extends (e: React.MouseEvent) => void>(fn: T) => (e: React.MouseEvent) => fn(e);

const likesCacheKey = (me: string | null) =>
  `profile:comments:likes:${me ?? 'guest'}`;
const readLikesCache = (me: string | null): Record<number, true> => {
  try {
    return JSON.parse(localStorage.getItem(likesCacheKey(me)) || '{}');
  } catch {
    return {};
  }
};
const writeLikesCache = (me: string | null, map: Record<number, true>) => {
  try {
    localStorage.setItem(likesCacheKey(me), JSON.stringify(map));
  } catch {
    // ignore
  }
};
const setCachedLike = (me: string | null, id: number, liked: boolean) => {
  const m = readLikesCache(me);
  if (liked) {
    m[id] = true;
  } else {
    delete m[id];
  }
  writeLikesCache(me, m);
};

const SHEET_HEIGHT = '75vh';

export default function PostProfileCommentsMobile({
  open,
  postId,
  onClose,
  onSyncCommentsCount,
  centered,
  skipPortal,
}: {
  open: boolean;
  postId: number;
  onClose: () => void;
  onSyncCommentsCount?: (count: number) => void;
  centered?: boolean;
  skipPortal?: boolean;
}) {
  const { authenticated, profile } = useAuth();
  const me = profile?.username ?? null;
  const [isPostOwner, setIsPostOwner] = useState(false);
  const { navigateProfile } = useAppNavigation();
  const openProfileOverlay = useProfileOverlay();
  const commentLikersModal = useCommentLikersModal();
  const commentActionSheetModal = useCommentActionSheetModal();
  const { clearScreens } = useLayerStack();

  const [dragY, setDragY] = useState(0);
  const headerDragRef = useRef<{ y0: number; active: boolean } | null>(null);
  const headerElRef = useRef<HTMLDivElement | null>(null);
  const commentsScrollRef = useRef<HTMLDivElement | null>(null);

  // flat list as in shared.tsx; tree is derived via buildTree(items)
  const [items, setItems] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);

  const [loginRequiredOpen, setLoginRequiredOpen] = useState(false);
  const [completeProfileModalOpen, setCompleteProfileModalOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteCommentId, setDeleteCommentId] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCommentId, setReportCommentId] = useState<number | null>(null);

  const [replyTarget, setReplyTarget] = useState<{
    username: string;
    rootId?: number;
  } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [hasText, setHasText] = useState(false);
  const textRef = useRef<string>('');
  const syncCountRef =
    useRef<typeof onSyncCommentsCount | undefined>(onSyncCommentsCount);
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const lastCountRef = useRef<number>(-1);


  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    try {
      log('mount', {
        postId,
        centered: !!centered,
        skipPortal: !!skipPortal,
        location: typeof window !== 'undefined' ? window.location.href : null,
      });
    } catch {
      /* noop */
    }
  }, [open, postId, centered, skipPortal]);

  // Применяем стили для скрытия скроллбара - упрощенная версия
  useEffect(() => {
    if (!open) return;
    const el = commentsScrollRef.current;
    if (!el) return;
    
    // Применяем стили напрямую
    el.style.setProperty('-ms-overflow-style', 'none', 'important');
    el.style.setProperty('scrollbar-width', 'none', 'important');
    el.classList.add('hide-scrollbar');
  }, [open]);

  useEffect(() => {
    syncCountRef.current = onSyncCommentsCount;
  }, [onSyncCommentsCount]);

  const findScrollParent = useCallback((el: HTMLElement | null): HTMLElement | null => {
    let n: HTMLElement | null = el?.parentElement ?? null;
    while (n) {
      const cs = getComputedStyle(n);
      const oy = (cs.overflowY || cs.overflow) as string;
      if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') return n;
      n = n.parentElement;
    }
    return null;
  }, []);

  const avatarSrcs = useMemo(() => {
    const uniq = new Set<string>();
    items.forEach((c) => {
      const src = normalizeCommentAvatarSrc(c.author_avatar_url);
      if (src) uniq.add(src);
    });
    return Array.from(uniq);
  }, [items]);

  useEffect(() => {
    if (!open || avatarSrcs.length === 0) return;
    if (typeof window === 'undefined') return;
    const limit = 80;
    const preloaders = avatarSrcs.slice(0, limit).map((src) => {
      const img = new Image();
      if ('decoding' in img) {
        try {
          img.decoding = 'async';
        } catch {
          // ignore
        }
      }
      img.src = src;
      return img;
    });
    return () => {
      preloaders.forEach((img) => {
        img.src = '';
      });
    };
  }, [open, avatarSrcs]);

  const byId = useMemo(() => {
    const m = new Map<CommentId, CommentItem>();
    for (const it of items) m.set(it.id, it);
    return m;
  }, [items]);

  const openProfileFromComment = useCallback(
    (username?: string | null, event?: React.MouseEvent<HTMLElement> | null) => {
      const target = (username || '').replace(/^@+/, '').trim();
      if (!target) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      // Всегда предотвращаем дефолтное поведение
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      // Всегда открываем профиль в оверлее, независимо от контекста
      const handled = navigateProfile(event || null, { username: target });
      if (!handled) {
        // Если navigateProfile не обработал (например, из-за проверок), 
        // принудительно открываем оверлей напрямую
        openProfileOverlay({ username: target });
      }
    },
    [navigateProfile, openProfileOverlay],
  );

  const renderCommentText = useCallback(
    (text: string) => {
      const out: React.ReactNode[] = [];
      const MENTION_RE = /@([a-z0-9_]{1,50})/gi;
      let last = 0;
      let m: RegExpExecArray | null;
      MENTION_RE.lastIndex = 0;
      while ((m = MENTION_RE.exec(text))) {
        if (m.index > last) out.push(text.slice(last, m.index));
        const uname = m[1];
        const handleClick = (e: React.MouseEvent<HTMLElement>) => {
          openProfileFromComment(uname, e);
        };
        out.push(
          <Link
            key={`${m.index}-${uname}`}
            href={`/${uname}`}
            className="text-blue-600 hover:underline"
            onClick={handleClick}
          >
            @{uname}
          </Link>,
        );
        last = m.index + m[0].length;
      }
      if (last < text.length) out.push(text.slice(last));
      return out;
    },
    [openProfileFromComment],
  );

  const load = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    setErr(null);
    try {
      const url = `${API_BASE}/api/posts/${postId}/comments/list/?with_replies=1&per_page=500`;
      log('load() fetch', url);
      const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
      log('load() status', r.status, r.ok);
      if (!r.ok) throw new Error('Ошибка загрузки');
      const j: unknown = await r.json();
      log('load() json ok');
      const arr: CommentItem[] = Array.isArray(j)
        ? (j as CommentItem[])
        : Array.isArray((j as Record<string, unknown>)?.comments as CommentItem[])
        ? ((j as Record<string, unknown>).comments as unknown as CommentItem[])
        : [];
      const jObj =
        j && typeof j === 'object' ? (j as Record<string, unknown>) : null;
      const rawComments = jObj?.comments as unknown;
      const parsedCount = Array.isArray(j)
        ? (j as unknown[]).length
        : Array.isArray(rawComments)
        ? rawComments.length
        : 0;

      try {
        const postMetaSrc: unknown =
          isDict(jObj) && 'post' in jObj ? (jObj as Dict)['post'] : jObj;
        const postAuthor = extractAuthor(postMetaSrc);
        if (typeof postAuthor === 'string' && me) {
          setIsPostOwner(postAuthor === me);
        } else if (me) {
          const r2 = await fetch(`${API_BASE}/api/posts/${postId}/`, {
            credentials: 'include',
          });
          if (r2.ok) {
            const pj: unknown = await r2.json().catch(() => ({}));
            const pa = extractAuthor(pj);
            if (typeof pa === 'string') setIsPostOwner(pa === me);
          }
        }
      } catch {
        // ignore
      }

      log('load() parsed count', parsedCount);
      log('load() arr length', arr.length);
      const cached = authenticated ? readLikesCache(me) : {};
      setItems(
        arr.map((c) => ({
          ...(c as CommentItem),
          liked_by_me: !!(
            (cached as Record<number, true>)[c.id] || c.liked_by_me
          ),
        })),
      );
      const cnt = arr.reduce(
        (n, c) => n + (c.is_deleted ? 0 : 1),
        0,
      );
      if (lastCountRef.current !== cnt) {
        lastCountRef.current = cnt;
        syncCountRef.current?.(cnt);
      }
      log('load() done, count', cnt);
    } catch (e) {
      log('load() error', e);
      setErr(e instanceof Error ? e.message : 'Не удалось загрузить');
    } finally {
      setLoading(false);
      log('load() finally');
    }
  }, [postId, authenticated, me]);

  useEffect(() => {
    log('open changed', open, 'postId', postId, 'API_BASE', API_BASE);
    if (open) void load();
  }, [open, postId, load]);

  // ===== Стабилизация дерева =====
  const structureSig = useMemo(() => {
    const buf: string[] = [];
    for (const it of items)
      buf.push(`${it.id}:${getParentId(it as unknown as HasParentId)}`);
    return buf.join('|');
  }, [items]);

  const [frozenRoots, setFrozenRoots] = useState<CommentNode[]>([]);
  useEffect(() => {
    setFrozenRoots(buildTree(items));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureSig]);

  const [rootOrder, setRootOrder] = useState<number[] | null>(null);
  useEffect(() => {
    const ids = frozenRoots.map((r) => r.id);
    setRootOrder((prev) => {
      if (!prev) {
        const a = frozenRoots.slice();
        a.sort(cmpMainOthers);
        return a.map((r) => r.id);
      }
      const asSet = new Set(ids);
      const kept = prev.filter((id) => asSet.has(id));
      const newOnes = ids.filter((id) => !prev.includes(id));
      return [...kept, ...newOnes];
    });
  }, [frozenRoots]);

  const displayRoots: CommentNode[] = useMemo(() => {
    if (!rootOrder) return frozenRoots.slice();
    const map = new Map(frozenRoots.map((r) => [r.id, r] as const));
    return rootOrder.map((id) => map.get(id)).filter(Boolean) as CommentNode[];
  }, [frozenRoots, rootOrder]);

  const toggleLike = useCallback(
    async (id: number) => {
      if (!authenticated) {
        setLoginRequiredOpen(true);
        return;
      }
      if (hasTemporaryToken()) {
        setCompleteProfileModalOpen(true);
        return;
      }
      try {
        const current = byId.get(id);
        if (!current) return;
        const prevLiked = !!current.liked_by_me;
        const prevCount = current.likes_count ?? 0;
        const nextLiked = !prevLiked;
        const nextCount = Math.max(0, prevCount + (nextLiked ? 1 : -1));

        setItems((prev) =>
          prev.map((c) =>
            c.id === id
              ? { ...c, liked_by_me: nextLiked, likes_count: nextCount }
              : c,
          ),
        );

        const r = await fetch(
          `${API_BASE}/api/posts/comments/${id}/like-toggle/`,
          { method: 'POST', credentials: 'include' },
        );
        const j: unknown = await r.json().catch(() => null);
        const obj =
          j && typeof j === 'object' ? (j as Record<string, unknown>) : null;
        if (!r.ok || !obj) {
          setItems((prev) =>
            prev.map((c) =>
              c.id === id
                ? { ...c, liked_by_me: prevLiked, likes_count: prevCount }
                : c,
            ),
          );
          return;
        }
        const srvLiked = !!(obj.liked as boolean | undefined);
        const srvCount =
          typeof obj.likes_count === 'number'
            ? (obj.likes_count as number)
            : undefined;
        setItems((prev) =>
          prev.map((c) =>
            c.id === id
              ? {
                  ...c,
                  liked_by_me: srvLiked,
                  likes_count:
                    typeof srvCount === 'number' ? srvCount : c.likes_count,
                }
              : c,
          ),
        );
        setCachedLike(me, id, srvLiked);
      } catch {
        // откат уже сделан
      }
    },
    [authenticated, byId, me],
  );

  const onDeleteAsk = (id: number) => {
    setDeleteCommentId(id);
    setConfirmDeleteOpen(true);
  };

  const doDelete = useCallback(async () => {
    if (!deleteCommentId) return;
    try {
      const r = await fetch(
        `${API_BASE}/api/posts/comments/${deleteCommentId}/delete/`,
        { method: 'POST', credentials: 'include' },
      );
      if (!r.ok) throw new Error('Ошибка удаления');
      log('doDelete success', deleteCommentId);
      await load();
    } catch (e) {
      log('doDelete error', e);
      alert(e instanceof Error ? e.message : 'Не удалось удалить');
    } finally {
      setConfirmDeleteOpen(false);
      setDeleteCommentId(null);
    }
  }, [deleteCommentId, load]);

  const resizeTextarea = useCallback(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const cs = window.getComputedStyle(ta);
    const lh = parseFloat(cs.lineHeight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const brdY =
      parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const maxLines = 5.5;
    const minH = lh + padY + brdY;
    const maxH = lh * maxLines + padY + brdY;
    const next = Math.min(maxH, Math.max(minH, ta.scrollHeight));
    ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > maxH ? 'auto' : 'hidden';
  }, []);

  const setTextareaValue = useCallback(
    (v: string) => {
      textRef.current = v;
      const el = inputRef.current;
      if (el) {
        el.value = v;
        resizeTextarea();
      }
      setHasText(v.trim().length > 0);
    },
    [resizeTextarea],
  );

  useLayoutEffect(() => {
    resizeTextarea();
  }, [resizeTextarea]);

  useEffect(() => {
    const fn = () => resizeTextarea();
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, [resizeTextarea]);

  const alignAboveInputById = useCallback((domId: string) => {
    const el = document.getElementById(domId);
    const inputEl = inputRef.current?.closest(
      '[data-input-wrap]',
    ) as HTMLElement | null;
    if (!el || !inputEl) return;
    const scroller =
      (document.scrollingElement as HTMLElement) || document.documentElement;
    const getTop = () => scroller.scrollTop;
    const setTop = (v: number) => {
      scroller.scrollTop = v;
    };
    const targetRect = el.getBoundingClientRect();
    const inputRect = inputEl.getBoundingClientRect();
    const gap = 8;
    const dpr = window.devicePixelRatio || 1;
    const rawDelta = targetRect.bottom - (inputRect.top - gap);
    const delta = Math.round(rawDelta * dpr) / dpr;
    if (Math.abs(delta) < 0.5 / dpr) return;
    const prev = scroller.style.scrollBehavior;
    scroller.style.scrollBehavior = 'auto';
    setTop(getTop() + delta);
    scroller.style.scrollBehavior = prev;
  }, []);

  const getObservedRepliesPos = useCallback(
    (rootHost: HTMLElement | null, rootEl: HTMLElement | null) => {
      const rr = rootEl
        ? rootEl.getBoundingClientRect()
        : { top: 0, bottom: window.innerHeight };
      if (!rootHost)
        return {
          pos: 'inside' as 'above' | 'inside' | 'below',
          inView: true,
          rr,
        };
      const hr = rootHost.getBoundingClientRect();
      const controls = rootHost.querySelector(
        '[data-replies-controls]',
      ) as HTMLElement | null;
      let bottom = hr.bottom;
      if (controls)
        bottom = Math.max(bottom, controls.getBoundingClientRect().bottom);
      const top = hr.top;
      const EPS = 1,
        MARGIN = 8;
      const above = bottom <= rr.top + EPS + MARGIN;
      const below = top >= rr.bottom - EPS;
      const inView = !(above || below);
      const pos: 'above' | 'inside' | 'below' = inView
        ? 'inside'
        : above
        ? 'above'
        : 'below';
      return { pos, inView, rr };
    },
    [],
  );

  const hasExpandedReplyInView = useCallback(
    (rootHost: HTMLElement, rootEl: HTMLElement | null) => {
      const rr = rootEl
        ? rootEl.getBoundingClientRect()
        : { top: 0, bottom: window.innerHeight };
      const el = rootHost.querySelector(
        '[aria-expanded="true"], [data-expanded="true"], [data-collapsible-expanded="true"], .is-expanded, .expanded, .open',
      ) as HTMLElement | null;
      if (!el) return false;
      const host = (el.closest('li') as HTMLElement) || el;
      const r = host.getBoundingClientRect();
      const MARGIN = 6;
      const verticallyInView =
        r.bottom > rr.top + MARGIN && r.top < rr.bottom - MARGIN;
      return verticallyInView;
    },
    [],
  );

  const submit = useCallback(async () => {
    if (!authenticated) {
      setLoginRequiredOpen(true);
      return;
    }
    if (hasTemporaryToken()) {
      setCompleteProfileModalOpen(true);
      return;
    }
    if (submittingRef.current) return;
    const raw = textRef.current || '';
    const trimmed = raw.trim();
    if (!trimmed) return;
    const withMention =
      replyTarget && !trimmed.startsWith(`@${replyTarget.username}`)
        ? `@${replyTarget.username} ${trimmed}`
        : trimmed;
    const fd = new FormData();
    fd.set('text', withMention);
    if (replyTarget?.rootId) fd.set('parent_id', String(replyTarget.rootId));
    try {
      submittingRef.current = true;
      setSubmitting(true);
      const r = await fetch(`${API_BASE}/api/posts/${postId}/comments/`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const j: unknown = await r.json().catch(() => ({}));
      if (!r.ok) {
        const obj =
          j && typeof j === 'object' ? (j as Record<string, unknown>) : {};
        throw new Error((obj.error as string) || 'Не удалось отправить');
      }
      log('submit ok');
      setTextareaValue('');
      setReplyTarget(null);
      await load();
      const obj =
        j && typeof j === 'object' ? (j as Record<string, unknown>) : {};
      const comment =
        obj.comment && typeof obj.comment === 'object'
          ? (obj.comment as Record<string, unknown>)
          : null;
      const newId =
        comment && typeof comment.id === 'number'
          ? (comment.id as number)
          : undefined;
      log('submit newId', newId);
      if (newId) {
        const targetId = `comment-${newId}`;
        requestAnimationFrame(() => {
          let tries = 0;
          const tick = () => {
            const e = document.getElementById(targetId);
            if (e) {
              e.scrollIntoView({ block: 'nearest' });
              requestAnimationFrame(() => alignAboveInputById(targetId));
            } else if (tries++ < 60) {
              requestAnimationFrame(tick);
            }
          };
          tick();
        });
      }
    } catch (e) {
      log('submit error', e);
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  }, [
    authenticated,
    postId,
    replyTarget,
    load,
    setTextareaValue,
    alignAboveInputById,
  ]);

  const onHeaderTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    headerDragRef.current = { y0: t.clientY, active: true };
    setDragY(0);
  };
  const onHeaderTouchMove = (e: React.TouchEvent) => {
    const s = headerDragRef.current;
    if (!s || !s.active) return;
    const t = e.touches[0];
    const dy = t.clientY - s.y0;
    setDragY(Math.max(dy, 0));
  };
  const onHeaderTouchEnd = () => {
    headerDragRef.current = null;
    const TH = 60;
    const dy = dragY;
    setDragY(0);
    if (dy > TH) onClose();
  };

  const openActions = (id: number, author: string, serverCanDelete: boolean) => {
    const isSelf = !!(me && me === author);
    const canReport = !!(me && me !== author);
    const canDelete = !!(serverCanDelete || isSelf || isPostOwner);
    commentActionSheetModal.open({
      canReport,
      canDelete,
      onReport: () => {
        setReportCommentId(id);
        setReportOpen(true);
      },
      onDelete: () => {
        onDeleteAsk(id);
      },
    });
  };

  const onExpandCapture = useCallback(
    (e: React.MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || t.tagName.toLowerCase() !== 'button') return;
      if (!t.hasAttribute('aria-expanded')) return;
      const wrap = t.previousElementSibling as HTMLElement | null;
      const content = wrap
        ? (wrap.querySelector('[aria-expanded]') as HTMLElement | null)
        : null;
      const host = content ?? t;
      const scroller = host ? findScrollParent(host) : null;
      const scrollTop = scroller
        ? scroller.scrollTop
        : typeof window !== 'undefined'
        ? window.scrollY
        : 0;
      const rect = host?.getBoundingClientRect();
      const wasExpanded = t.getAttribute('aria-expanded') === 'true';
      log('expand-toggle', {
        wasExpanded,
        scrollTop,
        rectTop: rect?.top,
        rectBottom: rect?.bottom,
      });
    },
    [findScrollParent],
  );

  function Root({ c }: { c: CommentNode }) {
    const live = byId.get(c.id);
    return (
      <li id={`comment-${c.id}`} className="py-2" style={{ contain: 'layout paint' }}>
        <div className="group flex items-start gap-2 mt-1">
          <SharedAvatar
            href={`/${c.author}`}
            src={c.author_avatar_url}
            size={28}
            onClick={(e) => {
              openProfileFromComment(c.author, e);
            }}
          />
          <div
            className="min-w-0 flex-1"
            onClick={(e) => {
              const t = e.target as HTMLElement | null;
              if (t && t.closest('button[aria-expanded]')) return;
              setActiveId(c.id);
            }}
            onClickCapture={onExpandCapture}
          >
            <div className="flex items-center gap-2">
              <Link
                href={`/${c.author}`}
                className="text-[13px] font-semibold leading-none hover:underline"
                onClick={(e) => {
                  openProfileFromComment(c.author, e);
                }}
              >
                {c.author}
              </Link>
              <span className="ml-auto text-[12px] leading-none text-gray-500/60 whitespace-nowrap">
                {dateOnly(c.created_at)}
              </span>
            </div>
            <CollapsibleText
              text={c.text}
              className="mt-2 text-[14px]"
              lines={4}
              renderText={renderCommentText}
            />
            <div
              className="mt-1.5 flex items-center gap-3 text-xs text-gray-600"
              data-comment-actions
            >
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void toggleLike(c.id);
                }}
                className="inline-flex items-center gap-1"
                title={
                  (live?.liked_by_me ?? c.liked_by_me)
                    ? 'Убрать лайк'
                    : 'Поставить лайк'
                }
                aria-pressed={!!(live?.liked_by_me ?? c.liked_by_me)}
              >
                <HeartIcon
                  filled={!!(live?.liked_by_me ?? c.liked_by_me)}
                  className={[
                    'text-sm leading-none select-none',
                    (live?.liked_by_me ?? c.liked_by_me)
                      ? 'text-red-500'
                      : (live?.likes_count ?? c.likes_count ?? 0) > 0
                      ? 'text-black'
                      : 'text-gray-400',
                  ].join(' ')}
                />
              </button>
              <button
                type="button"
                className={[
                  'tabular-nums leading-none w-6 text-center',
                  (live?.likes_count ?? c.likes_count ?? 0) > 0
                    ? 'opacity-100 hover:underline'
                    : 'opacity-0 pointer-events-none',
                ].join(' ')}
                aria-hidden={(live?.likes_count ?? c.likes_count ?? 0) === 0}
                tabIndex={(live?.likes_count ?? c.likes_count ?? 0) === 0 ? -1 : 0}
                onClick={() => {
                  commentLikersModal.open({
                    postId,
                    commentId: c.id,
                    centered,
                  });
                }}
              >
                {Math.max(0, live?.likes_count ?? c.likes_count ?? 0)}
              </button>
              <button
                type="button"
                className="hover:underline"
                onClick={() => {
                  if (!authenticated) {
                    setLoginRequiredOpen(true);
                    return;
                  }
                  setReplyTarget({ username: c.author, rootId: c.id });
                  const v = inputRef.current?.value || '';
                  if (!v.startsWith(`@${c.author}`))
                    setTextareaValue(`@${c.author} `);
                  requestAnimationFrame(() => {
                    try {
                      inputRef.current?.focus({ preventScroll: true });
                    } catch {
                      inputRef.current?.focus();
                    }
                    alignAboveInputById(`comment-${c.id}`);
                  });
                }}
              >
                Ответить
              </button>
              {authenticated && (
                <MoreButton
                  onClick={() => openActions(c.id, c.author, !!c.can_delete)}
                  visible={activeId === c.id}
                />
              )}
            </div>
            {c.replies?.length ? (
              <RepliesBlock
                root={c}
                onLike={toggleLike}
                onReply={(uname, rootId, domId) => {
                  if (!authenticated) {
                    setLoginRequiredOpen(true);
                    return;
                  }
                  setReplyTarget({ username: uname, rootId });
                  const v = inputRef.current?.value || '';
                  if (!v.startsWith(`@${uname}`))
                    setTextareaValue(`@${uname} `);
                  requestAnimationFrame(() => {
                    try {
                      inputRef.current?.focus({ preventScroll: true });
                    } catch {
                      inputRef.current?.focus();
                    }
                    alignAboveInputById(domId);
                  });
                }}
                onOpenActions={(id, author, canDelete) =>
                  openActions(id, author, canDelete)
                }
                onOpenLikers={(id) => {
                  commentLikersModal.open({
                    postId,
                    commentId: id,
                    centered,
                  });
                }}
                setActiveId={setActiveId}
                activeId={activeId}
              />
            ) : null}
          </div>
        </div>
      </li>
    );
  }

  function RepliesBlock({
    root,
    onLike,
    onReply,
    onOpenActions,
    onOpenLikers,
    setActiveId,
    activeId,
  }: {
    root: CommentNode;
    onLike: (id: number) => void;
    onReply: (username: string, rootId: number, domId: string) => void;
    onOpenActions: (id: number, author: string, canDelete: boolean) => void;
    onOpenLikers: (id: number) => void;
    setActiveId: (id: number) => void;
    activeId: number | null;
  }) {
    const replies = root.replies || [];
    const total = replies.length;
    const [visible, setVisible] = useState(Math.min(total, 1));
    const rootRef = useRef<HTMLDivElement | null>(null);
    const scrollParentRef = useRef<HTMLElement | null>(null);
    const lastTopRef = useRef(0);
    const dirRef = useRef<'up' | 'down' | 'none'>('none');
    const lastPosRef = useRef<'above' | 'inside' | 'below'>('inside');

    useEffect(() => {
      setVisible((v) =>
        replies.length < v ? Math.max(1, replies.length) : v,
      );
    }, [replies.length]);

    const collapseRepliesWithoutJump = useCallback(() => {
      const host = rootRef.current;
      if (!host) {
        setVisible(1);
        return;
      }
      const scroller =
        scrollParentRef.current ?? findScrollParent(host);
      scrollParentRef.current = scroller;
      const getTop = () =>
        scroller ? scroller.scrollTop : window.scrollY;
      const setTop = (val: number) => {
        if (scroller) scroller.scrollTop = val;
        else window.scrollTo({ top: val });
      };

      const beforeRect = host.getBoundingClientRect();
      const controlsBefore = host.querySelector(
        '[data-replies-controls]',
      ) as HTMLElement | null;
      const beforeBottom = controlsBefore
        ? Math.max(
            beforeRect.bottom,
            controlsBefore.getBoundingClientRect().bottom,
          )
        : beforeRect.bottom;
      const prevTop = getTop();

      let restore: (() => void) | null = null;
      if (!scroller) {
        const el = document.documentElement;
        const prev = el.style.scrollBehavior;
        el.style.scrollBehavior = 'auto';
        restore = () => {
          el.style.scrollBehavior = prev;
        };
      }

      setVisible(1);

      const afterRect = host.getBoundingClientRect();
      const controlsAfter = host.querySelector(
        '[data-replies-controls]',
      ) as HTMLElement | null;
      const afterBottom = controlsAfter
        ? Math.max(
            afterRect.bottom,
            controlsAfter.getBoundingClientRect().bottom,
          )
        : afterRect.bottom;
      const dpr = window.devicePixelRatio || 1;
      const rawDelta = beforeBottom - afterBottom;
      const delta = Math.round(rawDelta * dpr) / dpr;
      const EPS = 1.25 / dpr;
      if (
        getObservedRepliesPos(host, scroller ?? null).pos === 'above' &&
        delta > EPS
      ) {
        requestAnimationFrame(() => {
          setTop(prevTop - delta);
          requestAnimationFrame(() => restore?.());
        });
      } else {
        requestAnimationFrame(() => restore?.());
      }
    }, [findScrollParent, getObservedRepliesPos]);

    useEffect(() => {
      const el = rootRef.current;
      if (!el) return;
      const scroller =
        scrollParentRef.current ?? findScrollParent(el);
      scrollParentRef.current = scroller;
      const getTop = () =>
        scroller ? scroller.scrollTop : window.scrollY;

      const decide = () => {
        if (visible <= 1) {
          lastPosRef.current = 'inside';
          return;
        }
        if (hasExpandedReplyInView(el, scroller ?? null)) {
          lastPosRef.current = 'inside';
          return;
        }
        const { pos } = getObservedRepliesPos(
          el,
          scroller ?? null,
        );
        if (
          pos === 'below' &&
          lastPosRef.current === 'inside' &&
          dirRef.current === 'up'
        )
          collapseRepliesWithoutJump();
        lastPosRef.current = pos;
      };

      const onScroll = () => {
        const t = getTop();
        dirRef.current =
          t < lastTopRef.current
            ? 'up'
            : t > lastTopRef.current
            ? 'down'
            : dirRef.current;
        lastTopRef.current = t;
        decide();
      };

      lastTopRef.current = getTop();
      decide();
      if (scroller)
        scroller.addEventListener('scroll', onScroll, { passive: true });
      else window.addEventListener('scroll', onScroll, { passive: true });
      const onResize = () => decide();
      window.addEventListener('resize', onResize);
      return () => {
        if (scroller) scroller.removeEventListener('scroll', onScroll);
        else window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onResize);
      };
    }, [
      visible,
      collapseRepliesWithoutJump,
      findScrollParent,
      getObservedRepliesPos,
      hasExpandedReplyInView,
    ]);

    if (!total) return null;

    return (
      <div
        ref={rootRef}
        className="replies-anchor-fix mt-2 pl-4 border-l border-gray-200"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <ul>
          {replies.map((r, idx) => {
            const show = visible > 1 ? idx < visible : idx === 0;
            const liveR = byId.get(r.id);
            return (
              <li
                key={r.id}
                id={`comment-${r.id}`}
                className="mt-2.5"
                hidden={!show}
              >
                <div className="group flex items-start gap-2">
                  <SharedAvatar
                    href={`/${r.author}`}
                    src={r.author_avatar_url}
                    size={24}
                    onClick={(e) => {
                      openProfileFromComment(r.author, e);
                    }}
                  />
                  <div
                    className="min-w-0 flex-1"
                    onClick={(e) => {
                      const t = e.target as HTMLElement | null;
                      if (t && t.closest('button[aria-expanded]')) return;
                      setActiveId(r.id);
                    }}
                    onClickCapture={onExpandCapture}
                  >
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/${r.author}`}
                        className="text-[12px] font-semibold leading-none hover:underline"
                        onClick={(e) => {
                          openProfileFromComment(r.author, e);
                        }}
                      >
                        {r.author}
                      </Link>
                    </div>
                    <CollapsibleText
                      text={r.text}
                      className="mt-3 text-[14px]"
                      lines={4}
                      renderText={renderCommentText}
                    />
                    <div
                      className="mt-1.5 flex items-center gap-3 text-xs text-gray-600"
                      data-comment-actions
                    >
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void onLike(r.id);
                        }}
                        className="inline-flex items-center gap-1"
                        title={
                          (liveR?.liked_by_me ?? r.liked_by_me)
                            ? 'Убрать лайк'
                            : 'Поставить лайк'
                        }
                        aria-pressed={!!(liveR?.liked_by_me ?? r.liked_by_me)}
                      >
                        <HeartIcon
                          filled={!!(liveR?.liked_by_me ?? r.liked_by_me)}
                          className={[
                            'text-sm leading-none select-none',
                            (liveR?.liked_by_me ?? r.liked_by_me)
                              ? 'text-red-500'
                              : (liveR?.likes_count ?? r.likes_count ?? 0) > 0
                              ? 'text-black'
                              : 'text-gray-400',
                          ].join(' ')}
                        />
                      </button>
                      <button
                        type="button"
                        className={[
                          'tabular-nums leading-none w-6 text-center',
                          (liveR?.likes_count ?? r.likes_count ?? 0) > 0
                            ? 'opacity-100 hover:underline'
                            : 'opacity-0 pointer-events-none',
                        ].join(' ')}
                        aria-hidden={
                          (liveR?.likes_count ?? r.likes_count ?? 0) === 0
                        }
                        tabIndex={
                          (liveR?.likes_count ?? r.likes_count ?? 0) === 0
                            ? -1
                            : 0
                        }
                        onClick={() => onOpenLikers(r.id)}
                      >
                        {Math.max(
                          0,
                          liveR?.likes_count ?? r.likes_count ?? 0,
                        )}
                      </button>
                      {!r.is_deleted && (
                        <button
                          type="button"
                          className="hover:underline"
                          onClick={() =>
                            onReply(r.author, root.id, `comment-${r.id}`)
                          }
                        >
                          Ответить
                        </button>
                      )}
                      {authenticated && (
                        <MoreButton
                          onClick={() =>
                            onOpenActions(r.id, r.author, !!r.can_delete)
                          }
                          visible={activeId === r.id}
                        />
                      )}
                      <span className="ml-auto text-[12px] leading-none text-gray-500/60 whitespace-nowrap">
                        {dateOnly(r.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {total > 1 && visible < total && (
          <div className="mt-2" data-replies-controls>
            <button
              type="button"
              className="text-xs text-gray-400 hover:text-gray-600"
              onClick={() =>
                setVisible((v) =>
                  Math.min(total, v + Math.min(10, total - v)),
                )
              }
            >
              показать ещё {Math.min(10, total - visible)}
            </button>
          </div>
        )}
        {total > 1 && visible > 1 && (
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

  // Когда skipPortal=true, компонент рендерится через pushScreen, поэтому используем absolute вместо fixed
  const positionClass = skipPortal ? 'absolute inset-0' : 'fixed inset-0 z-[2500]';
  
  const content = (
    <div
      className={`${positionClass} post-profile-comments`}
      role="dialog"
      aria-modal
    >
      <div
        className="absolute inset-0 bg-black/40"
        onMouseDown={onClose}
        onTouchStart={onClose}
        aria-hidden
      />
      <div
        className={
          centered
            ? 'absolute inset-0 flex items-center justify-center px-4'
            : 'absolute left-0 right-0 bottom-0'
        }
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div
          className="bg-white rounded-2xl sm:rounded-t-2xl shadow-2xl flex flex-col mx-auto w-full max-w-[min(720px,100vw)] sm:max-w-[min(720px,calc(100vw-32px))]"
          style={{
            height: SHEET_HEIGHT,
            paddingLeft: centered ? 16 : undefined,
            paddingRight: centered ? 16 : undefined,
            transform:
              !centered && dragY
                ? `translateY(${Math.max(0, dragY)}px)`
                : undefined,
            transition:
              !centered && dragY ? 'none' : 'transform 160ms ease',
          }}
        >
          <div
            ref={headerElRef}
            className="h-[48px] flex items-center justify-between px-3 border-b border-gray-100 select-none"
            onTouchStart={centered ? undefined : onHeaderTouchStart}
            onTouchMove={centered ? undefined : onHeaderTouchMove}
            onTouchEnd={centered ? undefined : onHeaderTouchEnd}
          >
            {centered ? (
              <>
                <div className="w-8 h-8" />
                <div className="text-[15px] font-medium">Комментарии</div>
                <button
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
                  aria-label="Закрыть"
                  onClick={onClose}
                >
                  ✕
                </button>
              </>
            ) : (
              <>
                <button
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
                  aria-label="Свернуть"
                  onClick={onClose}
                >
                  <ArrowDownIcon />
                </button>
                <div className="text-[15px] font-medium">Комментарии</div>
                <div className="w-8 h-8" />
              </>
            )}
          </div>

          <div 
            ref={commentsScrollRef}
            className="flex-1 overflow-y-auto hide-scrollbar"
            style={{
              msOverflowStyle: 'none',
              scrollbarWidth: 'none',
            } as React.CSSProperties}
          >
            {loading ? (
              <div className="px-4 py-6 text-gray-500">Загрузка…</div>
            ) : err ? (
              <div className="px-4 py-6 text-red-600">{err}</div>
            ) : displayRoots.length === 0 ? (
              <div className="px-4 py-6 text-gray-500">
                Пока нет комментариев.
              </div>
            ) : (
              <ul className="px-3 py-2">
                {displayRoots.map((c) => (
                  <Root key={c.id} c={c} />
                ))}
              </ul>
            )}
          </div>

          {authenticated && (
            <div
              data-input-wrap
              className="border-t border-gray-200 bg-white"
              style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
              {replyTarget && (
                <div className="px-3 pt-2 text-xs text-gray-500">
                  Ответ @{replyTarget.username}{' '}
                  <button
                    className="text-blue-600 hover:underline"
                    onClick={() => {
                      const u = replyTarget.username;
                      const headRe = new RegExp(
                        `^\\s*@+${escRe(u)}\\b\\s*`,
                        'i',
                      );
                      const anyRe = new RegExp(
                        `(^|\\s)@+${escRe(u)}\\b\\s*`,
                        'i',
                      );
                      setReplyTarget(null);
                      const el = inputRef.current;
                      if (el) {
                        const v = el.value;
                        const nv = v
                          .replace(headRe, '')
                          .replace(anyRe, '$1');
                        el.value = nv;
                        textRef.current = nv;
                        setHasText(nv.trim().length > 0);
                        requestAnimationFrame(() => el.focus());
                      }
                    }}
                  >
                    Отмена
                  </button>
                </div>
              )}
              <div className="px-3 py-2">
                <div className="flex items-end gap-3">
                  <Link
                    href={
                      profile?.username ? `/${profile.username}` : '/auth/login'
                    }
                    prefetch={false}
                    className="-translate-y-[5px] block"
                    title={profile?.username ? 'Мой профиль' : 'Войти'}
                    aria-label={
                      profile?.username
                        ? 'Открыть мой профиль'
                        : 'Войти'
                    }
                    onClick={(e) => {
                      if (!profile?.username) return;
                      openProfileFromComment(profile.username, e);
                    }}
                  >
                    <img
                      src={
                        (profile?.profile_picture &&
                          (/^(?:https?:)?\/\//i.test(
                            profile.profile_picture,
                          )
                            ? profile.profile_picture
                            : API_BASE +
                              (profile.profile_picture.startsWith('/')
                                ? profile.profile_picture
                                : '/' + profile.profile_picture))) ||
                        AVA_PH
                      }
                      alt=""
                      className="w-9 h-9 rounded-full object-cover border border-gray-200"
                    />
                  </Link>
                  <div className="flex-1">
                    <div className="relative">
                      <textarea
                        ref={inputRef}
                        defaultValue=""
                        onInput={(e) => {
                          const v = e.currentTarget.value;
                          textRef.current = v;
                          resizeTextarea();
                          setHasText(v.trim().length > 0);
                        }}
                        onFocus={(e) => {
                          try {
                            e.currentTarget.focus({ preventScroll: true });
                          } catch {
                            // ignore
                          }
                        }}
                        rows={1}
                        placeholder={
                          replyTarget
                            ? `Ответ @${replyTarget.username}…`
                            : 'Оставьте комментарий…'
                        }
                        className="w-full resize-none rounded-2xl border border-gray-200 bg-white px-3 py-2 pr-12 text-[15px] leading-5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        style={{ height: 'auto' }}
                      />
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.preventDefault();
                          ev.stopPropagation();
                          if (!hasText || submitting) return;
                          void submit();
                        }}
                        disabled={!hasText || submitting}
                        aria-busy={submitting}
                        aria-label="Отправить"
                        className="absolute right-3 bottom-[10px] inline-flex items-center justify-center w-7 h-7 rounded-full text-white transition bg-[var(--brand,#2563eb)] hover:bg-[var(--brand-hover,#1d4ed8)] disabled:opacity-50 disabled:cursor-not-allowed"
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
        </div>
      </div>

      <ConfirmModal
        open={loginRequiredOpen}
        onCancel={() => setLoginRequiredOpen(false)}
        onConfirm={() => {
          setLoginRequiredOpen(false);
          clearScreens();
          setTimeout(() => {
            try {
              location.assign('/auth/login');
            } catch {
              // ignore
            }
          }, 150);
        }}
        title="Данное действие доступно только авторизованным пользователям"
        cancelLabel="Отмена"
        confirmLabel="Войти"
      />
      <CompleteProfileActionModal
        open={completeProfileModalOpen}
        onClose={() => setCompleteProfileModalOpen(false)}
      />
      <ConfirmModal
        open={confirmDeleteOpen}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={doDelete}
        title="Удалить комментарий?"
        message="Действие нельзя будет отменить."
        confirmLabel="Удалить"
        destructive
      />
      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        kind="post_comment"
        targetId={reportCommentId || 0}
        isReply={false}
      />
      <style jsx global>{`
        /* скрываем бегунок на контейнере комментариев - применяем с !important для гарантии */
        .hide-scrollbar { 
          -ms-overflow-style: none !important; 
          scrollbar-width: none !important; 
        }
        .hide-scrollbar::-webkit-scrollbar { 
          display: none !important; 
          width: 0 !important; 
          height: 0 !important; 
          background: transparent !important;
        }
        .hide-scrollbar::-webkit-scrollbar-track {
          display: none !important;
          background: transparent !important;
        }
        .hide-scrollbar::-webkit-scrollbar-thumb {
          display: none !important;
          background: transparent !important;
        }
        /* Дополнительно для мобильных браузеров */
        @media (max-width: 768px) {
          .hide-scrollbar {
            -webkit-overflow-scrolling: touch;
            -ms-overflow-style: none !important;
            scrollbar-width: none !important;
          }
          .hide-scrollbar::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
            -webkit-appearance: none !important;
          }
        }
      `}</style>
    </div>
  );

  if (!open) return null;

  if (skipPortal) {
    return content;
  }

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(content, document.body);
}
