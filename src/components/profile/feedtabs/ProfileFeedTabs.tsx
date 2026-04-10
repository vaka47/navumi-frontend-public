'use client';

import React from 'react';
import { CalendarDays, Camera, BookOpen, UserRound, Eye } from 'lucide-react';
import CampTab from './CampTab';
import PostTab from './PostTab';
import TextTab from './TextTab';
import PostWithMeTab from './PostWithMeTab';
import SavedTab from './SavedTab';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';

type Role = 'club' | 'client';

export type ProfileFeedTabsProps = {
  username: string;
  role: Role;
  isOwner?: boolean;
  initialTab?: 'camps' | 'posts' | 'articles' | 'marks' | 'saved';
  className?: string;
  profileAvatarUrl?: string | null;
  initialCamps?: {
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
  }[] | null;
};

type TabKey = NonNullable<ProfileFeedTabsProps['initialTab']>;

const LABELS: Record<TabKey, string> = {
  camps: 'Кэмпы',
  posts: 'Посты',
  articles: 'Статьи',
  marks: 'Отметки',
  saved: 'Сохранённые',
};

const ICONS: Record<TabKey, React.ReactNode> = {
  camps: <CalendarDays className="w-[18px] h-[18px]" />,     // календарь
  posts: <Camera className="w-[18px] h-[18px]" />,           // фотокамера
  articles: <BookOpen className="w-[18px] h-[18px]" />,      // книга
  marks: <UserRound className="w-[18px] h-[18px]" />,        // портрет
  saved: <Eye className="w-[18px] h-[18px]" />,              // глаз
};

