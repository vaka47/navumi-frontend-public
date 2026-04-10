'use client';

import { useRouter } from 'next/navigation';
import { getRegistrationToken, clearRegistrationToken } from '@/lib/registrationToken';
import { getBrowserApiBase } from '@/lib/apiBase';

export default function ChooseRole() {
    const router = useRouter();

    //useEffect(() => {
    //    const calculate = () => {
    //const header = document.querySelector('header');
    //const headerHeight = header?.getBoundingClientRect().height || 0;
    //const windowHeight = window.innerHeight;
    //setAvailableHeight(windowHeight - headerHeight);
    //    };

    //    calculate();
    //    window.addEventListener('resize', calculate);
    //    return () => window.removeEventListener('resize', calculate);
    //}, []);

    const handleChoose = async (role: 'club' | 'client') => {
        const API_BASE = getBrowserApiBase();
        const res = await fetch(`${API_BASE}/api/choose-role/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken') || '',
            },
            credentials: 'include',
            body: JSON.stringify({ 
                // Токен передаём, только если он есть.
                // Если по какой-то причине потерялся (например, особенности браузера),
                // бэкенд вернёт 401/403, и мы аккуратно отправим пользователя
                // на /auth/register, не устраивая бесконечных редиректов.
                registration_token: getRegistrationToken(),
                role 
            }),
        });

        const data = await res.json();
        if (res.ok && data.redirect) {
            // Токен остается в sessionStorage для следующего шага
            router.push(data.redirect);
        } else {
            // Если токен недействителен, очищаем его и редиректим на регистрацию
            if (res.status === 401 || res.status === 403) {
                clearRegistrationToken();
                alert(data.error || 'Токен регистрации истек. Пожалуйста, начните регистрацию заново.');
                router.push('/auth/register');
            } else {
                alert(data.error || 'Ошибка при выборе роли');
            }
        }
    };

    function getCookie(name: string): string | null {
        if (typeof document === 'undefined') return null;
        const cookie = document.cookie.split('; ').find((row) => row.startsWith(name + '='));
        return cookie ? decodeURIComponent(cookie.split('=')[1]) : null;
    }

    return (
        <div className="h-[calc(100dvh-64px)] flex items-center justify-center px-4">
            <div
                className="mx-auto flex flex-col gap-6 sm:flex-row sm:justify-center sm:items-stretch sm:flex-wrap sm:gap-8"
                style={{ opacity: 1, transform: 'none' }}
            >
                {/* Карточка "Клуб" */}
                <div
                    className="rounded-2xl border shadow hover:shadow-lg transition min-w-[320px] flex-1"
                    style={{ transform: 'none' }}
                >
                    <div className="rounded-xl border bg-card text-card-foreground shadow">
                        <div className="p-6 space-y-4 text-center">

                            <h2 className="text-xl font-semibold">Я — Клуб</h2>
                            <p className="text-muted-foreground text-sm">
                                Организую спортивные кэмпы, общаюсь с участниками.
                            </p>
                            <button
                                onClick={() => handleChoose('club')}
                                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2 w-full">
                                Продолжить как клуб
                            </button>
                        </div>
                    </div>
                </div>

                {/* Карточка "Клиент" */}
                <div
                    className="rounded-2xl border shadow hover:shadow-lg transition min-w-[320px] flex-1"
                    style={{ transform: 'none' }}
                >
                    <div className="rounded-xl border bg-card text-card-foreground shadow">
                        <div className="p-6 space-y-4 text-center">
                            <h2 className="text-xl font-semibold">Я — Клиент</h2>
                            <p className="text-muted-foreground text-sm">
                                Ищу интересные кэмпы, подписываюсь на организаторов.
                            </p>
                            <button
                                onClick={() => handleChoose('client')}
                                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2 w-full">
                                Продолжить как клиент
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
