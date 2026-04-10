'use client';

import { usePathname } from 'next/navigation';
import { useLayerStack } from '@/context/LayerStackContext';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';

/**
 * Единое место, где вычисляем «эффективный» pathname,
 * который должны видеть глобальный Layout / Header / BottomNav.
 *
 *  - Внутри оверлеев (isOverlay === true) всегда возвращаем routerPathname,
 *    проброшенный через AppScreenBridge.
 *  - Вне оверлеев, пока стек экранов не пуст и есть primaryHref,
 *    используем именно его как базовый маршрут под стеком (например, /search),
 *    чтобы глобальные компоненты не «думали», что сейчас открыт /:username/camp/...
 *  - Когда стек пуст или primaryHref не задан, опираемся на routerPathname.
 */
export function useEffectivePathname(): string {
  const routerPathname = usePathname() || '';
  const { primaryHref, screens } = useLayerStack();
  const { isOverlay } = useOverlayEnvironment();

  // Внутри оверлейного дерева работаем только с виртуальным путём,
  // который пробрасывает AppScreenBridge.
  if (isOverlay) {
    return routerPathname;
  }

  // В корневом layout'е, пока есть хотя бы один экран в стеке,
  // интерпретируем маршрут как «подложку» под оверлеями.
  if (screens.length > 0 && primaryHref) {
    try {
      const url = new URL(primaryHref, 'https://dummy.navumi');
      return url.pathname || '';
    } catch {
      return primaryHref.split('?')[0] || '';
    }
  }

  return routerPathname;
}

