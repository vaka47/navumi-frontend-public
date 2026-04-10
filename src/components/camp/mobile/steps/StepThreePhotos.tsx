'use client';

import { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import {
    DndContext,
    closestCenter,
    DragEndEvent,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    useSortable,
    rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from 'lucide-react';
import PhotoCropModal from '@/components/camp/PhotoCropModal';

async function downscaleImageFile(
    file: File,
    maxSide: number = 1600,
    targetType: string = 'image/jpeg',
    quality: number = 0.85
): Promise<File> {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            try {
                const { width, height } = img;
                let w = width;
                let h = height;
                if (Math.max(w, h) > maxSide) {
                    const scale = maxSide / Math.max(w, h);
                    w = Math.round(w * scale);
                    h = Math.round(h * scale);
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    URL.revokeObjectURL(url);
                    resolve(file);
                    return;
                }
                ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob(
                    (blob) => {
                        URL.revokeObjectURL(url);
                        if (!blob) {
                            resolve(file);
                            return;
                        }
                        const ext = targetType.includes('jpeg') ? '.jpg' : '.webp';
                        const name = file.name.replace(/\.[^.]+$/, '') + ext;
                        resolve(new File([blob], name, { type: targetType }));
                    },
                    targetType,
                    quality
                );
            } catch {
                URL.revokeObjectURL(url);
                resolve(file);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(file);
        };
        img.src = url;
    });
}

interface Props {
    formData: FormData;
    setFormData: (data: FormData) => void;
    onBack: () => void;
    onSubmit: () => void;
    submitting?: boolean;
}

interface GalleryItem {
    id: string;
    file: File; // ← original (уже может быть даунскейленный)
    croppedFile?: File;
    cropData?: {
        scale: number;
        position: { x: number; y: number };
    };
}

//type GalleryItemWithUrl = Omit<GalleryItem, 'file'> & { fileUrl: string };

//function applyCrop(file: File, cropData: GalleryItem['cropData']): Promise<File> {
//    return new Promise((resolve) => {
//        const img = new Image();
//       const url = URL.createObjectURL(file);
//        img.src = url;
//
//        img.onload = () => {
//            const canvas = document.createElement('canvas');
//            const ctx = canvas.getContext('2d')!;

//            const baseWidth = img.width;
//            const baseHeight = img.height;

//            const scale = cropData?.scale ?? 1;
//            const offsetX = cropData?.position?.x ?? 0;
//            const offsetY = cropData?.position?.y ?? 0;

            // Устанавливаем канвас под нужный размер (например, 3/2 как aspect)
//            const cropWidth = baseWidth / scale;
//            const cropHeight = (baseWidth / scale) * 2 / 3;

//            canvas.width = cropWidth;
//            canvas.height = cropHeight;

//            ctx.drawImage(
//                img,
//                (baseWidth - cropWidth) / 2 - offsetX,
//                (baseHeight - cropHeight) / 2 - offsetY,
//                cropWidth,
//                cropHeight,
//                0,
//                0,
//                cropWidth,
//                cropHeight
//            );

//            canvas.toBlob((blob) => {
//                if (!blob) return resolve(file); // fallback
//                resolve(new File([blob], file.name, { type: blob.type }));
//            }, file.type);
//        };
//    });
//}




