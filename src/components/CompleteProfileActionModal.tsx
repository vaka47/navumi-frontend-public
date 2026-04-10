'use client';

import { useRouter } from 'next/navigation';
import { useLayerStack } from '@/context/LayerStackContext';
import { ModalLayerPortal } from '@/components/ui/ModalLayerPortal';

interface CompleteProfileActionModalProps {
    open: boolean;
    onClose: () => void;
}

export default function CompleteProfileActionModal({ open, onClose }: CompleteProfileActionModalProps) {
    const router = useRouter();
    const { clearScreens, screens } = useLayerStack();

    const handleContinue = () => {
        onClose();
        // Закрываем все оверлеи перед редиректом
        if (screens.length > 0) {
            clearScreens();
        }
        // Небольшая задержка, чтобы модалка и оверлеи успели закрыться перед редиректом
        setTimeout(() => {
            router.push('/auth/choose-role');
        }, 150);
    };

    if (!open) return null;

    return (
        <ModalLayerPortal>
            <div className="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center px-4">
                <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-lg">
                    <h2 className="text-xl font-semibold text-center mb-2">
                        Завершите создание профиля
                    </h2>
                    <p className="text-sm text-gray-600 text-center mb-6">
                        Это действие будет доступно после создания профиля. Продолжите создание профиля.
                    </p>
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={handleContinue}
                            className="w-full bg-black text-white py-2 rounded-full hover:bg-black/80 transition"
                        >
                            Продолжить регистрацию
                        </button>
                        <button
                            onClick={onClose}
                            className="w-full border border-gray-300 text-gray-700 py-2 rounded-full hover:bg-gray-50 transition"
                        >
                            Отмена
                        </button>
                    </div>
                </div>
            </div>
        </ModalLayerPortal>
    );
}
