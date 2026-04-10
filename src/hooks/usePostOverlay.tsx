'use client';

import React from 'react';
import { useLayerStack } from '@/context/LayerStackContext';
import { AppScreenBridge, type SearchParamsShape } from '@/components/navigation/AppScreenBridge';
import PostPageClient from '@/app/[username]/post/[postId]/PostPageClient';
import MobilePostPageClient from '@/app/m/[username]/post/[postId]/MobilePostPageClient';
import { rememberReturn } from '@/lib/navBack';
import { useIsMobile } from '@/lib/hooks/useIsMobile';

type OpenPostOverlayParams = {
  username: string;
  postId: string | number;
  searchParams?: SearchParamsShape;
};

export function usePostOverlay() {
  const { pushScreen } = useLayerStack();
  const isMobile = useIsMobile();

  return React.useCallback((params: OpenPostOverlayParams) => {
    const username = (params.username || '').replace(/^@+/, '').trim();
    const postId = String(params.postId ?? '').trim();
    if (!username || !postId) return;
    try {
      rememberReturn('post');
    } catch {
      // noop
    }
    const pathname = isMobile
      ? `/m/${username}/post/${postId}`
      : `/${username}/post/${postId}`;
    const node = (
      <AppScreenBridge
        pathname={pathname}
        params={{ username, postId }}
        searchParams={params.searchParams}
      >
        {isMobile
          ? <MobilePostPageClient username={username} postId={postId} />
          : <PostPageClient username={username} postId={postId} />
        }
      </AppScreenBridge>
    );
    pushScreen({
      node,
      className: 'bg-white',
      backdrop: 'dim',
      ariaLabel: 'Закрыть пост',
      dismissible: true,
      blockScroll: true,
    });
  }, [pushScreen, isMobile]);
}
