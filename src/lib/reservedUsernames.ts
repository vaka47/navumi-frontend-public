/**
 * Список зарезервированных имен, которые нельзя использовать в качестве юзернеймов.
 * Эти имена соответствуют статическим маршрутам приложения.
 */
export const RESERVED_USERNAMES = [
  'about',
  'activity',
  'api',
  'auth',
  'contacts',
  'create-post',
  'feed',
  'img',
  'm',
  'messages',
  'profile',
  'recommendations',
  'responsibility',
  'search',
  'support',
] as const;

/**
 * Проверяет, является ли юзернейм зарезервированным именем.
 * @param username - юзернейм для проверки
 * @returns true, если юзернейм зарезервирован
 */
export function isReservedUsername(username: string): boolean {
  const normalized = username.toLowerCase().trim();
  return RESERVED_USERNAMES.includes(normalized as typeof RESERVED_USERNAMES[number]);
}
