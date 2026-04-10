'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SmartImage from '@/components/SmartImage';
import { absUrl } from '@/components/camp/campNormalize';
import PseudoModal from '@/components/ui/PseudoModal';
import { FixedMenuPortal } from '@/components/ui/FixedMenuPortal';
import { getBrowserApiBase } from '@/lib/apiBase';

/* ===== Types ===== */
type ProfileMini = { id: number; username: string; avatar_url?: string; role?: 'club' | 'client' | string };
type UsernameSuggestItem = { id: number; username: string; full_name?: string; avatar_url?: string };

const isUsernameSuggestItem = (v: unknown): v is UsernameSuggestItem =>
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { id?: unknown }).id === 'number' &&
    typeof (v as { username?: unknown }).username === 'string';

const API = getBrowserApiBase();
const PPDBG = true;
const dbg = (...args: unknown[]) => { try { if (typeof window !== 'undefined' && PPDBG) console.debug('[PeoplePicker][mobile]', ...args); } catch {} };

/** Safe VisualViewport type (без any) */
type VisualViewportLike = {
    height: number;
    addEventListener?: (type: 'resize' | 'scroll', cb: EventListenerOrEventListenerObject) => void;
    removeEventListener?: (type: 'resize' | 'scroll', cb: EventListenerOrEventListenerObject) => void;
};

