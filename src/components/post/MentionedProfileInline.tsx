'use client';

import React from 'react';
import Link from 'next/link';
import { useAppNavigation } from '@/hooks/useAppNavigation';
import { getBrowserApiBase } from '@/lib/apiBase';
import ConfirmModal from '@/components/ui/ConfirmModal';

const API_BASE = getBrowserApiBase().replace(/\/+$/, '');

type MentionedProfileInlineProps = {
  text: string;
  className?: string;
};

// Разбивает произвольный текст на фрагменты и @username‑упоминания.
function splitMentions(source: string): Array<{ type: 'text'; value: string } | { type: 'mention'; username: string; raw: string }> {
  if (!source) return [];
  const re = /@([A-Za-z0-9._-]{1,32})/g;
  const parts: Array<{ type: 'text'; value: string } | { type: 'mention'; username: string; raw: string }> = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) != null) {
    const [raw, uname] = m;
    const idx = m.index;
    if (idx > lastIndex) {
      parts.push({ type: 'text', value: source.slice(lastIndex, idx) });
    }
    parts.push({ type: 'mention', username: uname, raw });
    lastIndex = idx + raw.length;
  }
  if (lastIndex < source.length) {
    parts.push({ type: 'text', value: source.slice(lastIndex) });
  }
  return parts;
}

export default function MentionedProfileInline({ text, className = '' }: MentionedProfileInlineProps) {
  const { navigateProfile } = useAppNavigation();
  const [notFound, setNotFound] = React.useState<string | null>(null);
  const checkingRef = React.useRef<Set<string>>(new Set());

  const handleClick = React.useCallback(
    async (event: React.MouseEvent<HTMLAnchorElement>, display: string) => {
      const username = display.replace(/^@+/, '').trim();
      if (!username) return;

      // Пытаемся открыть как обычный профиль‑оверлей.
      const handled = navigateProfile(event, { username });
      if (handled) return;

      // Если оверлей не открылся (например, клик не plain‑left) — не мешаем браузеру.
      if (event.defaultPrevented) return;

      // На всякий случай делаем HEAD/GET к API профиля, чтобы показать дружелюбную ошибку.
      if (!API_BASE) return;
      if (checkingRef.current.has(username)) return;
      checkingRef.current.add(username);
      try {
        const url = `${API_BASE}/api/profile/${encodeURIComponent(username)}/`;
        const res = await fetch(url, { method: 'GET', credentials: 'include', cache: 'no-store' });
        if (!res.ok) {
          setNotFound(username);
        } else {
          // Профиль существует, но navigateProfile не смог перехватить — пусть откроется обычный переход.
        }
      } catch {
        setNotFound(username);
      } finally {
        checkingRef.current.delete(username);
      }
    },
    [navigateProfile],
  );

  const parts = React.useMemo(() => splitMentions(text), [text]);

  return (
    <>
      <span className={className}>
        {parts.map((part, index) => {
          if (part.type === 'text') {
            return <React.Fragment key={`t-${index}`}>{part.value}</React.Fragment>;
          }
          const display = part.raw;
          const usernameSafe = display.replace(/^@+/, '').trim();
          if (!usernameSafe) {
            return <React.Fragment key={`m-${index}`}>{display}</React.Fragment>;
          }
          return (
            <Link
              key={`m-${index}`}
              href={`/${usernameSafe}`}
              className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
              onClick={(event) => {
                // Сначала пробуем оверлей/валидацию, а если не сработало — даём браузеру перейти по ссылке.
                void handleClick(event, display);
              }}
            >
              {display}
            </Link>
          );
        })}
      </span>

      <ConfirmModal
        open={!!notFound}
        onCancel={() => setNotFound(null)}
        onConfirm={() => setNotFound(null)}
        title="Профиль не найден"
        message={notFound ? `Профиль @${notFound} не существует или недоступен.` : 'Профиль не найден.'}
        cancelLabel="Закрыть"
        confirmLabel="Ок"
      />
    </>
  );
}

