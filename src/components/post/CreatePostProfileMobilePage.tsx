'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PhotoCropModal from '@/components/camp/PhotoCropModal';
import { useLayerStack } from '@/context/LayerStackContext';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import CampPickerOverlayMobile from '@/components/post/CampPickerOverlayMobile';
import PeoplePickerOverlayMobile from '@/components/post/PeoplePickerOverlayMobile';
import LocationPickerOverlayMobile from '@/components/post/LocationPickerOverlayMobile';
import TagsPickerOverlayMobile from '@/components/post/TagsPickerOverlayMobile';
import { useBottomNavBar } from '@/context/BottomNavBarContext';
import { useAuth } from '@/context/AuthContext';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';
import SmartImage from '@/components/SmartImage';
import { normalizeCommentAvatarSrc } from '@/components/comments/shared';
import { createPortal } from 'react-dom';
import { emitCampMarkAdded } from '@/lib/campPostEvents';
import { uploadFilesToGcs } from '@/lib/directUpload';
import { getBrowserApiBase } from '@/lib/apiBase';


const PREFILL_KEY = 'profilePost:prefillCamp';

const CSRF_COOKIE = 'csrftoken';

const DBG = true;
const tag = '🧪 [ProfilePostEdit]';
const g = (title: string, cb: () => void) => {
  if (!DBG) return;
  try { console.groupCollapsed(`${tag} ${title}`); cb(); } finally { console.groupEnd(); }
};
const mask = (t: string) => (t ? `${t.slice(0, 8)}…(${t.length})` : '(empty)');
const snapFD = (fd: FormData): Record<string, string | number> => {
  const out: Record<string, string | number> = {};
  const filesCnt: Record<string, number> = {};
  for (const [k, v] of fd.entries()) {
    if (v instanceof File) {
      filesCnt[k] = (filesCnt[k] ?? 0) + 1;
    } else {
      out[k] = String(v);
    }
  }
  Object.entries(filesCnt).forEach(([k, n]) => (out[`${k}(files)`] = n));
  return out;
};

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const parts = document.cookie ? document.cookie.split('; ') : [];
  for (const part of parts) {
    const eq = part.indexOf('=');
    const key = eq === -1 ? part : part.slice(0, eq);
    if (decodeURIComponent(key) === name) {
      const val = eq === -1 ? '' : part.slice(eq + 1);
      try { return decodeURIComponent(val); } catch { return val; }
    }
  }
  return '';
}

function getCsrf(): string {
  return readCookie(CSRF_COOKIE);
}

async function ensureCsrfUpToDate(apiBase: string): Promise<string> {
  let t = getCsrf();
  if (!t || t.length < 32) {
    try {
      await fetch(`${apiBase}/api/csrf/`, { credentials: 'include', cache: 'no-store' });
    } catch { /* ignore */ }
    t = getCsrf();
  }
  return t || '';
}

type Activity = { id: number; name: string };
type Hashtag = { id: number; name: string };
type CampItem = { id: number; title: string; start_date?: string; end_date?: string };
type ProfileMini = { id: number; username: string; avatar_url?: string };

type GalleryItem = {
  id: string;
  originalFile?: File;
  croppedFile?: File;
  url: string;
  cropMeta?: { scale: number; position: { x: number; y: number } } | null;
  aspectSlot: number;
  displayAspect: number;
  serverKey?: string;
};

type PostUpdatePayload = {
  id: number;
  text?: string;
  images?: string[];
  [key: string]: unknown;
};


const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;

const parseUpdatePayload = (v: unknown): PostUpdatePayload | null => {
  const obj = asRecord(v);
  if (!obj) return null;
  const id = obj.id;
  return typeof id === 'number' ? (obj as PostUpdatePayload) : null;
};

type ImgMeta = { width: number; height: number; aspect: number } | undefined;

async function getImageMeta(file: File): Promise<ImgMeta> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      URL.revokeObjectURL(url);
      resolve(w > 0 && h > 0 ? { width: w, height: h, aspect: w / h } : undefined);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
    img.src = url;
  });
}

async function downscaleImage(
  file: File,
  maxSide: number = 1600,
  targetType: string = 'image/jpeg',
  quality: number = 0.85
): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (Math.max(w, h) > maxSide) {
          const scale = maxSide / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (!blob) {
              resolve(file);
              return;
            }
            const ext = targetType.includes('jpeg') ? '.jpg' : '.webp';
            const name = file.name.replace(/\.[^.]+$/, '') + ext;
            resolve(new File([blob], name, { type: targetType }));
          },
          targetType,
          quality
        );
      } catch {
        URL.revokeObjectURL(url);
        resolve(file);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}


async function getImageMetaFromUrl(url: string): Promise<ImgMeta> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      resolve(w > 0 && h > 0 ? { width: w, height: h, aspect: w / h } : undefined);
    };
    img.onerror = () => resolve(undefined);
    img.src = url;
  });
}


const PREVIEW_H = 210;
const SCROLLBAR_PAD = 8; // высота/зазор под горизонтальный скроллбар
const THUMB_H = PREVIEW_H - SCROLLBAR_PAD;
const ASPECT_SQ = 1;
const PLUS_TILE_SCALE = 0.5;

function chooseAspectSlot(a: number): number {
  if (!Number.isFinite(a) || a <= 0) return ASPECT_SQ;
  return Math.min(Math.max(a, 0.6), 1.8);
}

function usePreviewUrl(croppedFile?: File, originalFile?: File, fallbackUrl?: string): string {
  const previewUrl = useMemo(() => {
    try {
      if (croppedFile) return URL.createObjectURL(croppedFile);
      if (originalFile) return URL.createObjectURL(originalFile);
    } catch {
      /* ignore */
    }
    return fallbackUrl || '';
  }, [croppedFile, originalFile, fallbackUrl]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(previewUrl);
        } catch {
          /* ignore */
        }
      }
    };
  }, [previewUrl]);

  return previewUrl;
}

function SortablePhoto({
  id,
  index,
  croppedFile,
  originalFile,
  url,
  onClick,
  onRemove,
  aspectSlot,
  displayAspect,
  isActive,
  disableClick,
  hideRemove,
}: {
  id: string;
  index: number;
  croppedFile?: File;
  originalFile?: File;
  url?: string;
  onClick: () => void;
  onRemove: () => void;
  aspectSlot: number;
  displayAspect: number;
  isActive: boolean;
  disableClick?: boolean;
  hideRemove?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const previewUrl = usePreviewUrl(croppedFile, originalFile, url);

  const aspectForDisplay = displayAspect || aspectSlot || ASPECT_SQ;
  const normalizedAspect = chooseAspectSlot(aspectForDisplay);
  const widthPx = Math.round(THUMB_H * normalizedAspect);

  // --- распознавание жестов (как в StepThreePhotos)
  const touchStartTs = useRef(0);
  const movedRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const [armDrag, setArmDrag] = useState(false);

  const clearHold = () => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    touchStartTs.current = Date.now();
    movedRef.current = false;
    clearHold();
    // через 150мс считаем, что это уже drag/hold (клик отключим)
    holdTimerRef.current = window.setTimeout(() => {
      movedRef.current = true;
      setArmDrag(true);
    }, 150);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    movedRef.current = true; // любое движение – уже не "клик"
    clearHold();
    if (armDrag) {
      // во время вооружённого long-press подавляем прокрутку контейнера
      try { e.preventDefault(); } catch { /* noop */ }
    }
  }, [armDrag]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    clearHold();
    setArmDrag(false);
    const duration = Date.now() - touchStartTs.current;
    const isClick = !movedRef.current && duration < 200;
    if (isClick && !disableClick) {
      e.stopPropagation();
      onClick();
    }
  }, [onClick]);

  const handlePointerCancel = useCallback(() => {
    clearHold();
    setArmDrag(false);
  }, []);

  // Когда long-press «вооружён», глушим touchmove на документе (нужно для iOS,
  // чтобы после удержания первый сдвиг не прокручивал контейнер, а отдавался DnD)
  useEffect(() => {
    if (!armDrag) return;
    const onMove = (e: TouchEvent) => {
      try { e.preventDefault(); } catch { /* ignore */ }
    };
    document.addEventListener('touchmove', onMove, { passive: false, capture: true });
    return () => document.removeEventListener('touchmove', onMove, { capture: true } as EventListenerOptions);
  }, [armDrag]);

  const isLifted = isDragging;
  const scale = isDragging ? 1.08 : 1;
  const transformParts: string[] = [];
  const baseTransform = CSS.Transform.toString(transform);
  if (baseTransform) transformParts.push(baseTransform);
  if (scale !== 1) transformParts.push(`scale(${scale})`);
  const finalTransform = transformParts.join(' ');

  // Разрешаем горизонтальный скролл, а во время DnD/длинного тапа блокируем жесты
  const touchAction = (armDrag || isDragging) ? 'none' : 'pan-x';
  const finalTransition = transition
    ? `${transition}, box-shadow 160ms ease, opacity 120ms ease`
    : 'transform 160ms ease, box-shadow 160ms ease, opacity 120ms ease';

  const style: React.CSSProperties = {
    transform: finalTransform || undefined,
    transition: finalTransition,
    zIndex: isLifted ? 60 : 'auto',
    touchAction,
    boxShadow: isLifted ? '0 18px 42px rgba(15, 23, 42, 0.22)' : '0 4px 12px rgba(15, 23, 42, 0.08)',
    opacity: isActive ? 0 : 1,
    pointerEvents: isActive ? 'none' : undefined,
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, width: `${widthPx}px`, height: `${THUMB_H}px` }}
      className="relative flex-shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 transition-[transform,box-shadow,opacity] will-change-transform"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex h-full w-full cursor-grab items-center justify-center active:cursor-grabbing"
        onContextMenu={(e) => e.preventDefault()}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={`Фото ${index + 1}`}
            className="h-full w-full select-none object-cover pointer-events-none"
            draggable={false}
          />
        ) : null}
      </div>

      {index === 0 && (
        <span className="absolute top-1 left-1 rounded bg-black/60 px-2 py-0.5 text-[10px] text-white">Заглавное</span>
      )}
      {!hideRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute top-1 right-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs font-bold text-white"
          aria-label="Удалить фото"
        >
          ✕
        </button>
      )}
    </div>
  );
}


