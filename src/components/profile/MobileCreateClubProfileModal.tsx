"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import PhotoCropModal from "@/components/camp/PhotoCropModal";
import { useMobileClubModal } from "@/context/MobileClubModalContext";
import { isReservedUsername } from '@/lib/reservedUsernames';
import { getBrowserApiBase } from '@/lib/apiBase';
//import { Suspense } from 'react';







interface Props {
    onClose: () => void;
}

const API_BASE = getBrowserApiBase();

export default function MobileCreateClubProfileModal({ onClose }: Props) {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [formData] = useState<FormData>(new FormData());
    const [error, setError] = useState("");

    const [username, setUsername] = useState("");
    const [usernameStatus, setUsernameStatus] = useState<"available" | "taken" | "invalid" | null>(null);


    const { setRequestExit } = useMobileClubModal();
    const [showConfirmExit, setShowConfirmExit] = useState(false);

    useEffect(() => {
        if (setRequestExit) {
            setRequestExit(() => () => setShowConfirmExit(true));
        }
    }, [setRequestExit]);

    useEffect(() => {
        if (username === "") {
            setUsernameStatus(null);
            return;
        }

        const isValid = /^[a-zA-Z0-9_.]+$/.test(username);
        const normalized = username.toLowerCase().trim();
        const isReserved = isReservedUsername(normalized);
        if (!isValid || isReserved) {
            setUsernameStatus("invalid");
            return;
        }

        let cancelled = false;
        const timeout = setTimeout(async () => {
            try {
                const encoded = encodeURIComponent(username.toLowerCase());
                const res = await fetch(`${API_BASE}/api/check-username/?username=${encoded}`, {
                    credentials: "include",
                    cache: "no-store",
                    headers: { Accept: "application/json" },
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (cancelled) return;
                if (!data.valid) setUsernameStatus("invalid");
                else setUsernameStatus(data.available ? "available" : "taken");
            } catch (err) {
                if (!cancelled) {
                    console.error("Failed to validate username", err);
                    setUsernameStatus("invalid");
                }
            }
        }, 400);

        return () => {
            cancelled = true;
            clearTimeout(timeout);
        };
    }, [username]);

    const handleNext = (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (usernameStatus !== "available") {
            setError("Имя пользователя некорректно или занято");
            return;
        }

        const form = e.currentTarget as HTMLFormElement;
        const telegram = (form.telegram_username as HTMLInputElement)?.value;
        const instagram = (form.instagram_username as HTMLInputElement)?.value;
        const phone = (form.phone_number as HTMLInputElement)?.value;

        const telegramRegex = /^[a-zA-Z0-9_]+$/;
        const instagramRegex = /^[a-zA-Z0-9_.]+$/;
        const phoneRegex = /^\+?[0-9\s\-()]+$/;

        if (telegram && !telegramRegex.test(telegram)) {
            return setError("Telegram: только латиница, цифры, _");
        }
        if (instagram && !instagramRegex.test(instagram)) {
            return setError("Instagram: только латиница, цифры, _ и .");
        }
        if (phone && !phoneRegex.test(phone)) {
            return setError("Телефон: только цифры, пробелы, скобки, тире и +");
        }

        const fd = new FormData(form);
        for (const [key, value] of fd.entries()) {
            formData.set(key, value);
        }

        setStep(2);
    };

    const handleSubmit = async () => {
        try {
            if (croppedAvatar) {
                formData.set("profile_picture", croppedAvatar);
            }

            const csrf = getCookie("csrftoken");
            const res = await fetch(`${API_BASE}/api/create-club-profile/`, {
                method: "POST",
                headers: { "X-CSRFToken": csrf || "" },
                credentials: "include",
                body: formData,
            });

            if (!res.ok) {
                console.error('Ошибка на сервере:', res.status);
                return setError("Ошибка на сервере");
            }

            const data = await res.json();
            if (res.ok) {
                router.push(data.redirect);
            } else {
                setError(data.error || "Ошибка");
            }
        } catch (error) {
            setError("Ошибка сети");
            console.error('Ошибка запроса:', error);
        }
    };




    const [activeCropFile, setActiveCropFile] = useState<File | null>(null);
    const [croppedAvatar, setCroppedAvatar] = useState<File | null>(null);
    const [cropMeta, setCropMeta] = useState<{ scale: number; position: { x: number; y: number } } | null>(null);
    const [originalAvatar, setOriginalAvatar] = useState<File | null>(null);

    const resolvedScale: number | undefined =
        originalAvatar && activeCropFile === originalAvatar && cropMeta?.scale !== undefined
            ? cropMeta.scale
            : undefined;

    const resolvedPosition: { x: number; y: number } | undefined =
        originalAvatar &&
        activeCropFile === originalAvatar &&
        cropMeta?.position !== undefined
            ? cropMeta.position
            : undefined;


    const handleDeletePhoto = () => {
        setCroppedAvatar(null);
        setOriginalAvatar(null);
        setCropMeta(null);
        formData.delete("profile_picture");
    };



    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!activeCropFile) return;

        const url = URL.createObjectURL(activeCropFile);
        setPreviewUrl(url);

        return () => {
            URL.revokeObjectURL(url);
        };
    }, [activeCropFile]);


    const [croppedPreviewUrl, setCroppedPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!croppedAvatar) return;

        const objectUrl = URL.createObjectURL(croppedAvatar);
        setCroppedPreviewUrl(objectUrl);

        return () => {
            URL.revokeObjectURL(objectUrl);
        };
    }, [croppedAvatar]);


    return (
        <div className="fixed inset-x-0 top-[64px] z-40 h-[calc(100dvh-64px)] bg-white overflow-hidden">
            <div className="pt-2 pb-2.5 px-4 border-b border-gray-200">
                <h1 className="text-lg font-semibold">
                    {step === 1 ? "Создание профиля" : "Фото профиля"}
                </h1>
            </div>

            <div className="h-full flex flex-col overflow-y-auto px-4 pb-24 space-y-4">
                {step === 1 && (
                    <form onSubmit={handleNext} className="space-y-4 pt-4">
                        <input
                            name="username"
                            required
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Имя пользователя"
                            className="w-full border-b border-gray-200 px-2 py-2 bg-transparent"
                        />
                        {usernameStatus === "available" && <p className="text-sm text-green-600">Свободно</p>}
                        {usernameStatus === "taken" && <p className="text-sm text-red-600">Занято</p>}
                        {usernameStatus === "invalid" && <p className="text-sm text-red-600">Недопустимые символы</p>}

                        <input name="club_name" placeholder="Название клуба" required className="w-full border-b border-gray-200 px-2 py-2 bg-transparent" />
                        <input name="telegram_username" placeholder="Telegram (без @)" className="w-full border-b border-gray-200 px-2 py-2 bg-transparent" />
                        <input name="instagram_username" placeholder="Instagram" className="w-full border-b border-gray-200 px-2 py-2 bg-transparent" />
                        <input name="phone_number" placeholder="Телефон" className="w-full border-b border-gray-200 px-2 py-2 bg-transparent" />
                        <input name="website" placeholder="Сайт" className="w-full border-b border-gray-200 px-2 py-2 bg-transparent" />
                        <textarea name="description" placeholder="Описание" className="w-full border border-gray-200 px-2 py-2 rounded-md resize-none" rows={3} />
                        <button type="submit" className="w-full bg-black text-white py-2 rounded-full">Продолжить</button>
                    </form>
                )}

                {error && (
                    <p className="text-sm text-red-600 mt-2">{error}</p>
                )}


                {step === 2 && (
                    <form onSubmit={handleSubmit}>
                        <div className="min-h-[330px] flex flex-col justify-between">
                            <div className="text-center space-y-4">
                                {/* Кнопка аватарки */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (originalAvatar) {
                                            setActiveCropFile(originalAvatar);
                                        } else {
                                            const input = document.createElement("input");
                                            input.type = "file";
                                            input.accept = "image/*";
                                            input.onchange = (e) => {
                                                const file = (e.target as HTMLInputElement).files?.[0];
                                                if (!file) return;
                                                setActiveCropFile(file);
                                            };
                                            input.click();
                                        }
                                    }}
                                    className="mt-4 inline-block w-48 h-48 rounded-full border border-gray-300 bg-gray-100 overflow-hidden"
                                >
                                    {croppedAvatar ? (
                                        <img
                                            src={croppedPreviewUrl || ""}
                                            alt="Аватар"
                                            className="w-full h-full object-cover rounded-full"
                                        />
                                    ) : (
                                        <span className="flex flex-col items-center justify-center h-full text-gray-500 text-sm leading-tight">
              <span className="text-5xl font-light">+</span>
              <span className="text-base mt-1">Добавь фото</span>
            </span>
                                    )}
                                </button>

                                {/* Кнопки Поменять / Удалить */}
                                {croppedAvatar && (
                                    <>
                                        <p className="text-green-600 font-medium">Вау! Вот это фото!</p>
                                        <div className="flex justify-center items-center gap-4">
                                            <button
                                                type="button"
                                                className="text-sm text-blue-600 underline"
                                                onClick={() => {
                                                    const input = document.createElement("input");
                                                    input.type = "file";
                                                    input.accept = "image/*";
                                                    input.onchange = (e) => {
                                                        const file = (e.target as HTMLInputElement).files?.[0];
                                                        if (!file) return;
                                                        setActiveCropFile(file);
                                                    };
                                                    input.click();
                                                }}
                                            >
                                                Поменять
                                            </button>
                                            <button
                                                type="button"
                                                className="text-sm text-red-500 underline"
                                                onClick={handleDeletePhoto}
                                            >
                                                Удалить
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="flex gap-4 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setStep(1)}
                                    className="w-1/2 border border-gray-300 rounded-full py-2 hover:bg-gray-100 transition"
                                >
                                    Назад
                                </button>
                                <button
                                    type="submit"
                                    className="w-1/2 bg-black text-white py-2 rounded-full hover:bg-black/80 transition"
                                >
                                    Создать профиль
                                </button>
                            </div>
                        </div>
                    </form>
                )}

            </div>

            {activeCropFile && (
                <PhotoCropModal
                    imageSrc={previewUrl!}
                    aspect={1}
                    circularCrop
                    className="w-full max-w-[360px] sm:max-w-[420px] mx-auto rounded-2xl p-6 max-h-[90vh] overflow-hidden"
                    initialScale={resolvedScale}
                    initialPosition={resolvedPosition}
                    onClose={() => setActiveCropFile(null)}
                    onComplete={(croppedFile, meta) => {
                        setCroppedAvatar(croppedFile);
                        setCropMeta(meta);
                        setOriginalAvatar(activeCropFile); // Сохраняем оригинал
                        formData.set("profile_picture", croppedFile);
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
                            <button className="text-sm text-gray-600 hover:text-black" onClick={() => setShowConfirmExit(false)}>
                                Отмена
                            </button>
                            <button className="text-sm font-semibold text-red-600 hover:text-red-700" onClick={onClose}>
                                Да, выйти
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}

function getCookie(name: string): string | null {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
}
