"use client";

import { usePathname, useRouter } from "next/navigation";
import SmartImage from "@/components/SmartImage";
import { absUrl } from "@/components/camp/campNormalize";
import { Star, SquarePlus, Search, Target } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useBottomNavBar } from "@/context/BottomNavBarContext";
import { useMobileCampModal } from "@/context/MobileCampModalContext";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import CreatePostModal from "@/components/post/CreatePostModal";
import CreateCampModal from "@/components/camp/CreateCampModal";
import { CalendarDays, Camera } from "lucide-react";
import { useOverlayEnvironment } from "@/context/OverlayEnvironmentContext";
import { useLayerStack } from "@/context/LayerStackContext";
import { useEffectivePathname } from "@/lib/useEffectivePathname";
import { useProfileOverlay } from "@/hooks/useProfileOverlay";
import { useFeedOverlay } from "@/hooks/useFeedOverlay";
import { useRecommendationsOverlay } from "@/hooks/useRecommendationsOverlay";
import { useCreatePostProfileOverlay } from "@/hooks/useCreatePostProfileOverlay";
import { useCreateCampOverlay } from "@/hooks/useCreateCampOverlay";
import { getBrowserApiBase } from "@/lib/apiBase";



type NavItem = {
    label: string;
    href?: string;
    onClick?: () => void;
    renderIcon?: (active: boolean) => React.ReactNode;
};

