'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import SmartImage from '@/components/SmartImage';
import PseudoModal from '@/components/ui/PseudoModal';
import { FixedMenuPortal } from '@/components/ui/FixedMenuPortal';
import { campPathFrom } from '@/components/post/helpers/campPath';
import { getBrowserApiBase } from '@/lib/apiBase';

type ClubMini = {
    id: number;
    username: string;
    avatar_url?: string;
    role?: 'club' | 'client' | string;
    is_club?: boolean;
};

type CampLite = {
    id: number;
    title: string;
    start_date?: string;
    end_date?: string;
    // возможные поля, которые может отдать API
    public_key?: string | number;
    camp_number?: number;
    number?: number;
    slug?: string;
    key?: string | number;
    pk?: string | number;
    url?: string;
};


type CampItem = CampLite & {
    camp_owner_username?: string;
    camp_public_key?: string | number;
    camp_slug?: string;
    camp_url?: string;
    camp_number?: number | string;
};


type UsernameSuggestItem = {
    id: number; username: string; full_name?: string; avatar_url?: string;
};

const isUsernameSuggestItem = (v: unknown): v is UsernameSuggestItem =>
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { id?: unknown }).id === 'number' &&
    typeof (v as { username?: unknown }).username === 'string';

function enrichWithAvatars(base: ClubMini[], sugg: UsernameSuggestItem[]) {
    const map = new Map(sugg.map(s => [s.username.toLowerCase(), s.avatar_url]));
    return base.map(c => c.avatar_url ? c : { ...c, avatar_url: map.get(c.username.toLowerCase()) || c.avatar_url });
}

function campDate(c: CampLite) {
    if (c.start_date && c.end_date) return `${ddmmyy(c.start_date)} - ${ddmmyy(c.end_date)}`;
    if (c.start_date) return ddmmyy(c.start_date);
    return '';
}

function ddmmyy(d?: string) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(+dt)) return '';
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yy = String(dt.getFullYear()).slice(-2);
    return `${dd}.${mm}.${yy}`;
}




const API = getBrowserApiBase();

const toAbsUrl = (u?: string) => {
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    return `${API}${u.startsWith('/') ? '' : '/'}${u}`;
};

const toNumStrict = (v: unknown): number | undefined =>
    typeof v === 'number'
        ? v
        : (typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : undefined);

