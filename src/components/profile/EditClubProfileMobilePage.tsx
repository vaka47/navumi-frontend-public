'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import SmartImage from '@/components/SmartImage';
import { absUrl } from '@/components/camp/campNormalize';
import PhotoCropModal from '@/components/camp/PhotoCropModal';
import { downscaleToSquare, fixImageOrientation } from '@/lib/image';
import { uploadFilesToGcs } from '@/lib/directUpload';
import { useBottomNavBar } from '@/context/BottomNavBarContext';
import { getBrowserApiBase } from '@/lib/apiBase';

type UsernameStatus = 'available' | 'taken' | 'invalid' | null;

export type ProfileUpdatePayload = {
    username: string;
    role: 'club' | 'client';
    club_name?: string | null;
    full_name?: string | null;
    telegram?: string | null;
    instagram?: string | null;
    phone_number?: string | null;
    website?: string | null;
    description?: string | null;
    profile_picture?: string | null;
};

interface ClubProfileData {
    username: string;
    club_name: string;
    telegram?: string;
    instagram?: string;
    phone_number?: string;
    website?: string;
    description?: string;
    profile_picture?: string; // URL
}

const API_BASE = getBrowserApiBase();

function getCookie(name: string): string | null {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
}

export default function EditClubProfileMobilePage({
                                                      open,
                                                      onClose,
                                                      initialData,
                                                      initialCanChangeUsername,
                                                      initialNextChangeAt,
                                                      onSaved,
                                                  }: {
    open: boolean;
    onClose: () => void;
    initialData: ClubProfileData;
    initialCanChangeUsername?: boolean | null;
    initialNextChangeAt?: string | null;
    onSaved?: (p: ProfileUpdatePayload) => void;
}) {
    // --- csrf: можно получать всегда, не критично ---
    const [csrfToken, setCsrfToken] = useState<string | null>(null);
    useEffect(() => {
        setCsrfToken(getCookie('csrftoken'));
    }, []);

    // --- нижняя навигация + запрет скролла: только когда open === true ---
    const { setHide } = useBottomNavBar();
    useEffect(() => {
        if (!open) return;
        setHide(true);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            setHide(false);
            document.body.style.overflow = prev;
        };
    }, [open, setHide]);

    // --- ошибки ---
    const [error, setError] = useState('');
    const formScrollRef = useRef<HTMLFormElement | null>(null);
    const errorBoxRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!error) return;
        const t = setTimeout(() => setError(''), 7000);
        return () => clearTimeout(t);
    }, [error]);

    useEffect(() => {
        if (!open || !error) return;
        requestAnimationFrame(() => {
            const scroller = formScrollRef.current;
            if (scroller) {
                // iOS-safe: сначала жёстко, затем — плавно (если поддерживается)
                scroller.scrollTop = 0;
                try {
                    scroller.scrollTo({ top: 0, behavior: 'smooth' });
                } catch {}
            } else {
                // запасной вариант
                try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
            }
            // точечно убедимся, что сам алерт попал в видимую область контейнера
            try { errorBoxRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch {}
        });
    }, [open, error]);

    // --- поля формы ---
    const [username, setUsername] = useState(initialData.username);
    const [clubName, setClubName] = useState(initialData.club_name);
    const [telegram, setTelegram] = useState(initialData.telegram || '');
    const [instagram, setInstagram] = useState(initialData.instagram || '');
    const [phone, setPhone] = useState(initialData.phone_number || '');
    const [website, setWebsite] = useState(initialData.website || '');
    const [description, setDescription] = useState(initialData.description || '');

    // --- username: окно и проверка ---
    const [usernameTouched, setUsernameTouched] = useState(false);
    const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>(null);
    const [canChangeUsername, setCanChangeUsername] =
        useState<boolean | null>(initialCanChangeUsername ?? null);
    const [nextChangeAt, setNextChangeAt] =
        useState<string | null>(initialNextChangeAt ?? null);

    // Сбрасываем форму при открытии, чтобы каждый раз стартовать со свежих пропов
    useEffect(() => {
        if (!open) return;
        setUsername(initialData.username);
        setClubName(initialData.club_name);
        setTelegram(initialData.telegram || '');
        setInstagram(initialData.instagram || '');
        setPhone(initialData.phone_number || '');
        setWebsite(initialData.website || '');
        setDescription(initialData.description || '');
        setUsernameTouched(false);
        setUsernameStatus(null);
        setCanChangeUsername(
            initialCanChangeUsername === undefined ? null : initialCanChangeUsername
        );
        setNextChangeAt(initialNextChangeAt ?? null);
    }, [open, initialData, initialCanChangeUsername, initialNextChangeAt]);

    useEffect(() => {
        if (!open) return;
        if (!usernameTouched) return;
        if (canChangeUsername !== true) {
            setUsernameStatus(null);
            return;
        }
        if (username === initialData.username || username === '') {
            setUsernameStatus(null);
            return;
        }
        const isLatin = /^[a-zA-Z0-9_]+$/.test(username);
        if (!isLatin) {
            setUsernameStatus('invalid');
            return;
        }
        const ctrl = new AbortController();
        const t = setTimeout(() => {
            fetch(
                `${API_BASE}/api/check-username/?username=${encodeURIComponent(
                    username.toLowerCase()
                )}`,
                { credentials: 'include', signal: ctrl.signal }
            )
                .then((r) => r.json())
                .then((data) => {
                    if (!data.valid) setUsernameStatus('invalid');
                    else setUsernameStatus(data.available ? 'available' : 'taken');
                })
                .catch(() => {});
        }, 450);
        return () => {
            clearTimeout(t);
            ctrl.abort();
        };
    }, [open, username, usernameTouched, initialData.username, canChangeUsername]);

    // --- аватар: как на десктопе ---
    const [activeCropFile, setActiveCropFile] = useState<File | null>(null);
    const [croppedAvatar, setCroppedAvatar] = useState<File | null>(null);
    const [cropMeta, setCropMeta] =
        useState<{ scale: number; position: { x: number; y: number } } | null>(
            null
        );
    const [originalAvatar, setOriginalAvatar] = useState<File | null>(null);

    const isSigned = (u?: string | null) =>
        !!u && /X-Goog-Algorithm=|X-Amz-Signature=|X-Amz-Credential=/.test(u);
    const stripBust = (u?: string | null) => {
        if (!u) return null;
        if (isSigned(u)) return u;
        try {
            const url = new URL(u);
            url.searchParams.delete('t');
            return url.toString();
        } catch {
            return u.split('?')[0];
        }
    };

    const [serverAvatarUrl, setServerAvatarUrl] = useState<string | null>(
        stripBust(initialData.profile_picture || null)
    );
    const [photoJustUpdated, setPhotoJustUpdated] = useState(false);

    // ресет аватарного состояния при каждом открытии
    useEffect(() => {
        if (!open) return;
        setCroppedAvatar(null);
        setOriginalAvatar(null);
        setCropMeta(null);
        setServerAvatarUrl(stripBust(initialData.profile_picture || null));
        setPhotoJustUpdated(false);
    }, [open, initialData.profile_picture]);

    const croppedPreviewUrl = useMemo(() => {
        if (!croppedAvatar) return null;
        return URL.createObjectURL(croppedAvatar);
    }, [croppedAvatar]);
    useEffect(() => {
        return () => {
            if (croppedPreviewUrl) URL.revokeObjectURL(croppedPreviewUrl);
        };
    }, [croppedPreviewUrl]);

    const fetchServerAvatarAsFile = async (url: string) => {
        try {
            const resp = await fetch(url, { credentials: 'include' });
            const blob = await resp.blob();
            const fileName = url.split('/').pop() || 'avatar.jpg';
            return new File([blob], fileName, { type: blob.type || 'image/jpeg' });
        } catch {
            return null;
        }
    };

    const currentAvatarUrl = croppedPreviewUrl || serverAvatarUrl || null;
    const resolvedScale =
        originalAvatar && activeCropFile === originalAvatar
            ? cropMeta?.scale
            : undefined;
    const resolvedPosition =
        originalAvatar && activeCropFile === originalAvatar
            ? cropMeta?.position
            : undefined;

    const handleDeletePhoto = () => {
        setCroppedAvatar(null);
        setOriginalAvatar(null);
        setCropMeta(null);
        setServerAvatarUrl(null);
        setPhotoJustUpdated(false);
    };

    // быстрый системный диалог — создаём input только когда open === true

    const fileDialogBusyRef = useRef(false);

    function openFileDialogFast() {
        if (fileDialogBusyRef.current) return;
        fileDialogBusyRef.current = true;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.position = 'fixed';
        input.style.left = '-9999px';
        document.body.appendChild(input);

        // ВАЖНО: для iOS, если body залочен overflow:hidden, иногда
        // системный пикер не всплывает. На время выборки — разблокируем.
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = '';

        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0] || null;

            // cleanup
            try { input.remove(); } catch {}
            document.body.style.overflow = prevOverflow;
            fileDialogBusyRef.current = false;

            if (!file) return;
            const name = (file.name || '').toLowerCase();
            const mime = (file.type || '').toLowerCase();
            if (mime.includes('heic') || mime.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif')) {
                alert('Формат HEIC пока не поддерживается. Пожалуйста, сохраните фото в JPG/PNG/WebP и попробуйте снова.');
                return;
            }
            void (async () => {
                const fixed = await fixImageOrientation(file);
                setOriginalAvatar(fixed);
                setActiveCropFile(fixed); // откроет PhotoCropModal
            })();
        };

        // защита от случая «закрыли диалог без выбора»
        setTimeout(() => {
            try { input.remove(); } catch {}
            document.body.style.overflow = prevOverflow;
            fileDialogBusyRef.current = false;
        }, 4000);

        // Вызов клика — в рамках жеста (onPointerDown/onClick)
        input.click();
    }

    const handleAvatarClick = async () => {
        if (croppedAvatar && originalAvatar) {
            setActiveCropFile(originalAvatar);
            return;
        }

        if (!isFinePointerRef.current) {
            openFileDialogFast();
            return;
        }

        if (!serverAvatarUrl) {
            openFileDialogFast();
            return;
        }
        let resolved = false;
        const fallbackTimer = setTimeout(() => {
            if (resolved) return;
            resolved = true;
            openFileDialogFast();
        }, 300);
        try {
            const f = await fetchServerAvatarAsFile(serverAvatarUrl);
            if (!resolved && f) {
                resolved = true;
                clearTimeout(fallbackTimer);
                setOriginalAvatar(f);
                setActiveCropFile(f);
                return;
            }
        } catch {}
        if (!resolved) {
            resolved = true;
            clearTimeout(fallbackTimer);
            openFileDialogFast();
        }
    };

    // подтверждение удаления
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

    // submit
    const [isSaving, setIsSaving] = useState(false);
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');

        setIsSaving(true);
        await new Promise<void>((r) => requestAnimationFrame(() => r()));

        const usernameChanged = username.trim() !== initialData.username.trim();
        if (usernameChanged && !canChangeUsername) {
            setError(
                nextChangeAt
                    ? `Имя пользователя можно менять не чаще раза в месяц. Следующая попытка: ${new Date(
                        nextChangeAt
                    ).toLocaleDateString()}`
                    : 'Имя пользователя сейчас менять нельзя.'
            );
            setIsSaving(false);
            return;
        }

        const telegramRegex = /^[a-zA-Z0-9_]+$/;
        const instagramRegex = /^[a-zA-Z0-9_.]+$/;
        const phoneRegex = /^\+?[0-9 ()-]+$/;

        if (telegram && !telegramRegex.test(telegram)) {
            setError('Telegram: только латиница, цифры и подчёркивание.');
            setIsSaving(false);
            return;
        }
        if (instagram && !instagramRegex.test(instagram)) {
            setError('Instagram: только латиница, цифры, подчёркивание и точка.');
            setIsSaving(false);
            return;
        }
        if (phone && !phoneRegex.test(phone)) {
            setError('Телефон: только цифры, пробелы, скобки, тире и "+".');
            setIsSaving(false);
            return;
        }

        const fd = new FormData();
        fd.set('username', username.trim().toLowerCase());
        fd.set('club_name', clubName);
        fd.set('telegram_username', telegram);
        fd.set('instagram_username', instagram);
        fd.set('phone_number', phone);
        fd.set('website', website);
        fd.set('description', description);

        if (croppedAvatar) {
            const tiny = await downscaleToSquare(croppedAvatar, 512);
            let preuploadedAvatar: string[] = [];
            try {
                preuploadedAvatar = await uploadFilesToGcs([tiny], csrfToken || null, 'profile');
            } catch {
                fd.set('profile_picture', tiny);
            }
            if (preuploadedAvatar.length) {
                fd.delete('profile_picture');
                fd.set('preuploaded_avatar', JSON.stringify(preuploadedAvatar));
            }
        } else if (!currentAvatarUrl) {
            fd.set('remove_profile_picture', '1');
        }

        try {
            const res = await fetch(
                `${API_BASE}/api/profile/${encodeURIComponent(
                    initialData.username
                )}/edit/`,
                {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'X-CSRFToken': csrfToken || '' },
                    body: fd,
                }
            );
            const data = await res.json();
            if (res.ok) {
                const redirect = data?.redirect as string | undefined;
                if (typeof redirect === 'string' && redirect !== window.location.pathname) {
                    window.location.assign(redirect);
                } else if (onSaved) {
                    onSaved({
                        ...data.profile,
                        profile_picture: data.profile.profile_picture || null,
                    });
                } else {
                    // если onSaved не передан — на всякий случай обновим
                    setTimeout(() => window.location.reload(), 100);
                }
            } else {
                const msg =
                    typeof data?.error === 'string'
                        ? data.error
                        : data?.error
                            ? Object.values(data.error as Record<string, string[]>).flat().join(' ')
                            : 'Ошибка при сохранении профиля';
                setError(msg);
            }
        } catch {
            setError('Ошибка сети');
        } finally {
            setIsSaving(false);
        }
    }

    // дозапрос can_change_username — только в открытом состоянии
    useEffect(() => {
        if (!open) return;
        if (initialCanChangeUsername !== undefined && initialCanChangeUsername !== null) return;
        if (canChangeUsername !== null) return;
        (async () => {
            try {
                const res = await fetch(
                    `${API_BASE}/api/profile/${encodeURIComponent(
                        initialData.username
                    )}/edit/`,
                    { credentials: 'include' }
                );
                if (!res.ok) return;
                const data = await res.json();
                setCanChangeUsername(Boolean(data.can_change_username ?? true));
                setNextChangeAt(data.next_change_at ?? null);
            } catch {}
        })();
    }, [open, initialData.username, initialCanChangeUsername, canChangeUsername]);

    const safeSrc = currentAvatarUrl ? stripBust(currentAvatarUrl) : null;

    // ВАЖНО: возвращаем null ТОЛЬКО ПОСЛЕ вызова всех хуков
    //if (!open) return null;


    const isFinePointerRef = useRef(false);
    useEffect(() => {
        // true на десктопе с мышью; false на телефонах/тачпадах
        try {
            isFinePointerRef.current =
                typeof window !== 'undefined' &&
                !!window.matchMedia &&
                window.matchMedia('(pointer: fine)').matches;
        } catch {
            isFinePointerRef.current = false;
        }
    }, []);


    return (
        <div className="fixed inset-0 z-[10000] bg-white flex flex-col">
            {/* Шапка */}
            <div className="h-[56px] flex items-center justify-between px-4 border-b border-gray-200">
                <div className="text-base font-medium">Редактировать профиль</div>
                <button
                    onClick={onClose}
                    aria-label="Закрыть"
                    className="p-1 -mr-1 text-2xl leading-none"
                >
                    ✕
                </button>
            </div>

            {/* Прокручиваемая область */}
            <form
                ref={formScrollRef}
                onSubmit={handleSubmit}
                className="flex-1 p-4 space-y-4 overflow-y-auto"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)' }}
            >
                {error && (
                    <div
                        ref={errorBoxRef}
                        className="px-4 py-2 bg-red-100 border border-red-300 text-red-800 rounded-md text-sm shadow-sm"
                    >
                        {error}
                    </div>
                )}

                {/* Аватар (без изменений) */}
                <div className="text-center mt-1">
                    <div className="inline-block relative w-40 h-40">
                        <div
                            role="button"
                            tabIndex={0}
                            // ⛳️ ДЛЯ МОБИЛЫ — только onClick:
                            onClick={() => {
                                if (!croppedAvatar && !originalAvatar && !serverAvatarUrl) {
                                    // пустой аватар → сразу системный пикер
                                    openFileDialogFast();
                                } else {
                                    // есть серверное фото или уже кропили → логика редактирования
                                    handleAvatarClick();
                                }
                            }}
                            // 🖱️ ДЛЯ ДЕСКТОПА — можно ускорить pointerdown, но ТОЛЬКО если pointer:fine
                            onPointerDown={(e) => {
                                if (!isFinePointerRef.current) return; // на мобильном не трогаем
                                if (!croppedAvatar && !originalAvatar && !serverAvatarUrl) {
                                    // на десктопе хотим мгновенный отклик
                                    e.preventDefault(); // чтобы потом onClick не дёрнулся повторно
                                    openFileDialogFast();
                                }
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    if (!croppedAvatar && !originalAvatar && !serverAvatarUrl) {
                                        openFileDialogFast();
                                    } else {
                                        handleAvatarClick();
                                    }
                                }
                            }}
                            className="w-40 h-40 rounded-full border border-gray-300 bg-gray-100 overflow-hidden [clip-path:circle(50%_at_50%_50%)] cursor-pointer"
                        >
                            {safeSrc ? (
                                <SmartImage
                                    src={absUrl(safeSrc) || safeSrc}
                                    alt="Аватар"
                                    fill
                                    sizes="160px"
                                    className="w-full h-full object-cover"
                                    priority
                                    fetchPriority="high"
                                    style={{ pointerEvents: 'none' }}
                                />
                            ) : (
                                <span className="flex flex-col items-center justify-center h-full text-gray-500 text-sm leading-tight select-none">
                <span className="text-4xl font-light">+</span>
                <span className="text-sm mt-1">Добавь фото</span>
              </span>
                            )}
                        </div>

                        {currentAvatarUrl && (
                            <button
                                type="button"
                                aria-label="Удалить фото"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDeleteOpen(true);
                                }}
                                className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-black/70 text-white grid place-items-center ring-1 ring-white shadow-md z-50 focus:outline-none focus:ring-2"
                            >
                                <span className="text-[10px] leading-none">✕</span>
                            </button>
                        )}
                    </div>

                    {photoJustUpdated && currentAvatarUrl && (
                        <p className="mt-3 text-gray-500 font-medium">Вау! Вот это фото!</p>
                    )}
                </div>

                {/* Поля */}
                {/* Группа: юзернейм + статусы */}
                <div className="space-y-0">
                    {/* Строка ввода */}
                    <div
                        className={`border-b transition-colors ${
                            username !== initialData.username
                                ? 'border-black'
                                : 'border-gray-150 focus-within:border-black'
                        }`}
                    >
                        <div className="flex items-center gap-0 min-w-0">
      <span className="w-36 shrink-0 text-gray-400 text-sm px-1">
        Имя профиля
      </span>
                            <input
                                name="username"
                                value={username}
                                onChange={(e) => {
                                    setUsername(e.target.value);
                                    setUsernameTouched(true);
                                }}
                                className="w-0 flex-1 bg-transparent border-0 px-1 py-2 focus:outline-none disabled:text-gray-400"
                                disabled={canChangeUsername !== true}
                            />
                        </div>
                    </div>

                    {/* Статусы – теперь прижаты к строке */}
                    {canChangeUsername === true &&
                        username !== initialData.username &&
                        usernameTouched && (
                            <div className="-mt-2 space-y-1 px-1">
                                {usernameStatus === 'available' && (
                                    <p className="m-0 text-sm text-green-600">Имя свободно</p>
                                )}
                                {usernameStatus === 'taken' && (
                                    <p className="m-0 text-sm text-red-600">Имя занято ❌</p>
                                )}
                                {usernameStatus === 'invalid' && (
                                    <p className="m-0 text-sm text-red-600">
                                        Допустимы только латинские буквы, цифры и подчёркивание.
                                    </p>
                                )}
                            </div>
                        )}

                    {canChangeUsername === false && nextChangeAt && (
                        <p className="-mt-2 px-1 m-0 text-sm text-gray-400">
                            Можно менять раз в месяц. Следующий раз:{' '}
                            {new Date(nextChangeAt).toLocaleDateString()}.
                        </p>
                    )}

                    {canChangeUsername === null && (
                        <p className="-mt-2 px-1 m-0 text-sm text-gray-400">
                            Проверяем возможность смены имени…
                        </p>
                    )}
                </div>




                {/* Название клуба */}
                <div className="border-b border-gray-150">
                    <div className="flex items-center gap-0 min-w-0">
    <span className="w-36 shrink-0 text-gray-400 text-sm px-1">
      Название клуба
    </span>
                        <input
                            name="club_name"
                            value={clubName}
                            onChange={(e) => setClubName(e.target.value)}
                            required
                            aria-label="Название клуба"
                            className="w-0 flex-1 bg-transparent border-0 px-1 py-2 focus:outline-none"
                        />
                    </div>
                </div>

                {/* Telegram */}
                <div className="border-b border-gray-150">
                    <div className="flex items-center gap-0 min-w-0">
                        <span className="w-36 shrink-0 text-gray-400 text-sm px-1">Telegram</span>
                        <input
                            name="telegram_username"
                            value={telegram}
                            onChange={(e) => setTelegram(e.target.value)}
                            aria-label="Telegram"
                            className="w-0 flex-1 bg-transparent border-0 px-1 py-2 focus:outline-none"
                        />
                    </div>
                </div>

                {/* Instagram */}
                <div className="border-b border-gray-150">
                    <div className="flex items-center gap-0 min-w-0">
                        <span className="w-36 shrink-0 text-gray-400 text-sm px-1">Instagram</span>
                        <input
                            name="instagram_username"
                            value={instagram}
                            onChange={(e) => setInstagram(e.target.value)}
                            aria-label="Instagram"
                            className="w-0 flex-1 bg-transparent border-0 px-1 py-2 focus:outline-none"
                        />
                    </div>
                </div>

                {/* Телефон */}
                <div className="border-b border-gray-150">
                    <div className="flex items-center gap-0 min-w-0">
                        <span className="w-36 shrink-0 text-gray-400 text-sm px-1">Телефон</span>
                        <input
                            name="phone_number"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            aria-label="Телефон"
                            className="w-0 flex-1 bg-transparent border-0 px-1 py-2 focus:outline-none"
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            pattern="\+?[0-9 ()-]+"
                        />
                    </div>
                </div>

                {/* Сайт */}
                <div className="border-b border-gray-150">
                    <div className="flex items-center gap-0 min-w-0">
                        <span className="w-36 shrink-0 text-gray-400 text-sm px-1">Сайт</span>
                        <input
                            name="website"
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                            aria-label="Сайт"
                            className="w-0 flex-1 bg-transparent border-0 px-1 py-2 focus:outline-none"
                        />
                    </div>
                </div>

                <div className="border-b border-gray-150 pb-2">
        <textarea
            name="description"
            placeholder="Описание"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-white border border-gray-150 focus:border-black focus:outline-none px-2 py-2 rounded-md resize-none text-sm"
        />
                </div>

                {/* Кнопка сохранения теперь здесь, под описанием */}
                <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full bg-black text-white py-3 rounded-full font-semibold text-sm disabled:opacity-60"
                >
                    {isSaving ? 'Сохраняем…' : 'Сохранить изменения'}
                </button>
            </form>

            {/* Кроппер и подтверждение удаления — без изменений */}
            {activeCropFile && (
                <PhotoCropModal
                    imageSrc={URL.createObjectURL(activeCropFile)}
                    aspect={1}
                    circularCrop
                    className="w-full max-w-[360px] mx-auto rounded-2xl p-6 max-h-[90vh] overflow-hidden z-[11000]"
                    initialScale={resolvedScale}
                    initialPosition={resolvedPosition}
                    onClose={() => setActiveCropFile(null)}
                    onComplete={(croppedFile, meta) => {
                        setCroppedAvatar(croppedFile);
                        setCropMeta(meta);
                        setOriginalAvatar(activeCropFile);
                        setActiveCropFile(null);
                        setPhotoJustUpdated(true);
                    }}
                />
            )}

            {confirmDeleteOpen && (
                <div className="fixed inset-0 z-[11000]">
                    <div className="fixed inset-0 bg-black/40" />
                    <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-w-sm w-full bg-white rounded-xl p-6 shadow-lg">
                        <h3 className="text-base font-semibold mb-2">Удалить фото профиля?</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            Вернуть его можно будет только повторно загрузив файл.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                className="text-sm text-gray-600 hover:text-black"
                                onClick={() => setConfirmDeleteOpen(false)}
                            >
                                Отмена
                            </button>
                            <button
                                type="button"
                                className="text-sm font-semibold text-red-600 hover:text-red-700"
                                onClick={() => {
                                    handleDeletePhoto();
                                    setConfirmDeleteOpen(false);
                                }}
                            >
                                Да, удалить
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

}
