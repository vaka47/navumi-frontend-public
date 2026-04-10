'use client';

import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { campPathFrom } from '@/components/post/helpers/campPath';
import { PHOTO_SEARCH_TAB_PARAM } from '@/lib/photoSearchParams';
import { useRouter } from 'next/navigation';
import { Calendar } from 'lucide-react';
import { Avatar as SharedAvatar } from '@/components/comments/shared';
import ConfirmModal from '@/components/ui/ConfirmModal';
import ReportModal from '@/components/common/ReportModal';
import PostActionSheet from '@/components/post/mobile/PostActionSheet';
import { useAuth } from '@/context/AuthContext';
import { useAppNavigation } from '@/hooks/useAppNavigation';
import { rememberReturn } from '@/lib/navBack';
import { useSearchOverlay } from '@/hooks/useSearchOverlay';
import { hasTemporaryToken } from '@/lib/checkTemporaryToken';
import CompleteProfileActionModal from '@/components/CompleteProfileActionModal';
import { useLayerStack } from '@/context/LayerStackContext';
import { getBrowserApiBase } from '@/lib/apiBase';
import MentionedProfileInline from '@/components/post/MentionedProfileInline';

// показываем полную отмеченную локацию (как на странице поста)
function normalizeLocation(location?: string | null): string {
  return (location || '').trim();
}

const sanitizeUsername = (value?: string | null) => (value || '').replace(/^@+/, '').trim();

function cap99(n?: number | null): string {
  const v = Math.max(0, Number(n ?? 0));
  return v >= 100 ? '99+' : String(v);
}

export type ProfileTextPostProps = {
  postId: number | string;
  username: string;
  avatarUrl?: string | null;
  fallbackAvatarUrl?: string | null;
  text: string;
  createdAt?: string | null;
  locationName?: string | null;
  activities?: Array<{ id: number | string; name: string }>;
  hashtags?: Array<{ id: number | string; name: string }>;
  camp?: {
    organizerUsername?: string | null;
    campNumber?: number | string | null;
    url?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    title?: string | null;
  } | null;
  mediaSlot?: ReactNode;
  commentPreview?: {
    id?: number | string;
    text?: string | null;
    authorUsername?: string | null;
    authorDisplayName?: string | null;
    avatarUrl?: string | null;
  } | null;
  liked?: boolean;
  likesCount?: number | null;
  commentsCount?: number | null;
  marksCount?: number | null;
  onToggleLike?: () => void;
  onOpenComments?: () => void;
  onOpenLikers?: () => void;
  onOpenTags?: () => void;
  onShare?: () => void;
  onDeleted?: (postId: number | string) => void;
  onRequestEdit?: () => void; // для десктопа: открыть модалку редактирования
  onNavigateAway?: () => void;
  onCommentPreviewClick?: () => void;
  // Куда вести по клику на локацию/активности/хэштеги: 'photos' (по умолчанию) или 'articles'
  filterTargetTab?: 'photos' | 'articles';
};

