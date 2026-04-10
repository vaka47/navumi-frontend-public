'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { getRegistrationToken } from '@/lib/registrationToken';
import { getBrowserApiBase } from '@/lib/apiBase';

/**
 * Хук для редиректа залогиненных пользователей на главную страницу поиска
 * Используется на страницах аутентификации, регистрации и создания профилей
 * НЕ редиректит, если пользователь еще не завершил регистрацию (нет профиля или есть registration_token)
 */
export function useRedirectIfAuthenticated() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        // Проверяем аутентификацию напрямую через API
        const checkAuth = async () => {
            try {
                const API = getBrowserApiBase();
                const res = await fetch(`${API}/api/check-auth/`, {
                    credentials: 'include',
                });
                const data = await res.json();
                
                // Если пользователь залогинен
                if (data.authenticated) {
                    // Проверяем, завершена ли регистрация
                    const hasProfile = data.has_client_profile || data.has_club_profile;
                    const hasRegistrationToken = !!getRegistrationToken();
                    
                    // Проверяем, создается ли второй профиль (параметр second=1)
                    const isCreatingSecondProfile = searchParams?.get('second') === '1';
                    
                    // Не редиректим, если:
                    // 1. Пользователь на странице выбора роли и у него нет профиля
                    // 2. Пользователь на странице создания профиля и у него есть registration_token
                    // 3. У пользователя вообще нет профиля (не завершил регистрацию)
                    // 4. Пользователь создает второй профиль (second=1)
                    const isOnRegistrationFlow = 
                        pathname === '/auth/choose-role' ||
                        pathname?.startsWith('/auth/create-client-profile') ||
                        pathname?.startsWith('/auth/create-club-profile');
                    
                    if (isOnRegistrationFlow && (!hasProfile || hasRegistrationToken || isCreatingSecondProfile)) {
                        // Пользователь в процессе регистрации или создает второй профиль - не редиректим
                        return;
                    }
                    
                    // Если регистрация завершена (есть профиль) - редиректим на поиск
                    if (hasProfile) {
                        router.replace('/search');
                    }
                }
            } catch {
                // Игнорируем ошибки, просто не редиректим
            } finally {
                setChecked(true);
            }
        };

        checkAuth();
    }, [router, pathname, searchParams]);

    // Возвращаем флаг проверки, если нужно показать loading
    return checked;
}
