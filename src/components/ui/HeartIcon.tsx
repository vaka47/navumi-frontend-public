'use client';

import React from 'react';
import { cn } from '@/lib/utils';

type HeartIconProps = React.SVGProps<SVGSVGElement> & {
  filled?: boolean;
};

export default function HeartIcon({ filled = false, className, ...props }: HeartIconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      className={cn('w-4 h-4', className)}
      {...props}
    >
      <path
        d="M10 17s-5.5-3.2-7.5-7C1.1 7 2.2 4 4.6 3.3c1.9-.6 3.6.5 5.4 2.7 1.8-2.2 3.5-3.3 5.4-2.7 2.4.7 3.5 3.7 2.1 6.7C15.5 13.8 10 17 10 17z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
