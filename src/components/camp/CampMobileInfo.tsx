'use client';

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import SmartImage from '@/components/SmartImage';
import { absUrl, pickImageArray } from '@/components/camp/campNormalize';
import { ChevronLeft, Target } from 'lucide-react';
import type { Camp } from './CampInfoSwitcher';
import { parseDateYYYYMMDD, formatRuDateRange } from '@/utils/safeDate';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import CampPostCreateMobileModal from '@/components/camp/CreateCampPostMobile';
import type { CampFeedTab } from './CampFeedTabsMobile';
import { createPortal } from 'react-dom';
import CreatePostModal from '@/components/post/CreatePostModal';
import ReportAbuseModal from '@/components/common/ReportModal';
import { useAuth } from '@/context/AuthContext';
import { consumeReturn, navigateBack, rememberReturn } from '@/lib/navBack';
import { saveMainScroll } from '@/lib/scrollRestoration';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';
import { useLayerStack } from '@/context/LayerStackContext';
import { useSearchOverlay } from '@/hooks/useSearchOverlay';
import { useCampFeedOverlay } from '@/hooks/useCampFeedOverlay';
import { useAppNavigation } from '@/hooks/useAppNavigation';
import { useProfileOverlay } from '@/hooks/useProfileOverlay';
import { hasTemporaryToken } from '@/lib/checkTemporaryToken';
import CompleteProfileActionModal from '@/components/CompleteProfileActionModal';
import { useCreateProfilePostOverlay } from '@/hooks/useCreateProfilePostOverlay';
//import Link from 'next/link';
import { getBrowserApiBase } from '@/lib/apiBase';
import { startTelegramLinkFlow } from '@/lib/telegramNotifications';
import MentionedProfileInline from '@/components/post/MentionedProfileInline';

const PREFILL_KEY = 'profilePost:prefillCamp'


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

const FEED_TAB_VALUES: readonly CampFeedTab[] = ['comments', 'posts', 'marks'];
type Tab = CampFeedTab | 'feed';
const LEGACY_FEED_TAB_ALIASES: Record<string, CampFeedTab> = { info: 'comments', feed: 'comments' };

const normalizeStoredFeedTab = (value: unknown): CampFeedTab | null => {
    if (typeof value !== 'string') return null;
    const candidate = LEGACY_FEED_TAB_ALIASES[value] ?? (value as CampFeedTab);
    return (FEED_TAB_VALUES as readonly string[]).includes(candidate) ? candidate : null;
};

type CampFeedPreviewItem = {
    id: number;
    author?: string;
    text: string;
};



// страница лайкнувших и подписавшихся

// === Унифицированный нормалайзер списков пользователей (лайкеры/подписчики) ===
type SimpleUser = { id: number; username: string; avatar: string | null };
const normalizeUsers = (j: unknown): SimpleUser[] => {
    type MaybeLists = {
        results?: unknown; users?: unknown; likers?: unknown; data?: unknown;
        subscribers?: unknown; followers?: unknown; items?: unknown
    };
    const root = (j ?? {}) as MaybeLists;
    const arr: unknown[] =
        Array.isArray(j) ? j as unknown[] :
            Array.isArray(root.results) ? root.results as unknown[] :
                Array.isArray(root.users) ? root.users as unknown[] :
                    Array.isArray(root.likers) ? root.likers as unknown[] :
                        Array.isArray(root.subscribers) ? root.subscribers as unknown[] :
                            Array.isArray(root.followers) ? root.followers as unknown[] :
                                Array.isArray(root.items) ? root.items as unknown[] :
                                    Array.isArray(root.data) ? root.data as unknown[] : [];

    const usernameFrom = (o?: UnknownRecord | null) =>
        o ? (pickString(o, ['username', 'login', 'nick', 'name']) ?? null) : null;
    const avatarFrom = (o?: UnknownRecord | null) =>
        o ? absUrl(pickString(o, [
            'avatar', 'avatar_url', 'profile_picture', 'profilePicture', 'photo', 'photo_url', 'image', 'picture'
        ]) ?? undefined) : null;

    return arr.map(raw => {
        const u = raw as UnknownRecord;
        const nested =
            (u['user'] as UnknownRecord | undefined) ??
            (u['author'] as UnknownRecord | undefined) ??
            (u['profile'] as UnknownRecord | undefined) ??
            (u['owner'] as UnknownRecord | undefined) ??
            (u['liker'] as UnknownRecord | undefined) ??
            (u['account'] as UnknownRecord | undefined) ??
            (u['subscriber'] as UnknownRecord | undefined) ??
            (u['follower'] as UnknownRecord | undefined);

        const id =
            asNumber(u['id']) ?? asNumber(u['pk']) ?? asNumber(u['user_id']) ??
            (nested ? asNumber(nested['id']) : null) ?? 0;
        const username = usernameFrom(u) ?? usernameFrom(nested) ?? '';
        const avatar = avatarFrom(u) ?? avatarFrom(nested);
        return { id, username, avatar: avatar ?? null };
    }).filter(x => !!x.username);
};



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

function CampFeedPeekHandle({
    onOpen,
    activeTab,
    preview,
}: {
    onOpen: () => void;
    activeTab: CampFeedTab;
    preview?: CampFeedPreviewItem[] | null;
}) {
    return (
        <div className="pt-3 pb-5">
            <button
                type="button"
                onClick={onOpen}
                className="w-full rounded-2xl bg-white shadow-lg px-4 py-4 text-center block"
                style={{ touchAction: 'none' }}
            >
                <div className="text-sm font-semibold text-gray-900">Потяните вверх</div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm font-medium">
                    {[
                        { key: 'comments', label: 'Комментарии' },
                        { key: 'posts', label: 'Посты' },
                        { key: 'marks', label: 'Отметки' },
                    ].map((t) => (
                        <span
                            key={t.key}
                            className={[
                                'block w-full rounded-full py-2',
                                activeTab === t.key ? 'bg-black text-white' : 'bg-gray-100 text-gray-700',
                            ].join(' ')}
                        >
                            {t.label}
                        </span>
                    ))}
                </div>
                {preview && preview.length > 0 && (
                    <div className="mt-3 space-y-1 text-left text-xs text-gray-700">
                        {preview.slice(0, 2).map((item) => (
                            <div key={item.id} className="line-clamp-4 break-words">
                                {item.author && (
                                    <span className="font-semibold mr-1">{item.author}:</span>
                                )}
                                <span>{item.text}</span>
                            </div>
                        ))}
                        {preview.some((item) => item.text && item.text.length > 260) && (
                            <div className="pt-0.5 text-[11px] font-medium text-blue-600 underline underline-offset-4">
                                Развернуть
                            </div>
                        )}
                    </div>
                )}
            </button>
        </div>
    );
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


function IconChevronDown() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
            <path
                d="M6 9l6 6 6-6"
                fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            />
        </svg>
    );
}

function IconChevronUp() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
            <path
                d="M6 15l6-6 6 6"
                fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            />
        </svg>
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
        /* eslint-disable-next-line @next/next/no-img-element */
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
//type SimpleUser = { id: number; username: string; avatar: string | null };
type LikeSource =
    | { kind: 'comment'; id: number }
    | { kind: 'post'; campId: number; id: number }
    | { kind: 'camp'; campId: number };

