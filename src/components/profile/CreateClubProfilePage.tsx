'use client';

import { useEffect } from 'react';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import DesktopCreate from '@/components/CreateClubProfile';
import { useRouter } from 'next/navigation';
import { getRegistrationToken } from '@/lib/registrationToken';

export default function CreateClubProfilePage() {
    const isMobile = useMediaQuery('(max-width: 640px)');
    const router = useRouter();

    // Проверяем наличие токена при монтировании
    useEffect(() => {
        const search = typeof window !== 'undefined' ? window.location.search : '';
        const sp = search ? new URLSearchParams(search) : null;
        const isSecond = sp?.get('second') === '1';

        const tokenFromUrl = sp?.get('token') ?? null;
        const tokenFromStorage = getRegistrationToken();
        const token = tokenFromUrl || tokenFromStorage;

        // Для первого профиля токен обязателен; для второго (second=1) — можно без токена
        if (!token && !isSecond) {
            // Если токена нет, редиректим на главную страницу поиска
            router.replace('/search');
            return;
        }

        if (isMobile) {
            const qs = search || '';
            router.replace(`/auth/create-club-profile/mobile${qs}`);
        }
    }, [isMobile, router]);

    // Проверяем токен перед рендером десктопной версии
    if (!isMobile) {
        const search = typeof window !== 'undefined' ? window.location.search : '';
        const sp = search ? new URLSearchParams(search) : null;
        const isSecond = sp?.get('second') === '1';

        const tokenFromUrl = sp?.get('token') ?? null;
        const tokenFromStorage = getRegistrationToken();
        const token = tokenFromUrl || tokenFromStorage;

        // Для первого профиля токен обязателен; для второго (second=1) — нет
        if (!token && !isSecond) {
            return null; // Редирект (на /search) уже произойдет в useEffect
        }

        return <DesktopCreate />;
    }

    return <div className="h-screen bg-white" />;
}
