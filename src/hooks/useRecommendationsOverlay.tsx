"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useLayerStack } from "@/context/LayerStackContext";
import { useOverlayEnvironment, OverlayEnvironmentProvider } from "@/context/OverlayEnvironmentContext";
import BottomNavBar from "@/components/BottomNavBar";
import RecommendationsPage from "@/app/recommendations/page";
import { AppScreenBridge } from "@/components/navigation/AppScreenBridge";

function RecommendationsOverlayShell() {
  const baseRouter = useRouter();
  const { screens, popScreen } = useLayerStack();
  const overlayEnv = useOverlayEnvironment();

  // В оверлее рекомендаций navigate закрывает все экраны и делает SPA‑переход.
  const enhancedEnv = React.useMemo(() => {
    const navigate = (href: string, options?: unknown) => {
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
      <AppScreenBridge pathname="/recommendations">
        <div className="h-[100dvh] flex flex-col bg-muted">
          <main
            id="recommendations-overlay-main"
            data-scroll-root
            className="flex-1 min-h-0 overflow-y-auto"
          >
            <RecommendationsPage />
          </main>
          <div className="shrink-0">
            <BottomNavBar />
          </div>
        </div>
      </AppScreenBridge>
    </OverlayEnvironmentProvider>
  );
}

export function useRecommendationsOverlay() {
  const { pushScreen } = useLayerStack();

  return React.useCallback(() => {
    const node = <RecommendationsOverlayShell />;
    pushScreen({
      node,
      className: "bg-muted flex flex-col",
      backdrop: "dim",
      ariaLabel: "Закрыть рекомендации",
      dismissible: true,
      blockScroll: true,
    });
  }, [pushScreen]);
}

