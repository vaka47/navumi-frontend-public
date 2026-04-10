'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
// import legacy cards (more detailed blocks) — больше не используем для основной страницы
// import ClientProfile from './ClientCard';
// import ClubProfile from './ClubCard';
import ProfileIntro from '@/components/profile/ProfileIntro';
import ProfileFeedTabs, { type ProfileFeedTabsProps } from '@/components/profile/feedtabs/ProfileFeedTabs';
import ProfileHeaderCompact from '@/components/profile/ProfileHeaderCompact';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useProfile } from './ProfileContext';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';
import { acquireHideHeader, releaseHideHeader } from '@/lib/headerVisibility';
//import EditClubProfileModal from '@/components/profile/EditClubProfileModal';
//import EditClubProfileMobilePage from '@/components/profile/EditClubProfileMobilePage';
import { getBrowserApiBase } from '@/lib/apiBase';

export type Profile = {
    id: number;
    username: string;
    role: 'club' | 'client';
    profile_picture?: string | null;
    is_follower?: boolean | null;
    full_name?: string | null;
    club_name?: string | null;
    description?: string | null;
    website?: string | null;
    phone_number?: string | null;
    telegram?: string | null;
    instagram?: string | null;
    camps?: {
        id: number;
        camp_number: number;
        title: string;
        title_image?: string | null;
        location_name: string;
        start_date: string;
        end_date: string;
        price: number | string;
        currency: string;
        is_sold_out: boolean;
        is_hot_deal: boolean;
        hot_deal_price?: number | string | null;
    }[];
};

type ProfileTabKey = NonNullable<ProfileFeedTabsProps['initialTab']>;
const PROFILE_TAB_VALUES: ProfileTabKey[] = ['camps', 'posts', 'articles', 'marks', 'saved'];

const isProfileTabKey = (value: string): value is ProfileTabKey =>
    PROFILE_TAB_VALUES.includes(value as ProfileTabKey);

type UserProfilePageProps = {
    initialProfile?: Profile | null;
};

