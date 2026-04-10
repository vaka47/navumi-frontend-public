'use client';

import ChooseRole from "@/components/ChooseRole";
import { useRedirectIfAuthenticated } from '@/hooks/useRedirectIfAuthenticated';

export default function Page() {
    useRedirectIfAuthenticated();
    return <ChooseRole />;
}