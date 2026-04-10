'use client';

import React from 'react';
import { useLayerStack } from '@/context/LayerStackContext';
import CommentActionSheet from '@/components/post/mobile/CommentActionSheet';

export function useCommentActionSheetModal() {
  const { pushScreen, popScreen, closeTopScreen } = useLayerStack();
  const screenIdRef = React.useRef<string | null>(null);

  const open = React.useCallback((params: {
    canReport?: boolean;
    canDelete?: boolean;
    onReport?: () => void | Promise<void>;
    onDelete?: () => void | Promise<void>;
  }) => {
    // Если уже есть наш экран с действиями — убираем его,
    // чтобы не плодить дубли.
    if (screenIdRef.current) {
      popScreen(screenIdRef.current);
      screenIdRef.current = null;
    }

    const id = pushScreen({
      node: (
        <CommentActionSheet
          open
          canReport={params.canReport}
          canDelete={params.canDelete}
          skipPortal
          onClose={() => {
            // Пользователь нажал "Отмена" / ткнул в фон внутри
            // самого экрана с действиями.
            //
            // Здесь логично закрывать ИМЕННО верхний экран,
            // потому что кнопка видна только у того, который сейчас на глазах.
            closeTopScreen();
          }}
          onReport={params.onReport}
          onDelete={params.onDelete}
        />
      ),
      // Внешний контейнер — прозрачный, фон и диммер рисует сам CommentActionSheet
      className: 'bg-transparent',
      backdrop: 'none',
      // Закрытие управляется самим компонентом (через onClose),
      // а не кликом по внешнему backdrop'у ScreenLayerMount
      dismissible: false,
      blockScroll: true,
      ariaLabel: 'Действия с комментарием',
      onClose: () => {
        // Слой реально снят из стэка (через back-жест, closeTopScreen или popScreen)
        screenIdRef.current = null;
      },
    });

    screenIdRef.current = id;

    try {
      // eslint-disable-next-line no-console
      console.info('[useCommentActionSheetModal] open screen', { id });
    } catch {
      /* noop */
    }

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

