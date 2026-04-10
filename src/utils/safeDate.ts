export function parseDateYYYYMMDD(s?: string | null): Date | null {
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;

    const year = Number(m[1]);
    const month = Number(m[2]); // 1..12
    const day = Number(m[3]);   // 1..31

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const date = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(date.getTime()) ? null : date;
}

export function isValidDate(d: unknown): d is Date {
    return d instanceof Date && !Number.isNaN(d.getTime());
}

export function formatRuDate(d?: Date | null, opts?: Intl.DateTimeFormatOptions): string {
    if (!isValidDate(d)) return '';
    try {
        return d!.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            ...opts,
        });
    } catch {
        return '';
    }
}

export function formatRuDateRange(start?: Date | null, end?: Date | null): string {
    const s = formatRuDate(start);
    const e = formatRuDate(end);
    if (s && e) return `${s} — ${e}`;
    return s || e || '';
}