export default function PeoplePickerOverlayMobile({
    open,
    onClose,
    initialSelected = [],
    onDone,
    limit = 10,
    layout = 'fullscreen',
}: {
    open: boolean;
    onClose: () => void;
    initialSelected?: ProfileMini[];
    onDone: (picked: ProfileMini[]) => void;
    limit?: number;
    layout?: 'centered' | 'fullscreen';
}) {
    /* ---- picked ---- */
    const [picked, setPicked] = useState<ProfileMini[]>([]);
    useEffect(() => { if (open) setPicked(initialSelected ?? []); }, [open, initialSelected]);

    /* ---- search state ---- */
    const [query, setQuery] = useState('');
    const [typed, setTyped] = useState('');
    const [results, setResults] = useState<ProfileMini[]>([]);
    const [loading, setLoading] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const railRef = useRef<HTMLDivElement>(null);
    const [hasFocus, setHasFocus] = useState(false);
    const [suppressMenu, setSuppressMenu] = useState(false);
    const [brokenAvatars, setBrokenAvatars] = useState<Set<number>>(new Set());
    const errorCountRef = useRef<Map<number, number>>(new Map());

    useEffect(() => {
        if (!open) return;
        setBrokenAvatars(new Set());
        errorCountRef.current = new Map();
    }, [open]);

    const atLimit = picked.length >= limit;

    // быстрый дебаунс ввода
    useEffect(() => {
        if (!open) return;
        const t = window.setTimeout(() => setTyped(query), 180);
        return () => window.clearTimeout(t);
    }, [query, open]);

    const pickedIds = useMemo(() => new Set(picked.map(p => p.id)), [picked]);
    const pickedNames = useMemo(() => new Set(picked.map(p => p.username.toLowerCase())), [picked]);

    // sanitize: убираем ведущие '@'
    const norm = useMemo(() => typed.replace(/^@+/, '').trim(), [typed]);

    // поиск (как на десктопе)
    useEffect(() => {
        if (!open) return;
        if (!norm || atLimit) {
            setResults([]);
            abortRef.current?.abort();
            return;
        }

        setLoading(true);
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        (async () => {
            try {
                const q = encodeURIComponent(norm);
                const [rSearch, rSuggest] = await Promise.allSettled([
                    fetch(`${API}/api/profiles/search?q=${q}&limit=100`, { credentials: 'include', signal: ac.signal }),
                    fetch(`${API}/api/username-suggest/?q=${q}&limit=100`, { credentials: 'include', signal: ac.signal }),
                ]);

                const pick = (obj: Record<string, unknown>, keys: string[]): string | undefined => {
                    for (const k of keys) {
                        const v = obj[k];
                        if (typeof v === 'string' && v.trim()) return v;
                    }
                    return undefined;
                };
                const normProfile = (rec: Record<string, unknown>): ProfileMini | null => {
                    const idRaw = rec['id'];
                    const id = typeof idRaw === 'number' ? idRaw : Number(idRaw ?? 0);
                    const username = typeof rec['username'] === 'string' ? rec['username'] : '';
                    if (!username) return null;
                    const avatar_url = pick(rec, ['avatar_url', 'avatar', 'profile_picture', 'picture']);
                    const role = pick(rec, ['role']) as string | undefined;
                    return { id, username, avatar_url, role };
                };

                let searchList: ProfileMini[] = [];
                if (rSearch.status === 'fulfilled' && rSearch.value.ok) {
                    const d1: unknown = await rSearch.value.json();
                    const arr: unknown[] = Array.isArray((d1 as { profiles?: unknown[] }).profiles)
                        ? ((d1 as { profiles: unknown[] }).profiles)
                        : (Array.isArray(d1) ? (d1 as unknown[]) : []);
                    searchList = arr.map(x => (x && typeof x === 'object') ? normProfile(x as Record<string, unknown>) : null)
                                     .filter((x): x is ProfileMini => !!x);
                }

                let suggestList: UsernameSuggestItem[] = [];
                if (rSuggest.status === 'fulfilled' && rSuggest.value.ok) {
                    const d2: unknown = await rSuggest.value.json();
                    const raw = (d2 && typeof d2 === 'object' ? (d2 as { results?: unknown[] }).results : undefined) || [];
                    suggestList = (Array.isArray(raw) ? raw : []).filter(isUsernameSuggestItem);
                }

                // merge: по username, подтягиваем avatar_url из suggest
                const byName = new Map<string, ProfileMini>();
                searchList.forEach(p => byName.set(p.username.toLowerCase(), p));
                suggestList.forEach(s => {
                    const key = s.username.toLowerCase();
                    if (!byName.has(key)) byName.set(key, { id: s.id, username: s.username, avatar_url: s.avatar_url });
                    else {
                        const prev = byName.get(key)!;
                        if (!prev.avatar_url && s.avatar_url) prev.avatar_url = s.avatar_url;
                    }
                });

                const merged = Array.from(byName.values());
                dbg('merged results', merged.slice(0, 8).map(u => ({ u: u.username, avatar: u.avatar_url, role: u.role })));
                setResults(merged);
            } catch {
                setResults([]);
            } finally {
                setLoading(false);
            }
        })();

        return () => ac.abort();
    }, [norm, open, atLimit]);

    // прогреваем аватарки найденных
    useEffect(() => {
        results.forEach(p => {
            const raw = p.avatar_url || '';
            const src = (() => {
                if (!raw) return '';
                if (/^https?:\/\//i.test(raw)) return raw;
                if (/^\/(media|uploads|profile_pictures|avatars?)\//i.test(raw)) {
                    return `${API}${raw.startsWith('/') ? '' : '/'}${raw}`;
                }
                const pre = absUrl(raw);
                return pre || `${API}${raw.startsWith('/') ? '' : '/'}${raw}`;
            })();
            if (src) { const i = new Image(); i.src = src; }
        });
    }, [results, API]);

    // отсекаем уже выбранных
    const visibleResults = useMemo(
        () => results.filter(r => !pickedIds.has(r.id) && !pickedNames.has(r.username.toLowerCase())),
        [results, pickedIds, pickedNames]
    );

    // контейнер для портала дропдауна
    const [portalContainer, setPortalContainer] = useState<Element | null>(null);
    useEffect(() => {
        if (!open) { setPortalContainer(null); return; }
        const host = railRef.current?.closest('[data-tpm-panel]') as Element | null;
        setPortalContainer(host ?? document.body);
    }, [open]);

    const menuOpen = open && hasFocus && !suppressMenu && !!norm && visibleResults.length > 0 && !atLimit;

    const addProfile = useCallback((p: ProfileMini) => {
        setPicked(prev => {
            if (prev.find(x => x.id === p.id)) return prev;
            const next = [...prev, p];
            if (next.length >= limit) {
                setQuery('');
                setTyped('');
                setResults([]);
                setSuppressMenu(true);
                setTimeout(() => inputRef.current?.blur(), 0);
            }
            return next;
        });
        setQuery('');
        setTyped('');
        setResults([]);
        setSuppressMenu(true);
        setTimeout(() => inputRef.current?.blur(), 0);
    }, [limit]);

    const removeProfile = (id: number) => {
        setPicked(prev => prev.filter(x => x.id !== id));
    };

    // при лимите — блокируем ввод
    useEffect(() => {
        if (!open) return;
        if (atLimit) {
            setQuery('');
            setTyped('');
            setResults([]);
            setSuppressMenu(true);
            setTimeout(() => inputRef.current?.blur(), 0);
        }
    }, [atLimit, open]);

    // при открытии — чистая сессия и фокус, если нет лимита
    useEffect(() => {
        if (!open) return;
        setQuery(''); setTyped(''); setResults([]); setSuppressMenu(false);
        setTimeout(() => { if (!atLimit) inputRef.current?.focus(); }, 0);
    }, [open, atLimit]);

    /* ---- динамическая высота основного (нижнего) списка ---- */
    // ---- динамическая высота основного (нижнего) списка ----
    const [listH, setListH] = useState(320);
    const recomputeListH = useCallback(() => {
        if (typeof window === 'undefined') return;
        const vv = (window as unknown as { visualViewport?: VisualViewportLike }).visualViewport;
        const vh = vv?.height ?? window.innerHeight;

        // sticky header + поле ввода + отступы + «итого/Готово» + safe-area
        const headerH = 48; // h-12
        const inputH = 48; // h-12
        const footerH = 56; // строка с количеством и кнопкой
        const gaps = 12 /* mt-3 под хедером */ + 16 /* input->list mt-4 */ + 12 /* нижний внутренний отступ */;
        const safe = vv ? Math.max(vv.height - window.innerHeight, 0) : 0;

        let h = vh - (headerH + inputH + footerH + gaps + safe);

        const minH = 200;
        const softMax = Math.round(vh * 0.73);
        h = Math.max(minH, Math.min(h, softMax));

        const hairlineFix = 5; // 👈 буквально пару пикселей, чтобы не появлялся вертикальный скролл страницы
        setListH(Math.max(minH, h - hairlineFix));
    }, []);


    useEffect(() => {
        if (!open) return;
        recomputeListH();
        const onResize = () => recomputeListH();
        window.addEventListener('resize', onResize);
        const vv = (window as unknown as { visualViewport?: VisualViewportLike }).visualViewport;
        vv?.addEventListener?.('resize', onResize);
        vv?.addEventListener?.('scroll', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
            vv?.removeEventListener?.('resize', onResize);
            vv?.removeEventListener?.('scroll', onResize);
        };
    }, [open, recomputeListH]);

    /* ---- UI ---- */
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
                        <button type="button" onClick={onClose} aria-label="Закрыть" className="h-10 px-3 -ml-3 rounded-full text-gray-600 hover:bg-gray-100 active:scale-[0.98]">
                            Закрыть
                        </button>
                        <div className="text-base font-semibold">Отметить людей</div>
                        <div className="w-[64px]" aria-hidden />
                    </div>
                </div>

                {/* Поисковая строка с автокомплитом (как на десктопе) */}
                <div ref={railRef} className="relative mt-3">
                    <label htmlFor="people-lookup" className="sr-only">Имя профиля</label>
                    <div className="flex items-center gap-3 px-2 h-12 rounded-xl border border-gray-200 focus-within:border-gray-300 bg-white">
                        <span className="text-gray-400 text-lg" aria-hidden>🔎</span>
                        <input
                            ref={inputRef}
                            type="search"
                            inputMode="search"
                            id="people-lookup"
                            name="people_lookup"
                            autoComplete="section-people new-password"
                            autoCorrect="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            enterKeyHint="search"
                            role="combobox"
                            aria-autocomplete="list"
                            aria-expanded={menuOpen}
                            aria-controls="people-suggest"
                            placeholder={
                                atLimit
                                    ? 'можно отметить не более 10 пользователей'
                                    : (picked.length ? 'Добавить профиль' : 'Имя профиля')
                            }
                            value={query}
                            disabled={atLimit}
                            onFocus={(e) => {
                                if (atLimit) { e.currentTarget.blur(); return; }
                                // дублируем атрибут, Safari любит забывать
                                e.currentTarget.setAttribute('autocomplete', 'section-people new-password');
                                setHasFocus(true);
                            }}
                            onBlur={() => setHasFocus(false)}
                            onChange={(e) => {
                                if (atLimit) return;
                                setSuppressMenu(false);
                                setQuery(e.target.value);
                            }}
                            onKeyDown={(e) => { if (e.key === 'Escape') setSuppressMenu(true); }}
                            className="w-full bg-transparent outline-none border-0 placeholder:text-gray-400 text-[15px] disabled:cursor-not-allowed disabled:text-gray-500"
                            data-1p-ignore
                            data-lpignore="true"
                            data-bwignore="true"
                            aria-disabled={atLimit}
                            title={atLimit ? 'можно отметить не более 10 пользователей' : undefined}
                        />
                    </div>

                    {/* dropdown */}
                    <FixedMenuPortal anchorRef={railRef} open={menuOpen} container={portalContainer}>
                        <div
                            id="people-suggest"
                            data-ac-menu
                            className="relative overflow-y-auto overscroll-contain max-h-[320px] border border-gray-200 rounded-xl bg-white shadow-xl"
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
                            {visibleResults.map(p => {
                                const raw = p.avatar_url || '';
                                const src = (() => {
                                    if (!raw) return '';
                                    if (/^https?:\/\//i.test(raw)) { dbg('render:http', { u: p.username, raw }); return raw; }
                                    if (/^\/(media|uploads|profile_pictures|avatars?)\//i.test(raw)) {
                                        const s = `${API}${raw.startsWith('/') ? '' : '/'}${raw}`;
                                        dbg('render:api-rel', { u: p.username, raw, out: s });
                                        return s;
                                    }
                                    const pre = absUrl(raw);
                                    const s = pre || `${API}${raw.startsWith('/') ? '' : '/'}${raw}`;
                                    dbg('render:absUrl-or-api', { u: p.username, raw, pre, out: s });
                                    return s;
                                })();
                                const showAvatar = !!src && !brokenAvatars.has(p.id);
                                const placeholder = (process.env.NEXT_PUBLIC_BASE_PATH || '') + '/avatars/question3.jpg';
                                return (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => addProfile(p)}
                                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 text-left"
                                    >
                                        {showAvatar ? (
                                            <SmartImage
                                                src={src}
                                                alt=""
                                                width={28}
                                                height={28}
                                                className="w-7 h-7 rounded-full object-cover shrink-0"
                                                    onError={() => {
                                                        const cnt = (errorCountRef.current.get(p.id) ?? 0) + 1;
                                                        errorCountRef.current.set(p.id, cnt);
                                                        dbg('img-error', { u: p.username, src, cnt });
                                                        if (cnt >= 2) setBrokenAvatars(prev => new Set(prev).add(p.id));
                                                    }}
                                                    onLoadingComplete={() => {
                                                        dbg('img-ok', { u: p.username, src });
                                                        errorCountRef.current.delete(p.id);
                                                        setBrokenAvatars(prev => {
                                                            if (!prev.has(p.id)) return prev;
                                                            const next = new Set(prev);
                                                            next.delete(p.id);
                                                            return next;
                                                        });
                                                    }}
                                                    />
                                        ) : (
                                            <SmartImage src={placeholder} alt="" width={28} height={28} className="w-7 h-7 rounded-full object-cover shrink-0" />
                                        )}
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm">@{p.username}</span>
                                            {p.role && <span className="text-xs text-gray-400">{p.role === 'club' ? 'club' : 'client'}</span>}
                                        </div>
                                    </button>
                                );
                            })}
                            {!loading && norm && visibleResults.length === 0 && (
                                <div className="px-3 py-2 text-sm text-gray-500">Профиль не найден</div>
                            )}
                            {loading && <div className="px-3 py-2 text-sm text-gray-500">Ищу…</div>}
                        </div>
                    </FixedMenuPortal>
                </div>

                {/* Список выбранных (динамичная высота) */}
                <div className="mt-4 min-h-0">
                    <div
                        className="relative border border-gray-200 rounded-2xl overflow-hidden"
                        style={{ height: `${Math.max(200, listH)}px` }}
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
                            {picked.length === 0 && (
                                <div className="px-3 py-3 text-sm text-gray-500">Найдите и выберите профили</div>
                            )}

                            {picked.length > 0 && (
                                <ul className="divide-y divide-gray-100">
                                    {picked.map(p => {
                                        const raw = p.avatar_url || '';
                                        const src = (() => {
                                            if (!raw) return '';
                                            if (/^https?:\/\//i.test(raw)) { dbg('picked:http', { u: p.username, raw }); return raw; }
                                            if (/^\/(media|uploads|profile_pictures|avatars?)\//i.test(raw)) {
                                                const s = `${API}${raw.startsWith('/') ? '' : '/'}${raw}`;
                                                dbg('picked:api-rel', { u: p.username, raw, out: s });
                                                return s;
                                            }
                                            const pre = absUrl(raw);
                                            const s = pre || `${API}${raw.startsWith('/') ? '' : '/'}${raw}`;
                                            dbg('picked:absUrl-or-api', { u: p.username, raw, pre, out: s });
                                            return s;
                                        })();
                                        const showAvatar = !!src && !brokenAvatars.has(p.id);
                                        return (
                                            <li key={p.id}>
                                                <div className="w-full px-3 py-3 flex items-center gap-3">
                                                    {showAvatar ? (
                                                        <SmartImage
                                                            src={src}
                                                            alt=""
                                                            width={28}
                                                            height={28}
                                                            className="w-7 h-7 rounded-full object-cover shrink-0"
                                                            onError={() => {
                                                                const cnt = (errorCountRef.current.get(p.id) ?? 0) + 1;
                                                                errorCountRef.current.set(p.id, cnt);
                                                                dbg('picked-img-error', { u: p.username, src, cnt });
                                                                if (cnt >= 2) setBrokenAvatars(prev => new Set(prev).add(p.id));
                                                            }}
                                                            onLoadingComplete={() => {
                                                                dbg('picked-img-ok', { u: p.username, src });
                                                                errorCountRef.current.delete(p.id);
                                                                setBrokenAvatars(prev => {
                                                                    if (!prev.has(p.id)) return prev;
                                                                    const next = new Set(prev);
                                                                    next.delete(p.id);
                                                                    return next;
                                                                });
                                                            }}
                                                        />
                                                    ) : (
                                                        <SmartImage src={(process.env.NEXT_PUBLIC_BASE_PATH || '') + '/avatars/question3.jpg'} alt="" width={28} height={28} className="w-7 h-7 rounded-full object-cover shrink-0" />
                                                    )}
                                                    <span className="text-sm truncate">@{p.username}</span>
                                                    {p.role && <span className="text-xs text-gray-400 ml-1">{p.role === 'club' ? 'club' : 'client'}</span>}
                                                    <button
                                                        type="button"
                                                        onClick={() => removeProfile(p.id)}
                                                        className="ml-auto text-gray-400 hover:text-gray-700"
                                                        aria-label="Удалить"
                                                        title="Удалить"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </div>

                    {/* Итоги + Готово */}
                    <div className="flex items-center justify-between mt-3">
                        <div className="text-xs text-gray-500">{picked.length}/{limit} выбрано</div>
                        <button
                            type="button"
                            onClick={() => { onDone(picked); onClose(); }}
                            className="px-5 py-3 rounded-full text-sm font-semibold bg-black text-white hover:bg-black/80"
                        >
                            Готово
                        </button>
                    </div>
                </div>

                <style jsx global>{`
          .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
          .no-scrollbar::-webkit-scrollbar { display: none; }
          :root { -webkit-tap-highlight-color: transparent; }
          input[type="search"]::-webkit-search-cancel-button { -webkit-appearance: none; display: none; }
          #people-lookup::placeholder { font-size: 0.9375rem; }
          #people-lookup::-webkit-input-placeholder { font-size: 0.9375rem; }
          #people-lookup::-moz-placeholder { font-size: 0.9375rem; }
          #people-lookup:-ms-input-placeholder { font-size: 0.9375rem; }
        `}</style>
            </div>
        </PseudoModal>
    );
}
