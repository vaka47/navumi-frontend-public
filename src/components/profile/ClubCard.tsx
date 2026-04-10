'use client';

import SmartImage from '@/components/SmartImage';
import { absUrl } from '@/components/camp/campNormalize';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import CampCardProfile from '@/components/camp/CampCardProfile';
import PostCardProfile from '@/components/post/PostCardProfile';
import { getBrowserApiBase } from '@/lib/apiBase';


type CampFromClubApi = {
    id: number;
    camp_number?: number | string | null;
    title: string;
    start_date?: string | null;
    end_date?: string | null;
    camp_url?: string | null;
    // расширенные поля для карточки
    title_image?: string | null;
    location_name?: string | null;
    price?: number | null;
    currency?: string | null;
    is_hot_deal?: boolean;
    hot_deal_price?: number | null;
    is_sold_out?: boolean;
};


type PostSummary = {
  id: number | string;
  text?: string | null;
  images?: string[];            // относительные или абсолютные
};



interface Props {
    profile: {
        id: number;                // 👈 обязателен
        username: string;
        club_name?: string | null;
        profile_picture?: string | null;
        description?: string | null;
        telegram?: string | null;
        instagram?: string | null;
        website?: string | null;
        phone_number?: string | null;
        camps?: { id: number; title: string; start_date: string }[];
    };
    isOwner: boolean;
    onEdit?: () => void;
}

