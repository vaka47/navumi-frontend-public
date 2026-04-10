'use client';

import { useEffect } from 'react';

const isProduction = process.env.NODE_ENV === 'production';
const allowDebug = (process.env.NEXT_PUBLIC_ENABLE_DEBUG_LOGS || '').toLowerCase() === '1';

export function DisableProdDebug() {
  useEffect(() => {
    if (!isProduction || allowDebug || typeof window === 'undefined') return;
    const original = console.debug;
    console.debug = () => {};
    return () => { console.debug = original; };
  }, []);
  return null;
}

export default DisableProdDebug;
