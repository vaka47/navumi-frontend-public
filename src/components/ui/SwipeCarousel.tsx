'use client';

import React from 'react';
import SmartImage from '@/components/SmartImage';

export type SwipeCarouselProps = {
  images: string[];
  index?: number;
  onIndexChange?: (next: number) => void;
  className?: string;
  dotClassName?: string;
  height?: number; // фиксированная высота контейнера (px), как в инстаграм
  imageClassName?: string;
  fillParent?: boolean;
};

export default function SwipeCarousel({ images, index = 0, onIndexChange, className = '', dotClassName = '', height, imageClassName = 'object-contain', fillParent = false }: SwipeCarouselProps) {
  const [active, setActive] = React.useState(index);
  const contRef = React.useRef<HTMLDivElement | null>(null);
  const [contW, setContW] = React.useState(0);
  const [dragX, setDragX] = React.useState(0);
  const [animating, setAnimating] = React.useState(false);
  const swipeRef = React.useRef<{ x0: number; y0: number; active: boolean; dx: number; dy: number } | null>(null);

  React.useEffect(() => { setActive(index); }, [index]);

  React.useLayoutEffect(() => {
    const el = contRef.current; if (!el) return;
    const apply = () => setContW(el.clientWidth || 0);
    apply();
    const ro = new ResizeObserver(() => apply());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const count = Math.max(0, images?.length || 0);
  const goTo = React.useCallback((i: number) => {
    const next = ((i % count) + count) % count;
    setActive(next);
    onIndexChange?.(next);
  }, [count, onIndexChange]);

  const commitSwipe = React.useCallback((dx: number) => {
    const threshold = Math.max(48, Math.round((contW || 320) * 0.18));
    const horizontal = Math.abs(dx) > threshold;
    if (!horizontal || count <= 1) { setAnimating(true); setDragX(0); return; }
    setAnimating(true);
    if (dx < 0) {
      setDragX(-(contW || 0));
      requestAnimationFrame(() => { goTo(active + 1); setDragX(0); });
    } else {
      setDragX((contW || 0));
      requestAnimationFrame(() => { goTo(active - 1); setDragX(0); });
    }
  }, [active, contW, count, goTo]);

  return (
    <div
      ref={contRef}
      className={[
        'relative w-full overflow-hidden select-none',
        fillParent ? 'h-full' : '',
        className,
      ].filter(Boolean).join(' ')}
      style={!fillParent && height ? { height: `${height}px` } : undefined}
    >
      <div
        className="flex items-stretch"
        style={{
          width: contW ? contW * count : undefined,
          transform: `translateX(${-(contW || 0) * active + dragX}px)`,
          transition: animating ? 'transform 200ms ease-out' : 'none',
          touchAction: 'pan-y',
          height: fillParent ? '100%' : undefined,
        }}
        onTransitionEnd={() => setAnimating(false)}
        onTouchStart={(e) => {
          if (e.touches.length !== 1) { swipeRef.current = null; return; }
          const t = e.touches[0];
          swipeRef.current = { x0: t.clientX, y0: t.clientY, active: false, dx: 0, dy: 0 };
          setAnimating(false);
        }}
        onTouchMove={(e) => {
          const s = swipeRef.current; if (!s) return;
          const t = e.touches[0];
          const dx = t.clientX - s.x0; const dy = t.clientY - s.y0;
          s.dx = dx; s.dy = dy;
          const THRESHOLD_ACTIVATE = 8;
          if (!s.active) {
            if (Math.abs(dx) > THRESHOLD_ACTIVATE && Math.abs(dx) > Math.abs(dy) * 1.1) {
              s.active = true;
            } else { return; }
          }
          try { e.preventDefault(); } catch {}
          const limit = contW > 0 ? contW : 9999;
          const clamped = Math.max(-limit, Math.min(limit, dx));
          setDragX(clamped);
        }}
        onTouchEnd={() => {
          const s = swipeRef.current; if (!s) return; swipeRef.current = null;
          commitSwipe(s.dx);
        }}
      >
        {images.map((src, i) => (
          <div
            key={i}
            className="shrink-0 relative bg-black"
            style={{ width: contW || '100%', height: fillParent ? '100%' : height ? `${height}px` : undefined }}
          >
            <SmartImage
              src={src}
              alt=""
              fill
              className={imageClassName}
              sizes={height ? '(max-width: 640px) 100vw, 50vw' : '(max-width: 640px) 100vw, 50vw'}
            />
          </div>
        ))}
      </div>

      {count > 1 && (
        <div className={["absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1", dotClassName].join(' ')}>
          {images.map((_, i) => (
            <span key={i} className={["w-2 h-2 rounded-full", i === active ? 'bg-white' : 'bg-white/60'].join(' ')} />
          ))}
        </div>
      )}
    </div>
  );
}
