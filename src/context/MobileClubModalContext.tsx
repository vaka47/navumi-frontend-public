'use client';

import { createContext, useContext, useState } from 'react';

interface MobileClubModalContextType {
    requestExit?: (nextHref?: string) => void;
    setRequestExit?: (fn: (nextHref?: string) => void) => void;
}

const MobileClubModalContext = createContext<MobileClubModalContextType | undefined>(undefined);

export function MobileClubModalProvider({ children }: { children: React.ReactNode }) {
    const [requestExit, setRequestExit] = useState<(nextHref?: string) => void>(() => () => {});

    return (
        <MobileClubModalContext.Provider value={{ requestExit, setRequestExit }}>
            {children}
        </MobileClubModalContext.Provider>
    );
}

export function useMobileClubModal() {
    const context = useContext(MobileClubModalContext);
    if (!context) throw new Error('useMobileClubModal must be used within MobileClubModalProvider');
    return context;
}