function DragOverlayPhoto({ item, index }: { item: GalleryItem; index: number }) {
  const previewUrl = usePreviewUrl(item.croppedFile, item.originalFile, item.url);
  const aspectForDisplay = item.displayAspect || item.aspectSlot || ASPECT_SQ;
  const normalizedAspect = chooseAspectSlot(aspectForDisplay);
  const widthPx = Math.round(THUMB_H * normalizedAspect);

  return (
    <div
      style={{ width: `${widthPx}px`, height: `${THUMB_H}px`, userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
      className="pointer-events-none select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="relative h-full w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-[0_22px_48px_rgba(15,23,42,0.28)] transform scale-[1.08]">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={`Фото ${index + 1}`}
            className="h-full w-full select-none object-cover pointer-events-none"
            draggable={false}
          />
        ) : null}
        {index === 0 && (
          <span className="absolute top-1 left-1 rounded bg-black/60 px-2 py-0.5 text-[10px] text-white">Заглавное</span>
        )}
      </div>
    </div>
  );
}


function Pill({ children, onRemove, avatar }: { children: React.ReactNode; onRemove?: () => void; avatar?: string }) {
  const src = normalizeCommentAvatarSrc(avatar || null);
  try {
    // Логируем сырое и нормализованное значение аватарки отмеченного профиля
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.debug('[ProfilePostEdit][Pill] avatar', { raw: avatar, normalized: src });
    }
  } catch { /* noop */ }
  return (
    <span className="inline-flex items-center gap-1 pl-1 pr-2 py-1 bg-gray-100 border border-gray-200 rounded-full text-xs shrink-0">
      {src && (
        <SmartImage
          src={src}
          alt=""
          width={20}
          height={20}
          className="rounded-full"
          sizes="20px"
          forceUnoptimized
          noFade
          noSkeleton
        />
      )}
      <span className="truncate max-w-[220px]">{children}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-1 text-gray-500 hover:text-black"
          aria-label="Убрать"
        >
          ✕
        </button>
      )}
    </span>
  );
}

function GhostToken({ children, onRemove, title }: { children: React.ReactNode; onRemove: () => void; title?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[13px] text-gray-400 shrink-0"
      title={typeof children === 'string' ? (children as string) : title}
    >
      <span className="truncate max-w-[220px]">{children}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Удалить"
        className="ml-0.5 w-4 h-4 grid place-items-center text-[10px] leading-none text-gray-300 hover:text-gray-600 rounded hover:bg-gray-100/60 focus:outline-none focus:ring-1 focus:ring-gray-200"
      >
        ✕
      </button>
    </span>
  );
}

function Brick({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onFocus={(e) => e.currentTarget.blur()}
      onPointerDown={(e) => (e.currentTarget as HTMLButtonElement).blur()}
      className="h-10 px-3 rounded-full border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-[13px] leading-none flex items-center justify-between whitespace-nowrap focus:outline-none focus-visible:outline-none"
      onClick={onClick}
    >
      <span className="truncate">{label}</span>
      <span aria-hidden className="ml-2 text-gray-400">›</span>
    </button>
  );
}


function ExpandingTextareaForPost({
  value,
  onChange,
  placeholder = 'Текст поста',
  collapseSignal = false,
  onFocusChange,
  overlayRoot,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  collapseSignal?: boolean;
  onFocusChange?: (focused: boolean) => void;
  overlayRoot?: HTMLElement | null;
}) {
  const [isFocused, setIsFocused] = useState(false);

  const collapsedRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => onFocusChange?.(isFocused), [isFocused, onFocusChange]);
  useEffect(() => {
    if (collapseSignal) setIsFocused(false);
  }, [collapseSignal]);

  useEffect(() => {
    if (!isFocused) return;
    const id = requestAnimationFrame(() => {
      if (overlayRoot) {
        overlayRoot.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      taRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [isFocused, overlayRoot]);

  const collapsed = (
    <div
      ref={collapsedRef}
      onClick={() => setIsFocused(true)}
      className="w-full min-w-0 min-h-[60px] max-h-[60px] overflow-y-auto text-sm text-black border-b border-gray-150 px-1 py-0 cursor-text whitespace-pre-wrap"
    >
      {value ? (
        value
      ) : (
        <span className="text-gray-400 block mt-[16px]">{placeholder} (можно упоминать @username)</span>
      )}
    </div>
  );

  const portalTarget = overlayRoot ?? (typeof document !== 'undefined' ? document.body : null);
  const expandedOverlay =
    portalTarget && isFocused
      ? createPortal(
        <div
          className="fixed inset-0 z-[3200] bg-white flex flex-col"
          onKeyDownCapture={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setIsFocused(false);
            }
          }}
        >
          <div className="h-[56px] flex items-center px-4 border-b border-gray-200">
            <div className="text-base font-medium">Текст поста</div>
          </div>
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`${placeholder} (можно упоминать @username)`}
            className="flex-1 min-h-0 w-full bg-white text-base leading-relaxed px-4 py-4 resize-none focus:outline-none"
          />
          <div className="px-4 bg-white border-t border-gray-200 pt-3 pb-[max(env(safe-area-inset-bottom,0px),1rem)]">
            <button
              type="button"
              onClick={() => setIsFocused(false)}
              className="w-full rounded-full bg-black text-white py-3 text-sm font-semibold"
              aria-label="Готово"
            >
              Готово
            </button>
          </div>
        </div>,
        portalTarget,
      )
      : null;

  return (
    <>
      {collapsed}
      {expandedOverlay}
    </>
  );
}

