"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import FeedPostCard from "@/components/feed/FeedPostCard";
import type { TaggedProfile } from "@/components/post/mobile/TaggedProfilesOverlay";
import type { CampCardData } from "@/components/camp/CampCard";
import SwipeCarousel from "@/components/ui/SwipeCarousel";
import { absUrl, normalizeCampToCardData } from "@/components/camp/campNormalize";
import { Avatar as SharedAvatar } from "@/components/comments/shared";
import PostActionSheet from "@/components/post/mobile/PostActionSheet";
import ConfirmModal from "@/components/ui/ConfirmModal";
import ReportModal from "@/components/common/ReportModal";
import { useAuth } from "@/context/AuthContext";
import { MapPin, CalendarDays, Target, BadgeRussianRuble } from "lucide-react";
import SmartImage from "@/components/SmartImage";
import { campPathFrom } from "@/components/post/helpers/campPath";
import { useCampOverlay } from "@/hooks/useCampOverlay";
import { useAppNavigation } from "@/hooks/useAppNavigation";
import { useCommentsModal } from "@/hooks/useCommentsModal";
import { useLikersModal } from "@/hooks/useLikersModal";
import { useTaggedProfilesModal } from "@/hooks/useTaggedProfilesModal";
import { useCreatePostProfileOverlay } from "@/hooks/useCreatePostProfileOverlay";
import { useLayerStack } from "@/context/LayerStackContext";
import { getBrowserApiBase } from "@/lib/apiBase";

const API_BASE = getBrowserApiBase().replace(/\/+$/, "");
const CAMP_DEBUG_KEY = "NAVUMI_CAMP_DEBUG";

const shouldLogCampDebug = () => {
  try {
    if (process.env.NODE_ENV !== "production") return true;
    if (typeof window !== "undefined") {
      const v = window.localStorage?.getItem(CAMP_DEBUG_KEY) || "";
      return ["1", "true", "on", "yes"].includes(v.toLowerCase());
    }
  } catch {
    /* noop */
  }
  return false;
};

/** ===== Типы API ===== */

type ActorApi = {
  id?: number;
  username?: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  type?: string | null;
  isClub?: boolean | null;
};

type CommentPreviewApi = {
  id?: number | string;
  text?: string;
  createdAt?: string;
  author?: ActorApi;
} | null;

type CampBackendPayload = Record<string, unknown>;

type CampPayloadApi = {
  camp: CampBackendPayload;
  joinedAt?: string | null;
} | null;

type UnknownRecord = Record<string, unknown>;

type CampReference = {
  id?: number | string;
  title?: string | null;
  ownerUsername?: string | null;
  campNumber?: number | string | null;
  url?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

type PostPayloadApi = {
  id?: number | string;
  text?: string;
  createdAt?: string;
  images?: string[];
  firstImageUrl?: string | null;
  imagesCount?: number;
  locationName?: string | null;
  likesCount?: number;
  liked?: boolean;
  commentsCount?: number;
  commentsTotal?: number;
  commentPreview?: CommentPreviewApi;
  activities?: Array<{ id: number | string; name: string }>;
  hashtags?: Array<{ id: number | string; name: string }>;
  profiles?: Array<{ id: number; username: string; avatarUrl?: string | null }>;
  profilesCount?: number;
  camp?: CampReference | null;
} | null;

type PermissionsApi = {
  canEdit?: boolean;
  canDelete?: boolean;
  canReport?: boolean;
} | null;

type CampPostPayloadApi = {
  camp?: UnknownRecord | null;
  campPost?: UnknownRecord | null;
  camp_post?: UnknownRecord | null;
  post?: UnknownRecord | null;
} | null;

type RawPostItem = {
  id?: string | number;
  type: "photo_post" | "article";
  createdAt?: string | null;
  actor?: ActorApi | null;
  payload?: PostPayloadApi;
  permissions?: PermissionsApi;
};

type RawCampItem = {
  id?: string | number;
  type: "camp_published" | "camp_joined";
  createdAt?: string | null;
  actor?: ActorApi | null;
  payload?: CampPayloadApi;
  permissions?: null;
};

type RawCampPostItem = {
  id?: string | number;
  type: "camp_new_post" | "camp_post";
  createdAt?: string | null;
  actor?: ActorApi | null;
  payload?: CampPostPayloadApi;
};

type RawFeedItem = RawPostItem | RawCampItem | RawCampPostItem | { type?: string };

type FeedResponse = {
  items?: RawFeedItem[];
  nextCursor?: string | null;
  hasMore?: boolean;
};

/** ===== Нормализованные типы для UI ===== */

type Actor = {
  id?: number;
  username: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  type?: string | null;
  isClub?: boolean | null;
};

type CommentPreview = {
  id?: number | string;
  text: string;
  createdAt?: string | null;
  author?: Actor;
};

type PostPayload = {
  id: number | string;
  text: string;
  createdAt?: string | null;
  images: string[];
  firstImageUrl?: string | null;
  imagesCount: number;
  locationName?: string | null;
  likesCount?: number;
  liked?: boolean;
  commentsCount?: number;
  commentsTotal?: number;
  commentPreview?: CommentPreview | null;
  activities?: Array<{ id: number | string; name: string }>;
  hashtags?: Array<{ id: number | string; name: string }>;
  profilesCount?: number;
  camp?: CampReference | null;
};

type PostEvent = {
  kind: "photo_post" | "article";
  eventId: string;
  createdAt?: string | null;
  actor: Actor;
  post: PostPayload;
};

type CampEvent = {
  kind: "camp_published" | "camp_joined";
  eventId: string;
  createdAt?: string | null;
  actor: Actor;
  camp: CampCardData;
  joinedAt?: string | null;
  campId?: number | string | null;
};

type CampPostEventKind = "camp_new_post" | "camp_post";

type CampPostContent = {
  id: number | string;
  title: string | null;
  text: string;
  image: string | null;
  createdAt?: string | null;
};

type CampPostEvent = {
  kind: CampPostEventKind;
  eventId: string;
  createdAt?: string | null;
  actor: Actor;
  camp: CampReference | null;
  campPost: CampPostContent;
};

type ActivityEvent = PostEvent | CampEvent | CampPostEvent;

const isPostEvent = (ev: ActivityEvent): ev is PostEvent => ev.kind === "photo_post" || ev.kind === "article";
const isCampEvent = (ev: ActivityEvent): ev is CampEvent => ev.kind === "camp_published" || ev.kind === "camp_joined";
const isCampPostEvent = (ev: ActivityEvent): ev is CampPostEvent => ev.kind === "camp_new_post" || ev.kind === "camp_post";

const ensureNumericId = (value: number | string): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

function useIsMobile(query = "(max-width: 767px)") {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(!!e.matches);
    };
    handler(mq);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [query]);
  return isMobile;
}

