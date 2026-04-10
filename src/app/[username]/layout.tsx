import Header from '@/components/header';
import type { ReactNode } from 'react';

export default function ProfileLayout({ children }: { children: ReactNode }) {
    return (
        <div
            className="bg-muted min-h-[100dvh]"               // без минус 64px
            style={{ paddingTop: 'var(--header-h, 64px)' }}   // универсальный отступ под хэдер
        >
            <Header />
            {children}
        </div>
    );
}