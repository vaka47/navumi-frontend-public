'use client';

import React, { Suspense } from 'react';
import SearchPage from '@/app/search/SearchPage';
import { type SearchParamsShape } from '@/components/navigation/AppScreenBridge';
import { useLayerStack } from '@/context/LayerStackContext';
import { rememberReturn } from '@/lib/navBack';
import Header from '@/components/header';
import BottomNavBar from '@/components/BottomNavBar';
import { useOverlayEnvironment, OverlayEnvironmentProvider } from '@/context/OverlayEnvironmentContext';
import { PathnameContext, PathParamsContext, SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { AppRouterContext, type AppRouterInstance, type PrefetchOptions } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { ReadonlyURLSearchParams, useRouter } from 'next/navigation';

type OpenSearchInput =
  | { pathname?: string; searchParams?: SearchParamsShape }
  | URLSearchParams
  | string
  | null
  | undefined;

const FALLBACK_PATH = '/search';
const DUMMY_ORIGIN = 'https://navumi.app';

const paramsToShape = (params: URLSearchParams): SearchParamsShape => {
  const shape: SearchParamsShape = {};
  params.forEach((value, key) => {
    const prev = shape[key];
    if (prev === undefined || prev === null) {
      shape[key] = value;
      return;
    }
    if (Array.isArray(prev)) {
      shape[key] = [...prev, value];
      return;
    }
    shape[key] = [prev, value];
  });
  return shape;
};

const resolveTarget = (input: OpenSearchInput): { pathname: string; searchParams?: SearchParamsShape } => {
  if (!input) return { pathname: FALLBACK_PATH };
  if (typeof input === 'string') {
    try {
      const url = new URL(input, DUMMY_ORIGIN);
      return {
        pathname: url.pathname || FALLBACK_PATH,
        searchParams: paramsToShape(url.searchParams),
      };
    } catch {
      return { pathname: FALLBACK_PATH };
    }
  }
  if (input instanceof URLSearchParams) {
    return {
      pathname: FALLBACK_PATH,
      searchParams: paramsToShape(input),
    };
  }
  return {
    pathname: input.pathname || FALLBACK_PATH,
    searchParams: input.searchParams,
  };
};

export function useSearchOverlay() {
  const { pushScreen } = useLayerStack();

  return React.useCallback((input?: OpenSearchInput) => {
    const { pathname, searchParams } = resolveTarget(input ?? undefined);
    try {
      rememberReturn('search');
    } catch {
      /* noop */
    }
    const node = (
      <SearchOverlayBridge initialPathname={pathname} initialSearchParams={searchParams}>
        <div className="search-overlay-root h-[100dvh] flex flex-col bg-muted">
          <div className="shrink-0">
            <Suspense fallback={null}>
              <Header />
            </Suspense>
          </div>
          <main
            id="search-overlay-main"
            data-scroll-root
            className="flex-1 min-h-0 overflow-y-auto"
            style={{ paddingTop: '64px' }}
          >
            <SearchPage />
          </main>
          <div className="shrink-0">
            <BottomNavBar />
          </div>
        </div>
      </SearchOverlayBridge>
    );
    pushScreen({
      node,
      className: 'bg-muted flex flex-col',
      backdrop: 'dim',
      ariaLabel: 'Закрыть поиск',
      dismissible: true,
      blockScroll: true,
    });
  }, [pushScreen]);
}

const buildSearchParams = (search?: SearchParamsShape): ReadonlyURLSearchParams => {
  const params = new URLSearchParams();
  if (!search) return params as ReadonlyURLSearchParams;
  for (const [key, value] of Object.entries(search)) {
    if (value == null) continue;
    const list = Array.isArray(value) ? value : [value];
    for (const item of list) {
      params.append(key, String(item));
    }
  }
  return params as ReadonlyURLSearchParams;
};

const normalizePath = (pathname?: string) => {
  if (!pathname) return '/search';
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
};

const cloneParams = (params?: URLSearchParams | ReadonlyURLSearchParams | null) => {
  const clone = new URLSearchParams(params ?? undefined);
  return clone as ReadonlyURLSearchParams;
};

const resolveHref = (href: string, fallbackPath: string): BridgeState | null => {
  if (!href) return null;
  try {
    if (href.startsWith('?')) {
      return {
        pathname: normalizePath(fallbackPath),
        search: cloneParams(new URLSearchParams(href.slice(1))),
      };
    }
    const url = new URL(href, DUMMY_ORIGIN);
    const nextPath = url.pathname && url.pathname !== '/' ? url.pathname : fallbackPath;
    return {
      pathname: normalizePath(nextPath),
      search: cloneParams(url.searchParams),
    };
  } catch {
    return null;
  }
};

type BridgeState = {
  pathname: string;
  search: ReadonlyURLSearchParams;
};

const isSearchPath = (pathname: string) => pathname.startsWith('/search');

function SearchOverlayBridge({
  initialPathname,
  initialSearchParams,
  children,
}: {
  initialPathname: string;
	  initialSearchParams?: SearchParamsShape;
	  children: React.ReactNode;
	}) {
	  const baseRouter = useRouter();
	  const { screens, popScreen } = useLayerStack();
	  const overlayEnv = useOverlayEnvironment();
	  const [state, setState] = React.useState<BridgeState>(() => ({
	    pathname: normalizePath(initialPathname),
	    search: buildSearchParams(initialSearchParams),
	  }));
	  const stateRef = React.useRef(state);
	  React.useEffect(() => {
	    stateRef.current = state;
	  }, [state]);
	
	  const overlayRouter = React.useMemo<AppRouterInstance>(() => ({
	    back: () => baseRouter.back(),
	    forward: () => baseRouter.forward(),
	    refresh: () => baseRouter.refresh(),
	    prefetch: (href: string, options?: PrefetchOptions) => {
	      const next = resolveHref(href, stateRef.current.pathname);
	      if (next && isSearchPath(next.pathname)) return;
	      baseRouter.prefetch(href, options);
	    },
	    push: (href: string, options) => {
	      const next = resolveHref(href, stateRef.current.pathname);
	      if (next && isSearchPath(next.pathname)) {
	        setState(next);
	        return;
	      }
	      baseRouter.push(href, options);
	    },
	    replace: (href: string, options) => {
	      const next = resolveHref(href, stateRef.current.pathname);
	      if (next && isSearchPath(next.pathname)) {
	        setState(next);
	        return;
	      }
	      baseRouter.replace(href, options);
	    },
	  }), [baseRouter]);
	
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
	      <PathnameContext.Provider value={state.pathname}>
	        <PathParamsContext.Provider value={{}}>
	          <SearchParamsContext.Provider value={state.search}>
	            <AppRouterContext.Provider value={overlayRouter}>
	              {children}
	            </AppRouterContext.Provider>
	          </SearchParamsContext.Provider>
	        </PathParamsContext.Provider>
	      </PathnameContext.Provider>
	    </OverlayEnvironmentProvider>
	  );
	}
