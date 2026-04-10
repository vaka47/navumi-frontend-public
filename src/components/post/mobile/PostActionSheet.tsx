'use client';

import React from 'react';
import { ModalLayerPortal } from '@/components/ui/ModalLayerPortal';

type Action = { label: string; onClick: () => void; destructive?: boolean };

export type PostActionSheetProps = {
  open: boolean;
  onClose: () => void;
  actions: Action[];
};

export default function PostActionSheet({ open, onClose, actions }: PostActionSheetProps) {
  if (!open) return null;

  return (
    <ModalLayerPortal>
      <div
        className="fixed inset-0 z-[40000] bg-black/40 flex items-center justify-center px-4"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="w-[min(540px,92vw)] rounded-[24px] bg-white shadow-xl overflow-hidden">
          {actions.map((a, i) => (
            <React.Fragment key={i}>
              <button
                className={[
                  'w-full py-4 text-[17px] font-semibold',
                  a.destructive ? 'text-red-600 hover:bg-red-50' : 'hover:bg-gray-50',
                ].join(' ')}
                onClick={() => { try { a.onClick(); } finally { onClose(); } }}
              >
                {a.label}
              </button>
              {i < actions.length - 1 && <div className="h-px bg-gray-200" />}
            </React.Fragment>
          ))}
          <div className="h-px bg-gray-200" />
          <button className="w-full py-4 text-[17px] hover:bg-gray-50" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </ModalLayerPortal>
  );
}
