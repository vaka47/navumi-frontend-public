'use client';

import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';
import { getBrowserApiBase } from '@/lib/apiBase';

function getCookie(name: string): string | null {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
}

export default function AutoSwitchActiveProfile() {
    const { profile, profiles, checkAuth } = useAuth();
    const pathname = usePathname();
    const username = pathname?.slice(1).split('/')[0];
    const API_BASE = getBrowserApiBase();

    useEffect(() => {
        if (!username) return;
        const mine = profiles.find(p => p.username === username);
        // переключаем только если это мой профиль и он НЕ активен
        if (mine && profile?.username !== username) {
            fetch(
                `${API_BASE}/api/profile/switch/by-username/${username}/`,
                {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'X-CSRFToken': getCookie('csrftoken') || '' },
                }
            ).then(() => checkAuth());
        }
    }, [API_BASE, username, profiles, profile?.username, checkAuth]);

    return null;
}
