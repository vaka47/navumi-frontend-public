
import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import CampScreen from '@/components/camp/CampScreen';

type RouteParams = { username: string; camp_number: string };

type CampMeta = {
    title?: string | null;
    description?: string | null;
    location_name?: string | null;
    title_image?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    price?: number | string | null;
    currency?: string | null;
    activities?: Array<{ name?: string | null } | string | number> | null;
    organizer?: { username?: string | null; club_name?: string | null } | null;
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || 'https://api.navumi.com').replace(/\/+$/, '');
const APP_BASE = (process.env.NEXT_PUBLIC_APP_BASE_URL || 'https://navumi.com').replace(/\/+$/, '');
const normalizeUsername = (value?: string | null): string =>
    (value || '').replace(/^@+/, '').trim();

const toSnippet = (value?: string | null, maxLen = 160): string => {
    const clean = (value || '').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    if (clean.length <= maxLen) return clean;
    return `${clean.slice(0, maxLen - 1).trim()}…`;
};

const toAbsoluteUrl = (value?: string | null): string | null => {
    const raw = (value || '').trim();
    if (!raw) return null;
    try {
        return new URL(raw, `${APP_BASE}/`).toString();
    } catch {
        return null;
    }
};

const toPriceValue = (value?: string | number | null): string | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'string') {
        const cleaned = value.replace(',', '.').trim();
        if (!cleaned) return null;
        const num = Number(cleaned);
        if (Number.isFinite(num)) return String(num);
    }
    return null;
};

const buildCampMeta = (camp: CampMeta | null, params: RouteParams): Metadata => {
    const canonicalUsername = normalizeUsername(camp?.organizer?.username) || normalizeUsername(params.username);
    const titleBase = (camp?.title || '').trim();
    const location = (camp?.location_name || '').trim();
    const title = titleBase ? `${titleBase} — спортивный кэмп` : `Кэмп ${params.camp_number}`;
    const activities = Array.isArray(camp?.activities)
        ? camp!.activities
            .map((item) => {
                if (typeof item === 'string' || typeof item === 'number') return String(item).trim();
                if (item && typeof item === 'object' && typeof item.name === 'string') return item.name.trim();
                return null;
            })
            .filter((name): name is string => Boolean(name))
        : [];
    const activityLine = activities.length ? activities.join(', ') : '';
    const descriptionBase =
        toSnippet(camp?.description) ||
        toSnippet(location ? `Спортивный кэмп в ${location}` : 'Спортивный кэмп на платформе Navumi');
    const description = activityLine && descriptionBase.length < 140
        ? `${descriptionBase}. Активности: ${activityLine}.`
        : descriptionBase;
    const image = camp?.title_image || undefined;
    const canonical = `/${canonicalUsername}/camp/${params.camp_number}`;

    return {
        title,
        description,
        keywords: activities.slice(0, 20),
        alternates: { canonical },
        openGraph: {
            title,
            description,
            type: 'article',
            url: canonical,
            images: image ? [{ url: image }] : undefined,
        },
        twitter: {
            card: image ? 'summary_large_image' : 'summary',
            title,
            description,
            images: image ? [image] : undefined,
        },
    };
};

const buildCampStructuredData = (camp: CampMeta | null, params: RouteParams) => {
    if (!camp) return null;
    const canonicalUsername = normalizeUsername(camp.organizer?.username) || normalizeUsername(params.username);
    const name = (camp.title || '').trim() || `Кэмп ${params.camp_number}`;
    const description = toSnippet(camp.description, 220);
    const locationName = (camp.location_name || '').trim();
    const startDate = (camp.start_date || '').trim();
    const endDate = (camp.end_date || '').trim();
    const price = toPriceValue(camp.price);
    const currency = (camp.currency || 'RUB').trim();
    const image = toAbsoluteUrl(camp.title_image);
    const organizerName = (camp.organizer?.club_name || camp.organizer?.username || '').trim();
    const url = new URL(`/${canonicalUsername}/camp/${params.camp_number}`, `${APP_BASE}/`).toString();

    if (!startDate || !locationName) return null;

    const data: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name,
        url,
    };

    if (description) data.description = description;
    if (image) data.image = [image];
    if (startDate) data.startDate = startDate;
    if (endDate) data.endDate = endDate;
    if (locationName) {
        data.location = {
            '@type': 'Place',
            name: locationName,
        };
    }
    if (organizerName) {
        data.organizer = {
            '@type': 'Organization',
            name: organizerName,
            url: new URL(`/${canonicalUsername}`, `${APP_BASE}/`).toString(),
        };
    }
    if (startDate) {
        data.eventStatus = 'https://schema.org/EventScheduled';
    }
    if (price) {
        data.offers = {
            '@type': 'Offer',
            price,
            priceCurrency: currency || 'RUB',
            availability: 'https://schema.org/InStock',
            validFrom: startDate || undefined,
        };
    }
    return data;
};

const buildCampBreadcrumbs = (camp: CampMeta | null, params: RouteParams) => {
    const title = (camp?.title || '').trim() || `Кэмп ${params.camp_number}`;
    const canonicalUsername = normalizeUsername(camp?.organizer?.username) || normalizeUsername(params.username);
    const base = APP_BASE.replace(/\/+$/, '');
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            {
                '@type': 'ListItem',
                position: 1,
                name: 'Navumi',
                item: base,
            },
            {
                '@type': 'ListItem',
                position: 2,
                name: title,
                item: `${base}/${canonicalUsername}/camp/${params.camp_number}`,
            },
        ],
    };
};

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
    const { username, camp_number } = await params;
    try {
        const res = await fetch(`${API_BASE}/api/camps/${username}/${camp_number}/`, {
            next: { revalidate: 300 },
        });
        if (!res.ok) {
            return buildCampMeta(null, { username, camp_number });
        }
        const camp = await res.json() as CampMeta;
        return buildCampMeta(camp, { username, camp_number });
    } catch {
        return buildCampMeta(null, { username, camp_number });
    }
}

export default async function Page({ params }: { params: Promise<RouteParams> }) {
    const { username, camp_number } = await params;

    const res = await fetch(`${API_BASE}/api/camps/${username}/${camp_number}/`, {
        // прокидываем куки, чтобы бэк мог понять владельца и выставить is_owner
        headers: { cookie: cookies().toString() },
        cache: 'no-store',
    });

    if (!res.ok) {
        return <div>Контент не найден</div>;
    }

    const camp = await res.json();
    const structuredData = buildCampStructuredData(camp, { username, camp_number });
    const breadcrumbs = buildCampBreadcrumbs(camp, { username, camp_number });
    // Убираем верхний отступ, который добавляет layout через var(--header-h)
    // сразу на SSR, чтобы страница не «дёргалась» после гидратации.
    return (
        <>
            {structuredData ? (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
                />
            ) : null}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
            />
            <div style={{ marginTop: 'calc(var(--header-h, 64px) * -1)' }}>
                <CampScreen username={username} campNumber={camp_number} initialCamp={camp} />
            </div>
        </>
    );
}
