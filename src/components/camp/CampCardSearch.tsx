'use client';

import Link from 'next/link';
import { savePrevPath } from '@/lib/scrollRestoration';
import SmartImage from '@/components/SmartImage';
import { absUrl } from '@/components/camp/campNormalize';
import { useMemo, useState } from 'react';
import { useAppNavigation } from '@/hooks/useAppNavigation';

type Props = {
    camp: {
        id: number;
        organizerUsername: string; // profile.username
        campNumber: number;        // для URL
        title: string;
        title_image?: string | null;
        location_name: string;
        start_date: string; // ISO (YYYY-MM-DD)
        end_date: string;   // ISO
        activities?: { id: number; name: string }[];
        price: string | number;
        currency: 'RUB' | 'USD' | 'EUR' | string;
        is_hot_deal: boolean;
        hot_deal_price?: string | number | null;
        is_sold_out: boolean;
    };
    className?: string;
};

function formatDateRange(startISO: string, endISO: string, locale = 'ru-RU') {
    const fmt = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' });
    const start = fmt.format(new Date(startISO));
    const end = fmt.format(new Date(endISO));
    return `${start} — ${end}`.replace('.', '');
}

function formatPrice(value: number | string, currency: string) {
    const n = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(n)) return '';
    const symbol = currency === 'RUB' ? '₽' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency;
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + ` ${symbol}`;
}

export default function CampCardSearch({ camp, className }: Props) {
    const href = `/${camp.organizerUsername}/camp/${camp.campNumber}/`;
    const [imgReady, setImgReady] = useState(false);
    const { navigateCamp } = useAppNavigation();

    const priceText = useMemo(() => {
        if (camp.is_hot_deal && camp.hot_deal_price) {
            return (
                <div className="flex items-baseline gap-2">
                    <span className="text-red-600 font-semibold">{formatPrice(camp.hot_deal_price, camp.currency)}</span>
                    <span className="line-through text-gray-400 text-sm">{formatPrice(camp.price, camp.currency)}</span>
                </div>
            );
        }
        return <span className="font-semibold">{formatPrice(camp.price, camp.currency)}</span>;
    }, [camp.is_hot_deal, camp.hot_deal_price, camp.price, camp.currency]);

    const firstActivity = camp.activities?.[0]?.name;

    const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
        try { savePrevPath(); } catch { /* noop */ }
        navigateCamp(event, {
            username: camp.organizerUsername,
            campNumber: camp.campNumber,
            campPath: href,
        });
    };

    return (
        <Link
            href={href}
            onClick={handleClick}
            className={[
                'group grid grid-cols-[128px,1fr] gap-3 rounded-2xl border border-gray-200 bg-white hover:shadow-md transition',
                'p-2 sm:p-3',
                className || '',
            ].join(' ')}
        >
            <div className="relative w-[128px] h-[88px] overflow-hidden rounded-xl bg-gray-100">
                {camp.title_image ? (
                    <SmartImage
                        src={absUrl(camp.title_image) || camp.title_image}
                        alt={camp.title}
                        fill
                        className="object-cover transition group-hover:scale-[1.02]"
                        sizes="128px"
                        onLoadingComplete={() => setImgReady(true)}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">Нет фото</div>
                )}

                {imgReady && camp.is_sold_out && (
                    <div className="absolute top-1 left-1 rounded-md bg-black/70 text-white text-[10px] px-2 py-0.5">
                        SOLD OUT
                    </div>
                )}
                {imgReady && camp.is_hot_deal && !camp.is_sold_out && (
                    <div className="absolute top-1 left-1 rounded-md bg-red-600 text-white text-[10px] px-2 py-0.5">
                        Горячеe
                    </div>
                )}
            </div>

            <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm sm:text-base font-semibold line-clamp-1">{camp.title}</h3>
                    {firstActivity && (
                        <span className="shrink-0 text-[11px] sm:text-xs px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200">
              {firstActivity}
            </span>
                    )}
                </div>

                <div className="mt-1 text-[12px] sm:text-[13px] text-gray-600 line-clamp-1">
                    📍 {camp.location_name}
                </div>
                <div className="mt-0.5 text-[12px] sm:text-[13px] text-gray-600">
                    📆 {formatDateRange(camp.start_date, camp.end_date)}
                </div>

                <div className="mt-2 text-sm">{priceText}</div>
            </div>
        </Link>
    );
}
