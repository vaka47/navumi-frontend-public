"use client";

import React from "react";
import SmartImage from "@/components/SmartImage";
import { absUrl } from "@/components/camp/campNormalize";
import { Button } from "@/components/ui/button";
import { FeedItem } from "./types";

// Utility functions (moved from page.tsx or duplicated if small)
function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const delta = Date.now() - new Date(iso).getTime();
  const m = Math.max(1, Math.floor(delta / 60000));
  if (m < 60) return `${m} мин.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч.`;
  const d = Math.floor(h / 24);
  return `${d} д.`;
}

const parseNumber = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
};

const currencySymbol = (currency?: string | null): string => {
  const c = (currency || '').trim().toUpperCase();
  if (!c) return '';
  if (['RUB', 'RUR'].includes(c)) return '₽';
  if (c === 'USD') return '$';
  if (c === 'EUR') return '€';
  return c;
};

const formatPriceShort = (value: unknown, currency?: string | null): string | null => {
  const num = parseNumber(value);
  if (num === null) return null;
  const sym = currencySymbol(currency || undefined);
  const formatted = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(num);
  return sym ? `${formatted} ${sym}` : formatted;
};

const getCampTitle = (it: FeedItem): string => {
  const t = it.target && it.target.kind === 'camp' ? it.target : undefined;
  return (t && (t.title || (t.camp_number ? `Кэмп #${t.camp_number}` : 'кэмп'))) || 'кэмп';
};

function ActorLinks({ actors, onClick }: { actors: FeedItem["actors"]; onClick: (u: string) => void }) {
  if (!actors.length) return null;
  const A = ({ u }: { u: string }) => (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick(u);
      }}
      className="font-semibold hover:underline"
    >
      {u}
    </button>
  );
  if (actors.length === 1) return <A u={actors[0]!.username} />;
  if (actors.length === 2) return <>
    <A u={actors[0]!.username} />, <A u={actors[1]!.username} />
  </>;
  return <>
    <A u={actors[0]!.username} />, <A u={actors[1]!.username} /> и ещё {actors.length - 2}
  </>;
}

const CampNameButton = ({ title }: { title: string }) => (
  <span className="underline" title={title}>
    {title}
  </span>
);

