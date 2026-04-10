    "use client";

    import { useEffect, useState } from "react";
    import ChangePasswordModal from "./ChangePasswordModal";
    import DeleteProfileModal from "./DeleteProfileModal";
    import type { ProfileData } from "@/types/profile";
    import { useAuth } from '@/context/AuthContext';
    import { disableTelegramNotifications, startTelegramLinkFlow } from '@/lib/telegramNotifications';
    import { useBlockedProfilesOverlay } from '@/hooks/useBlockedProfilesOverlay';
    import { ModalLayerPortal } from '@/components/ui/ModalLayerPortal';

    export default function ProfileSettingsModal({
                                                     isOpen,
                                                     onClose,
                                                     currentProfile,
                                                 }: {
        isOpen: boolean;
        onClose: () => void;
        currentProfile: ProfileData;
    }) {
        const [showPasswordModal, setShowPasswordModal] = useState(false);
        const [deleteModalOpen, setDeleteModalOpen] = useState(false);
        const [blockedOverlayOpen, setBlockedOverlayOpen] = useState(false);
        const { telegramNotificationsEnabled, setTelegramNotificationsEnabled } = useAuth();
        const blockedProfilesOverlay = useBlockedProfilesOverlay();

        useEffect(() => {
            if (!isOpen) return;
            const className = "profile-settings-open";
            document.body.classList.add(className);
            return () => {
                document.body.classList.remove(className);
            };
        }, [isOpen]);

        const handleEnableTelegram = async () => {
            await startTelegramLinkFlow();
        };

        const handleDisableTelegram = async () => {
            const confirmDisable = window.confirm('Вы уверены, что хотите отключить уведомления в Telegram?');
            if (!confirmDisable) return;
            const ok = await disableTelegramNotifications();
            if (ok) {
                setTelegramNotificationsEnabled(false);
            }
        };





        if (!isOpen) return null;

        return (
            <>
                <ModalLayerPortal>
                    <div
                        className="fixed inset-0 z-[4000] bg-black/40 flex items-center justify-center px-4"
                        role="dialog"
                        aria-modal="true"
                        onClick={(e) => {
                            if (blockedOverlayOpen) return;
                            if (e.target === e.currentTarget) onClose();
                        }}
                    >
                        <div className="w-[min(560px,92vw)] rounded-[22px] bg-white shadow-xl overflow-hidden">

                            <button
                                className="w-full py-4 text-[17px] hover:bg-gray-50"
                                onClick={() => setShowPasswordModal(true)}
                            >
                                Изменить пароль
                            </button>
                            <div className="h-px bg-gray-200" />

                            {telegramNotificationsEnabled ? (
                                <>
                                    <button
                                        className="w-full py-4 text-[17px] hover:bg-gray-50"
                                        onClick={handleDisableTelegram}
                                    >
                                        Отключить уведомления в Telegram
                                    </button>
                                    <div className="h-px bg-gray-200" />
                                </>
                            ) : (
                                <>
                                    <button
                                        className="w-full py-4 text-[17px] hover:bg-gray-50"
                                        onClick={handleEnableTelegram}
                                    >
                                        Включить уведомления в Telegram
                                    </button>
                                    <div className="h-px bg-gray-200" />
                                </>
                            )}

                            <button
                                className="w-full py-4 text-[17px] hover:bg-gray-50"
                                onClick={() => {
                                    setBlockedOverlayOpen(true);
                                    blockedProfilesOverlay.open({
                                        onClose: () => setBlockedOverlayOpen(false),
                                    });
                                }}
                            >
                                Заблокированные профили
                            </button>
                            <div className="h-px bg-gray-200" />

                            <button
                                disabled
                                className="w-full py-4 text-[17px] text-gray-400 cursor-not-allowed"
                            >
                                Изменить email (в разработке)
                            </button>
                            <div className="h-px bg-gray-200" />

                            <button
                                className="w-full py-4 text-[17px] font-semibold text-red-600 hover:bg-red-50"
                                onClick={() => setDeleteModalOpen(true)}
                            >
                                Удалить профиль
                            </button>
                            <div className="h-px bg-gray-200" />

                            <button className="w-full py-4 text-[17px] hover:bg-gray-50" onClick={onClose}>
                                Назад
                            </button>
                        </div>
                    </div>
                </ModalLayerPortal>

                {showPasswordModal && (
                    <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
                )}
                {deleteModalOpen && (
                    <DeleteProfileModal
                        isOpen={deleteModalOpen}
                        onClose={() => setDeleteModalOpen(false)}
                        currentProfile={currentProfile}
                    />
                )}

            </>
        );
    }
