'use client';

import React from 'react';
import { ReadonlyURLSearchParams } from 'next/navigation';
import { PathnameContext, PathParamsContext, SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

type Primitive = string | number | boolean;
export type SearchParamsShape = Record<string, Primitive | Primitive[] | null | undefined>;

function makeSearch(search?: SearchParamsShape): ReadonlyURLSearchParams {
  const usp = new URLSearchParams();
  if (!search) return usp as ReadonlyURLSearchParams;
  for (const [key, value] of Object.entries(search)) {
    if (value == null) continue;
    const list = Array.isArray(value) ? value : [value];
    for (const item of list) {
      usp.append(key, String(item));
    }
  }
  return usp as ReadonlyURLSearchParams;
}

type AppScreenBridgeProps = {
  pathname: string;
  params?: Record<string, string>;
  searchParams?: SearchParamsShape;
  children: React.ReactNode;
};

export function AppScreenBridge({ pathname, params, searchParams, children }: AppScreenBridgeProps) {
  const normalizedPath = React.useMemo(() => (pathname?.startsWith('/') ? pathname : `/${pathname || ''}`), [pathname]);
  const memoSearch = React.useMemo(() => makeSearch(searchParams), [searchParams]);
  return (
    <PathnameContext.Provider value={normalizedPath}>
      <PathParamsContext.Provider value={params ?? {}}>
        <SearchParamsContext.Provider value={memoSearch}>
          {children}
        </SearchParamsContext.Provider>
      </PathParamsContext.Provider>
    </PathnameContext.Provider>
  );
}
