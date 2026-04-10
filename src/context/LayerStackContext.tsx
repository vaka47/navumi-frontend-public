'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { OverlayEnvironmentProvider } from './OverlayEnvironmentContext';

type ScreenBackdrop = 'dim' | 'transparent' | 'none';
type ScreenPresentation = 'default' | 'bottom-sheet';

export type ScreenLayerInput = {
  id?: string;
  node: React.ReactNode;
  backdrop?: ScreenBackdrop;
  dismissible?: boolean;
  onClose?: () => void;
  className?: string;
  blockScroll?: boolean;
  ariaLabel?: string;
  presentation?: ScreenPresentation;
};

export type ModalLayerInput = {
  id?: string;
  node: React.ReactNode;
  zIndex?: number;
  onClose?: () => void;
};

export type ScreenLayer = Required<Omit<ScreenLayerInput, 'id'>> & { id: string };
export type ModalLayer = Required<Omit<ModalLayerInput, 'id' | 'zIndex'>> & { id: string; zIndex: number };

type LayerContextValue = {
  screens: ScreenLayer[];
  modals: ModalLayer[];
  /**
   * Базовый href, с которого был открыт первый overlay‑экран.
   * Пока есть хотя бы один экран в стеке, это значение остаётся
   * стабильным и позволяет layout/хедеру/навбару понимать,
   * какая «подложка» находится под оверлеями (например, /search).
   * Когда стек пуст, primaryHref === null.
   */
  primaryHref: string | null;
  pushScreen(input: ScreenLayerInput): string;
  replaceTopScreen(input: ScreenLayerInput): string;
  popScreen(targetId?: string): void;
  closeTopScreen(): void;
  clearScreens(): void;
  openModal(input: ModalLayerInput): string;
  closeModal(targetId?: string): void;
};

const LayerStackContext = React.createContext<LayerContextValue | null>(null);

let layerCounter = 0;
const nextId = () => `layer_${Date.now().toString(36)}_${(++layerCounter).toString(36)}`;

const DEFAULT_BACKDROP: ScreenBackdrop = 'dim';
const DEFAULT_PRESENTATION: ScreenPresentation = 'default';

