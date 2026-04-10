'use client';

import { useAuth } from "@/context/AuthContext";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { getBrowserApiBase } from "@/lib/apiBase";
//import type { ProfileData } from "@/types/profile";

export default function LoginForm() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [show, setShow] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [codeSent] = useState(false);
    const { checkAuth } = useAuth();

    function getCookie(name: string): string | null {
        if (typeof document === "undefined") return null;
        const cookie = document.cookie.split("; ").find(row => row.startsWith(name + "="));
        return cookie ? decodeURIComponent(cookie.split("=")[1]) : null;
    }


    async function handleLogin() {
        setError("");

        if (!email || !password) {
            setError("Пожалуйста, заполните все поля.");
            return;
        }

        setLoading(true);

        try {
            const API_BASE = getBrowserApiBase();
            const res = await fetch(`${API_BASE}/api/login/`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": getCookie("csrftoken") || "",
                },
                body: JSON.stringify({ email, password }),
            });

            if (res.ok) {
                // 🧠 Делаем небольшую паузу, чтобы браузер принял sessionid
                setTimeout(async () => {
                    await checkAuth(); // 🔁 обновляем контекст
                    const authRes = await fetch(`${API_BASE}/api/check-auth/`, {
                        credentials: "include",
                    });
                    const authData = await authRes.json();

                    const username = authData?.profile?.username;
                    if (username) {
                        router.push(`/${username}`);
                    } else {
                        router.push("/auth/choose-role");
                    }
                }, 150); // можно увеличить до 200–300мс при необходимости
            } else {
                const data = await res.json();
                setError(data.error || "Вы ввели неверные данные.");
            }
        } catch (err) {
            console.error(err);
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
            className="h-[calc(100dvh-64px)] flex items-center justify-center px-4"
        >
            <div className="max-w-md w-full space-y-5 p-6 bg-white rounded-2xl shadow-md border">
                <h1 className="text-2xl font-bold text-center">Вход</h1>

                <p className="text-sm text-center text-muted-foreground">
                    Нет аккаунта?{" "}
                    <Link href="/auth/register" className="text-primary underline">
                        Зарегистрируйтесь
                    </Link>
                </p>

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
                            type={show ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="pr-10"
                        />
                        <button
                            type="button"
                            onClick={() => setShow(!show)}
                            className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            {show ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </div>

                <div className="flex justify-end text-sm text-muted-foreground">
                    <Link href="/auth/forgot-password" className="hover:underline">
                        Забыли пароль?
                    </Link>
                </div>

                <Button onClick={handleLogin} disabled={loading} className="w-full">
                    Войти
                </Button>

                {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            </div>
        </div>
    );
}
