'use client';

import React from 'react';
import { Info, HeartHandshake, Mail, Shield, XCircle } from 'lucide-react';
import { useAboutOverlay } from '@/hooks/useAboutOverlay';
import { useSupportOverlay } from '@/hooks/useSupportOverlay';
import { useResponsibilityOverlay } from '@/hooks/useResponsibilityOverlay';
import { useContactsOverlay } from '@/hooks/useContactsOverlay';
import { ModalLayerPortal } from '@/components/ui/ModalLayerPortal';

type Props = {
  open: boolean;
  onClose: () => void;
  skipPortal?: boolean;
};

export default function GuestMenuModal({
  open,
  onClose,
  skipPortal,
}: Props) {
  const openAboutOverlay = useAboutOverlay();
  const openSupportOverlay = useSupportOverlay();
  const openResponsibilityOverlay = useResponsibilityOverlay();
  const openContactsOverlay = useContactsOverlay();

  if (!open) return null;

  // если рендерим через LayerStack (skipPortal=true) – НЕ задаём свой z-index
  const baseZ = skipPortal ? '' : 'z-[2500]';

  const body = (
    <div
      className={`fixed inset-0 ${baseZ} bg-black/40 flex items-center justify-center px-4`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-[min(540px,92vw)] rounded-[24px] bg-white shadow-xl overflow-hidden">
        <button
          type="button"
          className="block w-full py-4 text-[17px] hover:bg-gray-50"
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
          className="block w-full py-4 text-[17px] font-semibold hover:bg-gray-50"
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
          className="block w-full py-4 text-[17px] hover:bg-gray-50"
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
          className="block w-full py-4 text-[17px] hover:bg-gray-50"
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
          className="block w-full py-4 text-[17px] text-red-600 hover:bg-red-50"
          onClick={onClose}
        >
          <span className="inline-flex items-center justify-center gap-2 w-full">
            <XCircle className="w-5 h-5 text-red-500" />
            <span>Закрыть</span>
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

