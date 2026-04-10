'use client';

import React from 'react';
import { ModalLayerPortal } from '@/components/ui/ModalLayerPortal';

type ConfirmModalProps = {
  open: boolean;
  title?: string;
  message?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  destructive?: boolean;
  variant?: 'default' | 'simple';
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export default function ConfirmModal({
  open,
  title = 'Подтвердите действие',
  message,
  cancelLabel = 'Отмена',
  confirmLabel = 'ОК',
  destructive = false,
  variant = 'default',
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  if (!open) return null;

  const doAndClose = async () => {
    try { await onConfirm?.(); } finally { /* parent closes itself */ }
  };

  if (variant === 'simple') {
    return (
      <ModalLayerPortal>
        <div className="fixed inset-0 z-[20000] bg-black/40 flex items-center justify-center px-4" role="dialog" aria-modal>
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-lg">
            <h2 className="text-base font-semibold mb-2">{title}</h2>
            {message && <p className="text-sm text-gray-600 mb-4">{message}</p>}
            <div className="flex justify-end gap-3">
              <button className="text-sm text-gray-600 hover:text-black" onClick={onCancel}>{cancelLabel}</button>
              <button className="text-sm font-semibold text-red-600 hover:text-red-700" onClick={doAndClose}>{confirmLabel}</button>
            </div>
          </div>
        </div>
      </ModalLayerPortal>
    );
  }

  return (
    <ModalLayerPortal>
      <div className="fixed inset-0 z-[20000] bg-black/40 flex items-center justify-center px-4" role="dialog" aria-modal>
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="text-base font-semibold">{title}</div>
          </div>
          {message && (
            <div className="px-5 py-4 text-sm text-gray-700">{message}</div>
          )}
          <div className="px-4 py-3 flex gap-2 justify-end">
            <button
              type="button"
              className="px-4 py-2 text-sm rounded-full hover:bg-gray-100"
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className={[
                'px-4 py-2 text-sm rounded-full text-white',
                destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-black hover:bg-black/85',
              ].join(' ')}
              onClick={doAndClose}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </ModalLayerPortal>
  );
}
