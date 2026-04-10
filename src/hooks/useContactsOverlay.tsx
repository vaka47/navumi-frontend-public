"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useLayerStack } from "@/context/LayerStackContext";
import { useOverlayEnvironment, OverlayEnvironmentProvider } from "@/context/OverlayEnvironmentContext";
import BottomNavBar from "@/components/BottomNavBar";
import ContactsPage from "@/app/contacts/page";

function ContactsOverlayShell() {
  const baseRouter = useRouter();
  const { screens, popScreen } = useLayerStack();
  const overlayEnv = useOverlayEnvironment();

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
          id="contacts-overlay-main"
          data-scroll-root
          className="flex-1 min-h-0 overflow-y-auto"
        >
          <ContactsPage />
        </main>
        <div className="shrink-0">
          <BottomNavBar />
        </div>
      </div>
    </OverlayEnvironmentProvider>
  );
}

export function useContactsOverlay() {
  const { pushScreen } = useLayerStack();

  return React.useCallback(() => {
    const node = <ContactsOverlayShell />;
    pushScreen({
      node,
      className: "bg-muted flex flex-col",
      backdrop: "dim",
      ariaLabel: "Закрыть страницу контактов",
      dismissible: true,
      blockScroll: true,
    });
  }, [pushScreen]);
}

