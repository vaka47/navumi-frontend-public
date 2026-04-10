'use client';

import React from 'react';
import { useLayerStack } from '@/context/LayerStackContext';
import { rememberReturn } from '@/lib/navBack';
import { AppScreenBridge, type SearchParamsShape } from '@/components/navigation/AppScreenBridge';
import CampScreen from '@/components/camp/CampScreen';

export type CampOverlayTarget = {
  username?: string | null;
  campNumber?: string | number | null;
  campPath?: string | null;
  campId?: string | number | null;
  searchParams?: SearchParamsShape;
};

const CAMP_DEBUG_KEY = 'NAVUMI_CAMP_DEBUG';

const shouldLogCampDebug = () => {
  try {
    if (process.env.NODE_ENV !== 'production') return true;
    if (typeof window !== 'undefined') {
      const v = window.localStorage?.getItem(CAMP_DEBUG_KEY) || '';
      return ['1', 'true', 'on', 'yes'].includes(v.toLowerCase());
    }
  } catch {
    /* noop */
  }
  return false;
};

const CAMP_PATH_REGEX = /^\/?([^/]+)\/camp\/([^/?#]+)/i;

const sanitizeUsername = (value?: string | null) => {
  if (!value) return '';
  return value.replace(/^@+/, '').trim();
};

const sanitizeSlug = (value?: string | number | null) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const parseCampPath = (input?: string | null) => {
  if (!input) return null;
  let path = input.trim();
  if (!path) return null;
  try {
    const parsed = new URL(path, 'https://dummy.navumi');
    path = parsed.pathname || path;
  } catch {
    // raw path
  }
  const match = path.match(CAMP_PATH_REGEX);
  if (!match) return null;
  const owner = decodeURIComponent(match[1] || '').replace(/^@+/, '').trim();
  const slug = decodeURIComponent(match[2] || '').trim();
  if (!owner || !slug) return null;
  return { owner, slug };
};

export function useCampOverlay() {
  const { pushScreen } = useLayerStack();

  return React.useCallback((raw: CampOverlayTarget) => {
    const logEnabled = shouldLogCampDebug();
    if (logEnabled) {
      console.info('[useCampOverlay] open requested', { raw });
    }

    let owner = sanitizeUsername(raw.username);
    let slug = sanitizeSlug(raw.campNumber);

    if ((!owner || !slug) && raw.campPath) {
      const parsed = parseCampPath(raw.campPath);
      if (parsed) {
        owner = owner || parsed.owner;
        slug = slug || parsed.slug;
      }
    }

    const campId = raw.campId ?? null;

    if (!owner || !slug) {
      if (!campId && !raw.campPath) {
        if (logEnabled) {
          console.warn('[useCampOverlay] insufficient data, abort', {
            owner,
            slug,
            campId,
            campPath: raw.campPath ?? null,
          });
        }
        return;
      }
    }

    try {
      rememberReturn('camp');
    } catch {
      /* noop */
    }

    const derivedPath = (() => {
      if (owner && slug) return `/${owner}/camp/${slug}`;
      if (raw.campPath) {
        try {
          const parsed = new URL(raw.campPath, 'https://dummy.navumi');
          return parsed.pathname || `/camp/${campId ?? 'unknown'}`;
        } catch {
          return raw.campPath.startsWith('/') ? raw.campPath : `/${raw.campPath}`;
        }
      }
      if (campId != null) return `/camp/by-id/${campId}`;
      return '/camp';
    })();

    let bridgeParams: Record<string, string> | undefined;
    if (owner && slug) {
      bridgeParams = { username: owner, camp_number: slug };
    } else if (campId != null) {
      bridgeParams = { camp_id: String(campId) };
    } else {
      bridgeParams = undefined;
    }

    if (logEnabled) {
      console.info('[useCampOverlay] resolved target', {
        owner,
        slug,
        campId,
        derivedPath,
        bridgeParams,
      });
    }

    const node = (
      <AppScreenBridge
        pathname={derivedPath}
        params={bridgeParams}
        searchParams={raw.searchParams}
      >
        <CampScreen
          username={owner || undefined}
          campNumber={slug || undefined}
          campId={campId ?? undefined}
        />
      </AppScreenBridge>
    );

    pushScreen({
      node,
      className: 'bg-white overflow-y-auto',
      backdrop: 'dim',
      ariaLabel: 'Закрыть кэмп',
      dismissible: true,
      blockScroll: true,
    });

  }, [pushScreen]);
}
