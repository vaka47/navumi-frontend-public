'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function normRu(s: string): string {
    return s.toLowerCase().replace(/ё/g, 'е');
}

interface Hashtag {
    id: number;
    name: string;
}

interface Props {
    hashtags: Hashtag[];
    selectedHashtags: string[];
    setSelectedHashtags: (value: string[]) => void;
    noPadding?: boolean;
    showCloseButton?: boolean;
    fixedHeight?: string;
    input?: string;
    setInput?: (value: string) => void;
    prefixIcon?: ReactNode;
}

export function HashtagAutocomplete({
                                        hashtags,
                                        selectedHashtags,
                                        setSelectedHashtags,
                                        noPadding,
                                        showCloseButton,
                                        fixedHeight,
                                        input: externalInput,
                                        setInput: setExternalInput,
                                        prefixIcon,
                                    }: Props) {
    const [internalInput, setInternalInput] = useState('');
    const input = externalInput ?? internalInput;
    const setInput = setExternalInput ?? setInternalInput;
    const [showDropdown, setShowDropdown] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const filtered = input
        ? hashtags.filter(
            (h) =>
                normRu(h.name).includes(normRu(input)) &&
                !selectedHashtags.includes(h.id.toString())
        )
        : hashtags.filter((h) => !selectedHashtags.includes(h.id.toString()));

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
                setIsFocused(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const removeHashtag = (id: string) => {
        setSelectedHashtags(selectedHashtags.filter((h) => h !== id));
    };

    const addHashtag = (id: string) => {
        setSelectedHashtags([...selectedHashtags, id]);
        setInput('');
    };

    const selectedObjects = hashtags.filter((h) =>
        selectedHashtags.includes(h.id.toString())
    );

    const showEditState = selectedHashtags.length > 0 && !isFocused;
    const leftSlotIcon = showEditState
        ? (<span className="inline-flex items-center text-gray-500"><Pencil className="w-4 h-4 text-blue-600" /><span className="ml-4 text-sm">ред.</span></span>)
        : prefixIcon;
    const hasLeftSlot = !!leftSlotIcon;
    // В режиме «ред.» добавляем скроллируемый spacer и убираем внутренний отступ,
    // чтобы плашки могли уходить под левый оверлей «ред.»
    const leftPadClass = showEditState
      ? 'px-1'
      : (prefixIcon ? 'pl-7 pr-1' : 'px-1');
    const leftOverlayClass = showEditState
      ? 'absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none w-20 h-8 bg-white rounded-full flex items-center justify-start pl-1.5'
      : 'absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none';

    return (
        <div
            ref={containerRef}
            className={`relative w-full py-3 ${noPadding ? '' : 'px-4'}`}
        >
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
                    {hasLeftSlot && (
                        <div className={leftOverlayClass}>
                            {leftSlotIcon}
                        </div>
                    )}
                    <div
                        ref={scrollRef}
                        className={`flex items-center gap-2 overflow-x-auto whitespace-nowrap ${leftPadClass} no-scrollbar transition-all duration-300 h-7`}
                        style={fixedHeight ? { height: fixedHeight } : undefined}
                    >
                        {showEditState && (
                          <span aria-hidden className="inline-block w-20 shrink-0" />
                        )}
                        {(isFocused || selectedHashtags.length === 0) ? (
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder="Хэштеги"
                                value={input}
                                onFocus={() => {
                                    setIsFocused(true);
                                    setShowDropdown(true);
                                }}
                                onChange={(e) => {
                                    setInput(e.target.value);
                                    setShowDropdown(true);
                                }}
                                className="flex-none w-36 min-w-[120px] border-none focus:outline-none bg-transparent"
                            />
                        ) : null}

                        <AnimatePresence initial={false}>
                            {selectedObjects.map((h) => (
                                <motion.span
                                    key={h.id}
                                    data-hashtag-tag
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    exit={{ scale: 0 }}
                                    transition={{ duration: 0.2 }}
                                    layout
                                    className="flex items-center bg-green-100 text-green-800 text-sm px-2 py-1 rounded-full flex-shrink-0"
                                >
                                    #{h.name}
                                    <button
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                            removeHashtag(h.id.toString());
                                            inputRef.current?.focus();
                                        }}
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

            <AnimatePresence>
                {showDropdown && filtered.length > 0 && (
                    <motion.div
                        key="hashtag-dropdown"
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.2 }}
                        className="absolute z-[5000] bg-white border border-gray-300 rounded mt-1 w-full max-h-48 overflow-y-scroll shadow-md scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 p-2 flex flex-wrap gap-2"
                    >
                        <AnimatePresence initial={false}>
                            {filtered.map((hashtag) => (
                                <motion.span
                                    key={hashtag.id}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        addHashtag(hashtag.id.toString());
                                        inputRef.current?.focus();
                                    }}
                                    className="bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full cursor-pointer hover:bg-blue-200 transition"
                                    initial={{ scale: 1 }}
                                    animate={{ scale: 1 }}
                                    exit={{ scale: 0 }}
                                    whileTap={{ scale: 0.9 }}
                                    transition={{ duration: 0.2 }}
                                    layout
                                >
                                    #{hashtag.name}
                                </motion.span>
                            ))}
                        </AnimatePresence>

                        {showCloseButton && (
                            <button
                                onClick={() => setShowDropdown(false)}
                                className="absolute top-1 right-1 text-gray-400 hover:text-black text-lg"
                            >
                                ×
                            </button>
                        )}

                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );

}
