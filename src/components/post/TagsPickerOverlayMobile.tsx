'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

type Activity = { id: number; name: string };
type Hashtag  = { id: number; name: string };

export default function TagsPickerOverlayMobile({
  open,
  onClose,
  activities,
  hashtags,
  selectedActivities,
  selectedHashtags,
  setSelectedActivities,
  setSelectedHashtags,
  // layout оставляем, чтобы не падали типы при существующем вызове; не используем
  //layout,
}: {
  open: boolean;
  onClose: () => void;
  activities: Activity[];
  hashtags: Hashtag[];
  selectedActivities: string[];
  selectedHashtags: string[];
  setSelectedActivities: (value: string[]) => void;
  setSelectedHashtags: (value: string[]) => void;
  layout?: 'centered' | 'fullscreen';
}) {
  const [activityQuery, setActivityQuery] = useState('');
  const [hashtagQuery, setHashtagQuery] = useState('');

  // фильтрация (исключаем уже выбранные)
  const filteredActivities = useMemo(() => {
    const sel = new Set(selectedActivities);
    const base = activities.filter(a => !sel.has(String(a.id)));
    if (!activityQuery.trim()) return base;
    const q = activityQuery.toLowerCase();
    return base.filter(a => a.name.toLowerCase().includes(q));
  }, [activities, selectedActivities, activityQuery]);

  const filteredHashtags = useMemo(() => {
    const sel = new Set(selectedHashtags);
    const base = hashtags.filter(h => !sel.has(String(h.id)));
    if (!hashtagQuery.trim()) return base;
    const q = hashtagQuery.toLowerCase();
    return base.filter(h => h.name.toLowerCase().includes(q));
  }, [hashtags, selectedHashtags, hashtagQuery]);

  // блокируем скролл страницы под оверлеем
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const header = document.querySelector('header') as HTMLElement | null;
    const prevHeaderDisplay = header?.style.display ?? '';
    if (header) header.style.display = 'none';
    return () => {
      document.body.style.overflow = prev;
      if (header) header.style.display = prevHeaderDisplay;
    };
  }, [open]);

  // лимит активностей = 4
  const handleAddActivity = (id: string) => {
    if (selectedActivities.length >= 4) {
      // полностью повторяем UX десктопа — alert
      alert('Максимум 4 активности.');
      return;
    }
    if (!selectedActivities.includes(id)) {
      setSelectedActivities([...selectedActivities, id]);
    }
    setActivityQuery('');
  };
  const handleRemoveActivity = (id: string) =>
    setSelectedActivities(selectedActivities.filter(a => a !== id));

  const handleAddHashtag = (id: string) => {
    if (!selectedHashtags.includes(id)) {
      setSelectedHashtags([...selectedHashtags, id]);
    }
    setHashtagQuery('');
  };
  const handleRemoveHashtag = (id: string) =>
    setSelectedHashtags(selectedHashtags.filter(h => h !== id));

  // градиент-фейды (активности)
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);
  useEffect(() => {
    if (!open) return;
    const el = dropdownRef.current;
    if (!el) return;
    const check = () => {
      setShowTopFade(el.scrollTop > 2);
      setShowBottomFade(el.scrollTop + el.clientHeight < el.scrollHeight - 5);
    };
    const t = setTimeout(check, 30);
    el.addEventListener('scroll', check);
    return () => { el.removeEventListener('scroll', check); clearTimeout(t); };
  }, [open]);

  // градиент-фейды (хэштеги)
  const hashtagDropdownRef = useRef<HTMLDivElement>(null);
  const [showTopHashtagFade, setShowTopHashtagFade] = useState(false);
  const [showBottomHashtagFade, setShowBottomHashtagFade] = useState(false);
  useEffect(() => {
    if (!open) return;
    const el = hashtagDropdownRef.current;
    if (!el) return;
    const check = () => {
      setShowTopHashtagFade(el.scrollTop > 2);
      setShowBottomHashtagFade(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
    };
    const t = setTimeout(check, 30);
    el.addEventListener('scroll', check);
    return () => { el.removeEventListener('scroll', check); clearTimeout(t); };
  }, [open]);

  if (typeof window === 'undefined' || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[5000] bg-white flex flex-col">
      {/* Заголовок */}
      <div className="p-4 border-b border-gray-300 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Выбор активностей и хэштегов</h2>
        <button
          onClick={onClose}
          className="text-sm text-gray-500 hover:text-gray-700"
          aria-label="Закрыть"
        >
          ✕
        </button>
      </div>

      {/* 🎯 Активности */}
      <div className="flex-1 overflow-hidden" style={{ maxHeight: 'calc((100dvh - 132px)/2)' }}>
        {/* выбранные */}
        <div className="flex items-center px-4 mt-4 mb-2 gap-2 overflow-x-auto no-scrollbar">
          <h3 className="text-sm text-black font-medium flex-shrink-0 whitespace-nowrap">🎯 Активности:</h3>
          <div className="flex flex-nowrap gap-2">
            <AnimatePresence initial={false}>
              {activities
                .filter(a => selectedActivities.includes(String(a.id)))
                .map(a => (
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
                      onClick={() => handleRemoveActivity(String(a.id))}
                      className="ml-1 text-green-500 hover:text-green-700 focus:outline-none text-sm"
                      aria-label="Убрать активность"
                    >
                      ×
                    </button>
                  </motion.span>
                ))}
            </AnimatePresence>
          </div>
        </div>

        {/* поиск */}
        <div className="mb-2 px-4">
          <input
            type="text"
            value={activityQuery}
            onChange={(e) => setActivityQuery(e.target.value)}
            placeholder="Поиск активности…"
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>

        {/* варианты */}
        <div className="relative px-4">
          {showTopFade && (
            <div className="pointer-events-none absolute top-0 left-0 z-10 h-16 w-full bg-gradient-to-b from-white to-transparent" />
          )}
          {showBottomFade && (
            <div className="pointer-events-none absolute bottom-0 left-0 z-10 h-16 w-full bg-gradient-to-t from-white to-transparent" />
          )}

          <div
            ref={dropdownRef}
            className="relative z-0 flex max-h-[28vh] flex-wrap gap-2 overflow-y-scroll pb-24 will-change-transform scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100"
          >
            <AnimatePresence initial={false}>
              {filteredActivities.map(a => (
                <motion.span
                  key={a.id}
                  onClick={() => handleAddActivity(String(a.id))}
                  className="cursor-pointer rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800 transition hover:bg-blue-200"
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

      {/* 🏷️ Хэштеги */}
      <div className="flex-1 overflow-hidden px-4 pt-3 pb-4" style={{ maxHeight: 'calc((100dvh - 132px)/2)' }}>
        {/* выбранные */}
        <div className="mb-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <h3 className="text-sm text-black font-medium flex-shrink-0 whitespace-nowrap">🏷️ Хэштеги:</h3>
          <div className="flex flex-nowrap gap-2">
            <AnimatePresence initial={false}>
              {hashtags
                .filter(h => selectedHashtags.includes(String(h.id)))
                .map(h => (
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
                      onClick={() => handleRemoveHashtag(String(h.id))}
                      className="ml-1 text-green-500 hover:text-green-700 focus:outline-none text-sm"
                      aria-label="Убрать хэштег"
                    >
                      ×
                    </button>
                  </motion.span>
                ))}
            </AnimatePresence>
          </div>
        </div>

        {/* поиск */}
        <div className="mb-2">
          <input
            type="text"
            value={hashtagQuery}
            onChange={(e) => setHashtagQuery(e.target.value)}
            placeholder="Поиск хэштега…"
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>

        {/* варианты */}
        <div className="relative flex-1 overflow-hidden">
          {showTopHashtagFade && (
            <div className="pointer-events-none absolute top-0 left-0 z-20 h-16 w-full bg-gradient-to-b from-white to-transparent" />
          )}
          {showBottomHashtagFade && (
            <div className="pointer-events-none absolute bottom-0 left-0 z-10 h-16 w-full bg-gradient-to-t from-white to-transparent" />
          )}

          <div
            ref={hashtagDropdownRef}
            className="max-h-[28vh] overflow-y-scroll pr-1 pb-[90px] will-change-transform scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100 flex flex-wrap gap-2"
          >
            <AnimatePresence initial={false}>
              {filteredHashtags.map(h => (
                <motion.span
                  key={h.id}
                  onClick={() => handleAddHashtag(String(h.id))}
                  className="cursor-pointer rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800 transition hover:bg-blue-200"
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
      <div className="fixed bottom-0 left-0 z-20 w-full border-t border-gray-300 bg-white p-4">
        <button
          onClick={onClose}
          className="w-full rounded-full bg-black py-3 text-sm font-semibold text-white hover:bg-black/90"
        >
          Готово
        </button>
      </div>

      <style jsx global>{`
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </div>,
    document.body
  );
}