export default function StepThreePhotos({ formData, setFormData, onBack, onSubmit, submitting }: Props) {
    const [gallery, setGallery] = useState<GalleryItem[]>([]);

    useEffect(() => {
        const restoreGallery = async () => {
            const savedData = formData.get('galleryData');
            const savedFiles = formData.getAll('photos').filter((f): f is File => f instanceof File);

            const backup = formData.get('galleryBackup');

            const parseAndRestore = async (source: string, files: File[], croppedFiles: (File | null)[]) => {
                try {
                    const parsed = JSON.parse(source);
                    const restored: GalleryItem[] = await Promise.all(
                        (parsed as GalleryItem[]).map(async (item: GalleryItem, index) => {
                            const file = files[index];
                            const croppedFile = croppedFiles[index] ?? undefined;

                            return {
                                id: item.id,
                                file,
                                cropData: item.cropData ?? undefined,
                                croppedFile,
                            };
                        })
                    );
                    return restored;
                } catch (err) {
                    console.warn('Ошибка при парсинге и восстановлении галереи:', err);
                    return [];
                }
            };

            if (savedData && savedFiles.length > 0) {
                const croppedFiles = formData.getAll('croppedPhotos').filter((f): f is File => f instanceof File);

                const restoredFromData = await parseAndRestore(savedData as string, savedFiles, croppedFiles);
                if (restoredFromData.length > 0) {
                    setGallery(restoredFromData);
                    return;
                }
            }

            if (backup && savedFiles.length > 0) {
                const croppedFiles = formData.getAll('croppedPhotos').filter((f): f is File => f instanceof File);

                const restoredFromBackup = await parseAndRestore(backup as string, savedFiles, croppedFiles);
                if (restoredFromBackup.length > 0) {
                    setGallery(restoredFromBackup);
                    return;
                }
            }
        };

        restoreGallery();
    }, [formData]); // ⬅️ добавляем зависимость, если formData может меняться при возврате



    const [activeCropIndex, setActiveCropIndex] = useState<number | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const sensors = useSensors(
        // Чуть более быстрый и «липкий» захват для DnD
        useSensor(TouchSensor, { activationConstraint: { delay: 90, tolerance: 12 } }),
        useSensor(PointerSensor, { activationConstraint: { delay: 90, tolerance: 12 } }),
    );

    const handleFiles = async (files: FileList | null) => {
        if (!files) return;
        const all = Array.from(files);
        const supportedFiles = all.filter((f) => {
            const mime = (f.type || '').toLowerCase();
            const name = (f.name || '').toLowerCase();
            if (mime.includes('heic') || mime.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif')) {
                return false;
            }
            return !mime || mime.startsWith('image/');
        });
        const unsupportedCount = all.length - supportedFiles.length;

        const allowedCount = Math.max(0, 10 - gallery.length);
        if (allowedCount <= 0) return;

        const filesToAdd = supportedFiles.slice(0, allowedCount);
        const ignoredCount = supportedFiles.length - filesToAdd.length;

        const downscaled: GalleryItem[] = [];
        for (const f of filesToAdd) {
            // Для мобильного создаём более агрессивный даунскейл,
            // чтобы 10 больших фото гарантированно укладывались в лимит бэка.
            const df = await downscaleImageFile(f, 1400, 'image/jpeg', 0.8);
            downscaled.push({ id: crypto.randomUUID(), file: df });
        }

        setGallery((prev) => [...prev, ...downscaled]);

        if (unsupportedCount > 0) {
            alert('Некоторые файлы не были добавлены: поддерживаются только изображения (кроме HEIC/HEIF).');
        }
        if (ignoredCount > 0) {
            alert(`Добавлено только ${filesToAdd.length} из ${supportedFiles.length} фото. Максимум — 10.`);
        }
    };

    const handleReplace = (
        index: number,
        croppedFile: File,
        cropData?: GalleryItem['cropData']
    ) => {
        setGallery((prev) => {
            const updated = [...prev];
            const original = prev[index];
            if (!original) return prev;
            updated[index] = {
                ...original,
                croppedFile,
                cropData,
            };
            return updated;
        });
    };



    const handleRemove = (index: number) => {
        setGallery((prev) => prev.filter((_, i) => i !== index));
    };

    const handleDragEnd = ({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return;
        const oldIndex = gallery.findIndex((g) => g.id === active.id);
        const newIndex = gallery.findIndex((g) => g.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
            setGallery((items) => arrayMove(items, oldIndex, newIndex));
        }
    };


    function persistGallery() {
        formData.delete('photos');
        formData.delete('galleryData');

        gallery.forEach(({ file }) => {
            formData.append('photos', file);
        });

        const serialized = gallery.map((item) => ({
            id: item.id,
            cropData: item.cropData ?? null,
        }));

        formData.set('galleryData', JSON.stringify(serialized));
        formData.set('galleryFiles', JSON.stringify(gallery.map(() => true)));

        formData.set(
            'galleryBackup',
            JSON.stringify(
                gallery.map(({ id, file, cropData }) => ({
                    id,
                    fileUrl: URL.createObjectURL(file),
                    cropData,
                }))
            )
        );

        formData.delete('croppedPhotos');
        gallery.forEach(({ croppedFile }) => {
            if (croppedFile) {
                formData.append('croppedPhotos', croppedFile);
            }
        });


        setFormData(formData);
    }

    const handleNext = () => {
        if (submitting) return;        // 🛡️ не жмём повторно

        if (gallery.length === 0) {
            alert('Пожалуйста, добавьте хотя бы одну фотографию кэмпа.');
            return;
        }

        // сохраняем галерею в formData (как и было)
        persistGallery();
        onSubmit();
    };


    return (
        <div className="flex flex-col h-full">
            {activeCropIndex === null && (
                <>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>

                            {gallery.length === 0 && (
                                <div className="w-full mb-4">
                                    <label
                                        htmlFor="camp-photos-mobile"
                                        className="w-full h-40 border-2 border-dashed border-gray-300 rounded-xl flex flex-col justify-center items-center text-gray-400 text-sm gap-1"
                                    >
                                        <div className="text-3xl leading-none">+</div>
                                        <div>Добавьте фото</div>
                                        <input
                                            id="camp-photos-mobile"
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            hidden
                                            disabled={gallery.length >= 10}
                                            onChange={(e) => {
                                                handleFiles(e.target.files);
                                                e.target.value = '';
                                            }}
                                        />
                                    </label>
                                </div>
                            )}

                            {/* Счётчик фото */}
                            {gallery.length > 0 && (
                                <p className="text-xs text-gray-500 text-center mb-2">
                                    {gallery.length}/10 фото выбрано
                                </p>
                            )}

                            <SortableContext items={gallery.map((item) => item.id)} strategy={rectSortingStrategy}>
                                <div className="grid grid-cols-3 gap-2">
                                    {/* Заглавное фото */}
                                    {gallery[0] && (
                                        <SortablePhoto
                                            key={gallery[0].id}
                                            id={gallery[0].id}
                                            index={0}
                                            item={gallery[0]}
                                            onClick={() => {
                                                const image = new Image();
                                                image.src = URL.createObjectURL(gallery[0].file);
                                                image.onload = () => {
                                                    setTimeout(() => setActiveCropIndex(0), 10);
                                                };
                                            }}
                                            onRemove={() => handleRemove(0)}
                                        />
                                    )}

                                    {/* Кнопка + всегда после первого фото */}
                                    {gallery.length > 0 && gallery.length < 10 && (
                                        <div
                                            key="add"
                                            className="w-[96px] h-[64px] border border-dashed border-gray-300 rounded-md flex items-center justify-center cursor-pointer"
                                            onClick={() => inputRef.current?.click()}
                                        >
                                            <Plus className="text-gray-400" />
                                            <input
                                                type="file"
                                                accept="image/*"
                                                multiple
                                                hidden
                                                ref={inputRef}
                                                onChange={(e) => {
                                                    handleFiles(e.target.files);
                                                    e.target.value = '';
                                                }}
                                            />
                                        </div>
                                    )}

                                    {/* Остальные фото (index ≥ 1) */}
                                    {gallery.slice(1).map((item, i) => (
                                        <SortablePhoto
                                            key={item.id}
                                            id={item.id}
                                            index={i + 1}
                                            item={item}
                                            onClick={() => {
                                                const image = new Image();
                                                image.src = URL.createObjectURL(gallery[i + 1].file);
                                                image.onload = () => {
                                                    setTimeout(() => setActiveCropIndex(i + 1), 10);
                                                };
                                            }}
                                            onRemove={() => handleRemove(i + 1)}
                                        />
                                    ))}
                                </div>
                            </SortableContext>

                        </DndContext>
                    </div>

                    <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 flex justify-between">
                        <button
                            onClick={() => {
                                persistGallery();
                                onBack();
                            }}
                            className="bg-gray-100 text-gray-800 px-4 py-2 rounded-full font-medium text-sm w-[48%]"
                            disabled={!!submitting}
                        >
                            Назад
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={!!submitting}
                            className={`bg-black text-white px-4 py-2 rounded-full font-semibold text-sm w-[48%] ${submitting ? 'opacity-60 pointer-events-none' : ''}`}
                            aria-busy={!!submitting}
                        >
                            {submitting ? 'Делаем кэмп…' : 'Готово'}
                        </button>
                    </div>
                </>
            )}

            {activeCropIndex !== null && (
                <PhotoCropModal
                    imageSrc={URL.createObjectURL(gallery[activeCropIndex]?.file)}
                    aspect={3 / 2}
                    startAtCover
                    initialScale={
                        gallery[activeCropIndex]?.cropData
                            ? gallery[activeCropIndex]?.cropData.scale
                            : undefined
                    }
                    initialPosition={
                        gallery[activeCropIndex]?.cropData
                            ? gallery[activeCropIndex]?.cropData.position
                            : undefined
                    }
                    onClose={() => setActiveCropIndex(null)}
                    onComplete={(croppedFile, cropMeta) => {
                        handleReplace(activeCropIndex, croppedFile, cropMeta);
                        setActiveCropIndex(null);
                    }}
                />
            )}

        </div>
    );
}

function SortablePhoto({
                           id,
                           item,
                           index,
                           onClick,
                           onRemove,
                       }: {
    id: string;
    item: GalleryItem;
    index: number;
    onClick: () => void;
    onRemove: () => void;
}) {
    const {
        setNodeRef,
        attributes,
        listeners,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const previewUrl = useMemo(() => {
        const file = item.croppedFile ?? item.file;
        return URL.createObjectURL(file);
    }, [item]);

    // Логика определения клик vs drag (как в CreatePostProfileMobilePage)
    const touchStartTs = useRef(0);
    const movedRef = useRef(false);
    const holdTimerRef = useRef<number | null>(null);
    const [armDrag, setArmDrag] = useState(false);

    const clearHold = () => {
        if (holdTimerRef.current) {
            window.clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }
    };

    const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).closest('button')) return;
        touchStartTs.current = Date.now();
        movedRef.current = false;
        clearHold();
        holdTimerRef.current = window.setTimeout(() => {
            movedRef.current = true;
            setArmDrag(true);
        }, 150);
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        movedRef.current = true;
        clearHold();
        if (armDrag) {
            try { e.preventDefault(); } catch { /* noop */ }
        }
    }, [armDrag]);

    const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        clearHold();
        setArmDrag(false);
        const duration = Date.now() - touchStartTs.current;
        const isClick = !movedRef.current && duration < 200;
        if (isClick) {
            e.stopPropagation();
            onClick();
        }
    }, [onClick]);

    const handlePointerCancel = useCallback(() => {
        clearHold();
        setArmDrag(false);
    }, []);

    const baseTransform = CSS.Transform.toString(transform);
    const isLifted = isDragging;
    const scale = isDragging ? 1.04 : 1;
    const transformParts: string[] = [];
    if (baseTransform) transformParts.push(baseTransform);
    if (scale !== 1) transformParts.push(`scale(${scale})`);
    const finalTransform = transformParts.join(' ');

    const finalTransition = isLifted
        // Во время самого перетаскивания не анимируем transform,
        // чтобы движение было максимально отзывчивым.
        ? 'box-shadow 160ms ease, opacity 120ms ease'
        : (transition
            ? `${transition}, box-shadow 160ms ease, opacity 120ms ease`
            : 'transform 160ms ease, box-shadow 160ms ease, opacity 120ms ease');

    const style = {
        transform: finalTransform || undefined,
        transition: finalTransition,
        zIndex: isLifted ? 60 : 'auto',
        touchAction: armDrag || isDragging ? 'none' as const : 'pan-x' as const,
        userSelect: 'none' as const,
        WebkitUserSelect: 'none' as const,
        WebkitTouchCallout: 'none' as const,
        boxShadow: isLifted ? '0 18px 42px rgba(15, 23, 42, 0.22)' : '0 4px 12px rgba(15, 23, 42, 0.08)',
    } as const;

    return (
        <div
            ref={setNodeRef}
            style={style}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onContextMenu={(e) => e.preventDefault()}
            className={`relative overflow-hidden rounded-md border border-gray-200 bg-gray-50 ${
                index === 0 ? 'col-span-3 w-full aspect-[3/2]' : 'w-[96px] h-[64px]'
            }`}
        >
            {/* Drag handle */}
            <div
                {...attributes}
                {...listeners}
                className="absolute inset-0 cursor-grab active:cursor-grabbing"
                onContextMenu={(e) => e.preventDefault()}
            />

            {/* Фото */}
            <img
                src={previewUrl}
                alt={`Фото ${index + 1}`}
                className="w-full h-full object-cover select-none"
                draggable={false}
            />

            {/* Плашка "Заглавное" */}
            {index === 0 && (
                <span className="absolute top-1 left-1 bg-black bg-opacity-60 text-white text-xs px-2 py-0.5 rounded">
                    Заглавное
                </span>
            )}

            {/* Удаление */}
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onRemove();
                }}
                className="absolute top-1 right-1 z-10 w-6 h-6 rounded-full bg-black bg-opacity-60 text-white text-xs font-bold flex items-center justify-center"
            >
                ✕
            </button>
        </div>
    );
}
