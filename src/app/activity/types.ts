export type FeedItem = {
  id: string;
  type:
    | "post_like"
    | "camp_new_post"
    | "camp_sold_out"
    | "camp_spots_opened"
    | "camp_price_drop"
    | "camp_mentioned_in_post"
    | "user_subscribed_camp"
    | "post_comment"
    | "comment_like"
    | "comment_reply"
    | "article_like"
    | "camp_like"
    | "camp_subscribe"
    | "follow"
    | "post_mention"
    | "article_mention"
    | "comment_mention"
    | "camp_interest";
  actors: Array<{ username: string; avatar_url?: string | null }>;
  text?: string | null; // comment text (single line)
  target?:
    | {
        kind: "post";
        author: string;
        postId: number | string;
        thumb?: string | null;
        commentId?: number | string;
        post_type?: "post" | "article" | string | null;
        camp_id?: number | string | null;
        camp_title?: string | null;
        camp_thumb?: string | null;
        camp_number?: number | string | null;
        camp_organizer?: string | null;
      }
    | {
        kind: "camp";
        organizer: string;
        camp_number?: number | string | null;
        url?: string | null;
        thumb?: string | null;
        cover_url?: string | null;
        title?: string | null;
        commentId?: number | string;
        camp_id?: number | string | null;
        camp_post_id?: number | string | null;
        is_sold_out?: boolean | null;
        price?: number | string | null;
        currency?: string | null;
        hot_deal_price?: number | string | null;
        is_hot_deal?: boolean | null;
      }
    | { kind: "article"; author: string; postId: number | string }
    | { kind: "profile"; username: string };
  created_at?: string | null;
  payload?: {
    is_sold_out_before?: boolean | null;
    is_sold_out_after?: boolean | null;
    available_slots_before?: number | string | null;
    available_slots_after?: number | string | null;
    price_before?: number | string | null;
    price_after?: number | string | null;
    currency?: string | null;
  } | null;
};
