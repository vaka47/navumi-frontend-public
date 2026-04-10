"use client";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import SmartImage from "@/components/SmartImage";
import { absUrl } from "@/components/camp/campNormalize";
import type { ProfileData } from "@/types/profile";
import { getBrowserApiBase } from "@/lib/apiBase";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    currentProfile: ProfileData;
}

function getCookie(name: string): string | null {
    if (typeof document === "undefined") return null;
    const cookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith(name + "="));
    return cookie ? decodeURIComponent(cookie.split("=")[1]) : null;
}

export default function DeleteProfileModal({ isOpen, onClose, currentProfile }: Props) {
    const [codeSent, setCodeSent] = useState(false);
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const API_BASE = getBrowserApiBase();
            fetch(`${API_BASE}/api/csrf/`, {
                method: "GET",
                credentials: "include"
            });
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) {
            setCodeSent(false);
            setCode("");
            setError("");
            setSuccess(false);
        }
    }, [isOpen]);

    const sendCode = async () => {
        try {
            const API_BASE = getBrowserApiBase();
            const res = await fetch(`${API_BASE}/api/send-deletion-code/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": getCookie("csrftoken") || "",
                },
                credentials: "include",
            });

            if (res.ok) {
                setCodeSent(true);
            } else {
                const data = await res.json();
                setError(data.error || "Ошибка при отправке кода");
            }
        } catch {
            setError("Ошибка сети");
        }
    };

    const confirmDelete = async () => {
        if (!code) {
            setError("Введите код");
            return;
        }
        setError("");

        try {
            const API_BASE = getBrowserApiBase();
            const res = await fetch(`${API_BASE}/api/confirm-profile-deletion/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": getCookie("csrftoken") || "",
                },
                credentials: "include",
                body: JSON.stringify({ code }),
            });

            const data = await res.json();
            if (res.ok) {
                if (data?.switched_to) {
                    // есть второй профиль — редирект на него
                    window.location.href = `/${data.switched_to}`;
                } else if (data?.deleted_user) {
                    // не осталось профилей — разлогиниваем
                    window.location.href = "/auth/login";
                } else {
                    window.location.reload();
                }
            } else {
                setError(data.error || "Ошибка удаления. Попробуйте снова.");
            }

        } catch {
            setError("Ошибка сети. Проверьте соединение и попробуйте снова.");
        }
    };



    const codeInputRef = useRef<HTMLInputElement | null>(null); // + ref

    useEffect(() => {
        if (isOpen && codeSent) {
            const t = setTimeout(() => codeInputRef.current?.focus(), 50);
            return () => clearTimeout(t);
        }
    }, [isOpen, codeSent]);


    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Удалить профиль</DialogTitle>
                </DialogHeader>

                {!codeSent ? (
                    <div className="space-y-4">
                        <div className="flex flex-col items-center">
                            <div className="w-20 h-20 relative">
                                {currentProfile.profile_picture ? (
                                    <SmartImage
                                        src={absUrl(currentProfile.profile_picture) || currentProfile.profile_picture}
                                        alt={currentProfile.username}
                                        fill
                                        className="rounded-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full rounded-full bg-gray-200" />
                                )}
                            </div>
                            <p className="mt-2 font-medium">{currentProfile.username}</p>
                            <p className="text-xs text-muted-foreground">{currentProfile.role}</p>
                        </div>

                        <p className="text-sm text-muted-foreground text-center">
                            Мы отправим код подтверждения на вашу почту. Удалится только текущий профиль.
                        </p>

                        {error && <p className="text-sm text-red-500 text-center">{error}</p>}

                        <Button onClick={sendCode} className="w-full">
                            Получить код
                        </Button>
                    </div>
                ) : !success ? (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground text-center">
                            Введите 5-значный код, который мы отправили вам
                        </p>
                        <input
                            ref={codeInputRef}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            autoComplete="one-time-code"
                            enterKeyHint="done"
                            autoCorrect="off"
                            autoCapitalize="off"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            maxLength={5}
                            className="w-full border rounded px-4 py-2 text-center text-lg tracking-widest"
                            placeholder="12345"
                        />
                        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
                        <Button onClick={confirmDelete} className="w-full">
                            Подтвердить удаление
                        </Button>
                    </div>
                ) : (
                    <div className="text-center py-6 text-green-600 font-medium">
                        Профиль успешно удалён ✅
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
