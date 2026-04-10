'use client';

import React from 'react';

type Props = {
  onShare: () => void;
  onReport: () => void;
  onBlockToggle: () => void;
  onRemoveFollower?: () => void;
  blockLabel: string;
  blockDestructive?: boolean;
  onClose: () => void;
  skipPortal?: boolean;
};

export default function ProfileActionsModal({
  onShare,
  onReport,
  onBlockToggle,
  onRemoveFollower,
  blockLabel,
  blockDestructive = true,
  onClose,
  skipPortal,
}: Props) {
  const baseZ = skipPortal ? '' : 'z-[20000]';

  return (
    <div
      className={`fixed inset-0 ${baseZ} bg-black/40 flex items-center justify-center px-4`}
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[min(540px,92vw)] rounded-[24px] bg-white shadow-xl overflow-hidden">
        <button className="w-full py-4 text-[17px] hover:bg-gray-50" onClick={onShare}>Поделиться профилем</button>
        <div className="h-px bg-gray-200" />
        {onRemoveFollower && (
          <>
            <button
              className="w-full py-4 text-[17px] font-semibold text-red-600 hover:bg-red-50"
              onClick={onRemoveFollower}
            >
              Отписать от себя
            </button>
            <div className="h-px bg-gray-200" />
          </>
        )}
        <button
          className={[
            'w-full py-4 text-[17px] font-semibold',
            blockDestructive ? 'text-red-600 hover:bg-red-50' : 'text-black hover:bg-gray-50',
          ].join(' ')}
          onClick={onBlockToggle}
        >
          {blockLabel}
        </button>
        <div className="h-px bg-gray-200" />
        <button className="w-full py-4 text-[17px] font-semibold text-red-600 hover:bg-red-50" onClick={onReport}>
          Пожаловаться
        </button>
        <div className="h-px bg-gray-200" />
        <button className="w-full py-4 text-[17px] hover:bg-gray-50" onClick={onClose}>Отмена</button>
      </div>
    </div>
  );
}
