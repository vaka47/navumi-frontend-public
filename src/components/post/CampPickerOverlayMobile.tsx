'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SmartImage from '@/components/SmartImage';
import PseudoModal from '@/components/ui/PseudoModal';
import { FixedMenuPortal } from '@/components/ui/FixedMenuPortal';
import { getBrowserApiBase } from '@/lib/apiBase';

/** === types (совмещаем потребности десктопной логики и мобильных чипсов) === */
type ClubMini = {
  id: number;
  username: string;
  avatar_url?: string;
  role?: 'club' | 'client' | string;
  is_club?: boolean;
  title?: string; // для чипсов «мои клубы»
};

type CampLite = { id: number; title: string; start_date?: string; end_date?: string };

type UsernameSuggestItem = {
  id: number;
  username: string;
  full_name?: string;
  avatar_url?: string;
};

const isUsernameSuggestItem = (v: unknown): v is UsernameSuggestItem =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as { id?: unknown }).id === 'number' &&
  typeof (v as { username?: unknown }).username === 'string';

function enrichWithAvatars(base: ClubMini[], sugg: UsernameSuggestItem[]) {
  const map = new Map(sugg.map(s => [s.username.toLowerCase(), s.avatar_url]));
  return base.map(c => (c.avatar_url ? c : { ...c, avatar_url: map.get(c.username.toLowerCase()) || c.avatar_url }));
}

function ddmmyy(d?: string) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(+dt)) return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yy = String(dt.getFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}
function campDate(c: CampLite) {
  if (c.start_date && c.end_date) return `${ddmmyy(c.start_date)} - ${ddmmyy(c.end_date)}`;
  if (c.start_date) return ddmmyy(c.start_date);
  return '';
}
const API = getBrowserApiBase();
const toAbsUrl = (u?: string) => {
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return `${API}${u.startsWith('/') ? '' : '/'}${u}`;
};

/** safe VisualViewport shape */
type VisualViewportLike = {
  height: number;
  addEventListener?: (type: 'resize' | 'scroll', cb: EventListenerOrEventListenerObject) => void;
  removeEventListener?: (type: 'resize' | 'scroll', cb: EventListenerOrEventListenerObject) => void;
};

