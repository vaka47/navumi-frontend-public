// context/MobileCampModalContext.tsx

"use client";

import { createContext, useContext, useState } from "react";

interface MobileCampModalContextType {
    open: boolean;
    setOpen: (value: boolean) => void;
    requestExit: (nextHref?: string) => void;
    setRequestExit: (fn: (nextHref?: string) => void) => void;
}

const MobileCampModalContext = createContext<MobileCampModalContextType | undefined>(undefined);

export function MobileCampModalProvider({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = useState(false);

    // ✅ типизированная функция выхода
    const [requestExitFn, setRequestExitFn] = useState<(nextHref?: string) => void>(() => () => {});

    return (
        <MobileCampModalContext.Provider value={{
            open,
            setOpen,
            requestExit: requestExitFn,
            setRequestExit: setRequestExitFn,
        }}>
            {children}
        </MobileCampModalContext.Provider>
    );
}

export function useMobileCampModal() {
    const context = useContext(MobileCampModalContext);
    if (!context) {
        throw new Error("useMobileCampModal must be used within MobileCampModalProvider");
    }
    return context;
}
