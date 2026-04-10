'use client';

import LoginForm from "@/components/LoginForm";
import { useRedirectIfAuthenticated } from '@/hooks/useRedirectIfAuthenticated';

export default function Page() {
    useRedirectIfAuthenticated();
    return <LoginForm />;
}