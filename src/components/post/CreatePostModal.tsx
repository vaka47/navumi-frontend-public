"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogPortal, DialogOverlay } from '@/components/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import PhotoCropModal from '@/components/camp/PhotoCropModal';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import TagsPickerOverlay from '@/components/post/TagsPickerOverlay';
import CampPickerOverlay from '@/components/post/CampPickerOverlay';
import PeoplePickerOverlay from '@/components/post/PeoplePickerOverlay';
import LocationPickerOverlay from "@/components/post/LocationPickerOverlay";
//import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from "react-dom";
import { campPathFrom } from "@/components/post/helpers/campPath";
import SmartImage from "@/components/SmartImage";
import { emitCampMarkAdded } from '@/lib/campPostEvents';
import { normalizeCommentAvatarSrc } from "@/components/comments/shared";
import { uploadFilesToGcs } from "@/lib/directUpload";
import { getBrowserApiBase } from "@/lib/apiBase";


type CampItem = {
  id: number;
  title: string;
  start_date?: string;
  end_date?: string;
  // ↓ доп. поля для мгновенной правильной ссылки
  camp_owner_username?: string;
  camp_public_key?: string | number;
  camp_slug?: string;
  camp_url?: string;
  camp_number?: number | string;
};

function extractCampExtras(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;

  // владелец
  const owner =
    (typeof o['camp_owner_username'] === 'string' && o['camp_owner_username']) ||
    (typeof o['owner_username'] === 'string' && o['owner_username']) ||
    (typeof o['club_username'] === 'string' && o['club_username']) ||
    (typeof o['organizer_username'] === 'string' && o['organizer_username']) ||
    (typeof o['owner'] === 'string' && (o['owner'] as string).replace(/^@+/, '')) ||
    undefined;

  // ключ/slug/готовый url
  const campNumber =
    (o['camp_number'] as string | number | undefined) ??
    (o['number'] as string | number | undefined);

  const publicKeyRaw =
    (o['camp_public_key'] as string | number | undefined) ??
    (o['public_key'] as string | number | undefined) ??
    (o['key'] as string | number | undefined) ??
    (o['pk'] as string | number | undefined);

  const slug =
    (o['camp_slug'] as string | undefined) ??
    (o['slug'] as string | undefined);

  let url = (o['camp_url'] as string | undefined) ?? (o['url'] as string | undefined);

  const out: Record<string, unknown> = {};
  if (owner) out['camp_owner_username'] = owner;
  if (publicKeyRaw !== undefined && publicKeyRaw !== null) out['camp_public_key'] = String(publicKeyRaw);
  if (campNumber !== undefined && campNumber !== null) out['camp_number'] = campNumber;
  if (slug) out['camp_slug'] = slug;

  // если готового url нет — соберём его строго без fallback на id
  if (!url && owner) {
    url = campPathFrom(owner, {
      camp_number: campNumber,
      slug,
      public_key: publicKeyRaw,
    });
  }
  if (url) out['camp_url'] = url;

  try {
    console.groupCollapsed('🧪 [CPM] extractCampExtras');
    console.log('input', o);
    console.log('output', out);
    console.groupEnd();
  } catch { }

  return out;
}

function normalizeCamp(c: CampItem): CampItem {
  // достраиваем owner/slug/public_key/url строго без fallback на id
  const extras = extractCampExtras(c);
  return { ...c, ...extras } as CampItem;
}

const DBG = (...a: unknown[]) => console.log('[CPM]', ...a);
const TAG = '🧪 [CPM]';
const G = (title: string, details?: unknown) => {
  try {
    console.groupCollapsed(`${TAG} ${title}`);
    if (details !== undefined) console.log(details);
    console.groupEnd();
  } catch { }
};
const dumpFD = (fd: FormData) => {
  const out: Record<string, string> = {};
  fd.forEach((v, k) => {
    out[k] = v instanceof File ? `(File:${v.name}, ${v.type}, ${v.size}b)` : v;
  });
  return out;
};

type CSSVars = React.CSSProperties & Record<'--overlay-h', string>;

//type Props = { open: boolean; onClose: () => void; };
type Activity = { id: number; name: string; };
type Hashtag = { id: number; name: string; };
type ProfileMini = { id: number; username: string; avatar_url?: string };

type EditInitial = {
  postId: number;
  text?: string;
  images?: string[]; // абсолютные URL картинок
  camp?: CampItem | null;
  taggedProfiles?: ProfileMini[];
  activityIds?: string[];
  hashtagIds?: string[];
  location_name?: string;
  latitude?: string;
  longitude?: string;
};

type CreatePostModalProps = {
  open: boolean;
  onClose: () => void;
  mode?: 'create' | 'edit';
  initial?: EditInitial;
  onSaved?: (updatedPost: unknown) => void;
  prefillCamp?: CampItem | null;
};




