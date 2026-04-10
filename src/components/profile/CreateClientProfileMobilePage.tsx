'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { isReservedUsername } from '@/lib/reservedUsernames';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import PhotoCropModal from '@/components/camp/PhotoCropModal';
import { useBottomNavBar } from '@/context/BottomNavBarContext';
import { useMobileClubModal } from '@/context/MobileClubModalContext';
import { downscaleToSquare, fixImageOrientation } from '@/lib/image';
import { getRegistrationToken, clearRegistrationToken } from '@/lib/registrationToken';
import { uploadFilesToGcs } from '@/lib/directUpload';
import { getBrowserApiBase } from '@/lib/apiBase';

function getCookie(name: string): string | null {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
}

export default function CreateClientProfileMobilePage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { checkAuth } = useAuth();
    const API_BASE = getBrowserApiBase();

    const [step, setStep] = useState(1);
    const [formData] = useState<FormData>(new FormData());
    const [error, setError] = useState('');
    const [csrfToken, setCsrfToken] = useState<string | null>(null);

    useEffect(() => {
        setCsrfToken(getCookie('csrftoken'));
    }, []);

    // Проверяем наличие токена при монтировании компонента
    // Для второго профиля (second=1) токен не требуется
    useEffect(() => {
        // Небольшая задержка, чтобы searchParams успели установиться через AppScreenBridge
        const timeoutId = setTimeout(() => {
            const isSecond = searchParams.get('second') === '1';
            // eslint-disable-next-line no-console
            console.log('[CreateClientProfileMobilePage] mount check', {
                isSecond,
                hasToken: !!getRegistrationToken(),
                searchParamsSecond: searchParams.get('second'),
                allSearchParams: Array.from(searchParams.entries()),
            });
            
            if (isSecond) {
                // Для второго профиля токен не нужен - пользователь уже залогинен
                return;
            }
            
            const tokenFromUrl = searchParams.get('token');
            const tokenFromStorage = getRegistrationToken();
            const token = tokenFromUrl || tokenFromStorage;
            
            if (!token) {
                // Если токена нет, редиректим на главную страницу поиска
                router.replace('/search');
            }
        }, 100);
        
        return () => clearTimeout(timeoutId);
    }, [router, searchParams]);

    // ===== username: проверка доступности с дебаунсом =====
    const [username, setUsername] = useState('');
    const [usernameStatus, setUsernameStatus] = useState<"available" | "taken" | "invalid" | null>(null);

    useEffect(() => {
        if (!username) return setUsernameStatus(null);
        const ok = /^[a-zA-Z0-9_.]+$/.test(username);
        const normalized = username.toLowerCase().trim();
        const forbiddenBrand = normalized.includes('navumi');
        const isReserved = isReservedUsername(normalized);
        if (!ok || forbiddenBrand || isReserved) {
            setUsernameStatus('invalid');
            return;
        }

        const t = setTimeout(() => {
            fetch(
                `${API_BASE}/api/check-username/?username=${encodeURIComponent(
                    username.toLowerCase()
                )}`,
                { credentials: 'include' }
            )
                .then((res) => res.json())
                .then((data) => {
                    if (!data.valid) setUsernameStatus('invalid');
                    else setUsernameStatus(data.available ? 'available' : 'taken');
                })
                .catch(() => {});
        }, 400);

        return () => clearTimeout(t);
    }, [API_BASE, username]);

    // ===== клиентские поля =====
    const [fullName, setFullName] = useState('');
    const [telegram, setTelegram] = useState('');
    const [instagram, setInstagram] = useState('');
    const [website, setWebsite] = useState('');
    const [description, setDescription] = useState('');

    // синхронизируем FormData (как в клубной версии)
    formData.set('username', username);
    formData.set('full_name', fullName);
    formData.set('telegram_username', telegram);
    formData.set('instagram_username', instagram);
    formData.set('website', website);
    formData.set('description', description);

    // ===== шаг 1: валидация инпутов =====
    const handleFirstStepSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');

        const normalizedUsername = username.trim().toLowerCase();
        if (normalizedUsername.includes('navumi')) {
            return setError('Имя пользователя не может содержать «navumi».');
        }
        if (isReservedUsername(normalizedUsername)) {
            return setError('Это имя зарезервировано и не может быть использовано.');
        }
        if (fullName.trim().toLowerCase().includes('navumi')) {
            return setError('Имя не может содержать «navumi».');
        }

        if (usernameStatus !== 'available') {
            return setError('Имя пользователя некорректно или занято');
        }

        const telegramRegex = /^[a-zA-Z0-9_]+$/;
        const instagramRegex = /^[a-zA-Z0-9_.]+$/;

        if (telegram && !telegramRegex.test(telegram)) {
            return setError('Telegram: только латиница, цифры и _');
        }
        if (instagram && !instagramRegex.test(instagram)) {
            return setError('Instagram: только латиница, цифры, _ и .');
        }

        // Нормализуем сайт (как в формах на бэке)
        if (website && !/^https?:\/\//i.test(website)) {
            formData.set('website', `https://${website}`);
            setWebsite(prev => (prev ? (prev.startsWith('http') ? prev : `https://${prev}`) : prev));
        }

        const fd = new FormData(e.currentTarget);
        for (const [k, v] of fd.entries()) formData.set(k, v);

        setStep(2);
    };

    // ===== шаг 2: сабмит =====
    const handleFinalSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const isSecond = searchParams.get('second') === '1';
        const tokenFromUrl = searchParams.get('token');
        const tokenFromStorage = getRegistrationToken();
        const token = tokenFromUrl || tokenFromStorage;

        // Для второго профиля токен не требуется
        if (!isSecond && !token) {
            // Если токена нет, редиректим на главную страницу поиска
            router.replace('/search');
            return;
        }

        const maybeFile = formData.get('profile_picture');
        let preuploadedAvatar: string[] = [];
        if (maybeFile instanceof File) {
            const name = (maybeFile.name || '').toLowerCase();
            const mime = (maybeFile.type || '').toLowerCase();
            if (mime.includes('heic') || mime.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif')) {
                setError('Формат HEIC пока не поддерживается. Пожалуйста, сохраните фото в JPG/PNG/WebP и попробуйте снова.');
                return;
            }
            const tiny = await downscaleToSquare(maybeFile, 512);
            try {
                preuploadedAvatar = await uploadFilesToGcs([tiny], null, 'profile');
            } catch {
                formData.set('profile_picture', tiny);
            }
        }
        if (preuploadedAvatar.length) {
            formData.delete('profile_picture');
            formData.set('preuploaded_avatar', JSON.stringify(preuploadedAvatar));
        }

        // Добавляем токен в FormData только если он есть (для первого профиля)
        if (token) {
            formData.set('registration_token', token);
        }

        try {
            const url = isSecond
                ? `${API_BASE}/api/create-client-profile/?second=1`
                : `${API_BASE}/api/create-client-profile/`;

            const res = await fetch(url, {
                method: 'POST',
                credentials: 'include',
                headers: { 'X-CSRFToken': csrfToken || '' },
                body: formData,
            });

            const data = await res.json();
            if (res.ok) {
                // Очищаем токен после успешного создания профиля
                clearRegistrationToken();
                await checkAuth();
                router.push(data.redirect);
            } else {
                // Если токен недействителен, очищаем его и редиректим на главную
                if (res.status === 401 || res.status === 403) {
                    clearRegistrationToken();
                    router.replace('/search');
                } else {
                    setError(data.error || 'Ошибка при создании');
                }
            }
        } catch (err) {
            console.error(err);
            setError('Ошибка сети');
        }
    };

    // ===== кроп и превью =====
    const [activeCropFile, setActiveCropFile] = useState<File | null>(null);
    const [croppedAvatar, setCroppedAvatar] = useState<File | null>(null);
    const [cropMeta, setCropMeta] = useState<{ scale: number; position: { x: number; y: number } } | null>(null);
    const [originalAvatar, setOriginalAvatar] = useState<File | null>(null);

    const resolvedScale = originalAvatar && activeCropFile === originalAvatar ? cropMeta?.scale : undefined;
    const resolvedPosition = originalAvatar && activeCropFile === originalAvatar ? cropMeta?.position : undefined;

    const handleDeletePhoto = () => {
        setCroppedAvatar(null);
        setOriginalAvatar(null);
        setCropMeta(null);
        formData.delete('profile_picture');
    };

    const [croppedPreviewUrl, setCroppedPreviewUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!croppedAvatar) return;
        const url = URL.createObjectURL(croppedAvatar);
        setCroppedPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [croppedAvatar]);

    // ===== скрыть нижнюю навигацию на время =====
    const { setHide } = useBottomNavBar();
    useEffect(() => {
        setHide(true);
        return () => setHide(false);
    }, [setHide]);

    // ===== перехват выхода (как у клуба) =====
    const { setRequestExit } = useMobileClubModal();
    const [showConfirmExit, setShowConfirmExit] = useState(false);
    const [nextHref, setNextHref] = useState<string | null>(null);

    useEffect(() => {
        if (setRequestExit) {
            const exitHandler = (next?: string) => {
                setNextHref(next || null);
                setShowConfirmExit(true);
            };
            setRequestExit(() => exitHandler);
        }
    }, [setRequestExit, step]);

    // eslint-disable-next-line no-console
    console.log('[CreateClientProfileMobilePage] render', {
        step,
        error,
        hasSearchParams: !!searchParams,
        secondParam: searchParams?.get('second'),
    });

    return (
        <div className="absolute inset-0 bg-white overflow-y-auto">
            <div
                className="relative z-0 h-full overflow-y-auto px-4 pb-24"
                style={{ paddingTop: 'calc(var(--header-h, 64px) + 4px)' }}
            >
                <div className="pointer-events-auto">
                    <h1 className="text-lg font-semibold mt-3 mb-4">
                        {step === 1 ? 'Создание профиля' : 'Фото профиля'}
                    </h1>

                    {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

                    {step === 1 && (
                        <form onSubmit={handleFirstStepSubmit} className="flex flex-col gap-y-3.5 px-1 text-sm">
                            {/* Username: двухстрочный лейбл + префикс */}
                            <div className="border-b border-gray-150 focus-within:border-black transition-colors">
                                <div className="flex items-center gap-0 min-w-0">
        <span className="w-36 shrink-0 text-gray-400 text-xs leading-tight px-1">
          <span className="block">Имя профиля для</span>
          <span className="block">красивой ссылки</span>
        </span>
                                    <div className="flex-1 min-w-0 flex items-center">
                                        {/* <span className="text-gray-400 select-none" aria-hidden="true">navumi.com/</span> */}
                                        <input
                                            name="username"
                                            required
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            placeholder="username"
                                            aria-label="Имя пользователя"
                                            className="w-0 flex-1 bg-transparent border-0 px-1 py-2 focus:outline-none text-gray-900 placeholder:text-gray-400/55"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Статусы имени */}
                            {usernameStatus === 'available' && (
                                <p className="-mt-2 text-sm px-1 text-green-600">Имя свободно</p>
                            )}
                            {usernameStatus === 'taken' && (
                                <p className="-mt-2 text-sm px-1 text-red-600">Имя занято ❌</p>
                            )}
                            {usernameStatus === 'invalid' && (
                                <p className="-mt-2 text-sm px-1 text-red-600">
                                    Допустимы только латиница, цифры, подчёркивание и точка.
                                </p>
                            )}
                            {username.toLowerCase().includes('navumi') && (
                                <p className="-mt-2 text-sm px-1 text-red-600">
                                    Имя пользователя не может содержать «navumi».
                                </p>
                            )}

                            {/* Как вас зовут? (full_name) */}
                            <div className="border-b border-gray-150">
                                <div className="flex items-center gap-0 min-w-0">
                                    <span className="w-36 shrink-0 text-gray-400 text-sm px-1">Как вас зовут?</span>
                                    <input
                                        name="full_name"
                                        required
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        aria-label="Имя"
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

                            {/* Описание */}
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

                            <button
                                type="submit"
                                className="w-full bg-black text-white py-2 rounded-full hover:bg-black/80 transition"
                            >
                                Продолжить
                            </button>
                        </form>
                    )}

                    {step === 2 && (
                        <form onSubmit={handleFinalSubmit}>
                            <div className="min-h-[330px] flex flex-col justify-between">
                                <div className="text-center space-y-4">
                                    <div className="mt-4 inline-block relative w-48 h-48">
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => {
                                                if (croppedAvatar) {
                                                    if (originalAvatar) setActiveCropFile(originalAvatar);
                                                } else {
                                                    const input = document.createElement('input');
                                                    input.type = 'file';
                                                    input.accept = 'image/*';
                                                    input.onchange = (e) => {
                                                        const file = (e.target as HTMLInputElement).files?.[0];
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
                                                            setActiveCropFile(fixed);
                                                        })();
                                                    };
                                                    input.click();
                                                }
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    if (croppedAvatar) {
                                                        if (originalAvatar) setActiveCropFile(originalAvatar);
                                                    } else {
                                                        const input = document.createElement('input');
                                                        input.type = 'file';
                                                        input.accept = 'image/*';
                                                        input.onchange = (e2) => {
                                                            const file = (e2.target as HTMLInputElement).files?.[0];
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
                                                                setActiveCropFile(fixed);
                                                            })();
                                                        };
                                                        input.click();
                                                    }
                                                }
                                            }}
                                            className="w-48 h-48 rounded-full border border-gray-300 bg-gray-100 overflow-hidden [clip-path:circle(50%_at_50%_50%)] cursor-pointer"
                                        >
                                            {croppedAvatar ? (
                                                <img
                                                    src={croppedPreviewUrl ?? ''}
                                                    alt="Аватар"
                                                    className="w-full h-full object-cover"
                                                    style={{ pointerEvents: 'none' }}
                                                />
                                            ) : (
                                                <span className="flex flex-col items-center justify-center h-full text-gray-500 text-sm leading-tight select-none">
                          <span className="text-5xl font-light">+</span>
                          <span className="text-base mt-1">Добавь фото</span>
                        </span>
                                            )}
                                        </div>

                                        {croppedAvatar && (
                                            <button
                                                type="button"
                                                aria-label="Удалить фото"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeletePhoto();
                                                }}
                                                className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-black/70 text-white grid place-items-center ring-1 ring-white shadow-md z-50 focus:outline-none focus:ring-2"
                                            >
                                                <span className="text-[10px] leading-none">✕</span>
                                            </button>
                                        )}
                                    </div>

                                    {croppedAvatar && <p className="text-gray-500 font-medium">Вау! Вот это фото!</p>}
                                </div>

                                <div className="flex gap-4 mt-6">
                                    <button
                                        type="button"
                                        onClick={() => setStep(1)}
                                        className="w-1/2 border border-gray-300 py-2 rounded-full"
                                    >
                                        Назад
                                    </button>
                                    <button
                                        type="submit"
                                        className="w-1/2 bg-black text-white py-2 rounded-full"
                                    >
                                        Создать
                                    </button>
                                </div>
                            </div>
                        </form>
                    )}

                    {activeCropFile && (
                        <PhotoCropModal
                            imageSrc={URL.createObjectURL(activeCropFile)}
                            aspect={1}
                            circularCrop
                            initialScale={resolvedScale}
                            initialPosition={resolvedPosition}
                            className="w-full max-w-[360px] mx-auto rounded-2xl p-6 max-h-[90vh] overflow-hidden"
                            onClose={() => setActiveCropFile(null)}
                            onComplete={(croppedFile, meta) => {
                                setCroppedAvatar(croppedFile);
                                setCropMeta(meta);
                                setOriginalAvatar(activeCropFile);
                                formData.set('profile_picture', croppedFile);
                                setActiveCropFile(null);
                            }}
                        />
                    )}

                    {showConfirmExit && (
                        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
                            <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-lg">
                                <h2 className="text-base font-semibold mb-2">Прервать создание профиля?</h2>
                                <p className="text-sm text-gray-600 mb-4">Данные не сохранятся. Выйти?</p>
                                <div className="flex justify-end gap-3">
                                    <button
                                        className="text-sm text-gray-600 hover:text-black"
                                        onClick={() => setShowConfirmExit(false)}
                                    >
                                        Отмена
                                    </button>
                                    <button
                                        className="text-sm font-semibold text-red-600 hover:text-red-700"
                                        onClick={() => {
                                            if (nextHref) router.push(nextHref);
                                            else router.push('/search');
                                        }}
                                    >
                                        Да, выйти
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
