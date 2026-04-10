'use client';

import React from 'react';
import SmartImage from '@/components/SmartImage';
import Link from 'next/link';
import { normalizeCommentAvatarSrc } from '@/components/comments/shared';
import { useAppNavigation } from '@/hooks/useAppNavigation';
import { ModalLayerPortal } from '@/components/ui/ModalLayerPortal';
import { getBrowserApiBase } from '@/lib/apiBase';

type SimpleUser = { id: number; username: string; avatar?: string | null };

function normalizeUsers(j: unknown): SimpleUser[] {
  const pickArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

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
      const idRaw = it.id;
      const id = typeof idRaw === 'number' ? idRaw : Number(idRaw ?? i + 1);
      const uname = typeof it.username === 'string' && it.username
        ? it.username
        : (typeof it.user === 'string' ? it.user : '');
      const avatarCandidate = (it.avatar_url ?? it.avatar ?? it.profile_picture) as unknown;
      const avatar = typeof avatarCandidate === 'string' ? avatarCandidate : null;
      return { id, username: uname, avatar } as SimpleUser;
    })
    .filter(u => !!u.username);
}

export default function CommentLikersOverlay({ open, postId, commentId, onClose, centered, skipPortal }: { open: boolean; postId: number; commentId: number; onClose: () => void; centered?: boolean; skipPortal?: boolean }) {
  const API = getBrowserApiBase();
  const AVA_PH = (process.env.NEXT_PUBLIC_BASE_PATH || '') + '/avatars/question3.jpg';
  const [items, setItems] = React.useState<SimpleUser[] | null>(null);
  const [err, setErr] = React.useState('');
  const { navigateProfile } = useAppNavigation();

  React.useEffect(() => {
    if (!open || !postId || !commentId) return;
    let cancelled = false;
    (async () => {
      setItems(null); setErr('');
      try {
        const url = `${API}/api/posts/${postId}/engagement/`;
        let r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } });
        if (!r.ok && (r.status === 401 || r.status === 403)) {
          r = await fetch(url, { credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } });
        }
        if (!r.ok) throw new Error('Не удалось загрузить');
        const j: unknown = await r.json();
        const root = (j ?? {}) as Record<string, unknown>;
        // Собираем листы лайкеров по комментам/ответам (поддержка нескольких форматов)
        const byId: Record<number, SimpleUser[]> = {};
        const push = (id: number, v: unknown) => {
          const arr = normalizeUsers(v);
          if (arr.length) byId[id] = arr;
        };
        const fillFromMap = (obj: unknown) => {
          if (!obj || typeof obj !== 'object') return;
          for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            const id = Number(k); if (!Number.isFinite(id)) continue;
            push(id, v);
          }
        };
        const fillFromArray = (list: unknown) => {
          if (!Array.isArray(list)) return;
          for (const it of list as unknown[]) {
            const o = (it ?? {}) as Record<string, unknown>;
            const id = (typeof o['comment_id'] === 'number' ? (o['comment_id'] as number)
                      : typeof o['reply_id'] === 'number' ? (o['reply_id'] as number)
                      : typeof o['id'] === 'number' ? (o['id'] as number) : 0);
            if (!id) continue;
            const users = (o['likers'] ?? o['liked_by'] ?? o['likes'] ?? o['users']) as unknown;
            push(id, users);
          }
        };

        const candidates = [
          root['comment_likers'], root['comments_likers'], root['likes_by_comment'], root['comment_likes'],
          root['reply_likers'], root['replies_likers'], root['likes_by_reply'], root['reply_likes'], root['replies_likes'], root['comment_replies_likers'],
        ].filter(Boolean);
        for (const cand of candidates) {
          if (Array.isArray(cand)) fillFromArray(cand);
          else fillFromMap(cand);
        }
        const listObj = (root['comments'] || root['replies'] || root['comment_items'] || root['comment_details']) as unknown;
        fillFromArray(listObj);

        const users = byId[commentId] ?? [];
        if (!cancelled) setItems(users);
      } catch {
        if (!cancelled) { setErr('Не удалось загрузить список'); setItems([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [open, postId, commentId, API]);

  const handleProfileClick = React.useCallback((username: string) => {
    const target = (username || '').replace(/^@+/, '').trim();
    if (!target) return;
    navigateProfile(null, { username: target });
  }, [navigateProfile]);

  if (!open) return null;

  const listNode = (
    <>
      {items === null ? (
        <div className="px-4 py-6 text-gray-500">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="px-4 py-6 text-gray-500">{err || 'Пока никто не лайкнул.'}</div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map(u => (
            <li key={u.id}>
              <Link
                href={`/${u.username}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
                onClick={(e) => { e.preventDefault(); handleProfileClick(u.username); }}
              >
                <SmartImage
                  src={normalizeCommentAvatarSrc(u.avatar) || AVA_PH}
                  alt={`@${u.username}`}
                  width={32}
                  height={32}
                  className="rounded-full border border-gray-200"
                  sizes="32px"
                  forceUnoptimized
                />
                <span className="text-[14px] font-semibold">{u.username}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  // если рендерим через LayerStack (skipPortal=true) – НЕ задаём свой z-index
  const baseZ = skipPortal ? '' : 'z-[2700]';

  const modalContent = centered ? (
    <div className={`fixed inset-0 ${baseZ} flex items-center justify-center`} role="dialog" aria-modal>
      <button className="absolute inset-0 bg-black/40" aria-label="Закрыть" onClick={onClose} />
      <div
        className="relative z-[50001] w-[min(420px,92vw)] max-h-[70vh] bg-white rounded-xl shadow-2xl border overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="font-medium">Оценили</h3>
          <button onClick={onClose} className="rounded-md px-2 py-1 hover:bg-gray-100" aria-label="Закрыть">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {listNode}
        </div>
      </div>
    </div>
  ) : (
    <div className={`fixed inset-0 ${baseZ} bg-white flex flex-col`} role="dialog" aria-modal>
      <div className="h-[56px] flex items-center justify-between px-4 border-b border-gray-200">
        <div className="text-base font-medium">Оценили</div>
        <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center" aria-label="Закрыть">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {listNode}
      </div>
    </div>
  );

  if (skipPortal) {
    return modalContent;
  }

  return <ModalLayerPortal>{modalContent}</ModalLayerPortal>;
}
