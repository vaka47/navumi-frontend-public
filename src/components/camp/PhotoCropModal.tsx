'use client';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import CustomCropper from '@/components/CustomCropper';
import { useEffect, useState, useMemo } from 'react';
import throttle from 'lodash/throttle';
import { cn } from "@/lib/utils"

interface Props {
    imageSrc: string;
    onClose: () => void;
    onComplete: (file: File, meta: { scale: number; position: { x: number; y: number } }) => void;
    aspect?: number;
    initialScale?: number;
    initialPosition?: { x: number; y: number };
    circularCrop?: boolean;
    className?: string;
    startAtCover?: boolean;
}

export default function PhotoCropModal({
                                           imageSrc,
                                           onClose,
                                           onComplete,
                                           aspect = 3 / 2,
                                           initialScale,
                                           initialPosition,
                                           circularCrop,
                                           className,
                                           startAtCover = false
                                       }: Props) {
    const [scale, setScale] = useState<number>(initialScale !== undefined ? initialScale : 0);
    const [minScale, setMinScale] = useState(1);
    const [position, setPosition] = useState<{ x: number; y: number }>(
        initialPosition ?? { x: 0, y: 0 }
    );

    useEffect(() => {
        // Чтобы подавить предупреждение об "unused variable"
        //console.debug('[CropModal] позиция обновлена:', position);
    }, [position]);

    const throttledSetPosition = useMemo(
        () =>
            throttle((pos: { x: number; y: number }) => {
                setPosition(pos);
                //console.log('[CropModal] позиция обновлена:', pos);
            }, 150),
        []
    );

    useEffect(() => {
        const preventZoom = (e: WheelEvent | KeyboardEvent) => {
            if (
                (e instanceof WheelEvent && (e.ctrlKey || e.metaKey)) ||
                (e instanceof KeyboardEvent && (e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key))
            ) {
                e.preventDefault();
            }
        };
        document.addEventListener('wheel', preventZoom, { passive: false });
        document.addEventListener('keydown', preventZoom, { passive: false });
        return () => {
            document.removeEventListener('wheel', preventZoom);
            document.removeEventListener('keydown', preventZoom);
        };
    }, []);

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent
                aria-describedby="crop-modal-desc"
                className={cn("max-w-2xl [&>button]:hidden", className)}
            >

                <p id="crop-modal-desc" className="sr-only">
                    Модальное окно кадрирования фото
                </p>
                <DialogTitle className="sr-only">Кадрирование фото</DialogTitle>

                <div className="w-full" style={{ aspectRatio: aspect }}>
                    <CustomCropper
                        imageSrc={imageSrc}
                        aspectRatio={aspect}
                        onCrop={(blob, meta) => {
                            const extFromType = (t: string) =>
                                t === 'image/webp' ? 'webp'
                                    : t === 'image/png' ? 'png'
                                        : 'jpg';

                            const ext = extFromType(blob.type);
                            const unique = `avatar_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

                            const file = new File([blob], unique, { type: blob.type });
                            onComplete(file, meta);
                            onClose();
                        }}
                        onMinScaleChange={(min) => {
                            setMinScale(min);
                        }}

                        onScaleChange={setScale}
                        onPositionChange={throttledSetPosition}
                        externalScale={scale}
                        initialScale={initialScale}
                        initialPosition={initialPosition}
                        circularCrop={circularCrop}
                        startAtCover={startAtCover}
                    />
                </div>

                <div className="mt-4 flex items-center gap-3">
                    <span className="text-sm text-gray-500">Зум</span>
                    <input
                        type="range"
                        min={minScale}
                        max={minScale * 3}
                        step={0.01}
                        value={scale}
                        onChange={(e) => setScale(parseFloat(e.target.value))}
                        className="w-full"
                    />
                </div>

                <div className="flex justify-end mt-4 gap-2">
                    <Button variant="outline" onClick={onClose}>
                        Отмена
                    </Button>
                    <Button
                        onClick={() => {
                            const event = new Event('custom-crop');
                            window.dispatchEvent(event);
                        }}
                    >
                        Сохранить
                    </Button>
                </div>
            </DialogContent>
        </Dialog>

    );
}
