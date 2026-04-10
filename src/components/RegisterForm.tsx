"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { saveRegistrationToken } from "@/lib/registrationToken";
import { getBrowserApiBase } from "@/lib/apiBase";

const API = getBrowserApiBase();

export default function RegisterForm() {
    const router = useRouter();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [code, setCode] = useState("");

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const [codeSent, setCodeSent] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        fetch(`${API}/api/csrf/`, {
            method: "GET",
            credentials: "include",
        });
    }, []);

    const codeRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (codeSent && codeRef.current) {
            codeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, [codeSent]);



    function getCookie(name: string): string | null {
        if (typeof document === "undefined") return null;
        const cookie = document.cookie
            .split("; ")
            .find((row) => row.startsWith(name + "="));
        return cookie ? decodeURIComponent(cookie.split("=")[1]) : null;
    }

    async function handleSendCode() {
        setError("");
        if (!email || !password || !confirm) {
            setError("Все поля обязательны.");
            return;
        }
        if (password !== confirm) {
            setError("Пароли не совпадают.");
            return;
        }

        setLoading(true);
        const res = await fetch(`${API}/api/send-code/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": getCookie("csrftoken") || "",
            },
            credentials: "include",
            body: JSON.stringify({ email, password }),
        });

        const data = await res.json();
        setLoading(false);

        if (res.ok) {
            setCodeSent(true);
        } else {
            setError(data.error || "Ошибка при регистрации.");
        }
    }

    async function handleVerifyCode() {
        if (!code || code.length !== 5) {
            setError("Введите корректный 5-значный код.");
            return;
        }

        setLoading(true);
        const res = await fetch(`${API}/api/confirm-code/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": getCookie("csrftoken") || "",
            },
            credentials: "include",
            body: JSON.stringify({ email, code }),
        });

        const data = await res.json();
        setLoading(false);

        if (res.ok) {
            // Сохраняем токен регистрации и редиректим на выбор роли
            if (data.registration_token) {
                saveRegistrationToken(data.registration_token);
                router.push("/auth/choose-role");
            } else {
                setError("Не удалось получить токен регистрации. Попробуйте еще раз.");
            }
        } else {
            setError(data.error || "Код не подтвержден.");
        }
    }

    return (
        <div
            className="min-h-[calc(100dvh-64px)] flex items-start justify-center px-4 py-6"
        >
            <div className="max-w-md w-full space-y-5 p-6 bg-white rounded-2xl shadow-md border">
                <h1 className="text-2xl font-bold text-center">Регистрация</h1>

                <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="password">Пароль</Label>
                    <div className="relative">
                        <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="pr-10"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="confirm">Подтвердите пароль</Label>
                    <div className="relative">
                        <Input
                            id="confirm"
                            type={showConfirm ? "text" : "password"}
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            className="pr-10"
                        />
                        <button
                            type="button"
                            onClick={() => setShowConfirm(!showConfirm)}
                            className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </div>

                <Button onClick={handleSendCode} disabled={loading} className="w-full">
                    {codeSent ? "Пришлите код ещё раз" : "Пришлите мне код"}
                </Button>

                <AnimatePresence>
                    {codeSent && (
                        <motion.div
                            key="code"
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <div
                                ref={codeRef}
                                className="space-y-4 mt-4 pb-24 sm:pb-6"
                            >
                                <div className="space-y-2">
                                    <Label htmlFor="code">Введите код из письма</Label>
                                    <Input
                                        id="code"
                                        type="text"
                                        inputMode="numeric"
                                        value={code}
                                        onChange={(e) =>
                                            setCode(e.target.value.replace(/\D/g, "").slice(0, 5))
                                        }
                                    />
                                </div>

                                <Button
                                    onClick={handleVerifyCode}
                                    disabled={loading}
                                    className="w-full"
                                >
                                    Зарегистрироваться
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {error && (
                    <p className="text-sm text-red-500 text-center">{error}</p>
                )}
            </div>
        </div>
    );
}

//
