'use client';

import React, { useEffect, useRef, useState, useLayoutEffect, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { usePathname, useSearchParams} from 'next/navigation';
import { Menu, Heart } from 'lucide-react';
import EditClubProfileModal from '@/components/profile/EditClubProfileModal';
import EditClientProfileModal from '@/components/profile/EditClientProfileModal';
import ProfileSettingsModal from "@/components/settings/ProfileSettingsModal";
import LogoutConfirmModal from "@/components/settings/LogoutConfirmModal";
import { useAuth } from "@/context/AuthContext";
import { SwitchProfileButton } from '@/components/profile/SwitchProfileButton'; // или нужный путь
import { useMobileCampModal } from "@/context/MobileCampModalContext";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useMobileClubModal } from '@/context/MobileClubModalContext';
import EditClubProfileMobilePage from '@/components/profile/EditClubProfileMobilePage'; // 🆕
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import EditClientProfileMobilePage from '@/components/profile/EditClientProfileMobilePage';
import { ChevronLeft } from 'lucide-react';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';
import { useLayerStack } from '@/context/LayerStackContext';
import { useEffectivePathname } from '@/lib/useEffectivePathname';
import { useActivityOverlay } from '@/hooks/useActivityOverlay';
import { useSupportOverlay } from '@/hooks/useSupportOverlay';
import { useAboutOverlay } from '@/hooks/useAboutOverlay';
import { useResponsibilityOverlay } from '@/hooks/useResponsibilityOverlay';
import { useContactsOverlay } from '@/hooks/useContactsOverlay';
import { useGuestMenuModal } from '@/hooks/useGuestMenuModal';
import { getBrowserApiBase } from '@/lib/apiBase';