// Prefer API host for media-like relative avatar paths; handle gs:// later via SmartImage
const buildAvatarSrc = (raw?: string | null) => {
    const r = (raw || '').trim();
    if (!r) return '';
    if (/^https?:\/\//i.test(r)) return r;
    if (/^\/(media|uploads|profile_pictures|avatars?)\//i.test(r)) return `${API}${r.startsWith('/') ? '' : '/'}${r}`;
    return `${API}${r.startsWith('/') ? '' : '/'}${r}`;
};


export default function CampPickerOverlay({
    open, onClose, onPick, initialSelected, layout = 'centered',
}: {
    open: boolean;
    onClose: () => void;
    onPick: (camp: CampItem) => void;
    initialSelected?: { club?: ClubMini | null };
    layout?: 'centered' | 'fullscreen';
}) {
    /* ---------- club search ---------- */
    const [query, setQuery] = useState<string>('');
    const [clubs, setClubs] = useState<ClubMini[]>([]);
    const [loadingClubs, setLoadingClubs] = useState(false);
    const [selectedClub, setSelectedClub] = useState<ClubMini | null>(initialSelected?.club || null);
    const abortRef = useRef<AbortController | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const railRef = useRef<HTMLDivElement>(null);
    const [brokenAvatars, setBrokenAvatars] = useState<Set<number>>(new Set());
    const errorCountRef = useRef<Map<number, number>>(new Map());

    // При каждом открытии даём аватаркам шанс загрузиться заново
    useEffect(() => {
        if (!open) return;
        setBrokenAvatars(new Set());
        errorCountRef.current = new Map();
    }, [open]);

    useEffect(() => {
        clubs.forEach(c => {
            const src = buildAvatarSrc(c.avatar_url);
            if (src) { const i = new Image(); i.src = src; }
        });
    }, [clubs]);

    const [hasFocus, setHasFocus] = useState(false);
    const [suppressMenu, setSuppressMenu] = useState(false);

    // быстрый дебаунс
    const [typed, setTyped] = useState('');
    useEffect(() => {
        if (!open) return;
        const t = setTimeout(() => setTyped(query), 180);
        return () => clearTimeout(t);
    }, [query, open]);

    // sanitize: срезаем ведущий '@'
    const norm = useMemo(() => typed.replace(/^@+/, '').trim(), [typed]);

    // поиск клубов (только клубы)
    useEffect(() => {
        if (!open) return;
        if (!norm) { setClubs([]); abortRef.current?.abort(); return; }

        setLoadingClubs(true);
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        async function load() {
            try {
                const q = encodeURIComponent(norm);
                const [rSearch, rSuggest] = await Promise.allSettled([
                    fetch(`${API}/api/profiles/search?q=${q}&limit=100&role=club`, { credentials: 'include', signal: ac.signal }),
                    fetch(`${API}/api/username-suggest/?q=${q}&role=club&limit=100`, { credentials: 'include', signal: ac.signal }),
                ]);

                let searchList: ClubMini[] = [];
                if (rSearch.status === 'fulfilled' && rSearch.value.ok) {
                    const d1 = await rSearch.value.json();
                    if (Array.isArray(d1?.profiles)) searchList = d1.profiles as ClubMini[];
                }

                let suggestList: UsernameSuggestItem[] = [];
                if (rSuggest.status === 'fulfilled' && rSuggest.value.ok) {
                    const d2 = await rSuggest.value.json();
                    if (Array.isArray(d2?.results)) {
                        suggestList = (d2.results as unknown[]).filter(isUsernameSuggestItem) as UsernameSuggestItem[];
                    }
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
        }

        load();
        return () => ac.abort();
    }, [norm, open]);

    // контейнер для портала
    const [portalContainer, setPortalContainer] = useState<Element | null>(null);
    useEffect(() => {
        if (!open) { setPortalContainer(null); return; }
        const host = railRef.current?.closest('[data-tpm-panel]') as Element | null;
        setPortalContainer(host ?? document.body);
    }, [open]);

    /* ---------- camps of selected club ---------- */
    const [camps, setCamps] = useState<CampLite[]>([]);
    const [loadingCamps, setLoadingCamps] = useState(false);
    const [clubNotFound, setClubNotFound] = useState(false);

    const fetchCampsFor = useCallback((club: ClubMini) => {
        setLoadingCamps(true);
        setClubNotFound(false);
        // Используем новый эндпоинт подсказок — он возвращает только «живые» кэмпы
        fetch(`${API}/api/clubs/${encodeURIComponent(club.username)}/camps/suggest/?q=`, { credentials: 'include' })
            .then(async (r) => {
                if (!r.ok) throw new Error(String(r.status));
                const data = await r.json();
                const raw: CampLite[] = Array.isArray(data?.camps) ? data.camps : [];
                // suggest может не возвращать даты — сортировка устойчивая
                const sorted = [...raw].sort((a, b) => {
                    const ta = a.start_date ? +new Date(a.start_date) : 0;
                    const tb = b.start_date ? +new Date(b.start_date) : 0;
                    return tb - ta;
                });
                setCamps(sorted);
            })
            .catch(() => { setCamps([]); setClubNotFound(true); })
            .finally(() => setLoadingCamps(false));
    }, []);

    // выбор клуба из подсказок
    function chooseClub(c: ClubMini) {
        setSelectedClub(c);
        setQuery('');            // не вставляем @username
        setClubs([]);
        setSuppressMenu(true);
        fetchCampsFor(c);

        // снять визуальный фокус/каретку до следующего клика
        setHasFocus(false);
        setTimeout(() => inputRef.current?.blur(), 0);
    }

    // если пользователь что-то ввёл и подсказок нет → «клуб не найден»
    useEffect(() => {
        if (!open) return;
        if (!norm) { setClubNotFound(false); return; }
        if (!loadingClubs && clubs.length === 0 && (!selectedClub || selectedClub.username !== norm)) {
            setClubNotFound(true);
            setCamps([]);
        } else {
            setClubNotFound(false);
        }
    }, [norm, loadingClubs, clubs, selectedClub, open]);

    // при открытии — «чистая» сессия
    useEffect(() => {
        if (!open) return;
        setQuery('');
        setClubs([]);
        setSelectedClub(null);
        setCamps([]);
        setClubNotFound(false);
        setTimeout(() => inputRef.current?.focus(), 0);
    }, [open]);

    const menuOpen = open && hasFocus && !suppressMenu && !!norm && clubs.length > 0;

    type CampResolved = {
        camp_owner_username?: string;
        camp_public_key?: string | number;
        camp_slug?: string;
        camp_number?: number;
        camp_url?: string;
    };

    async function resolveCampExtras(owner: string, camp: CampLite): Promise<CampResolved> {
        // 0) Сначала пробуем собрать ссылку из уже известных кусочков (учитываем c.url)
        const cnPre = toNumStrict(camp.camp_number ?? camp.number);
        const directUrl = (camp as unknown as { camp_url?: string }).camp_url;
        const pre = campPathFrom(owner, {
            ...(cnPre !== undefined ? { camp_number: cnPre } : {}),
            slug: camp.slug,
            public_key: camp.public_key ?? camp.key ?? camp.pk,
            // backend теперь может отдавать camp_url
            url: camp.url ?? (typeof directUrl === 'string' ? directUrl : undefined),
        });
        if (pre) {
            const cn0 = toNumStrict(camp.camp_number ?? camp.number);
            return {
                camp_owner_username: owner,
                camp_public_key: camp.public_key ?? camp.key ?? camp.pk,
                camp_slug: camp.slug,
                ...(cn0 !== undefined ? { camp_number: cn0 } : {}),
                camp_url: pre,
            } as CampResolved;
        }

        // 1) Если не хватило данных — подгружаем детали по id
        const endpoints = [
            `${API}/api/camps/${camp.id}/`,
            // резервный путь по клубу может быть недоступен; оставим только общий /api/camps/:id/
        ];

        for (const ep of endpoints) {
            try {
                const r = await fetch(ep, { credentials: 'include', cache: 'no-store' });
                if (!r.ok) continue;
                const d = await r.json();

                const owner2 =
                    (d?.owner_username as string | undefined) ??
                    (d?.club_username as string | undefined) ??
                    owner;

                const num = (d?.camp_number ?? d?.number) as number | string | undefined;
                const slug = d?.slug as string | undefined;
                const pub = (d?.public_key ?? d?.key ?? d?.pk) as string | number | undefined;
                const cnFetch = toNumStrict(num);
                const url = (d?.url as string | undefined) ??
                    campPathFrom(owner2, { ...(cnFetch !== undefined ? { camp_number: cnFetch } : {}), slug, public_key: pub });

                if (url) {
                    const cn1 = toNumStrict(num);
                    return {
                        camp_owner_username: owner2,
                        camp_public_key: pub,
                        camp_slug: slug,
                        ...(cn1 !== undefined ? { camp_number: cn1 } : {}),
                        camp_url: url,
                    } as CampResolved;
                }
            } catch { /* try next endpoint */ }
        }

        // 2) Совсем крайний случай — ничего не нашли
        return { camp_owner_username: owner };
    }

    function toCampItem(c: Partial<CampItem> & Readonly<Record<string, unknown>>): CampItem {
        const r = c as Readonly<Record<string, unknown>>;
        const owner =
            (typeof c.camp_owner_username === 'string' && c.camp_owner_username) ||
            (typeof r['owner_username'] === 'string' && (r['owner_username'] as string)) ||
            (typeof r['ownerUsername'] === 'string' && (r['ownerUsername'] as string)) ||
            (typeof r['club_username'] === 'string' && (r['club_username'] as string)) ||
            (typeof r['organizer_username'] === 'string' && (r['organizer_username'] as string)) ||
            (typeof r['organizerUsername'] === 'string' && (r['organizerUsername'] as string)) ||
            (typeof r['owner'] === 'string' && (r['owner'] as string).replace(/^@+/, '')) ||
            undefined;

        const campNumber =
            (c.camp_number as number | string | undefined) ??
            (r['number'] as number | string | undefined) ??
            (r['campNumber'] as number | string | undefined);
        const publicKey =
            (c.camp_public_key as string | number | undefined) ??
            (r['public_key'] as string | number | undefined) ??
            (r['publicKey'] as string | number | undefined) ??
            (r['pk'] as string | number | undefined) ??
            (r['key'] as string | number | undefined);
        const slug =
            (c.camp_slug as string | undefined) ??
            (r['slug'] as string | undefined) ??
            (r['campSlug'] as string | undefined);

        let camp_url =
            (typeof c.camp_url === 'string' && c.camp_url) ||
            (typeof r['url'] === 'string' && (r['url'] as string)) ||
            undefined;
        if (!camp_url && owner) {
            // строим СТРОГО без fallback на id
            const cnItem = toNumStrict(campNumber);
            camp_url = campPathFrom(owner, {
                ...(cnItem !== undefined ? { camp_number: cnItem } : {}),
                public_key: publicKey,
                slug,
            });
        }

        const cn2 = toNumStrict(campNumber);
        return {
            id: c.id as number,
            title: c.title as string,
            start_date: c.start_date,
            end_date: c.end_date,
            camp_owner_username: owner,
            camp_public_key: publicKey,
            camp_slug: slug,
            ...(cn2 !== undefined ? { camp_number: cn2 } : {}),
            camp_url,
        } as CampItem;
    }

    const [resolvingCampId, setResolvingCampId] = useState<number | null>(null);

    return (
        <PseudoModal
            open={open}
            onClose={onClose}
            maxWidth="max-w-lg"
            className="tpm"
            lockScroll={false}
            layout={layout}
        >
            {/* === wrapper для абсолютного крестика === */}
            <div className="relative">
                {/* Кнопка закрытия (правый верхний угол) */}
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Закрыть"
                    title="Закрыть"
                    className="absolute top-0 right-0 h-0 w-2 rounded-full text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300 grid place-items-center"
                >
                    <span className="text-base leading-none">×</span>
                </button>


                <div className="text-base font-semibold mb-2 pr-8">Отметить кэмп</div>

                {/* username input + dropdown */}
                <div ref={railRef} className="relative">
                    <div className="flex items-center gap-9 px-1 py-2 border-b border-gray-200 focus-within:border-gray-300">
                        {selectedClub && (
                            <div className="flex items-center gap-2 shrink-0">
                                <SmartImage
                                    src={buildAvatarSrc(selectedClub.avatar_url) || ((process.env.NEXT_PUBLIC_BASE_PATH || '') + '/avatars/question3.jpg')}
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
                            className="w-full bg-transparent outline-none border-0 placeholder:text-gray-400 placeholder:text-sm appearance-none"
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
                            className="relative overflow-y-auto overscroll-contain max-h-[220px] border border-gray-200 rounded-md bg-white shadow-lg"
                            style={{ WebkitOverflowScrolling: 'touch' }}
                            onWheelCapture={(e) => {
                                const el = e.currentTarget;
                                if (el.scrollHeight > el.clientHeight) e.stopPropagation();
                            }}
                            onTouchMoveCapture={(e) => {
                                const el = e.currentTarget;
                                if (el.scrollHeight > el.clientHeight) e.stopPropagation();
                            }}
                        >
                            {clubs.map(c => {
                                const placeholder = (process.env.NEXT_PUBLIC_BASE_PATH || '') + '/avatars/question3.jpg';
                                const raw = toAbsUrl(c.avatar_url);
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

                {/* camps list */}
                <div className="mt-3 min-h-0">
                    <div
                        className="h-[220px] overflow-y-auto border border-gray-200 rounded-2xl"
                        style={{ WebkitOverflowScrolling: 'touch' }}
                        onWheelCapture={(e) => {
                            const el = e.currentTarget;
                            if (el.scrollHeight > el.clientHeight) e.stopPropagation();
                        }}
                        onTouchMoveCapture={(e) => {
                            const el = e.currentTarget;
                            if (el.scrollHeight > el.clientHeight) e.stopPropagation();
                        }}
                    >
                        {loadingCamps && (
                            <div className="px-3 py-2 text-sm text-gray-500">Загружаю кэмпы…</div>
                        )}

                        {!loadingCamps && selectedClub && camps.length === 0 && (
                            <div className="px-3 py-2 text-sm text-gray-500">У клуба пока нет кэмпов</div>
                        )}

                        {!selectedClub && clubNotFound && (
                            <div className="px-3 py-2 text-sm text-gray-500">Клуб не найден</div>
                        )}

                        {!loadingCamps && selectedClub && camps.length > 0 && (
                            <>
                                {camps.map(c => {
                                    const date = campDate(c);
                                    return (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={async () => {
                                                const owner = selectedClub?.username || '';
                                                setResolvingCampId(c.id);

                                                const extras = await resolveCampExtras(owner, c);

                                                try {
                                                    console.groupCollapsed('🧪 [CampPickerOverlay] onPick');
                                                    console.log('owner', owner);
                                                    console.log('camp.id', c.id, 'title', c.title);
                                                    console.log('dates', { start: c.start_date, end: c.end_date });
                                                    console.log('built camp_url', extras.camp_url);
                                                    console.groupEnd();
                                                } catch { }

                                                const cn3 = toNumStrict(c.camp_number ?? c.number);
                                                onPick(
                                                    toCampItem({
                                                        ...c,
                                                        camp_owner_username: extras.camp_owner_username || owner,
                                                        camp_public_key: extras.camp_public_key,
                                                        ...(cn3 !== undefined ? { camp_number: cn3 } : {}),
                                                        camp_slug: extras.camp_slug,
                                                        camp_url: extras.camp_url,
                                                    })
                                                );

                                                setResolvingCampId(null);
                                                onClose();
                                            }}

                                            className="w-full px-3 py-2 hover:bg-gray-50 text-left flex items-baseline gap-2"
                                        >
                                            {date && <span className="text-xs text-gray-500 shrink-0">{date}</span>}
                                            <span className="truncate">
                                                {resolvingCampId === c.id ? 'Подготовка ссылки…' : c.title}
                                            </span>
                                        </button>
                                    );
                                })}
                            </>
                        )}

                        {!loadingCamps && !selectedClub && !clubNotFound && (
                            <div className="px-3 py-2 text-sm text-gray-500">Найдите клуб по имени профиля</div>
                        )}
                    </div>
                </div>

                <style jsx global>{`
          input[type="search"]::-webkit-search-cancel-button { -webkit-appearance: none; display: none; }
          #club-lookup::placeholder { font-size: 0.875rem; }
          #club-lookup::-webkit-input-placeholder { font-size: 0.875rem; }
          #club-lookup::-moz-placeholder { font-size: 0.875rem; }
          #club-lookup:-ms-input-placeholder { font-size: 0.875rem; }
        `}</style>
            </div>
        </PseudoModal>
    );
}
