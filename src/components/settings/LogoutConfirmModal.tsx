"use client";

//import { Dialog, DialogContent } from "@/components/ui/dialog";
//import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Dialog, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useLayerStack } from "@/context/LayerStackContext";
import { getBrowserApiBase } from "@/lib/apiBase";
//import { getCookie } from "@/lib/utils";

export default function LogoutConfirmModal({
                                               open,
                                               onClose,
                                               username,
                                           }: {
    open: boolean;
    onClose: () => void;
    username: string;
}) {
    const { setAuthenticated, setProfile } = useAuth();
    const router = useRouter();
    const { clearScreens } = useLayerStack();

    function getCookie(name: string): string | null {
        if (typeof document === "undefined") return null;
        const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
        return match ? match[2] : null;
    }


    async function handleLogout() {
        try {
            const API_BASE = getBrowserApiBase();
            const res = await fetch(`${API_BASE}/api/logout/`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "X-CSRFToken": getCookie("csrftoken") || "",
                },
            });

            if (res.ok) {
                // 1. Закрываем все оверлеи перед выходом
                clearScreens();

                // 2. Сброс состояния авторизации
                setAuthenticated(false);
                setProfile(null);

                // 3. Жесткий редирект на /search
                router.replace("/search"); // <- ВАЖНО: replace, а не push
            } else {
                console.error("Logout failed");
            }
        } catch {
            console.error("Network error");
        }
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogPortal>
                {/* единый слой поверх всего */}
                <div className="fixed inset-0 z-[12000]">
                    <DialogOverlay className="fixed inset-0 bg-black/40" />
                    <DialogPrimitive.Content
                        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                     max-w-sm w-full bg-white rounded-xl p-6 shadow-lg focus:outline-none z-[13000]"
                    >
                        <h3 className="text-base font-semibold mb-2">Выйти из профиля?</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            Вы правда хотите покинуть профиль <span className="font-semibold">@{username}</span>?
                        </p>

                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                className="text-sm text-gray-600 hover:text-black"
                                onClick={onClose}
                            >
                                Отмена
                            </button>
                            <button
                                type="button"
                                className="text-sm font-semibold text-red-600 hover:text-red-700"
                                onClick={handleLogout}
                            >
                                Да, выйти
                            </button>
                        </div>
                    </DialogPrimitive.Content>
                </div>
            </DialogPortal>
        </Dialog>
    );

}
