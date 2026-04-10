
'use client';

import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import PhotoCropModal from '@/components/camp/PhotoCropModal';
import { emitCampPostCreated } from '@/lib/campPostEvents';
import { uploadFilesToGcs } from '@/lib/directUpload';
import { ensureCsrfUpToDate } from '@/lib/csrf';
import { getBrowserApiBase } from '@/lib/apiBase';


type Props = {
    open: boolean;
    onClose: () => void;
    campId: number;
    onCreated?: (created?: unknown) => void | Promise<void>;
};

type CropMeta = { scale: number; position: { x: number; y: number } };
type ImgMeta = { width: number; height: number; aspect: number } | undefined;

async function getImageMeta(file: File): Promise<ImgMeta> {
    try {
        if (typeof createImageBitmap === 'function') {
            const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
            const w = bitmap.width;
            const h = bitmap.height;
            bitmap.close();
            return w > 0 && h > 0 ? { width: w, height: h, aspect: w / h } : undefined;
        }
    } catch {
        // fallback to Image below
    }

    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const w = img.naturalWidth, h = img.naturalHeight;
            URL.revokeObjectURL(url);
            resolve(w > 0 && h > 0 ? { width: w, height: h, aspect: w / h } : undefined);
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(undefined); };
        img.src = url;
    });
}

//const LONG_SIDE = 560;   // руками задаём "бОльшую сторону"
//const PAD = 48;          // внутренние отступы p-6
//const CHROME = 160;      // зум+кнопки

export default function CreateCampPostModalDesktop({
                                                       open, onClose, campId, onCreated,
                                                   }: Props) {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [err, setErr] = useState('');
    const [saving, setSaving] = useState(false);

    // --- фото и кроп ---
    const [activeCropFile, setActiveCropFile] = useState<File | null>(null);
    const [originalImage, setOriginalImage] = useState<File | null>(null);
    const [croppedImage, setCroppedImage] = useState<File | null>(null);
    const [cropMeta, setCropMeta] = useState<CropMeta | null>(null);
    const [triedSubmit, setTriedSubmit] = useState(false);



    const [imageAspect, setImageAspect] = useState<number | undefined>(undefined);
    const [imageWH, setImageWH] = useState<{ w: number; h: number } | null>(null);

    const previewUrl = useMemo(() => (croppedImage ? URL.createObjectURL(croppedImage) : ''), [croppedImage]);
    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    const cropSrc = useMemo(() => (activeCropFile ? URL.createObjectURL(activeCropFile) : ''), [activeCropFile]);
    useEffect(() => {
        return () => {
            if (cropSrc) URL.revokeObjectURL(cropSrc);
        };
    }, [cropSrc]);

    //const box = useMemo(() => {
    //    if (!imageAspect) return { w: LONG_SIDE, h: LONG_SIDE };
    //    if (imageAspect > 1.05) return { w: LONG_SIDE, h: LONG_SIDE / imageAspect };         // горизонталь
    //    if (imageAspect < 0.95) return { w: LONG_SIDE * imageAspect, h: LONG_SIDE };         // вертикаль
    //    return { w: LONG_SIDE, h: LONG_SIDE };                                               // квадрат
    //}, [imageAspect]);

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const API = getBrowserApiBase();

    useEffect(() => {
        if (!open) return;
        setTitle(''); setContent(''); setErr(''); setSaving(false);
        setActiveCropFile(null); setOriginalImage(null); setCroppedImage(null);
        setCropMeta(null); setImageAspect(undefined); setImageWH(null);
    }, [open]);

    //const canSubmit = !!(content.trim() || croppedImage);
    function openFileDialog() { fileInputRef.current?.click(); }

    async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0] || null;
        e.currentTarget.value = '';
        if (!f) return;
        if (!f.type.startsWith('image/')) { setErr('Файл должен быть изображением.'); return; }

        const meta = await getImageMeta(f);
        setImageAspect(meta?.aspect);
        setImageWH(meta ? { w: meta.width, h: meta.height } : null);

        setOriginalImage(f);
        setActiveCropFile(f);
        setErr('');
    }

    function handleDeletePhoto() {
        setCroppedImage(null); setOriginalImage(null); setCropMeta(null);
        setImageAspect(undefined); setImageWH(null);
    }

    function handleReCrop() {
        if (originalImage) {
            setActiveCropFile(originalImage);
        } else {
            openFileDialog();
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setTriedSubmit(true);                                               // ← фиксируем попытку

        if (!API || !campId || saving) return;

        // ключевая проверка
        const canSubmit = !!(content.trim() || croppedImage);
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
            if (croppedImage || originalImage) {
                const baseFile = croppedImage ?? originalImage!;
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
                } catch {}
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
        } finally { setSaving(false); }
    }


    const initialPosition =
        originalImage && activeCropFile === originalImage && cropMeta ? cropMeta.position : undefined;

    const initialScaleForModal = useMemo(() => {
        // при повторном рекропе — вернуть сохранённый масштаб
        if (originalImage && activeCropFile === originalImage && cropMeta?.scale) {
            return cropMeta.scale;
        }
        // при первом открытии — undefined, чтобы PhotoCropModal сам выставил minScale
        return undefined;
    }, [originalImage, activeCropFile, cropMeta?.scale]);


    const isVertical = (imageAspect ?? 1) < 0.95;

