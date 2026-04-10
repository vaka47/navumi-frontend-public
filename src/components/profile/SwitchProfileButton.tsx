'use client';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useLayerStack } from '@/context/LayerStackContext';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';
import { getBrowserApiBase } from '@/lib/apiBase';

function getCookie(name: string): string | null {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
}

export function SwitchProfileButton() {
    const { profile, profiles, checkAuth } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const { clearScreens } = useLayerStack();
    const API_BASE = getBrowserApiBase();
    const overlayEnv = useOverlayEnvironment();

    const otherProfile = useMemo(() => {
        if (!profile || profiles.length < 2) return null;
        return profiles.find((p) => p.username !== profile.username);
    }, [profile, profiles]);

    if (!otherProfile) return null;
    console.log('➡️ profile:', profile);
    console.log('➡️ profiles:', profiles);

    const handleSwitch = async () => {
        setLoading(true);
        try {
            const res = await fetch(
                `${API_BASE}/api/profile/switch/by-username/${otherProfile.username}/`,
                {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'X-CSRFToken': getCookie('csrftoken') || '',
                    },
                }
            );

            if (res.ok) {
                // сначала обновим AuthContext, затем уйдём на поиск
                setTimeout(() => {
                    checkAuth();
                }, 0);

                // Если мы находимся внутри оверлея профиля, используем
                // его встроенную навигацию, которая сама корректно
                // закрывает все overlay‑экраны и делает переход.
                if (overlayEnv.navigate) {
                    overlayEnv.navigate('/search');
                } else {
                    // Fallback: принудительно очищаем стек оверлеев
                    // и делаем обычный SPA‑переход.
                    try {
                        clearScreens();
                    } catch {
                        // ignore
                    }
                    router.push('/search');
                }
            }
        } catch {
            alert('Сетевая ошибка при переключении профиля');
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handleSwitch}
            disabled={loading}
            className="block w-full text-left px-4 py-2 hover:bg-muted rounded"
        >
            {loading ? 'Переключение...' : `Зайти как ${otherProfile.username}`}
        </button>
    );
}