export default function BottomNavBar() {
    const { authenticated, profile, hasClientProfile, hasClubProfile } = useAuth();
    const { hide, setHide } = useBottomNavBar();
    const router = useRouter();
    const routerPathname = usePathname();
    const basePath = routerPathname || "";
    const { open } = useMobileCampModal();
    const { isOverlay, navigate: overlayNavigate } = useOverlayEnvironment();
    const { primaryHref, screens } = useLayerStack();
    const openFeedOverlay = useFeedOverlay();
    const openProfileOverlay = useProfileOverlay();
    const openRecommendationsOverlay = useRecommendationsOverlay();
    const { open: openCreatePostProfileOverlay } = useCreatePostProfileOverlay();
    const { open: openCreateCampOverlay } = useCreateCampOverlay();

    const [createChoiceOpen, setCreateChoiceOpen] = useState(false);
    const [postOpen, setPostOpen] = useState(false);
    const [campOpen, setCampOpen] = useState(false);

    const currentProfileRole = profile?.role as "club" | "client" | undefined;

    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

    // Единый эффективный pathname, согласованный с Layout / Header.
    const pathname = useEffectivePathname();

    useEffect(() => {
        try {
            console.info('[BottomNav] render', {
                routerPathname,
                effectivePathname: pathname,
                isOverlay,
                primaryHref,
                screensCount: screens.length,
            });
        } catch {
            // noop
        }
    }, [routerPathname, pathname, isOverlay, primaryHref, screens.length]);

    // Ref to measure the actual rendered navbar height and expose it via --bottom-gap
    const navRef = useRef<HTMLElement | null>(null);

    const onPlusClick = () => {
        if (currentProfileRole === "club") {
            // клуб → сначала спросим, что именно
            setCreateChoiceOpen(true);
        } else {
            // клиент → сразу пост
            if (isMobile) {
                openCreatePostProfileOverlay({ mode: 'create' });
            } else {
                setPostOpen(true);
            }
        }
    };

    // ❗️Хуки всегда вызываются, без ранних return

    const isCampRoute = !!pathname && /\/camps?(\/|$)/.test(pathname);
    const isBaseSearch = basePath === "/search";

    // кэмпы в оверлеях больше не прячут глобальный навбар;
    // прячем его только на реальных кэмп-роутах
    const mustHideOnCamp = isCampRoute && !isBaseSearch;

    // На кэмпе не даём эффекту "разхайдить" бар.
    // ИЗ ВАЖНОГО: в оверлеях НЕ трогаем глобальный флаг hide,
    // чтобы оверлейные бары не ломали корневой навбар.
    useEffect(() => {
        if (!isMobile) return;
        if (isOverlay) return;
        const next = mustHideOnCamp ? true : open;
        try {
            // eslint-disable-next-line no-console
            console.info('[BottomNav] effect:setHide', {
                pathname,
                isMobile,
                mustHideOnCamp,
                open,
                next,
                isOverlay,
            });
        } catch { /* noop */ }
        setHide(next);
    }, [open, isMobile, mustHideOnCamp, setHide, isOverlay, pathname]);

    // Expose actual bottom navbar height via --bottom-gap so pages can pad correctly.
    // В оверлеях не трогаем глобальную переменную, чтобы не ломать базовый layout.
    // Hook must be before any early return to satisfy rules-of-hooks
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (isOverlay) return;
        const root = document.documentElement;
        const prevInline = root.style.getPropertyValue('--bottom-gap');
        const update = () => {
            const h = navRef.current?.getBoundingClientRect().height || 0;
            root.style.setProperty('--bottom-gap', `${Math.ceil(h)}px`);
            try {
                // eslint-disable-next-line no-console
                console.info('[BottomNav] update bottom-gap', {
                    pathname,
                    height: h,
                    inline: prevInline || null,
                });
            } catch { /* noop */ }
        };
        update();
        window.addEventListener('resize', update);
        window.addEventListener('orientationchange', update);
        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('orientationchange', update);
            if (prevInline) root.style.setProperty('--bottom-gap', prevInline);
            else root.style.removeProperty('--bottom-gap');
        };
    }, [pathname, authenticated, profile?.username, hide, isOverlay, screens.length]);

    // В оверлеях (профиль, поиск, пост и т.п.)
    // всегда показываем навбар, если сам маршрут не кэмповый.
    const forceVisible = isOverlay && !isCampRoute;

    if (mustHideOnCamp && !forceVisible) return null;


    const profileNotReady = authenticated && !profile?.username;

    const onAnyCreatePage =
        !!pathname &&
        (pathname.includes("/auth/create-club-profile") ||
            pathname.includes("/auth/create-client-profile"));

    const isSearchPage = (pathname === '/search' || isBaseSearch) && !isOverlay;


    const isCreateClubDesktop =
        !!pathname && pathname.includes("/auth/create-club-profile") && !pathname.includes("/mobile");
    const isCreateClientDesktop =
        !!pathname && pathname.includes("/auth/create-client-profile") && !pathname.includes("/mobile");


    const hasSecondFlag =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("second") === "1";

    const creatingClubAsSecond = isCreateClubDesktop && hasClientProfile && !hasClubProfile;
    const creatingClientAsSecond = isCreateClientDesktop && hasClubProfile && !hasClientProfile;


    // Роуты, где бар нужно скрыть (создание профиля и т.п.)
    const shouldHideByRoute =
        // мобильные create — всегда
        pathname?.includes("/auth/create-club-profile/mobile") ||
        pathname?.includes("/auth/create-client-profile/mobile") ||
        pathname?.includes("/create-post/profile/mobile") ||
        // десктоп: создаём вторым (по факту профилей)
        creatingClubAsSecond ||
        creatingClientAsSecond ||
        // десктоп: запасной вариант по ?second=1
        (isCreateClubDesktop && hasSecondFlag) ||
        (isCreateClientDesktop && hasSecondFlag);

    // На странице поиска игнорируем флаг hide:
    // навбар там должен быть всегда (и для гостей, и для авторизованных).
    const ignoreHideOnSearch = (pathname === '/search' || isBaseSearch) && !open;

    // Гостевой режим: одинарная кнопка "Вернуться на главную" вместо набора иконок.
    if (!authenticated || !profile || profileNotReady) {
        if (onAnyCreatePage || shouldHideByRoute || (hide && !forceVisible && !ignoreHideOnSearch)) {
            try {
                // eslint-disable-next-line no-console
                console.info('[BottomNav] guest nav hidden', {
                    pathname,
                    onAnyCreatePage,
                    shouldHideByRoute,
                    hide,
                    isSearchPage,
                    ignoreHideOnSearch,
                    forceVisible,
                    isOverlay,
                });
            } catch { /* noop */ }
            return null;
        }
        try {
            // eslint-disable-next-line no-console
            console.info('[BottomNav] guest nav button visible', {
                pathname,
                hide,
                isSearchPage,
                ignoreHideOnSearch,
                forceVisible,
                isOverlay,
            });
        } catch { /* noop */ }
        // На главной странице поиска показываем приветственное сообщение вместо кнопки
        const isOnSearchPage = (pathname === '/search' || isBaseSearch) && !isOverlay;
        
        return (
            <nav
                data-bottom-nav="true"
                ref={navRef}
                className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none"
            >
                <div className="w-full md:max-w-4xl mx-auto bg-white border-t md:border border-gray-200 shadow-sm md:rounded-t-2xl md:rounded-b-none md:mb-0 pointer-events-auto">
                    {isOnSearchPage ? (
                        <div className="w-full h-14 md:h-16 flex items-center justify-center text-sm sm:text-base font-semibold text-gray-700">
                            Welcome to Navumi
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                if (isOverlay && overlayNavigate) {
                                    overlayNavigate('/search?tab=camps');
                                } else {
                                    router.push('/search?tab=camps');
                                }
                            }}
                            className="w-full h-14 md:h-16 flex items-center justify-center text-sm sm:text-base font-semibold text-black hover:bg-gray-50 active:bg-gray-100"
                        >
                            Вернуться на главную
                        </button>
                    )}
                </div>
            </nav>
        );
    }

    if ((onAnyCreatePage || shouldHideByRoute || (hide && !ignoreHideOnSearch)) && !forceVisible) {
        try {
            // eslint-disable-next-line no-console
            console.info('[BottomNav] auth nav hidden', {
                pathname,
                onAnyCreatePage,
                shouldHideByRoute,
                hide,
                isSearchPage,
                ignoreHideOnSearch,
                forceVisible,
                isOverlay,
            });
        } catch { /* noop */ }
        return null;
    }

    // Дальше можно безопасно читать profile
    // В навбаре всегда показываем аватар активного профиля, не «просматриваемого»
    // Иконки — из той же коллекции, что на странице "О проекте" (lucide-react)
    // Цвет фиксируем чёрным через класс `text-black`.
    const iconCls = (active: boolean, size: string = 'w-6 h-6') =>
        [size, 'text-black', active ? 'fill-black' : 'fill-transparent'].join(' ');
    const iconStyle = (active: boolean) => ({ strokeWidth: active ? 2.4 : 1.6 } as React.CSSProperties);




    const profileHrefBase = `/${profile.username}`;
    const profileDefaultTab = currentProfileRole === "club" ? "camps" : "posts";
    const isOnOwnProfileRoute =
        !!pathname &&
        (pathname === profileHrefBase || pathname.startsWith(`${profileHrefBase}/`));
    const handleProfileNav = () => {
        const searchParams = {
            tab: profileDefaultTab,
            tab_source: "nav" as const,
        };

        // Если уже на своём профиле — не плодим новый оверлей поверх оверлея.
        // (позже можно сюда повесить scroll-to-top, если захочешь)
        if (isOnOwnProfileRoute) {
            return;
        }

        // Теперь ВСЕГДА открываем профиль как оверлей,
        // независимо от того, находимся мы в оверлее (feed, camp и т.п.) или на базовой странице.
        openProfileOverlay({
            username: profile.username,
            searchParams,
        });
    };




    const handleFeedNav = () => {
        // Всегда открываем ленту как оверлей в общем стеке
        openFeedOverlay();
    };

    const handleRecommendationsNav = () => {
        // Всегда открываем рекомендации как оверлей в общем стеке
        openRecommendationsOverlay();
    };


    const navItems: NavItem[] = [
        {
            label: 'Поиск',
            href: '/search',
            // Активная — только толще, без заливки
            renderIcon: (active) => (
                <Search
                    className={['w-6 h-6 text-black', 'fill-transparent'].join(' ')}
                    style={iconStyle(active)}
                />
            ),
        },
        {
            label: 'Популярное',
            href: '/recommendations',
            onClick: handleRecommendationsNav,
            renderIcon: (active) => <Star className={iconCls(active)} style={iconStyle(active)} />,
        },
        {
            label: 'Создать',
            onClick: onPlusClick,
            renderIcon: (active) => <SquarePlus className={iconCls(active, 'w-7 h-7')} style={iconStyle(active)} />,
        },
        {
            label: 'Лента',
            href: '/feed',
            onClick: handleFeedNav,
            // Активная — толще только контур, без заливки
            renderIcon: (active) => (
                <Target
                    className={['w-6 h-6 text-black', 'fill-transparent'].join(' ')}
                    style={iconStyle(active)}
                />
            ),
        },
        {
            label: 'Профиль',
            href: profileHrefBase,
            onClick: handleProfileNav,
            renderIcon: (active) => {
                const API_BASE = getBrowserApiBase();
                const rawAvatar = (profile.profile_picture) || '';
                const avatarSrc = rawAvatar && rawAvatar.startsWith('http')
                    ? rawAvatar
                    : (rawAvatar ? `${API_BASE}${rawAvatar}` : '');
                const placeholder = (process.env.NEXT_PUBLIC_BASE_PATH || '') + '/avatars/question3.jpg';
                const finalSrc = absUrl(avatarSrc || '') || avatarSrc || placeholder;
                return (
                    <SmartImage
                        src={finalSrc}
                        width={28}
                        height={28}
                        alt="avatar"
                        className={[
                            'rounded-full object-cover select-none',
                            active ? 'ring-2 ring-black' : 'border',
                        ].join(' ')}
                        draggable={false}
                        onContextMenu={(e) => e.preventDefault()}
                        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' } as React.CSSProperties}
                        sizes="28px"
                        placeholder="empty"
                    />
                );
            },
        },
    ];


    return (
        <>
            <nav
                data-bottom-nav="true"
                ref={navRef}
                className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none"
            >
                <div className="w-full md:max-w-4xl mx-auto bg-white border-t md:border border-gray-200 shadow-sm md:rounded-t-2xl md:rounded-b-none md:mb-0 md:px-6 md:py-4 pointer-events-auto">
                    <ul className="flex justify-around items-center h-14 md:h-auto">
                        {navItems.map((item, index) => {
                            const isActive = (() => {
                                if (!pathname) return false;
                                if (!item.href) return false;
                                // Профиль — активен на всех подстраницах своего username
                                if (item.label === 'Профиль') {
                                    return pathname === item.href || pathname.startsWith(`${item.href}/`);
                                }
                                // Остальные — точное совпадение или подроуты
                                return pathname === item.href || pathname.startsWith(`${item.href}/`);
                            })();
                            return (
                                <li
                                    key={index}
                                    onClick={() => {
                                        if (item.onClick) {
                                            item.onClick();
                                            return;
                                        }
                                        if (item.href) {
                                            if (isOverlay && overlayNavigate) {
                                                overlayNavigate(item.href);
                                            } else {
                                                router.push(item.href);
                                            }
                                        }
                                    }}
                                    className="flex items-center justify-center cursor-pointer"
                                    aria-label={item.label}
                                >
                                    {item.renderIcon ? item.renderIcon(isActive) : null}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </nav>

            {/* == Выбор, что создать (только для клубов) == */}
            {/* == Выбор, что создать (только для клубов) == */}
            <Dialog open={createChoiceOpen} onOpenChange={setCreateChoiceOpen}>
                <DialogContent
                    className="sm:max-w-md"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                >
                    <h3 className="text-lg font-semibold text-center mb-4">Что создать?</h3>

                    <div className="grid grid-cols-2 gap-3">
                        {/* Пост */}
                        <button
                            type="button"
                            onClick={() => {
                                setCreateChoiceOpen(false);
                                if (isMobile) {
                                    openCreatePostProfileOverlay({ mode: 'create' });
                                } else {
                                    setPostOpen(true);
                                }
                            }}
                            className="group rounded-xl border border-gray-200 p-4 text-center hover:bg-gray-50 hover:border-gray-300
                   focus:outline-none focus:ring-2 focus:ring-black/10 active:scale-[0.99] transition-all"
                        >
                            <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-gray-100
                        group-hover:bg-black group-hover:text-white transition-colors">
                                <Camera className="h-6 w-6" />
                            </div>
                            <div className="font-medium">Создать пост</div>
                            <div className="mt-0.5 text-xs text-gray-500">Фото, текст, отметки</div>
                        </button>

                        {/* Кэмп */}
                        <button
                            type="button"
                            onClick={() => {
                                setCreateChoiceOpen(false);
                                if (isMobile) {
                                    openCreateCampOverlay();
                                } else {
                                    setCampOpen(true);  // десктопный модал кэмпа
                                }
                            }}
                            className="group rounded-xl border border-gray-200 p-4 text-center hover:bg-gray-50 hover:border-gray-300
                   focus:outline-none focus:ring-2 focus:ring-black/10 active:scale-[0.99] transition-all"
                        >
                            <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-gray-100
                        group-hover:bg-black group-hover:text-white transition-colors">
                                <CalendarDays className="h-6 w-6" />
                            </div>
                            <div className="font-medium">Создать кэмп</div>
                            <div className="mt-0.5 text-xs text-gray-500">Даты, место, стоимость</div>
                        </button>
                    </div>
                </DialogContent>
            </Dialog>


            {/* == Создание поста (для всех ролей) == */}
            <CreatePostModal open={postOpen} onClose={() => setPostOpen(false)} />

            {/* == Создание кэмпа (только десктоп; на мобиле остаётся твой MobileCampModal через setOpen(true)) == */}
            {!isMobile && (
                <CreateCampModal open={campOpen} onClose={() => setCampOpen(false)} />
            )}
        </>

    );

}
