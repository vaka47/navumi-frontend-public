'use client';

import { useRef, useState, useEffect, useMemo, useCallback, type Dispatch, type SetStateAction } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import SearchFilters from '@/components/search/SearchFilters';
import SearchFeedTabs from '@/components/search/SearchFeedTabs';
import { DEFAULT_PHOTO_SEARCH_RADIUS_KM, normalizePhotosTabValue, PHOTO_SEARCH_TAB_PARAM } from '@/lib/photoSearchParams';
//import type { Activity, Hashtag } from './types';
import { useLoadScript, type Libraries } from '@react-google-maps/api';
import { useLayerStack } from '@/context/LayerStackContext';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';
import { getBrowserApiBase } from '@/lib/apiBase';

interface Activity {
    id: number;
    name: string;
}

interface Hashtag {
    id: number;
    name: string;
}

// Keep libraries array stable to avoid reloading LoadScript
const GOOGLE_LIBRARIES: Libraries = ['places'];
// Базовый API: прод из env, иначе прокси внутри фронта
const API_BASE = getBrowserApiBase();

const AUTO_APPLY_DELAY_MS = 350;
const DEBUG_SEARCH_QUERY =
    process.env.NODE_ENV !== 'production' ||
    ((process.env.NEXT_PUBLIC_ENABLE_PHOTO_DEBUG ?? '1').toLowerCase() !== '0');

const dbg = (...args: unknown[]) => {
    if (!DEBUG_SEARCH_QUERY) return;
    try {
        if (typeof window !== 'undefined') console.info('[SearchPage]', ...args);
    } catch {
        /* noop */
    }
};

const isTruthyParam = (value?: string | null) => {
    return ['1', 'true', 'on'].includes((value || '').toLowerCase());
};

const canonicalizeQueryString = (value: string) => {
    if (!value) return '';
    const params = new URLSearchParams(value);
    const pairs: Array<[string, string]> = [];
    params.forEach((val, key) => {
        pairs.push([key, val]);
    });
    pairs.sort((a, b) => {
        if (a[0] === b[0]) return a[1].localeCompare(b[1]);
        return a[0].localeCompare(b[0]);
    });
    return pairs.map(([key, val]) => `${key}=${val}`).join('&');
};