const dd = (d?: string) => {
  if (!d) return '';
  const dt = new Date(d); if (isNaN(+dt)) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(dt.getDate())}.${p(dt.getMonth() + 1)}.${String(dt.getFullYear()).slice(-2)}`;
};
// const campLabel = (c: CampItem) => {
//     const left = (c.start_date && c.end_date) ? `${dd(c.start_date)} - ${dd(c.end_date)}`
//         : (c.start_date ? dd(c.start_date) : '');
//     return left ? `${left} - ${c.title}` : c.title;
// };
//
// const campDateOnly = (c: CampItem) =>
//     c.start_date && c.end_date ? `${dd(c.start_date)} - ${dd(c.end_date)}`
//         : c.start_date ? dd(c.start_date)
//             : '';



type GalleryItem = {
  id: string;
  originalFile?: File;                // ← опционально
  croppedFile?: File;
  url: string;
  cropMeta?: { scale: number; position: { x: number; y: number } };
  aspectSlot: number;
};

const PREVIEW_H = 210;
const ASPECT_LAND = 16 / 9;
const ASPECT_SQ = 1;
const ASPECT_PORT = 9 / 16;
const PLUS_TILE_SCALE = 0.5;

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const cookie = document.cookie.split('; ').find((row) => row.startsWith(name + '='));
  return cookie ? decodeURIComponent(cookie.split('=')[1]) : null;
}

async function getImageMeta(file: File): Promise<{ w: number; h: number; a: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      URL.revokeObjectURL(url);
      resolve(w > 0 && h > 0 ? { w, h, a: w / h } : null);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

async function downscaleImage(
  file: File,
  maxSide: number = 2000,
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
function chooseAspectSlot(a: number): number {
  if (a >= 1.2) return ASPECT_LAND;
  if (a <= 0.8) return ASPECT_PORT;
  return ASPECT_SQ;
}

/* ---------- UI helpers ---------- */
function Pill({
  children,
  onRemove,
  avatar,
}: {
  children: React.ReactNode;
  onRemove?: () => void;
  avatar?: string;
}) {
  const src = normalizeCommentAvatarSrc(avatar || null);
  try {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.debug("[CPM][Pill] avatar", { raw: avatar, normalized: src });
    }
  } catch {
    /* noop */
  }
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
        <button type="button" onClick={onRemove} className="ml-1 text-gray-500 hover:text-black">✕</button>
      )}
    </span>
  );
}

function Brick({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-9 px-3 rounded-full border border-gray-200 hover:border-gray-300 hover:bg-gray-50
                 text-[13px] leading-none flex items-center justify-between whitespace-nowrap"
    >
      <span className="truncate">{label}</span>
      <span aria-hidden className="ml-2 text-gray-400">›</span>
    </button>
  );
}


function GhostToken({ children, onRemove, title }: { children: React.ReactNode; onRemove: () => void; title?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[13px] text-gray-400 shrink-0" title={typeof children === 'string' ? (children as string) : title}>
      <span className="truncate max-w-[220px]">{children}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Удалить"
        className={[
          "ml-0.5 w-4 h-4 grid place-items-center text-[10px] leading-none",
          "text-gray-300 hover:text-gray-600 rounded hover:bg-gray-100/60",
          "focus:outline-none focus:ring-1 focus:ring-gray-200",
        ].join(" ")}
      >
        ✕
      </button>
    </span>
  );
}





/* ---------- Sortable photo ---------- */
function SortablePhoto({
  id, index, croppedFile, originalFile, url, onClick, onRemove, aspectSlot, readOnly = false,
}: {
  id: string; index: number;
  croppedFile?: File; originalFile?: File; url?: string;
  onClick: () => void; onRemove: () => void; aspectSlot: number;
  readOnly?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id });
  const styleDnD = { transform: isDragging ? CSS.Transform.toString(transform) : undefined, zIndex: isDragging ? 50 : 'auto' };

  const previewUrl = useMemo(() => {
    try {
      if (croppedFile) return URL.createObjectURL(croppedFile);
      if (originalFile) return URL.createObjectURL(originalFile);
      return url || '';
    } catch { return url || ''; }
  }, [croppedFile, originalFile, url]);

  useEffect(() => () => { try { if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl); } catch { } }, [previewUrl]);

  const widthPx = Math.round(PREVIEW_H * aspectSlot);

  return (
    <div
      ref={setNodeRef}
      style={{ ...styleDnD, width: `${widthPx}px`, height: `${PREVIEW_H}px` }}
      className={`relative flex items-center justify-center bg-gray-100 rounded-lg overflow-hidden ${isDragging ? 'scale-105 z-50' : ''}`}
      data-preview-tile="post"
      onClick={() => { if (!readOnly) onClick(); }}
    >
      <div {...attributes} {...listeners} className="w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing">
        {/* blob: превью — используем img, Next/Image не поддерживает blob URLs */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt={`Фото ${index + 1}`}
          className="w-full h-full object-cover"
          onLoad={(e) => {
            try {
              const img = e.currentTarget;
              const iw = img.naturalWidth;
              const ih = img.naturalHeight;
              const rect = img.getBoundingClientRect();
              console.info('[CreatePostModal][preview]', {
                index,
                aspectSlot,
                iw,
                ih,
                ia: ih ? +(iw / ih).toFixed(4) : null,
                cw: Math.round(rect.width),
                ch: Math.round(rect.height),
                hasCropped: !!croppedFile,
                hasOriginal: !!originalFile,
                url: previewUrl ? previewUrl.slice(0, 80) : null,
              });
            } catch { /* noop */ }
          }}
        />
      </div>
      {index === 0 && (
        <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded">Заглавное</span>
      )}
      {!readOnly && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute top-1 right-1 z-10 w-6 h-6 rounded-full bg-black/60 text-white text-xs font-bold flex items-center justify-center"
        >
          ✕
        </button>
      )}
    </div>
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
  const [isFocused, setIsFocused] = React.useState(false);
  const [overlayH, setOverlayH] = React.useState<number | null>(null);

  const collapsedRef = React.useRef<HTMLDivElement>(null);
  const taRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => onFocusChange?.(isFocused), [isFocused, onFocusChange]);
  React.useEffect(() => { if (collapseSignal) setIsFocused(false); }, [collapseSignal]);

  // прокручиваем контейнер к началу и фокусим textarea
  React.useEffect(() => {
    if (!isFocused || !overlayRoot) return;
    requestAnimationFrame(() => {
      overlayRoot.scrollTo({ top: 0, behavior: 'smooth' });
      taRef.current?.focus();
    });
  }, [isFocused, overlayRoot]);

  // считаем высоту: от top overlayRoot до bottom свернутого блока
  React.useLayoutEffect(() => {
    if (!isFocused || !overlayRoot || !collapsedRef.current) return;

    const compute = () => {
      const rootRect = overlayRoot.getBoundingClientRect();
      const boxRect = collapsedRef.current!.getBoundingClientRect();
      const h = Math.max(160, Math.round(boxRect.bottom - rootRect.top));
      setOverlayH(h);
    };

    compute();

    const ro1 = new ResizeObserver(compute);
    const ro2 = new ResizeObserver(compute);
    ro1.observe(overlayRoot);
    ro2.observe(collapsedRef.current);

    window.addEventListener('resize', compute);
    overlayRoot.addEventListener('scroll', compute, { passive: true });

    return () => {
      ro1.disconnect(); ro2.disconnect();
      window.removeEventListener('resize', compute);
      overlayRoot.removeEventListener('scroll', compute);
    };
  }, [isFocused, overlayRoot]);

  // свернутое состояние
  const collapsed = (
    <div
      ref={collapsedRef}
      onClick={() => setIsFocused(true)}
      className="w-full min-w-0 min-h-[60px] max-h-[60px] overflow-y-auto text-sm text-black border-b border-gray-150 px-1 py-0 cursor-text whitespace-pre-wrap"
    >
      {value ? value : (
        <span className="text-gray-400 block mt-[16px]">
          {placeholder} (можно упоминать @username)
        </span>
      )}
    </div>
  );

  // оверлей поверх галереи с динамической высотой
  const overlayVars: CSSVars = { '--overlay-h': `${overlayH ?? 0}px` };
  const expandedOverlay = (overlayRoot && isFocused)
    ? createPortal(
      <div className="absolute inset-x-0 top-0 z-[900] px-1 pt-2 pb-4 pointer-events-auto" style={overlayVars}>
        <div className="relative bg-white rounded-xl shadow-xl border border-gray-150" style={{ height: 'var(--overlay-h)' }}>
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`${placeholder} (можно упоминать @username)`}
            className="w-full h-full box-border bg-transparent focus:outline-none px-2 py-2 resize-none text-sm rounded-xl"
            onKeyDown={(e) => { if (e.key === 'Escape') setIsFocused(false); }}
          />
          <button
            type="button"
            onClick={() => setIsFocused(false)}
            className="absolute bottom-2 right-[15px] bg-green-600 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center"
            aria-label="Готово"
            title="Готово"
          >
            ✓
          </button>
        </div>

        {/* клики ниже карточки — закрывают */}
        <button
          type="button"
          onClick={() => setIsFocused(false)}
          className="absolute inset-x-0 bottom-0"
          style={{ top: 'calc(8px + var(--overlay-h))' }}
          aria-hidden
        />
      </div>,
      overlayRoot
    )
    : null;

  return (
    <>
      {collapsed}
      {expandedOverlay}
    </>
  );
}




/* ---------- main modal ---------- */
export default function CreatePostModal({
  open, onClose, mode = 'create', initial, onSaved, prefillCamp,
}: CreatePostModalProps) {


  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<'idle' | 'upload' | 'create'>('idle');
  const [submitProgress, setSubmitProgress] = useState(0);
  const [submitFiles, setSubmitFiles] = useState<{ fileIndex: number; fileCount: number } | null>(null);
  const isEdit = mode === 'edit';

  const [activities, setActivities] = useState<Activity[]>([]);
  const [hashtags, setHashtags] = useState<Hashtag[]>([]);
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
  const [selectedHashtags, setSelectedHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState('');

  const [description, setDescription] = useState('');
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [activeCropFile, setActiveCropFile] = useState<File | null>(null);
  const [activeCropIndex, setActiveCropIndex] = useState<number | null>(null);
  const [activeCropAspect, setActiveCropAspect] = useState<number | null>(null);
  const [activeCropAspectActual, setActiveCropAspectActual] = useState<number | null>(null);

  // кэмп / люди / локация
  //const [clubUsername, setClubUsername] = useState('');
  //const [campOptions, setCampOptions]   = useState<CampItem[]>([]);
  const [selectedCamp, setSelectedCamp] = useState<CampItem | null>(null);
  const [taggedProfiles, setTaggedProfiles] = useState<ProfileMini[]>([]);
  const [location, setLocation] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  // picker modals
  const [tagsOpen, setTagsOpen] = useState(false);
  const [campOpen, setCampOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  //const [locationOpen, setLocationOpen] = useState(false);

  const [locationOverlayOpen, setLocationOverlayOpen] = useState(false);
  const [postLocation, setPostLocation] = useState<{
    address: string; latitude: number; longitude: number; place_id: string;
  } | null>(null);

  const resolveApiBase = () => {
    return getBrowserApiBase().replace(/\/+$/, '');
  };

  useEffect(() => {
    if (!open || isEdit) return;
    if (prefillCamp) setSelectedCamp(normalizeCamp(prefillCamp)); // ← было setSelectedCamp(prefillCamp)
  }, [open, isEdit, prefillCamp]);

  useEffect(() => {
    let cancelled = false;
    if (!activeCropFile) return;
    (async () => {
      const meta = await getImageMeta(activeCropFile);
      if (cancelled) return;
      setActiveCropAspectActual(meta?.a ?? null);
      try {
        console.info('[CreatePostModal][crop-open]', {
          index: activeCropIndex,
          aspectSlot: activeCropAspect,
          iw: meta?.w ?? null,
          ih: meta?.h ?? null,
          ia: meta?.a ? +meta.a.toFixed(4) : null,
          aspectUsed: meta?.a ?? activeCropAspect ?? null,
        });
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [activeCropFile, activeCropIndex, activeCropAspect]);


  const prevTagsOpen = React.useRef(false);
  useEffect(() => {
    if (prevTagsOpen.current && !tagsOpen) {
      if (hashtagInput.trim() && selectedHashtags.length === 0) {
        setError('Выбирай хэштеги только из списка');  // 👈 сообщение
      }
      setHashtagInput('');                               // 👈 «ручной» ввод не сохраняем
    }
    prevTagsOpen.current = tagsOpen;
  }, [tagsOpen, hashtagInput, selectedHashtags]);


  const contentRef = useRef<HTMLDivElement | null>(null);
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);
  const [dialogPortalEl, setDialogPortalEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) { setDialogPortalEl(null); return; }
    setDialogPortalEl(contentEl ?? null);
    // 🧪 лог: куда монтируем оверлей
    console.log('[CPM] open=', open, 'portalEl=', contentEl);
  }, [open, contentEl]);

  useEffect(() => {
    // 🧪 лог: есть ли предки с inert / aria-hidden
    if (dialogPortalEl) {
      const bad = dialogPortalEl.closest('[inert], [aria-hidden="true"]');
      console.log('[CPM] portal ancestor inert/aria-hidden =>', !!bad, bad);
    }
    console.log('[CPM] tagsOpen=', tagsOpen);
  }, [dialogPortalEl, tagsOpen]);


  const [confirmExitOpen, setConfirmExitOpen] = useState(false);
  const requestCloseWithConfirm = () => setConfirmExitOpen(true);

  //const overlayRootRef = useRef<HTMLDivElement | null>(null);

  const closeTagsOverlay = React.useCallback(() => {
    // если в поле что-то набрано, но НИ одного тега не выбрано — не закрываем и показываем ошибку
    if (hashtagInput.trim() && selectedHashtags.length === 0) {
      setError('Выберите хэштеги из списка');
      return; // оверлей не закрываем
    }
    // если что-то выбрано — просто игнорим набранный хвост
    if (hashtagInput) setHashtagInput(''); // 👈 очищаем «хвост»
    setError(''); // (опционально) убрать прошлую ошибку
    setTagsOpen(false);
  }, [hashtagInput, selectedHashtags]);


  // ── перед return, внутри CreatePostModal ─────────────────────────
  //const [campTitleMultiline, setCampTitleMultiline] = useState(false);
  //const campTitleRef = useRef<HTMLSpanElement | null>(null);
  //const compactRowRef = useRef<HTMLDivElement | null>(null);

  // useEffect(() => {
  //     if (!selectedCamp) { setCampTitleMultiline(false); return; }
  //
  //     const el = campTitleRef.current;
  //     if (!el) return;
  //
  //     const calc = () => {
  //         if (!campTitleMultiline) {
  //             // Компактный режим: ловим обрезание текста (truncate)
  //             const overflow = el.scrollWidth > el.clientWidth;
  //             if (overflow) setCampTitleMultiline(true);
  //         } else {
  //             // Многострочный режим: если ужалось в 1 строку — вернём компактный
  //             const cs = window.getComputedStyle(el);
  //             const lh = parseFloat(cs.lineHeight || '16') || 16;
  //             const lines = Math.round(el.scrollHeight / lh);
  //             if (lines <= 1) setCampTitleMultiline(false);
  //         }
  //     };
  //
  //     calc();
  //     const ro = new ResizeObserver(calc);
  //     ro.observe(el);
  //     window.addEventListener('resize', calc);
  //     return () => { ro.disconnect(); window.removeEventListener('resize', calc); };
  // }, [selectedCamp, open, campTitleMultiline]);




  // crop url
  const cropSrc = useMemo(() => (activeCropFile ? URL.createObjectURL(activeCropFile) : ''), [activeCropFile]);
  useEffect(() => () => { if (cropSrc) URL.revokeObjectURL(cropSrc); }, [cropSrc]);

  useEffect(() => {
    if (!open) return;
    setCsrfToken(getCookie('csrftoken'));
    const apiBase = resolveApiBase();
    try { console.info('[CreatePostModal] API_BASE =', apiBase); } catch {}
    let cancelled = false;

    const pickArray = (payload: unknown): unknown[] => {
      if (Array.isArray(payload)) return payload;
      if (payload && typeof payload === 'object') {
        const source = payload as Record<string, unknown>;
        for (const key of ['results', 'items', 'data']) {
          const candidate = source[key];
          if (Array.isArray(candidate)) return candidate;
        }
      }
      return [];
    };

    const loadList = async <T,>(path: string, setter: React.Dispatch<React.SetStateAction<T[]>>, label: string) => {
      try {
        const resp = await fetch(`${apiBase}${path}`, {
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const contentType = resp.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          const preview = await resp.text();
          throw new Error(`Unexpected response (${contentType || 'unknown'}): ${preview.slice(0, 120)}`);
        }
        const payload = (await resp.json()) as unknown;
        if (cancelled) return;
        setter(pickArray(payload) as T[]);
      } catch (err) {
        if (!cancelled) console.error(`Failed to load ${label}`, err);
      }
    };

    loadList<Activity>('/api/activities/', setActivities, 'activities');
    loadList<Hashtag>('/api/hashtags/', setHashtags, 'hashtags');

    return () => {
      cancelled = true;
    };
  }, [open]);


  const overlayOpen = tagsOpen || campOpen || peopleOpen || locationOverlayOpen || !!activeCropFile;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // gallery helpers
  async function filesToGalleryItems(files: File[]): Promise<GalleryItem[]> {
    const downsized = await Promise.all(files.map((f) => downscaleImage(f)));
    const metas = await Promise.all(downsized.map(getImageMeta));
    return downsized.map((file, idx) => {
      const m = metas[idx];
      const slot = chooseAspectSlot(m?.a ?? 1);
      return { id: file.name + '-' + file.lastModified, originalFile: file, url: URL.createObjectURL(file), aspectSlot: slot };
    });
  }
  const handleAddFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList || []);
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
  };

  // submit
  // submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    DBG('submit start', { isEdit, canPublish: !!(description.trim() || gallery.length), descLen: description.trim().length, gal: gallery.length });

    G('submit:snapshot(before validate)', {
      isEdit,
      textPreview: description.trim().slice(0, 80),
      selectedCamp,
      activitiesSelected: selectedActivities,
      hashtagsSelected: selectedHashtags,
      taggedProfiles: taggedProfiles.map(p => p.id),
      location: { location, latitude, longitude },
      gallery: gallery.map((g, i) => ({ i, id: g.id, hasFile: !!(g.croppedFile || g.originalFile), url: g.url?.slice(0, 120), aspectSlot: g.aspectSlot })),
    });

    if (!description.trim() && gallery.length === 0) {
      setError('Добавьте текст или хотя бы одно фото');
      return;
    }

    const validActivityIds = new Set(activities.map(a => String(a.id)));
    const invalidActs = selectedActivities.some(id => !validActivityIds.has(id));
    if (invalidActs) {
      setError('Выбирай активности только из списка');
      return;
    }

    const validHashtagIds = new Set(hashtags.map(h => String(h.id)));
    const hasManualOnly = hashtagInput.trim().length > 0 && selectedHashtags.length === 0;
    const hasInvalid = selectedHashtags.some(id => !validHashtagIds.has(id));
    if (hasManualOnly || hasInvalid) {
      setError('Выбирай хэштеги только из списка');
      return;
    }

    setIsSubmitting(true);
    setSubmitStage('create');
    setSubmitProgress(0);
    setSubmitFiles(null);
    try {
      const fd = new FormData();
      fd.set('text', description.trim());
      const locName = (location || '').trim();
      const latRaw = (latitude || '').trim();
      const lonRaw = (longitude || '').trim();
      const norm = (s: string): string => {
        if (!s) return '';
        const n = Number(s.replace(',', '.'));
        return Number.isFinite(n) ? String(n) : '';
      };
      const lat = norm(latRaw);
      const lon = norm(lonRaw);

      if (locName) fd.set('location_name', locName);
      // Всегда отправляем координаты, если обе заданы (даже если locName пуст)
      if (lat && lon) {
        fd.set('latitude', lat);
        fd.set('longitude', lon);
      } else if (isEdit && locName) {
        // при редактировании и наличии locName — подхватить исходные, если были
        const ilat = (initial?.latitude ?? '').toString().trim();
        const ilon = (initial?.longitude ?? '').toString().trim();
        if (ilat && ilon) {
          fd.set('latitude', norm(ilat));
          fd.set('longitude', norm(ilon));
        }
      }
      if (selectedCamp) {
        fd.set('camp_id', String(selectedCamp.id));
      } else if (isEdit && initial?.camp?.id) {
        // ЯВНО просим удалить кэмп у поста (подберите формат под ваш бэкенд)
        fd.set('camp_id', '');          // вариант 1: пустая строка = снять связь
        // fd.set('remove_camp', '1');  // вариант 2: если у вас отдельный флаг
      }
      if (selectedActivities.length) fd.set('activities', JSON.stringify(selectedActivities));
      selectedHashtags.forEach(id => fd.append('hashtags', id));
      if (taggedProfiles.length) {
        fd.set('tagged_profiles', JSON.stringify(taggedProfiles.map(p => p.id)));
      }

      // фото
      if (isEdit) {
        DBG('edit: gallery length', gallery.length);
        // Только если в посте вообще есть фото — шлём порядок/обложку
        if (gallery.length > 0) {
          const orderedUrls = gallery.map(g => g.url).filter(Boolean) as string[];
          fd.set('images_order', JSON.stringify(orderedUrls));
          fd.set('cover_index', '0');
          DBG('edit: images_order/cover_index set', { orderedUrls });
        }
      } else {
        DBG('edit: no images → NOT sending images_order/cover_index');
        const files: File[] = gallery
          .slice(0, 10)
          .map(item => item.croppedFile ?? item.originalFile)
          .filter((f): f is File => !!f);

        if (files.length) {
          let preuploaded: string[] = [];
          try {
            setSubmitStage('upload');
            setSubmitProgress(0);
            setSubmitFiles(null);
            preuploaded = await uploadFilesToGcs(files, csrfToken, 'post', (info) => {
              setSubmitProgress(info.percent);
              setSubmitFiles({ fileIndex: info.fileIndex, fileCount: info.fileCount });
            });
          } catch (e) {
            DBG('direct upload failed', { error: e });
            setError(e instanceof Error ? e.message : 'Ошибка загрузки фото');
            setSubmitStage('idle');
            setSubmitProgress(0);
            setSubmitFiles(null);
            setIsSubmitting(false);
            return;
          }
          fd.set('preuploaded_images', JSON.stringify(preuploaded));
        }
      }

      setSubmitStage('create');
      const API_BASE = resolveApiBase();
      const endpoint = isEdit
        ? `${API_BASE}/api/posts/${initial!.postId}/update/`
        : `${API_BASE}/api/create-post/`;

      const method = 'POST';

      G('request:formdata', dumpFD(fd));
      G('request:meta', { endpoint, method });

      const res = await fetch(endpoint, {
        method,
        headers: { 'X-CSRFToken': csrfToken || '' },
        credentials: 'include',
        body: fd,
      });

      try {
        G('response:meta', {
          ok: res.ok,
          status: res.status,
          statusText: res.statusText,
          headers: Object.fromEntries(res.headers.entries()),
        });
      } catch { }

      // безопасно читаем JSON только если он действительно JSON
      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await res.json().catch(() => null) : null;
      if (!data && ct && !ct.includes('application/json')) {
        try {
          const txt = await res.clone().text();
          G('response:text(non-json)', txt.slice(0, 500));
        } catch { }
      }

      DBG('response json', data);

      const succeed = (updated?: unknown) => {
        // что пришло с сервера (если вообще пришло)
        let srv: Record<string, unknown> = {};
        if (updated && typeof updated === 'object') {
          const u = updated as Record<string, unknown>;
          srv = (u.post && typeof u.post === 'object') ? (u.post as Record<string, unknown>) : u;
        }

        // патч для UI по кэмпу
        const campPatch = selectedCamp
          ? {
            camp_id: selectedCamp.id,
            camp_title: selectedCamp.title,
            camp_starts_at: selectedCamp.start_date ?? null,
            camp_ends_at: selectedCamp.end_date ?? null,
            // ДОБАВЛЕНО: прокидываем владельца/ключ/slug/url, если CampPicker их даёт
            ...extractCampExtras(selectedCamp),
          }
          : {
            camp_id: null,
            camp_title: null,
            camp_slug: null,
            camp_owner_username: null,
            camp_public_key: null,
            camp_url: null,
            camp_starts_at: null,
            camp_ends_at: null,
          };


        const smartMerge = (base: Record<string, unknown>, patch: Record<string, unknown>) => {
          const out: Record<string, unknown> = { ...base };
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === null) continue;
            if (typeof v === 'string' && v.trim() === '') continue;
            out[k] = v;
          }
          return out;
        };
        const payload = smartMerge(srv, campPatch);

        G('succeed:payload(out)', {
          fromServer: srv,
          campPatch,
          final: payload,
          final_camp_url: (payload as Record<string, unknown>)?.['camp_url'],
        });

        // Если пост привязан к кэмпу — оповестим ленты отметок кэмпа
        try {
          const campId = selectedCamp?.id;
          if (typeof campId === 'number' && campId > 0) {
            emitCampMarkAdded({ campId, post: payload });
          }
        } catch {
          /* noop */
        }

        // Глобальные события для динамических лент профиля/поиска
        try {
          if (typeof window !== 'undefined') {
            if (isEdit && initial?.postId) {
              window.dispatchEvent(
                new CustomEvent('profile_post_updated', {
                  detail: { id: Number(initial.postId), post: payload },
                }),
              );
            } else {
              window.dispatchEvent(
                new CustomEvent('profile_post_created', {
                  detail: { post: payload },
                }),
              );
            }
          }
        } catch {
          /* noop */
        }
        try {
          window.dispatchEvent(new CustomEvent('cpm_saved', { detail: payload }));
        } catch { }

        onClose?.();
        setConfirmExitOpen(false);
        Promise.resolve().then(() => {
          try { onSaved?.(payload); } finally { G('onSaved:called'); }
        });
      };

      const fail = (msg: string) => {
        DBG('fail()', { msg });
        setError(msg || (isEdit ? 'Не удалось сохранить изменения' : 'Ошибка публикации поста'));
      };

      if (res.ok || res.status === 204) {
        succeed(data);
      } else {
        // Раньше фоллбэк делался только для 5xx; расширим логику:
        if (isEdit && initial?.postId) {
          DBG('request →', { endpoint, method, body: dumpFD(fd) });
          try {
            const verify = await fetch(
              `${API_BASE}/api/posts/${initial.postId}/`,
              { credentials: 'include', cache: 'no-store' }
            );
            DBG('response status', res.status, res.statusText, 'CT=', res.headers.get('content-type'));

            type PostVerify = { text?: string | null };
            const postNow = (verify.ok ? await verify.json().catch(() => null) : null) as PostVerify | null;

            const looksUpdated = !!postNow && (postNow.text ?? '') === description.trim();
            if (looksUpdated) {
              succeed(postNow);
              return;
            }
          } catch { /* ignore */ }
        }
        DBG('non-OK → try verify GET', { isEdit, postId: initial?.postId });
        fail(data?.error || `Ошибка сохранения (${res.status})`);
      }

    } catch {
      setError(isEdit ? 'Не удалось сохранить изменения' : 'Ошибка публикации поста');
    } finally {
      setIsSubmitting(false);
      setSubmitStage('idle');
      setSubmitProgress(0);
      setSubmitFiles(null);
      DBG('submit end');
    }
  };




  // размеры окна кропера — как в модалке кэмпа
  const cropModalClass = useMemo(() => {
    const base = [
      'max-w-none', 'p-6', 'overflow-visible', 'max-h-[92vh] overflow-y-auto',
      '[&>div:first-of-type]:relative', '[&>div:first-of-type]:rounded-2xl',
      '[&>div:first-of-type]:overflow-hidden',
    ].join(' ');
    const isVertical = (activeCropAspect ?? 1) < 0.95;
    return isVertical
      ? [base, 'w-auto', '[&>div:first-of-type]:w-auto', '[&>div:first-of-type]:h-[560px]'].join(' ')
      : [base, 'w-[560px]'].join(' ');
  }, [activeCropAspect]);
  const overlayRootRef = useRef<HTMLDivElement | null>(null);


  //const overlayPortalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    if (overlayOpen) {
      // аккуратно выбиваем фокус из базовой модалки
      const ae = document.activeElement as HTMLElement | null;
      if (ae && el.contains(ae)) ae.blur();

      el.setAttribute('inert', '');
      el.setAttribute('aria-hidden', 'true');
    } else {
      el.removeAttribute('inert');
      el.removeAttribute('aria-hidden');
    }
  }, [overlayOpen]);


  const revokeGalleryURLs = (items: GalleryItem[]) => {
    items.forEach(it => { try { if (it.url) URL.revokeObjectURL(it.url); } catch { } });
  };

  const resetAll = React.useCallback(() => {
    setError('');
    setIsSubmitting(false);

    // базовые поля
    setDescription('');
    setSelectedActivities([]);
    setSelectedHashtags([]);
    setHashtagInput('');

    // кэмп/люди/локация
    //setClubUsername('');
    //setCampOptions([]);
    setSelectedCamp(null);
    setTaggedProfiles([]);
    setLocation(''); setLatitude(''); setLongitude('');
    setPostLocation(null);

    // оверлеи/вспомогательные модалки
    setTagsOpen(false); setCampOpen(false); setPeopleOpen(false); setLocationOverlayOpen(false);

    // галерея + objectURL
    setActiveCropFile(null); setActiveCropIndex(null); setActiveCropAspect(null);
    setGallery(prev => { revokeGalleryURLs(prev); return []; });
  }, []);

  // Для режима создания хотим всегда открывать модалку "с нуля":
  // если её закрыли (успешно опубликовав пост или отменив),
  // при следующем открытии не должно оставаться прошлое описание/галерея/тэги.
  // Префилл кэмпа из prefillCamp не ломаем: он проставится отдельным эффектом выше.
  useEffect(() => {
    if (!open && !isEdit) {
      resetAll();
    }
  }, [open, isEdit, resetAll]);


  const dateCellRef = useRef<HTMLSpanElement | null>(null);
  const [leftColPx, setLeftColPx] = useState<number | null>(null);

  useEffect(() => {
    const el = dateCellRef.current;
    if (!el) { setLeftColPx(null); return; }

    const update = () => setLeftColPx(el.offsetWidth);
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, [selectedCamp, open]);


  const [textExpanded, setTextExpanded] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);


  const canPublish = React.useMemo(
    () => description.trim().length > 0 || gallery.length > 0,
    [description, gallery.length]
  );

  // опционально: если пользователь добавил текст/фото после ошибки — убираем ошибку
  useEffect(() => {
    if (error && canPublish) setError('');
  }, [canPublish, error]);

  useEffect(() => {
    if (!open || !isEdit || !initial) return;

    // текст
    setDescription(initial.text || '');

    // кэмп
    setSelectedCamp(initial.camp ? normalizeCamp(initial.camp) : null);

    // люди
    setTaggedProfiles(initial.taggedProfiles ?? []);

    // локация
    setLocation(initial.location_name || '');
    setLatitude(initial.latitude || '');
    setLongitude(initial.longitude || '');

    // активности/теги — ожидаем id-строки
    setSelectedActivities(initial.activityIds ?? []);
    setSelectedHashtags(initial.hashtagIds ?? []);
    setHashtagInput('');

    // галерея из готовых URL (только порядок, без удаления/кропа)
    const items: GalleryItem[] =
      (initial.images || []).slice(0, 10).map((u, i) => ({
        id: `existing-${i}`,
        originalFile: undefined,
        url: u,
        aspectSlot: ASPECT_SQ, // можно улучшить, но для сортируемых превью ок
      }));
    setGallery(items);
  }, [open, isEdit, initial]);

  useEffect(() => {
    if (!open || !isEdit || !initial) return;

    setDescription(initial.text || '');
    setSelectedCamp(initial.camp ? normalizeCamp(initial.camp) : null);
    setTaggedProfiles(initial.taggedProfiles ?? []);
    setLocation(initial.location_name || '');
    setLatitude(initial.latitude || '');
    setLongitude(initial.longitude || '');
    setSelectedActivities(initial.activityIds ?? []);
    setSelectedHashtags(initial.hashtagIds ?? []);
    setHashtagInput('');

    const items: GalleryItem[] = (initial.images || []).slice(0, 10).map((u, i) => ({
      id: `existing-${i}`, url: u, aspectSlot: ASPECT_SQ,
    }));
    setGallery(items);
  }, [open, isEdit, initial?.postId]); // 👈 завязываемся ТОЛЬКО на id поста

  useEffect(() => { DBG('mounted', { isEdit, postId: initial?.postId }); return () => DBG('unmounted'); }, []);

  const modeLabel = isEdit ? 'редактирования' : 'создания поста';

  useEffect(() => {
    if (!open) return;
    if (typeof window === 'undefined') return;
    if (window.innerWidth < 768) return;
    const el = contentEl;
    if (!el) return;

    const logLayout = (reason: string) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const offsetParent = el.offsetParent as HTMLElement | null;
      const offsetParentRect = offsetParent?.getBoundingClientRect();
      const getChain = () => {
        const chain: Array<Record<string, string>> = [];
        let node: HTMLElement | null = el.parentElement;
        let safety = 0;
        while (node && safety < 8) {
          const cs = window.getComputedStyle(node);
          chain.push({
            tag: node.tagName.toLowerCase(),
            id: node.id || '',
            className: node.className || '',
            position: cs.position,
            transform: cs.transform,
            top: cs.top,
            left: cs.left,
          });
          node = node.parentElement;
          safety += 1;
        }
        return chain;
      };
      try {
        // eslint-disable-next-line no-console
        console.info('[CreatePostModal][layout]', {
          reason,
          rect: {
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          style: {
            position: style.position,
            top: style.top,
            left: style.left,
            transform: style.transform,
            marginTop: style.marginTop,
            marginBottom: style.marginBottom,
          },
          viewport: {
            innerW: window.innerWidth,
            innerH: window.innerHeight,
            clientW: document.documentElement.clientWidth,
            clientH: document.documentElement.clientHeight,
          },
        });
        // eslint-disable-next-line no-console
        console.info('[CreatePostModal][layout-json]', JSON.stringify({
          reason,
          rect: {
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          style: {
            position: style.position,
            top: style.top,
            left: style.left,
            transform: style.transform,
            marginTop: style.marginTop,
            marginBottom: style.marginBottom,
          },
          offsetParent: offsetParent
            ? {
                tag: offsetParent.tagName.toLowerCase(),
                className: offsetParent.className || '',
                rect: offsetParentRect
                  ? {
                      top: Math.round(offsetParentRect.top),
                      left: Math.round(offsetParentRect.left),
                      width: Math.round(offsetParentRect.width),
                      height: Math.round(offsetParentRect.height),
                    }
                  : null,
              }
            : null,
          ancestors: getChain(),
          viewport: {
            innerW: window.innerWidth,
            innerH: window.innerHeight,
            clientW: document.documentElement.clientWidth,
            clientH: document.documentElement.clientHeight,
          },
        }));
      } catch { /* noop */ }
    };

    const onResize = () => logLayout('resize');
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => logLayout('raf2'));
      return () => cancelAnimationFrame(raf2);
    });
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf1);
      window.removeEventListener('resize', onResize);
    };
  }, [open, contentEl]);


  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          // клик по крестику или программное закрытие
          if (!next) {
            // если открыт внутренний оверлей или кроппер – базовую модалку не закрываем
            if (overlayOpen || activeCropFile) return;
            // иначе показываем подтверждение выхода
            requestCloseWithConfirm();
          }
        }}
      >


        <style jsx global>{`
                    /* когда открыт overlay — глушим ring/outline у базовой модалки */
                    [data-overlay-open="true"],
                    [data-overlay-open="true"] *:focus,
                    [data-overlay-open="true"] *:focus-visible {
                        outline: none !important;
                        box-shadow: none !important;
                    }

                    /* Скрыть горизонтальный скроллбар, но оставить скролл жестами */
                    .no-scrollbar {
                        -ms-overflow-style: none;  /* IE/Edge legacy */
                        scrollbar-width: none;     /* Firefox */
                    }
                    .no-scrollbar::-webkit-scrollbar { /* Chrome/Safari/Edge Chromium */
                        display: none;
                    }
                    .camp-title{
                        display:-webkit-box;
                        -webkit-box-orient:vertical;
                        -webkit-line-clamp:3; /* максимум 3 строки */
                        overflow:hidden;
                        word-break:break-word;
                        overflow-wrap:anywhere;
                    }
                `}</style>

        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-[52000] bg-black/40" />

          <DialogContent
            ref={(node) => {
              contentRef.current = node;
              setContentEl(node);
            }}
            data-overlay-open={overlayOpen ? 'true' : 'false'}
            className={[
              "z-[52010] w-full max-w-2xl min-w-0 bg-white overflow-x-hidden overflow-y-visible",
              "outline-none ring-0 focus:outline-none focus:ring-0",
              "focus-visible:outline-none focus-visible:ring-0",
              // "transition-transform duration-200",  
              // textExpanded ? "-translate-y-2 md:-translate-y-3" : ""
            ].join(" ")}
            style={{ maxHeight: '90vh', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
            aria-describedby="cpm-desc"
            onInteractOutside={(e) => {
              // если открыт внутренний оверлей (теги) или кроппер — базовую модалку не закрываем
              if (overlayOpen || activeCropFile) {
                e.preventDefault();
                return;
              }
              // иначе спрашиваем подтверждение
              e.preventDefault();
              requestCloseWithConfirm();
            }}
            onEscapeKeyDown={(e) => {
              if (overlayOpen || activeCropFile) {
                e.preventDefault();
                return;
              }
              e.preventDefault();
              requestCloseWithConfirm();
            }}
          >


            <DialogTitle className="sr-only">Создание поста</DialogTitle>
            <DialogDescription id="cpm-desc" className="sr-only">
              Форма создания поста
            </DialogDescription>
            {error && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-red-100 border border-red-300 text-red-800 rounded-md text-sm shadow-md max-w-[90%] text-center">
                {error}
              </div>
            )}
            {isSubmitting && (
              <div className="fixed inset-0 z-[52020] flex flex-col items-center justify-center gap-3 bg-white/80">
                <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-400 border-t-transparent" />
                <div className="text-sm text-gray-700">
                  {submitStage === 'upload'
                    ? `Загружаем фото ${submitProgress}%${submitFiles ? ` (${submitFiles.fileIndex}/${submitFiles.fileCount})` : ''}`
                    : (isEdit ? 'Сохраняем пост...' : 'Создаем пост...')}
                </div>
              </div>
            )}


            <div className={["transition-transform duration-200", textExpanded ? "-translate-y-2 md:-translate-y-3" : ""].join(" ")}>
              <div
                ref={scrollRef}
                className="max-h-[80vh] overflow-y-auto overflow-x-hidden px-1 relative min-w-0"
                style={{ contain: 'inline-size', isolation: 'isolate' }}
              >
                <form
                  onSubmit={handleSubmit}
                  autoComplete="off"
                  // подсказка менеджерам паролей не трогать
                  data-lpignore="true"
                  data-form-type="other"
                  className="flex flex-col min-w-0 gap-y-4 px-1 mt-2.5 text-sm [&>*]:min-w-0"
                >

                  {/* ГАЛЕРЕЯ */}
                  <div className="min-w-0">
                    <p className="text-[13px] text-gray-600 text-center mb-2">{gallery.length}/10 фото выбрано</p>

                    {!isEdit && gallery.length === 0 && (
                      <label
                        htmlFor="post-photos"
                        className="cursor-pointer w-full flex items-center justify-center border-2 border-dashed border-gray-300 rounded-xl py-8 text-gray-400 hover:text-black hover:border-gray-400 transition flex-col gap-1"
                      >
                        <div className="text-4xl leading-none">+</div>
                        <div className="text-sm">Добавь фото (до 10)</div>
                        <input id="post-photos" type="file" accept="image/*" multiple hidden
                          onChange={(e) => handleAddFiles(e.currentTarget.files)} />
                      </label>
                    )}

                    <DndContext sensors={sensors} collisionDetection={closestCenter}
                      onDragOver={({ active, over }) => {
                        if (!over || active.id === over.id) return;
                        const oldIndex = gallery.findIndex(i => i.id === active.id);
                        const newIndex = gallery.findIndex(i => i.id === over.id);
                        if (oldIndex !== newIndex) setGallery(items => arrayMove(items, oldIndex, newIndex));
                      }}
                    >
                      <SortableContext items={gallery.map(i => i.id)} strategy={horizontalListSortingStrategy}>
                        <div
                          className="relative mt-1 pb-0 overflow-x-auto w-full min-w-0"
                          style={{ contain: 'inline-size' }}
                        >
                          <div className="flex gap-3 items-center w-max">
                            {!isEdit && gallery.length > 0 && gallery.length < 10 && (
                              <div className="flex items-center">
                                <label
                                  htmlFor="post-photos-inline"
                                  className="cursor-pointer flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg text-gray-400 hover:text-black hover:border-gray-400 transition text-2xl"
                                  style={{
                                    width: `${Math.round(PREVIEW_H * ASPECT_SQ * PLUS_TILE_SCALE)}px`,
                                    height: `${Math.round(PREVIEW_H * PLUS_TILE_SCALE)}px`,
                                  }}
                                >
                                  +
                                  <input id="post-photos-inline" type="file" accept="image/*" multiple hidden
                                    onChange={(e) => handleAddFiles(e.currentTarget.files)} />
                                </label>
                              </div>
                            )}

                            {gallery.map(({ id, croppedFile, originalFile, aspectSlot, url }, index) => (
                              <SortablePhoto
                                key={id}
                                id={id}
                                index={index}
                                croppedFile={croppedFile}
                                originalFile={originalFile}
                                url={url}
                                aspectSlot={aspectSlot}
                                readOnly={isEdit} // в редактировании нельзя удалять и кропить
                                onClick={() => {
                                  if (isEdit) return; // запретить кроп при редактировании
                                  setActiveCropFile(originalFile!);
                                  setActiveCropIndex(index);
                                  setActiveCropAspect(aspectSlot);
                                }}
                                onRemove={() => setGallery(prev => prev.filter((_, i) => i !== index))}
                              />
                            ))}

                          </div>
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>

                  {/* ТЕКСТ */}
                  <ExpandingTextareaForPost
                    value={description}
                    onChange={setDescription}
                    placeholder="Текст поста"
                    overlayRoot={scrollRef.current}
                    onFocusChange={setTextExpanded}
                  />

                  {/* КИРПИЧИ-КНОПКИ */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Brick label="Локация" onClick={() => setLocationOverlayOpen(true)} />
                    <Brick label="Отметить кэмп" onClick={() => setCampOpen(true)} />
                    <Brick label="Отметить людей" onClick={() => setPeopleOpen(true)} />
                    <Brick label="Хэштеги" onClick={() => setTagsOpen(true)} />
                  </div>

                  {/* ВЫБРАННОЕ: чипсы с горизонтальным скроллом */}

                  {/* локация — как дата в кэмпе (серая, однострочная, крестик справа) */}
                  {location && (
                    <div className="pl-2 pr-2">
                      <div
                        className="grid items-center gap-x-8 py-1"
                        style={{ gridTemplateColumns: leftColPx ? `${leftColPx}px 1fr` : 'auto 1fr' }}
                      >
                        <span className="text-[13px] text-gray-500">Где?</span>

                        <div className="min-w-0 inline-flex items-center gap-3">
                          <span className="text-xs text-gray-500 truncate">{location}</span>
                          <button
                            type="button"
                            aria-label="Убрать локацию"
                            onClick={() => { setLocation(''); setLatitude(''); setLongitude(''); setPostLocation(null); }}
                            className={[
                              "w-5 h-5 grid place-items-center text-[10px] leading-none",
                              "text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100/60",
                              "focus:outline-none focus:ring-1 focus:ring-gray-200",
                            ].join(" ")}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  )}




                  {/* кэмп (один) */}
                  {selectedCamp && (
                    <div className="overflow-hidden">
                      <div
                        className="grid items-baseline gap-8 pl-2 pr-2 py-1"
                        style={{ gridTemplateColumns: leftColPx ? `${leftColPx}px 1fr` : 'auto 1fr' }}
                      >
                        {/* слева — дата */}
                        {selectedCamp.start_date && (
                          <span ref={dateCellRef} className="text-xs text-gray-500 whitespace-nowrap">
                            {selectedCamp.end_date
                              ? `${dd(selectedCamp.start_date)} - ${dd(selectedCamp.end_date)}`
                              : dd(selectedCamp.start_date)}
                          </span>
                        )}

                        {/* справа — название + крестик */}
                        {/* справа — название + ссылка + крестик */}
                        <div className="min-w-0 flex items-start gap-3 text-left">
                          <div className="min-w-0 flex flex-col gap-1">
                            <span className="camp-title font-medium text-gray-800 inline-block max-w-full">
                              {selectedCamp.title}
                            </span>

                            {selectedCamp.camp_url && (
                              <a
                                href={selectedCamp.camp_url}
                                className="text-xs text-blue-600 hover:underline break-all"
                                target="_blank" rel="noopener"
                              >
                                {selectedCamp.camp_url}
                              </a>
                            )}
                          </div>

                          <button
                            type="button"
                            aria-label="Убрать кэмп"
                            onClick={() => setSelectedCamp(null)}
                            className={[
                              "w-5 h-5 grid place-items-center text-[10px] leading-none",
                              "text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100/60",
                              "focus:outline-none focus:ring-1 focus:ring-gray-200",
                            ].join(" ")}
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
                        className="grid items-center gap-x-8 py-1"
                        style={{ gridTemplateColumns: leftColPx ? `${leftColPx}px 1fr` : 'auto 1fr' }}
                      >
                        <span className="text-[13px] text-gray-500">С кем?</span>

                        <div className="min-w-0 overflow-x-auto no-scrollbar">
                          <div className="inline-flex items-center gap-2 whitespace-nowrap">
                            {taggedProfiles.map(p => (
                              <Pill key={p.id} avatar={p.avatar_url} onRemove={() => setTaggedProfiles(taggedProfiles.filter(x => x.id !== p.id))}>
                                @{p.username}
                              </Pill>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}




                  {/* теги/активности */}
                  {(selectedHashtags.length > 0 || selectedActivities.length > 0) && (
                    <div className="overflow-x-auto no-scrollbar pl-2 pr-2">
                      <div className="inline-flex items-center gap-3 whitespace-nowrap">
                        {selectedActivities.map(id => {
                          const a = activities.find(x => String(x.id) === id);
                          return (
                            <GhostToken
                              key={`act-${id}`}
                              onRemove={() => setSelectedActivities(selectedActivities.filter(x => x !== id))}
                              title={a?.name ?? id}
                            >
                              {a?.name ?? id}
                            </GhostToken>
                          );
                        })}
                        {selectedHashtags.map(id => {
                          const h = hashtags.find(x => String(x.id) === id);
                          return (
                            <GhostToken
                              key={`tag-${id}`}
                              onRemove={() => setSelectedHashtags(selectedHashtags.filter(x => x !== id))}
                              title={h?.name ?? id}
                            >
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
                    className={[
                      "w-full py-2 rounded-full transition",
                      !canPublish || isSubmitting
                        ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                        : "bg-black text-white hover:bg-black/80",
                    ].join(" ")}
                    aria-disabled={!canPublish || isSubmitting}
                  >
                    {isSubmitting ? (isEdit ? "Сохраняю…" : "Публикую…") : (isEdit ? "Сохранить" : "Опубликовать")}
                  </button>
                </form>
              </div>
              <div id="tags-overlay-root" ref={overlayRootRef} />
            </div>
          </DialogContent>

          {/* затемнение и кроппер */}


        </DialogPortal>
      </Dialog>

      {confirmExitOpen && (
        <Dialog open={confirmExitOpen} onOpenChange={setConfirmExitOpen}>
          <DialogPortal>
            <div className="fixed inset-0 z-[53000]">
              <DialogOverlay className="fixed inset-0 z-[53000] bg-black/40" />
              <DialogPrimitive.Content
                aria-describedby="confirm-exit-desc"
                className={[
                  "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
                  "z-[53010] max-w-sm w-full bg-white rounded-xl p-6 shadow-lg",
                  "focus:outline-none z-[5010]",
                ].join(" ")}
              >
                {/* a11y-заголовок/описание */}
                <DialogPrimitive.Title className="sr-only">
                  Подтверждение закрытия страницы {modeLabel} поста
                </DialogPrimitive.Title>
                <DialogPrimitive.Description id="confirm-exit-desc" className="sr-only">
                  Окно подтверждения закрытия страницы {modeLabel} поста.
                </DialogPrimitive.Description>

                <h3 className="text-base font-semibold mb-2">
                  Закрыть страницу {modeLabel}?
                </h3>
                <p className="text-sm text-gray-600 mb-4">Данные не сохранятся. Выйти?</p>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    className="text-sm text-gray-600 hover:text-black"
                    onClick={() => setConfirmExitOpen(false)}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="text-sm font-semibold text-red-600 hover:text-red-700"
                    onClick={() => {
                      setConfirmExitOpen(false);
                      resetAll();
                      onClose();
                    }}
                  >
                    Да, закрыть
                  </button>
                </div>
              </DialogPrimitive.Content>
            </div>
          </DialogPortal>
        </Dialog>
      )}


      {!isEdit && activeCropFile && cropSrc && typeof document !== 'undefined' &&
        createPortal(
          <>
            {/* затемнение поверх всего */}
            <div aria-hidden className="fixed inset-0 z-[54000] bg-black/40 backdrop-blur-[1px]" />
            <PhotoCropModal
              imageSrc={cropSrc}
              aspect={activeCropAspectActual ?? activeCropAspect ?? ASPECT_SQ}
              className={`${cropModalClass} z-[54010]`} // выше базовой модалки и confirm
              initialScale={activeCropIndex !== null ? gallery[activeCropIndex]?.cropMeta?.scale : undefined}
              initialPosition={activeCropIndex !== null ? gallery[activeCropIndex]?.cropMeta?.position : undefined}
              startAtCover
              onClose={() => {
                setActiveCropFile(null);
                setActiveCropIndex(null);
                setActiveCropAspect(null);
                setActiveCropAspectActual(null);
              }}
              onComplete={(croppedFile, cropMeta) => {
                if (activeCropIndex !== null) {
                  setGallery(prev => prev.map((it, i) => i === activeCropIndex ? { ...it, croppedFile, cropMeta } : it));
                }
                setActiveCropFile(null);
                setActiveCropIndex(null);
                setActiveCropAspect(null);
                setActiveCropAspectActual(null);
              }}
            />
          </>,
          document.body
        )
      }


      {/* picker modals */}
      <TagsPickerOverlay
        open={tagsOpen}
        onClose={closeTagsOverlay}
        activities={activities}
        hashtags={hashtags}
        selectedActivities={selectedActivities}
        setSelectedActivities={setSelectedActivities}
        selectedHashtags={selectedHashtags}
        setSelectedHashtags={setSelectedHashtags}
        hashtagInput={hashtagInput}
        setHashtagInput={setHashtagInput}
      //portalEl={overlayRootRef.current}
      />
      <CampPickerOverlay
        open={campOpen}
        onClose={() => setCampOpen(false)}
        onPick={(c) => {
          // Приводим CampLite+extras к нашему CampItem без any
          const mapped: CampItem = {
            id: c.id,
            title: c.title,
            start_date: c.start_date,
            end_date: c.end_date,
            camp_owner_username: c.camp_owner_username,
            camp_public_key: c.camp_public_key,
            camp_slug: c.camp_slug,
            camp_url: c.camp_url,
            // если у бекенда приходит camp_number — сохраним
            camp_number: c.camp_number,
          };
          setSelectedCamp(normalizeCamp(mapped));
        }}
      />
      <PeoplePickerOverlay
        open={peopleOpen}
        onClose={() => setPeopleOpen(false)}                  // крестик = отменить изменения
        initialSelected={taggedProfiles}                      // стартовые значения
        onDone={(list) => setTaggedProfiles(list)}            // «Готово» = сохранить
        limit={10}
      />
      <LocationPickerOverlay
        open={locationOverlayOpen}
        onClose={() => setLocationOverlayOpen(false)}
        initialSelected={postLocation}
        onDone={(loc) => {
          // сохраняем только по «Готово»
          setPostLocation(loc);
          // сразу синхронизируем поля поста
          setLocation(loc.address);
          setLatitude(String(loc.latitude));
          setLongitude(String(loc.longitude));
          // если нужно — можно убрать чип: setLocation('') и т.п.
        }}
      />
    </>
  );
}  
