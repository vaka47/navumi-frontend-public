// components/post/PeoplePickerOverlay.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import SmartImage from '@/components/SmartImage';
import { absUrl } from '@/components/camp/campNormalize';
import PseudoModal from '@/components/ui/PseudoModal';
import { FixedMenuPortal } from '@/components/ui/FixedMenuPortal';
import { getBrowserApiBase } from '@/lib/apiBase';

type ProfileMini = { id: number; username: string; avatar_url?: string; role?: 'club' | 'client' | string };
type UsernameSuggestItem = { id: number; username: string; full_name?: string; avatar_url?: string };

const isUsernameSuggestItem = (v: unknown): v is UsernameSuggestItem =>
    typeof v === 'object' && v !== null &&
    typeof (v as { id?: unknown }).id === 'number' &&
    typeof (v as { username?: unknown }).username === 'string';

const API = getBrowserApiBase();
const PPDBG = true;
const dbg = (...args: unknown[]) => { try { if (typeof window !== 'undefined' && PPDBG) console.debug('[PeoplePicker][desktop]', ...args); } catch {} };

export default function PeoplePickerOverlay({
                                                open,
                                                onClose,
                                                initialSelected = [],
                                                onDone,
                                                limit = 10,
                                                layout = 'centered',
                                            }: {
    open: boolean;
    onClose: () => void;
    initialSelected?: ProfileMini[];
    onDone: (picked: ProfileMini[]) => void;
    limit?: number;
    layout?: 'centered' | 'fullscreen';
}) {
    const [picked, setPicked] = useState<ProfileMini[]>([]);
    useEffect(() => { if (open) setPicked(initialSelected ?? []); }, [open, initialSelected]);

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
    // считаем ошибки загрузки, чтобы не помечать «битой» картинку на первом фейле оптимизатора
    const errorCountRef = useRef<Map<number, number>>(new Map());

    // каждое открытие = новый шанс аватаркам
    useEffect(() => {
        if (!open) return;
        setBrokenAvatars(new Set());
        errorCountRef.current = new Map();
    }, [open]);

    const atLimit = picked.length >= limit; // NEW

    useEffect(() => {
        if (!open) return;
        const t = setTimeout(() => setTyped(query), 180);
        return () => clearTimeout(t);
    }, [query, open]);


    const pickedIds = useMemo(() => new Set(picked.map(p => p.id)), [picked]);
    const pickedNames = useMemo(
        () => new Set(picked.map(p => p.username.toLowerCase())),
        [picked]
    );


    const norm = useMemo(() => typed.replace(/^@+/, '').trim(), [typed]);

    useEffect(() => {
        if (!open) return;
        if (!norm || atLimit) { // NEW: если достигли лимит — вообще не ищем
            setResults([]);
            abortRef.current?.abort();
            return;
        }

        setLoading(true);
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        async function load() {
            try {
                const q = encodeURIComponent(norm);
                const [rSearch, rSuggest] = await Promise.allSettled([
                    fetch(`${API}/api/profiles/search?q=${q}&limit=100`, { credentials: 'include', signal: ac.signal }),
                    fetch(`${API}/api/username-suggest/?q=${q}&limit=100`,       { credentials: 'include', signal: ac.signal }),
                ]);

                // helper: normalize any record to ProfileMini
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
                    const d1 = await rSearch.value.json();
                    const arr: unknown[] = Array.isArray(d1?.profiles)
                        ? (d1.profiles as unknown[])
                        : (Array.isArray(d1) ? (d1 as unknown[]) : []);
                    searchList = arr.map(x => (x && typeof x === 'object') ? normProfile(x as Record<string, unknown>) : null)
                                     .filter((x): x is ProfileMini => !!x);
                }

                let suggestList: UsernameSuggestItem[] = [];
                if (rSuggest.status === 'fulfilled' && rSuggest.value.ok) {
                    const d2 = await rSuggest.value.json();
                    if (Array.isArray(d2?.results)) {
                        suggestList = (d2.results as unknown[]).filter(isUsernameSuggestItem) as UsernameSuggestItem[];
                    }
                }

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
                setResults(merged);
            } catch {
                setResults([]);
            } finally {
                setLoading(false);
            }
        }

        load();
        return () => ac.abort();
    }, [norm, open, atLimit]);

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


    const visibleResults = useMemo(
        () => results.filter(r => !pickedIds.has(r.id) && !pickedNames.has(r.username.toLowerCase())),
        [results, pickedIds, pickedNames]
    );


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
            // если упёрлись в лимит — гасим ввод/меню
            if (next.length >= limit) {         // NEW
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
        // после удаления ограничения снимутся автоматически (atLimit станет false)
    };

    // при достижении лимита — подчистим хвосты и выключим ввод
    useEffect(() => {                         // NEW
        if (!open) return;
        if (atLimit) {
            setQuery('');
            setTyped('');
            setResults([]);
            setSuppressMenu(true);
            setTimeout(() => inputRef.current?.blur(), 0);
        }
    }, [atLimit, open]);

    // при открытии
    useEffect(() => {
        if (!open) return;
        setQuery(''); setTyped(''); setResults([]); setSuppressMenu(false);
        setTimeout(() => {
            if (!atLimit) inputRef.current?.focus(); // NEW: не фокусим, если уже лимит
        }, 0);
    }, [open, atLimit]);

    return (
        <PseudoModal
            open={open}
            onClose={onClose}
            maxWidth="max-w-lg"
            className="tpm"
            lockScroll={false}
            closeOnBackdrop={false}
            closeOnEsc={false}
            layout={layout}
        >
            <div className="relative">
                {/* Крестик (отмена) */}
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Закрыть"
                    title="Закрыть"
                    className="absolute top-0 right-0 h-0 w-2 rounded-full text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300 grid place-items-center"
                >
                    <span className="text-base leading-none">×</span>
                </button>

                <div className="text-base font-semibold mb-2 pr-8">Отметить людей и клубы</div>

                {/* поиск */}
                <div ref={railRef} className="relative">
                    <div className="flex items-center gap-3 px-1 py-2 border-b border-gray-200 focus-within:border-gray-300">
                        <input
                            ref={inputRef}
                            /* ключевые отличия ↓ */
                            type="search"                               // ← search вместо text (Safari реже предлагает e-mail)
                            inputMode="search"
                            id="people-lookup"
                            name="people_lookup"
                            autoComplete="section-people new-password"  // ← изолируем секцию + «новый пароль» как в кэмп-пикере
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
                                    : (picked.length ? 'Добавить профиль' : 'Имя профиля') // ← убрали «@»
                            }
                            value={query}
                            disabled={atLimit}
                            onFocus={(e) => {
                                if (atLimit) { e.currentTarget.blur(); return; }
                                // на всякий случай дублируем, Safari иногда перечитывает attr на фокусе
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
                            className="w-full bg-transparent outline-none border-0 placeholder:text-gray-400 placeholder:text-sm appearance-none disabled:cursor-not-allowed disabled:text-gray-500"
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
                            className="relative overflow-y-auto overscroll-contain max-h-[220px] border border-gray-200 rounded-md bg-white shadow-lg"
                            style={{ WebkitOverflowScrolling: 'touch' }}
                            onWheelCapture={(e) => {
                                const el = e.currentTarget;
                                if (el.scrollHeight > el.clientHeight) e.stopPropagation(); // скроллим список, а не модалку
                            }}
                            onTouchMoveCapture={(e) => {
                                const el = e.currentTarget;
                                if (el.scrollHeight > el.clientHeight) e.stopPropagation(); // для iOS/мобилок
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
                                                    // SmartImage первым делом переключает картинку в unoptimized и триггерит повторную загрузку.
                                                    // признаём «битой» только на второй ошибке
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

                {/* выбранные */}
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
                        {picked.length === 0 && (
                            <div className="px-3 py-2 text-sm text-gray-500">Найдите и выберите профили</div>
                        )}

                        {picked.length > 0 && (
                            <div className="py-1">
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
                                    const placeholder = (process.env.NEXT_PUBLIC_BASE_PATH || '') + '/avatars/question3.jpg';
                                    return (
                                        <div key={p.id} className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-50">
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
                                                <SmartImage src={placeholder} alt="" width={28} height={28} className="w-7 h-7 rounded-full object-cover shrink-0" />
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
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between mt-3">
                        <div className="text-xs text-gray-500">{picked.length}/{limit} выбрано</div>
                        <button
                            type="button"
                            onClick={() => { onDone(picked); onClose(); }}
                            className="px-4 py-2 bg-black text-white rounded-full"
                        >
                            Готово
                        </button>
                    </div>
                </div>

                <style jsx global>{`
          input[type="search"]::-webkit-search-cancel-button { -webkit-appearance: none; display: none; }
          #people-lookup::placeholder { font-size: 0.875rem; }
          #people-lookup::-webkit-input-placeholder { font-size: 0.875rem; }
          #people-lookup::-moz-placeholder { font-size: 0.875rem; }
          #people-lookup:-ms-input-placeholder { font-size: 0.875rem; }
        `}</style>
            </div>
        </PseudoModal>
    );
}
