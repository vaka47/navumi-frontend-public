'use client';

import { useRedirectIfAuthenticated } from '@/hooks/useRedirectIfAuthenticated';
import CreateClubProfilePage from '@/components/profile/CreateClubProfilePage';

export default function Page() {
    useRedirectIfAuthenticated();
    return <CreateClubProfilePage />;
}