/** ===== Страница ленты ===== */

export default function FeedPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<PostEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PostEvent | null>(null);
  const [reportTarget, setReportTarget] = useState<PostEvent | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [loginRequiredOpen, setLoginRequiredOpen] = useState(false);
  const { clearScreens } = useLayerStack();
  const [deleteLoading, setDeleteLoading] = useState(false);
  const isMobile = useIsMobile();
  const { authenticated, profile } = useAuth();
  const me = profile?.username ?? null;

  const commentsModal = useCommentsModal();
  const likersModal = useLikersModal();
  const taggedProfilesModal = useTaggedProfilesModal();
  const { open: openCreatePostOverlay } = useCreatePostProfileOverlay();

  const fetchPage = useCallback(async (cursorParam?: string | null) => {
    const params = new URLSearchParams();
    params.set("limit", "20");
    if (cursorParam) params.set("before", cursorParam);

    const resp = await fetch(`${API_BASE}/api/activity-feed/?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!resp.ok) throw new Error("failed");

    const data: FeedResponse = await resp.json().catch(() => ({} as FeedResponse));
    const rawItems = Array.isArray(data.items) ? data.items : [];
    debugFeedItems("page", rawItems);
    const normalized = rawItems
      .map((item) => normalizeFeedItem(item))
      .filter((x): x is ActivityEvent => !!x);
    debugNormalizedEvents("page", normalized);

    const nextCursor = data.nextCursor ?? null;
    const more = Boolean(data.hasMore ?? (nextCursor && normalized.length > 0));

    return { events: normalized, nextCursor, hasMore: more };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const page = await fetchPage();
        if (cancelled) return;
        setEvents(page.events);
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
      } catch {
        if (!cancelled) setError("Не удалось загрузить ленту");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchPage, reloadToken]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(cursor);
      setEvents((prev) => [...prev, ...page.events]);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (err) {
      console.error("[Feed] loadMore failed", err);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, fetchPage, loadingMore]);

  useEffect(() => {
    if (!loaderRef.current || !hasMore) return;
    const el = loaderRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting && !loadingMore) {
          void loadMore();
        }
      },
      { rootMargin: "120px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loadingMore]);

  const toggleLike = useCallback(async (postId: number | string) => {
    const key = String(postId);

    setEvents((prev) =>
      prev.map((event) => {
        if (isPostEvent(event) && String(event.post.id) === key) {
          const liked = !event.post.liked;
          const nextLikes = Math.max(0, (event.post.likesCount ?? 0) + (event.post.liked ? -1 : 1));
          return { ...event, post: { ...event.post, liked, likesCount: nextLikes } };
        }
        return event;
      })
    );

    try {
      const resp = await fetch(`${API_BASE}/api/posts/${postId}/like-toggle/`, {
        method: "POST",
        credentials: "include",
      });
      let payload: { liked?: boolean; likes_count?: number } = {};
      try {
        payload = await resp.json();
      } catch {
        /* noop */
      }
      if (!resp.ok) throw new Error("failed");

      setEvents((prev) =>
        prev.map((event) => {
          if (isPostEvent(event) && String(event.post.id) === key) {
            return {
              ...event,
              post: {
                ...event.post,
                liked: typeof payload.liked === "boolean" ? payload.liked : event.post.liked,
                likesCount: typeof payload.likes_count === "number" ? payload.likes_count : event.post.likesCount,
              },
            };
          }
          return event;
        })
      );
    } catch (err) {
      console.error("[Feed] like failed", err);
    }
  }, []);

  const sharePost = useCallback((username: string, postId: number | string) => {
    const slug = (username || "").trim();
    const path = slug ? `/${slug}/post/${postId}` : `/post/${postId}`;
    const url = typeof window !== "undefined" ? new URL(path, window.location.origin).toString() : path;

    const nav =
      typeof navigator !== "undefined"
        ? (navigator as Navigator & { share?: (data: ShareData) => Promise<void>; clipboard?: { writeText?: (value: string) => Promise<void> } })
        : undefined;

    const copyFallback = () => {
      if (nav?.clipboard?.writeText) {
        nav.clipboard.writeText(url).catch(() => window.prompt("Скопируйте ссылку:", url));
      } else {
        window.prompt("Скопируйте ссылку:", url);
      }
    };

    if (nav?.share) {
      nav.share({ title: `Пост @${username}`, url }).catch(() => copyFallback());
      return;
    }

    copyFallback();
  }, []);

  const openActionsForPost = useCallback((event: PostEvent) => {
    setActionTarget(event);
    setActionsOpen(true);
  }, []);

  const handleEditPost = useCallback(
    (event: PostEvent) => {
      setActionsOpen(false);
      setActionTarget(null);
      const slug = event.actor.username;
      const postId = typeof event.post.id === 'number' ? event.post.id : Number(event.post.id);
      if (Number.isFinite(postId)) {
        openCreatePostOverlay({ mode: 'edit', postId, username: slug });
      }
    },
    [openCreatePostOverlay]
  );

  const handleRequestDelete = useCallback((event: PostEvent) => {
    setActionsOpen(false);
    setActionTarget(null);
    setDeleteTarget(event);
    setConfirmDeleteOpen(true);
  }, []);

  const handleRequestReport = useCallback(
    (event: PostEvent) => {
      setActionsOpen(false);
      setActionTarget(null);
      if (authenticated) {
        setReportTarget(event);
        setReportOpen(true);
      } else {
        setLoginRequiredOpen(true);
      }
    },
    [authenticated]
  );

  const handlePostDeleted = useCallback((postId: number | string) => {
    const key = String(postId);
    setEvents((prev) => prev.filter((event) => !(isPostEvent(event) && String(event.post.id) === key)));
  }, []);

  const actionSheetItems = useMemo(() => {
    if (!actionTarget) return [];
    const isAuthor = !!(me && actionTarget.actor.username && me === actionTarget.actor.username);
    const event = actionTarget;
    const baseShare = {
      label: "Поделиться",
      onClick: () => sharePost(event.actor.username, event.post.id),
    };
    if (isAuthor) {
      return [
        baseShare,
        {
          label: "Редактировать",
          onClick: () => handleEditPost(event),
        },
        {
          label: "Удалить",
          destructive: true,
          onClick: () => handleRequestDelete(event),
        },
      ];
    }
    return [
      baseShare,
      {
        label: "Пожаловаться",
        destructive: true,
        onClick: () => handleRequestReport(event),
      },
    ];
  }, [actionTarget, handleEditPost, handleRequestDelete, handleRequestReport, me, sharePost]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/posts/${deleteTarget.post.id}/delete/`, { method: "POST", credentials: "include" });
      if (!resp.ok) throw new Error("Не удалось удалить пост");
      handlePostDeleted(deleteTarget.post.id);
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('profile_post_deleted', {
              detail: { id: deleteTarget.post.id },
            }),
          );
        }
      } catch {
        /* noop */
      }
      setConfirmDeleteOpen(false);
      setDeleteTarget(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка удаления");
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteTarget, handlePostDeleted]);

  const openTaggedProfiles = useCallback(async (postId: number | string) => {
    const id = String(postId);
    try {
      let resp = await fetch(`${API_BASE}/api/posts/${id}/`, { credentials: "include", cache: "no-store" });
      if (!resp.ok) resp = await fetch(`${API_BASE}/api/posts/${id}/`, { credentials: "omit", cache: "no-store" });
      if (!resp.ok) throw new Error("failed");
      const data: { profiles?: Array<{ id: number; username: string; avatar_url?: string | null }> } = await resp.json();
      const items: TaggedProfile[] =
        data.profiles?.map((p) => ({ id: p.id, username: p.username, avatar_url: p.avatar_url ?? null })) ?? [];
      taggedProfilesModal.open({
        items,
        centered: !isMobile,
      });
      setEvents((prev) =>
        prev.map((event) =>
          isPostEvent(event) && String(event.post.id) === id
            ? { ...event, post: { ...event.post, profilesCount: items.length } }
            : event
        )
      );
    } catch (err) {
      console.error("[Feed] tagged profiles failed", err);
    }
  }, [API_BASE, isMobile, taggedProfilesModal]);

  const syncCommentsCount = useCallback((postId: number, nextCount: number) => {
    const key = String(postId);
    setEvents((prev) =>
      prev.map((event) =>
        isPostEvent(event) && String(event.post.id) === key
          ? { ...event, post: { ...event.post, commentsCount: nextCount } }
          : event
      )
    );
  }, []);

  // Обработчик события обновления поста для динамического обновления постов в ленте
  useEffect(() => {
    const onProfilePostUpdated = (e: Event) => {
      const ce = e as CustomEvent<{ id?: number; post?: Partial<{ id?: number; text?: string; images?: string[] }> }>;
      const detail = ce.detail ?? {};
      const id = Number(detail.id ?? detail.post?.id ?? NaN);
      if (!Number.isFinite(id)) return;

      const updated = detail.post;
      if (!updated) return;

      setEvents((prev) =>
        prev.map((event) => {
          if (isPostEvent(event) && String(event.post.id) === String(id)) {
            return {
              ...event,
              post: {
                ...event.post,
                text: updated.text ?? event.post.text,
                images: updated.images ?? event.post.images,
                firstImageUrl: updated.images?.[0] ?? event.post.firstImageUrl,
                imagesCount: updated.images?.length ?? event.post.imagesCount,
              },
            };
          }
          return event;
        })
      );
    };

    window.addEventListener('profile_post_updated', onProfilePostUpdated as EventListener, { passive: true });
    return () => window.removeEventListener('profile_post_updated', onProfilePostUpdated as EventListener);
  }, []);

  const handleRetry = () => setReloadToken((t) => t + 1);

  const renderPostCard = (event: PostEvent) => {
    const { post, actor } = event;
    const numericId = ensureNumericId(post.id);
    const camp = post.camp
      ? {
          organizerUsername: post.camp.ownerUsername ?? actor.username,
          campNumber: post.camp.campNumber ?? undefined,
          url: post.camp.url ?? undefined,
          start_date: post.camp.startDate ?? undefined,
          end_date: post.camp.endDate ?? undefined,
          title: post.camp.title ?? undefined,
        }
      : null;

    const commentPreview = post.commentPreview
      ? {
          id: post.commentPreview.id,
          text: post.commentPreview.text ?? "",
          authorUsername: post.commentPreview.author?.username ?? undefined,
          authorDisplayName: post.commentPreview.author?.fullName ?? undefined,
          avatarUrl: post.commentPreview.author?.avatarUrl ?? undefined,
        }
      : undefined;

    return (
      <FeedPostCard
        post={{
          kind: event.kind,
          id: post.id,
          username: actor.username,
          avatarUrl: actor.avatarUrl,
          text: post.text || "",
          createdAt: post.createdAt,
          locationName: post.locationName,
          activities: post.activities,
          hashtags: post.hashtags,
          camp,
          images: post.images ?? [],
          liked: post.liked,
          likesCount: post.likesCount,
          commentsCount: post.commentsCount,
          commentsTotal: post.commentsTotal,
          marksCount: post.profilesCount,
          commentPreview,
        }}
        showOpenPostButton={false}
        onToggleLike={() => toggleLike(post.id)}
        onOpenComments={() => {
          if (numericId !== null) {
            commentsModal.open({
              postId: numericId,
              centered: !isMobile,
              onSyncCommentsCount: (next) => syncCommentsCount(numericId, next),
            });
          }
        }}
        onOpenLikers={() => {
          if (numericId !== null) {
            likersModal.open({
              postId: numericId,
              centered: !isMobile,
            });
          }
        }}
        onOpenTags={() => void openTaggedProfiles(post.id)}
        onShare={() => sharePost(actor.username, post.id)}
        onOpenActions={() => openActionsForPost(event)}
        onCommentPreviewClick={() => {
          if (numericId !== null) {
            commentsModal.open({
              postId: numericId,
              centered: !isMobile,
              onSyncCommentsCount: (next) => syncCommentsCount(numericId, next),
            });
          }
        }}
      />
    );
  };

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-8">

        {loading ? (
          <div className="rounded-3xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500 shadow-sm">
            Загружаем обновления…
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-red-200 bg-white px-4 py-8 text-center shadow-sm">
            <p className="text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="mt-4 inline-flex items-center justify-center rounded-full border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Попробовать ещё раз
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-gray-600">
              Пока нет событий. Подпишитесь на профили и клубы, чтобы видеть их активность здесь.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {events.map((event) => (
              <div key={event.eventId} className="py-4 first:pt-0">
                {isPostEvent(event) ? (
                  <PostEventCard event={event} renderPost={renderPostCard} />
                ) : isCampEvent(event) ? (
                  <CampEventCard event={event} />
                ) : isCampPostEvent(event) ? (
                  <CampPostEventCard event={event} />
                ) : null}
              </div>
            ))}
          </div>
        )}

        {hasMore && (
          <div className="mt-6 flex flex-col items-center gap-3 text-sm text-gray-500">
            <div ref={loaderRef} className="h-1 w-full" />
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="rounded-full border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {loadingMore ? "Загружаем…" : "Показать ещё"}
            </button>
          </div>
        )}
      </div>

      <PostActionSheet
        open={actionsOpen}
        onClose={() => {
          setActionsOpen(false);
          setActionTarget(null);
        }}
        actions={actionSheetItems}
      />

      <ConfirmModal
        open={confirmDeleteOpen}
        onCancel={() => {
          setConfirmDeleteOpen(false);
          setDeleteTarget(null);
        }}
        onConfirm={handleConfirmDelete}
        confirmLabel={deleteLoading ? "Удаляем…" : "Удалить"}
        cancelLabel="Отмена"
        title="Удалить пост?"
        message="Действие нельзя отменить."
        variant="simple"
      />

      <ConfirmModal
        open={loginRequiredOpen}
        onCancel={() => setLoginRequiredOpen(false)}
        onConfirm={() => {
          setLoginRequiredOpen(false);
          clearScreens();
          setTimeout(() => {
            try {
              window.location.assign("/auth/login");
            } catch {
              /* noop */
            }
          }, 150);
        }}
        title="Данное действие доступно только для авторизованных пользователей"
        cancelLabel="Отмена"
        confirmLabel="Войти"
      />

      <ReportModal
        open={reportOpen && !!reportTarget}
        onClose={() => {
          setReportOpen(false);
          setReportTarget(null);
        }}
        kind="profile_post"
        targetId={reportTarget ? Number(reportTarget.post.id) : 0}
        linkHint={
          reportTarget ? `/${reportTarget.actor.username}/post/${reportTarget.post.id}` : undefined
        }
      />
    </main>
  );
}

