'use client';

import { useEffect } from 'react';
import { fetchUserProfile } from '@/api/fetchUserProfile';
import { useUserStore } from '@/store/userStore';
import { IdentifyUser } from "@/components/monitoring/IdentifyUser";

export function RootLayoutClient() {
    const user = useUserStore((state) => state.user);

    useEffect(() => {
        fetchUserProfile();
    }, []);

    return user ? <IdentifyUser user={user} /> : null;
}
