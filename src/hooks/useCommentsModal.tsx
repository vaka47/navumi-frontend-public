'use client';

import React from 'react';
import { useLayerStack } from '@/context/LayerStackContext';
import PostProfileCommentsMobile from '@/components/post/mobile/PostProfileCommentsMobile';

export function useCommentsModal() {
  const { pushScreen, popScreen, closeTopScreen } = useLayerStack();
  const screenIdRef = React.useRef<string | null>(null);

  const open = React.useCallback((params: {
    postId: number;
    centered?: boolean;
    onSyncCommentsCount?: (count: number) => void;
  }) => {
    // Если уже есть наш экран с комментариями — убираем его,
    // чтобы не плодить дубли.
    if (screenIdRef.current) {
      popScreen(screenIdRef.current);
      screenIdRef.current = null;
    }

    const id = pushScreen({
      node: (
        <PostProfileCommentsMobile
          open
          postId={params.postId}
          centered={params.centered}
          onSyncCommentsCount={params.onSyncCommentsCount}
          skipPortal
          onClose={() => {
            // Пользователь нажал стрелку / потянул вниз / ткнул в фон внутри
            // самого экрана с комментариями.
            //
            // Здесь логично закрывать ИМЕННО верхний экран,
            // потому что стрелка видна только у того, который сейчас на глазах.
            closeTopScreen();
          }}
        />
      ),
      // Внешний контейнер — прозрачный, фон и диммер рисует сам PostProfileCommentsMobile
      className: 'bg-transparent',
      backdrop: 'none',
      // Закрытие управляется самим компонентом (через onClose),
      // а не кликом по внешнему backdrop'у ScreenLayerMount
      dismissible: false,
      blockScroll: true,
      ariaLabel: 'Комментарии к посту',
      onClose: () => {
        // Слой реально снят из стэка (через back-жест, closeTopScreen или popScreen)
        screenIdRef.current = null;
      },
    });

    screenIdRef.current = id;

    return id;
  }, [pushScreen, popScreen, closeTopScreen]);

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
