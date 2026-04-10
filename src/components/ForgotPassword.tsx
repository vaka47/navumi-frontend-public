"use client";

import {useEffect, useRef, useState} from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getBrowserApiBase } from "@/lib/apiBase";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [codeSent] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

    useEffect(() => {
        async function checkAuth() {
            try {
                const API_BASE = getBrowserApiBase();
                const res = await fetch(`${API_BASE}/api/check-auth/`, {
                    credentials: "include",
                });
                if (res.ok) {
                    const data = await res.json();
                    setIsLoggedIn(data.authenticated === true);
                } else {
                    setIsLoggedIn(false);
                }
            } catch {
                setIsLoggedIn(false);
            }
        }
        checkAuth();
    }, []);




    async function handleSubmit() {
        setError("");
        setMessage("");

        if (!email) {
            setError("Введите email.");
            return;
        }

        setLoading(true);

        try {
            const API_BASE = getBrowserApiBase();
            const res = await fetch(`${API_BASE}/api/forgot-password/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                cache: "no-store",
                body: JSON.stringify({ email }),
            });

            const contentType = res.headers.get("content-type");
            const data = contentType?.includes("application/json") ? await res.json() : {};

            if (res.ok) {
                setMessage("Проверьте свою почту.\nМы отправили ссылку для сброса пароля.");
            } else if (res.status === 404) {
                setError("Пользователь с таким email не найден.");
                setMessage("Вы можете зарегистрироваться по ссылке ниже.");
            } else {
                setError(data.error || "Ошибка при отправке письма.");
            }
        } catch {
            setError("Ошибка подключения. Попробуйте позже.");
        } finally {
            setLoading(false);
        }
    }

    const codeRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (codeSent && codeRef.current) {
            codeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, [codeSent]);


    return (
        <div
            className={`h-[calc(100dvh-64px)] flex items-center justify-center px-4 transition-all duration-300 ${
                codeSent ? "mt-10 sm:mt-16" : "mt-10 sm:mt-18"
            }`}
        >
            <div className="max-w-md w-full space-y-5 p-6 bg-white rounded-2xl shadow-md border">
                <h1 className="text-2xl font-bold text-center">Сброс пароля</h1>

                {isLoggedIn === false && (
                    <p className="text-sm text-center text-muted-foreground">
                        Вспомнили пароль?{" "}
                        <Link href="/auth/login" className="text-primary underline">
                            Войти
                        </Link>
                    </p>
                )}



                <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>

                <Button onClick={handleSubmit} disabled={loading} className="w-full">
                    {loading ? "Отправка..." : "Отправить ссылку"}
                </Button>


                {error && (
                    <div className="text-center space-y-1">
                        <p className="text-sm text-red-500">{error}</p>
                        {error.includes("не найден") && (
                            <p className="text-sm text-green-600">
                                Вы можете зарегистрироваться по ссылке ниже. <br />
                                <Link href="/auth/register" className="text-primary underline">
                                    Перейти к регистрации
                                </Link>
                            </p>
                        )}
                    </div>
                )}

                {message && !error && (
                    <div className="text-sm text-green-600 text-center space-y-1">
                        {message.split("\n").map((line, index) => (
                            <p key={index}>{line}</p>
                        ))}
                    </div>
                )}

            </div>
        </div>
    );
}
