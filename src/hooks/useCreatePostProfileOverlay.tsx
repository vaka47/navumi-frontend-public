'use client';

import React from 'react';
import { useLayerStack } from '@/context/LayerStackContext';
import { AppScreenBridge } from '@/components/navigation/AppScreenBridge';
import { CreatePostProfileMobilePageImpl } from '@/components/post/CreatePostProfileMobilePage';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';
import { releaseHideHeader, acquireHideHeader } from '@/lib/headerVisibility';

// Отслеживаем, какие экраны освободили hide-header
const hideHeaderReleasedScreens = new Set<string>();

export function useCreatePostProfileOverlay() {
  const { pushScreen, popScreen } = useLayerStack();
  const screenIdRef = React.useRef<string | null>(null);
  const overlayEnv = useOverlayEnvironment();

  const open = React.useCallback((params: {
    mode?: 'create' | 'edit';
    postId?: number;
    username?: string;
  }) => {
    // Если уже есть наш экран редактирования — убираем его,
    // чтобы не плодить дубли.
    if (screenIdRef.current) {
      popScreen(screenIdRef.current);
      hideHeaderReleasedScreens.delete(screenIdRef.current);
      screenIdRef.current = null;
    }

    const pathname = params.mode === 'edit' && params.postId && params.username
      ? `/m/${params.username}/post/${params.postId}/edit`
      : '/m/profile/post/create';

    const node = (
      <AppScreenBridge
        pathname={pathname}
        params={params.mode === 'edit' && params.postId && params.username
          ? { username: params.username, postId: String(params.postId) }
          : {}}
      >
        <CreatePostProfileMobilePageImpl
          mode={params.mode || 'create'}
          postId={params.postId}
        />
      </AppScreenBridge>
    );

    // Если открываем из оверлея (например, из мобильного поста), временно освобождаем hide-header
    // чтобы шапка редактирования могла отобразиться
    const wasInOverlay = overlayEnv.isOverlay;
    const bodyHasHideHeader = typeof document !== 'undefined' && document.body.classList.contains('hide-header');
    const hadHideHeader = wasInOverlay && bodyHasHideHeader;
    
    // eslint-disable-next-line no-console
    console.log('[useCreatePostProfileOverlay] before open', {
      mode: params.mode,
      postId: params.postId,
      wasInOverlay,
      bodyHasHideHeader,
      hadHideHeader,
      willRelease: hadHideHeader,
      href: typeof window !== 'undefined' ? window.location.href : null,
    });
    
    if (hadHideHeader) {
      releaseHideHeader();
      // eslint-disable-next-line no-console
      console.log('[useCreatePostProfileOverlay] released hide-header', {
        mode: params.mode,
        hasClassAfterRelease: typeof document !== 'undefined' && document.body.classList.contains('hide-header'),
      });
    }

    const id = pushScreen({
      node,
      className: 'bg-white',
      backdrop: 'dim',
      ariaLabel: params.mode === 'edit' ? 'Редактировать пост' : 'Создать пост',
      dismissible: true,
      blockScroll: true,
      onClose: () => {
        screenIdRef.current = null;
        // Восстанавливаем hide-header при закрытии, если мы его освобождали
        const shouldRestore = hideHeaderReleasedScreens.has(id);
        // eslint-disable-next-line no-console
        console.log('[useCreatePostProfileOverlay] onClose', {
          mode: params.mode,
          id,
          shouldRestore,
          hasClassBeforeRestore: typeof document !== 'undefined' && document.body.classList.contains('hide-header'),
        });
        if (shouldRestore) {
          acquireHideHeader();
          hideHeaderReleasedScreens.delete(id);
          // eslint-disable-next-line no-console
          console.log('[useCreatePostProfileOverlay] restored hide-header', {
            mode: params.mode,
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
      console.log('[useCreatePostProfileOverlay] tracked screen for hide-header release', {
        mode: params.mode,
        id,
        trackedScreens: Array.from(hideHeaderReleasedScreens),
      });
    }

    try {
      // eslint-disable-next-line no-console
      console.info('[useCreatePostProfileOverlay] open screen', { mode: params.mode, postId: params.postId, id });
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
