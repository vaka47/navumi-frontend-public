"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getBrowserApiBase } from "@/lib/apiBase";

export default function Logout() {
    const router = useRouter();
    const API_BASE = getBrowserApiBase();

    useEffect(() => {
        async function logoutUser() {
            try {
                await fetch(`${API_BASE}/api/logout/`, {
                    method: "POST",
                    credentials: "include",
                });
            } catch (err) {
                console.error("Ошибка при выходе:", err);
            } finally {
                router.push("/");
            }
        }

        logoutUser();
    }, [router, API_BASE]);

    return <p>Выход...</p>;
}