const dd = (d?: string) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(+dt)) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(dt.getDate())}.${p(dt.getMonth() + 1)}.${String(dt.getFullYear()).slice(-2)}`;
};

export default function CreatePostProfileMobilePage() {
  return <CreatePostProfileMobilePageImpl mode="create" />;
}

// 👇 Именованный экспорт для страницы редактирования
export function CreatePostProfileMobilePageImpl({
  mode = 'create',
  postId,
}: {
  mode?: 'create' | 'edit';
  postId?: number;
}) {

  const editing = mode === 'edit';
  const router = useRouter();
  const { profile } = useAuth();
  const { setHide } = useBottomNavBar();
  const overlayEnv = useOverlayEnvironment();
  const { closeTopScreen } = useLayerStack();

  useEffect(() => {
    setHide(true);
    return () => setHide(false);
  }, [setHide]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  // Логируем состояние шапки при рендере и проверяем computed styles
  useEffect(() => {
    const checkHeaderVisibility = () => {
      if (typeof document === 'undefined') return;
      
      // Ищем header элемент
      const headerEl = document.querySelector('.flex.items-center.justify-between.px-4.py-3.border-b.border-gray-200') as HTMLElement | null;
      if (!headerEl) {
        // eslint-disable-next-line no-console
        console.log('[CreatePostProfileMobilePage] header render - header not found in DOM', {
          mode: editing ? 'edit' : 'create',
          postId,
          isOverlay: overlayEnv.isOverlay,
          hasHideHeaderClass: document.body.classList.contains('hide-header'),
        });
        return;
      }
      
      const computed = window.getComputedStyle(headerEl);
      const rect = headerEl.getBoundingClientRect();
      
      // eslint-disable-next-line no-console
      console.log('[CreatePostProfileMobilePage] header render + visibility check', {
        mode: editing ? 'edit' : 'create',
        postId,
        isOverlay: overlayEnv.isOverlay,
        hasHideHeaderClass: document.body.classList.contains('hide-header'),
        computedStyles: {
          display: computed.display,
          visibility: computed.visibility,
          opacity: computed.opacity,
          zIndex: computed.zIndex,
          position: computed.position,
          top: computed.top,
          left: computed.left,
        },
        boundingRect: {
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left,
          bottom: rect.bottom,
          right: rect.right,
          visible: rect.width > 0 && rect.height > 0 && rect.top >= 0,
        },
        parentClasses: headerEl.parentElement?.className || '',
        headerClasses: headerEl.className,
      });
    };
    
    // Проверяем сразу и с небольшой задержкой (после рендера)
    checkHeaderVisibility();
    const timeoutId = setTimeout(checkHeaderVisibility, 100);
    return () => clearTimeout(timeoutId);
  }, [editing, postId, overlayEnv.isOverlay]);


  const [, setCsrfToken] = useState('');
  const API_BASE = getBrowserApiBase();
  const MEDIA_BASE = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL || '').replace(/\/+$/, '');

  useEffect(() => {
    g('mount/env', () => {
      console.log({ editing, postId, API_BASE, MEDIA_BASE, csrfFromCookie: mask(getCsrf()) });
    });
  }, []);

  const absUrl = useCallback((url: string) => {
    if (!url) return '';
    const s0 = String(url).trim();
    if (/^(https?:)?\/\//i.test(s0) || s0.startsWith('data:') || s0.startsWith('blob:')) return s0;
    const isMedia = /^\/(media|uploads|static|profile_pictures|avatars?)\//i.test(s0);
    return (isMedia ? MEDIA_BASE : API_BASE) + (s0.startsWith('/') ? s0 : '/' + s0);
  }, [API_BASE, MEDIA_BASE]);


  const normalizeMediaKey = useCallback((pathOrUrl: string): string => {
    try {
      // Достаём pathname из абсолютного URL или воспринимаем строку как путь
      const u = /^(https?:)?\/\//i.test(pathOrUrl)
        ? new URL(pathOrUrl, typeof window !== 'undefined' ? window.location.origin : 'http://x').pathname
        : pathOrUrl;
      // убираем ведущие слэши и стандартные префиксы хранилищ
      return u.replace(/^\/+/, '').replace(/^(media|uploads)\//i, '');
    } catch {
      // на всякий случай
      return String(pathOrUrl).replace(/^\/+/, '').replace(/^(media|uploads)\//i, '');
    }
  }, []);


  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<'idle' | 'upload' | 'create'>('idle');
  const [submitProgress, setSubmitProgress] = useState(0);
  const [submitFiles, setSubmitFiles] = useState<{ fileIndex: number; fileCount: number } | null>(null);


  const [activities, setActivities] = useState<Activity[]>([]);
  const [hashtags, setHashtags] = useState<Hashtag[]>([]);
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
  const [selectedHashtags, setSelectedHashtags] = useState<string[]>([]);

  const [description, setDescription] = useState('');
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeCropFile, setActiveCropFile] = useState<File | null>(null);
  const [activeCropIndex, setActiveCropIndex] = useState<number | null>(null);
  const [activeCropId, setActiveCropId] = useState<string | null>(null);
  const [activeCropAspect, setActiveCropAspect] = useState<number | null>(null);

  const [selectedCamp, setSelectedCamp] = useState<CampItem | null>(null);
  const [taggedProfiles, setTaggedProfiles] = useState<ProfileMini[]>([]);
  const [locationName, setLocationName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [postLocation, setPostLocation] = useState<{
    address: string;
    latitude: number;
    longitude: number;
    place_id: string;
  } | null>(null);

  const [tagsOpen, setTagsOpen] = useState(false);
  const [campOpen, setCampOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const searchParams = useSearchParams();

  const sensors = useSensors(
    // На iOS надёжнее TouchSensor; PointerSensor оставляем как фоллбек для мыши
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(PointerSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  useEffect(() => {
    const c = getCsrf();
    setCsrfToken(c);
    g('csrf/init', () => console.log({ csrfMasked: mask(c), location: typeof window !== 'undefined' ? window.location.href : '(ssr)' }));
    fetch(`${API_BASE}/api/activities/`)
      .then((r) => r.json())
      .then((list) => {
        if (Array.isArray(list)) setActivities(list);
        else if (Array.isArray(list?.results)) setActivities(list.results);
      })
      .catch(() => { });
    fetch(`${API_BASE}/api/hashtags/`)
      .then((r) => r.json())
      .then((list) => {
        if (Array.isArray(list)) setHashtags(list);
        else if (Array.isArray(list?.results)) setHashtags(list.results);
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    if (!editing || !postId || !Number.isFinite(postId)) return;
    let cancelled = false;
    const t0 = performance.now();
    g('edit-load:start', () => console.log({ url: `${API_BASE}/api/posts/${postId}/` }));
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/posts/${postId}/`, { credentials: 'include', cache: 'no-store' });
        g('edit-load:resp', () => console.log({ ok: r.ok, status: r.status, headers: Object.fromEntries(r.headers.entries()) }));
        if (!r.ok) {
          const text = await r.text().catch(() => '');
          g('edit-load:error-body', () => console.log(text));
          throw new Error('post not found');
        }
        const j = (await r.json().catch(() => ({}))) as {
          text?: string;
          images?: string[];
          location_name?: string;
          latitude?: string | number;
          longitude?: string | number;
          camp_id?: number;
          camp_title?: string;
          camp_starts_at?: string;
          camp_ends_at?: string;
          profiles?: ProfileMini[];
          activities?: Array<{ id: number }>;
          hashtags?: Array<{ id: number }>;
        };
        g('edit-load:json', () => console.log(j));
        if (cancelled) return;
        // text
        setDescription(String(j.text ?? ''));
        // images -> gallery
        const urls: string[] = Array.isArray(j.images) ? j.images : [];
        const absList = urls.map((u) => absUrl(u));
        setGallery(
          absList.map((abs, idx) => {
            // ВАЖНО: сохраняем serverKey в точности так, как его должен видеть бэкенд
            const key = normalizeMediaKey(abs);
            return {
              id: `existing-${idx}`,
              url: abs,
              serverKey: key,
              aspectSlot: ASPECT_SQ,
              displayAspect: ASPECT_SQ,
              cropMeta: null,
            } as GalleryItem;
          })
        );
        // а потом асинхронно уточняем aspect
        Promise.all(absList.map((u) => getImageMetaFromUrl(u))).then((metas) => {
          if (cancelled) return;
          setGallery((prev) =>
            prev.map((it, idx) => {
              const a = metas[idx]?.aspect ?? it.displayAspect ?? 1;
              return { ...it, displayAspect: a, aspectSlot: chooseAspectSlot(a) };
            })
          );
        });
        // location
        if (j.location_name) setLocationName(String(j.location_name));
        if (j.latitude != null && j.longitude != null) {
          setLatitude(String(j.latitude));
          setLongitude(String(j.longitude));
        }
        // camp
        if (Number.isFinite(j.camp_id)) {
          setSelectedCamp({
            id: Number(j.camp_id),
            title: String(j.camp_title || 'Кэмп'),
            start_date: j.camp_starts_at || undefined,
            end_date: j.camp_ends_at || undefined,
          });
        }
        // tagged profiles — нормализуем URL аватарок к абсолютным
        if (Array.isArray(j.profiles)) {
          const normalized: ProfileMini[] = j.profiles.map((p) => {
            const base = p as ProfileMini;
            const raw = base.avatar_url || '';
            const src = raw ? absUrl(raw) : '';
            return { ...base, avatar_url: src || base.avatar_url };
          });
          setTaggedProfiles(normalized);
        }
        // optional: activities/hashtags, если бэкенд их отдаёт
        if (Array.isArray(j.activities)) {
          setSelectedActivities(j.activities.map(x => String(x.id)));
        }
        if (Array.isArray(j.hashtags)) {
          setSelectedHashtags(j.hashtags.map(x => String(x.id)));
        }
      } catch { /* ignore */ }
      finally {
        g('edit-load:done', () => console.log({ ms: Math.round(performance.now() - t0) }));
      }
    })();
    return () => { cancelled = true; };
  }, [editing, postId, API_BASE, absUrl]);

  const filesToGalleryItems = useCallback(async (files: File[]): Promise<GalleryItem[]> => {
    const downsized = await Promise.all(files.map((f) => getImageMeta(f).then(async (meta) => {
      // если нет меты или она очень большая — уменьшаем
      if (!meta || Math.max(meta.width, meta.height) > 2000) {
        const df = await downscaleImage(f);
        return df;
      }
      return f;
    })));
    const metas = await Promise.all(downsized.map(getImageMeta));
    return downsized.map((file, idx) => {
      const meta = metas[idx];
      const aspect = meta?.aspect ?? 1;
      const slot = chooseAspectSlot(aspect);
      return {
        id: `${file.name}-${file.lastModified}-${idx}`,
        originalFile: file,
        url: URL.createObjectURL(file),
        aspectSlot: slot,
        displayAspect: aspect,
        cropMeta: null,
      };
    });
  }, []);

  const revokeGalleryURLs = useCallback((items: GalleryItem[]) => {
    items.forEach((item) => {
      try {
        if (item.url?.startsWith('blob:')) URL.revokeObjectURL(item.url);
      } catch {
        /* ignore */
      }
    });
  }, []);

  const handleAddFiles = useCallback(
    async (list: FileList | null) => {
      const files = Array.from(list || []);
      if (!files.length) return;

      const supported = files.filter((f) => {
        const mime = (f.type || '').toLowerCase();
        const name = (f.name || '').toLowerCase();
        if (mime.includes('heic') || mime.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif')) {
          return false;
        }
        return !mime || mime.startsWith('image/');
      });
      const unsupportedCount = files.length - supported.length;

      if (!supported.length) {
        alert('Поддерживаются только изображения (кроме HEIC/HEIF).');
        return;
      }

      const freeSlots = Math.max(0, 10 - gallery.length);
      if (freeSlots <= 0) return;

      const toAdd = supported.slice(0, freeSlots);
      const skippedCount = supported.length - toAdd.length;

      const newItems = await filesToGalleryItems(toAdd);
      setGallery((prev) => [...prev, ...newItems]);

      if (unsupportedCount > 0) {
        alert('Некоторые файлы не добавлены: поддерживаются только изображения (кроме HEIC/HEIF).');
      }
      if (skippedCount > 0) {
        alert(`Добавлено только ${toAdd.length} из ${supported.length} фото. Максимум — 10.`);
      }
    },
    [filesToGalleryItems, gallery.length],
  );

  const activeDragIndex = useMemo(
    () => (activeDragId ? gallery.findIndex((item) => item.id === activeDragId) : -1),
    [gallery, activeDragId],
  );
  const activeDragItem = activeDragIndex >= 0 ? gallery[activeDragIndex] : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDragId(null);
      if (!over || active.id === over.id) return;
      setGallery((prev) => {
        const oldIndex = prev.findIndex((item) => item.id === active.id);
        const newIndex = prev.findIndex((item) => item.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
    },
    [],
  );


  useEffect(() => {
    try {
      // eslint-disable-next-line no-console
      console.log('[CreatePostProfileMobilePage] selectedCamp changed', {
        selectedCamp,
      });
    } catch { /* noop */ }
  }, [selectedCamp]);


  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
  }, []);

  useEffect(() => () => revokeGalleryURLs(gallery), [gallery, revokeGalleryURLs]);

  useEffect(() => {
    if (!activeCropFile) return;
    return () => {
      try {
        const url = URL.createObjectURL(activeCropFile);
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    };
  }, [activeCropFile]);

  const canPublish = useMemo(
    () => editing ? true : (description.trim().length > 0 || gallery.length > 0),
    [editing, description, gallery.length],
  );

  useEffect(() => {
    if (error && canPublish) setError('');
  }, [error, canPublish]);

  const resetState = useCallback(() => {
    setDescription('');
    setGallery((prev) => {
      revokeGalleryURLs(prev);
      return [];
    });
    setSelectedActivities([]);
    setSelectedHashtags([]);
    setSelectedCamp(null);
    setTaggedProfiles([]);
    setLocationName('');
    setLatitude('');
    setLongitude('');
    setPostLocation(null);
    setTagsOpen(false);
    setCampOpen(false);
    setPeopleOpen(false);
    setLocationOpen(false);
    setActiveCropFile(null);
    setActiveCropIndex(null);
    setActiveCropId(null);
    setActiveCropAspect(null);
    setError('');
    setIsSubmitting(false);
  }, [revokeGalleryURLs]);

  // Для создания нового поста хотим, чтобы экран при первом монтировании
  // открывался "с нуля": без текста, галереи и выбранных сущностей.
  // Префилл кэмпа из PREFILL_KEY / query не ломаем — он проставляется
  // отдельным эффектом ниже. При последующих рендерах здесь ничего не делаем,
  // чтобы не стирать уже выставленный prefill.
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    if (!editing) {
      resetState();
    }
  }, [editing, resetState]);

  useEffect(() => {
    // 1) приоритет — sessionStorage (используем, даже если уже был выбран кэмп),
    // чтобы повторное открытие из другого кэмпа корректно перезаполняло поле.
    try {
      const raw = sessionStorage.getItem(PREFILL_KEY);
      try {
        // eslint-disable-next-line no-console
        console.log('[CreatePostProfileMobilePage] PREFILL_KEY check', {
          key: PREFILL_KEY,
          raw,
        });
      } catch { /* noop */ }
      if (raw) {
        const obj = JSON.parse(raw) as Partial<CampItem>;
        const id = Number(obj.id);
        if (Number.isFinite(id) && id > 0) {
          try {
            // eslint-disable-next-line no-console
            console.log('[CreatePostProfileMobilePage] applying PREFILL_KEY', {
              id,
              obj,
            });
          } catch { /* noop */ }
          setSelectedCamp({
            id,
            title: String(obj.title ?? ''),
            start_date: obj.start_date ?? undefined,
            end_date: obj.end_date ?? undefined,
          });
        }
        sessionStorage.removeItem(PREFILL_KEY);
        try {
          // eslint-disable-next-line no-console
          console.log('[CreatePostProfileMobilePage] PREFILL_KEY consumed and removed');
        } catch { /* noop */ }
        return;
      }
    } catch { }

    // 2) запасной вариант — query-параметры (?camp_id&camp_title&start_date&end_date)
    // если уже выбран кэмп руками или из PREFILL_KEY — не трогаем.
    if (selectedCamp) return;

    if (searchParams) {
      const idQStr = searchParams.get('camp_id') || '';
      const titleQ = searchParams.get('camp_title') || '';
      const sd = searchParams.get('start_date') || undefined;
      const ed = searchParams.get('end_date') || undefined;
      const idQ = Number(idQStr);
      try {
        // eslint-disable-next-line no-console
        console.log('[CreatePostProfileMobilePage] searchParams camp prefill', {
          rawCampId: idQStr,
          idQ,
          titleQ,
          start_date: sd,
          end_date: ed,
        });
      } catch { /* noop */ }
      if (Number.isFinite(idQ) && idQ > 0) {
        setSelectedCamp({ id: idQ, title: titleQ, start_date: sd, end_date: ed });
      }
    }
  }, [selectedCamp, searchParams]);


  useEffect(() => {
    const ae = document.activeElement as HTMLElement | null;
    ae?.blur?.();
  }, []);

  const extractImageKey = useCallback((u: string) => {
    const key = normalizeMediaKey(u);
    g('images_order:extract', () => console.log({ input: u, key }));
    return key; // например: "posts/abc.jpg"
  }, [normalizeMediaKey]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      g('submit:clicked', () =>
        console.log({
          editing,
          postId,
          canPublish,
          descLen: description.trim().length,
          galleryLen: gallery.length,
        }),
      );

      if (!editing) {
        if (!description.trim() && gallery.length === 0) {
          setError('Добавьте текст или хотя бы одно фото');
          g('submit:blocked', () => console.log('нет текста и фото'));
          return;
        }
      }

      const validActivityIds = new Set(activities.map((a) => String(a.id)));
      if (selectedActivities.some((id) => !validActivityIds.has(id))) {
        setError('Выбирайте активности из списка');
        return;
      }

      const validHashtags = new Set(hashtags.map((h) => String(h.id)));
      if (selectedHashtags.some((id) => !validHashtags.has(id))) {
        setError('Выбирайте хэштеги из списка');
        return;
      }

      setIsSubmitting(true);
      setSubmitStage('create');
      setSubmitProgress(0);
      setSubmitFiles(null);

      // ——— перед запросом фиксируем базовый снимок состояния
      g('submit:snapshot', () =>
        console.log({
          textPreview: description.trim().slice(0, 64),
          selectedCamp: selectedCamp ?? null,
          selectedActivities,
          selectedHashtags,
          taggedProfiles: taggedProfiles?.map((p) => p?.id),
          location: { locationName, latitude, longitude },
          galleryDbg: gallery.map((it, i) => ({
            i,
            id: it.id,
            hasCropped: !!it.croppedFile,
            hasOriginal: !!it.originalFile,
            url: it.url?.slice(0, 80),
            serverKey: it.serverKey,
            aspectSlot: it.aspectSlot,
            displayAspect: it.displayAspect,
          })),
        }),
      );

      const token = await ensureCsrfUpToDate(API_BASE);
      g('csrf:ensure', () => console.log({ tokenMasked: mask(token) }));

      try {
        const fd = new FormData();
        fd.set('text', description.trim());
        if (selectedCamp) fd.set('camp_id', String(selectedCamp.id));
        fd.set('activities', JSON.stringify(selectedActivities));
        fd.set('hashtags_json', JSON.stringify(selectedHashtags));
        selectedHashtags.forEach((id) => fd.append('hashtags', id));
        if (taggedProfiles.length) fd.set('tagged_profiles', JSON.stringify(taggedProfiles.map((p) => p.id)));

        const loc = locationName.trim();
        const norm = (s: string): string => {
          if (!s) return '';
          const n = Number(s.replace(',', '.'));
          return Number.isFinite(n) ? String(n) : '';
        };
        const lat = norm(latitude.trim());
        const lon = norm(longitude.trim());
        if (loc) fd.set('location_name', loc);
        // Всегда отправляем координаты, если обе заданы (даже без loc)
        if (lat && lon) {
          fd.set('latitude', lat);
          fd.set('longitude', lon);
        }

        g('submit:formdata-built', () => console.log(snapFD(fd)));

        if (!editing) {
          // ——— создание
          // Собираем кандидатов на загрузку
          const rawFiles: { file: File; idx: number }[] = [];
          gallery.slice(0, 10).forEach((item, idx) => {
            // Используем croppedFile если есть, иначе originalFile
            // Важно: originalFile должен всегда быть доступен, даже если фото не редактировалось
            const file = item.croppedFile ?? item.originalFile;
            if (file && file instanceof File && file.size > 0) {
              rawFiles.push({ file, idx });
            } else {
              g('submit:create:invalid-file', () =>
                console.warn('Invalid file in gallery', {
                  idx,
                  hasCropped: !!item.croppedFile,
                  hasOriginal: !!item.originalFile,
                  fileType: typeof file,
                  fileSize: file instanceof File ? file.size : 'N/A',
                  fileName: file instanceof File ? file.name : 'N/A',
                }),
              );
            }
          });

          // Убираем возможные дубликаты (например, если из-за DnD/кропа один и тот же файл попал в несколько элементов)
          const seen = new Set<string>();
          const validFiles: { file: File; idx: number }[] = [];
          rawFiles.forEach((entry) => {
            const f = entry.file;
            const key = `${f.name}::${f.size}::${f.lastModified}`;
            if (seen.has(key)) return;
            seen.add(key);
            validFiles.push(entry);
          });
          
          // Добавляем только валидные (и уникальные) файлы
          if (validFiles.length === 0 && gallery.length > 0) {
            // Если есть элементы в галерее, но нет валидных файлов - это ошибка
            g('submit:create:no-valid-files', () => console.error('Gallery has items but no valid files', { 
              galleryLength: gallery.length,
              galleryItems: gallery.map((item, idx) => ({
                idx,
                hasCropped: !!item.croppedFile,
                hasOriginal: !!item.originalFile,
                croppedType: typeof item.croppedFile,
                originalType: typeof item.originalFile,
                croppedSize: item.croppedFile instanceof File ? item.croppedFile.size : 'N/A',
                originalSize: item.originalFile instanceof File ? item.originalFile.size : 'N/A',
              }))
            }));
            throw new Error('Нет валидных файлов для отправки. Попробуйте перезагрузить фото.');
          }
          
          let preuploaded: string[] = [];
          try {
            setSubmitStage('upload');
            setSubmitProgress(0);
            setSubmitFiles(null);
            preuploaded = await uploadFilesToGcs(validFiles.map(v => v.file), token, 'post', (info) => {
              setSubmitProgress(info.percent);
              setSubmitFiles({ fileIndex: info.fileIndex, fileCount: info.fileCount });
            });
          } catch (e) {
            g('submit:create:direct-upload-failed', () => console.log(e));
            throw new Error(e instanceof Error ? e.message : 'Ошибка загрузки фото');
          }

          fd.set('preuploaded_images', JSON.stringify(preuploaded));
          
          g('submit:create:files-added', () => console.log({ 
            totalGallery: gallery.length, 
            validFiles: validFiles.length,
            files: validFiles.map(f => ({ idx: f.idx, name: f.file.name, size: f.file.size })),
            preuploaded,
          }));

          setSubmitStage('create');
          const createUrl = `${API_BASE}/api/create-post/`;
          g('submit:create:request', () => console.log({ url: createUrl }));
          const t0 = performance.now();
          const res = await fetch(createUrl, {
            method: 'POST',
            credentials: 'include',
            headers: { 'X-CSRFToken': token },
            body: fd,
          });
          g('submit:create:response', () =>
            console.log({
              ok: res.ok,
              status: res.status,
              redirected: res.redirected,
              url: res.url,
              dtMs: Math.round(performance.now() - t0),
              headers: Object.fromEntries(res.headers.entries()),
            }),
          );

          if (!res.ok) {
            const text = await res.clone().text().catch(() => '');
            g('submit:create:body', () => console.log(text));
            let msg = `Ошибка публикации (${res.status})`;
            try {
              const data = JSON.parse(text);
              msg = (data && (data.error as string)) || msg;
            } catch { }
            throw new Error(msg);
          }

          // Читаем ответ только один раз
          let payload: unknown = null;
          try {
            payload = await res.json();
            g('submit:create:payload', () => console.log({ payload }));
          } catch (e) {
            g('submit:create:parse-error', () => console.error('Failed to parse response', e));
          }

          // Отправляем событие о создании поста
          try {
            window.dispatchEvent(new CustomEvent('profile_post_created', { detail: { post: payload } }));

            // если пост привязан к кэмпу — оповестим ленту отметок кэмпа (включая оверлеи)
            try {
              let campId: number | null =
                selectedCamp && typeof selectedCamp.id === 'number'
                  ? selectedCamp.id
                  : null;

              if (!campId && payload && typeof payload === 'object') {
                const rec = payload as Record<string, unknown>;
                const fromRoot = Number(rec['camp_id']);
                if (Number.isFinite(fromRoot)) campId = fromRoot;
              }

              if (campId && Number.isFinite(campId)) {
                emitCampMarkAdded({ campId, post: payload });
              }
            } catch {
              /* noop */
            }
          } catch { /* noop */ }

          // навигация после создания
          // Сбрасываем состояние отправки перед закрытием
          setIsSubmitting(false);
          
          if (overlayEnv.isOverlay) {
            // В оверлее просто закрываем его
            g('submit:create:close-overlay', () => console.log({ isOverlay: true }));
            // Небольшая задержка для плавного закрытия
            setTimeout(() => {
              closeTopScreen();
            }, 100);
          } else {
            // Если не в оверлее, переходим на профиль
            if (profile?.username) router.replace(`/${profile.username}`);
            else router.back();
          }
          return;
        }

        // ——— редактирование
        // Порядок картинок (важно: только serverKey или вытягиваем из url)
        const order = gallery
          .map((g) => g.serverKey || (g.url ? extractImageKey(g.url) : ''))
          .filter(Boolean) as string[];

        g('submit:edit:order', () => console.log({ orderLen: order.length, orderPreview: order.slice(0, 6) }));

        if (order.length > 0) {
          fd.set('images_order', JSON.stringify(order));
          fd.set('cover_index', '0');
        }

        const url = `${API_BASE}/api/posts/${postId}/update/`;
        const t0 = performance.now();
        g('submit:edit:request', () => console.log({ url }));
        const res = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-CSRFToken': token, Accept: 'application/json' },
          body: fd,
          // keepalive оставляем, но отметим это в логах
          keepalive: true,
        });
        g('submit:edit:response', () =>
          console.log({
            ok: res.ok,
            status: res.status,
            redirected: res.redirected,
            url: res.url,
            dtMs: Math.round(performance.now() - t0),
            headers: Object.fromEntries(res.headers.entries()),
            keepaliveUsed: true,
          }),
        );

        if (!res.ok) {
          const text = await res.clone().text().catch(() => '');
          g('submit:edit:body', () => console.log(text));
          // ——— попытка «верификации факта сохранения» на стороне чтения
          // (проверка оставлена для диагностики, но навигация убрана - она будет выполнена ниже)
          try {
            const verify = await fetch(`${API_BASE}/api/posts/${postId}/`, { credentials: 'include', cache: 'no-store' });
            const j = verify.ok ? await verify.json().catch(() => null) : null;
            const looksUpdated = !!j && String(j.text ?? '') === description.trim();
            g('submit:edit:verify', () => console.log({ verifyOk: verify.ok, looksUpdated }));
            // Навигация убрана отсюда - она будет выполнена в общем блоке после отправки события
          } catch { }

          let msg = `Ошибка сохранения (${res.status})`;
          try {
            const data = JSON.parse(text);
            msg = (data && (data.error as string)) || msg;
          } catch { }
          throw new Error(msg);
        }

        // ——— тело ответа (диагностика JSON)
        let updatedPost: PostUpdatePayload | null = null;
        try {
          const ct = res.headers.get('content-type') || '';
          g('submit:edit:parse', () => console.log({ contentType: ct }));
          if (ct.includes('application/json')) {
            const data: unknown = await res.json().catch(() => null);
            g('submit:edit:json', () => console.log({ json: data }));
            const obj = asRecord(data);
            if (obj && 'post' in obj) {
              updatedPost = parseUpdatePayload((obj as Record<string, unknown>).post);
            }
            if (!updatedPost) updatedPost = parseUpdatePayload(data);
          } else {
            g('submit:edit:parse-skip', () => console.log('non-json response — skip parse'));
          }
        } catch (e) {
          g('submit:edit:parse-error', () => console.log(e));
        }

        // ——— локальная синхронизация
        try {
          if (updatedPost) {
            window.dispatchEvent(new CustomEvent('profile_post_updated', { detail: { id: Number(postId), post: updatedPost } }));
          } else {
            window.dispatchEvent(
              new CustomEvent('profile_post_updated', { detail: { id: Number(postId), post: { id: Number(postId), text: description.trim() } } }),
            );
          }
          g('submit:edit:event-dispatched', () => console.log({ dispatched: true }));
        } catch (e) {
          g('submit:edit:event-error', () => console.log(e));
        }

        // ——— После сохранения закрываем страницу редактирования
        // Изменения уже отправлены через событие profile_post_updated, которое обновит пост динамически
        if (overlayEnv.isOverlay) {
          // В оверлее просто закрываем его
          g('submit:edit:close-overlay', () => console.log({ isOverlay: true }));
          closeTopScreen();
          return;
        }

        // Если не в оверлее, но мы на странице редактирования - возвращаемся назад
        // Это вернет нас на страницу поста (если мы открыли редактирование из неё)
        // или на предыдущую страницу (если открыли редактирование напрямую по URL)
        // В любом случае событие profile_post_updated обновит пост динамически
        const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
        const isOnEditPage = /\/edit\/?$/.test(currentPath);
        
        if (isOnEditPage) {
          g('submit:edit:go-back', () => console.log({ currentPath, isOnEditPage: true }));
          try {
            router.back();
          } catch (e) {
            g('submit:edit:go-back:err', () => console.log(e));
            // Fallback: если router.back() не сработал, пытаемся перейти на страницу поста
            const targetUrl = profile?.username ? `/${profile.username}/post/${postId}` : `/post/${postId}`;
            try {
              router.replace(targetUrl);
            } catch {
              // Последний fallback
              if (typeof window !== 'undefined') {
                window.location.href = targetUrl;
              }
            }
          }
          return;
        }

        // Если мы не на странице редактирования (не должно происходить, но на всякий случай)
        // просто возвращаемся назад
        g('submit:edit:fallback-back', () => console.log({ currentPath }));
        try {
          router.back();
        } catch {
          // Ignore
        }

        return;
      } catch (err) {
        g('submit:error', () => console.error(err));
        setError(err instanceof Error ? err.message : editing ? 'Ошибка сохранения' : 'Ошибка публикации поста');
      } finally {
        setIsSubmitting(false);
        setSubmitStage('idle');
        setSubmitProgress(0);
        setSubmitFiles(null);
        g('submit:finally', () => console.log({ isSubmitting: false, visibility: typeof document !== 'undefined' ? document.visibilityState : 'n/a' }));
      }
    },
    [
      activities,
      description,
      gallery,
      hashtags,
      latitude,
      locationName,
      longitude,
      profile?.username,
      router,
      selectedActivities,
      selectedCamp,
      selectedHashtags,
      taggedProfiles,
      editing,
      postId,
      extractImageKey,
      API_BASE,
      overlayEnv.isOverlay,
      closeTopScreen,
      profile?.username,
    ],
  );

  useEffect(() => {
    const onProfilePostUpdated: EventListener = (e) =>
      g('event:profile_post_updated', () => console.log(e));

    window.addEventListener('profile_post_updated', onProfilePostUpdated);
    return () => window.removeEventListener('profile_post_updated', onProfilePostUpdated);
  }, []);

  const [confirmExitOpen, setConfirmExitOpen] = useState(false);

  const requestClose = useCallback(() => {
    if (description || gallery.length || selectedActivities.length || selectedHashtags.length || selectedCamp || taggedProfiles.length || locationName) {
      setConfirmExitOpen(true);
    } else {
      // Если в оверлее - закрываем оверлей, иначе используем router.back()
      if (overlayEnv.isOverlay) {
        closeTopScreen();
      } else {
        router.back();
      }
    }
  }, [description, gallery.length, locationName, router, selectedActivities.length, selectedCamp, selectedHashtags.length, taggedProfiles.length, overlayEnv.isOverlay, closeTopScreen]);

  const cropSrc = useMemo(() => (activeCropFile ? URL.createObjectURL(activeCropFile) : ''), [activeCropFile]);
  useEffect(() => () => {
    if (cropSrc) {
      try {
        URL.revokeObjectURL(cropSrc);
      } catch {
        /* ignore */
      }
    }
  }, [cropSrc]);
  //

  // --- Параметры вьюпорта для корректной геометрии кропера на мобильных ---
  const [vp, setVp] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const update = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Слишком высокая вертикальная картинка относительно доступной области кропера?
  const isTooTallPortrait = useMemo(() => {
    const a = activeCropAspect ?? 1;
    if (!Number.isFinite(a) || a >= 1) return false; // не портрет
    // Геометрия DialogContent (из PhotoCropModal): ширина ~ min(vp.w, 32rem), паддинги p-6 => минус 48 по ширине
    // Полезная высота меньше на панель управления (ползунок зума + кнопки) ~220px
    const dialogW = Math.max(0, Math.min(vp.w, 512));
    const containerW = Math.max(0, dialogW - 48);
    const usableH = Math.max(0, vp.h - 220);
    if (containerW === 0 || usableH === 0) return false;
    const thresholdAspect = containerW / usableH;
    return a < thresholdAspect;
  }, [activeCropAspect, vp.w, vp.h]);

  // Класс для PhotoCropModal: повторяем логику как в CreateCampPostMobile
  const cropModalClass = useMemo(() => {
    if (!isTooTallPortrait) {
      // обычный случай — оставляем ширину по умолчанию
      return 'w-full';
    }
    // узкая высокая картинка — фиксируем высоту области кропера, ширина достроится по aspect-ratio
    // используем 100dvh вместо 100vh для мобильных браузеров
    return [
      'w-auto',
      '[&>div:first-of-type]:w-auto',
      '[&>div:first-of-type]:h-[min(520px,calc(100dvh-220px))]'
    ].join(' ');
  }, [isTooTallPortrait]);

  const campDateCellRef = useRef<HTMLSpanElement | null>(null);
  const galleryWrapRef = useRef<HTMLDivElement | null>(null);
  const [leftColPx, setLeftColPx] = useState<number | null>(null);
  useEffect(() => {
    const el = campDateCellRef.current;
    if (!el) {
      setLeftColPx(null);//
      return;
    }
    const update = () => setLeftColPx(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [selectedCamp]);

  // iOS Safari: глушим системное меню (копировать/поделиться) и выделение в зоне галереи
  useEffect(() => {
    const root = galleryWrapRef.current;
    if (!root) return;

    const stopIfInside = (e: Event) => {
      if (!root) return;
      const t = e.target as Node | null;
      if (t && root.contains(t)) {
        e.preventDefault();
      }
    };

    // захватываем как можно раньше
    const opts = { capture: true } as AddEventListenerOptions;
    document.addEventListener('contextmenu', stopIfInside, opts);
    document.addEventListener('selectstart', stopIfInside, opts);
    document.addEventListener('copy', stopIfInside, opts);

    // iOS долгий тап: временно отключаем user-select/touch-callout на всём документе,
    // только пока тапаем внутри галереи — чтобы гарантированно не всплывало меню.
    let prevUsr = '';
    let prevCallout = '';
    const docEl = document.documentElement;
    const setGlobalBlock = () => {
      prevUsr = docEl.style.getPropertyValue('-webkit-user-select');
      prevCallout = docEl.style.getPropertyValue('-webkit-touch-callout');
      docEl.style.setProperty('-webkit-user-select', 'none');
      docEl.style.setProperty('-webkit-touch-callout', 'none');
    };
    const restoreGlobalBlock = () => {
      if (prevUsr) docEl.style.setProperty('-webkit-user-select', prevUsr);
      else docEl.style.removeProperty('-webkit-user-select');
      if (prevCallout) docEl.style.setProperty('-webkit-touch-callout', prevCallout);
      else docEl.style.removeProperty('-webkit-touch-callout');
    };
    const onTouchStart = (e: TouchEvent) => {
      const t = e.target as Node | null;
      if (t && root.contains(t)) setGlobalBlock();
    };
    const onTouchEnd = () => restoreGlobalBlock();
    const onTouchCancel = () => restoreGlobalBlock();
    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('touchend', onTouchEnd, { capture: true });
    document.addEventListener('touchcancel', onTouchCancel, { capture: true });

    return () => {
      document.removeEventListener('contextmenu', stopIfInside, opts as EventListenerOptions);
      document.removeEventListener('selectstart', stopIfInside, opts as EventListenerOptions);
      document.removeEventListener('copy', stopIfInside, opts as EventListenerOptions);
      document.removeEventListener('touchstart', onTouchStart, { capture: true } as EventListenerOptions);
      document.removeEventListener('touchend', onTouchEnd, { capture: true } as EventListenerOptions);
      document.removeEventListener('touchcancel', onTouchCancel, { capture: true } as EventListenerOptions);
      restoreGlobalBlock();
    };
  }, []);

  // В оверлее используем absolute, иначе fixed
  const containerClass = overlayEnv.isOverlay 
    ? 'absolute inset-0 bg-white flex flex-col'
    : 'fixed inset-0 z-[3000] bg-white flex flex-col';

  return (
    <div className={containerClass}>
      <style jsx global>{`
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .camp-title {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 3;
          overflow: hidden;
          word-break: break-word;
          overflow-wrap: anywhere;
        }
          /* Глушим системные меню/выделение внутри галереи */
        .gallery-no-callout,
        .gallery-no-callout * {
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          user-select: none;
          -webkit-user-drag: none;
        }
        /* Убираем синий подсвет на iOS при тапе */
        :root { -webkit-tap-highlight-color: transparent; }
      `}</style>

      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <button type="button" onClick={requestClose} className="text-sm text-gray-500 hover:text-black">
          Отмена
        </button>
        <h1 className="text-base font-semibold">{editing ? 'Редактировать пост' : 'Создать пост'}</h1>
        <div className="w-10" aria-hidden />
      </header>

      {isSubmitting && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-white/80">
          <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-400 border-t-transparent" />
          <div className="text-sm text-gray-700">
            {submitStage === 'upload'
              ? `Загружаем фото ${submitProgress}%${submitFiles ? ` (${submitFiles.fileIndex}/${submitFiles.fileCount})` : ''}`
              : (editing ? 'Сохраняем пост...' : 'Создаем пост...')}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 pb-24 relative">
        {error && (
          <div className="sticky top-2 z-20 mx-auto mb-2 max-w-sm rounded-lg border border-red-300 bg-red-100 px-4 py-2 text-center text-sm text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-y-4 pb-6 pt-4" autoComplete="off">
          <div className="text-center text-[13px] text-gray-600">{gallery.length}/10 фото выбрано</div>

          {gallery.length === 0 && !editing && (
            <label
              htmlFor="mobile-post-photos"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-10 text-gray-400 hover:border-gray-400 hover:text-black"
            >
              <span className="text-4xl leading-none">+</span>
              <span className="text-sm">Добавить фото (до 10)</span>
              <input
                id="mobile-post-photos"
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => handleAddFiles(e.currentTarget.files)}
              />
            </label>
          )}

          {!activeCropFile && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToHorizontalAxis]}
              onDragStart={(event) => {
                g('dnd:drag-start', () => console.log({
                  id: String(event.active.id),
                  fromCrop: !!activeCropFile,
                  activeCropId,
                }));
                handleDragStart(event);
              }}
              onDragEnd={(event) => {
                g('dnd:drag-end', () => console.log({
                  id: String(event.active.id),
                  over: event.over ? String(event.over.id) : null,
                  fromCrop: !!activeCropFile,
                  activeCropId,
                }));
                handleDragEnd(event);
              }}
              onDragCancel={(event) => {
                g('dnd:drag-cancel', () => console.log({
                  id: event?.active ? String(event.active.id) : null,
                  fromCrop: !!activeCropFile,
                  activeCropId,
                }));
                handleDragCancel();
              }}
            >
              <SortableContext items={gallery.map((item) => item.id)} strategy={horizontalListSortingStrategy}>
                <div
                  ref={galleryWrapRef}
                  className="relative overflow-x-auto gallery-no-callout"
                  onContextMenu={(e) => e.preventDefault()}
                  onSelect={(e) => {
                    // на всякий случай, если браузер пытается начать выделение
                    e.preventDefault();
                  }}
                  style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none', paddingBottom: SCROLLBAR_PAD }}
                >
                  <div className="flex w-max items-center gap-3">
                    {gallery.length > 0 && gallery.length < 10 && !editing && (
                      <label
                        htmlFor="mobile-post-photos-inline"
                        className="flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-2xl text-gray-400 hover:border-gray-400 hover:text-black"
                        style={{
                          width: `${Math.round(THUMB_H * ASPECT_SQ * PLUS_TILE_SCALE)}px`,
                          height: `${Math.round(THUMB_H * PLUS_TILE_SCALE)}px`,
                        }}
                      >
                        +
                        <input
                          id="mobile-post-photos-inline"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          multiple
                          hidden
                          onChange={(e) => handleAddFiles(e.currentTarget.files)}
                        />
                      </label>
                    )}

                    {gallery.map(({ id, croppedFile, originalFile, aspectSlot, displayAspect, url }, index) => (
                      <SortablePhoto
                        key={id}
                        id={id}
                        index={index}
                        croppedFile={croppedFile}
                        originalFile={originalFile}
                        url={url}
                        aspectSlot={aspectSlot}
                        displayAspect={displayAspect}
                        isActive={activeDragId === id}

                        disableClick={editing}
                        hideRemove={editing}
                        onClick={() => {
                          if (editing) return; // запрет кропа в режиме редактирования
                          const file = originalFile ?? croppedFile;
                          if (!file) return;
                          // Логируем открытие кропера по конкретной плитке.
                          g('crop:open', () => console.log({
                            idx: index,
                            id,
                            activeDragId,
                          }));
                          // На всякий случай собственноручно сбрасываем активный drag-состояние.
                          handleDragCancel();
                          // Запоминаем и индекс, и стабильный id элемента,
                          // чтобы при асинхронном обновлении (DnD, setState)
                          // кроп всегда применялся к правильной фотографии.
                          setActiveCropFile(file);
                          setActiveCropIndex(index);
                          setActiveCropId(id);
                          setActiveCropAspect(displayAspect || aspectSlot);
                        }}
                        onRemove={() => {
                          if (editing) return; // запрет удаления в режиме редактирования
                          setGallery((prev) => {
                            const removed = prev[index];
                            if (removed?.url?.startsWith('blob:')) {
                              try { URL.revokeObjectURL(removed.url); } catch { /* ignore */ }
                            }
                            return prev.filter((_, i) => i !== index);
                          });
                        }}
                      />
                    ))}
                  </div>
                </div>
              </SortableContext>
              <DragOverlay modifiers={[restrictToHorizontalAxis]} dropAnimation={{ duration: 180 }}>
                {activeDragItem && activeDragIndex >= 0 ? (
                  <DragOverlayPhoto item={activeDragItem} index={activeDragIndex} />
                ) : null}
              </DragOverlay>
            </DndContext>
          )}

          <ExpandingTextareaForPost
            value={description}
            onChange={setDescription}
            placeholder="Текст поста"
            overlayRoot={scrollRef.current}
          />

          <div className="grid grid-cols-2 gap-2">
            <Brick label="Локация" onClick={() => setLocationOpen(true)} />
            <Brick label="Отметить кэмп" onClick={() => setCampOpen(true)} />
            <Brick label="Отметить людей" onClick={() => setPeopleOpen(true)} />
            <Brick label="Теги" onClick={() => setTagsOpen(true)} />
          </div>

          {selectedCamp && (
            <div className="overflow-hidden">
              <div
                className="grid items-baseline gap-6 pl-2 pr-2 py-1"
                style={{ gridTemplateColumns: leftColPx ? `${leftColPx}px 1fr` : 'auto 1fr' }}
              >
                {selectedCamp.start_date && (
                  <span ref={campDateCellRef} className="text-xs text-gray-500 whitespace-nowrap">
                    {selectedCamp.end_date
                      ? `${dd(selectedCamp.start_date)} - ${dd(selectedCamp.end_date)}`
                      : dd(selectedCamp.start_date)}
                  </span>
                )}
                <div className="min-w-0 flex items-start gap-3">
                  <span
                    className="flex-1 min-w-0 truncate text-sm text-gray-700"
                    title={selectedCamp.title}
                  >
                    {selectedCamp.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedCamp(null)}
                    className="w-5 h-5 grid place-items-center rounded text-[10px] text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    aria-label="Убрать кэмп"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          )}

          {locationName && (
            <div className="pl-2 pr-2">
              <div className="grid items-center gap-6 py-1" style={{ gridTemplateColumns: leftColPx ? `${leftColPx}px 1fr` : 'auto 1fr' }}>
                <span className="text-[13px] text-gray-500">Где?</span>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex-1 min-w-0 truncate text-sm text-gray-700" title={locationName}>{locationName}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setLocationName('');
                      setLatitude('');
                      setLongitude('');
                      setPostLocation(null);
                    }}
                    className="text-xs text-gray-400 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          )}

          {taggedProfiles.length > 0 && (
            <div className="pl-2 pr-2">
              <div
                className="grid items-center gap-6 py-1"
                style={{ gridTemplateColumns: leftColPx ? `${leftColPx}px 1fr` : 'auto 1fr' }}
              >
                <span className="text-[13px] text-gray-500">С кем?</span>
                <div className="min-w-0 overflow-x-auto no-scrollbar">
                  <div className="inline-flex items-center gap-2 whitespace-nowrap">
                    {taggedProfiles.map((p) => (
                      <Pill key={p.id} avatar={p.avatar_url} onRemove={() => setTaggedProfiles((prev) => prev.filter((x) => x.id !== p.id))}>
                        @{p.username}
                      </Pill>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {(selectedActivities.length > 0 || selectedHashtags.length > 0) && (
            <div className="overflow-x-auto no-scrollbar pl-2 pr-2">
              <div className="inline-flex items-center gap-3 whitespace-nowrap">
                {selectedActivities.map((id) => {
                  const a = activities.find((x) => String(x.id) === id);
                  return (
                    <GhostToken key={`act-${id}`} onRemove={() => setSelectedActivities((prev) => prev.filter((x) => x !== id))} title={a?.name ?? id}>
                      {a?.name ?? id}
                    </GhostToken>
                  );
                })}
                {selectedHashtags.map((id) => {
                  const h = hashtags.find((x) => String(x.id) === id);
                  return (
                    <GhostToken key={`tag-${id}`} onRemove={() => setSelectedHashtags((prev) => prev.filter((x) => x !== id))} title={h?.name ?? id}>
                      #{h?.name ?? id}
                    </GhostToken>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={!canPublish || isSubmitting}
            className={`w-full rounded-full py-3 text-sm font-semibold transition ${!canPublish || isSubmitting ? 'bg-gray-300 text-gray-600' : 'bg-black text-white hover:bg-black/80'
              }`}
          >
            {isSubmitting ? (editing ? 'Сохраняю…' : 'Публикую…') : (editing ? 'Сохранить' : 'Опубликовать')}
          </button>
        </form>
      </div>

      {confirmExitOpen && (
        <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h2 className="text-base font-semibold mb-2">Закрыть создание поста?</h2>
            <p className="text-sm text-gray-600 mb-4">Все несохранённые изменения будут потеряны.</p>
            <div className="flex justify-end gap-3 text-sm">
              <button type="button" onClick={() => setConfirmExitOpen(false)} className="text-gray-600 hover:text-black">
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmExitOpen(false);
                  resetState();
                  router.back();
                }}
                className="font-semibold text-red-600 hover:text-red-700"
              >
                Выйти
              </button>
            </div>
          </div>
        </div>
      )}

      {!editing && activeCropFile && cropSrc && typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              aria-hidden
              className="fixed inset-0 z-[5000] bg-black/40 backdrop-blur-[1px]"
              onTouchMove={(e) => {
                // Жёстко гасим любые тапы/скролл по фону, пока открыт кропмер.
                e.preventDefault();
              }}
            />
            <PhotoCropModal
              imageSrc={cropSrc}
              aspect={activeCropAspect ?? ASPECT_SQ}
              className={`${cropModalClass} z-[5010]`}
              initialScale={activeCropIndex !== null ? gallery[activeCropIndex]?.cropMeta?.scale : undefined}
              initialPosition={activeCropIndex !== null ? gallery[activeCropIndex]?.cropMeta?.position : undefined}
              onClose={() => {
                setActiveCropFile(null);
                setActiveCropIndex(null);
                setActiveCropId(null);
                setActiveCropAspect(null);
              }}
              onComplete={(croppedFile, cropMeta) => {
                // Используем в первую очередь стабильный id элемента,
                // чтобы избежать смещения при возможной перестановке/обновлении галереи.
                if (activeCropId !== null) {
                  const applyUpdate = (nextAspect?: number) => {
                    setGallery((prev) =>
                      prev.map((item) => {
                        if (item.id !== activeCropId) return item;
                        const aspect = nextAspect ?? item.displayAspect ?? item.aspectSlot;
                        return {
                          ...item,
                          croppedFile,
                          originalFile: item.originalFile,
                          cropMeta,
                          displayAspect: aspect,
                          aspectSlot: chooseAspectSlot(aspect),
                        };
                      }),
                    );
                  };

                  getImageMeta(croppedFile)
                    .then((meta) => applyUpdate(meta?.aspect))
                    .catch(() => applyUpdate());
                } else if (activeCropIndex !== null) {
                  const applyUpdate = (nextAspect?: number) => {
                    setGallery((prev) =>
                      prev.map((item, idx) => {
                        if (idx !== activeCropIndex) return item;
                        const aspect = nextAspect ?? item.displayAspect ?? item.aspectSlot;
                        return {
                          ...item,
                          croppedFile,
                          originalFile: item.originalFile,
                          cropMeta,
                          displayAspect: aspect,
                          aspectSlot: chooseAspectSlot(aspect),
                        };
                      }),
                    );
                  };

                  getImageMeta(croppedFile)
                    .then((meta) => applyUpdate(meta?.aspect))
                    .catch(() => applyUpdate());
                }
                setActiveCropFile(null);
                setActiveCropIndex(null);
                setActiveCropId(null);
                setActiveCropAspect(null);
              }}
            />
          </>,
          document.body
        )
      }

      <TagsPickerOverlayMobile
        open={tagsOpen}
        onClose={() => setTagsOpen(false)}
        activities={activities}
        hashtags={hashtags}
        selectedActivities={selectedActivities}
        selectedHashtags={selectedHashtags}
        setSelectedActivities={(value) => {
          if (value.length <= 4) setSelectedActivities(value);
          else if (value.length > selectedActivities.length) alert('Максимум 4 активности.');
        }}
        setSelectedHashtags={setSelectedHashtags}
      />


      <CampPickerOverlayMobile
        open={campOpen}
        onClose={() => setCampOpen(false)}
        onPick={(camp) => {
          setSelectedCamp(camp);
          setCampOpen(false);
        }}
        layout="fullscreen"
      />

      <PeoplePickerOverlayMobile
        open={peopleOpen}
        onClose={() => setPeopleOpen(false)}
        initialSelected={taggedProfiles}
        onDone={(list) => {
          setTaggedProfiles(list);
          setPeopleOpen(false);
        }}
        limit={10}
        layout="fullscreen"
      />

      <LocationPickerOverlayMobile
        open={locationOpen}
        onClose={() => setLocationOpen(false)}
        initialSelected={postLocation}
        onDone={(loc) => {
          setPostLocation(loc);
          setLocationName(loc.address);
          setLatitude(String(loc.latitude));
          setLongitude(String(loc.longitude));
          setLocationOpen(false);
        }}
        layout="fullscreen"
      />
    </div>
  );
}
