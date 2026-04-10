'use client';

import React from 'react';
import Link from 'next/link';
import MentionedProfileInline from '@/components/post/MentionedProfileInline';

type PostTextInlineProps = {
  author: string;
  text: string;
  isTextOnly: boolean;
  clampLines?: number;
  showAuthor?: boolean;
};

/**
 * Mobile-style inline post text with clamp/expand controls.
 * Reused between the mobile post page and the feed cards to keep the layout identical.
 */
export default function PostTextInline({
  author,
  text,
  isTextOnly,
  clampLines = 6,
  showAuthor = true,
}: PostTextInlineProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [isClamped, setIsClamped] = React.useState(false);
  const pRef = React.useRef<HTMLParagraphElement | null>(null);

  React.useEffect(() => {
    const el = pRef.current;
    if (!el) return;

    const check = () => {
      if (expanded) {
        setIsClamped(false);
        return;
      }
      setIsClamped(el.scrollHeight > el.clientHeight + 1);
    };

    check();

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', check);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', check);
    };
  }, [text, expanded]);

  const clampClass = expanded ? '' : `line-clamp-${clampLines}`;
  const clampStyle = expanded
    ? undefined
    : ({
        display: '-webkit-box',
        WebkitLineClamp: clampLines,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      } as React.CSSProperties);

  return (
    <div className="leading-snug">
      <p
        ref={pRef}
        className={`${isTextOnly ? 'text-[16px]' : 'text-[14px]'} whitespace-pre-wrap break-words ${clampClass}`}
        style={clampStyle}
      >
        {showAuthor && (
          <>
            <Link href={`/${author}`} className="font-semibold">
              {author}
            </Link>{' '}
          </>
        )}
        <MentionedProfileInline text={text} />
      </p>

      {!expanded && isClamped && (
        <button type="button" onClick={() => setExpanded(true)} className="mt-3 text-[13px] text-gray-500/70">
          развернуть
        </button>
      )}
      {expanded && (
        <button type="button" onClick={() => setExpanded(false)} className="mt-1 text-[13px] text-gray-500">
          свернуть
        </button>
      )}
    </div>
  );
}
