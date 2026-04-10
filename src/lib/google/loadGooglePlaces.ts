let googlePlacesPromise: Promise<void> | null = null;

declare global {
    interface Window {
        google?: typeof google;
    }
}

function hasPlaces(): boolean {
    return typeof window !== "undefined" && !!window.google?.maps?.places;
}

/**
 * Лениво грузит Google Maps JS API (только библиотеку places).
 * Повторные вызовы возвращают один и тот же промис.
 */
export function loadGooglePlaces(): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve(); // SSR
    if (hasPlaces()) return Promise.resolve();
    if (googlePlacesPromise) return googlePlacesPromise;

    googlePlacesPromise = new Promise<void>((resolve, reject) => {
        const existing = document.getElementById("gmaps-js") as HTMLScriptElement | null;

        if (existing) {
            if (hasPlaces()) { resolve(); return; }
            existing.addEventListener("load", () => resolve());
            existing.addEventListener("error", () =>
                reject(new Error("Google Maps script failed to load"))
            );
            return;
        }

        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        if (!apiKey) {
            reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set"));
            return;
        }

        const script = document.createElement("script");
        script.id = "gmaps-js";
        script.async = true;
        script.defer = true;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&v=weekly`;

        script.addEventListener("load", () => resolve());
        script.addEventListener("error", () =>
            reject(new Error("Google Maps script failed to load"))
        );

        document.head.appendChild(script);
    });

    return googlePlacesPromise;
}
