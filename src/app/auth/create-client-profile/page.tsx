'use client';

import { useRedirectIfAuthenticated } from '@/hooks/useRedirectIfAuthenticated';
import CreateClientProfilePage from '@/components/profile/CreateClientProfilePage';

export default function Page() {
    useRedirectIfAuthenticated();
    return <CreateClientProfilePage />;
}