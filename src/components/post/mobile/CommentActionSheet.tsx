'use client';

import React from 'react';
import { ModalLayerPortal } from '@/components/ui/ModalLayerPortal';

export default function CommentActionSheet({
  open,
  canReport,
  canDelete,
  onClose,
  onReport,
  onDelete,
  skipPortal,
}: {
  open: boolean;
  canReport?: boolean;
  canDelete?: boolean;
  onClose: () => void;
  onReport?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  skipPortal?: boolean;
}) {
  if (!open) return null;

  const doAndClose =
    (fn?: () => void | Promise<void>) =>
    async () => {
      try {
        await fn?.();
      } finally {
        onClose();
      }
    };

  const node = (
    <div
      className={`fixed inset-0 ${skipPortal ? '' : 'z-[2600]'} bg-black/40 flex items-center justify-center px-4`}
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-[min(540px,92vw)] rounded-[24px] bg-white shadow-xl overflow-hidden">
        {canReport && (
          <>
            <button
              className="w-full py-4 text-[17px] font-semibold text-red-600 hover:bg-red-50"
              onClick={doAndClose(onReport)}
            >
              Пожаловаться
            </button>
            {canDelete && <div className="h-px bg-gray-200" />}
          </>
        )}
        {canDelete && (
          <>
            <button
              className="w-full py-4 text-[17px] font-semibold text-red-600 hover:bg-red-50"
              onClick={doAndClose(onDelete)}
            >
              Удалить
            </button>
            <div className="h-px bg-gray-200" />
          </>
        )}
        <button
          className="w-full py-4 text-[17px] hover:bg-gray-50"
          onClick={onClose}
        >
          Отмена
        </button>
      </div>
    </div>
  );

  if (skipPortal) {
    return node;
  }

  return <ModalLayerPortal>{node}</ModalLayerPortal>;
}

