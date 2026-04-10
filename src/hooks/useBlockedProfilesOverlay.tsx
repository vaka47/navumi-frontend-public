'use client';

import React from 'react';
import { useLayerStack } from '@/context/LayerStackContext';
import { AppScreenBridge } from '@/components/navigation/AppScreenBridge';
import BlockedProfilesPage from '@/components/profile/BlockedProfilesPage';
import { OverlayEnvironmentProvider } from '@/context/OverlayEnvironmentContext';

export function useBlockedProfilesOverlay() {
  const { openModal, closeModal } = useLayerStack();
  const modalIdRef = React.useRef<string | null>(null);
  const onCloseRef = React.useRef<(() => void) | null>(null);

  const open = React.useCallback((params?: { onClose?: () => void }) => {
    try { console.warn('[BlockedProfilesOverlay] open'); } catch { /* noop */ }
    if (modalIdRef.current) {
      try { console.warn('[BlockedProfilesOverlay] close existing', { id: modalIdRef.current }); } catch { /* noop */ }
      closeModal(modalIdRef.current);
      modalIdRef.current = null;
    }
    onCloseRef.current = params?.onClose ?? null;

    let id: string | null = null;
    const node = (
      <OverlayEnvironmentProvider value={{ isOverlay: true, close: () => { if (id) closeModal(id); } }}>
        <AppScreenBridge pathname="/settings/blocked-profiles" params={{}}>
          <BlockedProfilesPage />
        </AppScreenBridge>
      </OverlayEnvironmentProvider>
    );

    id = openModal({
      node,
      zIndex: 5000,
      onClose: () => {
        try { console.warn('[BlockedProfilesOverlay] onClose', { id }); } catch { /* noop */ }
        onCloseRef.current?.();
      },
    });
    try { console.warn('[BlockedProfilesOverlay] opened', { id }); } catch { /* noop */ }
    modalIdRef.current = id;
    return id;
  }, [openModal, closeModal]);

  const close = React.useCallback(() => {
    if (modalIdRef.current) {
      try { console.warn('[BlockedProfilesOverlay] close', { id: modalIdRef.current }); } catch { /* noop */ }
      onCloseRef.current?.();
      closeModal(modalIdRef.current);
      modalIdRef.current = null;
    }
  }, [closeModal]);

  React.useEffect(() => {
    return () => {
      if (modalIdRef.current) {
        closeModal(modalIdRef.current);
        modalIdRef.current = null;
      }
    };
  }, [closeModal]);

  return { open, close };
}
