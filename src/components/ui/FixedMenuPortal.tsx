// components/ui/FixedMenuPortal.tsx
'use client';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { ModalLayerPortal } from '@/components/ui/ModalLayerPortal';

type AnchorLike = { current: Element | null };

type Props = {
  anchorRef: AnchorLike;
  open: boolean;
  children: React.ReactNode;
  container?: Element | null;
};

type Metrics = { left: number; top: number; width: number; mode: 'fixed' | 'absolute' };

type WindowWithVV = Window & { visualViewport?: VisualViewport };

export function FixedMenuPortal({ anchorRef, open, children, container }: Props) {
  const [m, setM] = React.useState<Metrics | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  const defaultHost = typeof document !== 'undefined' ? document.body : null;
  const target = container ?? defaultHost;
  const useFixed = !container || !target || target === document.body || target === document.documentElement;

  React.useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current as HTMLElement | null;
    if (!anchor) return;

    const rail = anchor.closest('.rail') as HTMLElement | null;
    const el = (rail ?? anchor) as HTMLElement;

    const calc = (): Metrics | null => {
      const r = el.getBoundingClientRect();

      if (useFixed) {
        const vv = (window as WindowWithVV).visualViewport;
        const offL = vv?.offsetLeft ?? 0;
        const offT = vv?.offsetTop ?? 0;
        return {
          left: Math.round(r.left + offL),
          top: Math.round(r.bottom + 6 + offT),
          width: Math.round(r.width),
          mode: 'fixed',
        };
      } else {
        const host = target as Element;
        const hr = host.getBoundingClientRect();
        return {
          left: Math.round(r.left - hr.left),
          top: Math.round(r.bottom - hr.top + 6),
          width: Math.round(r.width),
          mode: 'absolute',
        };
      }
    };

    const update = () => setM(calc());
    update();

    window.addEventListener('resize', update);
    document.addEventListener('scroll', update, true);

    const vv = (window as WindowWithVV).visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);

    return () => {
      window.removeEventListener('resize', update);
      document.removeEventListener('scroll', update, true);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
    };
  }, [open, anchorRef, useFixed, target]);

  if (!open || !m || (!container && !defaultHost)) return null;

  const node = (
    <div
      ref={rootRef}
      data-ac-menu
      style={{
        position: m.mode,
        left: m.left,
        top: m.top,
        width: m.width,
        zIndex: 2147483650,
        pointerEvents: 'auto',
        boxSizing: 'border-box',
        overflow: 'visible',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
      }}
      className="bg-white border border-black/10 rounded-xl shadow-2xl"
    >
      {children}
    </div>
  );

  if (container && target) {
    return createPortal(node, target);
  }

  return (
    <ModalLayerPortal>
      {node}
    </ModalLayerPortal>
  );
}