/** ===== Вспомогательные компоненты/нормализаторы ===== */

function PostEventCard({ event, renderPost }: { event: PostEvent; renderPost: (event: PostEvent) => React.ReactNode }) {
  return <div>{renderPost(event)}</div>;
}

function CampPostEventCard({ event }: { event: CampPostEvent }) {
  const actorUsername = event.actor.username;
  const actorDisplay = actorUsername || "Клуб";
  const actorAvatar = event.actor.avatarUrl || undefined;
  const campTitle = event.camp?.title?.trim() || "кэмп";
  const ownerForPath = cleanUsername(event.camp?.ownerUsername || actorUsername || "");
  const campBaseHref = useMemo(() => {
    if (!ownerForPath && !event.camp?.url) return "";
    const cfg: Parameters<typeof campPathFrom>[1] = {};
    if (event.camp?.campNumber != null && `${event.camp.campNumber}`.trim() !== "") {
      cfg.camp_number = event.camp.campNumber;
    }
    if (event.camp?.url) cfg.url = event.camp.url;
    const resolved = campPathFrom(ownerForPath || undefined, cfg);
    return resolved || event.camp?.url || "";
  }, [event.camp?.campNumber, event.camp?.url, ownerForPath]);
  const campHref = useMemo(() => {
    if (!campBaseHref) return "";
    const hash = event.campPost.id ? `#post-${event.campPost.id}` : "";
    return `${campBaseHref}${hash}`;
  }, [campBaseHref, event.campPost.id]);
  const rawTitle = event.campPost.title?.trim() || "";
  const text = (event.campPost.text || "").trim();
  const showTitle = rawTitle.length > 0;
  const showText = text.length > 0 && text !== rawTitle;
  const image = event.campPost.image;
  const postDate = formatCampPostDate(event.campPost.createdAt);
  const [campPostImageMeta, setCampPostImageMeta] = useState<{ isPortrait: boolean } | null>(null);
  const isPortraitCampPostImage = campPostImageMeta?.isPortrait ?? false;
  const { navigateProfile, navigateCamp } = useAppNavigation();

  const handleActorClick = useCallback(
    (eventClick: React.MouseEvent<HTMLAnchorElement>) => {
      if (!actorUsername) return;
      navigateProfile(eventClick as unknown as React.MouseEvent<HTMLElement>, { username: actorUsername });
    },
    [navigateProfile, actorUsername]
  );

  const handleCampClick = useCallback(
    (eventClick: React.MouseEvent<HTMLAnchorElement>) => {
      if (!campHref) return;
      navigateCamp(eventClick as unknown as React.MouseEvent<HTMLElement>, {
        username: ownerForPath || actorUsername,
        campNumber: event.camp?.campNumber ?? null,
        campPath: campHref || undefined,
      });
    },
    [navigateCamp, campHref, ownerForPath, actorUsername, event.camp?.campNumber]
  );

  return (
    <div className="pt-3 sm:pt-4">
      <div className="px-3 sm:px-4">
        <div className="flex items-start gap-3">
          {actorUsername ? (
            <SharedAvatar href={`/${actorUsername}`} src={actorAvatar} size={44} onClick={handleActorClick} />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-200 text-gray-500">✦</div>
          )}
          <div className="min-w-0 text-sm text-gray-800 leading-snug">
            <div className="text-[15px] font-semibold">
              {actorUsername ? (
                <Link href={`/${actorUsername}`} className="hover:underline" onClick={handleActorClick}>
                  {actorDisplay}
                </Link>
              ) : (
                <span>{actorDisplay}</span>
              )}
            </div>
            <div className="text-[13px] text-gray-600 mt-0.5 min-w-0 break-words line-clamp-2">
              поделился постом в кэмпе{" "}
              {campHref ? (
                <Link
                  href={campHref}
                  className="font-semibold text-blue-600 hover:underline"
                  onClick={handleCampClick}
                >
                  «{campTitle}»
                </Link>
              ) : (
                <span className="font-semibold text-blue-600">
                  «{campTitle}»
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {image && (
        <div className="-mx-3 sm:-mx-4 mt-3">
          <div
            className={[
              "relative w-full overflow-hidden bg-black",
              isPortraitCampPostImage ? "aspect-[3/4] max-h-[70vh] md:max-h-[80vh]" : "aspect-[3/2]",
            ].join(" ")}
          >
            <SmartImage
              src={image}
              alt={campTitle}
              fill
              sizes="(max-width: 768px) 100vw, 640px"
              className={isPortraitCampPostImage ? "object-contain" : "object-cover"}
              onLoadingComplete={(img) => setCampPostImageMeta({ isPortrait: img.naturalHeight > img.naturalWidth })}
            />
          </div>
        </div>
      )}

      {showTitle && (
        <div className="px-3 sm:px-4 mt-3">
          <div className="text-[16px] font-semibold text-gray-900 whitespace-pre-wrap break-words">
            {rawTitle}
          </div>
        </div>
      )}

      {showText && <CampPostText text={text} />}

      {postDate && (
        <div className="px-3 sm:px-4 pt-4 pb-2 text-[12px] text-gray-500">
          {postDate}
        </div>
      )}
    </div>
  );
}

function CampPostText({ text }: { text: string }) {
  const clampLines = 4;
  const [expanded, setExpanded] = useState(false);
  const [canToggle, setCanToggle] = useState(false);
  const paragraphRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const el = paragraphRef.current;
    if (!el) return;
    const update = () => {
      if (!el) return;
      if (expanded) {
        setCanToggle(true);
        return;
      }
      setCanToggle(el.scrollHeight > el.clientHeight + 1);
    };
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (ro) ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [text, expanded]);

  const clampStyle = expanded
    ? undefined
    : ({
        display: "-webkit-box",
        WebkitLineClamp: clampLines,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      } as React.CSSProperties);

  return (
    <div className="px-3 sm:px-4 mt-3">
      <p ref={paragraphRef} className="text-[15px] leading-relaxed whitespace-pre-wrap break-words" style={clampStyle}>
        {text}
      </p>
      {canToggle && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-2 text-[13px] text-gray-500/80 hover:text-gray-700"
        >
          {expanded ? "свернуть" : "развернуть"}
        </button>
      )}
    </div>
  );
}