// ---- ФИКСИРОВАННЫЕ ГАБАРИТЫ КОНТЕЙНЕРА ДЛЯ PhotoCropModal ----
    const cropModalClass = useMemo(() => {
        const base = [
            'max-w-none',                 // убираем встроенный max-w у DialogContent
            'p-6',
            'overflow-visible',
            'max-h-[92vh] overflow-y-auto',
            // первый div внутри DialogContent (контейнер кропера)
            '[&>div:first-of-type]:relative',
            '[&>div:first-of-type]:rounded-2xl',
            '[&>div:first-of-type]:overflow-hidden',
        ].join(' ');

        if (isVertical) {
            // вертикальные: фиксированная ВЫСОТА длинной стороны
            return [
                base,
                'w-auto',
                '[&>div:first-of-type]:w-auto',
                '[&>div:first-of-type]:h-[560px]',
            ].join(' ');
        }

        // горизонтальные/квадрат: фиксированная ШИРИНА длинной стороны
        return [
            base,
            'w-[560px]',            // длинная сторона = ширина
        ].join(' ');
    }, [isVertical]);

    useEffect(() => {
        try {
            // eslint-disable-next-line no-console
            console.info('[CreateCampPostModalDesktop][crop-modal]', {
                imageAspect,
                isVertical,
                cropModalClass,
                initialScaleForModal,
                initialPosition,
                imageWH,
            });
        } catch { /* noop */ }
    }, [imageAspect, isVertical, cropModalClass, initialScaleForModal, initialPosition, imageWH]);



    // длинная сторона мини-превью, px (подгони при желании)
    const THUMB_LONG = 200;

    const thumbSize = useMemo(() => {
        const a = imageAspect ?? 1; // 1 — квадрат по умолчанию
        if (a >= 1) {
            // горизонтальная/квадрат: фикс ширина = THUMB_LONG
            return { w: THUMB_LONG, h: Math.max(72, Math.round(THUMB_LONG / a)) };
        }
        // вертикальная: фикс высота = THUMB_LONG
        return { h: THUMB_LONG, w: Math.max(72, Math.round(THUMB_LONG * a)) };
    }, [imageAspect]);

    useEffect(() => {
        if (!open) return;
        setTitle(''); setContent(''); setErr(''); setSaving(false);
        setActiveCropFile(null); setOriginalImage(null); setCroppedImage(null);
        setCropMeta(null); setImageAspect(undefined); setImageWH(null);
        setTriedSubmit(false);                      // ← сброс
    }, [open]);

    useEffect(() => {
        if (err && (croppedImage || content.trim())) setErr('');
    }, [croppedImage, content, err]);



    return (
        <Dialog
            open={open}
            onOpenChange={(next) => { if (!next && activeCropFile) return; if (!next) onClose(); }}
        >
            <DialogContent
                className={`w-full max-w-2xl min-w-0 bg-white overflow-visible transition-all duration-150
    ${activeCropFile
                    ? 'pointer-events-none opacity-70 !shadow-none !ring-0 !border-transparent'
                    : ''}`}
                style={{ maxHeight: '96vh' }}
                onOpenAutoFocus={(e) => e.preventDefault()}
                onCloseAutoFocus={(e) => e.preventDefault()}
                onInteractOutside={(e) => { if (activeCropFile) e.preventDefault(); }}
            >
                {err && (
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-red-100 border border-red-300 text-red-800 rounded-md text-sm shadow-md max-w-[90%] text-center">
                        {err}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-sm mt-1">
                    <h2 className="text-lg font-semibold text-center">Новый пост</h2>

                    {/* Фото */}
                    <div className="space-y-2">
                        <div className="text-gray-400 px-1">Фото</div>

                        {!croppedImage ? (
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={openFileDialog}
                                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openFileDialog()}
                                className="w-full h-24 rounded-md border border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:bg-gray-50 select-none"
                                aria-label="Добавить фото"
                            >
                                <span className="text-gray-500">Добавить фото</span>
                            </div>
                        ) : (
                            // мини-эскиз с тем же аспектом, что у фото
                            <div className="w-full flex justify-center">         {/* ← центрируем строку */}
                                <div
                                    className="relative inline-block"
                                    style={{ width: `${thumbSize.w}px`, height: `${thumbSize.h}px` }}
                                    title="Нажмите, чтобы изменить кадрирование"
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                                        src={previewUrl}
                                        alt="Эскиз фото"
                                        className="w-full h-full object-contain rounded-md border border-gray-200 cursor-pointer bg-white"
                                        onClick={handleReCrop}
                                        onLoad={(e) => {
                                            try {
                                                const img = e.currentTarget;
                                                // eslint-disable-next-line no-console
                                                console.info('[CreateCampPostModalDesktop][preview]', {
                                                    natural: { w: img.naturalWidth, h: img.naturalHeight },
                                                    client: { w: img.clientWidth, h: img.clientHeight },
                                                    aspect: img.naturalHeight ? (img.naturalWidth / img.naturalHeight) : null,
                                                });
                                            } catch { /* noop */ }
                                        }}
                                    />
                                    <button
                                        type="button"
                                        aria-label="Удалить фото"
                                        onClick={(e) => { e.stopPropagation(); handleDeletePhoto(); }}
                                        className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-black/70 text-white grid place-items-center ring-1 ring-white shadow-md"
                                    >
                                        <span className="text-[10px] leading-none">✕</span>
                                    </button>
                                </div>
                            </div>
                        )}


                        {/* маленькая подсказка при невалидном сабмите */}
                        {!croppedImage && !content.trim() && triedSubmit && (
                            <p className="text-xs text-red-600 px-1">Для публикации добавьте текст или фото.</p>
                        )}


                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handlePickFile}
                        />
                    </div>

                    {/* Заголовок */}
                    <div>
                        <div className="flex items-center min-w-0">
                            <span className="w-28 shrink-0 text-gray-400 text-sm px-1">Заголовок</span>
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-0 flex-1 bg-transparent px-1 py-2 outline-none
                 border-0 border-b border-gray-200 focus:border-gray-400"
                                placeholder="Например: Обновление по расписанию"
                                maxLength={255}
                            />
                        </div>
                    </div>

                    {/* Текст */}
                    <div>
                        {/* <div className="text-gray-400 text-sm px-1 mb-1">Текст поста</div> */}
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="w-full bg-white border border-gray-300 focus:border-gray-400 focus:outline-none p-3 rounded-md text-sm placeholder:text-gray-400"
                            placeholder="Что нового? Изменения, рекомендации, фотография тренировки..."
                            rows={6}
                        />
                    </div>

                    <Button
                        type="submit"
                        disabled={saving}                         // ← убрали зависимость от canSubmit
                        className="w-full bg-black text-white py-2 rounded-full hover:bg-black/80 transition"
                    >
                        {saving ? 'Публикуем…' : 'Опубликовать пост'}
                    </Button>

                </form>

                {/* dimmer */}
                {activeCropFile && (
                    <div
                        aria-hidden
                        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] pointer-events-none transition-opacity"
                    />
                )}

                {/* Кроппер */}
                {activeCropFile && (
                    <PhotoCropModal
                        key={`${isVertical ? 'v' : 'h'}-${cropSrc}`}
                        imageSrc={cropSrc}
                        aspect={imageAspect}
                        className={cropModalClass}
                        initialScale={initialScaleForModal}
                        initialPosition={initialPosition}
                        startAtCover={false}
                        onClose={() => setActiveCropFile(null)}
                        onComplete={(croppedFile, meta) => {
                            setCroppedImage(croppedFile);
                            setCropMeta(meta);
                            setActiveCropFile(null);
                        }}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}
