"use client";

import {useEffect, useRef, useState} from "react";
import { useSearchParams, useParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { getBrowserApiBase } from "@/lib/apiBase";

const API_BASE = getBrowserApiBase();

export default function ResetPassword() {
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);
    const [codeSent] = useState(false);

    const searchParams = useSearchParams();
    const params = useParams();

    const uid = searchParams.get("uid");
    const token = params.token as string;

    async function handleReset() {
        setError("");
        setSuccess(false);

        if (!password || !confirm) {
            setError("Заполните оба поля.");
            return;
        }

        if (password !== confirm) {
            setError("Пароли не совпадают.");
            return;
        }

        if (!token || !uid) {
            setError("Ссылка недействительна.");
            return;
        }

        setLoading(true);
        const res = await fetch(`${API_BASE}/api/reset-password/?uid=${uid}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            cache: "no-store",
            body: JSON.stringify({ password, token }),
        });

        const data = await res.json();
        setLoading(false);

        if (res.ok) {
            setSuccess(true);
            setPassword("");
            setConfirm("");
        } else {
            setError(data.error || "Ошибка сброса пароля.");
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
                <h1 className="text-2xl font-bold text-center">Новый пароль</h1>

                {success ? (
                    <div className="text-center text-green-600 space-y-2 animate-fade-in">
                        <p className="text-lg font-semibold">🎉 Ура! Всё получилось!</p>
                        <p>
                            Пожалуйста,{" "}
                            <Link
                                href="/auth/login"
                                className="text-primary underline font-medium animate-pulse hover:text-primary/80 transition-colors"
                            >
                                выполните вход с новым паролем
                            </Link>
                            .
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-2">
                            <Label htmlFor="password">Придумайте пароль</Label>
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
                            <Label htmlFor="confirm">Повторите пароль</Label>
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

                        <Button onClick={handleReset} disabled={loading} className="w-full">
                            Сохранить
                        </Button>
                    </>
                )}

                {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            </div>
        </div>
    );
}