export default function CampPickerOverlayMobile({
  open,
  onClose,
  onPick,
  initialSelected,
  layout = 'fullscreen',
}: {
  open: boolean;
  onClose: () => void;
  onPick: (camp: { id: number; title: string; start_date?: string; end_date?: string }) => void;
  initialSelected?: { club?: ClubMini | null };
  layout?: 'centered' | 'fullscreen';
}) {
  /** ---- state: поиск клубов (десктопная механика) ---- */
  const [query, setQuery] = useState<string>('');
  const [clubs, setClubs] = useState<ClubMini[]>([]);
  const [loadingClubs, setLoadingClubs] = useState(false);
  const [selectedClub, setSelectedClub] = useState<ClubMini | null>(initialSelected?.club || null);
  const [brokenAvatars, setBrokenAvatars] = useState<Set<number>>(new Set());
  const errorCountRef = useRef<Map<number, number>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const railRef = useRef<HTMLDivElement>(null);

  // При каждом открытии очищаем флаги «битых» аватарок — иначе плейсхолдеры висят навсегда
  useEffect(() => {
    if (!open) return;
    setBrokenAvatars(new Set());
    errorCountRef.current = new Map();
  }, [open]);

  // предпрогрев аватарок из подсказок
  useEffect(() => {
    clubs.forEach(c => {
      const src = toAbsUrl(c.avatar_url);
      if (src) {
        const i = new Image();
        i.src = src;
      }
    });
  }, [clubs]);

  const [hasFocus, setHasFocus] = useState(false);
  const [suppressMenu, setSuppressMenu] = useState(false);

  // быстрый дебаунс ввода
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setTyped(query), 180);
    return () => window.clearTimeout(t);
  }, [query, open]);

  // sanitize @
  const norm = useMemo(() => typed.replace(/^@+/, '').trim(), [typed]);

  // контейнер для портала дропдауна
  const [portalContainer, setPortalContainer] = useState<Element | null>(null);
  useEffect(() => {
    if (!open) {
      setPortalContainer(null);
      return;
    }
    const host = railRef.current?.closest('[data-tpm-panel]') as Element | null;
    setPortalContainer(host ?? document.body);
  }, [open]);

  // поиск клубов: /profiles/search + /username-suggest (как на десктопе)
  useEffect(() => {
    if (!open) return;
    if (!norm) {
      setClubs([]);
      abortRef.current?.abort();
      return;
    }

    setLoadingClubs(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    (async () => {
      try {
        const q = encodeURIComponent(norm);
        const [rSearch, rSuggest] = await Promise.allSettled([
          fetch(`${API}/api/profiles/search?q=${q}&limit=100&role=club`, { credentials: 'include', signal: ac.signal }),
          fetch(`${API}/api/username-suggest/?q=${q}&role=club&limit=100`, { credentials: 'include', signal: ac.signal }),
        ]);

        let searchList: ClubMini[] = [];
        if (rSearch.status === 'fulfilled' && rSearch.value.ok) {
          const d1: unknown = await rSearch.value.json();
          if (d1 && typeof d1 === 'object' && Array.isArray((d1 as { profiles?: unknown[] }).profiles)) {
            searchList = (d1 as { profiles: ClubMini[] }).profiles;
          }
        }

        let suggestList: UsernameSuggestItem[] = [];
        if (rSuggest.status === 'fulfilled' && rSuggest.value.ok) {
          const d2: unknown = await rSuggest.value.json();
          const raw = (d2 && typeof d2 === 'object' ? (d2 as { results?: unknown[] }).results : undefined) || [];
          suggestList = (Array.isArray(raw) ? raw : []).filter(isUsernameSuggestItem);
        }

        const base: ClubMini[] = searchList.length
          ? enrichWithAvatars(searchList, suggestList)
          : suggestList.map(x => ({ id: x.id, username: x.username, avatar_url: x.avatar_url, role: 'club', is_club: true }));

        const onlyClubs = base.filter(c => c.role === 'club' || c.is_club);
        setClubs(onlyClubs);
      } catch {
        setClubs([]);
      } finally {
        setLoadingClubs(false);
      }
    })();

    return () => ac.abort();
  }, [norm, open]);

  /** ---- кэмпы выбранного клуба ---- */
  const [camps, setCamps] = useState<CampLite[]>([]);
  const [loadingCamps, setLoadingCamps] = useState(false);
  const [clubNotFound, setClubNotFound] = useState(false);

  const fetchCampsFor = useCallback((club: ClubMini) => {
    setLoadingCamps(true);
    setClubNotFound(false);
    // Новый безопасный эндпоинт подсказок — только «живые» кэмпы
    fetch(`${API}/api/clubs/${encodeURIComponent(club.username)}/camps/suggest/?q=`, { credentials: 'include' })
      .then(async r => {
        if (!r.ok) throw new Error(String(r.status));
        const data: unknown = await r.json();
        const raw: CampLite[] = Array.isArray((data as { camps?: unknown[] }).camps)
          ? ((data as { camps: CampLite[] }).camps)
          : [];
        const sorted = [...raw].sort((a, b) => {
          const ta = a.start_date ? +new Date(a.start_date) : 0;
          const tb = b.start_date ? +new Date(b.start_date) : 0;
          return tb - ta;
        });
        setCamps(sorted);
      })
      .catch(() => {
        setCamps([]);
        setClubNotFound(true);
      })
      .finally(() => setLoadingCamps(false));
  }, []);

  // выбор клуба из подсказки
  function chooseClub(c: ClubMini) {
    setSelectedClub(c);
    setQuery('');
    setClubs([]);
    setSuppressMenu(true);
    fetchCampsFor(c);

    setHasFocus(false);
    setTimeout(() => inputRef.current?.blur(), 0);
  }

  // «клуб не найден», если ввод есть, подсказок нет и выбранный клуб не совпадает
  useEffect(() => {
    if (!open) return;
    if (!norm) {
      setClubNotFound(false);
      return;
    }
    if (!loadingClubs && clubs.length === 0 && (!selectedClub || selectedClub.username.toLowerCase() !== norm.toLowerCase())) {
      setClubNotFound(true);
      setCamps([]);
    } else {
      setClubNotFound(false);
    }
  }, [norm, loadingClubs, clubs, selectedClub, open]);

  // при открытии — чистая сессия
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setClubs([]);
    setSelectedClub(null);
    setCamps([]);
    setClubNotFound(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  /** ---- чипсы «мои клубы» (оставляем мобильную вёрстку) ---- */
//   const [clubChips, setClubChips] = useState<ClubMini[]>([]);
//   const [loadingClubChips, setLoadingClubChips] = useState(false);

//   useEffect(() => {
//     if (!open) return;
//     let alive = true;
//     setLoadingClubChips(true);
//     (async () => {
//       try {
//         const listUrls = [
//           `${API}/api/my-clubs/`,
//           `${API}/api/clubs/?mine=1`,
//           `${API}/api/clubs/`,
//         ];
//         for (const u of listUrls) {
//           const r = await fetch(u, { credentials: 'include', cache: 'no-store' });
//           if (!r.ok) continue;
//           const d: unknown = await r.json();
//           const arr: ClubMini[] =
//             (Array.isArray(d) ? d : Array.isArray((d as { results?: unknown[] }).results) ? (d as { results: ClubMini[] }).results : []);
//           if (alive) setClubChips(arr);
//           break;
//         }
//       } catch {
//         if (alive) setClubChips([]);
//       } finally {
//         if (alive) setLoadingClubChips(false);
//       }
//     })();
//     return () => {
//       alive = false;
//     };
//   }, [open]);

  // аватарки и у чипсов
//   useEffect(() => {
//     clubChips.forEach(c => {
//       const src = toAbsUrl(c.avatar_url);
//       if (src) {
//         const i = new Image();
//         i.src = src;
//       }
//     });
//   }, [clubChips]);

  /** ---- динамическая высота списка кэмпов (мобилка) ---- */
  const [listH, setListH] = useState(360);
  const recomputeListH = useCallback(() => {
    if (typeof window === 'undefined') return;
    const vvp = (window as unknown as { visualViewport?: VisualViewportLike }).visualViewport;
    const vh = vvp?.height ?? window.innerHeight;

    const headerH = 48; // sticky header (h-12)
    const chipsH = 56; // приблизительная высота строки с чипсами
    const inputH = 48; // строка поиска (h-12 эквивалент)
    const gaps = 16 /* header->chips */ + 8 /* chips->input */ + 16 /* input->list mt-4 */ + 16 /* bottom padding */;
    const reserved = headerH + chipsH + inputH + gaps;

    let h = vh - reserved;
    const minH = 240;
    const softMax = Math.round(vh * 0.8);
    h = Math.max(minH, Math.min(h, softMax));
    setListH(h);
  }, []);

  useEffect(() => {
    if (!open) return;
    recomputeListH();
    const onResize = () => recomputeListH();
    window.addEventListener('resize', onResize);
    const vvp = (window as unknown as { visualViewport?: VisualViewportLike }).visualViewport;
    vvp?.addEventListener?.('resize', onResize);
    vvp?.addEventListener?.('scroll', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      vvp?.removeEventListener?.('resize', onResize);
      vvp?.removeEventListener?.('scroll', onResize);
    };
  }, [open, recomputeListH]);

  /** ---- меню автокомплита открыто? ---- */
  const menuOpen = open && hasFocus && !suppressMenu && !!norm && clubs.length > 0;

  /** ---- UI ---- */
  const headerTitle = 'Выбрать кэмп';

  return (
    <PseudoModal
      open={open}
      onClose={onClose}
      maxWidth={layout === 'fullscreen' ? 'max-w-none' : 'max-w-lg'}
      className={['tpm', 'px-4', layout === 'fullscreen' ? 'pt-3 pb-[max(env(safe-area-inset-bottom,0px),16px)]' : 'py-2'].join(' ')}
      lockScroll={false}
      layout={layout}
    >
      <div className="relative" data-tpm-panel>
        {/* Header */}
        <div className="sticky top-0 z-10 -mx-4 px-4 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b border-gray-200">
          <div className="h-12 flex items-center justify-between">
            <button type="button" onClick={onClose} aria-label="Закрыть" className="h-10 px-3 -ml-3 rounded-full text-gray-600 hover:bg-gray-100 active:scale-[0.98]">Закрыть</button>
            <div className="text-base font-semibold">{headerTitle}</div>
            <div className="w-[64px]" aria-hidden />
          </div>
        </div>

        {/* Clubs chips (mobile UX bonus)
        <div className="mt-3 overflow-x-auto no-scrollbar -mx-1 px-1">
          <div className="inline-flex gap-2">
            {loadingClubChips && (
              <span className="px-3 h-9 inline-flex items-center rounded-full bg-gray-100 text-gray-500 text-sm">Загружаю клубы…</span>
            )}
            {!loadingClubChips && clubChips.length === 0 && (
              <span className="px-3 h-9 inline-flex items-center rounded-full bg-gray-100 text-gray-500 text-sm">Клубы не найдены</span>
            )}
            {clubChips.map(c => (
              <button
                key={`chip-${c.id}`}
                type="button"
                onClick={() => chooseClub(c)}
                className={[
                  'h-9 px-3 rounded-full border text-[13px] whitespace-nowrap',
                  selectedClub?.id === c.id ? 'bg-black text-white border-black' : 'border-gray-200 text-gray-700 hover:bg-gray-50',
                ].join(' ')}
                title={c.title || c.username}
              >
                {c.title || `@${c.username}`}
              </button>
            ))}
          </div>
        </div> */}

        {/* Username input + dropdown (как на десктопе) */}
        <div ref={railRef} className="relative mt-2">
          <label htmlFor="club-lookup" className="sr-only">Имя профиля клуба</label>
          <div className="flex items-center gap-3 px-2 h-12 rounded-xl border border-gray-200 focus-within:border-gray-300 bg-white">
            {selectedClub && (
              <div className="flex items-center gap-2 shrink-0">
                <SmartImage
                  src={toAbsUrl(selectedClub.avatar_url) || ((process.env.NEXT_PUBLIC_BASE_PATH || '') + '/avatars/question3.jpg')}
                  alt=""
                  width={24}
                  height={24}
                  className="w-6 h-6 rounded-full object-cover"
                  sizes="24px"
                />
                <span className="text-sm">@{selectedClub.username}</span>
              </div>
            )}

            <input
              ref={inputRef}
              type="text"
              name="club_lookup"
              id="club-lookup"
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="text"
              enterKeyHint="search"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={menuOpen}
              aria-controls="club-suggest"
              placeholder={selectedClub ? 'Найти другой клуб' : 'Имя профиля клуба'}
              value={query}
              onFocus={() => setHasFocus(true)}
              onBlur={() => setHasFocus(false)}
              onChange={(e) => {
                setSuppressMenu(false);
                setQuery(e.target.value);
                if (selectedClub) {
                  setSelectedClub(null);
                  setCamps([]);
                }
              }}
              onKeyDown={(e) => { if (e.key === 'Escape') setSuppressMenu(true); }}
              className="w-full bg-transparent outline-none border-0 placeholder:text-gray-400 text-[15px]"
              data-1p-ignore
              data-lpignore="true"
              data-bwignore="true"
            />
          </div>

          {/* dropdown */}
          <FixedMenuPortal anchorRef={railRef} open={menuOpen} container={portalContainer}>
            <div
              id="club-suggest"
              data-ac-menu
              className="relative overflow-y-auto overscroll-contain max-h-[260px] border border-gray-200 rounded-xl bg-white shadow-xl"
              style={{ WebkitOverflowScrolling: 'touch' }}
              onWheelCapture={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                if (el.scrollHeight > el.clientHeight) e.stopPropagation();
              }}
              onTouchMoveCapture={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                if (el.scrollHeight > el.clientHeight) e.stopPropagation();
              }}
            >
              {clubs.map(c => {
                const placeholder = (process.env.NEXT_PUBLIC_BASE_PATH || '') + '/avatars/question3.jpg';
                const raw = (/^https?:\/\//i.test(c.avatar_url || '')) ? (c.avatar_url as string) : (c.avatar_url ? `${API}${c.avatar_url.startsWith('/') ? '' : '/'}${c.avatar_url}` : '');
                const imgSrc = brokenAvatars.has(c.id) ? placeholder : (raw || placeholder);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => chooseClub(c)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 text-left"
                  >
                    <SmartImage
                      src={imgSrc}
                      alt=""
                      width={28}
                      height={28}
                      className="w-7 h-7 rounded-full object-cover shrink-0"
                      sizes="28px"
                      onError={() => {
                        const cnt = (errorCountRef.current.get(c.id) ?? 0) + 1;
                        errorCountRef.current.set(c.id, cnt);
                        if (cnt >= 2) {
                          setBrokenAvatars(prev => {
                            if (prev.has(c.id)) return prev;
                            const next = new Set(prev);
                            next.add(c.id);
                            return next;
                          });
                        }
                      }}
                      onLoadingComplete={() => {
                        errorCountRef.current.delete(c.id);
                        setBrokenAvatars(prev => {
                          if (!prev.has(c.id)) return prev;
                          const next = new Set(prev);
                          next.delete(c.id);
                          return next;
                        });
                      }}
                    />
                    <span className="text-sm">@{c.username}</span>
                  </button>
                );
              })}
            </div>
          </FixedMenuPortal>
        </div>

        {/* Camps list with dynamic height */}
        <div className="mt-4">
          <div
            className="relative border border-gray-200 rounded-2xl overflow-hidden"
            style={{ height: `${Math.max(240, listH)}px` }}
          >
            <div
              className="absolute inset-0 overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: 'touch' }}
              onWheelCapture={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                if (el.scrollHeight > el.clientHeight) e.stopPropagation();
              }}
              onTouchMoveCapture={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                if (el.scrollHeight > el.clientHeight) e.stopPropagation();
              }}
            >
              {loadingClubs && !selectedClub && (
                <div className="px-3 py-2 text-sm text-gray-500">Ищу клубы…</div>
              )}

              {!selectedClub && clubNotFound && (
                <div className="px-3 py-2 text-sm text-gray-500">Клуб не найден</div>
              )}

              {!loadingCamps && selectedClub && camps.length === 0 && (
                <div className="px-3 py-2 text-sm text-gray-500">У клуба пока нет кэмпов</div>
              )}

              {loadingCamps && (
                <div className="px-3 py-2 text-sm text-gray-500">Загружаю кэмпы…</div>
              )}

              {!loadingCamps && selectedClub && camps.length > 0 && (
                <ul className="divide-y divide-gray-100">
                  {camps.map(c => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => { onPick(c); onClose(); }}
                        className="w-full text-left px-3 py-3 hover:bg-gray-50 active:bg-gray-100 flex items-baseline gap-2"
                      >
                        {campDate(c) && <span className="text-xs text-gray-500 shrink-0">{campDate(c)}</span>}
                        <span className="truncate text-sm text-gray-900">{c.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {!loadingCamps && !selectedClub && !clubNotFound && (
                <div className="px-3 py-2 text-sm text-gray-500">Найдите клуб по имени профиля</div>
              )}
            </div>
          </div>
        </div>

        <style jsx global>{`
          .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
          .no-scrollbar::-webkit-scrollbar { display: none; }
          :root { -webkit-tap-highlight-color: transparent; }
          input[type="search"]::-webkit-search-cancel-button { -webkit-appearance: none; display: none; }
          #club-lookup::placeholder { font-size: 0.9375rem; }
          #club-lookup::-webkit-input-placeholder { font-size: 0.9375rem; }
          #club-lookup::-moz-placeholder { font-size: 0.9375rem; }
          #club-lookup:-ms-input-placeholder { font-size: 0.9375rem; }
        `}</style>
      </div>
    </PseudoModal>
  );
}
