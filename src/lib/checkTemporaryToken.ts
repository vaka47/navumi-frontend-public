/**
 * Утилита для проверки, есть ли у пользователя только временный токен регистрации
 * (подтвердил email, но не создал профиль)
 */

import { getRegistrationToken } from './registrationToken';

/**
 * Проверяет, есть ли у пользователя временный токен регистрации
 * Это означает, что пользователь подтвердил email, но еще не создал профиль
 */
export function hasTemporaryToken(): boolean {
    return getRegistrationToken() !== null;
}






