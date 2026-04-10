'use client';
import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from "react-dom";
import { Target, Tag as TagIcon, X, Check } from 'lucide-react';


interface Activity {
    id: number;
    name: string;
}

interface Hashtag {
    id: number;
    name: string;
}

interface Props {
    activities: Activity[];
    hashtags: Hashtag[];
    selectedActivities: string[];
    selectedHashtags: string[];
    setSelectedActivities: (value: string[]) => void;
    setSelectedHashtags: (value: string[]) => void;
    onClose: () => void;
}

export default function MobileActivitySelector({
                                                   activities,
                                                   hashtags,
                                                   selectedActivities,
                                                   selectedHashtags,
                                                   setSelectedActivities,
                                                   setSelectedHashtags,
                                                   onClose,
                                               }: Props) {
    // Snapshot initial selections to support Cancel behavior
    const initialActivitiesRef = useRef<string[]>([...selectedActivities]);
    const initialHashtagsRef = useRef<string[]>([...selectedHashtags]);
    const [activityQuery, setActivityQuery] = useState('');
    const [hashtagQuery, setHashtagQuery] = useState('');

    const filteredActivities = activityQuery
        ? activities.filter(
            (a) =>
                a.name.toLowerCase().includes(activityQuery.toLowerCase()) &&
                !selectedActivities.includes(a.id.toString())
        )
        : activities.filter((a) => !selectedActivities.includes(a.id.toString()));

    const filteredHashtags = hashtagQuery
        ? hashtags.filter(
            (h) =>
                h.name.toLowerCase().includes(hashtagQuery.toLowerCase()) &&
                !selectedHashtags.includes(h.id.toString())
        )
        : hashtags.filter((h) => !selectedHashtags.includes(h.id.toString()));

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
        };
    }, []);

    const handleCancel = () => {
        // Revert changes made during this session
        setSelectedActivities(initialActivitiesRef.current);
        setSelectedHashtags(initialHashtagsRef.current);
        onClose();
    };

    const handleAddActivity = (id: string) => {
        setSelectedActivities([...selectedActivities, id]);
        setActivityQuery('');
    };

    const handleRemoveActivity = (id: string) => {
        setSelectedActivities(selectedActivities.filter((a) => a !== id));
    };

    const handleAddHashtag = (id: string) => {
        setSelectedHashtags([...selectedHashtags, id]);
        setHashtagQuery('');
    };

    const handleRemoveHashtag = (id: string) => {
        setSelectedHashtags(selectedHashtags.filter((h) => h !== id));
    };

    const dropdownRef = useRef<HTMLDivElement>(null);
    const [showTopFade, setShowTopFade] = useState(false);
    const [showBottomFade, setShowBottomFade] = useState(false);

    useEffect(() => {
        const el = dropdownRef.current;
        if (!el) return;

        const checkScroll = () => {
            const scrollTop = el.scrollTop;
            const scrollHeight = el.scrollHeight;
            const clientHeight = el.clientHeight;

            const atTop = scrollTop > 2;
            const atBottom = scrollTop + clientHeight < scrollHeight - 5;

            setShowTopFade(atTop);
            setShowBottomFade(atBottom);
        };

        // Отложенный вызов — после рендера и layout
        const timeout = setTimeout(() => checkScroll(), 30);

        el.addEventListener('scroll', checkScroll);
        return () => {
            el.removeEventListener('scroll', checkScroll);
            clearTimeout(timeout);
        };
    }, []);


    const hashtagDropdownRef = useRef<HTMLDivElement>(null);
    const [showTopHashtagFade, setShowTopHashtagFade] = useState(false);
    const [showBottomHashtagFade, setShowBottomHashtagFade] = useState(false);

    useEffect(() => {
        const el = hashtagDropdownRef.current;
        if (!el) return;

        const checkScroll = () => {
            const scrollTop = el.scrollTop;
            const scrollHeight = el.scrollHeight;
            const clientHeight = el.clientHeight;

            const atTop = scrollTop > 2;
            const atBottom = scrollTop + clientHeight < scrollHeight - 2;

            setShowTopHashtagFade(atTop);
            setShowBottomHashtagFade(atBottom);
        };

        const timeout = setTimeout(() => checkScroll(), 30);

        el.addEventListener('scroll', checkScroll);
        return () => {
            el.removeEventListener('scroll', checkScroll);
            clearTimeout(timeout);
        };
    }, []);


    useEffect(() => {
        const header = document.querySelector('header');
        if (header) {
            header.style.display = 'none';
        }
        return () => {
            if (header) {
                header.style.display = '';
            }
        };
    }, []);


    if (typeof window === "undefined") return null;


    return createPortal(
        <div className="fixed inset-0 z-[4200] bg-white flex flex-col">
            <div className="fixed top-0 left-0 w-full h-full bg-white z-50 flex flex-col">
                {/* Заголовок */}
                <div className="p-4 border-b border-gray-300 flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Выбор активностей и хэштегов</h2>
                    <button
                        onClick={handleCancel}
                        aria-label="Закрыть"
                        className="text-gray-500 hover:text-gray-700 p-1 rounded"
                    >
                        <X className="w-5 h-5" aria-hidden />
                    </button>
                </div>

                {/* Активности */}
                <div className="flex-1 overflow-hidden" style={{ maxHeight: 'calc((100dvh - 132px)/2)' }}>

                <div className="flex items-center px-4 mt-4 mb-2 gap-2 overflow-x-auto no-scrollbar">
                    <h3 className="text-sm text-black font-medium flex-shrink-0 whitespace-nowrap flex items-center gap-2">
                        <Target className="w-4 h-4 text-blue-600" />
                        <span>Активности:</span>
                    </h3>
                        <div className="flex flex-nowrap gap-2">
                            <AnimatePresence initial={false}>
                                {selectedActivities
                                    .map((id) => activities.find((a) => a.id.toString() === id))
                                    .filter((a): a is Activity => !!a)
                                    .map((a) => (
                                        <motion.span
                                            key={a.id}
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            exit={{ scale: 0 }}
                                            transition={{ duration: 0.2 }}
                                            layout
                                            className="flex items-center bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full flex-shrink-0"
                                        >
                                            {a.name}
                                            <button
                                                onClick={() => handleRemoveActivity(a.id.toString())}
                                                className="ml-1 text-green-500 hover:text-green-700 focus:outline-none text-sm"
                                            >
                                                ×
                                            </button>
                                        </motion.span>
                                    ))}
                            </AnimatePresence>

                        </div>
                    </div>



                    <div className="mb-2 px-4">
                        <input
                            type="text"
                            value={activityQuery}
                            onChange={(e) => setActivityQuery(e.target.value)}
                            placeholder="Поиск активности..."
                            className="w-full border border-gray-300 rounded px-3 py-2"
                        />
                    </div>

                    <div className="relative px-4">
                        {showTopFade && (
                            <div
                                className="absolute top-0 left-0 w-full h-16 bg-gradient-to-b from-white to-transparent pointer-events-none z-10"/>
                        )}
                        {showBottomFade && (
                            <div
                                className="absolute bottom-0 left-0 w-full h-16 bg-gradient-to-t from-white to-transparent pointer-events-none z-10"/>
                        )}

                        <div
                            ref={dropdownRef}
                            className="flex flex-wrap gap-2 overflow-y-scroll max-h-[28vh] pb-24 scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100 relative z-0 will-change-transform"
                        >
                            <AnimatePresence initial={false}>
                                {filteredActivities.map((a) => (
                                    <motion.span
                                        key={a.id}
                                        onClick={() => handleAddActivity(a.id.toString())}
                                        className="bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full cursor-pointer hover:bg-blue-200 transition"
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        exit={{ scale: 0 }}
                                        whileTap={{ scale: 0.9 }}
                                        transition={{ duration: 0.2 }}
                                        layout
                                    >
                                        {a.name}
                                    </motion.span>
                                ))}
                            </AnimatePresence>

                        </div>
                    </div>
                </div>

                {/* Хэштеги */}
                <div className="flex-1 px-4 pt-3 pb-4 overflow-hidden" style={{ maxHeight: 'calc((100dvh - 132px)/2)' }}>
                <div className="flex items-center px-0 mb-2 gap-2 overflow-x-auto no-scrollbar">
                    <h3 className="text-sm text-black font-medium flex-shrink-0 whitespace-nowrap flex items-center gap-2">
                        <TagIcon className="w-4 h-4 text-blue-600" />
                        <span>Хэштеги:</span>
                    </h3>
                        <div className="flex flex-nowrap gap-2">
                            <AnimatePresence initial={false}>
                                {hashtags
                                    .filter((h) => selectedHashtags.includes(h.id.toString()))
                                    .map((h) => (
                                        <motion.span
                                            key={h.id}
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            exit={{ scale: 0 }}
                                            transition={{ duration: 0.2 }}
                                            layout
                                            className="flex items-center bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full flex-shrink-0"
                                        >
                                            #{h.name}
                                            <button
                                                onClick={() => handleRemoveHashtag(h.id.toString())}
                                                className="ml-1 text-green-500 hover:text-green-700 focus:outline-none text-sm"
                                            >
                                                ×
                                            </button>
                                        </motion.span>
                                    ))}
                            </AnimatePresence>

                        </div>
                    </div>



                    <div className="mb-2">
                        <input
                            type="text"
                            value={hashtagQuery}
                            onChange={(e) => setHashtagQuery(e.target.value)}
                            placeholder="Поиск хэштега..."
                            className="w-full border border-gray-300 rounded px-3 py-2"
                        />
                    </div>

                    <div className="relative flex-1 overflow-hidden">
                        {showTopHashtagFade && (
                            <div
                                className="absolute top-0 left-0 w-full h-16 bg-gradient-to-b from-white to-transparent pointer-events-none z-20"/>
                        )}
                        {showBottomHashtagFade && (
                            <div
                                className="absolute bottom-0 left-0 w-full h-16 bg-gradient-to-t from-white to-transparent pointer-events-none z-10"/>
                        )}

                        <div
                            ref={hashtagDropdownRef}
                            className="flex flex-wrap gap-2 overflow-y-scroll max-h-[28vh] pr-1 pb-[90px] scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100 will-change-transform"
                        >
                            <AnimatePresence initial={false}>
                                {filteredHashtags.map((h) => (
                                    <motion.span
                                        key={h.id}
                                        onClick={() => handleAddHashtag(h.id.toString())}
                                        className="bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full cursor-pointer hover:bg-blue-200 transition"
                                        style={{ transform: 'translateZ(0)' }}
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        exit={{ scale: 0 }}
                                        whileTap={{ scale: 0.9 }}
                                        transition={{ duration: 0.2 }}
                                        layout
                                    >
                                        #{h.name}
                                    </motion.span>
                                ))}
                            </AnimatePresence>

                        </div>
                    </div>
                </div>

                {/* Кнопка "Готово" */}
                <div className="fixed bottom-0 left-0 w-full bg-white p-4 border-t border-gray-300 z-20">
                    <button
                        onClick={onClose}
                        className="w-full bg-primary text-white py-2 rounded-full font-semibold hover:bg-primary/90 transition inline-flex items-center justify-center"
                    >
                        <Check className="w-5 h-5 mr-2" aria-hidden />
                        Готово
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
