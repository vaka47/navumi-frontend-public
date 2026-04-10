'use client';

import React from 'react';

type StackConfirmModalProps = {
  title: string;
  message?: React.ReactNode;
  cancelLabel?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export default function StackConfirmModal({
  title,
  message,
  cancelLabel = 'Отмена',
  confirmLabel = 'Да',
  destructive = true,
  onCancel,
  onConfirm,
}: StackConfirmModalProps) {
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!busy && e.key === 'Escape') onCancel();
      if (!busy && (e.key === 'Enter' || e.key === 'NumpadEnter')) {
        e.preventDefault();
        void handleConfirm();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  const handleConfirm = async () => {
    try {
      setBusy(true);
      await onConfirm();
      onCancel();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (!busy && e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-lg">
        <h2 className="text-base font-semibold mb-2">{title}</h2>
        {message && <p className="text-sm text-gray-600 mb-4">{message}</p>}
        <div className="flex justify-end gap-3">
          <button className="text-sm text-gray-600 hover:text-black" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            className={[
              'text-sm font-semibold',
              destructive ? 'text-red-600 hover:text-red-700' : 'text-black hover:text-black/80',
            ].join(' ')}
            onClick={handleConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