function CampEventCard({ event }: { event: CampEvent }) {
  const [resolvedHref, setResolvedHref] = React.useState<string | null>(null);
  const actorUsername = event.actor.username;
  const actorName = actorUsername || "Клуб";
  const message = event.kind === "camp_joined" ? "подписался на кэмп" : "опубликовал кэмп";
  const city = React.useMemo(() => campCityFrom(event.camp.location_name || ""), [event.camp.location_name]);
  const priceDisplay = React.useMemo(() => formatCampPrice(event.camp), [event.camp]);
  const dateRange = React.useMemo(
    () => formatCampDateRange(event.camp.start_date, event.camp.end_date),
    [event.camp.start_date, event.camp.end_date]
  );
  const galleryImages = React.useMemo(() => {
    const fromGallery = Array.isArray(event.camp.gallery_images)
      ? event.camp.gallery_images.filter((u) => typeof u === "string" && u.trim().length > 0)
      : [];
    if (fromGallery.length > 0) return fromGallery;
    return event.camp.title_image ? [event.camp.title_image] : [];
  }, [event.camp.gallery_images, event.camp.title_image]);
  const activities = React.useMemo(
    () => (Array.isArray(event.camp.activities) ? event.camp.activities.filter((a) => typeof a === "string" && a.trim().length > 0) : []),
    [event.camp.activities]
  );
  const firstActivity = activities[0] || "";
  const extraActivities = Math.max(0, activities.length - 1);
  const [carouselIndex, setCarouselIndex] = React.useState(0);
  const goPrevCampImage = React.useCallback(() => {
    setCarouselIndex((prev) => {
      const count = galleryImages.length;
      if (count <= 0) return 0;
      return (prev - 1 + count) % count;
    });
  }, [galleryImages.length]);
  const openCampOverlay = useCampOverlay();
  const { navigateProfile } = useAppNavigation();

  const openCamp = React.useCallback(() => {
    const payload = {
      eventKind: event.kind,
      eventId: event.eventId,
      actorUsername,
      camp: {
        organizerUsername: event.camp.organizerUsername,
        campNumber: event.camp.campNumber,
        campId: event.camp.campId,
        resolvedHref,
        campEventId: event.campId,
      },
    };
    if (shouldLogCampDebug()) {
      console.info("[Feed] CampEventCard/openCamp", payload);
    }
    openCampOverlay({
      username: event.camp.organizerUsername || actorUsername,
      campNumber: event.camp.campNumber ?? event.campId ?? null,
      campPath: resolvedHref || undefined,
      campId: event.camp.campId ?? event.campId ?? null,
    });
  }, [
    openCampOverlay,
    event.kind,
    event.eventId,
    event.camp.organizerUsername,
    event.camp.campNumber,
    event.camp.campId,
    event.campId,
    resolvedHref,
    actorUsername,
  ]);

  const handleActorClick = React.useCallback((eventClick: React.MouseEvent<HTMLAnchorElement>) => {
    if (!actorUsername) return;
    navigateProfile(eventClick as unknown as React.MouseEvent<HTMLElement>, { username: actorUsername });
  }, [navigateProfile, actorUsername]);
  const goNextCampImage = React.useCallback(() => {
    setCarouselIndex((prev) => {
      const count = galleryImages.length;
      if (count <= 0) return 0;
      return (prev + 1) % count;
    });
  }, [galleryImages.length]);

  React.useEffect(() => {
    if (event.camp.camp_url) {
      setResolvedHref(event.camp.camp_url);
      return;
    }

    const rawId = event.campId;
    const idNum =
      typeof rawId === "number" && Number.isFinite(rawId)
        ? rawId
        : typeof rawId === "string" && rawId.trim() && Number.isFinite(Number(rawId.trim()))
        ? Number(rawId.trim())
        : null;

    if (!idNum) return;

    let cancelled = false;

    (async () => {
      try {
        let resp = await fetch(`${API_BASE}/api/camps/${idNum}/`, { credentials: "include", cache: "no-store" });
        if (!resp.ok) {
          resp = await fetch(`${API_BASE}/api/camps/${idNum}/`, { credentials: "omit", cache: "no-store" });
        }
        if (!resp.ok) return;
        const data: { camp_url?: string | null; url?: string | null } = await resp.json().catch(() => ({} as { camp_url?: string | null; url?: string | null }));
        const rawUrl = (data.camp_url || data.url || "").trim();
        if (!rawUrl || cancelled) return;
        try {
          const u = new URL(rawUrl, typeof window !== "undefined" ? window.location.origin : "https://www.navumi.com");
          const pathname = u.pathname || rawUrl;
          setResolvedHref(pathname.startsWith("/") ? pathname : `/${pathname}`);
        } catch {
          setResolvedHref(rawUrl);
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [event.camp.camp_url, event.campId]);

  const hasImages = galleryImages.length > 0;

  return (
    <div className="pt-3 sm:pt-4">
      <div className="px-1 sm:px-4">
        <div className="flex items-center gap-3">
          {actorUsername ? (
            <SharedAvatar href={`/${actorUsername}`} src={event.actor.avatarUrl || undefined} size={44} onClick={handleActorClick} />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-200 text-gray-500">✦</div>
          )}
          <div className="min-w-0">
            <div className="text-sm text-gray-800">
              {actorUsername ? (
                <Link
                  href={`/${actorUsername}`}
                  className="font-semibold hover:underline"
                  onClick={handleActorClick}
                >
                  {actorName}
                </Link>
              ) : (
                <span className="font-semibold">{actorName}</span>
              )}{" "}
              <span>{message}</span>
            </div>
          </div>
        </div>
      </div>

      {hasImages && (
        <div
          className="-mx-3 mt-3 sm:mx-0 cursor-pointer"
          onClick={openCamp}
        >
          <div className="relative w-full bg-black aspect-[16/11] lg:aspect-[16/9]">
            <SwipeCarousel
              images={galleryImages}
              fillParent
              className="h-full"
              imageClassName="object-cover"
              index={carouselIndex}
              onIndexChange={setCarouselIndex}
            />
            {galleryImages.length > 1 && (
              <>
                <button
                  type="button"
                  className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition"
                  onClick={(e) => {
                    e.stopPropagation();
                    goPrevCampImage();
                  }}
                  aria-label="Предыдущее фото"
                >
                  <ArrowLeftIcon />
                </button>
                <button
                  type="button"
                  className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition"
                  onClick={(e) => {
                    e.stopPropagation();
                    goNextCampImage();
                  }}
                  aria-label="Следующее фото"
                >
                  <ArrowRightIcon />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="px-3 sm:px-4">
        {(city || firstActivity) && (
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-700">
            {city && (
              <div className="flex items-center gap-1 min-w-0">
                <MapPin className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                <span className="truncate">{city}</span>
              </div>
            )}
            {firstActivity && (
              <div className="ml-auto inline-flex max-w-[60%] items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] leading-none text-gray-800">
                <Target className="mr-1 h-3.5 w-3.5 text-blue-600 shrink-0" />
                <span className="truncate">
                  {firstActivity}
                  {extraActivities > 0 ? ` +${extraActivities}` : ""}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="mt-2 flex items-baseline justify-between text-sm text-gray-900">
          <div className="flex items-center gap-1 min-w-0">
            <BadgeRussianRuble className="h-4 w-4 text-blue-600 shrink-0" />
            <span className="font-semibold truncate">{priceDisplay}</span>
          </div>
          {dateRange && (
            <div className="ml-3 flex items-center gap-1 text-xs text-gray-600 shrink-0">
              <CalendarDays className="h-3.5 w-3.5 text-blue-600" />
              <span className="truncate">{dateRange}</span>
            </div>
          )}
        </div>

        <div className="mt-2 text-[12px] text-gray-500 text-left">{formatFeedDateLabel(event.createdAt)}</div>
      </div>
    </div>
  );
}

function campCityFrom(location: string): string {
  const raw = location.trim();
  if (!raw) return "";
  const comma = raw.indexOf(",");
  return (comma >= 0 ? raw.slice(0, comma) : raw).trim();
}

function formatCampDateRange(a?: string | null, b?: string | null): string {
  const parseISO = (s?: string | null): Date | null => {
    if (!s || typeof s !== "string") return null;
    const d = new Date(s);
    return Number.isNaN(+d) ? null : d;
  };
  const start = parseISO(a);
  const end = parseISO(b);
  if (!start && !end) return "";
  const monthShortRu = (d: Date): string => {
    try {
      return d.toLocaleDateString("ru-RU", { month: "short" });
    } catch {
      return "";
    }
  };
  if (start && end) {
    const sameYear = start.getFullYear() === end.getFullYear();
    const sameMonth = sameYear && start.getMonth() === end.getMonth();
    const yyyy = end.getFullYear();
    if (sameMonth) {
      const m = monthShortRu(end);
      return `${start.getDate()}–${end.getDate()} ${m} ${yyyy} г.`;
    }
    const left = `${start.getDate()} ${monthShortRu(start)}`;
    const right = `${end.getDate()} ${monthShortRu(end)}`;
    return `${left} – ${right} ${yyyy} г.`;
  }
  const d = start || end!;
  const m = monthShortRu(d);
  return `${d.getDate()} ${m} ${d.getFullYear()} г.`;
}

function formatCampPrice(camp: CampCardData): string {
  const priceRaw = camp.price;
  const hotRaw = camp.hot_deal_price;
  const currency = (camp.currency || "RUB").toUpperCase();
  const toNumber = (v?: number | string | null): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const n = Number(v.trim());
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const price = toNumber(priceRaw);
  const hot = toNumber(hotRaw);
  const symbol = currency === "RUB" || currency === "RUR" || currency === "₽" ? "₽" : currency === "USD" ? "$" : currency === "EUR" ? "€" : currency;
  const fmt = (n: number) => {
    try {
      return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
    } catch {
      return String(Math.round(n));
    }
  };

  if (camp.is_hot_deal && hot !== null) {
    const base = price ?? hot;
    return `${fmt(hot)} ${symbol} (до ${fmt(base)} ${symbol})`;
  }
  if (price !== null) return `${fmt(price)} ${symbol}`;
  return "Цена по запросу";
}

function debugFeedItems(label: string, items: RawFeedItem[]) {
  try {
    const summary = items.reduce<Record<string, number>>((acc, it) => {
      const type = (typeof it?.type === "string" && it.type) || "unknown";
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    console.log("[Feed] raw items", { label, count: items.length, summary, sample: items.slice(0, 5) });
  } catch {
    /* noop */
  }
}

function debugNormalizedEvents(label: string, events: ActivityEvent[]) {
  try {
    const summary = events.reduce<Record<string, number>>((acc, it) => {
      acc[it.kind] = (acc[it.kind] || 0) + 1;
      return acc;
    }, {});
    console.log("[Feed] normalized events", { label, count: events.length, summary, sample: events.slice(0, 5) });
  } catch {
    /* noop */
  }
}

const feedDateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

function formatFeedDateLabel(iso?: string | null): string {
  if (!iso) return "";
  try {
    const raw = feedDateFormatter.format(new Date(iso));
    return raw.replace(/[\s\u00A0\u202F]?г\.?$/i, "");
  } catch {
    return iso || "";
  }
}

const CAMP_POST_TYPES: CampPostEventKind[] = ["camp_new_post", "camp_post"];

function normalizeFeedItem(item: RawFeedItem): ActivityEvent | null {
  if (!item || typeof item !== "object" || !("type" in item) || !item.type) return null;

  if (item.type === "photo_post" || item.type === "article") {
    const postItem = item as RawPostItem;
    const actor = normalizeActor(postItem.actor ?? null);
    const post = normalizePostPayload(postItem.payload ?? null);
    if (!post) return null;

    const eventId = typeof postItem.id === "string" || typeof postItem.id === "number" ? String(postItem.id) : `${postItem.type}:${post.id}`;
    return {
      kind: postItem.type,
      eventId,
      createdAt: postItem.createdAt ?? post.createdAt ?? null,
      actor,
      post,
    };
  }

  if (item.type === "camp_published" || item.type === "camp_joined") {
    const campItem = item as RawCampItem;
    const actor = normalizeActor(campItem.actor ?? null);
    const payload = campItem.payload;
    if (!payload || !payload.camp) return null;

    const rawCamp = payload.camp as CampBackendPayload & { id?: number | string };
    const camp = normalizeCampToCardData(rawCamp, { fallbackOwner: actor.username });
    const fallbackKey = `${campItem.type}:${actor.username || "camp"}:${campItem.createdAt ?? ""}`;
    const eventId = typeof campItem.id === "string" || typeof campItem.id === "number" ? String(campItem.id) : fallbackKey;
    const rawId = (rawCamp as { id?: unknown }).id;
    const campId =
      typeof rawId === "number" && Number.isFinite(rawId)
        ? rawId
        : typeof rawId === "string" && rawId.trim()
        ? rawId.trim()
        : null;

    try {
      if (typeof window !== "undefined") {
        const raw = window.localStorage?.getItem("NAVUMI_CAMP_DEBUG") || "";
        if (["1", "true", "on", "yes"].includes(raw.toLowerCase())) {
          console.log("[ActivityFeed] camp item", {
            type: campItem.type,
            rawCamp: payload.camp,
            normalized: camp,
            actor: actor.username,
            eventId,
          });
        }
      }
    } catch {
      /* noop */
    }

    return {
      kind: campItem.type,
      eventId,
      createdAt: campItem.createdAt ?? null,
      actor,
      camp,
      joinedAt: campItem.type === "camp_joined" ? payload.joinedAt ?? null : undefined,
      campId,
    };
  }

  if (typeof item.type === "string" && CAMP_POST_TYPES.includes(item.type as CampPostEventKind)) {
    const campPostItem = item as RawCampPostItem;
    const actor = normalizeActor(campPostItem.actor ?? null);
    const payload = campPostItem.payload;
    const camp = normalizeCampReference(payload?.camp ?? null);
    const campPost = normalizeCampPostPayload(payload?.campPost || payload?.camp_post || payload?.post || null);
    if (!campPost) {
      try {
        console.warn("[Feed] camp_post item ignored (no content)", { type: campPostItem.type, payload });
      } catch {
        /* noop */
      }
      return null;
    }

    const eventId =
      typeof campPostItem.id === "string" || typeof campPostItem.id === "number"
        ? String(campPostItem.id)
        : `${campPostItem.type}:${campPost.id}`;

    return {
      kind: campPostItem.type as CampPostEvent["kind"],
      eventId,
      createdAt: campPost.createdAt ?? campPostItem.createdAt ?? null,
      actor,
      camp,
      campPost,
    };
  }

  return null;
}

function normalizeActor(raw: ActorApi | null): Actor {
  const username = (raw?.username || "").trim();
  const avatarUrl = raw?.avatarUrl ? absUrl(raw.avatarUrl) || raw.avatarUrl : undefined;
  return {
    id: raw?.id,
    username,
    fullName: raw?.fullName ?? null,
    avatarUrl,
    type: raw?.type ?? null,
    isClub: raw?.isClub ?? (raw?.type === "club" ? true : null),
  };
}

function normalizePostPayload(payload: PostPayloadApi): PostPayload | null {
  if (!payload) return null;
  const id = payload.id;
  if (typeof id !== "number" && typeof id !== "string") return null;

  const imagesRaw = Array.isArray(payload.images) ? payload.images : [];
  const images = imagesRaw
    .map((u) => (typeof u === "string" ? u : ""))
    .filter((s) => s.trim().length > 0)
    .map((u) => absUrl(u) || u);

  const text = typeof payload.text === "string" ? payload.text : "";
  const createdAt = typeof payload.createdAt === "string" ? payload.createdAt : null;
  const locationName = typeof payload.locationName === "string" ? payload.locationName : null;
  const likesCount = typeof payload.likesCount === "number" ? payload.likesCount : undefined;
  const liked = typeof payload.liked === "boolean" ? payload.liked : undefined;
  const commentsCount = typeof payload.commentsCount === "number" ? payload.commentsCount : undefined;
  const commentsTotal = typeof payload.commentsTotal === "number" ? payload.commentsTotal : undefined;
  const profilesCount = typeof payload.profilesCount === "number" ? payload.profilesCount : undefined;

  const commentPreview: CommentPreview | null =
    payload.commentPreview && typeof payload.commentPreview.text === "string"
      ? {
          id: payload.commentPreview.id,
          text: payload.commentPreview.text,
          createdAt: payload.commentPreview.createdAt ?? null,
          author: payload.commentPreview.author ? normalizeActor(payload.commentPreview.author) : undefined,
        }
      : null;

  const activities = Array.isArray(payload.activities)
    ? payload.activities.map((a) => ({ id: a.id, name: a.name }))
    : undefined;

  const hashtags = Array.isArray(payload.hashtags)
    ? payload.hashtags.map((h) => ({ id: h.id, name: typeof h.name === "string" ? h.name.replace(/^#/, "") : "" }))
    : undefined;

  const camp = payload.camp ? normalizeCampReference(payload.camp) : null;

  return {
    id,
    text,
    createdAt,
    images,
    firstImageUrl: payload.firstImageUrl ?? images[0] ?? null,
    imagesCount: typeof payload.imagesCount === "number" ? payload.imagesCount : images.length,
    locationName,
    likesCount,
    liked,
    commentsCount,
    commentsTotal,
    commentPreview,
    activities,
    hashtags,
    profilesCount,
    camp,
  };
}

function normalizeCampReference(raw: unknown): CampReference | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as UnknownRecord;
  const id = obj["id"];
  const title = pickStringValue(obj, ["title", "name"]);
  const ownerUsername = pickStringValue(obj, ["ownerUsername", "owner", "organizer", "organizer_username", "campOwner"]);
  const campNumber = pickNumberLikeValue(obj, ["campNumber", "camp_number", "number"]);
  const url = pickStringValue(obj, ["url", "camp_url", "absolute_url"]);
  const startDate = pickStringValue(obj, ["startDate", "start_date"]);
  const endDate = pickStringValue(obj, ["endDate", "end_date"]);
  return {
    id: typeof id === "number" || typeof id === "string" ? id : undefined,
    title: title ?? null,
    ownerUsername: ownerUsername ? cleanUsername(ownerUsername) : undefined,
    campNumber,
    url: url ?? undefined,
    startDate: startDate ?? undefined,
    endDate: endDate ?? undefined,
  };
}

function normalizeCampPostPayload(raw: UnknownRecord | null | undefined): CampPostContent | null {
  if (!raw) return null;
  const id = raw["id"];
  if (typeof id !== "number" && typeof id !== "string") return null;
  const title = pickStringValue(raw, ["title", "name"]);
  const text =
    pickStringValue(raw, ["content", "text", "body", "message", "description"])?.trim() ??
    pickStringValue(raw, ["title"])?.trim() ??
    "";
  const imageRaw = pickStringValue(raw, ["image", "image_url", "imageUrl", "cover", "cover_url", "photo", "thumb"]) ?? null;
  const createdAt = pickStringValue(raw, ["created_at", "createdAt", "published_at", "post_created_at"]) ?? null;
  const image = imageRaw ? absUrl(imageRaw) || imageRaw : null;
  return {
    id,
    title: title ?? null,
    text,
    image,
    createdAt,
  };
}

function pickStringValue(obj: UnknownRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return null;
}

function pickNumberLikeValue(obj: UnknownRecord, keys: string[]): number | string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function cleanUsername(value?: string | null): string {
  return (value || "").replace(/^@+/, "").trim();
}

function formatCampPostDate(iso?: string | null): string {
  return formatFeedDateLabel(iso);
}

function ArrowLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
