"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useLayerStack } from "@/context/LayerStackContext";
import { useOverlayEnvironment, OverlayEnvironmentProvider } from "@/context/OverlayEnvironmentContext";
import BottomNavBar from "@/components/BottomNavBar";
import ActivityPage from "@/app/activity/page";
import { AppScreenBridge } from "@/components/navigation/AppScreenBridge";

function ActivityOverlayShell() {
  const baseRouter = useRouter();
  const { screens, popScreen } = useLayerStack();
  const overlayEnv = useOverlayEnvironment();

  React.useEffect(() => {
    try {
      console.log('[ActivityOverlayShell] mount', {
        screensCount: screens.length,
        isOverlay: overlayEnv.isOverlay,
      });
    } catch { /* noop */ }
  }, [screens.length, overlayEnv.isOverlay]);

  // Расширяем overlay‑окружение: navigate закрывает все экраны и делает SPA‑переход.
  const enhancedEnv = React.useMemo(() => {
    const navigate = (href: string, options?: unknown) => {
      try {
        console.log('[ActivityOverlayShell] navigate called', { href, screensCount: screens.length });
      } catch { /* noop */ }
      const total = screens.length;
      if (total > 0) {
        for (let i = 0; i < total; i += 1) {
          popScreen();
        }
      }
      baseRouter.push(href, options as never);
    };
    return {
      ...overlayEnv,
      navigate,
    };
  }, [overlayEnv, screens.length, popScreen, baseRouter]);

  return (
    <OverlayEnvironmentProvider value={enhancedEnv}>
      <AppScreenBridge pathname="/activity">
        <div className="h-[100dvh] flex flex-col bg-muted">
          <main
            id="activity-overlay-main"
            data-scroll-root
            className="flex-1 min-h-0 overflow-y-auto"
            style={{
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <ActivityPage />
          </main>
          <div className="shrink-0">
            <BottomNavBar />
          </div>
        </div>
      </AppScreenBridge>
    </OverlayEnvironmentProvider>
  );
}

export function useActivityOverlay() {
  const { pushScreen } = useLayerStack();

  return React.useCallback(() => {
    const node = <ActivityOverlayShell />;
    pushScreen({
      node,
      className: 'bg-muted flex flex-col',
      backdrop: 'dim',
      ariaLabel: 'Закрыть активность',
      dismissible: true,
      blockScroll: true,
    });
  }, [pushScreen]);
}
