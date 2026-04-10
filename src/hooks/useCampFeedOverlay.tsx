'use client';

import React from 'react';
import { useLayerStack } from '@/context/LayerStackContext';
import CampFeedTabsMobile, { type CampFeedTab } from '@/components/camp/CampFeedTabsMobile';
import type { Camp } from '@/components/camp/CampInfoSwitcher';

type OpenCampFeedOverlayParams = {
  camp: Camp;
  initialTab?: CampFeedTab;
  onCommentsCountChange?: (delta: number) => void;
  viewer?: { username?: string; isOrganizer?: boolean; isOwner?: boolean };
  onClosed?: () => void;
};

export function useCampFeedOverlay() {
  const { pushScreen, popScreen, closeTopScreen } = useLayerStack();
  const screenIdRef = React.useRef<string | null>(null);

  const open = React.useCallback((params: OpenCampFeedOverlayParams) => {
    if (screenIdRef.current) {
      popScreen(screenIdRef.current);
      screenIdRef.current = null;
    }

    const { camp, initialTab, onCommentsCountChange, viewer, onClosed } = params;

    const id = pushScreen({
      node: (
        <CampFeedBottomSheet
          camp={camp}
          initialTab={initialTab}
          viewer={viewer}
          onCommentsCountChange={onCommentsCountChange}
          onRequestClose={() => closeTopScreen()}
        />
      ),
      className: 'bg-transparent pointer-events-none',
      backdrop: 'none',
      presentation: 'bottom-sheet',
      dismissible: false,
      blockScroll: true,
      ariaLabel: 'Лента кэмпа',
      onClose: () => {
        screenIdRef.current = null;
        if (onClosed) {
          try {
            onClosed();
          } catch {
            /* noop */
          }
        }
      },
    });

    screenIdRef.current = id;

    try {
      // eslint-disable-next-line no-console
      console.info('[useCampFeedOverlay] open', { id });
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

  React.useEffect(
    () => () => {
      if (screenIdRef.current) {
        popScreen(screenIdRef.current);
        screenIdRef.current = null;
      }
    },
    [popScreen],
  );

  return { open, close };
}

function CampFeedBottomSheet({
  camp,
  initialTab,
  viewer,
  onCommentsCountChange,
  onRequestClose,
}: {
  camp: Camp;
  initialTab?: CampFeedTab;
  viewer?: { username?: string; isOrganizer?: boolean; isOwner?: boolean };
  onCommentsCountChange?: (delta: number) => void;
  onRequestClose: () => void;
}) {
  const sheetRef = React.useRef<HTMLDivElement | null>(null);
  const [topPx, setTopPx] = React.useState<number | null>(null);
  const [tab, setTab] = React.useState<CampFeedTab | undefined>(initialTab);

  React.useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const compute = () => {
      const vv = (window as Window & { visualViewport?: VisualViewport }).visualViewport;
      const vh = (vv?.height ?? window.innerHeight ?? document.documentElement.clientHeight ?? 0);
      const topbarHRaw = getComputedStyle(document.documentElement).getPropertyValue('--camp-topbar-h');
      const topbarEl = document.getElementById('camp-topbar');
      const measuredTopbar = topbarEl ? topbarEl.getBoundingClientRect().height : 0;
      const topbarH = measuredTopbar || (topbarHRaw ? Number.parseFloat(topbarHRaw) || 0 : 0);
      const targetHeight = Math.round(vh * (5 / 6)); // 5/6 экрана
      const candidateTop = Math.max(0, vh - targetHeight);
      const minTop = topbarH + 8;
      const nextTop = Math.max(candidateTop, minTop);
      setTopPx(nextTop);
      try {
        // eslint-disable-next-line no-console
        console.info('[CampFeedBottomSheet] layout', {
          vh,
          topbarH,
          targetHeight,
          candidateTop,
          minTop,
          nextTop,
        });
      } catch {
        /* noop */
      }
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  // Закрытие по клику по фону над шторкой
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onRequestClose();
    }
  };

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[2600] flex flex-col justify-end"
      onClick={handleOverlayClick}
    >
      <div
        ref={sheetRef}
        className="relative w-full bg-white rounded-t-2xl shadow-2xl border-t border-gray-200 flex flex-col overflow-hidden"
        style={{
          height: topPx != null ? `calc(100dvh - ${topPx}px)` : '80vh',
        }}
      >
        <div className="flex items-center justify-center pt-1 pb-1">
          <div className="h-1.5 w-12 rounded-full bg-gray-300" />
        </div>
        <CampFeedTabsMobile
          camp={camp}
          activeTab={tab}
          onTabChange={(next) => setTab(next)}
          onCommentsCountChange={onCommentsCountChange}
          viewer={viewer}
          stickyTopPx={0}
          fixedHeightMode={true}
          overlayMode={true}
          onViewportHeightChange={() => { }}
          onRequestExitTop={onRequestClose}
          onRequestEngage={undefined}
          contentInteractive={true}
        />
      </div>
    </div>
  );
}
