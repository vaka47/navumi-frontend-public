'use client';

import React from 'react';
import { Pencil, Settings, UserPlus, Users, Info, HeartHandshake, Mail, Shield, LogOut, XCircle } from 'lucide-react';
import { useAboutOverlay } from '@/hooks/useAboutOverlay';
import { useSupportOverlay } from '@/hooks/useSupportOverlay';
import { useResponsibilityOverlay } from '@/hooks/useResponsibilityOverlay';
import { useContactsOverlay } from '@/hooks/useContactsOverlay';
import { ModalLayerPortal } from '@/components/ui/ModalLayerPortal';
import { useRouter } from 'next/navigation';
import { useLayerStack } from '@/context/LayerStackContext';

type Props = {
  open: boolean;
  onClose: () => void;
  // actions
  onEdit: () => void;
  onSettings: () => void;
  onLogout: () => void;
  // profile switches
  hasClientProfile: boolean;
  hasClubProfile: boolean;
  otherProfileUsername?: string | null;
  onSwitchOther?: () => void;
  skipPortal?: boolean;
};

// Instagram-like action sheet centered with rounded corners
export default function ProfileMenuModal({
  open,
  onClose,
  onEdit,
  onSettings,
  onLogout,
  hasClientProfile,
  hasClubProfile,
  otherProfileUsername,
  onSwitchOther,
  skipPortal,
}: Props) {
  const router = useRouter();
  const { clearScreens, screens } = useLayerStack();
  const openAboutOverlay = useAboutOverlay();
  const openSupportOverlay = useSupportOverlay();
  const openResponsibilityOverlay = useResponsibilityOverlay();
  const openContactsOverlay = useContactsOverlay();
  
  const handleAddProfile = (type: 'client' | 'club') => {
    // eslint-disable-next-line no-console
    console.log('[ProfileMenuModal] handleAddProfile:clicked', {
      type,
      screensCount: screens.length,
    });
    onClose();
    // закрываем все экраны-оверлеи
    try {
      // eslint-disable-next-line no-console
      console.log('[ProfileMenuModal] handleAddProfile:clearScreens:before', {
        screensCount: screens.length,
      });
      clearScreens();
      // eslint-disable-next-line no-console
      console.log('[ProfileMenuModal] handleAddProfile:clearScreens:after');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ProfileMenuModal] handleAddProfile:clearScreens:error', err);
    }

    const isMobile =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(max-width: 768px)').matches;

    const href = type === 'client'
      ? (isMobile ? '/auth/create-client-profile/mobile?second=1' : '/auth/create-client-profile?second=1')
      : (isMobile ? '/auth/create-club-profile/mobile?second=1' : '/auth/create-club-profile?second=1');

    // eslint-disable-next-line no-console
    console.log('[ProfileMenuModal] handleAddProfile:navigate:computed', {
      type,
      isMobile,
      href,
    });

    // Небольшая задержка, чтобы оверлеи успели закрыться визуально
    setTimeout(() => {
      try {
        // eslint-disable-next-line no-console
        console.log('[ProfileMenuModal] handleAddProfile:navigate:router.push', { href });
        router.push(href);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[ProfileMenuModal] handleAddProfile:navigate:error', error);
        try {
          // eslint-disable-next-line no-console
          console.log('[ProfileMenuModal] handleAddProfile:navigate:fallback:location.href', { href });
          window.location.href = href;
        } catch (fallbackError) {
          // eslint-disable-next-line no-console
          console.error('[ProfileMenuModal] handleAddProfile:navigate:fallback:error', fallbackError);
        }
      }
    }, 120);
  };

  if (!open) return null;

  const closeAfter = (fn?: () => void) => () => {
    try { fn?.(); } finally { onClose(); }
  };

  // если рендерим через LayerStack (skipPortal=true) – НЕ задаём свой z-index
  const baseZ = skipPortal ? '' : 'z-[2500]';

  const body = (
    <div
      className={`profile-menu-modal fixed inset-0 ${baseZ} bg-black/40 flex items-center justify-center px-4`}
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[min(560px,92vw)] rounded-[22px] bg-white shadow-xl overflow-hidden">
        <button className="w-full py-4 text-[17px] hover:bg-gray-50" onClick={closeAfter(onEdit)}>
          <span className="inline-flex items-center justify-center gap-2">
            <Pencil className="w-5 h-5 text-blue-600" />
            <span>Редактировать профиль</span>
          </span>
        </button>
        <div className="h-px bg-gray-200" />
        <button className="w-full py-4 text-[17px] hover:bg-gray-50" onClick={onSettings}>
          <span className="inline-flex items-center justify-center gap-2">
            <Settings className="w-5 h-5 text-blue-600" />
            <span>Настройки аккаунта</span>
          </span>
        </button>
        <div className="h-px bg-gray-200" />

        {/* Switch or create second profile */}
        {(!hasClientProfile || !hasClubProfile) ? (
          <>
            {!hasClientProfile && (
              <>
                <button onClick={() => handleAddProfile('client')} className="block w-full py-4 text-[17px] hover:bg-gray-50">
                  <span className="inline-flex items-center justify-center gap-2 w-full">
                    <UserPlus className="w-5 h-5 text-blue-600" />
                    <span>Добавить профиль клиента</span>
                  </span>
                </button>
                <div className="h-px bg-gray-200" />
              </>
            )}
            {!hasClubProfile && (
              <>
                <button onClick={() => handleAddProfile('club')} className="block w-full py-4 text-[17px] hover:bg-gray-50">
                  <span className="inline-flex items-center justify-center gap-2 w-full">
                    <Users className="w-5 h-5 text-blue-600" />
                    <span>Добавить профиль клуба</span>
                  </span>
                </button>
                <div className="h-px bg-gray-200" />
              </>
            )}
          </>
        ) : (
          <>
            <button className="w-full py-4 text-[17px] hover:bg-gray-50" onClick={closeAfter(onSwitchOther)}>
              <span className="inline-flex items-center justify-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                <span>{otherProfileUsername ? `Зайти как ${otherProfileUsername}` : 'Переключить профиль'}</span>
              </span>
            </button>
            <div className="h-px bg-gray-200" />
          </>
        )}

        {/* Static links */}
        <button
          type="button"
          className="w-full py-4 text-[17px] hover:bg-gray-50"
          onClick={() => {
            openAboutOverlay();
            // не закрываем модалку – оверлей открывается поверх
          }}
        >
          <span className="inline-flex items-center justify-center gap-2 w-full">
            <Info className="w-5 h-5 text-blue-600" />
            <span>О проекте</span>
          </span>
        </button>
        <div className="h-px bg-gray-200" />
        <button
          type="button"
          className="w-full py-4 text-[17px] font-bold hover:bg-gray-50"
          onClick={() => {
            openSupportOverlay();
            // не закрываем модалку – оверлей открывается поверх
          }}
        >
          <span className="inline-flex items-center justify-center gap-2 w-full">
            <HeartHandshake className="w-5 h-5 text-blue-600" />
            <span>Поддержать проект</span>
          </span>
        </button>
        <div className="h-px bg-gray-200" />
        <button
          type="button"
          className="w-full py-4 text-[17px] hover:bg-gray-50"
          onClick={() => {
            openContactsOverlay();
            // не закрываем модалку – оверлей открывается поверх
          }}
        >
          <span className="inline-flex items-center justify-center gap-2 w-full">
            <Mail className="w-5 h-5 text-blue-600" />
            <span>Контакты</span>
          </span>
        </button>
        <div className="h-px bg-gray-200" />
        <button
          type="button"
          className="w-full py-4 text-[17px] hover:bg-gray-50"
          onClick={() => {
            openResponsibilityOverlay();
            // не закрываем модалку – оверлей открывается поверх
          }}
        >
          <span className="inline-flex items-center justify-center gap-2 w-full">
            <Shield className="w-5 h-5 text-blue-600" />
            <span>Ответственность</span>
          </span>
        </button>
        <div className="h-px bg-gray-200" />

        <button
          className="w-full py-4 text-[17px] font-semibold text-red-600 hover:bg-red-50"
          onClick={closeAfter(onLogout)}
        >
          <span className="inline-flex items-center justify-center gap-2">
            <LogOut className="w-5 h-5 text-red-600" />
            <span>Выйти</span>
          </span>
        </button>
        <div className="h-px bg-gray-200" />
        <button className="w-full py-4 text-[17px] hover:bg-gray-50" onClick={onClose}>
          <span className="inline-flex items-center justify-center gap-2">
            <XCircle className="w-5 h-5 text-red-500" />
            <span>Отмена</span>
          </span>
        </button>
      </div>
    </div>
  );

  if (skipPortal) {
    return body;
  }

  return <ModalLayerPortal>{body}</ModalLayerPortal>;
}
