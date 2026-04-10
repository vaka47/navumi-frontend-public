'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import EditClubProfileModal from '@/components/profile/EditClubProfileModal';
import EditClubProfileMobilePage from '@/components/profile/EditClubProfileMobilePage';
import EditClientProfileModal from '@/components/profile/EditClientProfileModal';
import EditClientProfileMobilePage from '@/components/profile/EditClientProfileMobilePage';
import { useIsMobile } from '@/lib/hooks/useIsMobile';

type ApiProfileCommon = {
    username: string;
    role: 'club' | 'client';
    telegram?: string | null;
    instagram?: string | null;
    website?: string | null;
    description?: string | null;
    profile_picture?: string | null;
};

type ApiClubProfile = ApiProfileCommon & {
    role: 'club';
    club_name: string;
    phone_number?: string | null;
};

type ApiClientProfile = ApiProfileCommon & {
    role: 'client';
    full_name: string;
};

type ApiProfile = ApiClubProfile | ApiClientProfile;

export default function EditProfilePage() {
    const { username } = useParams<{ username: string }>();
    const [data, setData] = useState<ApiProfile | null>(null);
    const isMobile = useIsMobile();

    useEffect(() => {
        (async () => {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/profile/${username}/`, {
                credentials: 'include',
            });
            if (!res.ok) return;
            const json = (await res.json()) as ApiProfile;
            setData(json);
        })();
    }, [username]);

    if (!data) return null;

    if (data.role === 'club') {
        const initialClub = {
            username: data.username,
            club_name: (data as ApiClubProfile).club_name,
            telegram: data.telegram ?? undefined,
            instagram: data.instagram ?? undefined,
            phone_number: (data as ApiClubProfile).phone_number ?? undefined,
            website: data.website ?? undefined,
            description: data.description ?? undefined,
            profile_picture: data.profile_picture ?? undefined,
        };
        return isMobile ? (
            <EditClubProfileMobilePage open={true} onClose={() => window.history.back()} initialData={initialClub} />
        ) : (
            <EditClubProfileModal isOpen={true} onClose={() => window.history.back()} initialData={initialClub} />
        );
    }

    // client
    const c = data as ApiClientProfile;
    const initialClient = {
        username: c.username,
        full_name: c.full_name,
        telegram: c.telegram ?? undefined,
        instagram: c.instagram ?? undefined,
        website: c.website ?? undefined,
        description: c.description ?? undefined,
        profile_picture: c.profile_picture ?? undefined,
    };
    return isMobile ? (
        <EditClientProfileMobilePage open={true} onClose={() => window.history.back()} initialData={initialClient} />
    ) : (
        <EditClientProfileModal isOpen={true} onClose={() => window.history.back()} initialData={initialClient} />
    );
}
