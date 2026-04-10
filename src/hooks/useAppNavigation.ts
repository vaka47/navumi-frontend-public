'use client';

import React from 'react';
import { rememberReturn } from '@/lib/navBack';
import { saveMainScroll } from '@/lib/scrollRestoration';
import { usePostOverlay } from '@/hooks/usePostOverlay';
import { useProfilePostOverlay } from '@/hooks/useProfilePostOverlay';
import { useProfileOverlay } from '@/hooks/useProfileOverlay';
import { useCampOverlay } from '@/hooks/useCampOverlay';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import type { SearchParamsShape } from '@/components/navigation/AppScreenBridge';

type MouseEvt = React.MouseEvent<HTMLElement, MouseEvent>;

export type PostNavigationTarget = {
  username: string;
  postId: number | string;
  searchParams?: SearchParamsShape;
};

export type ProfileNavigationTarget = {
  username: string;
  searchParams?: SearchParamsShape;
};

export type CampNavigationTarget = {
  username?: string | null;
  campNumber?: string | number | null;
  campPath?: string | null;
  campId?: string | number | null;
  searchParams?: SearchParamsShape;
};

type NavigateOptions = {
  saveScroll?: boolean;
  remember?: boolean;
};

export function useAppNavigation() {
  const openPostOverlay = usePostOverlay();
  const openProfilePostOverlay = useProfilePostOverlay();
  const openProfileOverlay = useProfileOverlay();
  const openCampOverlay = useCampOverlay();
  const isMobile = useIsMobile();

  const isPlainLeftClick = React.useCallback((event?: MouseEvt | null) => {
    if (!event) return true;
    if (event.button !== undefined && event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    return true;
  }, []);

  const suppressDefault = React.useCallback((event?: MouseEvt | null) => {
    if (!event) return;
    try {
      event.preventDefault();
    } catch {
      /* noop */
    }
  }, []);

  const navigatePost = React.useCallback((
    event: MouseEvt | null,
    target: PostNavigationTarget,
    options?: NavigateOptions,
  ) => {
    if (!target?.username || target.postId === undefined || target.postId === null) return false;
    if (!isPlainLeftClick(event)) return false;
    suppressDefault(event);
    if (options?.saveScroll !== false) saveMainScroll();
    if (options?.remember !== false) {
      try { rememberReturn('post'); } catch { /* noop */ }
    }
    // Для мобильных устройств используем useProfilePostOverlay для постов профиля
    if (isMobile) {
      openProfilePostOverlay(target);
    } else {
      openPostOverlay(target);
    }
    return true;
  }, [isPlainLeftClick, suppressDefault, openPostOverlay, openProfilePostOverlay, isMobile]);

  const navigateProfile = React.useCallback((
    event: MouseEvt | null,
    target: ProfileNavigationTarget,
    options?: NavigateOptions,
  ) => {
    if (!target?.username) return false;
    if (!isPlainLeftClick(event)) return false;
    suppressDefault(event);
    if (options?.saveScroll !== false) saveMainScroll();
    if (options?.remember !== false) {
      try { rememberReturn('profile'); } catch { /* noop */ }
    }
    openProfileOverlay(target);
    return true;
  }, [isPlainLeftClick, suppressDefault, openProfileOverlay]);

  const navigateCamp = React.useCallback((
    event: MouseEvt | null,
    target: CampNavigationTarget,
    options?: NavigateOptions,
  ) => {
    if (!target?.username && !target?.campNumber && !target?.campPath && !target?.campId) return false;
    if (!isPlainLeftClick(event)) return false;
    suppressDefault(event);
    if (options?.saveScroll !== false) saveMainScroll();
    if (options?.remember !== false) {
      try { rememberReturn('camp'); } catch { /* noop */ }
    }
    openCampOverlay(target);
    return true;
  }, [isPlainLeftClick, suppressDefault, openCampOverlay]);

  return {
    navigatePost,
    navigateProfile,
    navigateCamp,
  };
}
