'use client';

import React from 'react';
import Link from 'next/link';
import SwipeCarousel from '@/components/ui/SwipeCarousel';
import SmartImage from '@/components/SmartImage';
import { cn } from '@/lib/utils';
import { campPathFrom } from '@/components/post/helpers/campPath';
import { useAppNavigation, type CampNavigationTarget } from '@/hooks/useAppNavigation';

export type CampCardData = {
  campId?: number | string | null;
  // routing
  organizerUsername?: string | null;
  campNumber?: number | string | null;
  camp_url?: string | null;

  // visuals
  title?: string | null;
  title_image?: string | null;
  gallery_images?: string[] | null;

  // info
  activities?: string[] | null; // first activity + "+N"
  start_date?: string | null;   // YYYY-MM-DD
  end_date?: string | null;     // YYYY-MM-DD
  location_name?: string | null;

  // price
  price?: number | string | null;
  currency?: string | null; // RUB/USD/EUR...
  is_hot_deal?: boolean | null;
  hot_deal_price?: number | string | null;
  is_sold_out?: boolean | null;
};

export function CampCard({
  camp,
  showActivity = true,
  className,
  href: hrefProp,
  onClick,
  activityPlacement = 'above',
  enableCarouselControls = false,
  onOpenCamp,
}: {
  camp: CampCardData;
  showActivity?: boolean;
  className?: string;
  href?: string;
  onClick?: () => void;
  activityPlacement?: 'above' | 'over-image';
  enableCarouselControls?: boolean;
  onOpenCamp?: (target: CampNavigationTarget) => void;
}) {
  const rawPath = hrefProp || campPathFrom(
    camp.organizerUsername || undefined,
    { camp_number: camp.campNumber ?? undefined, url: camp.camp_url ?? undefined }
  );

  const { navigateCamp } = useAppNavigation();
  const campTarget = React.useMemo<CampNavigationTarget>(() => ({
    username: camp.organizerUsername || undefined,
    campNumber: camp.campNumber ?? undefined,
    campPath: rawPath || camp.camp_url || undefined,
    campId: camp.campId ?? camp.campNumber ?? null,
  }), [camp.organizerUsername, camp.campNumber, camp.camp_url, camp.campId, rawPath]);

  const href = React.useMemo(() => {
    if (rawPath && rawPath.trim()) return rawPath;
    const candidate = camp.camp_url || '';
    if (candidate) {
      try {
        const u = new URL(candidate, 'https://dummy.local');
        if (u.pathname) return u.pathname + (u.search || '') + (u.hash || '');
      } catch {
        if (candidate.startsWith('/')) return candidate;
      }
    }
    if (campTarget.username && campTarget.campNumber) return `/${campTarget.username}/camp/${campTarget.campNumber}`;
    if (campTarget.campId != null) return `/camp/${campTarget.campId}`;
    return '#';
  }, [rawPath, camp.camp_url, campTarget.username, campTarget.campNumber, campTarget.campId]);

  const activities = Array.isArray(camp.activities) ? camp.activities.filter(Boolean) as string[] : [];
  const firstActivity = activities[0] || '';
  const extraActivities = Math.max(0, activities.length - 1);

  const dateText = formatCampDateRange(camp.start_date, camp.end_date);
  const city = extractCity(camp.location_name || '');

  // derived hot flag: сервер может прислать только hot_deal_price без явного is_hot_deal
  const hotPriceNum = typeof camp.hot_deal_price === 'string' ? Number(camp.hot_deal_price) : (typeof camp.hot_deal_price === 'number' ? camp.hot_deal_price : null);
  const priceNum = typeof camp.price === 'string' ? Number(camp.price) : (typeof camp.price === 'number' ? camp.price : null);
  const derivedHot = !!camp.is_hot_deal || (hotPriceNum !== null && Number.isFinite(hotPriceNum) && (priceNum === null || hotPriceNum < priceNum));
  const displayPrice = formatPrice({
    price: camp.price,
    currency: camp.currency || 'RUB',
    isHot: derivedHot,
    hotPrice: camp.hot_deal_price,
  });

  const shouldLog = () => {
    try {
      if (process.env.NODE_ENV !== 'production') return true;
      if (typeof window !== 'undefined') {
        // Включить в консоли: localStorage.setItem('NAVUMI_CAMP_DEBUG','1')
        const v = window.localStorage?.getItem('NAVUMI_CAMP_DEBUG') || '';
        return ['1','true','on','yes'].includes(v.toLowerCase());
      }
    } catch {}
    return false;
  };
  if (typeof window !== 'undefined' && shouldLog()) {
    try {
      // Логи для отладки хот-прайса/солдаута
      console.debug('[CampCard]', {
        title: camp.title,
        soldOut: camp.is_sold_out,
        hotDealFlag: camp.is_hot_deal,
        hotDealDerived: derivedHot,
        hotPrice: camp.hot_deal_price,
        price: camp.price,
        displayPrice,
      });
    } catch {}
  }

  const [imgReady, setImgReady] = React.useState(false);
  const imgSrc = camp.title_image || '';
  const galleryImages = React.useMemo(() => {
    const fromGallery = Array.isArray(camp.gallery_images)
      ? (camp.gallery_images as string[]).filter((url) => typeof url === 'string' && url.trim().length > 0)
      : [];
    if (fromGallery.length > 0) return fromGallery;
    return imgSrc ? [imgSrc] : [];
  }, [camp.gallery_images, imgSrc]);
  const [carouselIndex, setCarouselIndex] = React.useState(0);
  React.useEffect(() => {
    setCarouselIndex(0);
  }, [galleryImages.length]);
  const hasImages = galleryImages.length > 0;
  const hasMultipleImages = galleryImages.length > 1;
  const primaryImage = galleryImages[0] || '';
  const showCarousel = enableCarouselControls && hasImages;
  React.useEffect(() => {
    if (showCarousel || primaryImage) setImgReady(true);
  }, [showCarousel, primaryImage]);

  React.useEffect(() => {
    try {
      // Логируем вычисленный src для отладки (проверка нормализации URL)
      if (imgSrc) console.debug('[CampCard] image src', imgSrc);
    } catch {}
  }, [imgSrc]);

  const content = (
    <div className={cn(
      'group flex flex-col',
      className,
    )}>
      {/* activity pill (above) */}
      {showActivity && firstActivity && activityPlacement === 'above' && (
        <div className="px-2 pt-2">
          <div className="inline-flex items-center max-w-full rounded-full border bg-gray-50 text-gray-800 text-[12px] leading-none px-2 py-1">
            <span className="min-w-0 truncate" title={firstActivity}>{firstActivity}</span>
            {extraActivities > 0 && (
              <span className="ml-1 shrink-0 text-gray-500">+{extraActivities}</span>
            )}
          </div>
        </div>
      )}

      {/* cover image */}
      <div className={cn('relative w-full bg-gray-100 rounded-t-2xl overflow-hidden', (showActivity && firstActivity && activityPlacement === 'above') ? 'mt-2' : 'mt-0')}>
        <div className="relative w-full aspect-[16/11] lg:aspect-[16/9]">
          {showCarousel ? (
            <>
              <div className="absolute inset-0">
                <SwipeCarousel
                  images={galleryImages}
                  fillParent
                  className="h-full"
                  imageClassName="object-cover"
                  index={carouselIndex}
                  onIndexChange={setCarouselIndex}
                />
              </div>
              {enableCarouselControls && hasMultipleImages && (
                <>
                  <button
                    type="button"
                    className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/70 transition"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCarouselIndex((prev) => (prev - 1 + galleryImages.length) % galleryImages.length);
                    }}
                    aria-label="Предыдущее фото"
                  >
                    <ArrowLeftIcon />
                  </button>
                  <button
                    type="button"
                    className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/70 transition"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCarouselIndex((prev) => (prev + 1) % galleryImages.length);
                    }}
                    aria-label="Следующее фото"
                  >
                    <ArrowRightIcon />
                  </button>
                </>
              )}
            </>
          ) : primaryImage ? (
            <SmartImage
              src={primaryImage}
              alt={camp.title || 'Кэмп'}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover"
              onLoadingComplete={() => setImgReady(true)}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-gray-400 text-xs">Нет фото</div>
          )}

          {camp.is_sold_out && (
            <div className="absolute bottom-2 left-2 rounded-md bg-black/80 text-white text-[11px] px-2 py-0.5">
              SOLD OUT
            </div>
          )}
          {!camp.is_sold_out && derivedHot && (
            <div className="absolute bottom-2 left-2 rounded-md bg-red-600 text-white text-[11px] px-2 py-0.5">
              HOT PRICE
            </div>
          )}

          {/* activity pill overlay */}
          {imgReady && showActivity && firstActivity && activityPlacement === 'over-image' && (
            <div className="absolute top-1 left-1 right-1 flex justify-end pointer-events-none">
              <div
                className={cn(
                  'inline-flex items-center rounded-full text-[12px] leading-none px-2 py-1',
                  'bg-black/50 text-white max-w-full overflow-hidden'
                )}
              >
                <span className="min-w-0 truncate whitespace-nowrap" title={firstActivity}>{firstActivity}</span>
                {extraActivities > 0 && (
                  <span className="ml-1 shrink-0 text-white/80">+{extraActivities}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* meta */}
      <div className="px-2 pt-2 pb-3 min-h-0">
        {/* dates */}
        {dateText && (
          <div className="text-[12px] text-gray-600 truncate" title={dateText}>{dateText}</div>
        )}
        {/* city */}
        {city && (
          <div className="text-[13px] text-gray-800 truncate" title={city}>{city}</div>
        )}
        {/* price */}
        <div className="mt-1">
          {displayPrice.kind === 'hot' ? (
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-red-600">{displayPrice.value}</span>
              {displayPrice.original !== displayPrice.value && (
                <span className="line-through text-gray-400 text-xs">{displayPrice.original}</span>
              )}
            </div>
          ) : (
            <span className="font-semibold">{displayPrice.value}</span>
          )}
        </div>
      </div>
    </div>
  );

  const handleClick = (event?: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    try {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[CampCard] click', {
          href,
          owner: camp.organizerUsername,
          campNumber: camp.campNumber,
          campUrl: camp.camp_url,
          galleryLen: galleryImages.length,
        });
      } else if (typeof window !== 'undefined') {
        const flag = window.localStorage?.getItem('NAVUMI_CAMP_DEBUG') || '';
        if (['1', 'true', 'on', 'yes'].includes(flag.toLowerCase())) {
          console.log('[CampCard] click', {
            href,
            owner: camp.organizerUsername,
            campNumber: camp.campNumber,
            campUrl: camp.camp_url,
            galleryLen: galleryImages.length,
          });
        }
      }
    } catch { /* noop */ }
    onClick?.();
    if (onOpenCamp) {
      event?.preventDefault?.();
      onOpenCamp(campTarget);
      return;
    }
    navigateCamp(event ?? null, campTarget);
  };

  return (
    <Link href={href} onClick={(e) => handleClick(e)} className="block">
      {content}
    </Link>
  );
}

function ArrowLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------------------------------- utils --------------------------------- */

function parseISODate(s?: string | null): Date | null {
  if (!s || typeof s !== 'string') return null;
  const d = new Date(s);
  return Number.isNaN(+d) ? null : d;
}

function monthShortRu(d: Date): string {
  try {
    return d.toLocaleDateString('ru-RU', { month: 'short' });
  } catch { return ''; }
}

function formatCampDateRange(a?: string | null, b?: string | null): string {
  const start = parseISODate(a);
  const end = parseISODate(b);
  if (!start && !end) return '';
  if (start && end) {
    const sameYear = start.getFullYear() === end.getFullYear();
    const sameMonth = sameYear && start.getMonth() === end.getMonth();
    const yyyy = end.getFullYear();
    if (sameMonth) {
      const m = monthShortRu(end);
      return `${start.getDate()} - ${end.getDate()} ${m} ${yyyy} г.`;
    }
    const left = `${start.getDate()} ${monthShortRu(start)}`;
    const right = `${end.getDate()} ${monthShortRu(end)}`;
    return `${left} - ${right} ${yyyy} г.`;
  }
  const d = start || end!;
  const m = monthShortRu(d);
  return `${d.getDate()} ${m} ${d.getFullYear()} г.`;
}

function extractCity(location: string): string {
  const raw = (location || '').trim();
  if (!raw) return '';
  const comma = raw.indexOf(',');
  return (comma >= 0 ? raw.slice(0, comma) : raw).trim();
}

function currencySymbol(code?: string | null): string {
  const c = (code || '').toUpperCase();
  if (c === 'RUB' || c === 'RUR' || c === '₽') return '₽';
  if (c === 'USD' || c === '$') return '$';
  if (c === 'EUR' || c === '€') return '€';
  return c || '₽';
}

function formatNumber(n: number): string {
  try { return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n); }
  catch { return String(Math.round(n)); }
}

function formatPrice({ price, currency, isHot, hotPrice }: { price?: number | string | null; currency?: string | null; isHot?: boolean; hotPrice?: number | string | null; }) {
  const p = typeof price === 'string' ? Number(price) : (typeof price === 'number' ? price : 0);
  const hp = typeof hotPrice === 'string' ? Number(hotPrice) : (typeof hotPrice === 'number' ? hotPrice : null);
  const sym = currencySymbol(currency);
  if (isHot) {
    const use = (hp !== null && Number.isFinite(hp)) ? hp : p;
    return { kind: 'hot' as const, value: `${formatNumber(use)} ${sym}`, original: `${formatNumber(p)} ${sym}` };
  }
  return { kind: 'regular' as const, value: `${formatNumber(p)} ${sym}` };
}

export default CampCard;
