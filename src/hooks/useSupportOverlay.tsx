"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useLayerStack } from "@/context/LayerStackContext";
import { useOverlayEnvironment, OverlayEnvironmentProvider } from "@/context/OverlayEnvironmentContext";
import BottomNavBar from "@/components/BottomNavBar";
import SupportPage from "@/app/support/page";

function SupportOverlayShell() {
  const baseRouter = useRouter();
  const { screens, popScreen } = useLayerStack();
  const overlayEnv = useOverlayEnvironment();

  // navigate из оверлея: закрывает все экраны и делает SPA‑переход.
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
      <div className="h-[100dvh] flex flex-col bg-muted">
        <main
          id="support-overlay-main"
          data-scroll-root
          className="flex-1 min-h-0 overflow-y-auto"
        >
          <SupportPage />
        </main>
        <div className="shrink-0">
          <BottomNavBar />
        </div>
      </div>
    </OverlayEnvironmentProvider>
  );
}

export function useSupportOverlay() {
  const { pushScreen } = useLayerStack();

  return React.useCallback(() => {
    const node = <SupportOverlayShell />;
    pushScreen({
      node,
      className: "bg-muted flex flex-col",
      backdrop: "dim",
      ariaLabel: "Закрыть страницу поддержки",
      dismissible: true,
      blockScroll: true,
    });
  }, [pushScreen]);
}

