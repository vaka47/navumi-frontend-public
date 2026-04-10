'use client';

export const CAMP_POST_CREATED_EVENT = 'navumi:camp-post-created';

export type CampPostCreatedDetail = {
  campId: number;
  post?: unknown | null;
};

export function emitCampPostCreated(detail: CampPostCreatedDetail) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent<CampPostCreatedDetail>(CAMP_POST_CREATED_EVENT, { detail }));
  } catch {
    /* noop */
  }
}

/**
 * Событие создания комментария в кэмпе.
 * detail.comment может быть любым объектом, который вкладка сама нормализует.
 */
export const CAMP_COMMENT_CREATED_EVENT = 'navumi:camp-comment-created';

export type CampCommentCreatedDetail = {
  campId: number;
  comment?: unknown | null;
  /**
   * Идентификатор корневого комментария (если это ответ в ветке).
   * Опционально: старые эмиттеры могут не передавать.
   */
  rootId?: number | null;
  /**
   * Флажок «это ответ, а не корень».
   * Носит информационный характер; при отсутствии
   * вкладка сама пытается угадать по полям comment.
   */
  isReply?: boolean;
};

export function emitCampCommentCreated(detail: CampCommentCreatedDetail) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent<CampCommentCreatedDetail>(CAMP_COMMENT_CREATED_EVENT, { detail }),
    );
  } catch {
    /* noop */
  }
}

/**
 * Событие создания/добавления новой «отметки кэмпа» (profile‑post с тегом кэмпа).
 * Используем только campId, чтобы вкладка сама перезагрузила список.
 */
export const CAMP_MARK_ADDED_EVENT = 'navumi:camp-mark-added';

export type CampMarkAddedDetail = {
  campId: number;
  post?: unknown | null;
};

export function emitCampMarkAdded(detail: CampMarkAddedDetail) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent<CampMarkAddedDetail>(CAMP_MARK_ADDED_EVENT, { detail }));
  } catch {
    /* noop */
  }
}
