// src/components/post/HashtagAutocompleteForPost.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FixedMenuPortal } from '@/components/ui/FixedMenuPortal';

interface Hashtag { id: number; name: string }

type Props = {
    hashtags: Hashtag[];
    selectedHashtags: string[];
    setSelectedHashtags: (value: string[]) => void;
    placeholder?: string;
    maxSelectable?: number;
    noPadding?: boolean;
    showCloseButton?: boolean;
    fixedHeight?: string;
    input?: string;
    setInput?: (value: string) => void;
};

export default function HashtagAutocompleteForPost({
                                                       hashtags,
                                                       selectedHashtags,
                                                       setSelectedHashtags,
                                                       placeholder = '🏷️  Хэштеги', // ⬅️ крупный базовый плейсхолдер
                                                       maxSelectable,
                                                       noPadding,
                                                       showCloseButton,
                                                       fixedHeight,
                                                       input: externalInput,
                                                       setInput: setExternalInput,
                                                   }: Props) {
    const DEBUG = false;

    // управляемый/неуправляемый ввод
    const [internalInput, setInternalInput] = useState('');
    const input = externalInput ?? internalInput;
    const setInput = setExternalInput ?? setInternalInput;

    const [showDropdown, setShowDropdown] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const railRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // меню-скролл
    const menuScrollRef = useRef<HTMLDivElement>(null);
    const [menuMountKey, setMenuMountKey] = useState(0);
    const setMenuScrollNode = useCallback((el: HTMLDivElement | null) => {
        menuScrollRef.current = el;
        setMenuMountKey((k) => k + 1);
    }, []);

    // Крупный/маленький плейсхолдер
    const placeholderText = isFocused ? 'Найдите хэштеги' : (placeholder || 'Хэштеги');
    const isBigPlaceholder =
        !isFocused && input.trim() === '' && selectedHashtags.length === 0;

    // Куда крепить портал
    const [portalContainer, setPortalContainer] = useState<Element | null>(null);
    useEffect(() => {
        const host =
            containerRef.current?.closest('[data-tpm-panel], [role="dialog"], [data-radix-dialog-content]') ?? null;
        setPortalContainer((host as Element | null) ?? document.body);
    }, []);

    // Фильтрация
    const filtered = useMemo(() => {
        const q = input.trim().toLowerCase();
        const base = q
            ? hashtags.filter(
                (h) => h.name.toLowerCase().includes(q) && !selectedHashtags.includes(String(h.id)),
            )
            : hashtags.filter((h) => !selectedHashtags.includes(String(h.id)));
        return base;
    }, [hashtags, input, selectedHashtags]);

    // Клик вне
    useEffect(() => {
        const onDocDown = (e: MouseEvent) => {
            const t = e.target as HTMLElement;
            if (t.closest('[data-ac-menu]')) return;
            if (containerRef.current && !containerRef.current.contains(t)) {
                setShowDropdown(false);
                setIsFocused(false);
                setInput('');            // ← чистим «лишние буквы»
            }
        };
        document.addEventListener('mousedown', onDocDown);
        return () => document.removeEventListener('mousedown', onDocDown);
    }, [setInput]);

    // Лимит
    useEffect(() => {
        if (maxSelectable && selectedHashtags.length >= maxSelectable) setShowDropdown(false);
    }, [selectedHashtags, maxSelectable]);

    function removeHashtag(id: string) {
        setSelectedHashtags(selectedHashtags.filter((h) => h !== id));
    }
    function addHashtag(id: string) {
        if (maxSelectable && selectedHashtags.length >= maxSelectable) return;
        setSelectedHashtags([...selectedHashtags, id]);
        setInput('');
        setShowDropdown(true);
        requestAnimationFrame(() => inputRef.current?.focus());
    }

    const selectedObjects = useMemo(
        () => hashtags.filter((h) => selectedHashtags.includes(String(h.id))),
        [hashtags, selectedHashtags],
    );
    const menuOpen = showDropdown && filtered.length > 0;

    // Внутренний скролл меню (+ отладка по желанию)
    useEffect(() => {
        const node = menuScrollRef.current;
        if (!menuOpen || !node) return;

        const manualWheel = (e: WheelEvent) => {
            const before = node.scrollTop;
            node.scrollTop = Math.max(0, Math.min(node.scrollTop + e.deltaY, node.scrollHeight - node.clientHeight));
            if (node.scrollTop !== before && e.cancelable) e.preventDefault();
        };
        node.addEventListener('wheel', manualWheel as EventListener, { passive: false });

        let cleanupDebug = () => {};
        if (DEBUG) {
            const logScroll = () => console.log('[TAG_MENU scroll]', { st: node.scrollTop });
            node.addEventListener('scroll', logScroll as EventListener, { passive: true });
            cleanupDebug = () => node.removeEventListener('scroll', logScroll as EventListener);
        }

        return () => {
            node.removeEventListener('wheel', manualWheel as EventListener);
            cleanupDebug();
        };
    }, [menuOpen, menuMountKey, DEBUG]);

    // Меню
    const menu = (
        <div className="p-2" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="flex flex-wrap gap-2">
                {filtered.map((hashtag) => (
                    <button
                        key={hashtag.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addHashtag(String(hashtag.id))}
                        className="bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full cursor-pointer hover:bg-blue-200 transition"
                    >
                        #{hashtag.name}
                    </button>
                ))}
            </div>

            {showCloseButton && (
                <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setShowDropdown(false); setIsFocused(false); setInput(''); }} // ← тоже чистим
                    className="absolute top-1 right-1 text-gray-400 hover:text-black text-lg"
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
                        const clickedOnTag = (e.target as HTMLElement).closest('[data-hashtag-tag]');
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
                            {(isFocused || selectedHashtags.length === 0) ? (
                                <input
                                    ref={inputRef}
                                    type="text"
                                    placeholder={placeholderText}
                                    value={input}
                                    onFocus={() => { setIsFocused(true); setShowDropdown(true); }}
                                    onChange={(e) => { setInput(e.target.value); setShowDropdown(true); }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Escape') { setInput(''); setShowDropdown(false); setIsFocused(false); }
                                    }}
                                    className={
                                        `flex-none w-36 min-w-[120px] border-none focus:outline-none bg-transparent leading-tight
                     text-sm
                     ${isBigPlaceholder ? 'placeholder:text-[15px] placeholder:font-medium' : 'placeholder:text-xs'}`
                                    }
                                />
                            ) : (
                                <div
                                    className="flex items-center text-gray-400 text-xs cursor-text pl-1" // ← маленький «ред.»
                                    onClick={() => { setIsFocused(true); setShowDropdown(true); setTimeout(() => inputRef.current?.focus(), 0); }}
                                >
                                    ✏️ <span className="ml-1">ред.</span>
                                </div>
                            )}

                            <AnimatePresence initial={false}>
                                {selectedObjects.map((h) => (
                                    <motion.span
                                        key={h.id}
                                        data-hashtag-tag
                                        className="flex items-center bg-green-100 text-green-800 text-sm px-2 py-1 rounded-full flex-shrink-0"
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        exit={{ scale: 0 }}
                                        transition={{ duration: 0.2 }}
                                        layout
                                    >
                                        #{h.name}
                                        <button
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => { removeHashtag(String(h.id)); inputRef.current?.focus(); }}
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

            {/* Портал: вертикальный скролл держим здесь */}
            <FixedMenuPortal anchorRef={railRef} open={menuOpen} container={portalContainer}>
                <div
                    ref={setMenuScrollNode}
                    className="relative overflow-y-auto overscroll-contain max-h-64"
                    style={{ WebkitOverflowScrolling: 'touch', overflowX: 'hidden', touchAction: 'pan-y' }}
                >
                    {menu}
                </div>
            </FixedMenuPortal>
        </div>
    );
}
