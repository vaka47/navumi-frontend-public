"use client";


import { Suspense, useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from 'next/navigation';
import { restoreMainScroll } from '@/lib/scrollRestoration';
import Header from "../header";
import BottomNavBar from "@/components/BottomNavBar";
import { BottomNavBarProvider } from '@/context/BottomNavBarContext';
import { MobileCampModalProvider } from "@/context/MobileCampModalContext";
import GlobalCampModal from "@/components/GlobalCampModal";
import { MobileClubModalProvider } from "@/context/MobileClubModalContext";
import { LayerProvider, useLayerStack } from '@/context/LayerStackContext';
import { useEffectivePathname } from '@/lib/useEffectivePathname';
import CompleteProfileModal from '@/components/CompleteProfileModal';


function LayoutInner({ children }: { children: React.ReactNode }) {
    const routerPathname = usePathname();
    const searchParams = useSearchParams();
    const searchKey = useMemo(() => searchParams?.toString() ?? '', [searchParams]);
    const { primaryHref, screens } = useLayerStack();
    const basePath = routerPathname || '';
    const isBaseSearch = basePath === '/search';

    const prevFullRef = useRef<string | null>(null);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const full = window.location.pathname + window.location.search + window.location.hash;
            if (prevFullRef.current && prevFullRef.current !== full) {
                const prevFull = prevFullRef.current;
                const lastStored = sessionStorage.getItem('nav.prevFull');
                if (lastStored && lastStored !== prevFull) {
                    sessionStorage.setItem('nav.prevFullPrev', lastStored);
                }
                sessionStorage.setItem('nav.prevFull', prevFull);
                sessionStorage.setItem('app.prevPath', prevFull);
            }
            prevFullRef.current = full;
        } catch {}
    }, [routerPathname, searchKey]);

    // Единый «эффективный» pathname, согласованный с Header / BottomNav.
    const pathname = useEffectivePathname();

    // Отслеживаем, как layout видит текущий маршрут и почему может скрывать header/nav.
    useEffect(() => {
        try {
            console.info('[Layout] render', {
                routerPathname: routerPathname || '',
                effectivePathname: pathname,
                primaryHref,
                screensCount: screens.length,
            });
        } catch {
            // noop
        }
    }, [routerPathname, pathname, primaryHref, screens.length]);

    // Любые экраны, относящиеся к страницам профиля (/:username/... и /m/:username/...) —
    // скрываем глобальный Header. Исключаем «зарезервированные» сегменты.
    const isProfileArea = (() => {
        if (isBaseSearch) return false;
        const reserved = new Set(['auth', 'search', 'feed', 'messages', 'create-camp', 'create-post', 'profile']);
        const p = pathname || '';
        const segs = p.split('/').filter(Boolean);
        if (segs.length === 0) return false;
        if (segs[0] === 'm') {
            if (segs.length < 2) return false;
            return !reserved.has(segs[1] || '');
        }
        return !reserved.has(segs[0] || '');
    })();

    // Страницы списков подписчиков/подписок — без глобального хедера и нижней навигации
    const isFollowList = (() => {
        if (isBaseSearch) return false;
        const p = pathname || '';
        // поддерживаем варианты /:username/(followers|following) и /m/:username/(followers|following)
        return /^\/(?:m\/)?[^/]+\/(followers|following)\/?$/.test(p);
    })();

    // Страница рекомендаций — без глобального хедера, но с нижней навигацией.
    const hideHeader = !isBaseSearch && (isProfileArea || isFollowList || pathname === '/recommendations');

    return (
        <>
            <div className="h-[100dvh] flex flex-col bg-muted">
                {!hideHeader && (
                    <Suspense fallback={null}>
                        <Header />
                    </Suspense>
                )}
                <main
                    id="app-main"
                    data-scroll-root
                    className="flex-grow overflow-y-auto"
                    // If global Header is visible, reserve its height to avoid content overlap
                    style={{ paddingTop: (!hideHeader) ? 'var(--header-h, 64px)' : undefined }}
                >
                    {children}
                </main>
                {!isFollowList && <BottomNavBar />}
                <GlobalCampModal /> {/* вот здесь рендер модалки */}
                <CompleteProfileModal /> {/* модалка для завершения создания профиля */}
            </div>
            {/* Восстановление скролла для основного контейнера при возврате */}
            <script dangerouslySetInnerHTML={{ __html: `
                            try { if (history.scrollRestoration) history.scrollRestoration = 'manual'; } catch {}
                        ` }} />
            {restoreMainScroll(pathname)}
        </>
    );
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <BottomNavBarProvider>
            <MobileCampModalProvider>
                <MobileClubModalProvider>
                    <LayerProvider>
                        <LayoutInner>{children}</LayoutInner>
                    </LayerProvider>
                </MobileClubModalProvider>
            </MobileCampModalProvider>
        </BottomNavBarProvider>
    );
}
