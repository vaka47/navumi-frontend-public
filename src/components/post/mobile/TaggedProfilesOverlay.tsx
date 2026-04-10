'use client';

import React from 'react';
import SmartImage from '@/components/SmartImage';
import { absUrl } from '@/components/camp/campNormalize';
import Link from 'next/link';
import { ModalLayerPortal } from '@/components/ui/ModalLayerPortal';
import { useAuth } from '@/context/AuthContext';
import { useAppNavigation } from '@/hooks/useAppNavigation';

export type TaggedProfile = {
  id: number;
  username: string;
  avatar_url?: string | null;
};

const AVA_PH =
  (process.env.NEXT_PUBLIC_BASE_PATH || '') + '/avatars/question3.jpg';

export default function TaggedProfilesOverlay({
  open,
  items,
  onClose,
  onRequestUntagSelf,
  centered,
  skipPortal,
}: {
  open: boolean;
  items: TaggedProfile[];
  onClose: () => void;
  onRequestUntagSelf?: () => void;
  centered?: boolean;
  skipPortal?: boolean;
}) {
  const { profile } = useAuth();
  const me = profile?.username ?? null;
  const { navigateProfile } = useAppNavigation();

  const handleProfileClick = React.useCallback(
    (username: string, event: React.MouseEvent<HTMLAnchorElement>) => {
      navigateProfile(event, { username });
      // не закрываем модалку – оверлей профиля открывается поверх
    },
    [navigateProfile],
  );

  if (!open) return null;

  // если рендерим через LayerStack (skipPortal=true) – НЕ задаём свой z-index
  const baseZ = skipPortal ? '' : 'z-[2600]';

  const content = centered ? (
    <div
      className={`fixed inset-0 ${baseZ} flex items-center justify-center`}
      aria-modal
      role="dialog"
    >
      <button
        className="absolute inset-0 bg-black/40"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <div
        className="relative z-[2001] w-[min(420px,92vw)] max-h-[70vh] bg-white rounded-xl shadow-2xl border p-4 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium">Отмеченные профили</h3>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-gray-500 px-2 py-6 text-center">
            Никого не отметили.
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((u) => (
              <li key={u.id} className="py-2">
                <div className="flex items-center justify-between gap-2 hover:bg-gray-50 rounded-md px-2 py-1">
                  <Link
                    href={`/${u.username}`}
                    className="flex items-center gap-3 min-w-0"
                    onClick={(e) => handleProfileClick(u.username, e)}
                  >
                    <SmartImage
                      src={
                        absUrl(u.avatar_url || '') ||
                        u.avatar_url ||
                        AVA_PH
                      }
                      alt=""
                      width={36}
                      height={36}
                      className="rounded-full"
                      sizes="36px"
                    />
                    <span className="text-sm truncate">@{u.username}</span>
                  </Link>
                  {me && u.username === me && (
                    <button
                      type="button"
                      aria-label="Удалить отметку своего профиля"
                      className="ml-3 px-3 py-1 text-[13px] rounded-full border border-gray-200 hover:bg-gray-50 text-gray-700"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onClose();
                        onRequestUntagSelf?.();
                      }}
                    >
                      Удалить
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  ) : (
    <div
      className={`fixed inset-0 ${baseZ} bg-white flex flex-col`}
      role="dialog"
      aria-modal
    >
      <div className="h-[56px] flex items-center justify-between px-4 border-b border-gray-200">
        <div className="text-base font-medium">Отмеченные профили</div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
          aria-label="Закрыть"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="px-4 py-6 text-gray-500">Никого не отметили.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((u) => (
              <li key={u.id}>
                <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <Link
                    href={`/${u.username}`}
                    className="flex items-center gap-3 min-w-0"
                    onClick={(e) => handleProfileClick(u.username, e)}
                  >
                    <SmartImage
                      src={
                        absUrl(u.avatar_url || '') ||
                        u.avatar_url ||
                        AVA_PH
                      }
                      alt={`@${u.username}`}
                      width={32}
                      height={32}
                      className="rounded-full border border-gray-200"
                      sizes="32px"
                    />
                    <span className="text-[14px] truncate">
                      @{u.username}
                    </span>
                  </Link>
                  {me && u.username === me && (
                    <button
                      type="button"
                      aria-label="Удалить отметку своего профиля"
                      className="ml-3 px-3 py-1 text-[13px] rounded-full border border-gray-200 hover:bg-gray-50 text-gray-700"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onClose();
                        onRequestUntagSelf?.();
                      }}
                    >
                      Удалить
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  if (skipPortal) {
    return content;
  }

  return <ModalLayerPortal>{content}</ModalLayerPortal>;
}
