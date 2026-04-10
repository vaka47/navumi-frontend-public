'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function CompleteProfileModal() {
    const { authenticated, profile } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    // Не показываем модалку на страницах регистрации и выбора роли
    const isOnAuthPage = pathname?.startsWith('/auth/') || false;

    useEffect(() => {
        // Показываем модалку, если пользователь аутентифицирован, но у него нет профиля
        // и мы не на страницах регистрации
        if (authenticated && !profile && !isOnAuthPage) {
            setOpen(true);
        } else {
            setOpen(false);
        }
    }, [authenticated, profile, isOnAuthPage]);

    const handleContinue = () => {
        setOpen(false);
        router.push('/auth/choose-role');
    };

    const handleClose = () => {
        setOpen(false);
    };

    if (!authenticated || profile || isOnAuthPage || !open) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center px-4">
            <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-lg">
                <h2 className="text-xl font-semibold text-center mb-2">
                    Завершите создание профиля
                </h2>
                <p className="text-sm text-gray-600 text-center mb-6">
                    Вы подтвердили email, но еще не создали профиль. 
                    Продолжите регистрацию, чтобы начать пользоваться приложением.
                </p>
                <div className="flex flex-col gap-3">
                    <button
                        onClick={handleContinue}
                        className="w-full bg-black text-white py-2 rounded-full hover:bg-black/80 transition"
                    >
                        Продолжить регистрацию
                    </button>
                    <button
                        onClick={handleClose}
                        className="w-full border border-gray-300 text-gray-700 py-2 rounded-full hover:bg-gray-50 transition"
                    >
                        Позже
                    </button>
                </div>
            </div>
        </div>
    );
}
