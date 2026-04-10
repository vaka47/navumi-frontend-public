"use client";

import React from 'react';
import NextImage, { ImageProps as NextImageProps } from 'next/image';
import { absUrl } from '@/components/camp/campNormalize';

type Props = NextImageProps & {
  // форсируем прямую загрузку (минуя оптимизатор) извне, если нужно
  forceUnoptimized?: boolean;
  // отключить плавное появление (убрать мигание для маленьких иконок/аватарок)
  noFade?: boolean;
  // отключить серый скелет (фикс для мелких круглых аватаров)
  noSkeleton?: boolean;
};

const IMG_DEBUG = process.env.NODE_ENV !== 'production' && (process.env.NEXT_PUBLIC_IMG_DEBUG ?? '0') !== '0';

export default function SmartImage({ src, onError, onLoadingComplete, forceUnoptimized, noFade, noSkeleton, style, className, fill, width, height, ...rest }: Props) {
  const [uopt, setUopt] = React.useState<boolean>(Boolean(forceUnoptimized));
  const [loaded, setLoaded] = React.useState(Boolean(noFade));

  // нормализуем src: срезаем X-Goog-* подписи, приводим storage.* к единому виду
  const normalizedSrc: typeof src = React.useMemo(() => {
    if (typeof src === 'string') {
      const u = absUrl(src);
      return u || src;
    }
    return src;
  }, [src]);

  // эвристика: для публичных GCS/медиапутей не используем оптимизатор по умолчанию
  const shouldDefaultUnoptimized = React.useCallback((u: string | undefined): boolean => {
    if (!u) return false;
    try {
      const url = new URL(u, typeof window !== 'undefined' ? window.location.origin : 'https://dummy.local');
      const host = url.hostname.toLowerCase();
      const isGcs = host === 'storage.googleapis.com' || host.endsWith('.storage.googleapis.com');
      const p = url.pathname || '/';
      const looksLikeMedia = /\/(media|uploads|profile_pictures|avatars|profile_posts)\//i.test(p);
      const hasEncoded = u.includes('%');
      return isGcs || looksLikeMedia || hasEncoded;
    } catch { return false; }
  }, []);

  React.useEffect(() => {
    if (typeof src === 'string') {
      const def = shouldDefaultUnoptimized(normalizedSrc as string);
      // Only set to true if it's default AND we haven't explicitly requested false
      if (def && !uopt && forceUnoptimized !== false) setUopt(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedSrc]);

  const img = (
    <NextImage
      {...rest}
      src={normalizedSrc}
      unoptimized={uopt || rest.unoptimized}
      fill={fill}
      width={width}
      height={height}
      style={{
        ...(style || {}),
        ...(noFade ? {} : { opacity: loaded ? 1 : 0, transition: 'opacity 180ms ease' }),
      }}
      className={className}
      onError={(e) => {
        try {
          if (!uopt) setUopt(true);
          if (IMG_DEBUG && typeof window !== 'undefined') console.warn('[SmartImage] error, fallback to unoptimized', normalizedSrc);
        } catch {}
        onError?.(e);
      }}
      onLoadingComplete={(i) => {
        if (!noFade) setLoaded(true);
        try {
          if (IMG_DEBUG && typeof window !== 'undefined') console.debug('[SmartImage] loaded', { w: i.naturalWidth, h: i.naturalHeight, unoptimized: uopt, src: normalizedSrc });
        } catch {}
        onLoadingComplete?.(i);
      }}
    />
  );

  // Скелетон: пока не загружено — показываем серую «подложку», без иконок/подписей
  // Для fill — оборачиваем в относительный контейнер на всю доступную область
  if (fill) {
    return (
      <span className="relative block w-full h-full">
        {(!loaded && !noSkeleton) && <span className="absolute inset-0 bg-gray-100" aria-hidden />}
        {img}
      </span>
    );
  }

  // Для фиксированных размеров — делаем inline-block с указанными размерами
  const w = typeof width === 'number' ? width : undefined;
  const h = typeof height === 'number' ? height : undefined;
  return (
    <span className="relative inline-block" style={{ width: w, height: h }}>
      {(!loaded && !noSkeleton) && <span className="absolute inset-0 bg-gray-100" aria-hidden />}
      {img}
    </span>
  );
}
