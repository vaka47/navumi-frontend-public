'use client';

import React from 'react';
import ProfilePageClient from '@/app/[username]/ProfilePageClient';
import { AppScreenBridge, type SearchParamsShape } from '@/components/navigation/AppScreenBridge';
import { useLayerStack } from '@/context/LayerStackContext';
import { rememberReturn } from '@/lib/navBack';
import BottomNavBar from '@/components/BottomNavBar';
import { useOverlayEnvironment, OverlayEnvironmentProvider } from '@/context/OverlayEnvironmentContext';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { releaseHideHeader, acquireHideHeader } from '@/lib/headerVisibility';

type OpenProfileOverlayParams = {
  username: string;
  searchParams?: SearchParamsShape;
};

function ProfileOverlayShell({
  username,
  searchParams,
}: {
  username: string;
  searchParams?: SearchParamsShape;
}) {
  const baseRouter = useRouter();
  const { screens, popScreen } = useLayerStack();
  const overlayEnv = useOverlayEnvironment();
  const pathname = usePathname();
  const navSearchParams = useSearchParams();
  const searchString = navSearchParams?.toString() ?? '';

  // Добавляем навигацию из оверлея профиля: закрываем все экраны и делаем SPA‑переход.
  const enhancedEnv = React.useMemo(() => {
    const navigate = (href: string, options?: unknown) => {
      const total = screens.length;
      if (total > 0) {
        for (let i = 0; i < total; i += 1) {
          popScreen();
        }
      }
      baseRouter.push(href, options as never);
    };
    return {
      ...overlayEnv,
      navigate,
    };
  }, [overlayEnv, screens.length, popScreen, baseRouter]);

  React.useEffect(() => {
    try {
      // eslint-disable-next-line no-console
      console.info('[ProfileOverlayShell] mount', {
        username,
        isOverlay: overlayEnv.isOverlay,
        screensCount: screens.length,
        bridgePathname: `/${username}`,
        outerPathname: pathname,
        outerSearch: searchString,
        href: typeof window !== 'undefined' ? window.location.href : null,
        hasHideHeaderClass: typeof document !== 'undefined' && document.body.classList.contains('hide-header'),
      });
    } catch { /* noop */ }
    
    // Проверяем появление шапки в DOM с задержками
    const checkHeaderInDOM = () => {
      if (typeof document === 'undefined') return;
      
      // Ищем шапку профиля разными способами
      const headerEl1 = document.querySelector('header.sticky.top-0.z-40.bg-white.border-b');
      const headerEl2 = document.querySelector('[data-profile-page] header');
      const headerEl3 = document.querySelector('#profile-overlay-main header');
      const headerEl = headerEl1 || headerEl2 || headerEl3;
      
      const allHeaders = Array.from(document.querySelectorAll('header'));
      
      if (headerEl) {
        const computed = window.getComputedStyle(headerEl);
        const rect = headerEl.getBoundingClientRect();
        // eslint-disable-next-line no-console
        console.log('[ProfileOverlayShell] header found in DOM', {
          username,
          className: headerEl.className,
          foundBy: headerEl1 ? 'selector1' : headerEl2 ? 'selector2' : 'selector3',
          computedStyles: {
            display: computed.display,
            visibility: computed.visibility,
            opacity: computed.opacity,
            zIndex: computed.zIndex,
            position: computed.position,
            top: computed.top,
          },
          boundingRect: {
            width: rect.width,
            height: rect.height,
            top: rect.top,
            left: rect.left,
            visible: rect.width > 0 && rect.height > 0,
          },
          hasHideHeaderClass: document.body.classList.contains('hide-header'),
          parentElement: headerEl.parentElement ? {
            tagName: headerEl.parentElement.tagName,
            className: headerEl.parentElement.className,
            computedDisplay: window.getComputedStyle(headerEl.parentElement).display,
          } : null,
        });
      } else {
        // eslint-disable-next-line no-console
        console.log('[ProfileOverlayShell] header not found in DOM yet', {
          username,
          allHeaders: allHeaders.map(el => {
            const computed = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            const inlineStyle = el.getAttribute('style') || '';
            return {
              className: el.className,
              id: el.id,
              tagName: el.tagName,
              inlineStyle,
              parentTag: el.parentElement?.tagName,
              parentClass: el.parentElement?.className,
              parentId: el.parentElement?.id,
              parentInlineStyle: el.parentElement?.getAttribute('style') || '',
              parentComputedDisplay: el.parentElement ? window.getComputedStyle(el.parentElement).display : null,
              computedDisplay: computed.display,
              computedVisibility: computed.visibility,
              computedOpacity: computed.opacity,
              computedPosition: computed.position,
              computedZIndex: computed.zIndex,
              rect: {
                width: rect.width,
                height: rect.height,
                top: rect.top,
                left: rect.left,
                visible: rect.width > 0 && rect.height > 0,
              },
              matchesSelector1: el.matches('header.sticky.top-0.z-40.bg-white.border-b'),
              matchesSelector2: el.matches('[data-profile-page] header'),
              matchesSelector3: el.matches('#profile-overlay-main header'),
              hasSticky: el.classList.contains('sticky'),
              hasTop0: el.classList.contains('top-0'),
              hasZ40: el.classList.contains('z-40'),
              hasBgWhite: el.classList.contains('bg-white'),
              hasBorderB: el.classList.contains('border-b'),
            };
          }),
          profilePageExists: !!document.querySelector('[data-profile-page]'),
          profileOverlayMainExists: !!document.querySelector('#profile-overlay-main'),
          profileOverlayMainContent: document.querySelector('#profile-overlay-main')?.innerHTML?.substring(0, 200) || null,
        });
      }
    };
    
    // Проверяем с задержками
    setTimeout(checkHeaderInDOM, 100);
    setTimeout(checkHeaderInDOM, 300);
    setTimeout(checkHeaderInDOM, 500);
    setTimeout(checkHeaderInDOM, 1000);
    
    return () => {
      try {
        // eslint-disable-next-line no-console
        console.info('[ProfileOverlayShell] unmount', {
          username,
          isOverlay: overlayEnv.isOverlay,
          screensCount: screens.length,
          outerPathname: pathname,
          outerSearch: searchString,
          href: typeof window !== 'undefined' ? window.location.href : null,
        });
      } catch { /* noop */ }
    };
  }, [username, overlayEnv.isOverlay, screens.length, pathname, searchString]);

  return (
    <OverlayEnvironmentProvider value={enhancedEnv}>
      <AppScreenBridge
        pathname={`/${username}`}
        params={{ username }}
        searchParams={searchParams}
      >
        <div className="h-[100dvh] flex flex-col bg-muted">
          <main
            id="profile-overlay-main"
            data-scroll-root
            className="flex-1 min-h-0 overflow-y-auto"
          >
            <ProfilePageClient username={username} />
          </main>
          <div className="shrink-0">
            <BottomNavBar />
          </div>
        </div>
      </AppScreenBridge>
    </OverlayEnvironmentProvider>
  );
}

