'use client';

import React from 'react';
import { useLayerStack } from '@/context/LayerStackContext';
import { AppScreenBridge, type SearchParamsShape } from '@/components/navigation/AppScreenBridge';
import MobilePostPageClient from '@/app/m/[username]/post/[postId]/MobilePostPageClient';
import { rememberReturn } from '@/lib/navBack';

type OpenProfilePostOverlayParams = {
  username: string;
  postId: string | number;
  searchParams?: SearchParamsShape;
};

export function useProfilePostOverlay() {
  const { pushScreen } = useLayerStack();

  return React.useCallback((params: OpenProfilePostOverlayParams) => {
    const username = (params.username || '').replace(/^@+/, '').trim();
    const postId = String(params.postId ?? '').trim();
    if (!username || !postId) return;
    try {
      rememberReturn('post');
    } catch {
      // noop
    }
    const pathname = `/m/${username}/post/${postId}`;
    const node = (
      <AppScreenBridge
        pathname={pathname}
        params={{ username, postId }}
        searchParams={params.searchParams}
      >
        <MobilePostPageClient username={username} postId={postId} />
      </AppScreenBridge>
    );
    pushScreen({
      node,
      className: 'bg-white',
      backdrop: 'dim',
      ariaLabel: 'Закрыть пост профиля',
      dismissible: true,
      blockScroll: true,
    });
  }, [pushScreen]);
}
