'use client';

import React from 'react';
import { AppScreenBridge, type SearchParamsShape } from '@/components/navigation/AppScreenBridge';
import { useLayerStack } from '@/context/LayerStackContext';
import CreatePostProfileMobilePage from '@/components/post/CreatePostProfileMobilePage';

type OpenCreateProfilePostOverlayParams = {
  searchParams?: SearchParamsShape;
};

export function useCreateProfilePostOverlay() {
  const { pushScreen, popScreen } = useLayerStack();

  return React.useCallback((params?: OpenCreateProfilePostOverlayParams) => {
    try {
      // eslint-disable-next-line no-console
      console.log('[useCreateProfilePostOverlay] open', {
        hasParams: !!params,
        searchParams: params?.searchParams,
      });
    } catch { /* noop */ }
    let screenId: string | null = null;
    const handleCreated = () => {
      if (!screenId) return;
      popScreen(screenId);
      screenId = null;
      window.removeEventListener('profile_post_created', handleCreated);
    };

    const node = (
      <AppScreenBridge
        pathname="/create-post/profile/mobile"
        searchParams={params?.searchParams}
      >
        <CreatePostProfileMobilePage />
      </AppScreenBridge>
    );

    const id = pushScreen({
      node,
      className: 'bg-white',
      backdrop: 'dim',
      ariaLabel: 'Закрыть создание поста',
      dismissible: true,
      blockScroll: true,
      presentation: 'bottom-sheet',
      onClose: () => {
        window.removeEventListener('profile_post_created', handleCreated);
      },
    });
    screenId = id;
    try {
      // eslint-disable-next-line no-console
      console.log('[useCreateProfilePostOverlay] pushed screen', {
        screenId: id,
      });
    } catch { /* noop */ }
    if (typeof window !== 'undefined') {
      window.addEventListener('profile_post_created', handleCreated);
    }
    return id;
  }, [pushScreen, popScreen]);
}
