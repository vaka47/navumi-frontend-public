// components/post/TagsPickerOverlay.tsx
'use client';
import * as React from 'react';
import PseudoModal from '@/components/ui/PseudoModal';
import ActivityAutocompleteForPost from '@/components/post/ActivityAutocompleteForPost';
import HashtagAutocompleteForPost from '@/components/post/HashtagAutocompleteForPost';

type Activity = { id: number; name: string };
type Hashtag  = { id: number; name: string };

export default function TagsPickerOverlay({
                                              open, onClose,
                                              activities, hashtags,
                                              selectedActivities, setSelectedActivities,
                                              selectedHashtags, setSelectedHashtags,
                                              hashtagInput, setHashtagInput, portalEl,
                                          }: {
    open: boolean; onClose: () => void;
    activities: Activity[]; hashtags: Hashtag[];
    selectedActivities: string[]; setSelectedActivities: (v: string[]) => void;
    selectedHashtags: string[]; setSelectedHashtags: (v: string[]) => void;
    hashtagInput: string; setHashtagInput: (v: string) => void;
    portalEl?: HTMLElement | null;
}) {
    const actRowRef = React.useRef<HTMLDivElement>(null);
    const tagRowRef = React.useRef<HTMLDivElement>(null);

    const Styles = (
        <style jsx global>{`
            .tpm .tags-row { position: relative; overflow-y: visible; }
            .tpm .tags-row .rail {
                position: relative; width: 100%; max-width: 100%;
                overflow-x: auto; overflow-y: visible;
                -webkit-overflow-scrolling: touch;
            }

            ///* делаем ВНУТРЕННИЙ контейнер контента "шире содержимого" */
            //.tpm .tags-row .rail .overflow-x-auto {
            //    display: inline-flex !important;
            //    width: max-content !important;
            //    flex-wrap: nowrap !important;
            //}
            /* подстраховка: элементы внутри — не сжимаются */
            .tpm .tags-row .rail .overflow-x-auto > * { flex-shrink: 0; }
        `}</style>
    );

    // ==== helpers
    const focusFirstInput = (root: HTMLElement | null) => {
        const input =
            root?.querySelector<HTMLInputElement>('input[type="text"], input') ||
            root?.querySelector<HTMLElement>('[contenteditable="true"]');
        input?.focus();
    };

    const scrollHorizByWheel = (root: HTMLElement | null) => {
        if (!root) return;

        // сперва ищем явный "прокручиваемый" контейнер от автокомплита
        const explicit = root.querySelector<HTMLElement>('.overflow-x-auto, .no-scrollbar');
        // если не нашли — ищем первый, чей scrollWidth > clientWidth
        const findScrollableX = (el: HTMLElement): HTMLElement => {
            const all = [el, ...Array.from(el.querySelectorAll<HTMLElement>('*'))];
            return all.find(n => n.scrollWidth > n.clientWidth) || el;
        };
        const target = explicit || findScrollableX(root);

        const onWheel = (e: WheelEvent) => {
            // не трогаем события внутри меню
            if ((e.target as HTMLElement).closest('[data-ac-menu]')) return;
            // конвертируем только настоящую горизонталь (трекпад/Shift), вертикаль не трогаем
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                target.scrollLeft += e.deltaX;
                e.preventDefault();
            }
        };
        target.addEventListener('wheel', onWheel, { passive: false });
        return () => target.removeEventListener('wheel', onWheel);
    };


    React.useEffect(() => {
        if (!open) return;
        const off1 = scrollHorizByWheel(actRowRef.current);
        const off2 = scrollHorizByWheel(tagRowRef.current);
        return () => { off1?.(); off2?.(); };
    }, [open]);

    

    React.useEffect(() => {
        if (!open) return;
        const rail = actRowRef.current?.querySelector<HTMLElement>('.rail') || actRowRef.current;
        if (!rail) return;
        const st = getComputedStyle(rail);
        console.log('[TPO] rail overflowX=', st.overflowX, 'scrollWidth=', rail.scrollWidth, 'clientWidth=', rail.clientWidth);

        const onWheelLog = (e: WheelEvent) => {
            console.log('[TPO] wheel deltaX=', e.deltaX, 'deltaY=', e.deltaY);
        };
        rail.addEventListener('wheel', onWheelLog, { passive: true });
        return () => rail.removeEventListener('wheel', onWheelLog);
    }, [open]);

    //



    return (
        <PseudoModal
            open={open}
            onClose={onClose}
            maxWidth="max-w-lg"
            className="tpm"
            container={portalEl ?? undefined}
            lockScroll={false}
        >
            {Styles}
            <div className="text-base font-semibold mb-2">Выбрать хэштеги и активности</div>

            {/* 🎯 Активности */}
            <div ref={actRowRef} className="tags-row border-b border-gray-150 pb-1">
                <div
                    className="rail"
                    onMouseDown={(e) => {
                        const t = e.target as HTMLElement;
                        console.log('[TPO] rail mousedown target=', t);
                        if (!t.closest('button,[role="button"]')) focusFirstInput(actRowRef.current);
                    }}
                >
                    <ActivityAutocompleteForPost
                        activities={activities}
                        selectedActivities={selectedActivities}
                        setSelectedActivities={(v) => {
                            if (v.length <= 4) setSelectedActivities(v);
                            else if (v.length > selectedActivities.length) alert('Максимум 4 активности.');
                        }}
                        placeholder="🎯  Активности"
                        maxSelectable={4}
                        noPadding
                        showCloseButton
                        fixedHeight="27px"
                    />
                </div>
            </div>

            {/* 🏷️ Хэштеги */}
            <div ref={tagRowRef} className="tags-row border-b border-gray-150 pb-1 mt-3">
                <div
                    className="rail"
                    onMouseDown={() => focusFirstInput(tagRowRef.current)}
                >
                    <HashtagAutocompleteForPost
                        hashtags={hashtags}
                        selectedHashtags={selectedHashtags}
                        setSelectedHashtags={setSelectedHashtags}
                        input={hashtagInput}
                        setInput={setHashtagInput}
                        noPadding
                        showCloseButton
                        fixedHeight="27px"
                    />
                </div>
            </div>

            <div className="flex justify-end mt-3">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-black text-white rounded-full">
                    Готово
                </button>
            </div>
        </PseudoModal>
    );
}
