import { useEffect, useState } from "react";

type GoogleWindow = Window & typeof globalThis & {
    google?: typeof google;
};

export function useGooglePlacesReady(stabilizeMs = 200, maxWaitMs = 5000) {
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const startedAt = Date.now();

        let timer: ReturnType<typeof setTimeout> | null = null;
        let rafId: number | null = null;

        const check = () => {
            const gwin = typeof window !== "undefined" ? (window as GoogleWindow) : undefined;
            const ok = !!gwin?.google?.maps?.places;

            if (ok) {
                timer = setTimeout(() => {
                    if (!cancelled) setReady(true);
                }, stabilizeMs);
                return;
            }

            if (Date.now() - startedAt < maxWaitMs) {
                rafId = requestAnimationFrame(check);
            }
        };

        check();

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, [stabilizeMs, maxWaitMs]);

    return ready;
}
