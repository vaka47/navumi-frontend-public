'use client';

import RegisterForm from "@/components/RegisterForm";
import { useRedirectIfAuthenticated } from '@/hooks/useRedirectIfAuthenticated';

export default function Page() {
    useRedirectIfAuthenticated();
    return <RegisterForm />;
}