export function LayerProvider({ children }: { children: React.ReactNode }) {
  const [screens, setScreens] = React.useState<ScreenLayer[]>([]);
  const [modals, setModals] = React.useState<ModalLayer[]>([]);
  const [primaryHref, setPrimaryHref] = React.useState<string | null>(null);
  const overlayHistoryRef = React.useRef<string[]>([]);
  const overlayEntryRef = React.useRef<{ id: string; prevHref: string }[]>([]);

  const pushScreen = React.useCallback((input: ScreenLayerInput) => {
    const id = input.id ?? nextId();
    const layer: ScreenLayer = {
      id,
      node: input.node,
      backdrop: input.backdrop ?? DEFAULT_BACKDROP,
      dismissible: input.dismissible ?? true,
      onClose: input.onClose ?? (() => {}),
      className: input.className ?? '',
      blockScroll: input.blockScroll ?? true,
      ariaLabel: input.ariaLabel ?? '',
      presentation: input.presentation ?? DEFAULT_PRESENTATION,
    };
    setScreens(prev => [...prev, layer]);
    if (typeof window !== 'undefined') {
      try {
        const prevHref = window.location.pathname + window.location.search;
        // Для самого первого экрана запоминаем базовый href,
        // чтобы layout/хедер/навбар могли «видеть» подложку.
        if (!overlayHistoryRef.current.length) {
          setPrimaryHref(prev => prev ?? prevHref);
        }
        overlayHistoryRef.current.push(id);
        overlayEntryRef.current.push({ id, prevHref });
        window.history.pushState({ navumiOverlay: id }, '', window.location.href);
        // console.info('[LayerStack] pushScreen', {
        //   id,
        //   prevHref,
        //   hrefAfterPush: window.location.href,
        //   overlayIds: overlayHistoryRef.current.slice(),
        //   entries: overlayEntryRef.current.slice(),
        // });
      } catch { /* noop */ }
    }
    return id;
  }, []);

  const replaceTopScreen = React.useCallback((input: ScreenLayerInput) => {
    const id = input.id ?? nextId();
    const layer: ScreenLayer = {
      id,
      node: input.node,
      backdrop: input.backdrop ?? DEFAULT_BACKDROP,
      dismissible: input.dismissible ?? true,
      onClose: input.onClose ?? (() => {}),
      className: input.className ?? '',
      blockScroll: input.blockScroll ?? true,
      ariaLabel: input.ariaLabel ?? '',
      presentation: input.presentation ?? DEFAULT_PRESENTATION,
    };
    setScreens(prev => {
      if (!prev.length) return [layer];
      const next = prev.slice(0, -1);
      const top = prev[prev.length - 1];
      setTimeout(() => top.onClose?.(), 0);
      return [...next, layer];
    });
    if (typeof window !== 'undefined' && overlayHistoryRef.current.length) {
      overlayHistoryRef.current[overlayHistoryRef.current.length - 1] = id;
    }
    return id;
  }, []);

  const forcePopScreen = React.useCallback((targetId?: string) => {
    setScreens(prev => {
      if (!prev.length) return prev;
      const idx = typeof targetId === 'string'
        ? prev.findIndex(l => l.id === targetId)
        : prev.length - 1;
      if (idx < 0) return prev;
      const layer = prev[idx];
      setTimeout(() => layer.onClose?.(), 0);
      if (idx === prev.length - 1 && typeof window !== 'undefined') {
        const stack = overlayHistoryRef.current;
        if (stack[stack.length - 1] === layer.id) stack.pop();
        const meta = overlayEntryRef.current;
        if (meta.length && meta[meta.length - 1].id === layer.id) {
          meta.pop();
        } else {
          const mIdx = meta.findIndex(entry => entry.id === layer.id);
          if (mIdx >= 0) meta.splice(mIdx, 1);
        }
        try {
        // console.info('[LayerStack] forcePopScreen', {
        //   id: layer.id,
        //   targetId,
        //   hrefBefore: window.location.href,
        //   overlayIds: stack.slice(),
        //   entries: meta.slice(),
        // });
        } catch { /* noop */ }
      }
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  }, []);

  const closeTopScreen = React.useCallback(() => {
    if (typeof window === 'undefined') {
      forcePopScreen();
      return;
    }
    const meta = overlayEntryRef.current;
    const last = meta[meta.length - 1] ?? null;
    const prevHref = last?.prevHref ?? null;
    try {
      // console.info('[LayerStack] closeTopScreen', {
      //   lastId: last?.id ?? null,
      //   prevHref,
      //   hrefBefore: window.location.href,
      //   overlayIds: overlayHistoryRef.current.slice(),
      //   entries: meta.slice(),
      // });
    } catch { /* noop */ }

    // Сначала возвращаем URL в исходное состояние, чтобы все дочерние
    // компоненты (Header, BottomNav, SearchPage) при следующем рендере
    // увидели уже «правильный» pathname.
    if (prevHref) {
      try {
        window.history.replaceState(window.history.state, '', prevHref);
      } catch {
        /* noop */
      }
    }

    // Затем снимаем верхний слой, что триггерит перерендер потребителей контекста.
    forcePopScreen();
  }, [forcePopScreen]);

  const clearScreens = React.useCallback(() => {
    if (typeof window !== 'undefined') {
      overlayHistoryRef.current = [];
      overlayEntryRef.current = [];
    }
    setPrimaryHref(null);
    setScreens(prev => {
      prev.forEach(layer => { setTimeout(() => layer.onClose?.(), 0); });
      return [];
    });
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      if (!overlayHistoryRef.current.length) return;
      const topId = overlayHistoryRef.current.pop();
      if (!topId) return;
      const meta = overlayEntryRef.current;
      if (meta.length && meta[meta.length - 1].id === topId) {
        meta.pop();
      } else {
        const mIdx = meta.findIndex(entry => entry.id === topId);
        if (mIdx >= 0) meta.splice(mIdx, 1);
      }
      try {
        // console.info('[LayerStack] popstate', {
        //   topId,
        //   hrefAfter: window.location.href,
        //   overlayIds: overlayHistoryRef.current.slice(),
        //   entries: meta.slice(),
        // });
      } catch { /* noop */ }
      setScreens(prev => {
        if (!prev.length) return prev;
        const idx = prev.findIndex(layer => layer.id === topId);
        if (idx < 0) return prev;
        const layer = prev[idx];
        setTimeout(() => layer.onClose?.(), 0);
        return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const openModal = React.useCallback((input: ModalLayerInput) => {
    const id = input.id ?? nextId();
    const layer: ModalLayer = {
      id,
      node: input.node,
      onClose: input.onClose ?? (() => {}),
      zIndex: input.zIndex ?? 4000,
    };
    setModals(prev => [...prev, layer]);
    return id;
  }, []);

  const closeModal = React.useCallback((targetId?: string) => {
    setModals(prev => {
      if (!prev.length) return prev;
      const idx = typeof targetId === 'string'
        ? prev.findIndex(l => l.id === targetId)
        : prev.length - 1;
      if (idx < 0) return prev;
      const layer = prev[idx];
      setTimeout(() => layer.onClose?.(), 0);
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  }, []);

  // Как только стек экранов опустел, сбрасываем primaryHref.
  React.useEffect(() => {
    if (!screens.length && primaryHref !== null) {
      setPrimaryHref(null);
    }
  }, [screens.length, primaryHref]);

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    const shouldLock = screens.some(l => l.blockScroll);
    if (!shouldLock) return;
    const prevOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = prevOverflow;
    };
  }, [screens]);

  const value = React.useMemo<LayerContextValue>(() => ({
    screens,
    modals,
    primaryHref,
    pushScreen,
    replaceTopScreen,
    popScreen: forcePopScreen,
    closeTopScreen,
    clearScreens,
    openModal,
    closeModal,
  }), [screens, modals, primaryHref, pushScreen, replaceTopScreen, forcePopScreen, closeTopScreen, clearScreens, openModal, closeModal]);

  return (
    <LayerStackContext.Provider value={value}>
      {children}
      <ScreenPortal screens={screens} popScreen={forcePopScreen} closeTopScreen={closeTopScreen} />
      <ModalPortal modals={modals} />
    </LayerStackContext.Provider>
  );
}

export function useLayerStack() {
  const ctx = React.useContext(LayerStackContext);
  if (!ctx) throw new Error('LayerStackContext is missing. Wrap tree with <LayerProvider>.');
  return ctx;
}

function usePortalHost(id: string) {
  const hostRef = React.useRef<Element | null>(null);
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
    }
    hostRef.current = el;
    setReady(true);
    return () => {
      if (hostRef.current && hostRef.current.childNodes.length === 0) {
        hostRef.current.remove();
      }
    };
  }, [id]);
  return ready ? hostRef.current : null;
}

function LayerPortal({ id, children }: { id: string; children: React.ReactNode }) {
  const host = usePortalHost(id);
  if (!host) return null;
  return createPortal(children, host);
}

function ScreenPortal({
  screens,
  popScreen,
  closeTopScreen,
}: {
  screens: ScreenLayer[];
  popScreen: (id?: string) => void;
  closeTopScreen: () => void;
}) {
  if (!screens.length) return null;
  return (
    <LayerPortal id="app-screen-layers">
      <div className="pointer-events-none fixed inset-0 z-[3000] flex flex-col">
        {screens.map((layer, index) => (
          <ScreenLayerMount
            key={layer.id}
            layer={layer}
            index={index}
            isTop={index === screens.length - 1}
            total={screens.length}
            popScreen={popScreen}
            closeTopScreen={closeTopScreen}
          />
        ))}
      </div>
    </LayerPortal>
  );
}

function ScreenLayerMount({
  layer,
  index,
  isTop,
  total,
  popScreen,
  closeTopScreen,
}: {
  layer: ScreenLayer;
  index: number;
  isTop: boolean;
  total: number;
  popScreen: (id?: string) => void;
  closeTopScreen: () => void;
}) {
  const [ready, setReady] = React.useState(false);
  const [dragOffset, setDragOffset] = React.useState(0);
  const dragStateRef = React.useRef<{ pointerId: number; startCoord: number; startTime: number } | null>(null);
  const [isClosing, setIsClosing] = React.useState(false);
  const exitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBottomSheet = layer.presentation === 'bottom-sheet';

  React.useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, [layer.id]);

  React.useEffect(() => () => {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }, []);

  const handleClose = React.useCallback(() => {
    if (isTop) {
      closeTopScreen();
    } else {
      popScreen(layer.id);
    }
  }, [isTop, closeTopScreen, popScreen, layer.id]);
  const overlayValue = React.useMemo(() => ({ isOverlay: true, close: handleClose }), [handleClose]);
  const z = 3100 + index * 10;
  const dismissible = layer.dismissible !== false;
  const gestureEnabled = dismissible && isTop;
  const depthFromTop = total - 1 - index;
  // При небольшом числе слоёв показываем все экраны.
  // При очень глубоком стеке прячем только самые нижние слои,
  // оставляя верхние несколько видимыми. Так мы снижаем нагрузку
  // и вероятность «просветов» при анимациях, но при этом
  // сохраняем контекст под частично прозрачными модалками.
  const visible = total <= 10 || depthFromTop <= 5;

  const finishDrag = React.useCallback((shouldClose: boolean) => {
    if (shouldClose) {
      setIsClosing(true);
      const viewportSize = typeof window !== 'undefined'
        ? (isBottomSheet ? (window.visualViewport?.height ?? window.innerHeight) : window.innerWidth)
        : 360;
      setDragOffset(Math.max(0, viewportSize || 0));
      exitTimerRef.current = setTimeout(() => {
        closeTopScreen();
      }, 160);
    } else {
      setDragOffset(0);
    }
    dragStateRef.current = null;
  }, [closeTopScreen, isBottomSheet]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!gestureEnabled || isClosing) return;
    const pointerType = event.pointerType || 'mouse';
    const edgeLimit = pointerType === 'mouse' ? 24 : 60;
    if (!isBottomSheet && event.clientX > edgeLimit) return;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startCoord: isBottomSheet ? event.clientY : event.clientX,
      startTime: event.timeStamp,
    };
    setDragOffset(0);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* noop */ }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = Math.max(0, (isBottomSheet ? event.clientY : event.clientX) - drag.startCoord);
    setDragOffset(delta);
  };

  const releasePointer = (target: EventTarget | null, pointerId: number) => {
    if (target && 'releasePointerCapture' in target) {
      try { (target as HTMLElement).releasePointerCapture(pointerId); } catch { /* noop */ }
    }
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const currentCoord = isBottomSheet ? event.clientY : event.clientX;
    const delta = Math.max(0, currentCoord - drag.startCoord);
    const elapsed = Math.max(1, event.timeStamp - drag.startTime);
    const velocity = delta / elapsed;
    const viewportSize = typeof window !== 'undefined'
      ? (isBottomSheet ? (window.visualViewport?.height ?? window.innerHeight) : window.innerWidth)
      : 360;
    const shouldClose = isBottomSheet
      ? delta > (viewportSize || 360) * 0.28 || (delta > 60 && velocity > 0.65)
      : delta > (viewportSize || 360) * 0.35 || (delta > 60 && velocity > 0.6);
    finishDrag(shouldClose);
    releasePointer(event.currentTarget, event.pointerId);
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    finishDrag(false);
    releasePointer(event.currentTarget, event.pointerId);
  };

  const baseTranslate = ready ? 0 : (isBottomSheet ? 64 : 36);
  const activeTranslate = dragOffset + baseTranslate;
  const isDragging = dragStateRef.current !== null && !isClosing;
  const transition = (!ready || isDragging) ? 'none' : 'transform 220ms ease, opacity 200ms ease';
  const opacity = ready ? 1 : 0.98;

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        zIndex: z,
        visibility: visible ? 'visible' : 'hidden',
      }}
    >
      {layer.backdrop !== 'none' && (
        <button
          type="button"
          aria-label={layer.ariaLabel || 'Закрыть экран'}
          className={clsx(
            'absolute inset-0 w-full h-full',
            layer.backdrop === 'dim' ? 'bg-black/50' : 'bg-transparent'
          )}
          style={{ pointerEvents: dismissible && isTop ? 'auto' : 'none' }}
          onClick={() => {
            if (dismissible && isTop) closeTopScreen();
          }}
        />
      )}
      <div
        className={clsx(
          'pointer-events-auto absolute inset-0 flex flex-col',
          layer.className || 'bg-white'
        )}
        style={{
          transform: isBottomSheet
            ? `translate3d(0, ${activeTranslate}px, 0)`
            : `translate3d(${activeTranslate}px,0,0)`,
          opacity,
          transition,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerCancel}
      >
        <OverlayEnvironmentProvider value={overlayValue}>
          {layer.node}
        </OverlayEnvironmentProvider>
      </div>
    </div>
  );
}

function ModalPortal({ modals }: { modals: ModalLayer[] }) {
  if (!modals.length) return null;
  return (
    <LayerPortal id="app-modal-layers">
      <>
        {modals.map((layer, index) => (
          <div
            key={layer.id}
            className="fixed inset-0 pointer-events-none"
            style={{ zIndex: layer.zIndex + index * 2 }}
          >
            <div className="pointer-events-auto">
              {layer.node}
            </div>
          </div>
        ))}
      </>
    </LayerPortal>
  );
}
