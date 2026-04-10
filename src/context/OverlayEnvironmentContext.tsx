'use client';

import React from 'react';

export type OverlayEnvironment = {
  isOverlay: boolean;
  close: () => void;
  navigate?: (href: string, options?: unknown) => void;
};

const defaultValue: OverlayEnvironment = {
  isOverlay: false,
  close: () => {},
  navigate: undefined,
};

const OverlayEnvironmentContext = React.createContext<OverlayEnvironment>(defaultValue);

export const OverlayEnvironmentProvider = OverlayEnvironmentContext.Provider;

export function useOverlayEnvironment() {
  return React.useContext(OverlayEnvironmentContext);
}
