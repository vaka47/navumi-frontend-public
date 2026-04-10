'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogOverlay } from '@/components/ui/dialog';
import { ModalLayerPortal } from '@/components/ui/ModalLayerPortal';
import { getBrowserApiBase } from '@/lib/apiBase';

type ReportKind = 'camp' | 'camp_post' | 'profile_post' | 'camp_comment' | 'post_comment' | 'profile';

export type ReportModalProps = {
  open: boolean;
  onClose: () => void;
  kind: ReportKind;
  targetId: number;
  linkHint?: string;
  isReply?: boolean;
  commentAuthor?: string;
  commentText?: string;
  profileUsername?: string; // для kind: 'profile'
};

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const cookie = document.cookie.split('; ').find((row) => row.startsWith(name + '='));
  return cookie ? decodeURIComponent(cookie.split('=')[1]) : null;
}

export default function ReportModal({
  open,
  onClose,
  kind,
  targetId,
  linkHint,
  isReply = false,
  commentAuthor,
  commentText,
  profileUsername,
}: ReportModalProps) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(''); // ← добавили
  const [busy, setBusy] = useState(false);

  const presetSubject = useMemo(() => {
    switch (kind) {
      case 'camp':         return 'Жалоба на кэмп';
      case 'camp_post':    return 'Жалоба на пост кэмпа';
      case 'profile_post': return 'Жалоба на пост профиля';
      case 'profile':      return 'жалоба на профиль';
      case 'camp_comment':
      case 'post_comment': return isReply ? 'Жалоба на ответ в ветке' : 'Жалоба на комментарий';
      default:             return 'Жалоба';
    }
  }, [kind, isReply]);

  useEffect(() => {
    if (!open) { setMessage(''); setError(''); setSuccess(''); setBusy(false); }
  }, [open]);

  const API_BASE = getBrowserApiBase();
  // Сформируем кликабельную абсолютную ссылку (с origin), даже если пришёл относительный путь
  const absoluteLink = useMemo(() => {
    const raw = (linkHint || '').trim();
    if (!raw) return '';
    try {
      const base = typeof window !== 'undefined' ? window.location.origin : 'https://navumi.com';
      return new URL(raw, base).href;
    } catch { return raw; }
  }, [linkHint]);

  const send = async () => {
    setError('');
    setSuccess('');
    const text = message.trim();
    if (text.length < 5) {
      setError('Напишите чуть подробнее, пожалуйста (минимум 5 символов).');
      return;
    }

    setBusy(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCookie('csrftoken') ?? '',
      } as Record<string, string>;
      let res: Response;
      if (kind === 'profile' && profileUsername) {
        // Используем новый упрощённый эндпоинт для профиля
        res = await fetch(`${API_BASE}/api/profile/${encodeURIComponent(profileUsername)}/report/`, {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({ message: text, link: absoluteLink, subject: presetSubject }),
        });
      } else {
        // Универсальная точка
        res = await fetch(`${API_BASE}/api/report-abuse/`, {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({
            kind,
            object_id: targetId,
            message: text,
            link: absoluteLink,
            subject: presetSubject,
            ...(kind === 'post_comment' || kind === 'camp_comment'
              ? { comment_text: commentText, comment_author: commentAuthor, is_reply: !!isReply }
              : {}),
          }),
        });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Ошибка (${res.status})`);

      if (data?.email_sent === false) {
        setError(data.error
          ? `Жалоба сохранена, но письмо не отправлено: ${data.error}`
          : 'Жалоба сохранена, но письмо не отправлено.');
        return; // оставляем модалку открытой, чтобы показать сообщение
      }

      // успех: показываем зелёное уведомление и мягко закрываем модалку
      setSuccess('Спасибо! Жалоба отправлена.');
      setMessage('');
      // ↓ если автозакрытие не нужно — закомментируй блок setTimeout
      setTimeout(() => { if (open) onClose(); }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось отправить жалобу');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <ModalLayerPortal>
        <DialogOverlay className="fixed inset-0 bg-black/40 z-[40000]" />
        <DialogContent className="z-[40001] w-full max-w-md bg-white rounded-xl p-5">
          <DialogTitle className="text-base font-semibold">На что жалуемся?</DialogTitle>
          <DialogDescription className="sr-only">Форма отправки жалобы</DialogDescription>

          <div className="mt-3">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Напишите подробнее что вас взволновало"
              className="w-full min-h-[120px] resize-y border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              disabled={busy || !!success}
            />
            {error && <div className="mt-2 text-sm text-red-600" role="alert">{error}</div>}
            {success && (
              <div className="mt-2 text-sm text-green-600" role="status" aria-live="polite">
                {success}
              </div>
            )}
          </div>

          <div className="mt-4 flex justify-end gap-3">
            <button
              type="button"
              className="text-sm text-gray-600 hover:text-black"
              onClick={onClose}
              disabled={busy}
            >
              {success ? 'Закрыть' : 'Отмена'}
            </button>
            {!success && (
              <button
                type="button"
                className={[
                  "text-sm font-semibold rounded-full px-4 py-2",
                  busy ? "bg-gray-300 text-gray-600" : "bg-black text-white hover:bg-black/85"
                ].join(' ')}
                onClick={send}
                disabled={busy}
              >
                {busy ? 'Отправляю…' : 'Отправить'}
              </button>
            )}
          </div>
        </DialogContent>
      </ModalLayerPortal>
    </Dialog>
  );
}
