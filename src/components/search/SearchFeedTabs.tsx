'use client';

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Calendar, Map as MapIcon, UserRound, Camera, BookOpen } from 'lucide-react';
import CampsTab from '@/components/search/tabs/CampsTab';
import MapTab from '@/components/search/tabs/MapTab';
import ProfilesTab from '@/components/search/tabs/ProfilesTab';
import PhotosTab from '@/components/search/tabs/PhotosTab';
import ArticlesTab from '@/components/search/tabs/ArticlesTab';
import { normalizePhotosTabValue } from '@/lib/photoSearchParams';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';

//
const DEBUG_SEARCH_TABS = process.env.NODE_ENV !== 'production';

type RefMaybe = React.RefObject<HTMLDivElement | null> | undefined;

export default function SearchFeedTabs({
  qsOverride,
  scrollContainerRef,
  syncWithUrl = true,
  initialTab,
  filtersCollapsed,
  layoutEpoch,
}: {
  qsOverride?: string;
  scrollContainerRef?: RefMaybe;
  syncWithUrl?: boolean;
  initialTab?: string;
  filtersCollapsed?: boolean;
  layoutEpoch?: number;
}) {
  const router = useRouter();
  const pathname = usePathname() || '/search';
  const sp = useSearchParams();
  const { isOverlay } = useOverlayEnvironment();
  const [, startTransition] = React.useTransition();
  const lastHrefRef = React.useRef<string | null>(null);
  const qsString = sp?.toString() || '';
  const qsSource = qsOverride ?? qsString;
  const qsFiltersOnly = React.useMemo(() => {
    const p = new URLSearchParams(qsSource);
    p.delete('tab');
    return p.toString();
  }, [qsSource]);

  const rawTab = sp?.get('tab') || '';
  const normalizedFromUrl = normalizePhotosTabValue(rawTab);

  const [tab, setTabState] = React.useState<string>(() => {
    // При первичной инициализации:
    //  1) если передан initialTab — используем его;
    //  2) если синхронизируемся с URL — берём из него;
    //  3) иначе читаем из sessionStorage; если там пусто — "camps".
    const normalizedInitial = normalizePhotosTabValue(initialTab || '');
    if (normalizedInitial) return normalizedInitial;
    if (syncWithUrl && normalizedFromUrl) return normalizedFromUrl;
    if (typeof window !== 'undefined') {
      try {
        const stored = window.sessionStorage.getItem('search:last-tab') || '';
        const normalizedStored = normalizePhotosTabValue(stored);
        if (normalizedStored) return normalizedStored;
      } catch {
        // noop
      }
    }
    return 'camps';
  });

  // Синхронизируем локальный tab с URL и sessionStorage.
  React.useEffect(() => {
    // Если табы не должны менять URL, то и URL не должен перетёргивать локальное состояние —
    // достаточно инициализации из sessionStorage в конструкторе.
    if (!syncWithUrl) return;

    const fromUrl = normalizePhotosTabValue(rawTab);
    if (fromUrl) {
      setTabState((prev) => (prev === fromUrl ? prev : fromUrl));
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem('search:last-tab', fromUrl);
        } catch {
          // noop
        }
      }
      return;
    }
  }, [rawTab, syncWithUrl]);

  // Если initialTab меняется уже после первой отрисовки (например, когда
  // оверлей поиска получает свои searchParams чуть позже), мягко
  // синхронизируем локальное состояние вкладки с этим значением.
  React.useEffect(() => {
    const normalizedInitial = normalizePhotosTabValue(initialTab || '');
    if (!normalizedInitial) return;
    setTabState((prev) => (prev === normalizedInitial ? prev : normalizedInitial));
  }, [initialTab]);
  const [mountedTabs, setMountedTabs] = React.useState<Record<string, true>>(() => (
    isOverlay
      ? { camps: true, map: true, profiles: true, photos: true, articles: true }
      : { [tab]: true }
  ));
  React.useEffect(() => {
    if (!isOverlay) return;
    setMountedTabs({ camps: true, map: true, profiles: true, photos: true, articles: true });
  }, [isOverlay]);
  const setTab = (t: string) => {
    const normalized = normalizePhotosTabValue(t) || 'camps';
    setTabState(normalized);
    setMountedTabs(prev => (prev[normalized] ? prev : { ...prev, [normalized]: true }));
    // Глобальное «последняя вкладка поиска» имеет смысл только
    // для базовой страницы, где вкладки действительно синхронизируются с URL.
    // В оверлее поиска переключение табов не должно менять это значение,
    // чтобы возврат на /search не неожиданно открывался, например, на "profiles".
    if (syncWithUrl && typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem('search:last-tab', normalized);
      } catch {
        // noop
      }
    }

    // Для страниц, где URL трогать не нужно (аним. гладкость) — просто выходим.
    const p = new URLSearchParams(qsSource);
    const next = normalized === 'photos' ? 'photoposts' : normalized;
    p.set('tab', next);
    const href = `${pathname}?${p.toString()}`;
    const currentHref = typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : null;
    if (currentHref && currentHref === href) return;
    if (!syncWithUrl) return;
    startTransition(() => {
      router.replace(href, { scroll: false });
      lastHrefRef.current = href;
    });
  };

  // локальные состояния используют дочерние табы; здесь ничего не грузим заранее
  const [stuck, setStuck] = React.useState(false);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  const tabsHeaderRef = React.useRef<HTMLDivElement | null>(null);
  const localScrollRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = scrollContainerRef ?? localScrollRef;
  const [scrollRoot, setScrollRoot] = React.useState<HTMLElement | null>(scrollRef.current);
  const [isMobile, setIsMobile] = React.useState<boolean>(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));

  React.useEffect(() => {
    const next = scrollRef.current || null;
    setScrollRoot((prev) => (prev === next ? prev : next));
  }, [scrollRef]);

  React.useEffect(() => {
    const update = () => setIsMobile(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Measure tabs header height to avoid overlapping content when sticky
  React.useEffect(() => {
    const el = tabsHeaderRef.current;
    if (!el) return;
    const measure = () => {
      try {
        const h = Math.ceil(el.getBoundingClientRect().height);
        document.documentElement.style.setProperty('--search-tabs-h', `${h}px`);
        if (DEBUG_SEARCH_TABS) { try { console.debug('[SearchFeedTabs][measure]', { tabsH: h }); } catch { } }
      } catch { }
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [layoutEpoch]);
  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      const e = entries[0];
      const next = !e.isIntersecting;
      setStuck(next);
      if (DEBUG_SEARCH_TABS) {
        try {
          const root = document.documentElement;
          const headerH = getComputedStyle(root).getPropertyValue('--header-h').trim();
          const firstRowH = getComputedStyle(root).getPropertyValue('--search-first-row-h').trim();
          const formH = getComputedStyle(root).getPropertyValue('--search-form-h').trim();
          const topOffset = getComputedStyle(root).getPropertyValue('--search-top-offset').trim();
          const tabsH = getComputedStyle(root).getPropertyValue('--search-tabs-h').trim();
          console.debug('[SearchFeedTabs][stuck]', { stuck: next, headerH, firstRowH, formH, topOffset, tabsH, scrollY: window.scrollY });
        } catch { }
      }
    }, { threshold: 1, root: scrollRoot ?? undefined });
    io.observe(el);
    return () => io.disconnect();
  }, [scrollRoot, layoutEpoch]);

  const shouldLockHorizontal = isMobile && tab === 'articles';
  const scrollStyle = React.useMemo<React.CSSProperties>(() => {
    const base: React.CSSProperties = {
      overscrollBehavior: 'contain',
      overscrollBehaviorY: 'contain',
      scrollPaddingBottom: 'calc(var(--bottom-gap, 0px) + 84px)',
    };
    if (shouldLockHorizontal) {
      base.touchAction = 'pan-y';
      base.msTouchAction = 'pan-y';
      base.overscrollBehaviorX = 'none';
      base.overflowX = 'hidden';
    }
    return base;
  }, [shouldLockHorizontal]);

  return (
    <div
      className="w-full max-w-4xl mx-auto mt-3 sm:px-4 flex-1 min-h-0 flex flex-col"
      style={{
        height: 'calc(100dvh - var(--header-h, 64px) - var(--bottom-gap, 0px) - var(--search-top-offset, 0px))',
      }}
    >
      <div
        className="bg-white rounded-[24px] border border-gray-200 shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col"
        style={{ height: '100%' }}
      >
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto"
          style={scrollStyle}
          data-search-scroll
        >
          {/* Invisible sentinel for sticky detection; no extra layout gap */}
          <div ref={sentinelRef} aria-hidden className="h-[1px] -mt-[1px]" />
          {/* tabs header (icons + animated underline) */}
          {(() => {
            const items = [
              { key: 'camps', icon: <Calendar className="w-[18px] h-[18px]" /> },
              { key: 'map', icon: <MapIcon className="w-[18px] h-[18px]" /> },
              { key: 'profiles', icon: <UserRound className="w-[18px] h-[18px]" /> },
              { key: 'photos', icon: <Camera className="w-[18px] h-[18px]" /> },
              { key: 'articles', icon: <BookOpen className="w-[18px] h-[18px]" /> },
            ] as const;
            const idx = Math.max(0, items.findIndex(i => i.key === tab));
            const count = items.length;
            return (
              <div
                className={["sticky top-0 z-30 bg-white border-b transition-all duration-200", stuck ? "shadow-[0_1px_8px_rgba(0,0,0,0.08)]" : "shadow-none"].join(' ')}
                ref={tabsHeaderRef}
              >
                <div className="grid" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }} role="tablist">
                  {items.map((it) => (
                    <button
                      key={it.key}
                      onClick={() => setTab(it.key)}
                      className={["relative flex items-center justify-center text-gray-400 transition-colors h-12"].join(' ')}
                      aria-label={it.key}
                      role="tab"
                      aria-selected={tab === it.key}
                    >
                      <span className={tab === it.key ? 'text-black' : 'text-gray-400'}>{it.icon}</span>
                    </button>
                  ))}
                </div>
                <div
                  className="absolute bottom-0 left-0 h-[2px] bg-black transition-transform duration-300 ease-out"
                  style={{ width: `${100 / count}%`, transform: `translateX(${idx * 100}%)` }}
                  aria-hidden
                />
              </div>
            );
          })()}

          <div
            className="pt-3 px-2 sm:px-4"
            style={{
              paddingBottom: 'calc(var(--bottom-gap, 0px) + 86px)',
            }}
          >
            <div style={{ display: tab === 'camps' ? 'block' : 'none' }} aria-hidden={tab !== 'camps'}>
              {mountedTabs['camps'] ? <CampsTab qs={qsFiltersOnly} active={tab === 'camps'} /> : null}
            </div>

            <div style={{ display: tab === 'map' ? 'block' : 'none' }} aria-hidden={tab !== 'map'}>
              {mountedTabs['map'] ? (
                <MapTab
                  qs={qsFiltersOnly}
                  active={tab === 'map'}
                  filtersCollapsed={filtersCollapsed}
                  layoutEpoch={layoutEpoch}
                />
              ) : null}
            </div>

            <div style={{ display: tab === 'profiles' ? 'block' : 'none' }} aria-hidden={tab !== 'profiles'}>
              {mountedTabs['profiles'] ? <ProfilesTab qs={qsFiltersOnly} active={tab === 'profiles'} /> : null}
            </div>

            <div style={{ display: tab === 'photos' ? 'block' : 'none' }} aria-hidden={tab !== 'photos'}>
              {mountedTabs['photos'] ? <PhotosTab qs={qsFiltersOnly} active={tab === 'photos'} /> : null}
            </div>

            <div style={{ display: tab === 'articles' ? 'block' : 'none' }} aria-hidden={tab !== 'articles'}>
              {mountedTabs['articles'] ? <ArticlesTab qs={qsFiltersOnly} active={tab === 'articles'} /> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
