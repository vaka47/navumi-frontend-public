"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { getBrowserApiBase } from "@/lib/apiBase";

function PasswordInput({
                           id,
                           label,
                           value,
                           onChange,
                       }: {
    id: string;
    label: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
    const [show, setShow] = useState(false);
    return (
        <div className="space-y-2 relative">
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                type={show ? "text" : "password"}
                value={value}
                onChange={onChange}
            />
            <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute right-3 top-8 text-muted-foreground"
            >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
        </div>
    );
}

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword1, setNewPassword1] = useState("");
    const [newPassword2, setNewPassword2] = useState("");
    const [loading, setLoading] = useState(false);
    const [successShown, setSuccessShown] = useState(false);
    const [error, setError] = useState("");
    const router = useRouter();

    async function handleSubmit() {
        setError("");
        if (!oldPassword || !newPassword1 || !newPassword2) {
            setError("Пожалуйста, заполните все поля.");
            return;
        }
        if (newPassword1 !== newPassword2) {
            setError("Новые пароли не совпадают.");
            return;
        }

        setLoading(true);

        try {
            const formData = new FormData();
            formData.append("old_password", oldPassword);
            formData.append("new_password1", newPassword1);
            formData.append("new_password2", newPassword2);

            const API_BASE = getBrowserApiBase();
            const res = await fetch(`${API_BASE}/api/change-password/`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "X-CSRFToken": getCookie("csrftoken") || "",
                    // Не указываем Content-Type — браузер сам добавит boundary для multipart/form-data
                },
                body: formData,
            });

            const data = await res.json();
            if (res.ok) {
                setSuccessShown(true);
                setTimeout(() => {
                    onClose();
                    router.push(`/${data.username}`);
                }, 2000);
            } else {
                setError(data.error || "Ошибка при смене пароля.");
            }
        } catch {
            setError("Ошибка сети.");
        } finally {
            setLoading(false);
        }
    }

    function getCookie(name: string): string | null {
        if (typeof document === "undefined") return null;
        const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
        return match ? match[2] : null;
    }

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[420px]">
                <DialogHeader>
                    <DialogTitle>Изменить пароль</DialogTitle>
                </DialogHeader>

                {successShown ? (
                    <div className="text-center text-green-600 py-4">Пароль успешно изменён ✅</div>
                ) : (
                    <div className="space-y-4">
                        <PasswordInput
                            id="old"
                            label="Текущий пароль"
                            value={oldPassword}
                            onChange={(e) => setOldPassword(e.target.value)}
                        />
                        <div className="text-right">
                            <Link
                                href="/auth/forgot-password"
                                className="text-xs text-muted-foreground underline"
                            >
                                забыли пароль?
                            </Link>
                        </div>

                        <PasswordInput
                            id="new1"
                            label="Новый пароль"
                            value={newPassword1}
                            onChange={(e) => setNewPassword1(e.target.value)}
                        />
                        <PasswordInput
                            id="new2"
                            label="Повторите пароль"
                            value={newPassword2}
                            onChange={(e) => setNewPassword2(e.target.value)}
                        />

                        {error && <div className="text-sm text-red-500 text-center">{error}</div>}

                        <Button onClick={handleSubmit} className="w-full" disabled={loading}>
                            {loading ? "Сохраняем..." : "Сменить пароль"}
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
