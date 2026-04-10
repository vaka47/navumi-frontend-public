'use client';

import ResetPassword from "@/components/ResetPassword";
import { useRedirectIfAuthenticated } from '@/hooks/useRedirectIfAuthenticated';

export default function Page() {
    useRedirectIfAuthenticated();
    return <ResetPassword />;
}
