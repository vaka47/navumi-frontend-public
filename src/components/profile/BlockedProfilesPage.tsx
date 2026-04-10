'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import SmartImage from '@/components/SmartImage';
import { useLayerStack } from '@/context/LayerStackContext';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';
import { navigateBack } from '@/lib/navBack';
import { acquireHideHeader, releaseHideHeader } from '@/lib/headerVisibility';
import { getBrowserApiBase } from '@/lib/apiBase';
import StackConfirmModal from '@/components/ui/StackConfirmModal';

type BlockedProfile = {
  id: number;
  username: string;
  full_name?: string | null;
  club_name?: string | null;
  profile_picture?: string | null;
  avatar_url?: string | null;
};

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.split('; ').find(x => x.startsWith(name + '='));
  return m ? decodeURIComponent(m.split('=')[1]) : '';
}

export default function BlockedProfilesPage() {
  const API = getBrowserApiBase();
  const router = useRouter();
  const { isOverlay, close: closeOverlay } = useOverlayEnvironment();
  const { openModal, closeModal } = useLayerStack();

  const [items, setItems] = React.useState<BlockedProfile[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const abs = React.useCallback((u?: string | null) => (u ? (u.startsWith('http') ? u : `${API}${u}`) : null), [API]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const candidates = [
          `${API}/api/blocked-profiles/`,
        ];
        type UnknownRecord = Record<string, unknown>;
        let list: BlockedProfile[] = [];
        for (const url of candidates) {
          let r: Response | null = null;
          try { r = await fetch(url, { credentials: 'include', cache: 'no-store' }); } catch { r = null; }
          if (!r || !r.ok) continue;
          const j: UnknownRecord = await r.json().catch(() => ({} as UnknownRecord));
          const root = j as { profiles?: unknown };
          const arr = (Array.isArray(root.profiles) ? root.profiles : []) as UnknownRecord[];
          if (arr.length) {
            list = arr.map((u) => ({
              id: Number(u.id),
              username: String(u.username),
              full_name: (u.full_name as string | null | undefined) ?? null,
              club_name: (u.club_name as string | null | undefined) ?? null,
              avatar_url: (u.avatar_url as string | null | undefined) ?? (u.profile_picture as string | null | undefined) ?? null,
              profile_picture: (u.profile_picture as string | null | undefined) ?? (u.avatar_url as string | null | undefined) ?? null,
            }));
            break;
          }
        }
        if (alive) setItems(list);
      } catch {
        if (alive) setError('Не удалось загрузить список');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [API]);

  React.useEffect(() => {
    try { console.warn('[BlockedProfiles] mount'); } catch { /* noop */ }
    acquireHideHeader();
    return () => { releaseHideHeader(); };
  }, []);

  React.useEffect(() => {
    return () => {
      try { console.warn('[BlockedProfiles] unmount'); } catch { /* noop */ }
    };
  }, [closeModal]);

  const close = () => {
    try { console.warn('[BlockedProfiles] close:trigger', { isOverlay }); } catch { /* noop */ }
    if (isOverlay) {
      closeOverlay();
      return;
    }
    navigateBack(router, { fallback: '/' });
  };

  const unblock = async (user: BlockedProfile) => {
    const headers = {
      'Content-Type': 'application/json',
      'X-CSRFToken': getCookie('csrftoken'),
    };
    const candidates: Array<{ url: string; body?: Record<string, unknown> | null }> = [
      { url: `${API}/api/profile/${encodeURIComponent(user.username)}/unblock/` },
      { url: `${API}/api/unblock-profile/`, body: { profile_id: user.id, username: user.username } },
    ];

    let ok = false;
    for (const c of candidates) {
      try {
        const r = await fetch(c.url, {
          method: 'POST',
          credentials: 'include',
          headers,
          body: c.body ? JSON.stringify(c.body) : undefined,
        });
        if (r.ok) { ok = true; break; }
      } catch { /* noop */ }
    }

    if (!ok) {
      setError('Не удалось разблокировать пользователя');
      return;
    }
    setItems(prev => prev.filter(p => p.username !== user.username));
  };

  const confirmUnblock = (user: BlockedProfile) => {
    let modalId: string | null = null;
    const node = (
      <StackConfirmModal
        title="Уверены, что хотите разблокировать пользователя?"
        cancelLabel="Отмена"
        confirmLabel="Разблокировать"
        onCancel={() => {
          try { console.warn('[BlockedProfiles] unblockConfirm:cancel', { id: modalId, username: user.username }); } catch { /* noop */ }
          if (modalId) closeModal(modalId);
        }}
        onConfirm={() => {
          try { console.warn('[BlockedProfiles] unblockConfirm:confirm', { id: modalId, username: user.username }); } catch { /* noop */ }
          return unblock(user);
        }}
      />
    );
    modalId = openModal({
      node,
      zIndex: 6500,
      onClose: () => {
        try { console.warn('[BlockedProfiles] unblockConfirm:onClose', { id: modalId, username: user.username }); } catch { /* noop */ }
      },
    });
    try { console.warn('[BlockedProfiles] unblockConfirm:open', { id: modalId, username: user.username }); } catch { /* noop */ }
  };

  return (
    <section className="bg-white min-h-[100dvh]">
      <div className="fixed top-0 left-0 right-0 z-20 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b border-gray-200">
        <div className="max-w-4xl mx-auto">
          <div className="h-12 flex items-center justify-between px-4">
            <div className="text-base font-semibold">Заблокированные профили</div>
            <button className="h-10 px-3 rounded-full text-gray-600 hover:bg-gray-100" onClick={close} aria-label="Закрыть">×</button>
          </div>
        </div>
      </div>

      <div className="pt-12">
        <div className="max-w-4xl mx-auto">
          <div className="py-2">
            {loading && <div className="py-4 text-sm text-gray-500 text-center">Загружаем…</div>}
            {error && <div className="py-4 text-sm text-red-600 text-center">{error}</div>}
            {!loading && !error && items.length === 0 && (
              <div className="py-8 text-center text-sm text-gray-500">Заблокированных профилей не найдено</div>
            )}

            <ul className="divide-y divide-gray-100">
              {items.map(u => {
                const primary = u.username;
                const secondary = (u.full_name || u.club_name || `@${u.username}`);
                const avatar = abs(u.profile_picture || u.avatar_url) || '/avatars/question.jpg';
                return (
                  <li key={u.id}>
                    <div className="flex items-center justify-between gap-3 py-2 px-4">
                      <div className="flex items-center gap-3 min-w-0 flex-1 text-left">
                        <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-100 border">
                          <SmartImage src={avatar} alt="" fill className="object-cover" sizes="40px" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{primary}</div>
                          <div className="text-xs text-gray-500 truncate">{secondary}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 px-4 py-2 text-sm rounded-full border border-gray-300 text-gray-800 hover:bg-gray-50"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          try { console.warn('[BlockedProfiles] unblock:click', { username: u.username }); } catch { /* noop */ }
                          confirmUnblock(u);
                        }}
                      >
                        Разблокировать
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