export default function SearchPage() {
    const router = useRouter();
    const pathname = usePathname();
    const sp = useSearchParams();
    const { screens } = useLayerStack();
    const overlayEnv = useOverlayEnvironment();
    const [layoutEpoch, setLayoutEpoch] = useState(0);
    const scrollAreaRef = useRef<HTMLDivElement | null>(null);
    const handleStartDateChange = (dateStr: string) => {
        setStartDate(dateStr);
        if (dateStr && endDate && new Date(dateStr) >= new Date(endDate)) {
            setEndDate('');
        }
    };

    const [searchQuery, setSearchQuery] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [location, setLocationValue] = useState('');
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    const [locationConfirmed, setLocationConfirmed] = useState('');
    const [manualLocationSnapshot, setManualLocationSnapshot] = useState('');
    const [pendingManualSearch, setPendingManualSearch] = useState(false);
    // Флаг «пользователь печатает» для защиты от перетирания ввода при синхронизации из URL
    const searchTypingRef = useRef<{ active: boolean; t: number } | null>(null);
    const searchTypingTimerRef = useRef<number | null>(null);
    const userSetSearchQuery = useCallback((value: string) => {
        setSearchQuery(value);
        const now = Date.now();
        searchTypingRef.current = { active: true, t: now };
        if (searchTypingTimerRef.current != null) {
            try { window.clearTimeout(searchTypingTimerRef.current); } catch { }
        }
        searchTypingTimerRef.current = window.setTimeout(() => {
            searchTypingRef.current = { active: false, t: now };
            searchTypingTimerRef.current = null;
        }, 1000);
    }, []);

    const handleLocationChange = useCallback((value: string, opts?: { confirmed?: boolean }) => {
        setLocationValue(value);
        const trimmed = value.trim();
        if (opts?.confirmed) {
            setLocationConfirmed(trimmed);
            setManualLocationSnapshot('');
            return;
        }
        if (locationConfirmed && trimmed !== locationConfirmed) {
            setLocationConfirmed('');
            if (latitude) setLatitude('');
            if (longitude) setLongitude('');
        }
        if (manualLocationSnapshot && trimmed !== manualLocationSnapshot) {
            setManualLocationSnapshot('');
        }
    }, [latitude, longitude, locationConfirmed, manualLocationSnapshot]);

    const [activities, setActivities] = useState<Activity[]>([]);
    const [hashtags, setHashtags] = useState<Hashtag[]>([]);
    const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
    const [selectedHashtags, setSelectedHashtags] = useState<string[]>([]);
    const [onlyKids, setOnlyKids] = useState(false);
    const [withCoach, setWithCoach] = useState(false);
    const [excludeSoldOut, setExcludeSoldOut] = useState(false);
    const [hotOffers, setHotOffers] = useState(false);
    const [hydrationReady, setHydrationReady] = useState(false);



    const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

    const { isLoaded } = useLoadScript({
        googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
        libraries: GOOGLE_LIBRARIES,
    });

    useEffect(() => {
        // лог для диагностики базового адреса API
        try { console.info('[SearchPage] API_BASE =', API_BASE); } catch { }
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

        const loadList = async <T,>(path: string, setter: Dispatch<SetStateAction<T[]>>, label: string) => {
            try {
                const resp = await fetch(`${API_BASE}${path}`, {
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
    }, []);

    const [shouldResetOnHydrate, setShouldResetOnHydrate] = useState(false);
    const qsString = sp?.toString() || '';
    const rawTab = sp?.get('tab') || '';
    const currentSortParam = (sp?.get('sort') || '').trim();

    // Текущая вкладка поиска:
    //  1) сначала пробуем URL (?tab=...),
    //  2) если там пусто — берём последнюю сохранённую вкладку из sessionStorage,
    //     чтобы при возврате из глубоких оверлеев вернуться на ту же вкладку (в т.ч. "карта").
    const currentTab = useMemo(() => {
        const fromUrl = normalizePhotosTabValue(rawTab);

        // В оверлее поиска всегда доверяем явному ?tab=... из локального
        // SearchParamsContext. Это гарантирует, что:
        //   - клик по локации открывает таб "map",
        //   - клик по активности/тегу — таб "camps",
        // независимо от того, какая вкладка была сохранена в sessionStorage.
        if (overlayEnv.isOverlay) {
            if (fromUrl) return fromUrl;
            if (typeof window === 'undefined') return '';
            try {
                const stored = window.sessionStorage.getItem('search:last-tab') || '';
                return normalizePhotosTabValue(stored);
            } catch {
                return '';
            }
        }

        // На базовой странице поиска сначала читаем tab из URL,
        // а если его нет — восстанавливаем последнюю вкладку из sessionStorage.
        if (fromUrl) return fromUrl;
        if (typeof window === 'undefined') return '';
        try {
            const stored = window.sessionStorage.getItem('search:last-tab') || '';
            return normalizePhotosTabValue(stored);
        } catch {
            return '';
        }
    }, [rawTab, overlayEnv.isOverlay]);

    // Как только определили валидную вкладку — запоминаем её,
    // чтобы последующие заходы на поиск (или потеря ?tab=) восстанавливали тот же таб.
    // В оверлее поиска состояние вкладок не должно переписывать
    // глобальную «последнюю вкладку» базовой страницы поиска.
    useEffect(() => {
        if (!currentTab) return;
        if (overlayEnv.isOverlay) return;
        if (typeof window === 'undefined') return;
        try {
            window.sessionStorage.setItem('search:last-tab', currentTab);
        } catch {
            // noop
        }
    }, [currentTab, overlayEnv.isOverlay]);

    // Любое изменение стека экранов или режима оверлея заставляет
    // SearchFilters и SearchFeedTabs переизмерить layout (CSS‑переменные).
    useEffect(() => {
        setLayoutEpoch((v) => v + 1);
    }, [screens.length, overlayEnv.isOverlay]);
    useEffect(() => {
        dbg('url-change', { qsString });
    }, [qsString]);

    // Hydrate form state from URL so the form doesn't clear after search
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const entries = performance?.getEntriesByType?.('navigation') as PerformanceNavigationTiming[] | undefined;
            const entry = entries?.[entries.length - 1];
            const storageKey = 'search:last-nav-entry';
            const currentKey = entry ? `${entry.type}:${entry.startTime}` : '';
            const prevKey = sessionStorage.getItem(storageKey);
            if (entry) sessionStorage.setItem(storageKey, currentKey);
            const isFreshReload = entry?.type === 'reload' && currentKey !== prevKey;
            setShouldResetOnHydrate(!!isFreshReload);
        } catch {
            setShouldResetOnHydrate(false);
        }
    }, []);

    useEffect(() => {
        if (shouldResetOnHydrate) {
            setSearchQuery('');
            setStartDate('');
            setEndDate('');
            setLocationValue('');
            setLatitude('');
            setLongitude('');
            setLocationConfirmed('');
            setManualLocationSnapshot('');
            setSelectedActivities([]);
            setSelectedHashtags([]);
            setOnlyKids(false);
            setWithCoach(false);
            setExcludeSoldOut(false);
            setHotOffers(false);
            router.replace(pathname, { scroll: false });
            setHydrationReady(true);
            setShouldResetOnHydrate(false);
            return;
        }

        const p = new URLSearchParams(sp?.toString() || '');
        const q = p.get('query') || '';
        const sd = p.get('start_date') || '';
        const ed = p.get('end_date') || '';
        const hasLoc = p.has('location');
        const loc = (hasLoc ? (p.get('location') || '') : '');
        const hasLat = p.has('latitude');
        const hasLng = p.has('longitude');
        const lat = hasLat ? (p.get('latitude') || '') : '';
        const lng = hasLng ? (p.get('longitude') || '') : '';
        const acts = p.getAll('activities');
        const tags = p.getAll('hashtags');
        // Не перетираем поле, если пользователь активно печатает
        if (!(searchTypingRef.current?.active)) {
            setSearchQuery(q);
        }
        setStartDate(sd);
        setEndDate(ed);
        // Do not overwrite manual typing from URL unless URL explicitly has location.
        if (hasLoc || !hydrationReady) {
            setLocationValue(loc);
        }
        if ((hasLat && hasLng) || !hydrationReady) {
            setLatitude(lat);
            setLongitude(lng);
        }
        if (hasLoc) {
            if (lat && lng && loc) {
                setLocationConfirmed(loc.trim());
                setManualLocationSnapshot('');
            } else if (loc) {
                setManualLocationSnapshot(loc.trim());
                setLocationConfirmed('');
            } else {
                setLocationConfirmed('');
                setManualLocationSnapshot('');
            }
        }
        setSelectedActivities(acts.length ? acts : []);
        setSelectedHashtags(tags.length ? tags : []);
        setOnlyKids(isTruthyParam(p.get('is_kids_camp')));
        setWithCoach(isTruthyParam(p.get('has_kids_coach')));
        setExcludeSoldOut(isTruthyParam(p.get('exclude_sold_out')));
        setHotOffers(isTruthyParam(p.get('hot_deals')));
        setHydrationReady(true);
    }, [sp, shouldResetOnHydrate, router, pathname, hydrationReady]);

    useEffect(() => {
        if (location) return;
        if (latitude || longitude) {
            setLatitude('');
            setLongitude('');
        }
    }, [location, latitude, longitude]);

    const filtersApplied = useMemo(() => {
        const hasQuery = searchQuery.trim().length > 0;
        const hasDates = Boolean(startDate || endDate);
        const hasLocation = location.trim().length > 0;
        const hasCoords = Boolean(latitude && longitude);
        const hasActivities = selectedActivities.some(Boolean);
        const hasHashtags = selectedHashtags.some(Boolean);
        const hasFlags = onlyKids || withCoach || excludeSoldOut || hotOffers;
        return hasQuery || hasDates || hasLocation || hasCoords || hasActivities || hasHashtags || hasFlags;
    }, [
        searchQuery,
        startDate,
        endDate,
        location,
        latitude,
        longitude,
        selectedActivities,
        selectedHashtags,
        onlyKids,
        withCoach,
        excludeSoldOut,
        hotOffers,
    ]);

    const computedQuery = useMemo(() => {
        const params = new URLSearchParams();
        const tabParamValue = currentTab === 'photos'
            ? PHOTO_SEARCH_TAB_PARAM
            : (currentTab || '');
        if (tabParamValue) params.set('tab', tabParamValue);
        const hasCoords = Boolean(latitude && longitude);
        const managedSorts = new Set(['author_popularity', 'recent_author_popularity']);
        const shouldAutoSort =
            (currentTab === 'photos' || currentTab === 'articles') && (!currentSortParam || managedSorts.has(currentSortParam));
        const appliedSort = shouldAutoSort
            ? (filtersApplied ? 'recent_author_popularity' : 'author_popularity')
            : currentSortParam;
        if (appliedSort) params.set('sort', appliedSort);
        if (searchQuery.trim()) params.append('query', searchQuery.trim());
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        const trimmedLocation = location.trim();
        const allowManualLocation = Boolean(
            manualLocationSnapshot && trimmedLocation && manualLocationSnapshot === trimmedLocation
        );
        if (trimmedLocation && (hasCoords || allowManualLocation)) {
            params.append('location', trimmedLocation);
            if (hasCoords) {
                params.append('latitude', latitude);
                params.append('longitude', longitude);
                params.append('radius_km', DEFAULT_PHOTO_SEARCH_RADIUS_KM.toString());
            }
        }
        selectedActivities.filter(Boolean).forEach((id) => params.append('activities', id));
        selectedHashtags.filter(Boolean).forEach((id) => params.append('hashtags', id));
        if (onlyKids) params.append('is_kids_camp', 'on');
        if (withCoach) params.append('has_kids_coach', 'on');
        if (excludeSoldOut) params.append('exclude_sold_out', 'on');
        if (hotOffers) params.append('hot_deals', '1');
        if (DEBUG_SEARCH_QUERY) {
            dbg('compute-query', {
                tab: currentTab,
                sort: appliedSort,
                searchQuery,
                startDate,
                endDate,
                location,
                latitude,
                longitude,
                radius: latitude && longitude ? DEFAULT_PHOTO_SEARCH_RADIUS_KM.toString() : null,
                activities: selectedActivities,
                hashtags: selectedHashtags,
                onlyKids,
                withCoach,
                excludeSoldOut,
                hotOffers,
                filtersApplied,
                sortSource: shouldAutoSort ? 'auto' : 'manual',
                qs: params.toString(),
            });
        }
        return params.toString();
    }, [
        currentTab,
        currentSortParam,
        filtersApplied,
        searchQuery,
        startDate,
        endDate,
        location,
        latitude,
        longitude,
        selectedActivities,
        selectedHashtags,
        onlyKids,
        withCoach,
        excludeSoldOut,
        hotOffers,
        manualLocationSnapshot,
    ]);

    const canonicalComputed = useMemo(() => canonicalizeQueryString(computedQuery), [computedQuery]);
    const canonicalCurrent = useMemo(() => canonicalizeQueryString(qsString), [qsString]);

    const applyQuery = useCallback((query: string) => {
        const nextUrl = query ? `${pathname}?${query}` : pathname;
        dbg('apply-query', { pathname, query, nextUrl });
        router.replace(nextUrl, { scroll: false });
    }, [pathname, router]);

    const runSearchNow = useCallback(() => {
        if (!hydrationReady) {
            dbg('run-search-now/skip', { reason: 'hydration' });
            return;
        }
        if (canonicalComputed === canonicalCurrent) {
            dbg('run-search-now/skip', { reason: 'same-query' });
            return;
        }
        dbg('run-search-now', { canonicalComputed, canonicalCurrent });
        applyQuery(computedQuery);
    }, [hydrationReady, canonicalComputed, canonicalCurrent, applyQuery, computedQuery]);

    const handleManualSearch = useCallback(() => {
        const trimmedLocation = location.trim();
        const hasCoords = Boolean(latitude && longitude);
        if (!hasCoords && trimmedLocation && manualLocationSnapshot !== trimmedLocation) {
            setManualLocationSnapshot(trimmedLocation);
            setPendingManualSearch(true);
            return;
        }
        runSearchNow();
    }, [location, latitude, longitude, manualLocationSnapshot, runSearchNow]);

    useEffect(() => {
        if (!pendingManualSearch) return;
        setPendingManualSearch(false);
        runSearchNow();
    }, [pendingManualSearch, runSearchNow]);

    // Очистка таймера при размонтировании
    useEffect(() => () => {
        if (searchTypingTimerRef.current != null) {
            try { window.clearTimeout(searchTypingTimerRef.current); } catch { }
        }
    }, []);

    useEffect(() => {
        if (!hydrationReady) return;
        if (overlayEnv.isOverlay) return;
        if (canonicalComputed === canonicalCurrent) return;
        dbg('auto-apply/schedule', { delay: AUTO_APPLY_DELAY_MS, canonicalComputed, canonicalCurrent });
        const timer = window.setTimeout(() => {
            dbg('auto-apply/run', { canonicalComputed, canonicalCurrent });
            applyQuery(computedQuery);
        }, AUTO_APPLY_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [hydrationReady, overlayEnv.isOverlay, canonicalComputed, canonicalCurrent, applyQuery, computedQuery]);

    // Страховка: после любых изменений стека экранов (оверлеи кэмпа/профиля/поста)
    // пересчитываем фактическую высоту глобального Header и обновляем --header-h.
    // В оверлее поиска эту переменную НЕ трогаем, чтобы не ломать базовые страницы под стеком.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (overlayEnv.isOverlay) {
            try {
                console.info('[SearchPage][header-sync] skip in overlay', {
                    screensCount: screens.length,
                });
            } catch { /* noop */ }
            return;
        }
        const root = document.documentElement;
        const header = document.querySelector<HTMLElement>('header.app-global-header');
        if (!header) return;
        const h = header.getBoundingClientRect().height || 64;
        root.style.setProperty('--header-h', `${Math.ceil(h)}px`);
        try {
            console.info('[SearchPage][header-sync]', {
                headerH: `${Math.ceil(h)}px`,
                screensCount: screens.length,
                isOverlay: overlayEnv.isOverlay,
            });
        } catch { /* noop */ }
    }, [screens.length, overlayEnv.isOverlay]);

    // Дополнительная страховка: синхронизируем --bottom-gap с реальной высотой глобального BottomNav.
    // Это помогает, если какие‑то оверлеи или внутренние панели временно перезаписали переменную.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const root = document.documentElement;
        const nav = document.querySelector<HTMLElement>('nav[data-bottom-nav="true"]');
        if (!nav) return;
        const h = nav.getBoundingClientRect().height || 0;
        root.style.setProperty('--bottom-gap', `${Math.ceil(h)}px`);
        try {
            console.info('[SearchPage][bottom-gap-sync]', {
                bottomGap: `${Math.ceil(h)}px`,
                screensCount: screens.length,
            });
        } catch { /* noop */ }
    }, [screens.length]);


    //const handleReset = () => {
    //    setSearchQuery('');
    //    setStartDate('');
    //    setEndDate('');
    //    setLocation('');
    //    setLatitude('');
    //    setLongitude('');
    //    setSelectedActivities([]);
    //    setSelectedHashtags([]);
    //};

    // Collapsed/expanded summary state.
    // По умолчанию уважаем явный ?collapsed=1, чтобы
    // начальная разметка (в том числе высота карты на табе "карта")
    // сразу соответствовала компактному состоянию формы.
    const collapsedFromUrl = (sp?.get('collapsed') || '') === '1';
    const [collapsed, setCollapsed] = useState(collapsedFromUrl);
    const [collapseLocked, setCollapseLocked] = useState(false);
    const lastCollapseAtRef = useRef<number>(0);

    // Respect explicit request to show compact view
    useEffect(() => {
        if (collapsedFromUrl) setCollapsed(true);
    }, [collapsedFromUrl]);

    // Derive summary text from current URL params
    const summaryText = (() => {
        const p = new URLSearchParams(sp?.toString() || '');
        const parts: string[] = [];
        const sd = p.get('start_date');
        const ed = p.get('end_date');
        const fmt = (s?: string | null) => {
            if (!s) return '';
            try { const d = new Date(s); const dd = String(d.getDate()).padStart(2, '0'); const mm = String(d.getMonth() + 1).padStart(2, '0'); return `${dd}.${mm}`; } catch { return s; }
        };
        if (sd && ed) parts.push(`${fmt(sd)} - ${fmt(ed)}`);
        else if (sd && !ed) parts.push(`с ${fmt(sd)}`);
        else if (!sd && ed) parts.push(`до ${fmt(ed)}`);

        const loc = (p.get('location') || '').split(',')[0]?.trim();
        if (loc) parts.push(loc);

        const filtersCount = p.getAll('activities').length + p.getAll('hashtags').length;
        if (filtersCount > 0) parts.push(`${filtersCount} фильтров`);

        const flags: string[] = [];
        if (['1', 'true', 'on'].includes((p.get('is_kids_camp') || '').toLowerCase())) flags.push('детский кэмп');
        if (['1', 'true', 'on'].includes((p.get('has_kids_coach') || '').toLowerCase())) flags.push('с детским тренером');
        if (['1', 'true', 'on'].includes((p.get('hot_deals') || '').toLowerCase())) flags.push('hot price');
        if (['1', 'true', 'on'].includes((p.get('exclude_sold_out') || '').toLowerCase())) flags.push('no sold out');
        if (flags.length) parts.push(flags.join(', '));

        const q = p.get('query');
        if (q) parts.push(q);
        return parts.join('; ');
    })();

    // Do not auto-collapse on initial open — collapse only after user action (search/scroll).

    // Collapse on scroll down, expand when scrolled to very top (if user didn't open filters)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 768;
        const scrollRoot = (scrollAreaRef.current
            || document.querySelector<HTMLElement>('[data-search-scroll]')
            || document.querySelector<HTMLElement>('[data-scroll-root]')
            || window) as HTMLElement | Window;
        let ticking = false;
        let rafId: number | null = null;
        const readScrollTop = () => {
            if (scrollRoot === window) {
                return window.scrollY || document.documentElement.scrollTop || 0;
            }
            return (scrollRoot as HTMLElement).scrollTop || 0;
        };
        const onScroll = () => {
            if (ticking) return; ticking = true;
            rafId = requestAnimationFrame(() => {
                const y = readScrollTop();
                const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
                    ? performance.now()
                    : Date.now();
                if (y > 60 && !collapsed) {
                    try { console.debug('[SearchPage][scroll] collapse at', y); } catch { }
                    setCollapseLocked(true);
                    setCollapsed(true);
                    lastCollapseAtRef.current = now;
                }
                // if user didn't force collapsed mode via URL, allow expand back at very top
                const userForced = (sp?.get('collapsed') || '') === '1';
                const recentlyCollapsed = lastCollapseAtRef.current > 0
                    ? (now - lastCollapseAtRef.current) < 220
                    : false;
                if (!recentlyCollapsed && y < 10 && collapsed && !userForced) {
                    const rootEl = scrollRoot === window
                        ? document.documentElement
                        : (scrollRoot as HTMLElement);
                    const scrollable = rootEl
                        ? ((rootEl.scrollHeight - rootEl.clientHeight) > 8)
                        : true;
                    // Mobile camps tab: when collapsing makes the list taller than its content, scrollTop snaps to 0 and bounces the form open.
                    const mobileCampsNoOverflow = isMobile() && currentTab === 'camps' && !scrollable;
                    if (!mobileCampsNoOverflow) {
                        try { console.debug('[SearchPage][scroll] expand at', y); } catch { }
                        setCollapseLocked(false);
                        setCollapsed(false);
                        lastCollapseAtRef.current = 0;
                    }
                }
                ticking = false;
            });
        };
        scrollRoot.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            if (rafId) cancelAnimationFrame(rafId);
            scrollRoot.removeEventListener('scroll', onScroll);
        };
    }, [collapsed, collapseLocked, currentTab, sp]);

    // Desktop-only: on Camps tab, if user валится в самый верх и крутит дальше вверх — раскрываем форму
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (currentTab !== 'camps') return;
        const isDesktop = () => typeof window !== 'undefined' && window.innerWidth >= 768;
        if (!isDesktop()) return;
        const scrollRoot = (scrollAreaRef.current
            || document.querySelector<HTMLElement>('[data-search-scroll]')
            || document.querySelector<HTMLElement>('[data-scroll-root]')
            || window) as HTMLElement | Window;
        const readScrollTop = () => {
            if (scrollRoot === window) {
                return window.scrollY || document.documentElement.scrollTop || 0;
            }
            return (scrollRoot as HTMLElement).scrollTop || 0;
        };
        const onWheel = (ev: Event) => {
            const e = ev as WheelEvent;
            if (!isDesktop()) return;
            const userForced = (sp?.get('collapsed') || '') === '1';
            if (collapsed && !userForced && readScrollTop() <= 0 && e.deltaY < -2) {
                setCollapseLocked(false);
                setCollapsed(false);
                lastCollapseAtRef.current = 0;
            }
        };
        scrollRoot.addEventListener('wheel', onWheel, { passive: true });
        return () => scrollRoot.removeEventListener('wheel', onWheel);
    }, [collapsed, currentTab, sp]);

    // No header hiding anymore — we keep header always visible

    useEffect(() => {
        try {
            const root = document.documentElement;
            const headerH = getComputedStyle(root).getPropertyValue('--header-h').trim();
            const bottomGap = getComputedStyle(root).getPropertyValue('--bottom-gap').trim();
            const topOffset = getComputedStyle(root).getPropertyValue('--search-top-offset').trim();
            const firstRowH = getComputedStyle(root).getPropertyValue('--search-first-row-h').trim();
            const formH = getComputedStyle(root).getPropertyValue('--search-form-h').trim();
            const main = document.querySelector<HTMLElement>('[data-scroll-root]');
            const mainH = main?.clientHeight;
            const mainSH = main?.scrollHeight;
            const mainOverflow = main ? getComputedStyle(main).overflowY : 'n/a';
            console.info('[SearchPage][layout]', { headerH, bottomGap, topOffset, firstRowH, formH, mainH, mainSH, mainOverflow });
        } catch (e) {
            try { console.warn('[SearchPage][layout][err]', e); } catch { }
        }
    });

    useEffect(() => {
        const root = document.querySelector<HTMLElement>('[data-scroll-root]') || window;
        let logged = false;
        const handler = () => {
            const y = root === window
                ? (window.scrollY || document.documentElement.scrollTop || 0)
                : (root as HTMLElement).scrollTop;
            if (y > 0 && !logged) {
                logged = true;
                try { console.warn('[SearchPage][scroll-detected]', { y }); } catch { }
            }
        };
        root.addEventListener('scroll', handler, { passive: true });
        return () => root.removeEventListener('scroll', handler);
    }, []);

    // Для страницы поиска блокируем вертикальный скролл у основного контейнера
    useEffect(() => {
        const main = document.querySelector<HTMLElement>('[data-scroll-root]');
        if (!main) return;
        const prevOverflow = main.style.overflowY;
        const prevHeight = main.style.height;
        const root = document.documentElement;
        const body = document.body;
        const prevRootOverflow = root.style.overflowY;
        const prevBodyOverflow = body.style.overflowY;
        const prevRootOverscroll = root.style.overscrollBehaviorY;
        const targetHeight = 'calc(100dvh - var(--header-h, 64px) - var(--bottom-gap, 0px))';
        main.style.overflowY = 'hidden';
        main.style.height = targetHeight;
        root.style.overflowY = 'hidden';
        root.style.overscrollBehaviorY = 'contain';
        body.style.overflowY = 'hidden';
        try {
            console.info('[SearchPage][lock-scroll-root]', {
                appliedHeight: targetHeight,
                clientHeight: main.clientHeight,
                scrollHeight: main.scrollHeight,
                paddingTop: getComputedStyle(main).paddingTop,
            });
        } catch { }
        return () => {
            main.style.overflowY = prevOverflow;
            main.style.height = prevHeight;
            root.style.overflowY = prevRootOverflow;
            root.style.overscrollBehaviorY = prevRootOverscroll;
            body.style.overflowY = prevBodyOverflow;
        };
    }, []);
    return (
        <div
            data-search-page-root
            className="flex flex-col w-full h-full overflow-hidden"
            style={{
                height: 'calc(100dvh - var(--header-h, 64px) - var(--bottom-gap, 0px))',
                maxHeight: 'calc(100dvh - var(--header-h, 64px) - var(--bottom-gap, 0px))',
                overscrollBehavior: 'contain',
                overscrollBehaviorY: 'contain',
            }}
        >
            <SearchFilters
                searchQuery={searchQuery}
                setSearchQuery={userSetSearchQuery}
                startDate={startDate}
                setStartDate={handleStartDateChange}
                endDate={endDate}
                setEndDate={setEndDate}
                location={location}
                setLocation={handleLocationChange}
                setLatitude={setLatitude}
                setLongitude={setLongitude}
                isLoaded={isLoaded}
                autocompleteRef={autocompleteRef}
                activities={activities}
                selectedActivities={selectedActivities}
                setSelectedActivities={setSelectedActivities}
                hashtags={hashtags}
                selectedHashtags={selectedHashtags}
                setSelectedHashtags={setSelectedHashtags}
                onlyKids={onlyKids}
                setOnlyKids={setOnlyKids}
                withCoach={withCoach}
                setWithCoach={setWithCoach}
                excludeSoldOut={excludeSoldOut}
                setExcludeSoldOut={setExcludeSoldOut}
                hotOffers={hotOffers}
                setHotOffers={setHotOffers}
                onSearch={handleManualSearch}
                collapsed={collapsed}
                setCollapsed={setCollapsed}
                summaryText={summaryText}
                lockCollapse={setCollapseLocked}
                layoutEpoch={layoutEpoch}
            //onReset={handleReset}
            />

            {/* Результаты — лента с вкладками */}
            <div className="flex-1 min-h-0 w-full">
                <SearchFeedTabs
                    qsOverride={hydrationReady ? computedQuery : undefined}
                    scrollContainerRef={scrollAreaRef}
                    // Табы больше не изменяют URL ни на базовой странице, ни в оверлее,
                    // чтобы переключение вкладок не вызывало перерисовку всей страницы.
                    syncWithUrl={false}
                    // Начальная вкладка теперь явно передаётся из SearchPage,
                    // чтобы оверлей поиска корректно открывался на нужном табе
                    // (карта для локации, кэмпы для активностей/тегов) независимо
                    // от sessionStorage и URL‑синхронизации.
                    initialTab={currentTab || undefined}
                    filtersCollapsed={collapsed}
                    layoutEpoch={layoutEpoch}
                />
            </div>
        </div>
    );
}
