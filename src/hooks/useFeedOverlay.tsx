"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useLayerStack } from "@/context/LayerStackContext";
import { useOverlayEnvironment, OverlayEnvironmentProvider } from "@/context/OverlayEnvironmentContext";
import BottomNavBar from "@/components/BottomNavBar";
import FeedPage from "@/app/feed/page";
import Header from "@/components/header";
import { AppScreenBridge } from "@/components/navigation/AppScreenBridge";

function FeedOverlayShell() {
  const baseRouter = useRouter();
  const { screens, popScreen } = useLayerStack();
  const overlayEnv = useOverlayEnvironment();

  // В оверлее ленты navigate закрывает все экраны и делает SPA‑переход.
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
      <AppScreenBridge pathname="/feed">
        <div className="h-[100dvh] flex flex-col bg-muted">
          <Header />
          <main
            id="feed-overlay-main"
            data-scroll-root
            className="flex-1 min-h-0 overflow-y-auto"
            style={{ paddingTop: 'var(--header-h, 64px)' }}
          >
            <FeedPage />
          </main>
          <div className="shrink-0">
            <BottomNavBar />
          </div>
        </div>
      </AppScreenBridge>
    </OverlayEnvironmentProvider>
  );
}

export function useFeedOverlay() {
  const { pushScreen } = useLayerStack();

  return React.useCallback(() => {
    const node = <FeedOverlayShell />;
    pushScreen({
      node,
      className: "bg-muted flex flex-col",
      backdrop: "dim",
      ariaLabel: "Закрыть ленту",
      dismissible: true,
      blockScroll: true,
    });
  }, [pushScreen]);
}
