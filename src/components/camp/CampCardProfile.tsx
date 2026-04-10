'use client';

import type { MouseEvent } from 'react';
import Link from 'next/link';
import { savePrevPath } from '@/lib/scrollRestoration';
import SmartImage from '@/components/SmartImage';
import { absUrl } from '@/components/camp/campNormalize';
import { useAppNavigation } from '@/hooks/useAppNavigation';

type Props = {
    camp: {
        organizerUsername: string;
        campNumber: number;
        title: string;
        title_image?: string | null;
        location_name: string;
        start_date: string;
        end_date: string;
        price: number | string;
        currency: 'RUB' | 'USD' | 'EUR' | string;
        is_sold_out: boolean;
        is_hot_deal: boolean;
        hot_deal_price?: number | string | null;
    };
    className?: string;
};

function safeParseDate(s?: string | null): Date | null {
    if (!s || typeof s !== 'string' || !s.trim()) return null;
    const d = new Date(s);
    return isNaN(+d) ? null : d;
}
function formatDateRange(startISO?: string | null, endISO?: string | null, locale = 'ru-RU') {
    try {
        const start = safeParseDate(startISO);
        const end = safeParseDate(endISO);
        if (!start && !end) return '';
        const fmt = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' });
        if (start && end) return `${fmt.format(start)} — ${fmt.format(end)}`.replace('.', '');
        return fmt.format(start || end!);
    } catch {
        return '';
    }
}
function fmtPrice(val: number | string, currency: string) {
    const v = typeof val === 'string' ? Number(val) : val;
    const sym = currency === 'RUB' ? '₽' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency;
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v) + ` ${sym}`;
}

export default function CampCardProfile({ camp, className }: Props) {
    const href = `/${camp.organizerUsername}/camp/${camp.campNumber}/`;
    const { navigateCamp } = useAppNavigation();

    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
        try {
            savePrevPath();
        } catch { /* noop */ }
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
                'group grid grid-cols-[112px,1fr] gap-3 rounded-2xl border border-gray-200 bg-white hover:shadow-md transition',
                'p-2',
                className || '',
            ].join(' ')}
        >
            <div className="relative w-[112px] h-[76px] overflow-hidden rounded-xl bg-gray-100">
                {camp.title_image ? (
                    <SmartImage src={absUrl(camp.title_image) || camp.title_image} alt={camp.title} fill className="object-cover" sizes="112px" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">Нет фото</div>
                )}
                {camp.is_sold_out && (
                    <div className="absolute top-1 left-1 rounded-md bg-black/70 text-white text-[10px] px-2 py-0.5">
                        SOLD OUT
                    </div>
                )}
                {camp.is_hot_deal && !camp.is_sold_out && (
                    <div className="absolute top-1 left-1 rounded-md bg-red-600 text-white text-[10px] px-2 py-0.5">
                        Горячеe
                    </div>
                )}
            </div>

            <div className="min-w-0">
                <h4 className="text-sm font-semibold line-clamp-1">{camp.title}</h4>
                <div className="mt-0.5 text-[12px] text-gray-600 line-clamp-1">📍 {camp.location_name}</div>
                <div className="text-[12px] text-gray-600">📆 {formatDateRange(camp.start_date, camp.end_date)}</div>

                <div className="mt-1 text-sm">
                    {camp.is_hot_deal && camp.hot_deal_price ? (
                        <div className="flex items-baseline gap-2">
                            <span className="text-red-600 font-semibold">{fmtPrice(camp.hot_deal_price, camp.currency)}</span>
                            <span className="line-through text-gray-400 text-xs">{fmtPrice(camp.price, camp.currency)}</span>
                        </div>
                    ) : (
                        <span className="font-semibold">{fmtPrice(camp.price, camp.currency)}</span>
                    )}
                </div>
            </div>
        </Link>
    );
}