export default function UserProfilePage({ initialProfile }: UserProfilePageProps) {
    const { username } = useProfile();
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const overlayEnv = useOverlayEnvironment();
    const [profile, setProfile] = useState<Profile | null>(initialProfile ?? null);
    const [error, setError] = useState<string | null>(null);
    const [currentUser, setCurrentUser] = useState<string | null>(null);
    const [isOwnerServer, setIsOwnerServer] = useState<boolean | null>(null);
    const [reloadDetected, setReloadDetected] = useState(false);

    //const [open, setOpen] = useState(false);
    //const isMobile = useIsMobile();
    //const [editMeta, setEditMeta] = useState<{can?: boolean|null, next?: string|null}>({can: null, next: null});


    const API_BASE = getBrowserApiBase();

    // Опциональное редактирование оставлено через глобальный Header/меню

    // ВАЖНО: не добавляем Date.now() к URL аватара — каждая уникальная строка
    // вызывает новый Image Optimization transform на Vercel.
    // Возвращаем исходный URL как есть; если нужен бест — делайте стабильную версию
    // по признаку обновления (например, updated_at -> v=123) на бэке.
    const withBustIfSafe = (u: string | null | undefined) => (u ?? null);

    const lastUsernameRef = useRef<string | null>(null);

    // Сбрасываем состояние при смене username, чтобы не мигал старый профиль
    useEffect(() => {
        if (lastUsernameRef.current && lastUsernameRef.current !== username) {
            setProfile(null);
            setError(null);
            setIsOwnerServer(null);
        }
        lastUsernameRef.current = username;
    }, [username]);

    useEffect(() => {
        if (initialProfile && initialProfile.username === username) {
            setProfile(initialProfile);
        }
    }, [initialProfile, username]);

    // подтянем флаг is_owner с сервера (как на страницах кэмпа). Хук должен быть до ранних return
    useEffect(() => {
        const api = API_BASE || '';
        if (!api || !username) return;
        let cancelled = false;
        (async () => {
            try {
                const url = `${api}/api/profile/${username}/follow-stats/`;
                const tryFetch = async (cred: RequestCredentials) => fetch(url, { credentials: cred, cache: 'no-store' });
                let r: Response | null = null;
                try {
                    r = await tryFetch('include');
                    if (!r.ok && (r.status === 401 || r.status === 403)) throw new Error('auth');
                } catch {
                    try { r = await tryFetch('omit'); } catch { /* noop */ }
                }
                if (!r || !r.ok) return;
                const j: unknown = await r.json().catch(() => ({}));
                const s = (j as { is_owner?: boolean }) || {};
                const is_owner = Boolean(s.is_owner);
                if (!cancelled) setIsOwnerServer(is_owner);
            } catch { /* noop */ }
        })();
        return () => { cancelled = true; };
    }, [API_BASE, username]);

    // Доп. страховка: скрываем ТОЛЬКО глобальный header через класс body.hide-header
    // (правило в globals.css таргетит header.app-global-header, наш кастомный header не трогаем),
    // и одновременно обнуляем --header-h, чтобы убрать верхний padding от layout'а профиля.
    // В оверлеях профиля (ProfileOverlayShell) НЕ трогаем глобальный header/--header-h,
    // чтобы не ломать layout базовой страницы (поиск, лента и т.п.) под стеком оверлеев.
    useEffect(() => {
        if (overlayEnv.isOverlay) {
            try {
                console.info('[UserProfilePage][header]', {
                    overlay: true,
                    action: 'skip-hide-header',
                    pathname,
                });
            } catch { /* noop */ }
            return;
        }
        acquireHideHeader();
        const root = document.documentElement;
        const prevHeaderH = root.style.getPropertyValue('--header-h');
        root.style.setProperty('--header-h', '0px');
        try {
            console.info('[UserProfilePage][header]', {
                overlay: false,
                action: 'set',
                prevHeaderH,
                nextHeaderH: '0px',
                pathname,
            });
        } catch { /* noop */ }
        return () => {
            releaseHideHeader();
            if (prevHeaderH) {
                root.style.setProperty('--header-h', prevHeaderH);
            } else {
                root.style.removeProperty('--header-h');
            }
            try {
                console.info('[UserProfilePage][header]', {
                    overlay: false,
                    action: 'restore',
                    restoredHeaderH: prevHeaderH || null,
                    pathname,
                });
            } catch { /* noop */ }
        };
    }, [overlayEnv.isOverlay, pathname]);
    const searchParamsString = searchParams?.toString() || '';
    const fromBlocked = (() => {
        const raw = (searchParams?.get('from_blocked') || searchParams?.get('fromBlocked') || '').toLowerCase();
        return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
    })();

    const loadProfile = useCallback(
        async (uname: string, isCancelled?: () => boolean) => {
            const url = `${API_BASE}/api/profile/${uname}/${fromBlocked ? '?from_blocked=1' : ''}`; // стабильный URL без bust-параметров
            const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
            if (!res.ok) {
                if (res.status === 404 || res.status === 403) {
                    throw new Error(fromBlocked ? 'Не удалось загрузить профиль' : 'Профиль недоступен');
                }
                throw new Error('Профиль не найден');
            }
            const data: Profile = await res.json();

            if (isCancelled?.()) return;

            setProfile({
                ...data,
                // только для НЕ подписанных ссылок добавим cache-bust
                profile_picture: withBustIfSafe(data.profile_picture || null),
            });
        },
        [API_BASE, fromBlocked]
    );

    useEffect(() => {
        let cancelled = false;
        const isCancelled = () => cancelled;

        (async () => {
            try {
                const me = await fetch(`${API_BASE}/api/check-auth/`, { credentials: 'include', cache: 'no-store' });
                const meData = await me.json().catch(() => ({}));
                // как в CampInfo: берём username из profile
                const u = meData?.profile?.username ?? meData?.username;
                if (!isCancelled()) {
                    if (me.ok) setCurrentUser(typeof u === 'string' ? u : null);
                    else setCurrentUser(null);
                }
            } catch {
                if (!isCancelled()) setCurrentUser(null);
            }

            try {
                if (username) {            // важно: защита от undefined
                    await loadProfile(username, isCancelled);
                }
            } catch (err) {
                if (!isCancelled()) {
                    setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [username, API_BASE, loadProfile]); // добавили loadProfile в deps
    const tabSource = searchParams?.get('tab_source') || null;

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const entries = performance?.getEntriesByType?.('navigation') as PerformanceNavigationTiming[] | undefined;
            const last = entries?.[entries.length - 1];
            if (last?.type === 'reload') {
                setReloadDetected(true);
            }
        } catch { setReloadDetected(false); }
    }, []);
    const tabFromQuery = (() => {
        const raw = searchParams?.get('tab');
        if (!raw) return undefined;
        const normalized = raw.toLowerCase();
        return isProfileTabKey(normalized) ? normalized : undefined;
    })();

    const defaultTabForRole: ProfileTabKey | null = profile ? (profile.role === 'club' ? 'camps' : 'posts') : null;

    useEffect(() => {
        if (!profile || !defaultTabForRole) {
            if (reloadDetected) setReloadDetected(false);
            return;
        }

        const params = new URLSearchParams(searchParamsString);
        const rawTab = params.get('tab');
        const hasValidTab = rawTab ? isProfileTabKey(rawTab) : false;
        const shouldForceDefault = tabSource === 'nav' || reloadDetected;
        const nextTab: ProfileTabKey = (shouldForceDefault || !hasValidTab)
            ? defaultTabForRole
            : (rawTab as ProfileTabKey);

        let changed = false;
        if (params.get('tab') !== nextTab) {
            params.set('tab', nextTab);
            changed = true;
        }
        if (tabSource) {
            params.delete('tab_source');
            changed = true;
        }

        if (overlayEnv.isOverlay) {
            // В режиме оверлея не трогаем глобальный URL (window.history),
            // чтобы не перетирать tab у базовой страницы поиска.
            if (reloadDetected) {
                setReloadDetected(false);
            }
            return;
        }

        if (changed) {
            const qs = params.toString();
            const nextHref = qs ? `${pathname}?${qs}` : pathname;
            router.replace(nextHref, { scroll: false });
        }

        if (reloadDetected) {
            setReloadDetected(false);
        }
    }, [profile, defaultTabForRole, tabSource, reloadDetected, router, pathname, searchParamsString, overlayEnv.isOverlay]);


    if (error) {
        return (
            <div className="max-w-xl mx-auto mt-10">
                <Alert variant="destructive">
                    <AlertTitle>Ошибка</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            </div>
        );
    }


    if (!profile) {
        return (
            <div className="max-w-xl mx-auto mt-10 space-y-4">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-64 rounded-xl" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
            </div>
        );
    }

    // надёжное определение владельца: флаг с сервера или сравнение username
    const isOwner = (isOwnerServer === true)
        || ((currentUser ?? '').toLowerCase() === (profile.username ?? '').toLowerCase());

    





    return (
        <div className="min-h-screen bg-white" data-profile-page>
            <ProfileHeaderCompact
                username={profile.username}
                isOwner={isOwner}
                isFollower={profile.is_follower ?? null}
            />
            <ProfileIntro profile={profile} isOwner={isOwner} />

            <div
                className="max-w-4xl mx-auto px-0 sm:px-4 pb-8"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + var(--bottom-gap, 120px))' }}
            >
                <ProfileFeedTabs
                    username={profile.username}
                    role={profile.role}
                    isOwner={isOwner}
                    initialTab={tabFromQuery || defaultTabForRole || undefined}
                    profileAvatarUrl={profile.profile_picture || null}
                    initialCamps={profile.camps || null}
                />
            </div>
        </div>
    );
}