function ClampedHeadline({ children, className }: { children: React.ReactNode; className?: string }) {
  const base = "min-w-0 break-words text-left";
  const combined = className ? `${base} ${className}` : base;

  return (
    <div
      className={`${combined} line-clamp-3`}
      style={{
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

type Props = {
  item: FeedItem;
  onOpenTarget: (it: FeedItem) => void;
  onActorClick: (username: string) => void;
  onFollowToggle?: (username: string) => void;
  isFollowing?: boolean;
};

const ActivityFeedItem = React.memo(function ActivityFeedItem({
  item,
  onOpenTarget,
  onActorClick,
  onFollowToggle,
  isFollowing,
}: Props) {
  

  // Render helper for Avatar
  const renderAvatar = () => {
    const u = item.actors?.[0]?.username || '';
    const campTarget = item.target && item.target.kind === 'camp' ? item.target : undefined;
    const avatarSrc = item.actors?.[0]?.avatar_url || '/avatars/question.jpg';
    
    const go = () => {
      if (u) {
        onActorClick(u);
        return;
      }
      if (campTarget) onOpenTarget(item);
    };

    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          go();
        }}
        aria-label={u ? `Открыть профиль ${u}` : 'Открыть профиль'}
        className="relative w-10 h-10 min-w-[2.5rem] min-h-[2.5rem] rounded-full overflow-hidden bg-gray-100 border flex-none"
      >
        <SmartImage 
          src={absUrl(avatarSrc || '') || avatarSrc} 
          alt={u || 'avatar'} 
          fill 
          sizes="40px" 
          className="object-cover"
          forceUnoptimized={false} // Allow optimization!
        />
      </button>
    );
  };

  // Render helper for Right side
  const renderRight = () => {
    if (item.type === 'follow') {
      return (
        <Button
          type="button"
          variant="neutral"
          className={`shrink-0 text-sm px-3 py-1 h-8 ${isFollowing ? 'text-gray-800 border-gray-300' : 'text-black'}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const actor = (item.actors?.[0]?.username || '').toLowerCase();
            if (actor && onFollowToggle) onFollowToggle(actor);
          }}
        >
          {isFollowing ? 'Вы подписаны' : 'Подписаться в ответ'}
        </Button>
      );
    }

    const t = item.target;
    if (!t) return null;
    
    let thumbSrc: string | null = null;

    if (t.kind === 'post') {
      const isArticle = (t as { post_type?: string | null }).post_type === 'article';
      if (item.type === 'camp_mentioned_in_post') {
         const ct = (t as { camp_thumb?: string | null }).camp_thumb;
         if (ct) thumbSrc = absUrl(ct) || ct;
      } else if (!isArticle && t.thumb) {
         thumbSrc = absUrl(t.thumb) || t.thumb;
      }
    } else if (t.kind === 'camp') {
      const cover = t.thumb || (t as { cover_url?: string | null }).cover_url;
      if (cover) thumbSrc = absUrl(cover) || cover;
    }

    if (thumbSrc) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenTarget(item);
          }}
          className="relative w-12 h-12 min-w-[3rem] min-h-[3rem] rounded-md overflow-hidden bg-gray-100 border flex-none"
        >
          <SmartImage 
             src={thumbSrc} 
             alt="thumb" 
             fill 
             sizes="48px" 
             className="object-cover"
             forceUnoptimized={false} // Allow optimization!
          />
        </button>
      );
    }
    return null;
  };

  // Text parts logic
  const buildCampHeadline = (it: FeedItem, prefix?: React.ReactNode) => {
    const title = getCampTitle(it);
    return (
      <>
        {prefix ? <span className="text-gray-700">{prefix} </span> : null}
        <CampNameButton title={title} />
      </>
    );
  };

  const campStatusParts = (it: FeedItem, variant: "sold_out" | "spots_opened") => {
    const base = { headline: buildCampHeadline(it, <>На кэмпе</>), headlineClassName: "text-left" as const };
    if (variant === "sold_out") {
      return { ...base, body: <>Случился солдаут</> };
    }
    const slots = parseNumber(it.payload?.available_slots_after);
    const tail = slots !== null && slots > 0 ? `: доступно ${slots}` : '';
    return { ...base, body: <>Снова появились места{tail}</> };
  };

  const defaultHeadline = (node: React.ReactNode, headlineClassName?: string) => ({ headline: node, headlineClassName });

  let textParts: { headline: React.ReactNode; body?: React.ReactNode; headlineClassName?: string };

  switch (item.type) {
      case "post_like": {
        const t = item.target && item.target.kind === 'post' ? item.target : undefined;
        const postType = (t as { post_type?: string | null } | undefined)?.post_type;
        const isArticle = postType === 'article';
        textParts = defaultHeadline(
          <>
            <ActorLinks actors={item.actors} onClick={onActorClick} /> оценили {isArticle ? 'вашу статью' : 'ваш пост'}
          </>
        );
        break;
      }
      case "post_comment":
        textParts = defaultHeadline(
          <>
            <ActorLinks actors={item.actors} onClick={onActorClick} /> оставил комментарий к вашей публикации: “{(item.text || "").slice(0, 60)}{(item.text || "").length > 60 ? "…" : ""}”
          </>
        );
        break;
      case "comment_like":
        textParts = defaultHeadline(
          <>
            <ActorLinks actors={item.actors} onClick={onActorClick} /> оценил ваш комментарий
          </>
        );
        break;
      case "comment_reply":
        textParts = defaultHeadline(
          <>
            <ActorLinks actors={item.actors} onClick={onActorClick} /> ответил на ваш комментарий
          </>
        );
        break;
      case "post_mention":
        textParts = defaultHeadline(
          <>
            <ActorLinks actors={item.actors} onClick={onActorClick} /> упомянул вас в посте
          </>
        );
        break;
      case "article_mention":
        textParts = defaultHeadline(
          <>
            <ActorLinks actors={item.actors} onClick={onActorClick} /> упомянул вас в статье
          </>
        );
        break;
      case "comment_mention":
        textParts = defaultHeadline(
          <>
            <ActorLinks actors={item.actors} onClick={onActorClick} /> упомянул вас в комментарии
          </>
        );
        break;
      case "article_like":
        textParts = defaultHeadline(
          <>
            <ActorLinks actors={item.actors} onClick={onActorClick} /> оценил вашу статью
          </>
        );
        break;
      case "camp_like":
        textParts = defaultHeadline(
          <>
            <ActorLinks actors={item.actors} onClick={onActorClick} /> оценил ваш кэмп
          </>
        );
        break;
      case "camp_subscribe":
        textParts = defaultHeadline(
          <>
            <ActorLinks actors={item.actors} onClick={onActorClick} /> подписался на ваш кэмп
          </>
        );
        break;
      case "camp_interest": {
        const headline = (
          <>
            <ActorLinks actors={item.actors} onClick={onActorClick} /> заинтересовался кэмпом{' '}
            <CampNameButton title={getCampTitle(item)} />
          </>
        );
        textParts = defaultHeadline(headline);
        break;
      }
      case "camp_new_post": {
        textParts = {
          headline: (
            <>
              <ActorLinks actors={item.actors} onClick={onActorClick} /> в кэмпе{' '}
              <CampNameButton title={getCampTitle(item)} />
            </>
          ),
          headlineClassName: "text-left",
          body: <>Появился новый пост</>,
        };
        break;
      }
      case "camp_sold_out":
        textParts = campStatusParts(item, "sold_out");
        break;
      case "camp_spots_opened":
        textParts = campStatusParts(item, "spots_opened");
        break;
      case "camp_price_drop": {
        const t = item.target && item.target.kind === 'camp' ? item.target : undefined;
        const targetCamp = t as { currency?: string | null; hot_deal_price?: number | string | null; price?: number | string | null } | undefined;
        const currency = item.payload?.currency || targetCamp?.currency;
        const priceBefore = formatPriceShort(item.payload?.price_before, currency);
        const priceAfterHot = formatPriceShort(targetCamp?.hot_deal_price, currency);
        const priceAfterPayload = formatPriceShort(item.payload?.price_after, currency);
        const priceAfterRegular = formatPriceShort(targetCamp?.price, currency);
        const priceAfter = priceAfterHot || priceAfterPayload || priceAfterRegular;
        const pricePart = priceBefore && priceAfter ? `: ${priceBefore} → ${priceAfter}` : priceAfter ? `: ${priceAfter}` : '';
        textParts = {
          headline: buildCampHeadline(item, <>В кэмпе</>),
          headlineClassName: "text-left",
          body: <span className="text-red-600">Снизилась цена{pricePart}</span>,
        };
        break;
      }
      case "camp_mentioned_in_post":
        textParts = defaultHeadline(
          <>
            <ActorLinks actors={item.actors} onClick={onActorClick} /> отметил кэмп «{(item.target && item.target.kind === 'post' && (item.target as { camp_title?: string | null }).camp_title) || 'кэмп'}» в посте
          </>
        );
        break;
      case "user_subscribed_camp":
        textParts = defaultHeadline(
          <>
            <ActorLinks actors={item.actors} onClick={onActorClick} /> подписался на кэмп{' '}
            <CampNameButton title={getCampTitle(item)} />
          </>
        );
        break;
      case "follow":
        textParts = defaultHeadline(
          <>
            <ActorLinks actors={item.actors} onClick={onActorClick} /> подписался на вас
          </>
        );
        break;
      default:
        textParts = defaultHeadline(<ActorLinks actors={item.actors} onClick={onActorClick} />);
  }

  return (
    <div className="flex items-center gap-3 px-3 py-3">
      {renderAvatar()}
      <button type="button" className="flex-1 min-w-0 text-left" onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenTarget(item);
        }}>
        <div className="text-[15px] leading-tight min-w-0">
          <ClampedHeadline className={textParts.headlineClassName}>{textParts.headline}</ClampedHeadline>
        </div>
        {textParts.body && (
          <div className="text-[14px] text-gray-900 leading-tight mt-0.5">{textParts.body}</div>
        )}
        {((item.type === 'comment_like' || item.type === 'comment_mention') && item.text) && (
          <div className="text-[13px] text-gray-600 line-clamp-1 mt-0.5">“{(item.text || '').trim()}”</div>
        )}
        <div className="text-[12px] text-gray-500 mt-0.5">{timeAgo(item.created_at)}</div>
      </button>
      {renderRight()}
    </div>
  );
});

export default ActivityFeedItem;
