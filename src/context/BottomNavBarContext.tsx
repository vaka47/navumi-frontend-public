'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';

interface BottomNavBarContextType {
    hide: boolean;
    setHide: (value: boolean) => void;
}

const BottomNavBarContext = createContext<BottomNavBarContextType | undefined>(undefined);

export function BottomNavBarProvider({ children }: { children: React.ReactNode }) {
    const [hide, _setHide] = useState(false);
    const hideRef = useRef(hide);

    useEffect(() => {
        hideRef.current = hide;
    }, [hide]);

    const setHide = (value: boolean) => {
        const prev = hideRef.current;
        const next = value;
        hideRef.current = next;
        try {
            if (typeof window !== 'undefined') {
                // подробный лог эволюции флага hide
                // eslint-disable-next-line no-console
                console.info('[BottomNavCtx] setHide', {
                    prev,
                    next,
                    href: window.location.href,
                    path: window.location.pathname + window.location.search,
                    stack: new Error().stack?.split('\n').slice(0, 4).join('\n'),
                });
            }
        } catch {
            /* noop */
        }
        _setHide(next);
    };

    return (
        <BottomNavBarContext.Provider value={{ hide, setHide }}>
            {children}
        </BottomNavBarContext.Provider>
    );
}

export function useBottomNavBar() {
    const context = useContext(BottomNavBarContext);
    if (context) return context;
    if (process.env.NODE_ENV !== 'production') {
        console.warn('useBottomNavBar used outside BottomNavBarProvider – falling back to no-op implementation');
    }
    return {
        hide: false,
        setHide: () => {},
    };
}
