'use client';

import FoggotPassword from "@/components/ForgotPassword";
import { useRedirectIfAuthenticated } from '@/hooks/useRedirectIfAuthenticated';

export default function Page() {
    useRedirectIfAuthenticated();
    return <FoggotPassword/>;
}