export default function ProfileTextPost(props: ProfileTextPostProps) {
  const {
    postId, username, avatarUrl, fallbackAvatarUrl, text, createdAt,
    locationName, activities = [], hashtags = [], camp,
    mediaSlot, commentPreview,
    liked, likesCount, commentsCount, marksCount,
    onToggleLike, onOpenComments, onOpenLikers, onOpenTags, onShare,
    onDeleted,
    onRequestEdit,
    onNavigateAway,
    onCommentPreviewClick,
    filterTargetTab = 'photos',
  } = props;

  const { authenticated, profile } = useAuth();
  const router = useRouter();
  const { navigateCamp, navigateProfile } = useAppNavigation();
  const openSearchOverlay = useSearchOverlay();
  const { clearScreens } = useLayerStack();
  const me = profile?.username ?? null;
  const isAuthor = !!(me && me === username);
  const [actionsOpen, setActionsOpen] = useState(false);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [loginRequiredOpen, setLoginRequiredOpen] = useState(false);
  const [completeProfileModalOpen, setCompleteProfileModalOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const [expanded, setExpanded] = useState(false);
  const textRef = useRef<HTMLDivElement | null>(null);
  const measRef = useRef<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState<boolean>(() => (text ? text.length > 220 : false));
  const clampLines = 4;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const el = textRef.current;
    const meas = measRef.current;
    if (!el || !meas) return;
    const measure = () => {
      try {
        const cs = window.getComputedStyle(el);
        const lhRaw = parseFloat(cs.lineHeight);
        const fs = parseFloat(cs.fontSize) || 15;
        const lh = Number.isFinite(lhRaw) && lhRaw > 0 ? lhRaw : (fs * 1.65);
        meas.style.width = `${el.clientWidth || el.offsetWidth}px`;
        const fullH = meas.scrollHeight || meas.clientHeight;
        const maxH = lh * clampLines - 0.5;
        setOverflowing(fullH > maxH + 1);
      } catch { /* noop */ }
    };
    measure();
    const hasRO = typeof ResizeObserver !== 'undefined';
    const ro = hasRO ? new ResizeObserver(() => measure()) : null;
    if (ro) ro.observe(el);
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); if (ro) ro.disconnect(); };
  }, [text]);
  const loc = normalizeLocation(locationName || '');
  const campHref = useMemo(() => {
    if (!camp) return '';
    const owner = sanitizeUsername(camp.organizerUsername) || sanitizeUsername(username);
    const config: Parameters<typeof campPathFrom>[1] = {};
    const campNumber = camp.campNumber;
    if (campNumber !== undefined && campNumber !== null && String(campNumber).trim() !== '') {
      config.camp_number = campNumber as string | number;
    }
    if (camp.url) {
      config.url = camp.url;
    }
    const resolved = campPathFrom(owner || undefined, config);
    return resolved || (camp.url || '');
  }, [camp, username]);
  const resolvedAvatar = avatarUrl || fallbackAvatarUrl || null;
  const previewAuthorUsername = commentPreview?.authorUsername ? sanitizeUsername(commentPreview.authorUsername) : null;
  const previewAuthorDisplay = (commentPreview?.authorDisplayName || (previewAuthorUsername ? `@${previewAuthorUsername}` : '')).trim();
  const previewHref = previewAuthorUsername ? `/${previewAuthorUsername}` : `/${username}`;
  const previewText = (commentPreview?.text || '').trim();
  const handleCampNavigate = React.useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!campHref) return;
    const handled = navigateCamp(event, {
      username: camp?.organizerUsername || username,
      campNumber: camp?.campNumber ?? null,
      campPath: campHref,
    });
    if (handled) onNavigateAway?.();
  }, [campHref, camp, username, onNavigateAway, navigateCamp]);

  const goToSearch = (key: 'location' | 'activities' | 'hashtags', value?: string, id?: number | string, name?: string) => {
    try { rememberReturn('post'); } catch { /* noop */ }
    const p = new URLSearchParams();
    const tabParam = filterTargetTab === 'photos' ? PHOTO_SEARCH_TAB_PARAM : 'articles';
    p.set('tab', tabParam);
    p.set('collapsed', '1');
    if (key === 'location' && value) {
      p.set('location', value);
    } else if (key === 'activities' && id != null) {
      p.append('activities', String(id));
    } else if (key === 'hashtags' && id != null) {
      p.append('hashtags', String(id));
    } else if (name) {
      p.set('query', name.replace(/^#/, ''));
    }
    openSearchOverlay(p);
  };

  return (
    <article className="py-3 px-3 sm:px-4">
      {/* 1. первая строка: аватар + имя + три точки справа */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <SharedAvatar
            href={`/${username}`}
            src={resolvedAvatar || null}
            size={24}
            onClick={(event) => {
              const handled = navigateProfile(event as unknown as React.MouseEvent<HTMLElement>, {
                username: sanitizeUsername(username),
              });
              if (handled) onNavigateAway?.();
            }}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              <Link
                href={`/${username}`}
                className="font-semibold hover:underline truncate"
                onClick={(event) => {
                  const handled = navigateProfile(event as unknown as React.MouseEvent<HTMLElement>, {
                    username: sanitizeUsername(username),
                  });
                  if (handled) onNavigateAway?.();
                }}
              >
                {username}
              </Link>
              {loc && filterTargetTab !== 'articles' ? (
                <button
                  type="button"
                  className="text-[12px] text-gray-500 truncate hover:underline"
                  title={loc}
                  onClick={() => goToSearch('location', loc)}
                >
                  • {loc}
                </button>
              ) : null}
            </div>
            {loc && filterTargetTab === 'articles' ? (
              <button
                type="button"
                className="mt-0.5 block text-[12px] text-gray-500 hover:underline truncate"
                title={loc}
                onClick={() => goToSearch('location', loc)}
              >
                {loc}
              </button>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={actionsOpen}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-[20px] font-bold"
          onClick={() => setActionsOpen(true)}
          title="Действия"
        >
          ⋯
        </button>
      </div>

      {mediaSlot ? (
        <div className="-mx-3 sm:-mx-4 mt-3">
          {mediaSlot}
        </div>
      ) : null}

      {/* 3. кэмп без дат — иконка календаря + название, одна строка с троеточием */}
      {camp ? (
        <div className="mt-0.5 text-[13px] min-w-0">
          {campHref ? (
            <Link
              href={campHref}
              className="inline-flex items-center gap-2 min-w-0 text-blue-600 hover:underline"
              title={camp?.title?.trim() || 'Кэмп'}
              onClick={handleCampNavigate}
            >
              <Calendar className="w-4 h-4 text-blue-600 shrink-0" aria-hidden />
              <span className="truncate">{camp?.title?.trim() || 'Кэмп'}</span>
            </Link>
          ) : (
            <span
              className="inline-flex items-center gap-2 min-w-0 text-gray-900"
              title={camp?.title?.trim() || 'Кэмп'}
            >
              <Calendar className="w-4 h-4 text-blue-600 shrink-0" aria-hidden />
              <span className="truncate">{camp?.title?.trim() || 'Кэмп'}</span>
            </span>
          )}
        </div>
      ) : null}

      {/* 4. текст поста: 4 строки + разворот + плашки активностей/тэгов */}
      <div className="mt-2">
        {/* скрытый измеритель для определения переполнения */}
        <div
          ref={measRef}
          className="absolute -z-10 opacity-0 pointer-events-none whitespace-pre-wrap break-words text-[15px] leading-[1.65]"
          aria-hidden
        >
          {text}
        </div>
        <div
          className={[
            'whitespace-pre-wrap break-words overflow-hidden clamped text-[15px] leading-[1.65] text-gray-900',
            expanded ? 'line-clamp-none' : ''
          ].join(' ')}
          ref={textRef}
          style={!expanded ? ({ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 4 } as React.CSSProperties) : undefined}
        >
          <MentionedProfileInline text={text} />
        </div>
        {/* плашки активностей/тэгов */}
        {(() => {
          const hasActs = Array.isArray(activities) && activities.length > 0;
          const hasTags = Array.isArray(hashtags) && hashtags.length > 0;
          const showChips = expanded || !overflowing;
          if (!showChips || (!hasActs && !hasTags)) return null;
          return (
            <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
              {hasActs && activities.map(a => (
                <span
                  key={`act-${a.id}`}
                  role="link"
                  tabIndex={0}
                  onClick={() => goToSearch('activities', undefined, a.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToSearch('activities', undefined, a.id); } }}
                  title={`Показать посты по активности: ${a.name}`}
                  className="px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-700 cursor-pointer hover:bg-gray-100"
                >
                  {a.name}
                </span>
              ))}
              {hasTags && hashtags.map(h => (
                <span
                  key={`tag-${h.id}`}
                  role="link"
                  tabIndex={0}
                  onClick={() => goToSearch('hashtags', undefined, h.id, h.name)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToSearch('hashtags', undefined, h.id, h.name); } }}
                  title={`Показать посты по тегу: #${h.name}`}
                  className="px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-700 cursor-pointer hover:bg-gray-100"
                >
                  #{h.name}
                </span>
              ))}
            </div>
          );
        })()}
        {/* кнопка развернуть/свернуть */}
        {text && text.length > 0 && overflowing && (
          <button type="button" onClick={() => setExpanded(v => !v)} className="mt-1 inline-block text-xs text-gray-400 hover:text-gray-600">
            {expanded ? 'свернуть' : 'развернуть'}
          </button>
        )}
      </div>

      {previewText ? (
        <button
          type="button"
          onClick={onCommentPreviewClick ?? onOpenComments}
          className="mt-3 w-full rounded-2xl border border-gray-100 bg-gray-50/70 px-3 py-2 text-left flex items-start gap-2 hover:bg-gray-100 transition"
        >
          <SharedAvatar
            href={previewHref}
            src={commentPreview?.avatarUrl || undefined}
            size={30}
            onClick={(event) => {
              const targetUsername = previewAuthorUsername || sanitizeUsername(username);
              const handled = navigateProfile(event as unknown as React.MouseEvent<HTMLElement>, {
                username: targetUsername,
              });
              if (handled) onNavigateAway?.();
            }}
          />
          <div className="min-w-0">
            {previewAuthorDisplay ? (
              <div className="text-[13px] font-semibold text-gray-900 truncate">{previewAuthorDisplay}</div>
            ) : null}
            <p className="text-[13px] leading-snug text-gray-700 line-clamp-2 whitespace-pre-wrap">{previewText}</p>
          </div>
        </button>
      ) : null}

      {/* 5. действия — без верхней разделительной линии */}
      <div className="mt-2 pt-2 flex justify-center">
        <div className="flex items-center gap-6 py-1 text-gray-700">
          {/* ЛАЙК */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleLike}
              aria-pressed={!!liked}
              title={liked ? 'Убрать лайк' : 'Поставить лайк'}
              className={[
                'inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-50 transition',
                liked ? 'text-red-600' : 'text-gray-700'
              ].join(' ')}
          >
            <IconHeart filled={!!liked} />
          </button>
            {(likesCount ?? 0) > 0 ? (
              <button type="button" onClick={onOpenLikers} className="text-sm tabular-nums leading-none hover:underline" aria-label="Список лайкнувших">{cap99(likesCount)}</button>
            ) : null}
          </div>

          {/* ОТМЕЧЕННЫЕ ПРОФИЛИ — показываем только если есть отмеченные */}
          {(marksCount ?? 0) > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenTags}
                title="Отмеченные профили"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full text-gray-700 hover:bg-gray-50 transition"
              >
                <IconUser />
              </button>
              <button type="button" onClick={onOpenTags} className="text-sm tabular-nums leading-none hover:underline">{cap99(marksCount)}</button>
            </div>
          )}

          {/* КОММЕНТАРИИ */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenComments}
              title="Комментарии"
              className="inline-flex items-center justify-center w-9 h-9 rounded-full text-gray-700 hover:bg-gray-50 transition"
            >
              <IconComment />
            </button>
            {(commentsCount ?? 0) > 0 ? (
              <button type="button" onClick={onOpenComments} className="text-sm tabular-nums leading-none hover:underline">{cap99(commentsCount)}</button>
            ) : null}
          </div>

          {/* ПОДЕЛИТЬСЯ */}
          <button
            type="button"
            onClick={onShare}
            title="Поделиться"
            className="inline-flex items-center justify-center w-9 h-9 rounded-full text-gray-700 hover:bg-gray-50 transition"
          >
            <IconShare />
          </button>
        </div>
      </div>

      {/* нижняя строка с датой публикации под экшенами — по центру, без подчёркивания */}
      <div className="mt-1 text-center text-[12px] text-gray-500/80 leading-none relative z-[2]">
        {createdAt ? new Date(createdAt).toLocaleDateString('ru-RU') : ''}
      </div>

      {/* Модалка действий по посту — как на странице фото/кэмпа */}
      <PostActionSheet
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        actions={isAuthor ? [
          ...(onShare ? [{ label: 'Поделиться', onClick: onShare }] : []),
          {
            label: 'Редактировать',
            onClick: () => {
              if (onRequestEdit) {
                onRequestEdit();
                return;
              }
              const href = `/${username}/post/${postId}/edit`;
              try {
                if (router && typeof router.push === 'function') {
                  router.push(href);
                } else {
                  location.assign(href);
                }
              } catch {
                location.assign(href);
              }
            },
          },
          { label: 'Удалить', destructive: true, onClick: () => setConfirmDeleteOpen(true) },
        ] : [
          ...(onShare ? [{ label: 'Поделиться', onClick: onShare }] : []),
          { label: 'Пожаловаться', destructive: true, onClick: () => { if (!authenticated) { setLoginRequiredOpen(true); return; } if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; } setReportOpen(true); } },
        ]}
      />

      {/* Модалки: удалить / пожаловаться / залогиниться */}
      <ConfirmModal
        open={confirmDeleteOpen}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={async () => {
          const API = getBrowserApiBase();
          if (!API || !postId) { setConfirmDeleteOpen(false); return; }
          try {
            const r = await fetch(`${API}/api/posts/${postId}/delete/`, { method: 'POST', credentials: 'include' });
            if (!r.ok) throw new Error('Не удалось удалить пост');
            setConfirmDeleteOpen(false);
            if (onDeleted) onDeleted(postId);
            try {
              if (typeof window !== 'undefined') {
                const idNum = Number(postId);
                window.dispatchEvent(
                  new CustomEvent('profile_post_deleted', {
                    detail: { id: Number.isFinite(idNum) ? idNum : postId },
                  }),
                );
              }
            } catch {
              /* noop */
            }
          } catch (e) {
            alert(e instanceof Error ? e.message : 'Ошибка удаления');
          } finally { /* noop */ }
        }}
        title="Удалить пост?"
        message="Действие нельзя отменить."
        cancelLabel="Отмена"
        confirmLabel="Удалить"
        variant="simple"
      />

      <ConfirmModal
        open={loginRequiredOpen}
        onCancel={() => setLoginRequiredOpen(false)}
        onConfirm={() => {
          setLoginRequiredOpen(false);
          clearScreens();
          setTimeout(() => {
            try { location.assign('/auth/login'); } catch {}
          }, 150);
        }}
        title="Данное действие доступно только для авторизованных пользователей"
        cancelLabel="Отмена"
        confirmLabel="Войти"
      />
      <CompleteProfileActionModal
        open={completeProfileModalOpen}
        onClose={() => setCompleteProfileModalOpen(false)}
      />

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        kind="profile_post"
        targetId={Number(postId)}
        linkHint={`/${username}/post/${postId}`}
      />
    </article>
  );
}

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