function CampLikersModal({
    open,
    onClose,
    campId,
    skipPortal = false,
    onProfileClick,
}: {
    open: boolean;
    onClose: () => void;
    campId: number;
    skipPortal?: boolean;
    onProfileClick?: (username: string, event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
    const [items, setItems] = React.useState<SimpleUser[] | null>(null);
    const [err, setErr] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!open || !API || !campId) return;
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
                    loaded = normalizeUsers(j);
                    break;
                } catch { }
            }
            if (!cancelled) {
                if (loaded) setItems(loaded);
                else { setItems([]); setErr('Не удалось загрузить список лайкнувших'); }
            }
        })();
        return () => { cancelled = true; };
    }, [open, campId, API]);

    if (!open) return null;

    const content = (
        <div className={skipPortal ? "absolute inset-0 bg-white flex flex-col" : "fixed inset-0 z-[30000] bg-white flex flex-col"} role="dialog" aria-modal="true">
            {/* шапка */}
            <div className="h-[56px] flex items-center justify-between px-4 border-b border-gray-200">
                <div className="text-base font-medium">Оценили:</div>
                <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
                    aria-label="Закрыть"
                >✕</button>
            </div>
            {/* список со скроллом */}
            <div className="flex-1 overflow-y-auto">
                {items === null ? (
                    <div className="px-4 py-6 text-gray-500">Загрузка…</div>
                ) : items.length === 0 ? (
                    <div className="px-4 py-6 text-gray-500">{err || 'Пока никто не лайкнул.'}</div>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {items.map(u => (
                            <li key={u.id}>
                                <a
                                    href={`/${u.username}`}
                                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
                                    onClick={(e) => {
                                        if (onProfileClick) {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onProfileClick(u.username, e);
                                        } else {
                                            saveMainScroll();
                                            rememberReturn('profile');
                                        }
                                    }}
                                >
                                    <AvatarImg
                                        src={u.avatar}
                                        alt={`@${u.username}`}
                                        className="w-8 h-8 rounded-full object-cover border border-gray-200"
                                    />
                                    <span className="text-[14px] font-semibold">{u.username}</span>
                                </a>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );

    if (skipPortal) return content;
    return createPortal(content, document.body);
}


function CampSubscribersPage({
    open,
    onClose,
    campId,
    skipPortal = false,
    onProfileClick,
}: {
    open: boolean;
    onClose: () => void;
    campId: number;
    skipPortal?: boolean;
    onProfileClick?: (username: string, event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
    const [items, setItems] = React.useState<SimpleUser[] | null>(null);
    const [err, setErr] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!open || !API || !campId) return;
        let cancelled = false;
        (async () => {
            setErr(null);
            setItems(null);
            const urls: string[] = [
                `${API}/api/camps/${campId}/subscribers/`,
                `${API}/api/camps/${campId}/followers/`,
                `${API}/api/camps/${campId}/followed-by/`,
                `${API}/api/subscribers/?target_type=camp&target_id=${campId}`,
                `${API}/api/followers/?target_type=camp&target_id=${campId}`,
            ];
            let loaded: SimpleUser[] | null = null;
            for (const u of urls) {
                try {
                    const r = await fetch(u, {
                        credentials: 'include',
                        cache: 'no-store',
                        headers: { Accept: 'application/json' },
                    });
                    if (r.status === 401 || r.status === 403) { setErr('Нужно войти в аккаунт'); break; }
                    if (r.status === 404) continue;
                    if (!r.ok) { setErr('Ошибка сервера при загрузке подписчиков'); break; }
                    const j = await r.json();
                    loaded = normalizeUsers(j);
                    break;
                } catch { }
            }
            if (!cancelled) {
                if (loaded) setItems(loaded);
                else { setItems([]); setErr('Не удалось загрузить подписчиков'); }
            }
        })();
        return () => { cancelled = true; };
    }, [open, campId, API]);

    if (!open) return null;

    const content = (
        <div className={skipPortal ? "absolute inset-0 bg-white flex flex-col" : "fixed inset-0 z-[30000] bg-white flex flex-col"} role="dialog" aria-modal="true">
            <div className="h-[56px] flex items-center justify-between px-4 border-b border-gray-200">
                <div className="text-base font-medium">Подписались:</div>
                <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
                    aria-label="Закрыть"
                >✕</button>
            </div>
            <div className="flex-1 overflow-y-auto">
                {items === null ? (
                    <div className="px-4 py-6 text-gray-500">Загрузка…</div>
                ) : items.length === 0 ? (
                    <div className="px-4 py-6 text-gray-500">{err || 'Подписчиков пока нет.'}</div>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {items.map(u => (
                            <li key={u.id}>
                                <a
                                    href={`/${u.username}`}
                                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
                                    onClick={(e) => {
                                        if (onProfileClick) {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onProfileClick(u.username, e);
                                        } else {
                                            saveMainScroll();
                                            rememberReturn('profile');
                                        }
                                    }}
                                >
                                    <AvatarImg
                                        src={u.avatar}
                                        alt={`@${u.username}`}
                                        className="w-8 h-8 rounded-full object-cover border border-gray-200"
                                    />
                                    <span className="text-[14px] font-semibold">{u.username}</span>
                                </a>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );

    if (skipPortal) return content;
    return createPortal(content, document.body);
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




function fmtPrice(val: number | string | null | undefined, currency: string) {
    if (val == null) return '';
    const n = typeof val === 'string' ? Number(val) : val;
    const sym = currency === 'RUB' ? '₽' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency;
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + ` ${sym}`;
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





type MobileCampProps = {
    camp: Camp;
    busy?: boolean;
    onToggleSoldOut?: (next: boolean) => Promise<void>;
    onActivateHot?: (price: number) => Promise<void>;
    onDeactivateHot?: () => Promise<void>;
};

export default function CampMobileInfo({ camp }: MobileCampProps) {

    const [profilePostCreateOpen, setProfilePostCreateOpen] = useState(false);

    const [full, setFull] = useState<UnknownRecord | null>(null);
    const router = useRouter();
    const [editOpen, setEditOpen] = useState(false);
    const [postModalOpen, setPostModalOpen] = useState(false);

    // campLikersOpen и campSubsListOpen больше не нужны - используем LayerStack напрямую
    const { isOverlay, close: closeOverlay } = useOverlayEnvironment();
    const { screens, pushScreen, closeTopScreen, clearScreens } = useLayerStack();
    const { navigateProfile } = useAppNavigation();
    const openProfileOverlay = useProfileOverlay();
    const openSearchOverlay = useSearchOverlay();
    const openCreateProfilePostOverlay = useCreateProfilePostOverlay();

    const pathname = usePathname();
    const searchParams = useSearchParams();

    // auth state for gating
    const { authenticated, telegramNotificationsEnabled } = useAuth();
    const [authRequiredOpen, setAuthRequiredOpen] = useState(false);


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
        } catch (e) {
            console.error('handleCampSaved error', e);
        }
    }, []);

    // Action sheet и подтверждение удаления
    const [campActionsOpen, setCampActionsOpen] = useState(false);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

    const openCampActions = useCallback(() => {
        if (!authenticated) { setCampActionsOpen(false); setAuthRequiredOpen(true); return; }
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
        if (hasTemporaryToken()) { setCampActionsOpen(false); setCompleteProfileModalOpen(true); return; }
        setCampActionsOpen(false);
        requestAnimationFrame(() => setReportCampOpen(true));
        console.log('[camp] report clicked');
        // alert('Спасибо! Мы рассмотрим жалобу.'); // опционально, если нужен фидбек
    }, [setCampActionsOpen]);



  const organizerRowRef = React.useRef<HTMLDivElement | null>(null);
  //const tabsHeaderRef = React.useRef<HTMLDivElement | null>(null);
  const [stickyTop, setStickyTop] = React.useState(0);
  const stickyTopRef = React.useRef(0);
  stickyTopRef.current = stickyTop;
  const feedSectionRef = React.useRef<HTMLDivElement | null>(null);
  const [overlayTop, setOverlayTop] = useState<number | null>(null); // динамический top старого оверлея ленты (теперь только для логов)
  const overlayTopRef = React.useRef<number | null>(null);
  overlayTopRef.current = overlayTop;
  const feedEngaged = (overlayTop ?? Infinity) <= (stickyTop + 0.5); // полное раскрытие, когда дошли до шапки (используется только в логах)
  const overlayDragRef = React.useRef(0);
  const overlayPinnedRef = React.useRef(false);
  // Защита от рывков при закрытии/открытии клавиатуры
  const overlayLockUntilRef = React.useRef(0);
  const kbTransitionUntilRef = React.useRef(0);
  // Предыдущее измеренное значение stickyTop (нужно снаружи эффекта, чтобы не нарушать правила хуков)
  const prevStickyTopRef = React.useRef(0);

  const readMobilePostOverlayFlag = () => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('mobile-post-overlay-open');
  };
  const [mobilePostOverlayOpen, setMobilePostOverlayOpen] = React.useState(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('mobile-post-overlay-open');
  });

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const update = () => {
      const next = readMobilePostOverlayFlag();
      setMobilePostOverlayOpen(prev => (prev === next ? prev : next));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Диагностика: логируем смену overlayTop и состояния «engaged»
  const prevOverlayTopRef = React.useRef<number | null>(null);
  const prevEngagedRef = React.useRef<boolean | null>(null);
  React.useEffect(() => {
    try {
      const engagedNow = feedEngaged;
      const engagedChanged = prevEngagedRef.current === null ? false : prevEngagedRef.current !== engagedNow;
      const topChanged = prevOverlayTopRef.current === null ? false : prevOverlayTopRef.current !== overlayTop;
      if (topChanged || engagedChanged) {
        console.debug('[Overlay][Camp] state', {
          overlayTop,
          stickyTop,
          engaged: engagedNow,
          engagedChanged,
          topChanged,
          ts: Date.now(),
        });
      }
      prevOverlayTopRef.current = overlayTop;
      prevEngagedRef.current = engagedNow;
    } catch { /* noop */ }
  }, [overlayTop, stickyTop, feedEngaged]);

  // Диагностика клавиатуры/визуального вьюпорта: лог событий VisualViewport
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;
    let lastH = vv.height;
    let lastOffsetTop = vv.offsetTop || 0;
    const log = (tag: string) => {
      const innerH = window.innerHeight;
      const h = vv.height;
      const off = vv.offsetTop || 0;
      const occluded = Math.max(0, Math.round(innerH - (off + h)));
      const deltaH = Math.round((h - lastH) * 100) / 100;
      const deltaOff = Math.round((off - lastOffsetTop) * 100) / 100;
      console.debug('[KB][vv]', tag, { innerH, vvH: h, vvOff: off, occluded, deltaH, deltaOff, ts: Date.now() });
      // помечаем короткий переход клавиатуры, чтобы не трогать stickyTop
      kbTransitionUntilRef.current = performance.now() + 800;
      // при увеличении высоты визуального вьюпорта (клава скрылась) — держим оверлей закреплённым
      if (deltaH > 12 && ((overlayTop ?? Infinity) <= (stickyTop + 0.5))) {
        overlayLockUntilRef.current = performance.now() + 800;
        try { console.debug('[Overlay][Camp] lock due to KB hide', { until: overlayLockUntilRef.current }); } catch {}
      }
      lastH = h;
      lastOffsetTop = off;
    };
    const onResize = () => log('resize');
    const onScroll = () => log('scroll');
    const onGeom: EventListener = () => log('geometrychange');
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onScroll);
    try { (vv as unknown as { addEventListener?: (t: string, cb: EventListener) => void })?.addEventListener?.('geometrychange', onGeom); } catch {}
    // Первый снимок
    log('mount');
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onScroll);
      try { (vv as unknown as { removeEventListener?: (t: string, cb: EventListener) => void })?.removeEventListener?.('geometrychange', onGeom); } catch {}
    };
  }, []);

  const layoutVH = () => Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

  const forceOverlayClose = React.useCallback((reason: string = 'manual') => {
    overlayPinnedRef.current = false;
    overlayDragRef.current = 0;
    const hadOverlay = overlayTopRef.current !== null;
    try {
      console.debug('[CampMobileInfo] force overlay close', {
        reason,
        hadOverlay,
        stickyTop: stickyTopRef.current,
        ts: Date.now(),
      });
    } catch { /* noop */ }
    setOverlayTop(null);
  }, [setOverlayTop]);

  React.useEffect(() => {
    if (!mobilePostOverlayOpen) return;
    forceOverlayClose('post-overlay-active');
  }, [mobilePostOverlayOpen, forceOverlayClose]);

    React.useLayoutEffect(() => {
        if (typeof window === 'undefined') return;
    const el = organizerRowRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const styles = window.getComputedStyle(el);
      const marginBottom = parseFloat(styles.marginBottom || '0') || 0;
      const offset = Math.max(0, Math.round(rect.bottom + marginBottom));
      const now = performance.now();
      const prev = prevStickyTopRef.current;
      if (now < kbTransitionUntilRef.current && prev > 0 && offset < Math.max(0, prev - 8)) {
        try { console.debug('[camp] stickyTop freeze (kb transition)', { prev, candidate: offset }); } catch {}
        // skip update during keyboard transition to avoid spurious 0
        return;
      }
      setStickyTop(offset);
      prevStickyTopRef.current = offset;
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


    // управлялка модалкой лайков - используем LayerStack
    const openLikers = React.useCallback((src: LikeSource) => {
        if (src.kind !== 'camp') return;
        const handleProfileClick = (username: string, event: React.MouseEvent<HTMLAnchorElement>) => {
            event.preventDefault();
            event.stopPropagation();
            const handled = navigateProfile(event, { username });
            if (!handled) {
                openProfileOverlay({ username });
            }
        };
        pushScreen({
            node: (
                <CampLikersModal
                    open={true}
                    campId={src.campId}
                    skipPortal={true}
                    onProfileClick={handleProfileClick}
                    onClose={() => {
                        closeTopScreen();
                    }}
                />
            ),
            className: 'bg-white',
            backdrop: 'dim',
            dismissible: true,
            blockScroll: true,
            ariaLabel: 'Список лайкнувших',
            onClose: () => {
                // Экран закрыт
            },
        });
    }, [pushScreen, navigateProfile, openProfileOverlay, closeTopScreen]);


    // прямо под другими useState в CampInfo

  useEffect(() => {
    if (isOverlay) return;
    document.documentElement.classList.add('camp-no-header');
    return () => document.documentElement.classList.remove('camp-no-header');
  }, [isOverlay]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => forceOverlayClose('popstate');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [forceOverlayClose]);

  // Раньше здесь была сложная логика «въезда» в ленту на самой странице.
  // Теперь отображение ленты целиком вынесено в общий оверлей useCampFeedOverlay,
  // поэтому этот эффект больше не нужен и оставлен только как заглушка для совместимости.

  // Блокировку скролла body для ленты теперь делает общесистемный оверлей ленты кэмпа.

    useEffect(() => {
        const raw = camp as unknown as UnknownRecord;
        const id =
            (raw['id'] as number | string | undefined) ??
            (raw['camp_id'] as number | string | undefined);
        if (id == null || !API) return;

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

    // аватар организатора в шапке мобильной версии больше не показываем


    const organizerName =
        pickString(raw, ['organizerClubName', 'organizer_name', 'organizerUsername', 'club_name']) ||
        (organizerObj ? pickString(organizerObj, ['club_name', 'username', 'display_name', 'name']) : null) ||
        'Клуб';

    const organizerUsername =
        pickString(raw, ['organizerUsername']) ||
        (organizerObj ? pickString(organizerObj, ['username']) : null);

    // Кнопка «Назад» в шапке (моб.) — после вычисления organizerUsername
    const handleBack = useCallback(() => {
        if (isOverlay) {
            closeOverlay();
            return;
        }
        forceOverlayClose('header-back');
        const ctx = consumeReturn('camp');
        if (ctx) {
            router.replace(ctx);
            return;
        }
        navigateBack(router, { fallback: '/search' });
    }, [router, forceOverlayClose, isOverlay, closeOverlay]);



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

    const tagsParts = React.useMemo(() => {
        const parts: Array<{ label: string; kind: 'activity' | 'hashtag'; tag: Tag }> = [];
        for (const a of activities) {
            parts.push({ label: isTagObj(a) ? a.name : a, kind: 'activity', tag: a });
        }
        for (const h of hashtags) {
            parts.push({ label: isTagObj(h) ? h.name : h, kind: 'hashtag', tag: h });
        }
        return parts;
    }, [activities, hashtags]);


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

    // --- Даты
    const startStr = pickDateString(raw, ['start_date', 'startDate', 'date_from']);
    const endStr = pickDateString(raw, ['end_date', 'endDate', 'date_to']);
    const start = parseDateYYYYMMDD(startStr ?? undefined);
    const end = parseDateYYYYMMDD(endStr ?? undefined);
    const dateRange = formatRuDateRange(start, end);
    const shortDateRange = start && end ? `${formatDot(start)}-${formatDot(end)}` : dateRange;

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
    const [telegramPromptOpen, setTelegramPromptOpen] = React.useState(false);


    const campSubscribedRaw = !!pickBool(raw, ['subscribed_by_me', 'is_subscribed']);
    React.useEffect(() => { setCampSubscribed(campSubscribedRaw); }, [campSubscribedRaw]);



    // --- Локальное состояние для «комментариев к кэмпу», т.к. они изменяются на странице
    const [campComments, setCampComments] = useState<number>(campCommentsRaw);
    useEffect(() => { setCampComments(campCommentsRaw); }, [campCommentsRaw]);

    // --- Отображаемые значения с «99+»
    const campLikesDisp = cap99(campLikes);
    const campSubsDisp = cap99(campSubs);
    const campCommentsDisp = cap99(campComments); // <- именно из state

    const showCampLikesCount = campLikes > 0;
    const showCampSubsCount = campSubs > 0;

    const [feedPreview, setFeedPreview] = useState<CampFeedPreviewItem[] | null>(null);

    useEffect(() => {
        if (!campIdNum) {
            setFeedPreview(null);
            return;
        }

        let cancelled = false;

        const load = async () => {
            try {
                const url = `${API}/api/camps/${campIdNum}/comments/`;
                const optsBase: Pick<RequestInit, 'cache' | 'headers'> = {
                    cache: 'no-store',
                    headers: { Accept: 'application/json' },
                };
                let resp: Response | null = null;

                try {
                    resp = await fetch(url, { ...optsBase, credentials: 'include' });
                    if (!resp.ok && (resp.status === 401 || resp.status === 403)) {
                        throw new Error(String(resp.status));
                    }
                } catch {
                    try {
                        resp = await fetch(url, { ...optsBase, credentials: 'omit' });
                    } catch {
                        resp = null;
                    }
                }

                if (!resp || !resp.ok) return;

                const j: unknown = await resp.json();
                const root = (j ?? {}) as UnknownRecord;
                const arr: unknown[] =
                    Array.isArray(j) ? j as unknown[] :
                        Array.isArray(root.results) ? root.results as unknown[] :
                            Array.isArray(root.comments) ? root.comments as unknown[] :
                                [];

                const previewItems: CampFeedPreviewItem[] = [];

                for (const rawItem of arr) {
                    const rec = (rawItem ?? {}) as UnknownRecord;

                    const isDeleted = !!pickBool(rec, ['is_deleted', 'deleted']);
                    if (isDeleted) continue;

                    const id = pickNumber(rec, ['id', 'pk']);
                    if (!id) continue;

                    const authorRaw =
                        (typeof rec.author === 'object' && rec.author) ? (rec.author as UnknownRecord) :
                            (typeof rec.user === 'object' && rec.user) ? (rec.user as UnknownRecord) :
                                null;

                    const author = authorRaw ? pickString(authorRaw, ['username', 'login', 'nick', 'name']) : null;
                    const rawText =
                        pickString(rec, ['content', 'text', 'body']) ??
                        pickString(rec, ['title']);

                    const text = rawText ? rawText.trim() : '';
                    if (!text) continue;

                    // пропускаем заглушки для постов вроде "пост" / "post"
                    if (/^(пост|post)$/i.test(text)) continue;

                    previewItems.push({
                        id,
                        author: author || undefined,
                        text,
                    });

                    if (previewItems.length >= 2) break;
                }

                if (!cancelled) {
                    setFeedPreview(previewItems.length ? previewItems : null);
                }
            } catch {
                if (!cancelled) setFeedPreview(null);
            }
        };

        void load();

        return () => {
            cancelled = true;
        };
    }, [campIdNum]);


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

        return titleImage ? [titleImage] : [];
    }, [raw]);



    const description = pickString(raw, ['description']) || '';



    useEffect(() => {
        if (isOverlay) return;
        const root = document.documentElement;
        root.classList.add('camp-no-header');

        const prev = root.style.getPropertyValue('--header-h');
        root.style.setProperty('--header-h', '0px');

        return () => {
            root.classList.remove('camp-no-header');
            if (prev) root.style.setProperty('--header-h', prev);
            else root.style.removeProperty('--header-h');
        };
    }, [isOverlay]);


    // айди кэмпа
    const campId = pickNumber(raw, ['id', 'camp_id']);

    const [copied, setCopied] = useState(false);



    // где-то рядом наверху файла можно добавить вспомогательный тип
    const toggleLike = React.useCallback(async () => {
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
    }, [campIdNum, campBusyLike, campLiked, campLikes, writeCampLikeCache]);

    // где-то рядом наверху файла можно добавить вспомогательный тип (ОБЪЯВИ ЕГО ОДИН РАЗ)
    type SubscribePayload = {
        subscribed?: boolean;
        subscribers_count?: number;
    };

    async function toggleSubscribe() {
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
            } catch { /* не JSON */ }
            const tail = detail ? `: ${detail}` : '';
            if (r.status === 401) { alert('Нужно войти в аккаунт' + tail); return; }
            if (r.status === 403) { alert('Нет прав на удаление кэмпа' + tail); return; }
            if (r.status === 404) { alert('Контент не найден' + tail); return; }
            if (r.status === 409) { alert('Нельзя удалить: есть связанные объекты (посты/комментарии/подписки)' + tail); return; }
            alert(`Ошибка удаления (код ${r.status})` + tail);
        };

        const afterDeleted = () => {
            const deletedId = campId ?? camp.id ?? null;
            try {
                if (typeof window !== 'undefined' && deletedId) {
                    window.dispatchEvent(
                        new CustomEvent('navumi:camp-deleted', { detail: { id: deletedId } })
                    );
                    try {
                        // eslint-disable-next-line no-console
                        console.info('[CampMobileInfo] dispatched navumi:camp-deleted', { id: deletedId });
                    } catch { /* noop */ }
                    try {
                        const raw = window.sessionStorage.getItem('navumi:deleted-camps');
                        const list = raw ? (JSON.parse(raw) as number[]) : [];
                        if (!list.includes(deletedId)) list.push(deletedId);
                        window.sessionStorage.setItem('navumi:deleted-camps', JSON.stringify(list.slice(-50)));
                    } catch { /* noop */ }
                }
            } catch { /* noop */ }

            if (isOverlay) {
                // Кэмп открыт в оверлее — закрываем слой,
                // базовая страница (поиск/профиль) уже под ним.
                try { closeOverlay(); } catch { /* noop */ }
                return;
            }

            const fallback = organizerUsername ? `/${organizerUsername}` : '/search';
            router.replace(fallback);
        };

        try {
            await ensureCsrf();

            // 1) POST /delete/
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

            // 2) DELETE ресурс
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



    const topbarRef = React.useRef<HTMLDivElement | null>(null);


    const [activeTab, setActiveTab] = useState<Tab>('comments');
    const feedTabNormalized: CampFeedTab = (activeTab === 'feed' ? 'comments' : activeTab) as CampFeedTab;

    const activateTab = useCallback((tab: Tab) => {
        setActiveTab(tab);
    }, []);

    // ...после organizerUsername:
    const [meUsername, setMeUsername] = useState<string | null | undefined>(undefined);

    useEffect(() => {
        if (!API) return;
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

    const campFeedOverlay = useCampFeedOverlay();
    const feedOverlayOpenedRef = React.useRef(false);
    // State для отслеживания открытия оверлея (для обновления стрелочки)
    const [feedOverlayOpened, setFeedOverlayOpened] = React.useState(false);
    // Отслеживаем, на каком слое был открыт оверлей ленты (количество слоев на момент открытия)
    // Это нужно, чтобы определить, был ли оверлей ленты открыт на текущем слое кэмпа
    const feedOverlayOpenedAtLayerRef = React.useRef<number | null>(null);
    const previousScreensLengthRef = React.useRef(screens.length);
    
    const openFeedOverlay = React.useCallback(() => {
        if (feedOverlayOpenedRef.current) return;
        feedOverlayOpenedRef.current = true;
        setFeedOverlayOpened(true);
        // Запоминаем, на каком слое был открыт оверлей ленты (количество слоев на момент открытия)
        feedOverlayOpenedAtLayerRef.current = screens.length;
        campFeedOverlay.open({
            camp: raw as unknown as Camp,
            initialTab: feedTabNormalized,
            viewer,
            onCommentsCountChange: (delta) => setCampComments((c) => Math.max(0, c + delta)),
            onClosed: () => {
                feedOverlayOpenedRef.current = false;
                setFeedOverlayOpened(false);
                feedOverlayOpenedAtLayerRef.current = null;
            },
        });
    }, [campFeedOverlay, feedTabNormalized, viewer, raw, setCampComments, screens.length]);

    // Проверяем, находится ли оверлей ленты в стеке, но не был открыт на текущем слое кэмпа
    // Если оверлей ленты находится в стеке, но не был открыт на текущем слое, закрываем его
    useEffect(() => {
        const currentLength = screens.length;
        previousScreensLengthRef.current = currentLength;
        
        // Проверяем, есть ли в стеке оверлей ленты (по presentation: 'bottom-sheet')
        const hasFeedOverlayInStack = screens.some(screen => screen.presentation === 'bottom-sheet');
        
        // Если оверлей ленты находится в стеке, но не был открыт на текущем слое кэмпа,
        // закрываем его (это означает, что он остался от предыдущего состояния)
        if (hasFeedOverlayInStack && !feedOverlayOpenedRef.current) {
            campFeedOverlay.close();
            feedOverlayOpenedRef.current = false;
            setFeedOverlayOpened(false);
            feedOverlayOpenedAtLayerRef.current = null;
            return;
        }
        
        // Если оверлей ленты был открыт, проверяем, нужно ли его закрыть
        if (!feedOverlayOpenedRef.current || feedOverlayOpenedAtLayerRef.current === null) return;
        
        const openedAtLayer = feedOverlayOpenedAtLayerRef.current;
        
        // Если оверлей ленты был открыт на текущем слое кэмпа и из него открыли другие оверлеи,
        // он не должен закрываться (он находится под другими оверлеями)
        // Если оверлей ленты был открыт на слое кэмпа, но появились другие оверлеи поверх кэмпа
        // (не из оверлея ленты), закрываем оверлей ленты
        
        // Проверяем, находится ли оверлей ленты под другими оверлеями
        // Если openedAtLayer < currentLength - 1, это означает, что есть другие оверлеи поверх оверлея ленты
        // (оверлей ленты был открыт, и из него открыли другие оверлеи) - НЕ закрываем
        const feedOverlayIsUnderOtherOverlays = openedAtLayer < currentLength - 1;
        
        // Если оверлей ленты был открыт на слое кэмпа, но появились другие оверлеи поверх кэмпа
        // (не из оверлея ленты), закрываем оверлей ленты
        // Это происходит, когда появились новые оверлеи поверх кэмпа (currentLength > openedAtLayer + 1)
        // и оверлей ленты не находится под другими оверлеями
        const newOverlaysAboveCamp = currentLength > openedAtLayer + 1;
        
        // Закрываем только если появились новые оверлеи поверх кэмпа (не из оверлея ленты)
        // и оверлей ленты не находится под другими оверлеями
        if (newOverlaysAboveCamp && !feedOverlayIsUnderOtherOverlays) {
            campFeedOverlay.close();
            feedOverlayOpenedRef.current = false;
            setFeedOverlayOpened(false);
            feedOverlayOpenedAtLayerRef.current = null;
        }
    }, [isOverlay, screens, campFeedOverlay]);

    // Перехват скролла: открываем общесистемный оверлей ленты (4/5 экрана) при скролле вниз
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (mobilePostOverlayOpen) return;
    const el = feedSectionRef.current;
    if (!el) return;

    // Проверяем, что кэмп является активным (верхним) слоем
    // Скролл должен обрабатываться, если:
    // 1. Мы не в оверлее (isOverlay === false) - обрабатываем скролл
    // 2. Мы в оверлее, но нет других оверлеев поверх кэмпа, которые могут перехватывать скролл
    // Оверлей ленты открывается на текущем слое кэмпа (feedOverlayOpenedAtLayerRef.current === screens.length),
    // поэтому если оверлей ленты не открыт или открыт на текущем слое, значит кэмп - верхний слой
    // Если оверлей ленты был открыт на более высоком слое (feedOverlayOpenedAtLayerRef.current > screens.length),
    // это означает, что есть другие оверлеи поверх кэмпа - не обрабатываем скролл
    // Также проверяем, есть ли другие оверлеи поверх кэмпа (не оверлей ленты)
    // Оверлей ленты имеет presentation === 'bottom-sheet', поэтому если есть другие оверлеи
    // с presentation !== 'bottom-sheet' поверх кэмпа, не обрабатываем скролл
    const isFeedOverlayOpenOnHigherLayer = feedOverlayOpenedAtLayerRef.current !== null && 
                                           feedOverlayOpenedAtLayerRef.current > screens.length;
    // Проверяем, есть ли другие оверлеи поверх кэмпа (не оверлей ленты)
    // Если верхний слой имеет presentation !== 'bottom-sheet', значит это не оверлей ленты,
    // и скролл должен обрабатываться (кэмп является верхним слоем)
    // Если верхний слой имеет presentation === 'bottom-sheet', значит это оверлей ленты,
    // и скролл не должен обрабатываться (оверлей ленты находится поверх кэмпа)
    const topScreenIsFeedOverlay = screens.length > 0 && 
                                   screens[screens.length - 1]?.presentation === 'bottom-sheet';
    const shouldHandleScroll = !isOverlay || (isOverlay && !isFeedOverlayOpenOnHigherLayer && !topScreenIsFeedOverlay);
    
    const vh = () => layoutVH();
    const atBottom = () => el.getBoundingClientRect().bottom <= vh() + 0.5;

    // Проверяем, нужно ли открыть оверлей на основе позиции скролла
    const shouldOpenOverlay = () => {
      if (!shouldHandleScroll) return false;
      if (feedOverlayOpenedRef.current) return false;
      
      // Открываем оверлей, если:
      // 1. Дошли до нижней кромки секции ленты (старое поведение)
      // 2. ИЛИ скроллим вниз и секция ленты видна в viewport (раскрытие по скроллу)
      const rect = el.getBoundingClientRect();
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      
      // Если дошли до нижней кромки - открываем
      if (atBottom()) return true;
      
      // Если секция ленты видна в viewport и мы прокрутили достаточно далеко вниз
      // (секция ленты должна быть видна, но не обязательно в самом верху)
      const isVisible = rect.top < vh() && rect.bottom > 0;
      if (!isVisible) return false;
      
      // Открываем, если прокрутили достаточно далеко вниз (секция ленты уже в viewport)
      // Используем более мягкое условие: если верх секции ленты выше viewport на небольшое расстояние
      const threshold = stickyTopRef.current + 100; // добавляем запас для более раннего раскрытия
      return scrollY >= threshold;
    };

    const openFeedOverlayIfNeeded = () => {
      if (shouldOpenOverlay()) {
        openFeedOverlay();
      }
    };

    let lastScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

    const onScroll = () => {
      const currentScrollY = window.scrollY || document.documentElement.scrollTop || 0;
      const scrollingDown = currentScrollY > lastScrollY;
      
      if (scrollingDown) {
        // Отменяем предыдущий таймаут, если он есть
        if (scrollTimeout) {
          clearTimeout(scrollTimeout);
        }
        // Добавляем небольшую задержку для плавности
        scrollTimeout = setTimeout(() => {
          openFeedOverlayIfNeeded();
        }, 50);
      }
      
      lastScrollY = currentScrollY;
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.deltaY) return;
      if (e.deltaY > 0) {
        // Отменяем таймаут скролла, если есть
        if (scrollTimeout) {
          clearTimeout(scrollTimeout);
        }
        openFeedOverlayIfNeeded();
      }
    };

    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      touchStartY = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const y = e.touches[0].clientY;
      const dy = touchStartY - y; // >0 вниз, <0 вверх
      if (Math.abs(dy) < 5) return;
      if (dy > 0) {
        // Отменяем таймаут скролла, если есть
        if (scrollTimeout) {
          clearTimeout(scrollTimeout);
        }
        openFeedOverlayIfNeeded();
      }
      touchStartY = y;
    };

    // Подключаем обработчики только если должны обрабатывать скролл
    if (!shouldHandleScroll) {
      return;
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [campFeedOverlay, mobilePostOverlayOpen, feedTabNormalized, viewer, raw, openFeedOverlay, screens.length, isOverlay]);

  // В режиме оверлея сразу фиксируем ленту под шапкой кэмпа, без сложной анимации и завязки на скролл страницы
  useEffect(() => {
    if (!isOverlay) return;
    overlayPinnedRef.current = true;
    setOverlayTop((prev) => {
      const next = Math.max(stickyTopRef.current, 0);
      return prev === next ? prev : next;
    });
  }, [isOverlay, stickyTop]);

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
        // Небольшая задержка, чтобы включить оверлей, если якорь уже у верхней кромки
        // не форсируем включение оверлея — прогресс посчитает check()
    }, [stickyTop]);

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


    // Свернуть/развернуть описание
    const [descExpanded, setDescExpanded] = useState(false);
    const DESC_MAX_LINES = 15;

    // показываем не больше 15 строк; \r\n, \r -> \n
    const { descNeedsClamp, visibleLines } = useMemo(() => {
        const clean = (description ?? '').replace(/\r\n?/g, '\n');
        const lines = clean.split('\n');
        const trimmed = [...lines];
        while (trimmed.length > 0 && trimmed[trimmed.length - 1].trim() === '') {
            trimmed.pop();
        }

        const baseLines = trimmed.length ? trimmed : (clean ? [''] : []);
        if (baseLines.length <= DESC_MAX_LINES) {
            return { descNeedsClamp: false, visibleLines: baseLines };
        }

        return { descNeedsClamp: true, visibleLines: baseLines.slice(0, DESC_MAX_LINES) };
    }, [description]);

    useEffect(() => { setDescExpanded(false); }, [description]);



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

    const prefillCampForProfilePost = campIdNum ? {
        id: campIdNum,
        title,
        start_date: startStr ?? undefined,
        end_date: endStr ?? undefined,
    } : null;

    // — строка плашек + теги/хэштеги (скролл + «…» при обрезании)
    const chipsRowRef = React.useRef<HTMLDivElement | null>(null);
    const [chipsDots, setChipsDots] = useState({ left: false, right: false });

    const BASE_PAD = 8
    const DOTS_PAD = 18;
    //const GUTTER = BASE_PAD + DOTS_PAD;

    const chipsTrackRef = React.useRef<HTMLDivElement | null>(null);
    const padsRef = React.useRef({ left: BASE_PAD, right: BASE_PAD });

    const leftPad = BASE_PAD + (chipsDots.left ? DOTS_PAD : 0);
    const rightPad = BASE_PAD + (chipsDots.right ? DOTS_PAD : 0);


    React.useLayoutEffect(() => {
        const scroller = chipsRowRef.current;
        if (!scroller) return;

        const prev = padsRef.current;
        const deltaLeft = leftPad - prev.left;

        if (deltaLeft !== 0) {
            // добавился левый отступ → прокручиваем на столько же вправо
            // убрался левый отступ → прокручиваем влево (deltaLeft < 0)
            const nextScrollLeft = Math.max(
                0,
                Math.min(scroller.scrollLeft + deltaLeft, scroller.scrollWidth - scroller.clientWidth)
            );
            scroller.scrollLeft = nextScrollLeft;
        }

        padsRef.current = { left: leftPad, right: rightPad };
    }, [leftPad, rightPad]);


    const rafId = React.useRef<number | null>(null);
    const lastDots = React.useRef({ left: false, right: false });


    const recomputeChipsDots = React.useCallback(() => {
        const el = chipsRowRef.current;
        if (!el) return;

        const l = el.scrollLeft;
        const max = el.scrollWidth - el.clientWidth;

        // гистерезис, чтобы не мигало на границе
        const left = l > 6;
        const right = (max - l) > 6;

        const prev = lastDots.current;
        if (left !== prev.left || right !== prev.right) {
            lastDots.current = { left, right };
            setChipsDots({ left, right });
        }
    }, []);

    React.useLayoutEffect(() => {
        recomputeChipsDots();
        const el = chipsRowRef.current;
        if (!el) return;

        const onScroll = () => {
            if (rafId.current != null) return;
            rafId.current = requestAnimationFrame(() => {
                rafId.current = null;
                recomputeChipsDots();
            });
        };

        el.addEventListener('scroll', onScroll, { passive: true });

        const ro = new ResizeObserver(() => recomputeChipsDots());
        ro.observe(el);
        window.addEventListener('resize', recomputeChipsDots);

        return () => {
            el.removeEventListener('scroll', onScroll);
            ro.disconnect();
            window.removeEventListener('resize', recomputeChipsDots);
            if (rafId.current != null) cancelAnimationFrame(rafId.current);
        };
    }, [recomputeChipsDots, tagsParts.length, isKids, hasKidsCoach]);


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
        <div className="bg-white min-h-screen">
            <div
                ref={topbarRef}
                id="camp-topbar"
                className="sticky top-0 z-[1200] border-b border-gray-200 bg-white supports-[backdrop-filter]:bg-white/90 backdrop-blur"
            >
                <div
                    ref={organizerRowRef}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <button
                            type="button"
                            onClick={handleBack}
                            className="w-8 h-8 rounded-full hover:bg-gray-100 text-gray-900 flex items-center justify-center"
                            aria-label="Назад"
                            title="Назад"
                        >
                            <ChevronLeft className="w-[18px] h-[18px]" strokeWidth={2.6} />
                        </button>
                        <a
                            href={organizerUsername ? `/${organizerUsername}` : '#'}
                            onClick={(e) => {
                                if (!organizerUsername) {
                                    e.preventDefault();
                                    return;
                                }
                                e.preventDefault();
                                e.stopPropagation();
                                // Всегда открываем профиль в оверлее
                                const handled = navigateProfile(e, { username: organizerUsername });
                                if (!handled) {
                                    // Fallback: открываем оверлей напрямую
                                    openProfileOverlay({ username: organizerUsername });
                                }
                            }}
                            className="flex items-center min-w-0"
                        >
                            <div className="min-w-0">
                                <div className="text-base font-semibold text-gray-900 truncate">
                                    {organizerUsername ? organizerUsername : organizerName}
                                </div>
                            </div>
                        </a>
                    </div>

                    <div className="flex items-center gap-1 justify-end">
                        <button
                            type="button"
                            onClick={() => {
                                if (feedOverlayOpenedRef.current) {
                                    // Если оверлей ленты открыт - закрываем и скроллим наверх
                                    campFeedOverlay.close();
                                    feedOverlayOpenedRef.current = false;
                                    setFeedOverlayOpened(false);
                                    feedOverlayOpenedAtLayerRef.current = null;
                                    // Скроллим к верху страницы
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                } else {
                                    // Если оверлей ленты не открыт - открываем его
                                    openFeedOverlay();
                                }
                            }}
                            className="w-9 h-9 rounded-full hover:bg-gray-100 text-gray-700 flex items-center justify-center"
                            aria-label={feedOverlayOpened ? "Свернуть ленту" : "Открыть ленту"}
                            title={feedOverlayOpened ? "Свернуть ленту" : "Открыть ленту"}
                        >
                            {feedOverlayOpened ? (
                                <IconChevronUp />
                            ) : (
                                <IconChevronDown />
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={openCampActions}
                            className="w-9 h-9 rounded-full hover:bg-gray-100 text-gray-700 text-lg"
                            aria-haspopup="dialog"
                            aria-expanded={campActionsOpen ? 'true' : 'false'}
                            aria-label="Дополнительные действия"
                        >
                            ⋯
                        </button>
                    </div>
                </div>
            </div>

            <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+var(--bottom-gap,0px))] space-y-4">

                {/* Кнопки под шапкой (скроллится вместе со страницей) */}
                <div className="px-4 pt-5">
                    {!isOwner ? (
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => { if (!authenticated) { setAuthRequiredOpen(true); return; } toggleSubscribe(); }}
                                disabled={campBusySub}
                                aria-pressed={campSubscribed}
                                className={[
                                    'flex-1 h-10 rounded-full text-sm font-semibold transition',
                                    campSubscribed ? 'bg-gray-900 text-white' : 'bg-black text-white',
                                    campBusySub ? 'opacity-60 cursor-not-allowed' : 'hover:bg-black/90'
                                ].join(' ')}
                            >
                                {campSubscribed ? 'Отписаться' : 'Подписаться'}
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    if (!authenticated) { setAuthRequiredOpen(true); return; }
                                    if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
                                    const isMobile = typeof window !== 'undefined'
                                        && window.matchMedia?.('(max-width: 768px)').matches;

                                    if (isMobile) {
                                        // подготовим данные кэмпа (они у тебя уже собраны в prefillCampForProfilePost)
                                        const searchParams: Record<string, string> = {};
                                        if (prefillCampForProfilePost?.id) searchParams.camp_id = String(prefillCampForProfilePost.id);
                                        if (prefillCampForProfilePost?.title) searchParams.camp_title = prefillCampForProfilePost.title;
                                        if (prefillCampForProfilePost?.start_date) searchParams.start_date = prefillCampForProfilePost.start_date;
                                        if (prefillCampForProfilePost?.end_date) searchParams.end_date = prefillCampForProfilePost.end_date;
                                        try {
                                            if (prefillCampForProfilePost) {
                                                sessionStorage.setItem(PREFILL_KEY, JSON.stringify(prefillCampForProfilePost));
                                            }
                                        } catch { }
                                        openCreateProfilePostOverlay({
                                            searchParams: Object.keys(searchParams).length ? searchParams : undefined,
                                        });
                                        return;
                                    }

                                    // десктоп — как раньше (модалка)
                                    setProfilePostCreateOpen(true);
                                }}
                                className="flex-1 h-10 rounded-full border border-gray-300 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                            >
                                Отметить кэмп
                            </button>

                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setPostModalOpen(true)}
                                className="flex-1 h-10 rounded-full bg-black text-white text-sm font-semibold hover:bg-black/90"
                            >
                                Добавить пост
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditOpen(true)}
                                className="flex-1 h-10 rounded-full border border-gray-300 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                            >
                                Редактировать
                            </button>
                        </div>
                    )}
                </div>


                {!!gallery.length && (
                    <div className="pt-2">
                        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar">
                            {gallery.map((src, i) => (
                                <div
                                    key={src + i}
                                    className="relative shrink-0 w-[85vw] max-w-[360px] aspect-[3/2] rounded-2xl overflow-hidden bg-gray-100 snap-center"
                                >
                                    <SmartImage src={src} alt="" fill className="object-cover" sizes="(max-width: 640px) 100vw, 50vw" />
                                    {isSoldOut && (
                                        <span className="absolute top-2 left-2 px-3 py-1 rounded-full text-[11px] font-semibold bg-black/70 text-white">
                                            SOLD&nbsp;OUT
                                        </span>
                                    )}
                                    {isHot && !isSoldOut && (
                                        <span className="absolute top-2 left-2 px-3 py-1 rounded-full text-[11px] font-semibold bg-red-600 text-white">
                                            Горячеe
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            {telegramPromptOpen && (
                <div className="fixed inset-0 z-[20000] bg-black/40 flex items-center justify-center px-4">
                    <div className="max-w-sm w-full bg-white rounded-xl p-6 shadow-lg">
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
                    </div>
                </div>
            )}

                {(isKids || hasKidsCoach || tagsParts.length > 0) && (
                    <div className="relative">
                        {/* «…» слева/справа — с небольшими внутренними отступами, чтобы не упираться в края */}
                        {chipsDots.left && (
                            <div className="pointer-events-none absolute left-2 top-0 h-full flex items-center z-[1] text-gray-400" style={{ width: DOTS_PAD }}>…</div>
                        )}
                        {chipsDots.right && (
                            <div className="pointer-events-none absolute right-2 top-0 h-full flex items-center z-[1] text-gray-400" style={{ width: DOTS_PAD, justifyContent: 'flex-end' }}>…</div>
                        )}

                        <div
                            ref={chipsRowRef}
                            className="overflow-x-auto overflow-y-hidden no-scrollbar touch-pan-x"
                            style={{ overscrollBehaviorX: 'contain', WebkitOverflowScrolling: 'touch' }}
                        >
                            <div
                                ref={chipsTrackRef}
                                className="flex flex-nowrap items-center whitespace-nowrap py-0 text-sm text-gray-600 leading-none"
                                style={{ paddingLeft: leftPad, paddingRight: rightPad }}
                            >

                                {/* плашки */}
                                {isKids && (
                                    <span className="align-middle mr-2 px-3 py-1 rounded-full bg-gray-100 text-[11px] font-medium text-gray-700">
                                        Детский кэмп
                                    </span>
                                )}
                                {hasKidsCoach && (
                                    <span className="align-middle mr-2 px-3 py-1 rounded-full bg-gray-100 text-[11px] font-medium text-gray-700">
                                        Будет детский тренер
                                    </span>
                                )}
                                {tagsParts.map((t, i) => (
                                    <button
                                        key={`tag-${i}-${t.label}`}
                                        type="button"
                                        className="align-middle mr-2 px-3 py-1 rounded-full bg-gray-100 text-[11px] font-medium text-gray-700 whitespace-nowrap"
                                        onClick={() => {
                                            if (t.kind === 'activity') handleActivityChipClick(t.tag);
                                            else handleHashtagChipClick(t.tag);
                                        }}
                                    >
                                        <span className="inline-flex items-center gap-1">
                                            {t.kind === 'activity' ? (
                                                <Target className="w-3.5 h-3.5 text-blue-600" aria-hidden />
                                            ) : (
                                                <span className="text-blue-600">#</span>
                                            )}
                                            <span>{t.label}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Экшны под галереей, без серого контура — как на десктопе */}
                <div className="-mx-4 px-4">
                    <div className="flex items-center gap-5 py-2">
                        {/* Лайки */}
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => { if (!authenticated) { setAuthRequiredOpen(true); return; } toggleLike(); }}
                                disabled={campBusyLike}
                                className={[
                                    'w-9 h-9 flex items-center justify-center transition',
                                    campLiked ? 'text-red-500' : 'text-gray-700 hover:text-black',
                                    campBusyLike ? 'opacity-50 cursor-not-allowed' : ''
                                ].join(' ')}
                                aria-pressed={campLiked}
                                aria-label={campLiked ? 'Убрать лайк' : 'Поставить лайк'}
                            >
                                <IconHeart filled={campLiked} />
                            </button>
                            {showCampLikesCount && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!campIdNum) return;
                                        openLikers({ kind: 'camp', campId: campIdNum });
                                    }}
                                    className="text-sm font-semibold text-gray-900"
                                    aria-label="Список лайкнувших"
                                >
                                    {campLikesDisp}
                                </button>
                            )}
                        </div>

                        {/* Подписчики */}
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => {
                                    if (!campIdNum) return;
                                    const handleProfileClick = (username: string, event: React.MouseEvent<HTMLAnchorElement>) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        const handled = navigateProfile(event, { username });
                                        if (!handled) {
                                            openProfileOverlay({ username });
                                        }
                                    };
                                    pushScreen({
                                        node: (
                                            <CampSubscribersPage
                                                open={true}
                                                campId={campIdNum}
                                                skipPortal={true}
                                                onProfileClick={handleProfileClick}
                                                onClose={() => {
                                                    closeTopScreen();
                                                }}
                                            />
                                        ),
                                        className: 'bg-white',
                                        backdrop: 'dim',
                                        dismissible: true,
                                        blockScroll: true,
                                        ariaLabel: 'Список подписчиков',
                                        onClose: () => {
                                            // Экран закрыт
                                        },
                                    });
                                }}
                                className="w-9 h-9 flex items-center justify-center text-gray-700 hover:text-black"
                                aria-label="Перейти к подписчикам"
                            >
                                <IconUser />
                            </button>
                            {showCampSubsCount && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!campIdNum) return;
                                        const handleProfileClick = (username: string, event: React.MouseEvent<HTMLAnchorElement>) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            const handled = navigateProfile(event, { username });
                                            if (!handled) {
                                                openProfileOverlay({ username });
                                            }
                                        };
                                        pushScreen({
                                            node: (
                                                <CampSubscribersPage
                                                    open={true}
                                                    campId={campIdNum}
                                                    skipPortal={true}
                                                    onProfileClick={handleProfileClick}
                                                    onClose={() => {
                                                        closeTopScreen();
                                                    }}
                                                />
                                            ),
                                            className: 'bg-white',
                                            backdrop: 'dim',
                                            dismissible: true,
                                            blockScroll: true,
                                            ariaLabel: 'Список подписчиков',
                                            onClose: () => {
                                                // Экран закрыт
                                            },
                                        });
                                    }}
                                    className="text-sm font-semibold text-gray-900"
                                    aria-label="Список подписчиков"
                                >
                                    {campSubsDisp}
                                </button>
                            )}
                        </div>

                        {/* Комментарии */}
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => {
                                    openFeedOverlay();
                                }}
                                className="w-9 h-9 flex items-center justify-center text-gray-700 hover:text-black"
                                aria-label="Открыть комментарии"
                            >
                                <IconComment />
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    openFeedOverlay();
                                }}
                                className="text-sm font-semibold text-gray-900"
                            >
                                {campCommentsDisp}
                            </button>
                        </div>

                        {/* Поделиться — уводим вправо */}
                        <button
                            type="button"
                            onClick={shareCamp}
                            className="ml-auto w-9 h-9 flex items-center justify-center text-gray-700 hover:text-black"
                            aria-label="Поделиться"
                        >
                            <IconShare />
                        </button>
                    </div>

                    {copied && (
                        <div className="pb-1 text-xs text-green-600">Ссылка скопирована</div>
                    )}
                </div>


                {isSoldOut && (
                    <div className="py-1">
                        <div className="flex justify-center">
                            <span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-black text-white">
                                SOLD&nbsp;OUT
                            </span>
                        </div>
                    </div>
                )}


                <div className="space-y-0">
                    <div className="flex items-baseline justify-between gap-3">
                        <div className="flex items-baseline gap-3">
                            {isHot && displayOriginal != null ? (
                                <>
                                    <span className="text-3xl font-semibold text-red-600">{fmtPrice(displayPrice, currency)}</span>
                                    <span className="text-base text-gray-400 line-through">{fmtPrice(displayOriginal, currency)}</span>
                                </>
                            ) : (
                                <span className="text-3xl font-semibold">{fmtPrice(displayPrice, currency)}</span>
                            )}
                        </div>

                        {shortDateRange && (
                            <div className="text-sm text-gray-500 whitespace-nowrap">{shortDateRange}</div>
                        )}
                    </div>
                </div>


                <div className="space-y-1 min-w-0">
                    <h1 className="text-2xl font-semibold leading-snug break-words line-clamp-2">{title}</h1>
                </div>


                {locationName && (
                    <div className="space-y-1">
                        <button
                            type="button"
                            onClick={goToMapSearch}
                            className="text-sm text-gray-500 truncate text-left bg-transparent border-0 p-0 block w-full"
                        >
                            {locationName}
                        </button>
                        <button
                            type="button"
                            onClick={goToMapSearch}
                            className="inline-flex items-center gap-1 text-sm font-semibold text-black underline bg-transparent border-0 p-0"
                        >
                            Показать карту
                        </button>
                    </div>
                )}

                {(phone || telegram || website) && (
                    <div className="flex flex-wrap gap-2">
                        {telegram && (
                            <a
                                href={`https://t.me/${telegram.replace(/^@/, '')}`}
                                target="_blank"
                                rel="noreferrer"
                                className="px-4 h-10 inline-flex items-center rounded-full bg-gray-900 text-white text-sm font-semibold"
                            >
                                Telegram
                            </a>
                        )}
                        {phone && (
                            <a
                                href={`tel:${phone}`}
                                className="px-4 h-10 inline-flex items-center rounded-full border border-gray-300 text-sm font-semibold"
                            >
                                Позвонить
                            </a>
                        )}
                        {website && (
                            <a
                                href={website.startsWith('http') ? website : `https://${website}`}
                                target="_blank"
                                rel="noreferrer"
                                className="px-4 h-10 inline-flex items-center rounded-full border border-gray-300 text-sm font-semibold"
                            >
                                Сайт
                            </a>
                        )}
                    </div>
                )}

                {description && (
                    <div className="py-3 pb-0">
                        <div className="text-[15px] leading-relaxed break-words">
                            {descExpanded ? (
                                <div className="whitespace-pre-wrap">
                                    <MentionedProfileInline text={description} />
                                </div>
                            ) : (
                                <div>
                                    {visibleLines.map((ln, i) => (
                                        <span
                                            key={`desc-line-${i}`}
                                            className="block whitespace-pre-wrap"
                                        >
                                            {ln === '' ? ' ' : <MentionedProfileInline text={ln} />}
                                        </span>
                                    ))}
                                    {descNeedsClamp && (
                                        <button
                                            type="button"
                                            onClick={() => setDescExpanded(true)}
                                            className="block text-xs text-gray-500 text-left underline underline-offset-4 pt-1 mb-2"
                                        >
                                            Развернуть
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {descNeedsClamp && descExpanded && (
                            <button
                                type="button"
                                onClick={() => setDescExpanded(false)}
                                className="mt-2 mb-2 text-xs text-gray-500 underline underline-offset-4"
                            >
                                Свернуть описание
                            </button>
                        )}
                    </div>
                )}

                <CampFeedPeekHandle
                    activeTab={feedTabNormalized}
                    onOpen={openFeedOverlay}
                    preview={feedPreview}
                />

                {/* Двухсекционная вёрстка: место под ленту, саму ленту показываем фикс-оверлеем ниже */}
                <div
                    id="camp-feed-section"
                    ref={feedSectionRef}
                    className=""
                    style={{ height: 1, marginTop: 0 }}
                />
            </div>

            {isOwner && campId && (
                <EditCampMobilePage
                    open={editOpen}
                    onClose={() => setEditOpen(false)}
                    campId={campId}
                    initial={editableInitial}
                    currencyCode={currency}
                    onApplied={(next) => {
                        const prevSnap: UnknownRecord = { ...(camp as UnknownRecord), ...(full ?? {}) };

                        setFull(prev => {
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
                                    price: prevPrice,
                                    original_price: (prevOriginal ?? prevPrice) ?? null,
                                    hot_deal_price: newPrice,
                                };
                            }

                            return {
                                ...(prev ?? {}),
                                title: next.title,
                                description: next.description,
                                phone: next.phone || null,
                                website: next.website || null,
                                telegram_nickname: next.telegram_nickname || null,
                                is_sold_out: next.is_sold_out,
                                is_hot_deal: false,
                                price: prevPrice,
                                original_price: prevOriginal ?? null,
                                hot_deal_price: null,
                            };
                        });

                        void handleCampSaved(prevSnap, next);
                    }}

                    onRefetch={refetchCamp}
                />
            )}



            <CampPostCreateMobileModal
                open={postModalOpen}
                onClose={() => setPostModalOpen(false)}
                campId={camp.id}
                onCreated={async () => {
                    setPostModalOpen(false);
                    activateTab('posts');
                    await refetchCamp();
                }}
            />

            <CreatePostModal
                open={profilePostCreateOpen}
                onClose={() => setProfilePostCreateOpen(false)}
                prefillCamp={prefillCampForProfilePost}
                onSaved={() => {
                    setProfilePostCreateOpen(false);
                    try { sessionStorage.removeItem(`camp:${campIdNum}:marks`); } catch { }
                    activateTab('marks');
                    scrollFeedIntoView();
                }}
            />

            {/* CampLikersModal и CampSubscribersPage теперь открываются через LayerStack */}

            <CampActionSheet
                open={campActionsOpen}
                canDelete={isOwner}
                canReport={!isOwner}
                canShare={true}
                onClose={closeCampActions}
                onDelete={handleCampDeleteClick}
                onReport={() => { 
                    if (!authenticated) { setAuthRequiredOpen(true); return; }
                    if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
                    handleReportCamp(); 
                }}
                onShare={shareCamp}
            />

            <ConfirmModal
                open={confirmDeleteOpen}
                title="Удалить кэмп?"
                message="Это действие нельзя отменить."
                cancelLabel="Отмена"
                confirmLabel="Удалить"
                onCancel={() => setConfirmDeleteOpen(false)}
                onConfirm={async () => { await deleteCamp(); }}
            />

            <CompleteProfileActionModal
                open={completeProfileModalOpen}
                onClose={() => setCompleteProfileModalOpen(false)}
            />
            {Number.isFinite(campIdNum) && campIdNum > 0 && (
                <ReportAbuseModal
                    open={reportCampOpen}
                    onClose={() => setReportCampOpen(false)}
                    kind="camp"
                    targetId={campIdNum}
                    linkHint={getCanonicalCampUrl()}
                />
            )}

            <ConfirmModal
                open={authRequiredOpen}
                onCancel={() => setAuthRequiredOpen(false)}
                onConfirm={() => {
                    setAuthRequiredOpen(false);
                    clearScreens();
                    setTimeout(() => {
                        try { router.push('/auth/login'); } catch { window.location.href = '/auth/login'; }
                    }, 150);
                }}
                title="Данное действие доступно только авторизованным пользователям"
                cancelLabel="Отмена"
                confirmLabel="Войти"
            />
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


function MobileDescriptionEditor({
    value,
    onChange,
    placeholder = 'Описание',
}: {
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
}) {
    const [open, setOpen] = React.useState(false);
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

    React.useEffect(() => {
        if (!open) return;
        const raf = requestAnimationFrame(() => {
            const ta = textareaRef.current;
            if (!ta) return;
            ta.focus();
            try {
                const len = ta.value.length;
                ta.setSelectionRange(len, len);
            } catch { /* ignore */ }
        });
        return () => cancelAnimationFrame(raf);
    }, [open]);

    const close = React.useCallback(() => setOpen(false), []);

    return (
        <>
            <div
                role="button"
                tabIndex={0}
                onClick={() => setOpen(true)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setOpen(true);
                    }
                }}
                className="border border-gray-150 rounded-md px-3 py-3 text-sm leading-5 text-left whitespace-pre-wrap break-words cursor-text bg-white overflow-y-auto"
                style={{ minHeight: '10.25rem', maxHeight: '10.25rem' }}
            >
                {value?.trim() ? (
                    <span>{value}</span>
                ) : (
                    <span className="text-gray-400">{placeholder}</span>
                )}
            </div>

            <AnimatePresence>
                {open && (
                    <motion.div
                        className="fixed inset-0 z-[12000] bg-white flex flex-col"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onKeyDownCapture={(e) => {
                            if (e.key === 'Escape') {
                                e.stopPropagation();
                                close();
                            }
                        }}
                    >
                        <textarea
                            ref={textareaRef}
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            placeholder="Опишите изменения: тренеры, расписание, проживание…"
                            className="flex-1 w-full bg-white text-base leading-relaxed px-4 py-4 resize-none focus:outline-none"
                        />
                        <div className="px-4 py-4 border-t border-gray-200 flex justify-center">
                            <button
                                type="button"
                                onClick={close}
                                className="w-12 h-12 rounded-full bg-green-500 text-white text-xl flex items-center justify-center shadow-md"
                                aria-label="Сохранить описание"
                            >
                                ✓
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}


function EditCampMobilePage({
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
    const [err, setErr] = useState('');
    const formRef = useRef<HTMLFormElement | null>(null);
    const errRef = useRef<HTMLDivElement | null>(null);



    const currencySign = useMemo(() => getCurrencySign(currencyCode), [currencyCode]);

    const TITLE_MAX = 50;
    const TITLE_LEN_MSG = 'допустимая длинна названия кэмпа 50 знаков';

    useEffect(() => {
        if (!open) return;
        setValues(initial);
        setErr('');
    }, [open, initial]);

    // useEffect(() => {
    //     if (!open) return;
    //     setHide(true);
    //     const prevOverflow = document.body.style.overflow;
    //     document.body.style.overflow = 'hidden';
    //     return () => {
    //         setHide(false);
    //         document.body.style.overflow = prevOverflow;
    //     };
    // }, [open, setHide]);

    useEffect(() => {
        if (err === TITLE_LEN_MSG) {
            const t = setTimeout(() => setErr(''), 2000);
            return () => clearTimeout(t);
        }
    }, [err]);

    useEffect(() => {
        if (!open || !err) return;
        requestAnimationFrame(() => {
            const scroller = formRef.current;
            if (scroller) {
                scroller.scrollTop = 0;
                try { scroller.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* ignore */ }
            }
            try { errRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch { /* ignore */ }
        });
    }, [open, err]);

    const isWebsiteValid = useMemo(() => {
        if (!values.website) return true;
        return isValidWebsite(values.website);
    }, [values.website]);

    const validation = useMemo(() => validate(values), [values]);

    if (!open) return null;

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!API || !campId || saving) return;

        const v = validate(values);
        if (!v.ok) {
            setErr(v.errors[0] || 'Проверьте поля формы.');
            return;
        }

        const phoneRegex = /^\+?[0-9 ()-]+$/;
        if (values.phone && !phoneRegex.test(values.phone)) {
            setErr('Номер телефона может содержать только цифры, пробелы, скобки и дефисы.');
            return;
        }

        if (values.telegram_nickname && values.telegram_nickname.includes('@')) {
            setErr("Укажите телеграм без символа '@'.");
            return;
        }

        if (!isWebsiteValid) {
            setErr('Некорректный сайт.');
            return;
        }

        if (values.is_hot_deal) {
            const vTrimmed = values.hot_deal_price.trim();
            if (!vTrimmed) {
                setErr('Укажите цену для горячего предложения.');
                return;
            }
            const n = Number(vTrimmed.replace(',', '.'));
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

        const websiteNormalized = normalizeWebsite(values.website);

        const payload: EditPayload = {
            title: titleTrimmed,
            description: values.description.trim(),
            phone: values.phone.trim(),
            website: websiteNormalized,
            telegram_nickname: values.telegram_nickname.trim().replace(/^@+/, ''),
            is_sold_out: !!values.is_sold_out,
            is_hot_deal: !!values.is_hot_deal,
            hot_deal_price: values.is_hot_deal ? values.hot_deal_price.trim() : '',
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
                serverMsg = await r.text().catch(() => '');
            }

            if (!r.ok) {
                throw new Error(serverMsg || 'Проверьте поля формы.');
            }

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
        <div className="fixed inset-0 z-[10000] bg-white flex flex-col">
            <div className="h-[56px] flex items-center justify-between px-4 border-b border-gray-200">
                <div className="text-base font-medium">Редактировать кэмп</div>
                <button
                    type="button"
                    onClick={() => { if (!saving) onClose(); }}
                    className="p-1 -mr-1 text-2xl leading-none"
                    aria-label="Закрыть"
                    disabled={saving}
                >
                    ✕
                </button>
            </div>

            <form
                id="camp-edit-form"
                ref={formRef}
                onSubmit={handleSubmit}
                className="flex-1 overflow-y-auto p-4 space-y-4 pb-8"
            >
                {err && (
                    <div
                        ref={errRef}
                        className="px-4 py-2 bg-red-100 border border-red-300 text-red-800 rounded-md text-sm shadow-sm"
                    >
                        {err}
                    </div>
                )}

                <div className="px-1">
                    <div className="flex items-end min-w-0 gap-1">
                        <span className="w-36 shrink-0 text-gray-400 text-sm">Название</span>
                        <div className="flex-1 border-b border-gray-150">
                            <input
                                value={values.title}
                                onChange={(e) => {
                                    const next = e.target.value;
                                    if (next.length > TITLE_MAX) {
                                        setErr(TITLE_LEN_MSG);
                                        setValues((v) => ({ ...v, title: next.slice(0, TITLE_MAX) }));
                                    } else {
                                        setErr((prev) => (prev === TITLE_LEN_MSG ? '' : prev));
                                        setValues((v) => ({ ...v, title: next }));
                                    }
                                }}
                                onKeyDown={(e) => {
                                    const isChar = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
                                    if (!isChar) return;
                                    const el = e.currentTarget;
                                    const start = el.selectionStart ?? el.value.length;
                                    const end = el.selectionEnd ?? start;
                                    const currentLen = el.value.length - (end - start);
                                    if (currentLen >= TITLE_MAX) setErr(TITLE_LEN_MSG);
                                }}
                                onPaste={(e) => {
                                    const el = e.currentTarget;
                                    const paste = e.clipboardData.getData('text') ?? '';
                                    const start = el.selectionStart ?? el.value.length;
                                    const end = el.selectionEnd ?? start;
                                    const free = TITLE_MAX - (el.value.length - (end - start));
                                    if (paste.length > free) setErr(TITLE_LEN_MSG);
                                }}
                                className="w-full bg-transparent border-0 py-2 focus:outline-none"
                                placeholder="Например: Новогодний кэмп в горах"
                                maxLength={TITLE_MAX}
                                required
                            />
                        </div>
                    </div>
                </div>


                <div className="px-1">
                    <div className="flex items-end min-w-0 gap-1">
                        <span className="w-36 shrink-0 text-gray-400 text-sm">Телефон</span>
                        <div className="flex-1 border-b border-gray-150">
                            <input
                                value={values.phone}
                                onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
                                className="w-full bg-transparent border-0 py-2 focus:outline-none"
                                type="tel"
                                inputMode="tel"
                                autoComplete="tel"
                                pattern="\+?[0-9 ()-]+"
                                placeholder="+7 (999) 888-77-66"
                            />
                        </div>
                    </div>
                </div>

                <div className="px-1">
                    <div className="flex items-end min-w-0 gap-1">
                        <span className="w-36 shrink-0 text-gray-400 text-sm">Telegram</span>
                        <div className="flex-1 flex items-center border-b border-gray-150">
                            <span className="inline-flex items-center pr-2 text-gray-500">@</span>
                            <input
                                value={values.telegram_nickname}
                                onChange={(e) =>
                                    setValues((v) => ({
                                        ...v,
                                        telegram_nickname: e.target.value.replace(/^@+/, ''),
                                    }))
                                }
                                className="w-full bg-transparent border-0 py-2 focus:outline-none"
                                placeholder="username"
                            />
                        </div>
                    </div>
                </div>

                <div className="px-1">
                    <div className="flex items-end min-w-0 gap-1 pb-4">
                        <span className="w-36 shrink-0 text-gray-400 text-sm">Сайт</span>
                        <div className="flex-1 border-b border-gray-150">
                            <input
                                value={values.website}
                                onChange={(e) => setValues((v) => ({ ...v, website: e.target.value }))}
                                className="w-full bg-transparent border-0 py-2 focus:outline-none"
                                placeholder="https://example.com"
                            />
                        </div>
                    </div>
                </div>

                {!isWebsiteValid && values.website.trim() && (
                    <p className="text-xs text-red-600 px-1 -mt-4">
                        Некорректный сайт. Укажите ссылку целиком.
                    </p>
                )}

                <div className="space-y-4 mt-4">
                    <div className="text-gray-400 text-sm px-1">Описание</div>
                    <MobileDescriptionEditor
                        value={values.description}
                        onChange={(t) => setValues((v) => ({ ...v, description: t }))}
                        placeholder="Описание"
                    />
                </div>

                <div className="px-1 py-4 flex items-center gap-8">
                    <label className="flex items-center gap-4 select-none">
                        <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={values.is_sold_out}
                            onChange={(e) => setValues((v) => ({ ...v, is_sold_out: e.target.checked }))}
                        />
                        <span className="text-sm font-medium">Sold out</span>
                    </label>
                    <label className="flex items-center gap-2 select-none">
                        <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={values.is_hot_deal}
                            onChange={(e) =>
                                setValues((v) => ({
                                    ...v,
                                    is_hot_deal: e.target.checked,
                                    hot_deal_price: e.target.checked ? v.hot_deal_price : '',
                                }))
                            }
                        />
                        <span className="text-sm font-medium">Горящее предложение</span>
                    </label>
                </div>

                {values.is_hot_deal && (
                    <div className="px-1">
                        <div className="flex items-end min-w-0 gap-1">
                            <span className="w-36 shrink-0 text-gray-400 text-sm">Новая цена</span>
                            <div className="flex-1 flex items-center border-b border-gray-150">
                                <input
                                    inputMode="decimal"
                                    type="text"
                                    value={values.hot_deal_price}
                                    onChange={(e) => {
                                        const t = e.target.value.replace(/[^\d.,]/g, '');
                                        setValues((v) => ({ ...v, hot_deal_price: t }));
                                    }}
                                    className="w-full bg-transparent border-0 py-2 focus:outline-none"
                                    placeholder="0"
                                    aria-label="Новая цена по акции"
                                />
                                <span className="ml-2 shrink-0 text-sm text-gray-500">{currencySign}</span>
                            </div>
                        </div>
                    </div>
                )}


            </form>
            <div className="px-4 pb-6 pt-4">
                <button
                    type="submit"
                    form="camp-edit-form"
                    onClick={() => formRef.current?.requestSubmit()}
                    disabled={saving || !validation.ok || !isWebsiteValid}
                    className="h-12 w-full rounded-full bg-black text-white text-sm font-semibold disabled:opacity-60"
                >
                    {saving ? 'Сохраняем…' : 'Сохранить изменения'}
                </button>
            </div>
        </div>
    );
}