// Отслеживаем, какие экраны освободили hide-header
const hideHeaderReleasedScreens = new Set<string>();

export function useProfileOverlay() {
  const { pushScreen } = useLayerStack();
  const overlayEnv = useOverlayEnvironment();

  return React.useCallback((params: OpenProfileOverlayParams) => {
    const username = (params.username || '').replace(/^@+/, '').trim();
    if (!username) return;

    try {
      rememberReturn('profile');
    } catch {
      /* noop */
    }

    try {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.debug('[useProfileOverlay] open', {
          rawParams: params,
          sanitizedUsername: username,
          href: typeof window !== 'undefined' ? window.location.href : null,
        });
      }
    } catch { /* noop */ }

    const node = (
      <ProfileOverlayShell
        username={username}
        searchParams={params.searchParams}
      />
    );

    // Если открываем из оверлея (например, из мобильного поста), временно освобождаем hide-header
    // чтобы шапка профиля могла отобразиться
    const wasInOverlay = overlayEnv.isOverlay;
    const bodyHasHideHeader = typeof document !== 'undefined' && document.body.classList.contains('hide-header');
    const hadHideHeader = wasInOverlay && bodyHasHideHeader;
    
    // eslint-disable-next-line no-console
    console.log('[useProfileOverlay] before open', {
      username,
      wasInOverlay,
      bodyHasHideHeader,
      hadHideHeader,
      willRelease: hadHideHeader,
      href: typeof window !== 'undefined' ? window.location.href : null,
      bodyClasses: typeof document !== 'undefined' ? Array.from(document.body.classList) : [],
    });
    
    if (hadHideHeader) {
      releaseHideHeader();
      // Проверяем состояние после освобождения с задержками
      setTimeout(() => {
        // eslint-disable-next-line no-console
        console.log('[useProfileOverlay] released hide-header (delayed check 50ms)', {
          username,
          hasClassAfterRelease: typeof document !== 'undefined' && document.body.classList.contains('hide-header'),
          bodyClasses: typeof document !== 'undefined' ? Array.from(document.body.classList) : [],
          // Проверяем, есть ли уже шапка в DOM
          headerInDOM: typeof document !== 'undefined' ? !!document.querySelector('header.sticky.top-0.z-40.bg-white.border-b') : false,
        });
      }, 50);
      setTimeout(() => {
        // eslint-disable-next-line no-console
        console.log('[useProfileOverlay] released hide-header (delayed check 200ms)', {
          username,
          hasClassAfterRelease: typeof document !== 'undefined' && document.body.classList.contains('hide-header'),
          bodyClasses: typeof document !== 'undefined' ? Array.from(document.body.classList) : [],
          headerInDOM: typeof document !== 'undefined' ? !!document.querySelector('header.sticky.top-0.z-40.bg-white.border-b') : false,
          headerElements: typeof document !== 'undefined' ? Array.from(document.querySelectorAll('header')).map(el => ({
            className: el.className,
            computedDisplay: window.getComputedStyle(el).display,
            computedVisibility: window.getComputedStyle(el).visibility,
            rect: el.getBoundingClientRect(),
          })) : [],
        });
      }, 200);
      // eslint-disable-next-line no-console
      console.log('[useProfileOverlay] released hide-header (immediate)', {
        username,
        hasClassAfterRelease: typeof document !== 'undefined' && document.body.classList.contains('hide-header'),
      });
    }

    const id = pushScreen({
      node,
      backdrop: 'dim',
      className: 'bg-white',
      ariaLabel: 'Закрыть профиль',
      dismissible: true,
      blockScroll: true,
      onClose: () => {
        // Восстанавливаем hide-header при закрытии, если мы его освобождали
        const shouldRestore = hideHeaderReleasedScreens.has(id);
        // eslint-disable-next-line no-console
        console.log('[useProfileOverlay] onClose', {
          username,
          id,
          shouldRestore,
          hasClassBeforeRestore: typeof document !== 'undefined' && document.body.classList.contains('hide-header'),
        });
        if (shouldRestore) {
          acquireHideHeader();
          hideHeaderReleasedScreens.delete(id);
          // eslint-disable-next-line no-console
          console.log('[useProfileOverlay] restored hide-header', {
            username,
            hasClassAfterRestore: typeof document !== 'undefined' && document.body.classList.contains('hide-header'),
          });
        }
      },
    });

    // Отслеживаем, что этот экран освободил hide-header
    if (hadHideHeader) {
      hideHeaderReleasedScreens.add(id);
      // eslint-disable-next-line no-console
      console.log('[useProfileOverlay] tracked screen for hide-header release', {
        username,
        id,
        trackedScreens: Array.from(hideHeaderReleasedScreens),
      });
    }

    try {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.debug('[useProfileOverlay] pushScreen', {
          layerId: id,
          username,
          href: typeof window !== 'undefined' ? window.location.href : null,
        });
      }
    } catch { /* noop */ }
  }, [pushScreen, overlayEnv.isOverlay]);
}
