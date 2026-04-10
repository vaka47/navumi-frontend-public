'use client';

import React from 'react';
import { useLayerStack } from '@/context/LayerStackContext';
import ProfileActionsModal from '@/components/profile/ProfileActionsModal';

type OpenParams = {
  onShare: () => void;
  onReport: () => void;
  onBlockToggle: () => void;
  onRemoveFollower?: () => void;
  blockLabel: string;
  blockDestructive?: boolean;
};

export function useProfileActionsModal() {
  const { pushScreen, popScreen, closeTopScreen } = useLayerStack();
  const screenIdRef = React.useRef<string | null>(null);

  const open = React.useCallback(({ onShare, onReport, onBlockToggle, onRemoveFollower, blockLabel, blockDestructive }: OpenParams) => {
    if (screenIdRef.current) {
      popScreen(screenIdRef.current);
      screenIdRef.current = null;
    }

    const id = pushScreen({
      node: (
        <ProfileActionsModal
          skipPortal
          onShare={onShare}
          onReport={onReport}
          onBlockToggle={onBlockToggle}
          onRemoveFollower={onRemoveFollower}
          blockLabel={blockLabel}
          blockDestructive={blockDestructive}
          onClose={() => closeTopScreen()}
        />
      ),
      className: 'bg-transparent',
      backdrop: 'none',
      dismissible: false,
      blockScroll: true,
      ariaLabel: 'Действия профиля',
      onClose: () => {
        if (screenIdRef.current === id) {
          screenIdRef.current = null;
        }
      },
    });

    screenIdRef.current = id;
    return id;
  }, [pushScreen, popScreen, closeTopScreen]);

  const close = React.useCallback(() => {
    if (screenIdRef.current) {
      popScreen(screenIdRef.current);
      screenIdRef.current = null;
      return;
    }
    closeTopScreen();
  }, [popScreen, closeTopScreen]);

  React.useEffect(() => {
    return () => {
      if (screenIdRef.current) {
        popScreen(screenIdRef.current);
        screenIdRef.current = null;
      }
    };
  }, [popScreen]);

  return { open, close };
}
