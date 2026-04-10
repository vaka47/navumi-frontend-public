'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import CreateClientProfileMobilePage from '@/components/profile/CreateClientProfileMobilePage';
import { getRegistrationToken } from '@/lib/registrationToken';
import { useRedirectIfAuthenticated } from '@/hooks/useRedirectIfAuthenticated';

export default function Page() {
    useRedirectIfAuthenticated();
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        const isSecond = searchParams.get('second') === '1';
        const tokenFromUrl = searchParams.get('token');
        const tokenFromStorage = getRegistrationToken();
        const token = tokenFromUrl || tokenFromStorage;
        
        // Для второго профиля (second=1) токен не требуется
        if (!isSecond && !token) {
            // Если токена нет, редиректим на главную страницу поиска
            router.replace('/search');
        }
    }, [router, searchParams]);

    const isSecond = searchParams.get('second') === '1';
    const tokenFromUrl = searchParams.get('token');
    const tokenFromStorage = getRegistrationToken();
    const token = tokenFromUrl || tokenFromStorage;
    
    // Для второго профиля токен не обязателен
    if (!isSecond && !token) {
        return null; // Редирект уже произойдет в useEffect
    }

    return <CreateClientProfileMobilePage />;
}