export default function ProfileFeedTabs({
  username,
  role,
  isOwner,
  initialTab,
  className,
  profileAvatarUrl,
  initialCamps,
}: ProfileFeedTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isOverlay } = useOverlayEnvironment();
  const tabsHeaderRef = React.useRef<HTMLDivElement | null>(null);
  const tabs = React.useMemo<TabKey[]>(() => {
    const base = role === 'club' ? (['camps', 'posts', 'articles', 'marks'] as TabKey[]) : (['posts', 'articles', 'marks'] as TabKey[]);
    // «Сохранённые» показываем только владельцу и только у профилей-клиентов
    return isOwner && role === 'client' ? ([...base, 'saved'] as TabKey[]) : base;
  }, [role, isOwner]);

  const tabStorageKey = React.useMemo(() => (username ? `profile:${username}:tab` : null), [username]);
  const searchParamsString = searchParams?.toString() ?? '';

  const normalizedInitialTab = React.useMemo<TabKey | null>(() => (
    initialTab && tabs.includes(initialTab) ? initialTab : null
  ), [initialTab, tabs]);

  const queryTab = React.useMemo<TabKey | null>(() => {
    if (!searchParamsString) return null;
    const params = new URLSearchParams(searchParamsString);
    const raw = params.get('tab');
    if (!raw) return null;
    const lowered = raw.toLowerCase();
    return tabs.includes(lowered as TabKey) ? (lowered as TabKey) : null;
  }, [searchParamsString, tabs]);

  const storedTab = React.useMemo<TabKey | null>(() => {
    if (typeof window === 'undefined' || !tabStorageKey) return null;
    try {
      const raw = sessionStorage.getItem(tabStorageKey) as TabKey | null;
      return raw && tabs.includes(raw) ? raw : null;
    } catch {
      return null;
    }
  }, [tabStorageKey, tabs]);

  const fallbackTab = normalizedInitialTab ?? storedTab ?? tabs[0];

  const [active, setActive] = React.useState<TabKey>(() => queryTab ?? fallbackTab);

  React.useEffect(() => {
    // В оверлее профиля не привязываем активную вкладку
    // к query-параметру, потому что searchParams внутри
    // оверлея не обновляются при клике на табы.
    if (isOverlay) return;
    if (queryTab && queryTab !== active) {
      setActive(queryTab);
      return;
    }
    if (!queryTab && fallbackTab !== active) {
      setActive(fallbackTab);
    }
  }, [queryTab, fallbackTab, active, isOverlay]);

  React.useEffect(() => {
    if (tabs.includes(active)) return;
    const safe = queryTab && tabs.includes(queryTab) ? queryTab : fallbackTab;
    setActive(safe);
  }, [tabs, active, queryTab, fallbackTab]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !tabStorageKey) return;
    try { sessionStorage.setItem(tabStorageKey, active); } catch { /* noop */ }
  }, [active, tabStorageKey]);

  const updateTabInUrl = React.useCallback((nextTab: TabKey) => {
    if (!pathname) return;
    // В оверлее профиля меняем вкладку только локально,
    // не трогая URL основного приложения.
    if (isOverlay) return;
    const params = new URLSearchParams(searchParamsString);
    if (params.get('tab') === nextTab && !params.has('tab_source')) return;
    params.set('tab', nextTab);
    params.delete('tab_source');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParamsString, isOverlay]);

  const handleTabSelect = (next: TabKey) => {
    if (next === active) return;
    setActive(next);
    updateTabInUrl(next);
  };

  const activeIdx = React.useMemo(() => Math.max(0, tabs.indexOf(active)), [tabs, active]);

  const panelsRef = React.useRef<HTMLDivElement | null>(null);

  // Debug: следим за тем, кто именно скроллится на вкладке статей (window vs #app-main),
  // чтобы понять, откуда берётся второй бегунок и «доп. скролл».
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (active !== 'articles') return;
    const root = document.getElementById('app-main') as HTMLElement | null;
    let lastLog = 0;
    const logState = (src: string) => {
      const now = Date.now();
      if (now - lastLog < 120) return;
      lastLog = now;
      try {
        const doc = document.documentElement;
        const body = document.body;
        const winScrollY = window.scrollY || window.pageYOffset;
        const docTop = doc.scrollTop;
        const bodyTop = body.scrollTop;
        const rootTop = root ? root.scrollTop : null;
        const rootH = root ? root.scrollHeight : null;
        const rootCH = root ? root.clientHeight : null;
        const docH = doc.scrollHeight;
        const winH = window.innerHeight;
        // eslint-disable-next-line no-console
        console.log('[ProfileFeedTabs][articles-scroll]', {
          src,
          winScrollY,
          docTop,
          bodyTop,
          rootTop,
          rootH,
          rootCH,
          docH,
          winH,
          docHasScroll: docH > winH + 1,
          rootHasScroll: rootH !== null && rootCH !== null ? (rootH > rootCH + 1) : null,
          bodyOverflowY: getComputedStyle(body).overflowY,
          htmlOverflowY: getComputedStyle(doc).overflowY,
        });
      } catch {
        // ignore
      }
    };

    logState('init');
    const onWinScroll = () => logState('window-scroll');
    const onRootScroll = () => logState('root-scroll');
    const onWheel = (e: WheelEvent) => {
      const t = e.target as HTMLElement | null;
      try {
        // eslint-disable-next-line no-console
        console.log('[ProfileFeedTabs][articles-wheel]', {
          targetTag: t?.tagName,
          targetId: t?.id,
          targetCls: t?.className,
        });
      } catch {
        // ignore
      }
      logState('wheel');
    };
    window.addEventListener('scroll', onWinScroll, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });
    if (root) root.addEventListener('scroll', onRootScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onWinScroll);
      window.removeEventListener('wheel', onWheel);
      if (root) root.removeEventListener('scroll', onRootScroll);
      logState('cleanup');
    };
  }, [active]);

  React.useEffect(() => {
    const el = tabsHeaderRef.current;
    if (!el) return;
    const measure = () => {
      try {
        const h = Math.ceil(el.getBoundingClientRect().height);
        document.documentElement.style.setProperty('--profile-tabs-h', `${h}px`);
        console.debug('[ProfileFeedTabs][measure-tabs]', { h });
      } catch { }
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  const renderTabPanel = (tabKey: TabKey) => {
    switch (tabKey) {
      case 'camps':
        return role === 'club' ? <CampTab username={username} isOwner={!!isOwner} initialCamps={initialCamps ?? undefined} /> : null;
      case 'posts':
        return <PostTab username={username} isOwner={!!isOwner} />;
      case 'articles':
        return <TextTab username={username} isOwner={!!isOwner} profileAvatarUrl={profileAvatarUrl || undefined} />;
      case 'marks':
        return <PostWithMeTab username={username} />;
      case 'saved':
        return isOwner && role === 'client' ? <SavedTab username={username} /> : null;
      default:
        return null;
    }
  };

  return (
    <div className={['w-full', className || ''].join(' ')} style={{ overscrollBehavior: 'contain' }}>
      {/* Header with tabs (evenly spread like Instagram) */}
      <div className="sticky z-10 bg-white" style={{ top: '0px' }} ref={tabsHeaderRef}>
        <div className="relative">
          <div
            className="grid px-0"
            style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
            role="tablist"
          >
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => handleTabSelect(t)}
                className="relative h-12 flex items-center justify-center text-gray-400 transition-colors"
                aria-label={LABELS[t]}
                title={LABELS[t]}
                role="tab"
                aria-selected={active === t}
              >
                <span className={active === t ? 'text-black' : 'text-gray-400'}>
                  {ICONS[t]}
                </span>
              </button>
            ))}
          </div>
          {/* Animated underline indicator */}
          <div
            className="absolute bottom-0 left-0 h-[2px] bg-black transition-transform duration-300 ease-out"
            style={{ width: `${100 / tabs.length}%`, transform: `translateX(${activeIdx * 100}%)` }}
            aria-hidden
          />
        </div>
      </div>

      {/* Content */}
      <div
        ref={panelsRef}
        className="px-2 sm:px-0 py-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + var(--bottom-gap, 0px) + 86px)' }}
      >
        {tabs.map((t) => (
          <div key={`panel-${t}`} style={{ display: active === t ? 'block' : 'none' }} aria-hidden={active !== t}>
            {renderTabPanel(t)}
          </div>
        ))}
      </div>
    </div>
  );
}