export default function Header({
                                   onAuthChange,
                               }: {
    onAuthChange?: (auth: boolean, avatar?: string) => void;
}) {
    const API = getBrowserApiBase();
    const router = useRouter();
    const routerPathname = usePathname();
    const searchParams = useSearchParams();
    const { authenticated, profile } = useAuth();

    const isMobile = useIsMobile();
    const overlayEnv = useOverlayEnvironment();
    const { primaryHref, screens, popScreen } = useLayerStack();
    const openActivityOverlay = useActivityOverlay();
    const openSupportOverlay = useSupportOverlay();
    const openAboutOverlay = useAboutOverlay();
    const openResponsibilityOverlay = useResponsibilityOverlay();
    const openContactsOverlay = useContactsOverlay();

    const [menuOpen, setMenuOpen] = useState(false);
    const guestMenuModal = useGuestMenuModal();
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [settingsModalOpen, setSettingsModalOpen] = useState(false);
    const [logoutOpen, setLogoutOpen] = useState(false);
    const [activityUnread, setActivityUnread] = useState(false);

    const menuRef = useRef<HTMLDivElement>(null);

    const headerRef = useRef<HTMLElement | null>(null);

    // Единый эффективный pathname (согласованный с Layout / BottomNav).
    // В оверлеях он совпадает с виртуальным routerPathname, вне оверлеев
    // — с базовым маршрутом под стеком или с реальным роутом.
    const pathname = useEffectivePathname();

    const match = pathname.match(/^\/([^\/]+)\/?$/);
    const currentUsername = match ? match[1] : null;
    const showProfileNameInHeader = currentUsername && !['profile', 'auth', 'search', 'feed'].includes(currentUsername);

    const { requestExit: requestExitCamp, open: campModalOpen } = useMobileCampModal();
    const { requestExit: requestExitClub } = useMobileClubModal();

    const isCreatingClubMobile   = pathname.includes('/auth/create-club-profile/mobile');
    const isCreatingClientMobile = pathname.includes('/auth/create-client-profile/mobile');

    const isCreatingClubDesktop = pathname.includes('/auth/create-club-profile') && !pathname.includes('/mobile');
    const isCreatingClientDesktop = pathname.includes('/auth/create-client-profile') && !pathname.includes('/mobile');

    const isAnyCreateFlow =
        isCreatingClubDesktop || isCreatingClientDesktop || isCreatingClubMobile || isCreatingClientMobile;

    const creatingSecondProfile = isAnyCreateFlow && searchParams.get('second') === '1';
    const isSearchPage = (pathname === '/search');
    const isLoginPage = pathname === '/auth/login';
    const isRegisterPage = pathname === '/auth/register';
    const showGuestMenuIcon = isSearchPage || isLoginPage || isRegisterPage;
    const isFeedPage = pathname === '/feed';
    const showShortSearchSlogan =
        isSearchPage && isMobile && (overlayEnv.isOverlay ? true : !authenticated);
    // Динамический размер слогана на мобильном (гостевом)
    const sloganRef = useRef<HTMLSpanElement | null>(null);
    const sloganWrapRef = useRef<HTMLDivElement | null>(null);
    const [mobileSloganSize, setMobileSloganSize] = useState<number>(18);


    const profileNotReady = authenticated && !profile?.username;

    useEffect(() => {
        try {
            console.info('[Header] render', {
                routerPathname,
                effectivePathname: pathname,
                isOverlay: overlayEnv.isOverlay,
                primaryHref,
                screensCount: screens.length,
            });
        } catch {
            // noop
        }
    }, [routerPathname, pathname, overlayEnv.isOverlay, primaryHref, screens.length]);

    //const rawPath = pathname || (typeof window !== 'undefined' ? window.location.pathname : '');
    //const isCampRoute = /(\/camp(s)?\/[^/]+\/\d+)(\/)?(\?.*)?$/.test(rawPath);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setMenuOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (onAuthChange) {
            onAuthChange(authenticated, profile?.profile_picture ?? '');
        }
    }, [authenticated, profile, onAuthChange]);


    const isCampDetail = useMemo(() => {
        if (!pathname) return false;
        const clean = pathname.split('?')[0];
        const parts = clean.split('/').filter(Boolean);
        if (parts.length < 3) return false;
        const second = parts[1];
        return second === 'camp' || second === 'camps';
    }, [pathname]);

    useLayoutEffect(() => {
        // Внутри оверлеев не меняем глобальную переменную --header-h,
        // иначе базовые страницы (например, поиск под стеком оверлеев)
        // получают «чужую» высоту хедера и ломается расчёт высоты контента.
        if (overlayEnv.isOverlay) return;

        const root = document.documentElement;

        // На полноэкранных страницах кэмпа (только не в оверлеях)
        // обнуляем высоту глобального хедера.
        if (isCampDetail) {
            root.style.setProperty('--header-h', '0px');
            return () => {
                root.style.removeProperty('--header-h');
            };
        }

        const el = headerRef.current;
        if (!el) return;

        const update = () => {
            const h = el.offsetHeight;
            root.style.setProperty('--header-h', `${h}px`);
        };

        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        window.addEventListener('resize', update);

        return () => {
            ro.disconnect();
            window.removeEventListener('resize', update);
        };
    }, [isCampDetail, pathname, overlayEnv.isOverlay]);

    // fetch unread indicator for activity on search page
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!authenticated || (pathname !== '/search' && pathname !== '/feed')) { setActivityUnread(false); return; }
            try {
                const r = await fetch(`${API}/api/activity/?limit=1`, { credentials: 'include', cache: 'no-store' });
                if (!r.ok) { if (!cancelled) setActivityUnread(false); return; }
                const j = await r.json().catch(() => ({}));
                const unread = typeof j?.unread_count === 'number' ? j.unread_count > 0 : false;
                if (!cancelled) setActivityUnread(unread);
            } catch { if (!cancelled) setActivityUnread(false); }
        })();
        return () => { cancelled = true; };
    }, [API, pathname, authenticated]);


    //const hasClientProfile = profile?.role === 'client';
    //const hasClubProfile = profile?.role === 'club';
    const { hasClientProfile, hasClubProfile } = useAuth();

    //const { open, setOpen } = useMobileCampModal();

    // Подгон слогана под ширину на мобильном для незалогиненных
    useEffect(() => {
        if (!isSearchPage || authenticated || !isMobile) return;
        const measure = () => {
            try {
                const el = sloganRef.current;
                const wrap = sloganWrapRef.current;
                if (!el || !wrap) return;
                // задать стартовый размер и уменьшать, пока не влезет
                let size = 22; // верхняя граница
                const min = 12; // нижняя граница
                el.style.fontSize = size + 'px';
                el.style.whiteSpace = 'nowrap';
                // если шире контейнера — уменьшаем
                while (size > min && el.scrollWidth > wrap.clientWidth) {
                    size -= 1;
                    el.style.fontSize = size + 'px';
                }
                setMobileSloganSize(size);
            } catch { /* noop */ }
        };
        measure();
        const onResize = () => measure();
        window.addEventListener('resize', onResize);
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
        if (ro && sloganWrapRef.current) ro.observe(sloganWrapRef.current);
        return () => { window.removeEventListener('resize', onResize); if (ro) ro.disconnect(); };
    }, [isSearchPage, authenticated, isMobile]);

    if (isCampDetail) {
        return null; // хэдер скрываем
    }

    return (
        <>
            <header
                ref={headerRef}
                className="app-global-header w-full border-b bg-background fixed top-0 z-[101] pointer-events-auto md:shadow-md md:border-gray-300"
                    onMouseDown={() => console.log('header mouse down')}
                    onClick={() => console.log('header clicked')}>
                                        <div className="w-full max-w-4xl mx-auto px-4 py-2.5">
                        <div className="flex items-center w-full gap-2">
	                        <div className="flex items-baseline gap-0 sm:gap-4 shrink-0">
                                {overlayEnv.isOverlay && isSearchPage && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (screens.length > 0 && popScreen) {
                                                popScreen();
                                                return;
                                            }
                                            if (typeof window !== 'undefined' && window.history.length > 1) {
                                                router.back();
                                            } else {
                                                router.push('/search');
                                            }
                                        }}
                                        className="mr-1 inline-flex items-center justify-center w-8 h-8 rounded-full bg-transparent hover:bg-gray-100 active:bg-gray-200 focus:outline-none focus:ring-0"
                                        aria-label="Назад"
                                    >
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>
                                )}
                                
                            <Link
                                href="/search"
                                onClick={(e) => {
                                    const isCreatingClub = pathname.includes('/auth/create-club-profile/mobile');
                                    const isCreatingClient = pathname.includes('/auth/create-client-profile/mobile');
                                    const targetHref = "/search";

                                    if (campModalOpen && requestExitCamp) {
                                        e.preventDefault(); // остановить переход
                                        requestExitCamp(targetHref);
                                        return;
                                    }

                                    if ((isCreatingClubDesktop || isCreatingClientDesktop) && requestExitClub) {
                                        e.preventDefault();
                                        requestExitClub(targetHref);
                                        return;
                                    }

                                    if ((isCreatingClub || isCreatingClient) && requestExitClub) {
                                        e.preventDefault(); // остановить переход
                                        requestExitClub(targetHref);
                                        return;
                                    }

                                    // Внутри оверлеев (например, оверлей ленты) логотип Navumi
                                    // должен закрывать стек экранов и возвращать на базовый поиск.
                                    if (overlayEnv.isOverlay && overlayEnv.navigate) {
                                        e.preventDefault();
                                        overlayEnv.navigate(targetHref);
                                        return;
                                    }
                                    // иначе переход произойдёт нормально
                                }}
                            >
  <span className="text-2xl font-bold text-primary tracking-tight leading-none mr-2.5 sm:mr-3">
    Navumi
  </span>
                            </Link>


                            {isFeedPage ? (
                                <button
                                    type="button"
                                    onClick={() => openSupportOverlay()}
                                    className="text-sm font-semibold text-black underline underline-offset-2 leading-none bg-transparent border-0 p-0"
                                >
                                    Поддержать проект
                                </button>
                            ) : (
                                showProfileNameInHeader && (
                                    <span className="text-sm sm:text-base font-medium text-black mb-[2px]">
                                        @{currentUsername}
                                    </span>
                                )
                            )}
                        </div>


                        {/* Слоган по центру только на странице поиска */}
                        {pathname === '/search' && (
                            <div className="flex-1 min-w-0 pl-1 pr-1 text-left" ref={sloganWrapRef as React.RefObject<HTMLDivElement>}>
                                {showShortSearchSlogan ? (
                                    <span
                                        ref={sloganRef as React.RefObject<HTMLSpanElement>}
                                        className="font-semibold tracking-tight block leading-none whitespace-nowrap"
                                        style={{ fontSize: `${mobileSloganSize}px` }}
                                    >
                                        Wanna camp?
                                    </span>
                                ) : (
                                    <span className="font-semibold tracking-tight block leading-none truncate whitespace-nowrap text-[clamp(12px,4.5vw,18px)] sm:text-[clamp(16px,2.5vw,22px)]">
                                        Do you wanna camp?
                                    </span>
                                )}
                            </div>
                        )}

                        {isCampDetail ? (
                            <button
                                onClick={() => {
                                    if (typeof window !== 'undefined' && window.history.length > 1) {
                                        router.back();
                                    } else {
                                        router.push('/search');
                                    }
                                }}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-transparent transition text-sm font-medium
             hover:bg-gray-100 active:bg-gray-200 focus:outline-none focus:ring-0"
                                aria-label="Назад"
                            >
                                <ChevronLeft className="w-5 h-5" />
                                <span className="hidden sm:inline">Назад</span>
                            </button>

                        ) : profileNotReady ? (
                            <div className="flex items-center gap-2 ml-auto">
                                {showGuestMenuIcon && (
                                    <button
                                        onClick={() => guestMenuModal.open()}
                                        className="p-2 rounded-md bg-transparent transition hover:bg-gray-100 active:bg-gray-200 focus:outline-none focus:ring-0"
                                        aria-label="Меню"
                                    >
                                        <Menu className="w-6 h-6 text-black font-bold" />
                                    </button>
                                )}
                                <Link
                                    href="/auth/login"
                                    onClick={(e) => {
                                        const isCreatingClub = pathname.includes('/auth/create-club-profile/mobile');
                                        const isCreatingClient = pathname.includes('/auth/create-client-profile/mobile');

                                        if (campModalOpen && requestExitCamp) {
                                            e.preventDefault();
                                            requestExitCamp();
                                            return;
                                        }

                                        // +++ десктопные страницы создания профиля
                                        if ((isCreatingClubDesktop || isCreatingClientDesktop) && requestExitClub) {
                                            e.preventDefault();
                                            requestExitClub("/auth/login");
                                            return;
                                        }

                                        if ((isCreatingClub || isCreatingClient) && requestExitClub) {
                                            e.preventDefault();
                                            requestExitClub("/auth/login");
                                            return;
                                        }
                                    }}
                                >
                                    <Button
                                        size="sm"
                                        className="bg-primary text-white rounded-full text-sm hover:bg-primary active:bg-primary focus-visible:ring-0 focus-visible:outline-none transition-none"
                                    >
                                        Войти
                                    </Button>
                                </Link>
                            </div>


                        ) : authenticated ? (
                            creatingSecondProfile ? (
                                <button
                                    onClick={() => {
                                        const target = profile?.username ? `/${profile.username}` : '/search';
                                        if (requestExitClub) {
                                            requestExitClub(target);
                                        } else {
                                            window.location.assign(target);
                                        }
                                    }}
                                    className="px-3 py-2 rounded-md hover:bg-accent transition text-sm font-medium hover:bg-gray-100 active:bg-gray-200 focus:outline-none focus:ring-0"
                                    aria-label="Назад"
                                >
                                    Назад
                                </button>

                            ) : (
                                <div
                                    className={["relative", isFeedPage ? "ml-auto" : ""].filter(Boolean).join(" ")}
                                    ref={menuRef}
                                >
                                    {campModalOpen ? (
                                        // ❗️Без дополнительного wrapper'а с ref — только один div
                                        <div className="w-8 h-8 pointer-events-none select-none">
                                            <Image
                                                src="/gifs/e0385d1c3ed211ee9bdcda17faa977f8_upscaled.jpeg"
                                                alt="котик в походе"
                                                width={32}
                                                height={32}
                                                className="rounded-md object-cover"
                                                priority
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => {
                                                    setActivityUnread(false);
                                                    openActivityOverlay();
                                                }}
                                                className="relative p-2 rounded-md bg-transparent transition hover:bg-gray-100 active:bg-gray-200 focus:outline-none focus:ring-0"
                                                aria-label="Активность"
                                            >
                                                <Heart className="w-6 h-6 text-black" />
                                                {activityUnread && (
                                                    <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full" />
                                                )}
                                            </button>
                                            {!(isFeedPage || (isSearchPage && authenticated)) && (
                                                <button
                                                    onClick={() => setMenuOpen(!menuOpen)}
                                                    className="p-2 rounded-md bg-transparent transition hover:bg-gray-100 active:bg-gray-200 focus:outline-none focus:ring-0"
                                                    aria-label="Меню"
                                                >
                                                    <Menu className="w-6 h-6 text-black font-bold" />
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {menuOpen && profile && (
                                        <div className="absolute right-0 top-12 bg-white shadow-lg rounded-md w-56 border z-50 p-2 space-y-1">
                                            <button
                                                onClick={() => {
                                                    setEditModalOpen(true);
                                                    setMenuOpen(false);
                                                }}
                                                className="block w-full text-left px-4 py-2 hover:bg-muted rounded"
                                            >
                                                Редактировать профиль
                                            </button>

                                            <button
                                                onClick={() => {
                                                    setSettingsModalOpen(true);
                                                    setMenuOpen(false);
                                                }}
                                                className="block w-full text-left px-4 py-2 hover:bg-muted rounded"
                                            >
                                                Настройки аккаунта
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    openAboutOverlay();
                                                }}
                                                className="block w-full text-left px-4 py-2 hover:bg-muted rounded"
                                            >
                                                О проекте
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    openSupportOverlay();
                                                }}
                                                className="block w-full text-left px-4 py-2 hover:bg-muted rounded"
                                            >
                                                Поддержать проект
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    openContactsOverlay();
                                                }}
                                                className="block w-full text-left px-4 py-2 hover:bg-muted rounded"
                                            >
                                                Контакты
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    openResponsibilityOverlay();
                                                }}
                                                className="block w-full text-left px-4 py-2 hover:bg-muted rounded"
                                            >
                                                Ответственность
                                            </button>

                                            {(!hasClientProfile || !hasClubProfile) ? (
                                                <div className="py-1">
                                                    {!hasClientProfile && (
                                                        <Link href="/auth/create-client-profile?second=1">
                                                            <span className="block px-4 py-2 hover:bg-muted rounded">Добавить профиль клиента</span>
                                                        </Link>
                                                    )}
                                                    {!hasClubProfile && (
                                                        <Link href="/auth/create-club-profile?second=1">
                                                            <span className="block px-4 py-2 hover:bg-muted rounded">Добавить профиль клуба</span>
                                                        </Link>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="py-1">
                                                    <SwitchProfileButton />
                                                </div>
                                            )}

                                            <Button
                                                onClick={() => {
                                                    setLogoutOpen(true);
                                                    setMenuOpen(false);
                                                }}
                                                variant="ghost"
                                                className="w-full justify-start hover:bg-gray-100 active:bg-gray-200 focus:outline-none focus:ring-0"
                                            >
                                                Выйти
                                            </Button>

                                        </div>
                                    )}
                                </div>
                            )
                        ) : (
                            <div className="flex items-center gap-2 ml-auto">
                                {showGuestMenuIcon && (
                                    <button
                                        onClick={() => guestMenuModal.open()}
                                        className="p-2 rounded-md bg-transparent transition hover:bg-gray-100 active:bg-gray-200 focus:outline-none focus:ring-0"
                                        aria-label="Меню"
                                    >
                                        <Menu className="w-6 h-6 text-black font-bold" />
                                    </button>
                                )}
                                <Link
                                    href="/auth/login"
                                    onClick={(e) => {
                                        const isCreatingClub = pathname.includes('/auth/create-club-profile/mobile');
                                        const isCreatingClient = pathname.includes('/auth/create-client-profile/mobile');

                                        if (campModalOpen && requestExitCamp) {
                                            e.preventDefault(); // блокируем переход
                                            requestExitCamp("/auth/login");
                                            return;
                                        }

                                        if ((isCreatingClubDesktop || isCreatingClientDesktop) && requestExitClub) {
                                            e.preventDefault();
                                            requestExitClub("/auth/login");
                                            return;
                                        }

                                        if ((isCreatingClub || isCreatingClient) && requestExitClub) {
                                            e.preventDefault();
                                            requestExitClub("/auth/login");
                                            return;
                                        }
                                        // если модалок нет — переход произойдёт как обычно
                                    }}
                                >
                                    <Button
                                        size="sm"
                                        className="bg-primary text-white rounded-full text-sm hover:bg-primary active:bg-primary focus-visible:ring-0 focus-visible:outline-none transition-none"
                                    >
                                        Войти
                                    </Button>
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Модалки */}
            {editModalOpen && profile?.role === 'club' && (
                isMobile ? (
                    <EditClubProfileMobilePage
                        open={editModalOpen}
                        onClose={() => setEditModalOpen(false)}
                        initialData={{
                            username: profile.username,
                            club_name: profile.club_name ?? '',
                            telegram: profile.telegram_username ?? '',
                            instagram: profile.instagram_username ?? '',
                            phone_number: profile.phone_number ?? '',
                            website: profile.website ?? '',
                            description: profile.description ?? '',
                            profile_picture: profile.profile_picture ?? '',
                        }}
                    />
                ) : (
                    <EditClubProfileModal
                        isOpen={editModalOpen}
                        onClose={() => setEditModalOpen(false)}
                        initialData={{
                            username: profile.username,
                            club_name: profile.club_name ?? '',
                            telegram: profile.telegram_username ?? '',
                            instagram: profile.instagram_username ?? '',
                            phone_number: profile.phone_number ?? '',
                            website: profile.website ?? '',
                            description: profile.description ?? '',
                            profile_picture: profile.profile_picture ?? '',
                        }}
                    />
                )
            )}

            {editModalOpen && profile?.role === 'client' && (
                isMobile ? (
                    <EditClientProfileMobilePage
                        open={editModalOpen}
                        onClose={() => setEditModalOpen(false)}
                        initialData={{
                            username: profile.username,
                            full_name: profile.full_name ?? '',
                            telegram: profile.telegram_username ?? '',
                            instagram: profile.instagram_username ?? '',
                            website: profile.website ?? '',
                            description: profile.description ?? '',
                            profile_picture: profile.profile_picture ?? '',
                        }}
                    />
                ) : (
                    <EditClientProfileModal
                        isOpen={editModalOpen}
                        onClose={() => setEditModalOpen(false)}
                        initialData={{
                            username: profile.username,
                            full_name: profile.full_name ?? '',
                            telegram: profile.telegram_username ?? '',
                            instagram: profile.instagram_username ?? '',
                            website: profile.website ?? '',
                            description: profile.description ?? '',
                            profile_picture: profile.profile_picture ?? '',
                        }}
                    />
                )
            )}


            {settingsModalOpen && profile && (
                <ProfileSettingsModal
                    isOpen={settingsModalOpen}
                    onClose={() => setSettingsModalOpen(false)}
                    currentProfile={profile}
                />
            )}

            {profile && (
                <LogoutConfirmModal
                    open={logoutOpen}
                    onClose={() => setLogoutOpen(false)}
                    username={profile.username}
                />
            )}
        </>
    );
}
