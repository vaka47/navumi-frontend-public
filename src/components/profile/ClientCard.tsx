'use client';

import SmartImage from '@/components/SmartImage';
import { absUrl } from '@/components/camp/campNormalize';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import PostCardProfile from '@/components/post/PostCardProfile';
import { getBrowserApiBase } from '@/lib/apiBase';


type PostSummary = { id: number | string; text?: string | null; images?: string[] };


interface Props {
    profile: {
        username: string;
        full_name?: string | null;
        profile_picture?: string | null;
        description?: string | null;
        telegram?: string | null;
        instagram?: string | null;
        website?: string | null;
        subscribed_clubs?: { username: string; club_name: string }[];
        subscribed_camps?: { id: number; title: string }[];
    };
    isOwner: boolean;
}

export default function ClientCard({ profile, isOwner }: Props) {
    const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null);


    const API_BASE = getBrowserApiBase();
    const [posts, setPosts] = useState<PostSummary[]>([]);
    const [loadingPosts, setLoadingPosts] = useState(false);

    const abs = (u?: string | null) => (u ? (u.startsWith('http') ? u : `${API_BASE}${u}`) : null);

    useEffect(() => {
    let cancelled = false;
    (async () => {
        setLoadingPosts(true);
        try {
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


    useEffect(() => {
        if (!isOwner) {
            fetch(`/check-subscription/client/${profile.username}/`, {
                credentials: 'include',
            })
                .then(res => res.json())
                .then(data => setIsSubscribed(data.subscribed));
        }
    }, [profile.username, isOwner]);

    const handleSubscribe = async () => {
        try {
            const res = await fetch(`/subscribe/client/${profile.username}/`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken') || '',
                },
                body: JSON.stringify({ action: 'toggle' }),
            });

            const data = await res.json();
            if (res.ok) setIsSubscribed(data.subscribed);
        } catch (err) {
            console.error('Ошибка подписки:', err);
        }
    };

    function getCookie(name: string): string | null {
        if (typeof document === 'undefined') return null;
        const cookie = document.cookie.split('; ').find(row => row.startsWith(name + '='));
        return cookie ? decodeURIComponent(cookie.split('=')[1]) : null;
    }



    return (
        <Card>
            <CardHeader>
                <CardTitle>
                    {profile.full_name || profile.username}
                    {isOwner && <span className="ml-2 text-muted-foreground text-sm">(вы)</span>}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {(() => {
                    const fallback = (process.env.NEXT_PUBLIC_BASE_PATH || '') + '/avatars/question3.jpg';
                    const avatar = absUrl(profile.profile_picture || '') || profile.profile_picture || fallback;
                    return (
                        <SmartImage
                            src={avatar}
                            alt="Фото профиля"
                            width={120}
                            height={120}
                            className="rounded-full border"
                            sizes="120px"
                        />
                    );
                })()}

                {profile.description && <p className="text-sm text-muted-foreground">{profile.description}</p>}

                <div className="text-sm space-y-1">
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

                {/* ---- Посты ---- */}
                <div>
                <h4 className="font-medium mb-2">Посты</h4>
                {loadingPosts ? (
                    <p className="text-sm text-muted-foreground">Загружаем посты…</p>
                ) : posts.length ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {posts.map((p) => (
                        <PostCardProfile
                        key={p.id}
                        feedSource={{ source: 'profile_posts', username: profile.username }}
                        post={{
                            id: p.id,
                            authorUsername: profile.username,
                            firstImageUrl: abs(p.images?.[0] ?? null) ?? undefined,
                            imagesCount: p.images?.length ?? 0,
                            text: p.text ?? '',
                        }}
                        />
                    ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">Постов пока нет</p>
                )}
                </div>


                {isOwner ? (
                    <>
                        <div>
                            <h4 className="font-medium">Подписки на клубы:</h4>
                            <ul className="text-sm list-disc pl-4">
                                {profile.subscribed_clubs?.length ? (
                                    profile.subscribed_clubs.map(club => (
                                        <li key={club.username}>
                                            <Link href={`/${club.username}`} className="underline">
                                                {club.club_name || club.username}
                                            </Link>
                                        </li>
                                    ))
                                ) : (
                                    <li>Нет подписок</li>
                                )}
                            </ul>
                        </div>

                        <div>
                            <h4 className="font-medium mt-4">Подписки на кэмпы:</h4>
                            <ul className="text-sm list-disc pl-4">
                                {profile.subscribed_camps?.length ? (
                                    profile.subscribed_camps.map(camp => (
                                        <li key={camp.id}>
                                            <Link href={`/camp/${camp.id}`} className="underline">
                                                {camp.title}
                                            </Link>
                                        </li>
                                    ))
                                ) : (
                                    <li>Нет подписок</li>
                                )}
                            </ul>
                        </div>

                        <div className="flex gap-4 mt-6">
                            <Button asChild variant="outline">
                                <Link href={`/${profile.username}/edit`}>Редактировать</Link>
                            </Button>
                            <Button asChild variant="ghost">
                                <Link href={`/${profile.username}/settings`}>Настройки</Link>
                            </Button>
                        </div>
                    </>
                ) : (
                    isSubscribed !== null && (
                        <Button onClick={handleSubscribe} variant="secondary">
                            {isSubscribed ? 'Отписаться от клиента' : 'Подписаться на клиента'}
                        </Button>
                    )
                )}
            </CardContent>
        </Card>
    );
}
