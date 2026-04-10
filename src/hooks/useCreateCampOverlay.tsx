'use client';

import React from 'react';
import { useLayerStack } from '@/context/LayerStackContext';
import { AppScreenBridge } from '@/components/navigation/AppScreenBridge';
import MobileCreateCampFullModal from '@/components/camp/mobile/MobileCreateCampFullModal';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';
import { releaseHideHeader, acquireHideHeader } from '@/lib/headerVisibility';

// Отслеживаем, какие экраны освободили hide-header
const hideHeaderReleasedScreens = new Set<string>();

export function useCreateCampOverlay() {
  const { pushScreen, popScreen } = useLayerStack();
  const screenIdRef = React.useRef<string | null>(null);
  const overlayEnv = useOverlayEnvironment();

  const open = React.useCallback(() => {
    // Если уже есть наш экран создания кэмпа — убираем его,
    // чтобы не плодить дубли.
    if (screenIdRef.current) {
      popScreen(screenIdRef.current);
      hideHeaderReleasedScreens.delete(screenIdRef.current);
      screenIdRef.current = null;
    }

    const pathname = '/m/camp/create';

    const node = (
      <AppScreenBridge
        pathname={pathname}
        params={{}}
      >
        <MobileCreateCampFullModal />
      </AppScreenBridge>
    );

    // Если открываем из оверлея, временно освобождаем hide-header
    // чтобы шапка создания кэмпа могла отобразиться
    const wasInOverlay = overlayEnv.isOverlay;
    const bodyHasHideHeader = typeof document !== 'undefined' && document.body.classList.contains('hide-header');
    const hadHideHeader = wasInOverlay && bodyHasHideHeader;
    
    // eslint-disable-next-line no-console
    console.log('[useCreateCampOverlay] before open', {
      wasInOverlay,
      bodyHasHideHeader,
      hadHideHeader,
      willRelease: hadHideHeader,
      href: typeof window !== 'undefined' ? window.location.href : null,
    });
    
    if (hadHideHeader) {
      releaseHideHeader();
      // eslint-disable-next-line no-console
      console.log('[useCreateCampOverlay] released hide-header', {
        hasClassAfterRelease: typeof document !== 'undefined' && document.body.classList.contains('hide-header'),
      });
    }

    const id = pushScreen({
      node,
      className: 'bg-white',
      backdrop: 'dim',
      ariaLabel: 'Создать кэмп',
      dismissible: true,
      blockScroll: true,
      onClose: () => {
        screenIdRef.current = null;
        // Восстанавливаем hide-header при закрытии, если мы его освобождали
        const shouldRestore = hideHeaderReleasedScreens.has(id);
        // eslint-disable-next-line no-console
        console.log('[useCreateCampOverlay] onClose', {
          id,
          shouldRestore,
          hasClassBeforeRestore: typeof document !== 'undefined' && document.body.classList.contains('hide-header'),
        });
        if (shouldRestore) {
          acquireHideHeader();
          hideHeaderReleasedScreens.delete(id);
          // eslint-disable-next-line no-console
          console.log('[useCreateCampOverlay] restored hide-header', {
            hasClassAfterRestore: typeof document !== 'undefined' && document.body.classList.contains('hide-header'),
          });
        }
      },
    });

    screenIdRef.current = id;
    // Отслеживаем, что этот экран освободил hide-header
    if (hadHideHeader) {
      hideHeaderReleasedScreens.add(id);
      // eslint-disable-next-line no-console
      console.log('[useCreateCampOverlay] tracked screen for hide-header release', {
        id,
        trackedScreens: Array.from(hideHeaderReleasedScreens),
      });
    }

    try {
      // eslint-disable-next-line no-console
      console.info('[useCreateCampOverlay] open screen', { id });
    } catch {
      /* noop */
    }

    return id;
  }, [pushScreen, popScreen, overlayEnv.isOverlay]);

  const close = React.useCallback(() => {
    if (screenIdRef.current) {
      popScreen(screenIdRef.current);
      screenIdRef.current = null;
    }
  }, [popScreen]);

  // На размонтировании хука — подчистить возможный открытый экран
  React.useEffect(() => {
    return () => {
      if (screenIdRef.current) {
        popScreen(screenIdRef.current);
        screenIdRef.current = null;
      }
    };
  }, [popScreen]);

  return { open, close };
}
