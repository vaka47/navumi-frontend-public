'use client';

import React from 'react';
import SmartImage from '@/components/SmartImage';
import { absUrl } from '@/components/camp/campNormalize';
import Link from 'next/link';
import { ModalLayerPortal } from '@/components/ui/ModalLayerPortal';
import { useAppNavigation } from '@/hooks/useAppNavigation';
import { getBrowserApiBase } from '@/lib/apiBase';

type SimpleUser = { id: number; username: string; avatar?: string | null };

const API_BASE = getBrowserApiBase();
const AVA_PH =
  (process.env.NEXT_PUBLIC_BASE_PATH || '') + '/avatars/question3.jpg';

function normalizeUsers(j: unknown): SimpleUser[] {
  const pickArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const asRecord = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

  let root: unknown[] = [];
  if (Array.isArray(j)) {
    root = j as unknown[];
  } else if (j && typeof j === 'object') {
    const rec = asRecord(j);
    root =
      pickArray(rec['results']) ||
      pickArray(rec['users']) ||
      pickArray(rec['items']) ||
      pickArray(rec['likers']) ||
      pickArray(rec['liked_by']) ||
      pickArray(rec['likes']);
  }

  return root
    .map((v, i) => {
      const it = asRecord(v);
      const idRaw = it['id'];
      const id = typeof idRaw === 'number' ? idRaw : Number(idRaw ?? i + 1);

      const uname =
        (typeof it['username'] === 'string' && it['username']) ||
        (typeof it['user'] === 'string' ? (it['user'] as string) : '');

      const avatarCandidate =
        (it['avatar_url'] ??
          it['avatar'] ??
          it['profile_picture']) as unknown;
      const avatar =
        typeof avatarCandidate === 'string' ? avatarCandidate : null;

      return { id, username: uname, avatar } as SimpleUser;
    })
    .filter((u) => !!u.username);
}

export default function LikersOverlay({
  open,
  postId,
  onClose,
  centered,
  skipPortal,
}: {
  open: boolean;
  postId: number;
  onClose: () => void;
  centered?: boolean;
  skipPortal?: boolean;
}) {
  const [items, setItems] = React.useState<SimpleUser[] | null>(null);
  const [err, setErr] = React.useState('');
  const { navigateProfile } = useAppNavigation();

  React.useEffect(() => {
    if (!open || !postId) return;
    let cancelled = false;

    (async () => {
      setItems(null);
      setErr('');
      try {
        const url = `${API_BASE}/api/posts/${postId}/engagement/`;
        let r = await fetch(url, {
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (!r.ok && (r.status === 401 || r.status === 403)) {
          r = await fetch(url, {
            credentials: 'omit',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
          });
        }
        if (!r.ok) throw new Error('Не удалось загрузить');
        const j: unknown = await r.json();
        const root = (j ?? {}) as Record<string, unknown>;

        const postObj =
          typeof root['post'] === 'object' && root['post'] !== null
            ? (root['post'] as Record<string, unknown>)
            : null;

        const candidates: unknown[] = [
          root['post_likers'],
          root['post_likes'],
          root['liked_by'],
          postObj?.['likers'],
          postObj?.['likes'],
        ].filter(Boolean);

        let users: SimpleUser[] = [];
        for (const v of candidates) {
          const arr = normalizeUsers(v);
          if (arr.length) {
            users = arr;
            break;
          }
        }
        if (!cancelled) setItems(users);
      } catch {
        if (!cancelled) {
          setErr('Не удалось загрузить список');
          setItems([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, postId]);

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
        className="relative z-[50001] w-[min(420px,92vw)] max-h-[70vh] bg-white rounded-xl shadow-2xl border p-4 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium">Оценили</h3>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>
        {items === null ? (
          <p className="text-sm text-gray-500 px-2 py-6 text-center">
            Загрузка…
          </p>
        ) : err ? (
          <p className="text-sm text-red-600 px-2 py-6 text-center">
            {err}
          </p>
        ) : (items?.length ?? 0) > 0 ? (
          <ul className="divide-y">
            {items!.map((u, i) => (
              <li key={u.username + i} className="py-2">
                <Link
                  href={`/${u.username}`}
                  className="flex items-center gap-3 hover:bg-gray-50 rounded-md px-2 py-1"
                  onClick={(e) => handleProfileClick(u.username, e)}
                >
                  <SmartImage
                    src={
                      absUrl(u.avatar || '') ||
                      u.avatar ||
                      AVA_PH
                    }
                    alt=""
                    width={36}
                    height={36}
                    className="rounded-full"
                    sizes="36px"
                  />
                  <span className="text-sm font-medium">@{u.username}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500 px-2 py-6 text-center">
            Пока никто не лайкнул.
          </p>
        )}
      </div>
    </div>
  ) : (
    <div
      className={`${skipPortal ? 'absolute' : 'fixed'} inset-0 ${baseZ} bg-white flex flex-col`}
      role="dialog"
      aria-modal
    >
      <div className="h-[56px] flex items-center justify-between px-4 border-b border-gray-200">
        <div className="text-base font-medium">Оценили</div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
          aria-label="Закрыть"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {items === null ? (
          <div className="px-4 py-6 text-gray-500">Загрузка…</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-6 text-gray-500">
            {err || 'Пока никто не лайкнул.'}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((u) => (
              <li key={u.id}>
                <Link
                  href={`/${u.username}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
                  onClick={(e) => handleProfileClick(u.username, e)}
                >
                  <SmartImage
                    src={
                      absUrl(u.avatar || '') ||
                      u.avatar ||
                      AVA_PH
                    }
                    alt={`@${u.username}`}
                    width={32}
                    height={32}
                    className="rounded-full border border-gray-200"
                    sizes="32px"
                  />
                  <span className="text-[14px]">@{u.username}</span>
                </Link>
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
