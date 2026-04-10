'use client';

import React from 'react';
import { createPortal } from 'react-dom';

const MODAL_HOST_ID = 'app-modal-layers';

function useModalHost() {
  const initialHost =
    typeof document === 'undefined'
      ? null
      : (document.getElementById(MODAL_HOST_ID) as HTMLElement | null) ?? document.body;
  const hostRef = React.useRef<HTMLElement | null>(initialHost);

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const existing = document.getElementById(MODAL_HOST_ID);
    hostRef.current = (existing as HTMLElement | null) ?? document.body;
  }, []);

  return hostRef.current;
}

export function ModalLayerPortal({ children }: { children: React.ReactNode }) {
  const host = useModalHost();
  if (!host) return null;
  return createPortal(children, host);
}
