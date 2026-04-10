'use client';

import React from 'react';
import { useLayerStack } from '@/context/LayerStackContext';
import { AppScreenBridge } from '@/components/navigation/AppScreenBridge';
import FollowListPage from '@/components/profile/FollowListPage';

type Mode = 'followers' | 'following';

type OpenParams = {
  username: string;
  mode: Mode;
};

export function useFollowListOverlay() {
  const { pushScreen, popScreen, closeTopScreen } = useLayerStack();
  const screenIdRef = React.useRef<string | null>(null);

  const open = React.useCallback(
    ({ username, mode }: OpenParams) => {
      const slug = (username || '').replace(/^@+/, '').trim();
      if (!slug) return;

      // Если уже есть наш экран со списком — убираем его,
      // чтобы не плодить дубли.
      if (screenIdRef.current) {
        popScreen(screenIdRef.current);
        screenIdRef.current = null;
      }

      const path = `/${slug}/${mode === 'followers' ? 'followers' : 'following'}`;

      const node = (
        <AppScreenBridge pathname={path} params={{ username: slug }}>
          <FollowListPage username={slug} mode={mode} />
        </AppScreenBridge>
      );

      const id = pushScreen({
        node,
        className: 'bg-white',
        backdrop: 'dim',
        dismissible: true,
        blockScroll: true,
        ariaLabel: mode === 'followers' ? 'Список подписчиков' : 'Список подписок',
        onClose: () => {
          if (screenIdRef.current === id) {
            screenIdRef.current = null;
          }
        },
      });

      screenIdRef.current = id;
      return id;
    },
    [pushScreen, popScreen],
  );

  const close = React.useCallback(() => {
    if (screenIdRef.current) {
      popScreen(screenIdRef.current);
      screenIdRef.current = null;
      return;
    }
    closeTopScreen();
  }, [popScreen, closeTopScreen]);

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

