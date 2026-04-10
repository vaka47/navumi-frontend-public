// src/components/search/ActivityAutocompleteForPost.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FixedMenuPortal } from '@/components/ui/FixedMenuPortal';

interface Activity { id: number; name: string; }
interface Props {
    activities: Activity[];
    selectedActivities: string[];
    setSelectedActivities: (value: string[]) => void;
    placeholder?: string;
    maxSelectable?: number;
    noPadding?: boolean;
    showCloseButton?: boolean;
    fixedHeight?: string;
}

export default function ActivityAutocompleteForPost({
                                                        activities,
                                                        selectedActivities,
                                                        setSelectedActivities,
                                                        maxSelectable,
                                                        placeholder,
                                                        noPadding,
                                                        showCloseButton,
                                                        fixedHeight,
                                                    }: Props) {
    const [input, setInput] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const railRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const menuScrollRef = useRef<HTMLDivElement>(null); // 🔍 внутр. скроллер дропдауна
    const [menuMountKey, setMenuMountKey] = useState(0); // 🔁 изменяется, когда ref реально смонтировался

    const [scrollbarGutter, setScrollbarGutter] = useState(16);

    const placeholderText = isFocused
        ? 'Найдите активность'
        : (placeholder || 'Выберите активности');

    const isBigPlaceholder =
        !isFocused && input.trim() === '' && selectedActivities.length === 0;

    useEffect(() => {
        const onDocDown = (e: MouseEvent) => {
            const t = e.target as HTMLElement;
            if (t.closest('[data-ac-menu]')) return;
            if (containerRef.current && !containerRef.current.contains(t)) {
                setShowDropdown(false);
                setIsFocused(false);
                setInput(''); // 👈 очистка «лишних букв»
            }
        };
        document.addEventListener('mousedown', onDocDown);
        return () => document.removeEventListener('mousedown', onDocDown);
    }, []);

    // куда крепить портал — панель псевдомодалки, если есть
    const [portalContainer, setPortalContainer] = useState<Element | null>(null);
    useEffect(() => {
        const host =
            containerRef.current?.closest('[data-tpm-panel], [role="dialog"], [data-radix-dialog-content]') as Element | null;
        setPortalContainer(host ?? document.body);
    }, []);

    // фильтр
    const filtered = useMemo(() => {
        const base = input
            ? activities.filter(a =>
                a.name.toLowerCase().includes(input.toLowerCase()) &&
                !selectedActivities.includes(a.id.toString())
            )
            : activities.filter(a => !selectedActivities.includes(a.id.toString()));
        return base;
    }, [activities, input, selectedActivities]);

    // клик вне — закрываем, но клики по меню (data-ac-menu) игнорим
    useEffect(() => {
        const onDocDown = (e: MouseEvent) => {
            const t = e.target as HTMLElement;
            if (t.closest('[data-ac-menu]')) return;
            if (containerRef.current && !containerRef.current.contains(t)) {
                setShowDropdown(false);
                setIsFocused(false);
            }
        };
        document.addEventListener('mousedown', onDocDown);
        return () => document.removeEventListener('mousedown', onDocDown);
    }, []);

    // лимит
    useEffect(() => {
        if (maxSelectable && selectedActivities.length >= maxSelectable) {
            setShowDropdown(false);
        }
    }, [selectedActivities, maxSelectable]);

    function removeActivity(id: string) {
        setSelectedActivities(selectedActivities.filter(a => a !== id));
    }
    function addActivity(id: string) {
        setSelectedActivities([...selectedActivities, id]);
        setInput('');
        setShowDropdown(true);
        requestAnimationFrame(() => inputRef.current?.focus());
    }

    const selectedObjects = activities.filter(a => selectedActivities.includes(a.id.toString()));
    const menuOpen = showDropdown && filtered.length > 0;

    // ✅ callback-ref: дергаем key при реальном маунте/анмаунте узла скролла
    const setMenuScrollNode = useCallback((el: HTMLDivElement | null) => {
        menuScrollRef.current = el;
        setMenuMountKey(k => k + 1);
    }, []);

    useEffect(() => {
        const node = menuScrollRef.current;
        if (!menuOpen || !node) return;

        const calc = () => {
            // реальная ширина вертикального скролла (если overlay — будет 0)
            const sbw = node.offsetWidth - node.clientWidth;
            // даём минимум 12px «на глаз» + немного воздуха
            const pad = (sbw > 0 ? sbw : 12) + 6;
            setScrollbarGutter(pad);
        };

        calc();

        const ro = new ResizeObserver(calc);
        ro.observe(node);
        window.addEventListener('resize', calc);

        return () => {
            ro.disconnect();
            window.removeEventListener('resize', calc);
        };
    }, [menuOpen, menuMountKey]);

    // 🔍 ЛОГИ вертикального скролла, глобальные wheel/scroll и диагностический вывод
    useEffect(() => {
        const node = menuScrollRef.current;
        if (!menuOpen || !node) return;

        const nameOf = (el: EventTarget | null) => {
            if (!(el instanceof Element)) return String(el);
            const cls = el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).filter(Boolean).join('.') : '';
            return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls}`;
        };
        const sizes = (el: HTMLElement) => ({
            scrollTop: el.scrollTop,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            overflowY: getComputedStyle(el).overflowY,
        });

        const dumpScrollAncestors = (el: HTMLElement | null) => {
            const chain: Array<{i:number; tag:string; id?:string; cls?:string; oy?:string; sh?:number; ch?:number}> = [];
            let cur: HTMLElement | null = el;
            let i = 0;
            while (cur) {
                const cs = getComputedStyle(cur);
                chain.push({
                    i,
                    tag: cur.tagName.toLowerCase(),
                    id: cur.id || undefined,
                    cls: cur.className && typeof cur.className === 'string' ? cur.className : undefined,
                    oy: cs.overflowY,
                    sh: cur.scrollHeight,
                    ch: cur.clientHeight,
                });
                cur = cur.parentElement;
                i++;
                if (i > 15) break;
            }
            console.log('[AC_MENU scroll-ancestors]', chain);
        };

        console.log('[AC_MENU open sizes]', sizes(node));
        dumpScrollAncestors(node);

        // локальные слушатели
        const logWheelCap = (e: Event) => {
            const we = e as WheelEvent;
            console.log('[AC_MENU wheel CAPTURE]', { dY: we.deltaY, dX: we.deltaX, tgt: nameOf(e.target), cancelable: e.cancelable, defaultPrevented: e.defaultPrevented }, sizes(node));
        };
        const logWheel = (e: Event) => {
            const we = e as WheelEvent;
            console.log('[AC_MENU wheel]', { dY: we.deltaY, dX: we.deltaX, tgt: nameOf(e.target), cancelable: e.cancelable, defaultPrevented: e.defaultPrevented }, sizes(node));
        };
        const logScroll = () => {
            console.log('[AC_MENU scroll]', sizes(node));
        };
        const logTS = (e: TouchEvent) => {
            console.log('[AC_MENU touchstart]', { touches: e.touches.length, tgt: nameOf(e.target) }, sizes(node));
        };
        const logTM = (e: TouchEvent) => {
            console.log('[AC_MENU touchmove]', { touches: e.touches.length, cancelable: e.cancelable, defaultPrevented: e.defaultPrevented }, sizes(node));
        };

        // 🛞 ручной скролл на случай, если браузер не скроллит сам
        const manualWheel = (e: Event) => {
            const we = e as WheelEvent;
            const before = node.scrollTop;
            node.scrollTop = Math.max(0, Math.min(node.scrollTop + we.deltaY, node.scrollHeight - node.clientHeight));
            const changed = node.scrollTop !== before;
            if (changed && e.cancelable) {
                we.preventDefault();
            }
            if (changed) {
                console.log('[AC_MENU wheel->manualScroll]', { dY: we.deltaY, before, after: node.scrollTop });
            }
        };

        node.addEventListener('wheel', logWheelCap as EventListener, { capture: true, passive: false });
        node.addEventListener('wheel', logWheel as EventListener, { passive: false });
        node.addEventListener('wheel', manualWheel as EventListener, { passive: false }); // ← принудительный скролл
        node.addEventListener('scroll', logScroll as EventListener, { passive: true });
        node.addEventListener('touchstart', logTS as EventListener, { passive: true });
        node.addEventListener('touchmove', logTM as EventListener, { passive: false });

        // 🔭 родитель и корень портала
        const parent = node.parentElement;
        const rootPortal = parent?.closest('[data-ac-menu]') as HTMLElement | null;
        const parentWheel = (e: Event) => {
            const we = e as WheelEvent;
            console.log('[AC_PARENT wheel]', { dY: we.deltaY, dX: we.deltaX, tgt: nameOf(e.target) });
        };
        const rootWheelCap = (e: Event) => {
            const we = e as WheelEvent;
            console.log('[AC_ROOT wheel CAPTURE]', { dY: we.deltaY, dX: we.deltaX, tgt: nameOf(e.target) });
        };
        parent?.addEventListener('wheel', parentWheel as EventListener, { passive: true });
        rootPortal?.addEventListener('wheel', rootWheelCap as EventListener, { capture: true, passive: false });

        // 🌍 глобальные
        const winWheelCap = (e: Event) => {
            const we = e as WheelEvent;
            console.log('[WIN wheel CAPTURE]', { dY: we.deltaY, dX: we.deltaX, tgt: nameOf(e.target) });
        };
        const docWheelCap = (e: Event) => {
            const we = e as WheelEvent;
            console.log('[DOC wheel CAPTURE]', { dY: we.deltaY, dX: we.deltaX, tgt: nameOf(e.target) });
        };
        const bodyWheelCap = (e: Event) => {
            const we = e as WheelEvent;
            console.log('[BODY wheel CAPTURE]', { dY: we.deltaY, dX: we.deltaX, tgt: nameOf(e.target) });
        };
        const winScroll = () => console.log('[WIN scroll]');
        const docScroll = () => console.log('[DOC scroll]');
        const bodyScroll = () => console.log('[BODY scroll]');

        window.addEventListener('wheel', winWheelCap as EventListener, { capture: true });
        document.addEventListener('wheel', docWheelCap as EventListener, { capture: true });
        document.body.addEventListener('wheel', bodyWheelCap as EventListener, { capture: true });

        window.addEventListener('scroll', winScroll as EventListener, { capture: true });
        document.addEventListener('scroll', docScroll as EventListener, { capture: true });
        document.body.addEventListener('scroll', bodyScroll as EventListener, { capture: true });

        // 🧓 legacy события без any
        type LegacyWheelEvent = Event & { wheelDelta?: number; detail?: number };
        const legacyMouseWheel = (e: Event) => {
            const le = e as LegacyWheelEvent;
            console.log('[LEGACY mousewheel]', { wheelDelta: le.wheelDelta, tgt: nameOf(e.target) });
        };
        const legacyDomMouseScroll = (e: Event) => {
            const le = e as LegacyWheelEvent;
            console.log('[LEGACY DOMMouseScroll]', { detail: le.detail, tgt: nameOf(e.target) });
        };
        node.addEventListener('mousewheel', legacyMouseWheel as EventListener, { passive: false });
        node.addEventListener('DOMMouseScroll', legacyDomMouseScroll as EventListener, { passive: false });

        return () => {
            node.removeEventListener('wheel', logWheelCap as EventListener, true);
            node.removeEventListener('wheel', logWheel as EventListener);
            node.removeEventListener('wheel', manualWheel as EventListener);
            node.removeEventListener('scroll', logScroll as EventListener);
            node.removeEventListener('touchstart', logTS as EventListener);
            node.removeEventListener('touchmove', logTM as EventListener);

            parent?.removeEventListener('wheel', parentWheel as EventListener);
            rootPortal?.removeEventListener('wheel', rootWheelCap as EventListener, true);

            window.removeEventListener('wheel', winWheelCap as EventListener, true);
            document.removeEventListener('wheel', docWheelCap as EventListener, true);
            document.body.removeEventListener('wheel', bodyWheelCap as EventListener, true);

            window.removeEventListener('scroll', winScroll as EventListener, true);
            document.removeEventListener('scroll', docScroll as EventListener, true);
            document.body.removeEventListener('scroll', bodyScroll as EventListener, true);

            node.removeEventListener('mousewheel', legacyMouseWheel as EventListener);
            node.removeEventListener('DOMMouseScroll', legacyDomMouseScroll as EventListener);
        };
    }, [menuOpen, menuMountKey]); // ← перезапуск, когда узел реально появился

    // САМО МЕНЮ
    const menu = (
        <div className="p-2" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="flex flex-wrap gap-2">
                {filtered.map(activity => (
                    <button
                        key={activity.id}
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => addActivity(activity.id.toString())}
                        className="bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full cursor-pointer hover:bg-blue-200 transition"
                    >
                        {activity.name}
                    </button>
                ))}
            </div>

            {showCloseButton && (
                <button
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setShowDropdown(false); setIsFocused(false); setInput(''); }} // 👈 очистили
                    className="absolute top-1 right-3 text-gray-400 hover:text-black text-lg"
                    aria-label="Закрыть"
                >
                    ×
                </button>
            )}
        </div>
    );

    return (
        <div ref={containerRef} className={`relative w-full py-3 ${noPadding ? '' : 'px-4'}`}>
            <div className="w-full">
                <div
                    className="cursor-text"
                    onClick={(e) => {
                        const clickedOnTag = (e.target as HTMLElement).closest('[data-activity-tag]');
                        if (!clickedOnTag) {
                            setIsFocused(true);
                            setShowDropdown(true);
                            setTimeout(() => inputRef.current?.focus(), 0);
                        }
                    }}
                >
                    <div
                        ref={railRef}
                        className="overflow-x-auto no-scrollbar transition-all duration-300"
                        style={fixedHeight ? { height: fixedHeight } : { height: '27px' }}
                    >
                        <div className="row inline-flex items-center gap-2 px-1 w-max whitespace-nowrap">
                            {(isFocused || selectedActivities.length === 0) ? (
                                <input
                                    ref={inputRef}
                                    type="text"
                                    placeholder={placeholderText}
                                    value={input}
                                    onFocus={() => { setIsFocused(true); setShowDropdown(true); }}
                                    onChange={(e) => { setInput(e.target.value); setShowDropdown(true); }}
                                    onKeyDown={(e) => { if (e.key === 'Escape') { setInput(''); setShowDropdown(false); setIsFocused(false); }}}
                                    className={
                                        `flex-none w-36 min-w-[120px] border-none focus:outline-none bg-transparent leading-tight
     text-sm
     ${isBigPlaceholder ? 'placeholder:text-[15px] placeholder:font-medium' : 'placeholder:text-xs'}`
                                    }
                                />
                            ) : (
                                <div
                                    className="flex items-center text-gray-400 text-xs cursor-text pl-1"
                                    onClick={() => { setIsFocused(true); setShowDropdown(true); setTimeout(() => inputRef.current?.focus(), 0); }}
                                >
                                    ✏️ <span className="ml-1">ред.</span>
                                </div>
                            )}

                            <AnimatePresence initial={false}>
                                {selectedObjects.map((a) => (
                                    <motion.span
                                        key={a.id}
                                        data-activity-tag
                                        className="flex items-center bg-green-100 text-green-800 text-sm px-2 py-1 rounded-full flex-shrink-0"
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        exit={{ scale: 0 }}
                                        transition={{ duration: 0.2 }}
                                        layout
                                    >
                                        {a.name}
                                        <button
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => { removeActivity(a.id.toString()); inputRef.current?.focus(); }}
                                            className="ml-2 text-green-500 hover:text-green-700 focus:outline-none text-sm"
                                        >
                                            ×
                                        </button>
                                    </motion.span>
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>

            {/* Портал: внешняя обёртка держит max-height и overflow-y-auto — там и будет вертикальный скролл */}
            <FixedMenuPortal anchorRef={railRef} open={menuOpen} container={portalContainer}>
                <div
                    ref={setMenuScrollNode}
                    className="relative overflow-y-auto overscroll-contain max-h-64"
                    style={{
                        WebkitOverflowScrolling: 'touch',
                        overflowX: 'hidden',
                        touchAction: 'pan-y',
                        // ➕ вот он, «тонкий» правый отступ под бегунок
                        paddingRight: scrollbarGutter,
                    }}
                >
                    {menu}
                </div>
            </FixedMenuPortal>
        </div>
    );
}