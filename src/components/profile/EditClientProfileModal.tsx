'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import PhotoCropModal from '@/components/camp/PhotoCropModal';
import { downscaleToSquare } from '@/lib/image';
import { uploadFilesToGcs } from '@/lib/directUpload';
import SmartImage from '@/components/SmartImage';
import { absUrl } from '@/components/camp/campNormalize';
import { getBrowserApiBase } from '@/lib/apiBase';

type UsernameStatus = 'available' | 'taken' | 'invalid' | null;

export type ProfileUpdatePayload = {
    username: string;
    role: 'client';
    full_name?: string | null;
    telegram?: string | null;
    instagram?: string | null;
    website?: string | null;
    description?: string | null;
    profile_picture?: string | null;
};

interface ClientProfileData {
    username: string;
    full_name: string;
    telegram?: string;
    instagram?: string;
    website?: string;
    description?: string;
    profile_picture?: string; // URL
}

const API_BASE = getBrowserApiBase();

export default function EditClientProfileModal({
                                                   isOpen,
                                                   onClose,
                                                   initialData,
                                                   onSaved,
                                                   initialCanChangeUsername,
                                                   initialNextChangeAt,
                                               }: {
    isOpen: boolean;
    onClose: () => void;
    initialData: ClientProfileData;
    onSaved?: (p: ProfileUpdatePayload) => void;
    initialCanChangeUsername?: boolean | null;
    initialNextChangeAt?: string | null;
}) {
    // --- CSRF ---
    const [csrfToken, setCsrfToken] = useState<string | null>(null);
    useEffect(() => {
        const getCookie = (name: string) => {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
            return null;
        };
        setCsrfToken(getCookie('csrftoken'));
    }, []);

    // --- Form state ---
    const [formData] = useState<FormData>(new FormData());
    const formRef = useRef<HTMLFormElement>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!error) return;
        const tid = window.setTimeout(() => setError(''), 7000);
        return () => window.clearTimeout(tid);
    }, [error]);

    // fields
    const [username, setUsername] = useState(initialData.username);
    const [fullName, setFullName] = useState(initialData.full_name);
    const [telegram, setTelegram] = useState(initialData.telegram || '');
    const [instagram, setInstagram] = useState(initialData.instagram || '');
    const [website, setWebsite] = useState(initialData.website || '');
    const [description, setDescription] = useState(initialData.description || '');

    // --- username validation & change window ---
    const [usernameTouched, setUsernameTouched] = useState(false);
    const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>(null);
    const [canChangeUsername, setCanChangeUsername] =
        useState<boolean | null>(initialCanChangeUsername ?? null);
    const [nextChangeAt, setNextChangeAt] =
        useState<string | null>(initialNextChangeAt ?? null);

    useEffect(() => {
        if (!usernameTouched) return;

        // проверяем доступность только если смена имени разрешена
        if (canChangeUsername !== true) {
            setUsernameStatus(null);
            return;
        }
        if (username === initialData.username || username === '') {
            setUsernameStatus(null);
            return;
        }

        const isLatin = /^[a-zA-Z0-9_]+$/.test(username); // как в клубной модалке
        if (!isLatin) {
            setUsernameStatus('invalid');
            return;
        }

        const ctrl = new AbortController();
        const timer = setTimeout(() => {
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
            clearTimeout(timer);
            ctrl.abort();
        };
    }, [username, usernameTouched, initialData.username, canChangeUsername]);

    // --- avatar / cropper (идентично клубной модалке) ---
    const [activeCropFile, setActiveCropFile] = useState<File | null>(null);
    const [croppedAvatar, setCroppedAvatar] = useState<File | null>(null);
    const [cropMeta, setCropMeta] =
        useState<{ scale: number; position: { x: number; y: number } } | null>(null);
    const [originalAvatar, setOriginalAvatar] = useState<File | null>(null);

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

    const resolvedScale =
        originalAvatar && activeCropFile === originalAvatar && cropMeta?.scale !== undefined
            ? cropMeta.scale
            : undefined;

    const resolvedPosition =
        originalAvatar && activeCropFile === originalAvatar && cropMeta?.position !== undefined
            ? cropMeta.position
            : undefined;

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
    const currentAvatarUrl = croppedPreviewUrl || serverAvatarUrl || null;

    const handleDeletePhoto = () => {
        setCroppedAvatar(null);
        setOriginalAvatar(null);
        setCropMeta(null);
        setServerAvatarUrl(null);
        formData.delete('profile_picture');
        setPhotoJustUpdated(false);
    };

    const handleAvatarClick = async () => {
        if (croppedAvatar && originalAvatar) {
            setActiveCropFile(originalAvatar);
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

    const [isSaving, setIsSaving] = useState(false);

    // --- submit ---
    const handleSubmit = async (e: React.FormEvent) => {
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

        // валидации
        const telegramRegex = /^[a-zA-Z0-9_]+$/;
        const instagramRegex = /^[a-zA-Z0-9_.]+$/;

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

        const fd = new FormData();
        fd.set('username', username.trim().toLowerCase());
        fd.set('full_name', fullName);
        fd.set('telegram_username', telegram);
        fd.set('instagram_username', instagram);
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
                onClose();
                const redirect = data?.redirect;
                if (typeof redirect === 'string' && redirect !== window.location.pathname) {
                    // сменился username
                    window.location.assign(redirect);
                } else if (onSaved) {
                    onSaved({
                        ...data.profile,
                        role: 'client',
                        profile_picture: data.profile.profile_picture || null,
                    });
                } else {
                    setTimeout(() => window.location.reload(), 150);
                }
                return;
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
    };

    // сброс при открытии
    useEffect(() => {
        if (!isOpen) return;
        setUsername(initialData.username);
        setFullName(initialData.full_name);
        setTelegram(initialData.telegram || '');
        setInstagram(initialData.instagram || '');
        setWebsite(initialData.website || '');
        setDescription(initialData.description || '');
        setCroppedAvatar(null);
        setOriginalAvatar(null);
        setCropMeta(null);
        setServerAvatarUrl(stripBust(initialData.profile_picture || null));
        setPhotoJustUpdated(false);

        setCanChangeUsername(initialCanChangeUsername === undefined ? null : initialCanChangeUsername);
        setNextChangeAt(initialNextChangeAt ?? null);
    }, [isOpen, initialData, initialCanChangeUsername, initialNextChangeAt]);

    // подгружаем окно смены имени, если не пришло сверху
    useEffect(() => {
        if (!isOpen) return;
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
    }, [isOpen, initialData.username, initialCanChangeUsername, canChangeUsername]);

    // если смена имени запрещена — возвращаем поле в исходное и снимаем статусы
    useEffect(() => {
        if (canChangeUsername !== true) {
            setUsername(initialData.username);
            setUsernameTouched(false);
            setUsernameStatus(null);
        }
    }, [canChangeUsername, initialData.username]);

    // file input infra (как в клубной модалке)
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const fileDialogBusyRef = useRef(false);

    useEffect(() => {
        if (!isOpen) return;
        if (!fileInputRef.current) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.style.position = 'fixed';
            input.style.left = '-9999px';
            input.onchange = (e) => {
                fileDialogBusyRef.current = false;
                const file = (e.target as HTMLInputElement).files?.[0] || null;
                (e.target as HTMLInputElement).value = '';
                if (!file) return;
                const name = (file.name || '').toLowerCase();
                const mime = (file.type || '').toLowerCase();
                if (mime.includes('heic') || mime.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif')) {
                    alert('Формат HEIC пока не поддерживается. Пожалуйста, сохраните фото в JPG/PNG/WebP и попробуйте снова.');
                    return;
                }
                setOriginalAvatar(file);
                setActiveCropFile(file);
            };
            document.body.appendChild(input);
            fileInputRef.current = input;
        }
    }, [isOpen]);

    function openFileDialogFast() {
        if (fileDialogBusyRef.current) return;
        fileDialogBusyRef.current = true;
        fileInputRef.current?.click();
        setTimeout(() => {
            fileDialogBusyRef.current = false;
        }, 2000);
    }

    useEffect(() => {
        return () => {
            if (fileInputRef.current) {
                fileInputRef.current.remove();
                fileInputRef.current = null;
            }
        };
    }, []);

    const safeSrc = currentAvatarUrl ? stripBust(currentAvatarUrl) : null;

    return (
        <>
            <Dialog
                open={isOpen}
                onOpenChange={(next) => {
                    if (confirmDeleteOpen) return;
                    if (!next) onClose();
                }}
            >
                <DialogContent
                    className="w-full max-w-2xl min-w-0 bg-white overflow-visible"
                    style={{ maxHeight: '90vh' }}
                    onInteractOutside={(e) => {
                        if (confirmDeleteOpen || activeCropFile) e.preventDefault();
                    }}
                    onEscapeKeyDown={(e) => {
                        if (confirmDeleteOpen) e.preventDefault();
                    }}
                >
                    {error && (
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-red-100 border border-red-300 text-red-800 rounded-md text-sm shadow-md max-w-[90%] text-center">
                            {error}
                        </div>
                    )}

                    <div className="max-h-[80vh] overflow-y-auto px-1">
                        <h2 className="text-lg font-semibold text-center mt-1">Редактировать профиль</h2>

                        {/* Аватар */}
                        <div className="text-center mt-4">
                            <div className="inline-block relative w-40 h-40">
                                <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={handleAvatarClick}
                                    onPointerDown={(e) => {
                                        if (!croppedAvatar && !originalAvatar && !serverAvatarUrl) {
                                            e.preventDefault();
                                            openFileDialogFast();
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            handleAvatarClick();
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

                        {/* Форма */}
                        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-y-3.5 px-1 mt-4 text-sm">
                            {/* Username */}
                            <div
                                className={`border-b transition-colors ${
                                    username !== initialData.username ? 'border-black' : 'border-gray-150 focus-within:border-black'
                                }`}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="w-36 shrink-0 text-gray-400 text-sm px-1">Имя профиля</span>
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

                            {/* Username statuses */}
                            {canChangeUsername === true && username !== initialData.username && usernameTouched && (
                                <div className="mt-[-9px] space-y-1">
                                    {usernameStatus === 'available' && <p className="m-0 text-sm px-1 text-green-600">Имя свободно</p>}
                                    {usernameStatus === 'taken' && <p className="m-0 text-sm px-1 text-red-600">Имя занято ❌</p>}
                                    {usernameStatus === 'invalid' && (
                                        <p className="m-0 text-sm px-1 text-red-600">Допустимы только латинские буквы, цифры и подчёркивание.</p>
                                    )}
                                </div>
                            )}
                            {canChangeUsername === false && nextChangeAt && (
                                <p className="m-0 mt-[-9px] px-1 text-sm text-gray-400">
                                    Можно менять раз в месяц. Следующий раз: {new Date(nextChangeAt).toLocaleDateString()}.
                                </p>
                            )}
                            {canChangeUsername === null && (
                                <p className="m-0 mt-[-9px] px-1 text-sm text-gray-400">Проверяем возможность смены имени…</p>
                            )}

                            {/* Имя (full_name) */}
                            <div className="border-b border-gray-150">
                                <div className="flex items-center gap-2">
                                    <span className="w-36 shrink-0 text-gray-400 text-sm px-1">Как вас зовут?</span>
                                    <input
                                        name="full_name"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        required
                                        aria-label="Имя"
                                        className="flex-1 bg-transparent border-0 px-1 py-2 focus:outline-none"
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
                                            value={telegram}
                                            onChange={(e) => setTelegram(e.target.value)}
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
                                            value={instagram}
                                            onChange={(e) => setInstagram(e.target.value)}
                                            aria-label="Instagram"
                                            className="w-0 flex-1 bg-transparent border-0 px-1 py-2 focus:outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Сайт */}
                            <div className="border-b border-gray-150">
                                <div className="flex items-center gap-2">
                                    <span className="w-36 shrink-0 text-gray-400 text-sm px-1">Сайт</span>
                                    <input
                                        name="website"
                                        value={website}
                                        onChange={(e) => setWebsite(e.target.value)}
                                        aria-label="Сайт"
                                        className="flex-1 bg-transparent border-0 px-1 py-2 focus:outline-none"
                                    />
                                </div>
                            </div>

                            {/* Описание */}
                            <textarea
                                name="description"
                                placeholder="Описание"
                                rows={3}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full bg-white border border-gray-150 focus:border-black focus:outline-none px-2 py-2 rounded-md resize-none"
                            />

                            <Button
                                type="submit"
                                disabled={isSaving}
                                className="w-full bg-black text-white py-2 rounded-full hover:bg-black/80 transition"
                            >
                                {isSaving ? 'Сохраняем…' : 'Сохранить изменения'}
                            </Button>
                        </form>
                    </div>

                    {/* Кроппер */}
                    {activeCropFile && (
                        <PhotoCropModal
                            imageSrc={URL.createObjectURL(activeCropFile)}
                            aspect={1}
                            circularCrop
                            className="w-full max-w-[420px] mx-auto rounded-2xl p-6 max-h-[90vh] overflow-hidden"
                            initialScale={resolvedScale}
                            initialPosition={resolvedPosition}
                            onClose={() => setActiveCropFile(null)}
                            onComplete={(croppedFile, meta) => {
                                setCroppedAvatar(croppedFile);
                                setCropMeta(meta);
                                setOriginalAvatar(activeCropFile);
                                formData.set('profile_picture', croppedFile);
                                setActiveCropFile(null);
                                setPhotoJustUpdated(true);
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Confirm delete avatar */}
            <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
                <DialogPortal>
                    <div className="fixed inset-0 z-[10000]">
                        <DialogOverlay className="fixed inset-0 " />
                        <DialogPrimitive.Content
                            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-w-sm w-full bg-white rounded-xl p-6 shadow-lg focus:outline-none z-[20000]"
                        >
                            <h3 className="text-base font-semibold mb-2">Удалить фото профиля?</h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Хотите удалить фото профиля? Вернуть его можно будет только повторно загрузив файл.
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
                        </DialogPrimitive.Content>
                    </div>
                </DialogPortal>
            </Dialog>
        </>
    );
}
