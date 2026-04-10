'use client';

import { useEffect, useState } from 'react';
import CampInfo from './CampInfo';
import CampMobileInfo from './CampMobileInfo';
import { getBrowserApiBase } from '@/lib/apiBase';
//import { useIsMobile } from '@/lib/hooks/useIsMobile';

export type Activity = { id: number; name: string };

export type Camp = {
    id: number;
    organizer: { username: string; club_name?: string | null };
    organizerUsername?: string;   // опционально, если так приходит
    campNumber?: number;          // опционально, если так приходит
    title: string;
    description?: string;
    location_name: string;
    latitude?: number | string | null;
    longitude?: number | string | null;
    activities?: Activity[];
    start_date: string;           // ISO (YYYY-MM-DD)
    end_date: string;             // ISO
    price: number | string;
    original_price?: number | string | null;
    currency: 'RUB' | 'USD' | 'EUR' | string;
    is_kids_camp: boolean;
    has_kids_coach: boolean;
    is_sold_out: boolean;
    is_hot_deal: boolean;
    hot_deal_price?: number | string | null;
    title_image?: string | null;
    gallery?: string[];           // массив URL-ов доп. фото
    phone?: string | null;
    telegram_nickname?: string | null;
    is_owner?: boolean;           // сервер проставляет true для владельца
};

function useMediaQuery(query: string) {
    const [matches, setMatches] = useState(false);
    useEffect(() => {
        const m = window.matchMedia(query);
        const onChange = () => setMatches(m.matches);
        onChange();
        m.addEventListener('change', onChange);
        return () => m.removeEventListener('change', onChange);
    }, [query]);
    return matches;
}

function getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.split('; ').find((r) => r.startsWith(name + '='));
    return match ? decodeURIComponent(match.split('=')[1]) : null;
}

export default function CampInfoSwitcher({ camp: initialCamp }: { camp: Camp }) {
    const isMobile = useMediaQuery('(max-width: 767px)');
    const [camp, setCamp] = useState<Camp>(initialCamp);
    const [busy, setBusy] = useState(false);

    const base = getBrowserApiBase();
    const csrf = getCookie('csrftoken') || '';


    // --- единая логика мутаций, пробрасываем в обе версии ---
    async function toggleSoldOut(next: boolean) {
        if (!camp.is_owner) return;
        setBusy(true);
        const prev = camp.is_sold_out;
        setCamp(c => ({ ...c, is_sold_out: next }));
        try {
            const res = await fetch(`${base}/camp/${camp.id}/toggle_sold_out/`, {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
            });
            const data = await res.json();
            if (typeof data.is_sold_out === 'boolean') {
                setCamp(c => ({ ...c, is_sold_out: data.is_sold_out }));
            } else {
                throw new Error();
            }
        } catch {
            setCamp(c => ({ ...c, is_sold_out: prev }));
            alert('Не удалось обновить статус Sold out');
        } finally { setBusy(false); }
    }

    async function activateHotDeal(newPrice: number) {
        if (!camp.is_owner) return;
        setBusy(true);
        const prev = { is_hot_deal: camp.is_hot_deal, hot_deal_price: camp.hot_deal_price, price: camp.price, original_price: camp.original_price };
        setCamp(c => ({ ...c, is_hot_deal: true, hot_deal_price: newPrice }));
        try {
            const res = await fetch(`${base}/camp/${camp.id}/toggle-hot-deal/`, {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
                body: JSON.stringify({ new_price: newPrice }),
            });
            const data = await res.json();
            // бэк возвращает {success, is_hot_deal, price, original_price}
            setCamp(c => ({
                ...c,
                is_hot_deal: !!data.is_hot_deal,
                hot_deal_price: data.is_hot_deal ? Number(data.price) : null,
                price: Number(data.price),
                original_price: data.original_price ?? c.original_price ?? null,
            }));
        } catch {
            setCamp(c => ({ ...c, ...prev }));
            alert('Не удалось включить «горящее предложение».');
        } finally { setBusy(false); }
    }

    async function deactivateHotDeal() {
        if (!camp.is_owner) return;
        setBusy(true);
        const prev = { is_hot_deal: camp.is_hot_deal, hot_deal_price: camp.hot_deal_price, price: camp.price, original_price: camp.original_price };
        setCamp(c => ({ ...c, is_hot_deal: false, hot_deal_price: null, price: c.original_price ?? c.price }));
        try {
            const res = await fetch(`${base}/camp/${camp.id}/toggle-hot-deal/`, {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
                body: JSON.stringify({}), // для выключения тело не нужно
            });
            const data = await res.json();
            setCamp(c => ({
                ...c,
                is_hot_deal: !!data.is_hot_deal,        // false
                hot_deal_price: null,
                price: Number(data.price),              // вернулась оригинальная
                original_price: data.original_price ? Number(data.original_price) : c.original_price,
            }));
        } catch {
            setCamp(c => ({ ...c, ...prev }));
            alert('Не удалось снять «горящее предложение».');
        } finally { setBusy(false); }
    }


    const commonProps = { camp, busy, onToggleSoldOut: toggleSoldOut, onActivateHot: activateHotDeal, onDeactivateHot: deactivateHotDeal };

    return isMobile ? <CampMobileInfo {...commonProps} /> : <CampInfo {...commonProps} />;
}
