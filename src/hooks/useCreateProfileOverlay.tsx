'use client';

import React from 'react';
import { useLayerStack } from '@/context/LayerStackContext';
import { AppScreenBridge } from '@/components/navigation/AppScreenBridge';
import CreateClientProfileMobilePage from '@/components/profile/CreateClientProfileMobilePage';
import CreateClubProfileMobilePage from '@/components/profile/CreateClubProfileMobilePage';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';
import { releaseHideHeader, acquireHideHeader } from '@/lib/headerVisibility';

// Отслеживаем, какие экраны освободили hide-header
const hideHeaderReleasedScreens = new Set<string>();

export function useCreateProfileOverlay() {
  const { pushScreen, popScreen } = useLayerStack();
  const screenIdRef = React.useRef<string | null>(null);
  const overlayEnv = useOverlayEnvironment();

    const open = React.useCallback((params: {
      type: 'client' | 'club';
      isSecond?: boolean;
    }) => {
    // Если уже есть наш экран создания профиля — убираем его,
    // чтобы не плодить дубли.
    if (screenIdRef.current) {
      popScreen(screenIdRef.current);
      hideHeaderReleasedScreens.delete(screenIdRef.current);
      screenIdRef.current = null;
    }

    const pathname = params.type === 'client'
      ? '/auth/create-client-profile/mobile'
      : '/auth/create-club-profile/mobile';

    const searchParams = params.isSecond ? { second: '1' } : undefined;

    const Component = params.type === 'client'
      ? CreateClientProfileMobilePage
      : CreateClubProfileMobilePage;

    // eslint-disable-next-line no-console
    console.log('[useCreateProfileOverlay] opening', {
      type: params.type,
      isSecond: params.isSecond,
      pathname,
      searchParams,
    });

    const node = (
      <AppScreenBridge
        pathname={pathname}
        params={{}}
        searchParams={searchParams}
      >
        <Component />
      </AppScreenBridge>
    );

    // Если открываем из оверлея, временно освобождаем hide-header
    // чтобы шапка создания профиля могла отобразиться
    const wasInOverlay = overlayEnv.isOverlay;
    const bodyHasHideHeader = typeof document !== 'undefined' && document.body.classList.contains('hide-header');
    const hadHideHeader = wasInOverlay && bodyHasHideHeader;
    
    if (hadHideHeader) {
      releaseHideHeader();
    }

    const id = pushScreen({
      node,
      className: 'bg-white',
      backdrop: 'dim',
      ariaLabel: params.type === 'client' ? 'Создать профиль клиента' : 'Создать профиль клуба',
      dismissible: true,
      blockScroll: true,
      onClose: () => {
        screenIdRef.current = null;
        // Восстанавливаем hide-header при закрытии, если мы его освобождали
        const shouldRestore = hideHeaderReleasedScreens.has(id);
        if (shouldRestore) {
          acquireHideHeader();
          hideHeaderReleasedScreens.delete(id);
        }
      },
    });

    screenIdRef.current = id;
    // Отслеживаем, что этот экран освободил hide-header
    if (hadHideHeader) {
      hideHeaderReleasedScreens.add(id);
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
