'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import PhotoCropModal from '@/components/camp/PhotoCropModal';
import { emitCampPostCreated } from '@/lib/campPostEvents';
import { uploadFilesToGcs } from '@/lib/directUpload';
import { ensureCsrfUpToDate } from '@/lib/csrf';
import { getBrowserApiBase } from '@/lib/apiBase';

type Props = {
    open: boolean;
    onClose: () => void;
    campId: number;
    onCreated?: (created?: unknown | null) => void | Promise<void>;
};

type CropMeta = { scale: number; position: { x: number; y: number } };
type ImgMeta = { width: number; height: number; aspect: number } | undefined;

async function getImageMeta(file: File): Promise<ImgMeta> {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const w = img.naturalWidth, h = img.naturalHeight;
            URL.revokeObjectURL(url);
            resolve(w > 0 && h > 0 ? { width: w, height: h, aspect: w / h } : undefined);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(undefined);
        };
        img.src = url;
    });
}

export default function CreateCampPostMobile({ open, onClose, campId, onCreated }: Props) {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [err, setErr] = useState('');
    const [saving, setSaving] = useState(false);
    const [triedSubmit, setTriedSubmit] = useState(false);

    const [activeCropFile, setActiveCropFile] = useState<File | null>(null);
    const [originalImage, setOriginalImage] = useState<File | null>(null);
    const [croppedImage, setCroppedImage] = useState<File | null>(null);
    const [cropMeta, setCropMeta] = useState<CropMeta | null>(null);
    const [imageAspect, setImageAspect] = useState<number | undefined>(undefined);

    const [isEditorOpen, setEditorOpen] = useState(false);
    const editorRef = useRef<HTMLTextAreaElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const API = useMemo(() => getBrowserApiBase().replace(/\/+$/, ''), []);

    const displayImage = useMemo(() => (croppedImage ?? originalImage), [croppedImage, originalImage]);
    const previewUrl = useMemo(() => (displayImage ? URL.createObjectURL(displayImage) : ''), [displayImage]);
    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

    const cropSrc = useMemo(() => (activeCropFile ? URL.createObjectURL(activeCropFile) : ''), [activeCropFile]);
    useEffect(() => () => { if (cropSrc) URL.revokeObjectURL(cropSrc); }, [cropSrc]);

    useEffect(() => {
        if (!open) return;
        setTitle('');
        setContent('');
        setErr('');
        setSaving(false);
        setTriedSubmit(false);
        setActiveCropFile(null);
        setOriginalImage(null);
        setCroppedImage(null);
        setCropMeta(null);
        setImageAspect(undefined);
        setEditorOpen(false);
    }, [open]);

    useEffect(() => {
        if (err && (croppedImage || originalImage || content.trim())) setErr('');
    }, [croppedImage, originalImage, content, err]);

    useEffect(() => {
        if (!open || typeof document === 'undefined') return;
        const { body } = document;
        const prev = body.style.overflow;
        body.style.overflow = 'hidden';
        return () => { body.style.overflow = prev; };
    }, [open]);



    useEffect(() => {
        if (!isEditorOpen) return;
        const id = requestAnimationFrame(() => {
            const ta = editorRef.current;
            if (!ta) return;
            ta.focus();
            try {
                const len = ta.value.length;
                ta.setSelectionRange(len, len);
            } catch { }
        });
        return () => cancelAnimationFrame(id);
    }, [isEditorOpen]);

    function openFileDialog() {
        if (activeCropFile) return;
        fileInputRef.current?.click();
    }

    async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0] || null;
        e.currentTarget.value = '';
        if (!f) return;
        if (!f.type.startsWith('image/')) {
            setErr('Файл должен быть изображением.');
            return;
        }

        const meta = await getImageMeta(f);
        setImageAspect(meta?.aspect);
        setOriginalImage(f);
        setActiveCropFile(null);
        setErr('');
    }

    function handleDeletePhoto() {
        setCroppedImage(null);
        setOriginalImage(null);
        setCropMeta(null);
        setImageAspect(undefined);
    }

    function handleReCrop() {
        if (activeCropFile) return;
        if (originalImage) setActiveCropFile(originalImage);
        else openFileDialog();
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setTriedSubmit(true);

        if (!API || !campId || saving) return;

        const hasText = content.trim().length > 0;
        const hasImage = !!(displayImage || croppedImage || originalImage || activeCropFile);
        const canSubmit = hasText || hasImage;
        if (!canSubmit) {
            setErr('Чтобы опубликовать пост, добавьте текст или фото.');
            return;
        }

        try {
            setSaving(true);
            setErr('');

            const token = await ensureCsrfUpToDate(API);
            const form = new FormData();
            if (title.trim()) form.append('title', title.trim());
            if (content.trim()) form.append('content', content.trim());

            const baseFile = croppedImage ?? originalImage;
            if (baseFile) {
                const uploaded = await uploadFilesToGcs([baseFile], token, 'camp');
                if (!uploaded.length) {
                    throw new Error('Не удалось загрузить фото для поста кэмпа.');
                }
                form.append('preuploaded_images', JSON.stringify(uploaded));
            }

            const r = await fetch(`${API}/api/camps/${campId}/posts/`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'X-CSRFToken': token },
                body: form,
            });

            if (!r.ok) {
                let msg = 'Не удалось создать пост. Попробуйте позже.';
                try {
                    const data = await r.json();
                    if (data?.errors || data?.non_field_errors) {
                        msg = 'Проверьте поля: ' + JSON.stringify(data);
                    }
                } catch {
                    /* ignore */
                }
                setErr(msg);
                setSaving(false);
                return;
            }

            let createdPayload: unknown = null;
            try {
                createdPayload = await r.json();
            } catch {
                /* response has no JSON body */
            }

            try {
                emitCampPostCreated({ campId, post: createdPayload });
            } catch {
                /* noop */
            }

            onClose();
            await onCreated?.(createdPayload);
        } catch {
            setErr('Не удалось создать пост. Попробуйте позже.');
        } finally {
            setSaving(false);
        }
    }

    const initialPosition =
        originalImage && activeCropFile === originalImage && cropMeta ? cropMeta.position : undefined;

    const initialScaleForModal = useMemo(() => {
        if (originalImage && activeCropFile === originalImage && cropMeta?.scale) {
            return cropMeta.scale;
        }
        return undefined;
    }, [originalImage, activeCropFile, cropMeta?.scale]);

    const cropWrapRef = useRef<HTMLDivElement | null>(null);

    const cropWrapClass = useMemo(() => {
        // Только базовая геометрия; высоту теперь даём инлайном (style) по условию
        return [
            'w-full max-w-[min(640px,calc(100vw-24px))]',
            'mx-auto p-4',
            'max-h-[92vh] overflow-y-auto', // обёртка сама не выше 92vh
        ].join(' ');
    }, []);


    useEffect(() => {
        if (!activeCropFile || !cropWrapRef.current) return;
        const wrap = cropWrapRef.current;

        const isNearBlack = (bg: string) => {
            const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (!m) return false;
            const r = +m[1], g = +m[2], b = +m[3], a = m[4] ? parseFloat(m[4]) : 1;
            return a > 0.8 && r < 10 && g < 10 && b < 10;
        };

        const getPath = (el: HTMLElement, stop: HTMLElement) => {
            const parts: string[] = [];
            let cur: HTMLElement | null = el;
            while (cur && cur !== stop) {
                const cls = (cur.className && typeof cur.className === 'string') ? cur.className : cur.tagName.toLowerCase();
                parts.push(cls);
                cur = cur.parentElement as HTMLElement | null;
            }
            return parts.reverse().join(' > ');
        };

        const dump = (reason: string) => {
            const cropRoot = wrap.firstElementChild as HTMLElement | null; // корень PhotoCropModal
            const img = (cropRoot?.querySelector('img') as HTMLImageElement | null) || null;

            const collect = () => {
                const hits: Array<{ path: string; bg: string }> = [];
                // без дженерика в optional chaining (во избежание TS1109)
                const all: HTMLElement[] = cropRoot ? (Array.from(cropRoot.querySelectorAll('*')) as HTMLElement[]) : [];
                all.forEach((el) => {
                    const bg = getComputedStyle(el).backgroundColor;
                    if (bg && isNearBlack(bg)) hits.push({ path: getPath(el, wrap), bg });
                });
                if (cropRoot) {
                    const bg = getComputedStyle(cropRoot).backgroundColor;
                    if (bg && isNearBlack(bg)) hits.unshift({ path: getPath(cropRoot, wrap) || '(root)', bg });
                }
                return hits;
            };

            const size = (el?: Element | null) =>
                el ? { w: (el as HTMLElement).clientWidth, h: (el as HTMLElement).clientHeight } : null;

            console.log('[CropDebug]', reason, {
                imageAspect,
                viewportH: window.innerHeight,
                wrap: size(wrap),
                cropRoot: size(cropRoot),
                img: img
                    ? {
                        naturalW: img.naturalWidth,
                        naturalH: img.naturalHeight,
                        clientW: img.clientWidth,
                        clientH: img.clientHeight,
                        objectFit: getComputedStyle(img).objectFit,
                        bgParent: cropRoot ? getComputedStyle(cropRoot).backgroundColor : null,
                    }
                    : null,
                darkLayers: collect(),
            });
        };

        // первичный дамп
        requestAnimationFrame(() => dump('open'));
        const timer = setTimeout(() => dump('after 200ms'), 200);

        const ro = new ResizeObserver(() => dump('resize'));
        ro.observe(wrap);
        if (wrap.firstElementChild) {
            ro.observe(wrap.firstElementChild as Element); // ← вместо короткого &&
        }

        return () => {
            clearTimeout(timer);
            ro.disconnect();
        };
    }, [activeCropFile, imageAspect]);

    const [vp, setVp] = useState({ w: 0, h: 0 });
    useEffect(() => {
        const update = () => setVp({ w: window.innerWidth, h: window.innerHeight });
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);


    const isTooTallPortrait = useMemo(() => {
        if (!imageAspect || imageAspect >= 1) return false;
        // Геометрия самого DialogContent из PhotoCropModal:
        //  - ширина = min(vp.w, 32rem) из-за w-full + max-w-lg
        //  - внутренние отступы p-6 => 24px слева и справа
        //  - полезная высота экрана меньше на блок управления (~220px)
        const dialogW = Math.max(0, Math.min(vp.w, 512));
        const containerW = Math.max(0, dialogW - 48); // вычитаем p-6 слева/справа
        const usableH = Math.max(0, vp.h - 220);      // место под слайдер и кнопки
        if (containerW === 0 || usableH === 0) return false;
        const thresholdAspect = containerW / usableH;
        return imageAspect < thresholdAspect;
    }, [imageAspect, vp.w, vp.h]);

    // Хотим ограничить видимую высоту при "слишком высокой" фотке:
    // Для кропера используем фиксированную высоту, ширина достраивается по aspect-ratio.
    // Резерв под ползунок и кнопки ~220px.
    const wrapDynHeightPx = useMemo(() => {
        if (!isTooTallPortrait) return undefined;
        const maxByViewport = Math.max(0, vp.h - 220);
        return Math.min(520, Math.max(320, maxByViewport));
    }, [isTooTallPortrait, vp.h]);

    const cropModalClass = useMemo(() => {
        // По умолчанию оставляем как было.
        if (!isTooTallPortrait) return 'w-full';
        // Для узких высоких — фиксируем высоту контейнера кропера внутри DialogContent,
        // ширину даём auto, чтобы достроилась по пропорции (aspect-ratio в самом кроппере).
        // calc(100dvh-220px) — чтобы влезли зум-полоска и кнопки.
        return [
            'w-auto',
            '[&>div:first-of-type]:w-auto',
            '[&>div:first-of-type]:h-[min(520px,calc(100dvh-220px))]',
        ].join(' ');
    }, [isTooTallPortrait]);

    useEffect(() => {
        if (!activeCropFile) return;
        // Немного телеметрии, чтобы было видно расчёты
        console.log('[CropFit]', {
            imageAspect,
            vp,
            isTooTallPortrait,
            wrapDynHeightPx,
        });
    }, [activeCropFile, imageAspect, vp, isTooTallPortrait, wrapDynHeightPx]);



    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[2000] bg-white">
            {err && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] px-4 py-2 bg-red-100 text-red-700 text-sm border border-red-300 rounded-lg shadow">
                    {err}
                </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col h-full">
                <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                    <h2 className="text-base font-semibold">Новый пост</h2>
                    <button
                        type="button"
                        onClick={() => { if (!activeCropFile && !saving) onClose(); }}
                        className="w-8 h-8 rounded-full hover:bg-black/5 flex items-center justify-center"
                        aria-label="Закрыть"
                        disabled={!!activeCropFile || saving}
                    >
                        ✕
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto px-4 pt-4 pb-28 space-y-6">
                    <section className="space-y-3">
                        <div className="text-sm text-gray-500">Фото</div>
                        {!displayImage ? (
                            <button
                                type="button"
                                onClick={openFileDialog}
                                className="w-full aspect-[3/2] border border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-500 bg-gray-50"
                                disabled={!!activeCropFile}
                            >
                                <span className="text-3xl leading-none">+</span>
                                <span className="text-sm">Добавить фото</span>
                            </button>
                        ) : (
                            <div
                                className="relative w-full rounded-xl overflow-hidden border border-gray-200 bg-white"
                                // высота эскиза — как у «Добавить фото»
                                style={{ aspectRatio: '3 / 2' }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={previewUrl}
                                    alt="Предпросмотр фото"
                                    // «вписываем по высоте», ширина — по пропорциям, без чёрных полей
                                    className="absolute inset-0 h-full w-auto max-w-none mx-auto select-none"
                                    draggable={false}
                                />
                                <div className="absolute inset-x-3 bottom-3 flex gap-2">
                                    <button
                                        type="button"
                                        onClick={handleReCrop}
                                        className="flex-1 rounded-full bg-white/90 text-sm font-medium py-2"
                                        disabled={!!activeCropFile}
                                    >
                                        Изменить
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDeletePhoto}
                                        className="flex-1 rounded-full bg-black/80 text-sm font-medium text-white py-2"
                                        disabled={!!activeCropFile}
                                    >
                                        Удалить
                                    </button>
                                </div>
                            </div>
                        )}

                        {!err && !displayImage && !content.trim() && triedSubmit && (
                            <p className="text-xs text-red-600">Для публикации добавьте текст или фото.</p>
                        )}

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handlePickFile}
                        />
                    </section>

                    <section className="space-y-2">
                        <label className="block text-sm text-gray-500" htmlFor="camp-post-title">
                            Заголовок
                        </label>
                        <input
                            id="camp-post-title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Например: Обновление расписания"
                            className="w-full border-0 border-b border-gray-300 rounded-none px-0 py-2 text-sm focus:outline-none focus:border-black placeholder-gray-400"
                            maxLength={255}
                        />
                    </section>

                    <section className="space-y-2">
                        <label
                            className="block text-sm text-gray-500 cursor-pointer"
                            htmlFor="camp-post-content-preview"
                            onClick={(e) => { e.preventDefault(); setEditorOpen(true); }}
                        >
                            Текст поста
                        </label>
                        {/* Свёрнутое состояние: ровно ~5 строк */}
                        <div
                            id="camp-post-content-preview"
                            role="button"
                            tabIndex={0}
                            onClick={() => setEditorOpen(true)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditorOpen(true); }
                            }}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm leading-5 text-left whitespace-pre-wrap break-words cursor-text overflow-y-auto min-h-[6.25rem] max-h-[6.25rem] bg-white"
                            aria-label="Открыть редактор текста поста"
                        >
                            {content.trim() ? (
                                <span>{content}</span>
                            ) : (
                                <span className="text-gray-400">Расскажите о новостях кэмпа...</span>
                            )}
                        </div>
                    </section>
                </div>

                <div className="px-4 bg-white pb-[max(env(safe-area-inset-bottom,0px),1rem)] pt-3">
                    <button
                        type="submit"
                        className="w-full rounded-full bg-black text-white py-3 text-sm font-semibold disabled:opacity-60 disabled:pointer-events-none"
                        disabled={saving}
                    >
                        {saving ? 'Публикуем…' : 'Создать пост'}
                    </button>
                </div>
            </form>

            {activeCropFile && (
                <div aria-hidden className="fixed inset-0 z-[2100] bg-black/40 backdrop-blur-[1px] pointer-events-none" />
            )}

            {activeCropFile && (
                <div
                    ref={cropWrapRef}
                    className={cropWrapClass}
                    style={wrapDynHeightPx ? { height: wrapDynHeightPx } : undefined}
                >
                    <PhotoCropModal
                        key={`${cropSrc}`}
                        imageSrc={cropSrc}
                        aspect={imageAspect}
                        className={cropModalClass}
                        initialScale={initialScaleForModal}
                        initialPosition={initialPosition}
                        onClose={() => setActiveCropFile(null)}
                        onComplete={async (croppedFile, meta) => {
                            try {
                                const m = await getImageMeta(croppedFile);
                                console.log('[CropDebug] onComplete', {
                                    metaFromModal: meta,
                                    croppedFile: { name: croppedFile.name, type: croppedFile.type, size: croppedFile.size },
                                    croppedMeta: m,
                                });
                            } catch { }
                            setCroppedImage(croppedFile);
                            setCropMeta(meta);
                            setActiveCropFile(null);
                        }}
                    />
                </div>
            )}


            {/* Полноэкранный редактор текста: без кнопки "Готово" в шапке, "Готово" только снизу и без верхней линии */}
            {isEditorOpen && (
                <div
                    className="fixed inset-0 z-[2200] bg-white flex flex-col"
                    onKeyDownCapture={(e) => {
                        if (e.key === 'Escape') {
                            e.stopPropagation();
                            setEditorOpen(false);
                        }
                    }}
                >
                    <div className="h-[56px] flex items-center px-4 border-b border-gray-200">
                        <div className="text-base font-medium">Текст поста</div>
                        {/* без кнопки "Готово" в шапке */}
                    </div>
                    <textarea
                        ref={editorRef}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Расскажите о новостях кэмпа..."
                        className="flex-1 w-full bg-white text-base leading-relaxed px-4 py-4 resize-none focus:outline-none"
                    />
                    <div className="px-4 py-4 bg-white">
                        <button
                            type="button"
                            onClick={() => setEditorOpen(false)}
                            className="w-full rounded-full bg-black text-white py-3 text-sm font-semibold"
                            aria-label="Готово"
                        >
                            Готово
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
