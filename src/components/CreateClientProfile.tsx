'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { isReservedUsername } from '@/lib/reservedUsernames';
import { useAuth } from '@/context/AuthContext';
import PhotoCropModal from '@/components/camp/PhotoCropModal';
import { downscaleToSquare } from '@/lib/image';
import { useMobileClubModal } from '@/context/MobileClubModalContext';
import { useBottomNavBar } from '@/context/BottomNavBarContext';
import { getRegistrationToken, clearRegistrationToken } from '@/lib/registrationToken';
import { uploadFilesToGcs } from '@/lib/directUpload';
import { getBrowserApiBase } from '@/lib/apiBase';


function getCookie(name: string): string | null {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
}

export default function CreateClientProfilePage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [step, setStep] = useState(1);
    const [csrfToken, setCsrfToken] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [formData] = useState<FormData>(new FormData());
    const [codeSent] = useState(false);
    const { checkAuth } = useAuth();
    const { setRequestExit } = useMobileClubModal(); // ок, имя контекста такое же
    const [showConfirmExit, setShowConfirmExit] = useState(false);
    const [nextHref, setNextHref] = useState<string | undefined>(undefined);

    // Проверяем наличие токена при монтировании компонента
    // Для второго профиля (second=1) токен не требуется
    useEffect(() => {
        const isSecond = searchParams.get('second') === '1';
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
    }, [router, searchParams]);

    useEffect(() => {
        if (!setRequestExit) return;
        const fn = (href?: string) => {
            setNextHref(href);
            setShowConfirmExit(true);
        };
        setRequestExit(() => fn);
        return () => setRequestExit?.(() => () => {});
    }, [setRequestExit]);

    useEffect(() => {
        setCsrfToken(getCookie('csrftoken'));
    }, []);

    // ===== Шаг 1: валидация и переход на фото =====
    const handleFirstStepSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');

        const normalizedUsername = username.trim().toLowerCase();
        if (normalizedUsername.includes('navumi')) {
            setError('Имя пользователя не может содержать «navumi».');
            return;
        }

        if (usernameStatus !== 'available') {
            alert('Пожалуйста, укажите корректное и свободное имя пользователя.');
            return;
        }

        const fullNameInput = (e.currentTarget.full_name as HTMLInputElement | undefined)?.value || '';
        if (fullNameInput.toLowerCase().includes('navumi')) {
            setError('Имя не может содержать «navumi».');
            return;
        }

        const telegram = (e.currentTarget.telegram_username as HTMLInputElement)?.value;
        const instagram = (e.currentTarget.instagram_username as HTMLInputElement)?.value;

        const telegramRegex = /^[a-zA-Z0-9_]+$/;
        const instagramRegex = /^[a-zA-Z0-9_.]+$/;

        if (telegram && !telegramRegex.test(telegram)) {
            setError('Ник в Telegram может содержать только латиницу, цифры и подчёркивание.');
            return;
        }

        if (instagram && !instagramRegex.test(instagram)) {
            setError('Ник в Instagram может содержать только латиницу, цифры, подчёркивание и точку.');
            return;
        }

        const fd = new FormData(e.currentTarget);
        for (const [key, value] of fd.entries()) {
            formData.set(key, value);
        }

        setStep(2);
    };

    // ===== Финальный сабмит =====
    const handleFinalSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const isSecond = searchParams.get('second') === '1';
        const tokenFromUrl = searchParams.get('token');
        const tokenFromStorage = getRegistrationToken();
        const token = tokenFromUrl || tokenFromStorage;

        // Для второго профиля (second=1) токен не обязателен
        if (!isSecond && !token) {
            // Если токена нет для первого профиля — редиректим на главную страницу поиска
            router.replace('/search');
            return;
        }

        const maybeFile = formData.get('profile_picture');
        let preuploadedAvatar: string[] = [];
        if (maybeFile instanceof File) {
            const tiny = await downscaleToSquare(maybeFile, 512);
            try {
                preuploadedAvatar = await uploadFilesToGcs([tiny], null, 'profile');
            } catch {
                // если direct upload не удался — оставляем старый путь через multipart
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
            const API_BASE = getBrowserApiBase();
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
                    setError(data.error || 'Ошибка создания профиля');
                }
            }
        } catch (err) {
            console.error(err);
            setError('Ошибка сети');
        }
    };

    // автоскролл к коду (оставляем, как в клубном)
    const codeRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (codeSent && codeRef.current) {
            codeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [codeSent]);

    // username: дебаунс-проверка
    const [username, setUsername] = useState('');
    const [usernameStatus, setUsernameStatus] = useState<'available' | 'taken' | 'invalid' | null>(null);

    useEffect(() => {
        if (username === '') {
            setUsernameStatus(null);
            return;
        }

        // Разрешаем латиницу/цифры/подчёркивание/точку (как в клубном мастере);
        // и блокируем брендовые имена с «navumi» и зарезервированные маршруты.
        const localRuleOk = /^[a-zA-Z0-9_.]+$/.test(username);
        const normalized = username.toLowerCase().trim();
        const forbiddenBrand = normalized.includes('navumi');
        const isReserved = isReservedUsername(normalized);
        if (!localRuleOk || forbiddenBrand || isReserved) {
            setUsernameStatus('invalid');
            return;
        }

        const delayDebounce = setTimeout(() => {
            const API_BASE = getBrowserApiBase();
            fetch(
                `${API_BASE}/api/check-username/?username=${encodeURIComponent(
                    username.toLowerCase()
                )}`,
                { credentials: 'include' }
            )
                .then((res) => res.json())
                .then((data) => {
                    if (!data.valid) setUsernameStatus('invalid');
                    else if (data.available) setUsernameStatus('available');
                    else setUsernameStatus('taken');
                })
                .catch(() => {});
        }, 500);

        return () => clearTimeout(delayDebounce);
    }, [username]);

    // ===== Фото / кроп =====
    const [activeCropFile, setActiveCropFile] = useState<File | null>(null);
    const [croppedAvatar, setCroppedAvatar] = useState<File | null>(null);
    const [cropMeta, setCropMeta] = useState<{ scale: number; position: { x: number; y: number } } | null>(null);
    const [originalAvatar, setOriginalAvatar] = useState<File | null>(null);

    const resolvedScale: number | undefined =
        originalAvatar && activeCropFile === originalAvatar && cropMeta?.scale !== undefined
            ? cropMeta.scale
            : undefined;

    const resolvedPosition: { x: number; y: number } | undefined =
        originalAvatar && activeCropFile === originalAvatar && cropMeta?.position !== undefined
            ? cropMeta.position
            : undefined;

    const handleDeletePhoto = () => {
        setCroppedAvatar(null);
        setOriginalAvatar(null);
        setCropMeta(null);
        formData.delete('profile_picture');
    };

    const { setHide } = useBottomNavBar();
    useEffect(() => {
        setHide(true);
        return () => setHide(false);
    }, [setHide]);


    return (
        <div className="h-[calc(100dvh-64px)] flex items-center justify-center px-4">
            <div className="w-full max-w-2xl">
                <h1 className="text-2xl sm:text-3xl font-semibold text-center mb-6 py-6">
                    {step === 1 ? 'Создание профиля клиента' : 'Фото профиля'}
                </h1>

                {error && <p className="text-red-500 text-center mb-4">{error}</p>}

                <div className="bg-white rounded-2xl shadow-md px-4 py-6 space-y-6">
                    {step === 1 && (
                        <form onSubmit={handleFirstStepSubmit} className="flex flex-col gap-y-3.5 px-1 text-sm">
                            {/* Username */}
                            <div className="border-b border-gray-150 focus-within:border-black transition-colors">
                                <div className="flex items-center gap-0 min-w-0">
                                    {/* Лейбл слева: 2 строки */}
                                    <span className="w-36 shrink-0 text-gray-400 text-xs leading-tight px-1">
          <span className="block">Имя профиля для</span>
          <span className="block">красивой ссылки</span>
        </span>

                                    {/* Префикс + поле ввода с минимальным зазором */}
                                    <div className="flex-1 min-w-0 flex items-center">
          <span className="text-gray-400 select-none" aria-hidden="true">
            navumi.com/
          </span>
                                        <input
                                            name="username"
                                            required
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            placeholder="username"
                                            aria-label="Имя пользователя"
                                            className="flex-1 bg-transparent border-0 px-1 py-2 focus:outline-none placeholder:text-gray-400/60"
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
                                    Допустимы только латинские буквы, цифры, подчёркивание и точка.
                                </p>
                            )}

                            {/* Имя (full_name) вместо «Название клуба» */}
                            <div className="border-b border-gray-150">
                                <div className="flex items-center gap-0 min-w-0">
                                    <span className="w-36 shrink-0 text-gray-400 text-sm px-1">Как вас зовут?</span>
                                    <input
                                        name="full_name"
                                        required
                                        aria-label="Имя"
                                        className="w-0 flex-1 bg-transparent border-0 px-1 py-2 focus:outline-none"
                                    />
                                </div>
                            </div>

                            {/* Telegram / Instagram */}
                            <div className="flex gap-4">
                                <div className="flex-1 min-w-0 border-b border-gray-150 pr-1">
                                    <div className="flex items-center gap-0 min-w-0">
                                        <span className="w-28 shrink-0 text-gray-400 text-sm px-1">Telegram</span>
                                        <input
                                            name="telegram_username"
                                            aria-label="Telegram"
                                            className="w-0 flex-1 bg-transparent border-0 px-1 py-2 focus:outline-none"
                                        />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0 border-b border-gray-150 pr-1">
                                    <div className="flex items-center gap-0 min-w-0">
                                        <span className="w-28 shrink-0 text-gray-400 text-sm px-1">Instagram</span>
                                        <input
                                            name="instagram_username"
                                            aria-label="Instagram"
                                            className="w-0 flex-1 bg-transparent border-0 px-1 py-2 focus:outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Сайт */}
                            <div className="border-b border-gray-150">
                                <div className="flex items-center gap-0 min-w-0">
                                    <span className="w-36 shrink-0 text-gray-400 text-sm px-1">Сайт</span>
                                    <input
                                        name="website"
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
          className="w-full bg-white border border-gray-150 focus:border-black focus:outline-none px-2 py-2 rounded-md resize-none"
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
                                                        setActiveCropFile(file);
                                                    };
                                                    input.click();
                                                }
                                            }}
                                            className="w-48 h-48 rounded-full border border-gray-300 bg-gray-100 overflow-hidden [clip-path:circle(50%_at_50%_50%)] cursor-pointer"
                                        >
                                            {croppedAvatar ? (
                                                // оставляем <img>, чтобы полностью повторить визуал из клубного мастера
                                                <img
                                                    src={URL.createObjectURL(croppedAvatar)}
                                                    alt="Аватар"
                                                    className="w-full h-full object-cover"
                                                    style={{ pointerEvents: 'none' }}
                                                />
                                            ) : (
                                                <span className="flex flex-col items-center justify-center h-full text-gray-500 text-sm leading-tight">
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
                                        className="w-1/2 border border-gray-300 rounded-full py-2 hover:bg-gray-100 transition"
                                    >
                                        Назад
                                    </button>
                                    <button type="submit" className="w-1/2 bg-black text-white py-2 rounded-full hover:bg-black/80 transition">
                                        Создать профиль
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
                            className="w-full max-w-[360px] sm:max-w-[420px] mx-auto rounded-2xl p-6 max-h-[90vh] overflow-hidden"
                            initialScale={resolvedScale}
                            initialPosition={resolvedPosition}
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
                </div>
            </div>

            {showConfirmExit && (
                <div className="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center px-4">
                    <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-lg">
                        <h2 className="text-base font-semibold mb-2">Прервать создание профиля?</h2>
                        <p className="text-sm text-gray-600 mb-4">Данные не сохранятся. Выйти?</p>
                        <div className="flex justify-end gap-3">
                            <button className="text-sm text-gray-600 hover:text-black" onClick={() => setShowConfirmExit(false)}>
                                Отмена
                            </button>
                            <button
                                className="text-sm font-semibold text-red-600 hover:text-red-700"
                                onClick={() => router.push(nextHref ?? '/search')}
                            >
                                Да, выйти
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
