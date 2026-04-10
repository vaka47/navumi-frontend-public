'use client';

import React from 'react';
import { useLayerStack } from '@/context/LayerStackContext';
import GuestMenuModal from '@/components/header/GuestMenuModal';

export function useGuestMenuModal() {
  const { pushScreen, popScreen, closeTopScreen } = useLayerStack();
  const screenIdRef = React.useRef<string | null>(null);

  const open = React.useCallback(() => {
    // Если уже есть наш экран с меню — убираем его,
    // чтобы не плодить дубли.
    if (screenIdRef.current) {
      popScreen(screenIdRef.current);
      screenIdRef.current = null;
    }

    const id = pushScreen({
      node: (
        <GuestMenuModal
          open
          skipPortal
          onClose={() => {
            // Пользователь нажал "Закрыть" / ткнул в фон внутри
            // самого экрана с меню.
            //
            // Здесь логично закрывать ИМЕННО верхний экран,
            // потому что кнопка видна только у того, который сейчас на глазах.
            closeTopScreen();
          }}
        />
      ),
      // Внешний контейнер — прозрачный, фон и диммер рисует сам GuestMenuModal
      className: 'bg-transparent',
      backdrop: 'none',
      // Закрытие управляется самим компонентом (через onClose),
      // а не кликом по внешнему backdrop'у ScreenLayerMount
      dismissible: false,
      blockScroll: true,
      ariaLabel: 'Гостевое меню',
      onClose: () => {
        // Слой реально снят из стэка (через back-жест, closeTopScreen или popScreen)
        screenIdRef.current = null;
      },
    });

    screenIdRef.current = id;

    try {
      // eslint-disable-next-line no-console
      console.info('[useGuestMenuModal] open screen', { id });
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

