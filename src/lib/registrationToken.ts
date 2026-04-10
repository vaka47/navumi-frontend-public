/**
 * Утилиты для работы с токеном регистрации
 * Токен хранится в sessionStorage и используется для прохождения этапов регистрации
 */

const REGISTRATION_TOKEN_KEY = 'registration_token';

function safeSetStorage(key: string, value: string) {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(key, value);
    } catch {
        try {
            window.sessionStorage.setItem(key, value);
        } catch {
            // ignore
        }
    }
}

function safeGetStorage(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
        const fromLocal = window.localStorage.getItem(key);
        if (fromLocal !== null) return fromLocal;
    } catch {
        // ignore and try sessionStorage fallback
    }
    try {
        const fromSession = window.sessionStorage.getItem(key);
        if (fromSession !== null) {
            // миграция в localStorage для будущих заходов
            try { window.localStorage.setItem(key, fromSession); } catch { /* ignore */ }
            try { window.sessionStorage.removeItem(key); } catch { /* ignore */ }
            return fromSession;
        }
    } catch {
        // ignore
    }
    return null;
}

function safeRemoveStorage(key: string) {
    if (typeof window === 'undefined') return;
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
    try { window.sessionStorage.removeItem(key); } catch { /* ignore */ }
}

/**
 * Сохраняет токен регистрации в sessionStorage
 */
export function saveRegistrationToken(token: string): void {
    safeSetStorage(REGISTRATION_TOKEN_KEY, token);
}

/**
 * Получает токен регистрации из sessionStorage
 */
export function getRegistrationToken(): string | null {
    return safeGetStorage(REGISTRATION_TOKEN_KEY);
}

/**
 * Удаляет токен регистрации из sessionStorage
 */
export function clearRegistrationToken(): void {
    safeRemoveStorage(REGISTRATION_TOKEN_KEY);
}

/**
 * Проверяет наличие токена регистрации
 */
export function hasRegistrationToken(): boolean {
    return getRegistrationToken() !== null;
}
