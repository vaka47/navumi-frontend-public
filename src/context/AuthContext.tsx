'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ProfileData } from '@/types/profile';
import { getBrowserApiBase } from '@/lib/apiBase';


type AuthContextType = {
    authenticated: boolean;
    profile: ProfileData | null;
    hasClientProfile: boolean;
    hasClubProfile: boolean;
    telegramNotificationsEnabled: boolean;
    profiles: { id: number; username: string; role: 'client' | 'club'; profile_picture?: string | null }[];
    setAuthenticated: (value: boolean) => void;
    setProfile: (profile: ProfileData | null) => void;
    setTelegramNotificationsEnabled: (value: boolean) => void;
    checkAuth: () => Promise<void>;
};



const AuthContext = createContext<AuthContextType>({
    authenticated: false,
    profile: null,
    hasClientProfile: false,
    hasClubProfile: false,
    telegramNotificationsEnabled: false,
    profiles: [],
    setAuthenticated: () => {},
    setProfile: () => {},
    setTelegramNotificationsEnabled: () => {},
    checkAuth: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [authenticated, setAuthenticated] = useState(false);
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [profiles, setProfiles] = useState<
        { id: number; username: string; role: 'client' | 'club'; profile_picture?: string | null }[]
    >([]);
    const [hasClientProfile, setHasClientProfile] = useState(false);
    const [hasClubProfile, setHasClubProfile] = useState(false);
    const [telegramNotificationsEnabled, setTelegramNotificationsEnabled] = useState(false);
    const API_BASE = getBrowserApiBase();

    const checkAuth = async () => {
        try {
            const url = `${API_BASE}/api/check-auth/`;
            try { console.info('[Auth] checkAuth →', url); } catch {}
            const res = await fetch(url, {
                credentials: 'include',
            });
            const data = await res.json();

            setAuthenticated(data.authenticated);
            setProfile(data.profile ?? null);
            setProfiles(data.profiles ?? []);
            setHasClientProfile(data.has_client_profile ?? false);
            setHasClubProfile(data.has_club_profile ?? false);
            setTelegramNotificationsEnabled(data.telegram_notifications_enabled ?? false);
        } catch {
            setAuthenticated(false);
            setProfile(null);
            setProfiles([]);
            setHasClientProfile(false);
            setHasClubProfile(false);
            setTelegramNotificationsEnabled(false);
        }
        console.log('➡️ profile:', profile);
        console.log('➡️ profiles:', profiles);
    };


    // ✅ Вызываем checkAuth только если не на странице логина
    useEffect(() => {
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth/login')) {
            checkAuth();
        }
    }, []);

    // 🔄 Обновляем состояние (в том числе telegram_notifications_enabled),
    // когда пользователь возвращается на вкладку.
    useEffect(() => {
        if (typeof document === 'undefined') return;
        const handleVisibility = () => {
            if (document.visibilityState !== 'visible') return;
            // Имеет смысл дергать только для залогиненных
            // и только если по нашим данным уведомления ещё выключены.
            if (!authenticated || telegramNotificationsEnabled) return;
            checkAuth();
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [authenticated, telegramNotificationsEnabled, checkAuth]);

    return (
        <AuthContext.Provider
            value={{
                authenticated,
                profile,
                hasClientProfile,
                hasClubProfile,
                telegramNotificationsEnabled,
                profiles,
                setAuthenticated,
                setProfile,
                setTelegramNotificationsEnabled,
                checkAuth,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);

export async function waitForAuthReady(
    maxWait = 3000,
    interval = 150
): Promise<ProfileData | null> {
    const API_BASE = getBrowserApiBase();
    const start = Date.now();

    while (Date.now() - start < maxWait) {
        try {
            const res = await fetch(`${API_BASE}/api/check-auth/`, {
                credentials: 'include',
            });
            const data = await res.json();

            if (data?.authenticated && data?.profile) {
                return data.profile;
            }
        } catch {
            // игнорируем
        }

        await new Promise((resolve) => setTimeout(resolve, interval));
    }

    return null;
}