export default function ClubCard({ profile, isOwner, onEdit }: Props) {
    const API_BASE = getBrowserApiBase();
    const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null);
    const [clubCamps, setClubCamps] = useState<CampFromClubApi[]>([]);
    const [loadingCamps, setLoadingCamps] = useState(false);

    const [posts, setPosts] = useState<PostSummary[]>([]);
    const [loadingPosts, setLoadingPosts] = useState(false);

    const abs = (u?: string | null) =>
        u ? (u.startsWith('http') ? u : `${API_BASE}${u}`) : null;


    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoadingPosts(true);
            try {
            // 1) если бэк уже кладёт посты в профиль — можно пропустить фетч и использовать data.posts
            // 2) иначе — пробуем отдельный эндпоинт профиля
            const r = await fetch(`${API_BASE}/api/profile/${profile.username}/posts/`, {
                credentials: 'include',
                cache: 'no-store',
            });
            const j = await r.json().catch(() => ({}));
            const arr: PostSummary[] = Array.isArray(j?.posts) ? j.posts : [];
            if (!cancelled) setPosts(arr);
            } catch {
            if (!cancelled) setPosts([]);
            } finally {
            if (!cancelled) setLoadingPosts(false);
            }
        })();
        return () => { cancelled = true; };
        }, [API_BASE, profile.username]);



    // подписка — по ID, как на бэке
    useEffect(() => {
        if (!isOwner && profile.id) {
            fetch(`${API_BASE}/check-subscription/club/${profile.id}/`, { credentials: 'include' })
                .then((r) => r.json())
                .then((d) => setIsSubscribed(Boolean(d.subscribed)))
                .catch(() => setIsSubscribed(null));
        }
    }, [API_BASE, isOwner, profile.id]);

    const handleSubscribe = async () => {
        try {
            const res = await fetch(`${API_BASE}/subscribe/club/${profile.id}/`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken') || '',
                },
                body: JSON.stringify({ action: 'toggle' }),
            });
            const data = await res.json();
            if (res.ok) setIsSubscribed(Boolean(data.subscribed));
        } catch (err) {
            console.error('Ошибка подписки:', err);
        }
    };

    function getCookie(name: string): string | null {
        if (typeof document === 'undefined') return null;
        const cookie = document.cookie.split('; ').find((row) => row.startsWith(name + '='));
        return cookie ? decodeURIComponent(cookie.split('=')[1]) : null;
    }

    // нормализация аватара
    const displaySrc = useMemo(() => {
        const raw = profile.profile_picture || null;
        const abs = raw ? (raw.startsWith('http') ? raw : `${API_BASE}${raw}`) : null;
        const norm = absUrl(abs || '') || abs;
        return norm ?? '/avatars/question.jpg';
    }, [API_BASE, profile.profile_picture]);

    // грузим кэмпы клуба из специализированного API — только «живые»
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoadingCamps(true);
            try {
                const r = await fetch(
                    `${API_BASE}/api/clubs/${encodeURIComponent(profile.username)}/camps/`,
                    { credentials: 'include', cache: 'no-store' }
                );
                if (!r.ok) throw new Error('bad response');
                const j = await r.json();
                const arr: CampFromClubApi[] = Array.isArray(j?.camps) ? j.camps : [];
                if (!cancelled) setClubCamps(arr);
            } catch {
                if (!cancelled) setClubCamps([]);
            } finally {
                if (!cancelled) setLoadingCamps(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [API_BASE, profile.username]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>
                    {profile.club_name || profile.username}
                    {isOwner && <span className="ml-2 text-muted-foreground text-sm">(вы)</span>}
                </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
                <SmartImage
                    key={displaySrc}
                    src={displaySrc}
                    alt="Фото профиля"
                    width={120}
                    height={120}
                    className="rounded-full border"
                    style={{ objectFit: 'cover' }}
                    priority
                    sizes="120px"
                    fetchPriority="high"
                />

                {profile.description && <p className="text-sm text-muted-foreground">{profile.description}</p>}

                <div className="text-sm space-y-1">
                    {profile.phone_number && (
                        <p>
                            Телефон:{' '}
                            <a href={`tel:${profile.phone_number}`} className="underline text-blue-600">
                                {profile.phone_number}
                            </a>
                        </p>
                    )}

                    {profile.telegram && (
                        <p>
                            Telegram:{' '}
                            <a href={`https://t.me/${profile.telegram}`} target="_blank" className="underline text-blue-600">
                                @{profile.telegram}
                            </a>
                        </p>
                    )}

                    {profile.instagram && (
                        <p>
                            Instagram:{' '}
                            <a href={`https://instagram.com/${profile.instagram}`} target="_blank" className="underline text-pink-600">
                                @{profile.instagram}
                            </a>
                        </p>
                    )}

                    {profile.website && (
                        <p>
                            Сайт:{' '}
                            <a
                                href={`https://${profile.website}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline text-blue-600"
                            >
                                {profile.website}
                            </a>
                        </p>
                    )}
                </div>

                <div className="mt-4">
                    <h4 className="font-medium mb-2">Кэмпы клуба:</h4>

                    {loadingCamps ? (
                        <p className="text-sm text-muted-foreground">Загружаем кэмпы…</p>
                    ) : clubCamps.length ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {clubCamps.map((c) => (
                                <CampCardProfile
                                    key={c.id}
                                    className="w-full"
                                    camp={{
                                        organizerUsername: profile.username,
                                        campNumber: Number(c.camp_number ?? 0),
                                        title: c.title,
                                        title_image: (c.title_image ?? null) as string | null,
                                        location_name: (c.location_name ?? '') as string,
                                        start_date: (c.start_date ?? '') as string,
                                        end_date: (c.end_date ?? '') as string,
                                        price: (typeof c.price === 'number' ? c.price : 0),
                                        currency: (c.currency ?? 'RUB') as string,
                                        is_sold_out: !!c.is_sold_out,
                                        is_hot_deal: !!c.is_hot_deal,
                                        hot_deal_price: (typeof c.hot_deal_price === 'number' ? c.hot_deal_price : null),
                                    }}
                                />
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">Нет опубликованных кэмпов</p>
                    )}
                </div>

                {/* ---- Посты клуба ---- */}
<div className="mt-6">
  <h4 className="font-medium mb-2">Посты</h4>

  {loadingPosts ? (
    <p className="text-sm text-muted-foreground">Загружаем посты…</p>
  ) : posts.length ? (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {posts.map((p) => {
        const first = abs(p.images?.[0] ?? null);
        return (
          <PostCardProfile
            key={p.id}
            feedSource={{ source: 'profile_posts', username: profile.username }}
            post={{
              id: p.id,
              authorUsername: profile.username,
              firstImageUrl: first ?? undefined,
              imagesCount: p.images?.length ?? 0,
              text: p.text ?? '',
            }}
          />
        );
      })}
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">Постов пока нет</p>
  )}
</div>


                {isOwner ? (
                    <div className="flex gap-4 mt-6">
                        {onEdit ? (
                            <Button variant="outline" onClick={() => onEdit?.()}>Редактировать</Button>
                        ) : (
                            <Button asChild variant="outline">
                                <Link href={`/${profile.username}/edit`}>Редактировать</Link>
                            </Button>
                        )}
                        <Button asChild variant="ghost">
                            <Link href={`/${profile.username}/settings`}>Настройки</Link>
                        </Button>
                    </div>
                ) : (
                    isSubscribed !== null && (
                        <Button onClick={handleSubscribe} variant="secondary">
                            {isSubscribed ? 'Отписаться от клуба' : 'Подписаться на клуб'}
                        </Button>
                    )
                )}
            </CardContent>
        </Card>
    );
}
