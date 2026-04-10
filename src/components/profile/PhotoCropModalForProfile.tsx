'use client';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import CustomCropperFromFile from '@/components/profile/CustomCropperFromFile';
import { useEffect, useState } from 'react';
import { cn } from "@/lib/utils";
import throttle from 'lodash/throttle';

interface Props {
    imageSrc: string;
    onClose: () => void;
    onComplete: (
        file: File,
        meta: { scale: number; position: { x: number; y: number } }
    ) => void;
    aspect?: number;
    initialScale?: number;
    initialPosition?: { x: number; y: number };
    circularCrop?: boolean;
    className?: string;
}

export default function PhotoCropModalForProfile({
                                                     imageSrc,
                                                     onClose,
                                                     onComplete,
                                                     aspect = 1,
                                                     initialScale,
                                                     initialPosition,
                                                     circularCrop,
                                                     className,
                                                 }: Props) {

    const [scale, setScale] = useState<number>(initialScale ?? 0);
    const [minScale, setMinScale] = useState(1);
    const [position, setPosition] = useState<{ x: number; y: number }>(
        initialPosition ?? { x: 0, y: 0 }
    );

    // ✅ Сгенерировать blob из imageFile


    // ✅ Троттлим обновление позиции
    const throttledSetPosition = throttle((pos: { x: number; y: number }) => {
        setPosition(pos);
    }, 150);

    // ✅ Отключаем cmd/ctrl + зум
    useEffect(() => {
        const preventZoom = (e: WheelEvent | KeyboardEvent) => {
            if (
                (e instanceof WheelEvent && (e.ctrlKey || e.metaKey)) ||
                (e instanceof KeyboardEvent &&
                    (e.ctrlKey || e.metaKey) &&
                    ['+', '-', '=', '0'].includes(e.key))
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

    //if (!imageSrc) return null;

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className={cn("max-w-2xl", className)}>
                <DialogTitle className="sr-only">Кадрирование фото</DialogTitle>

                <div className="w-full" style={{ aspectRatio: aspect }}>
                    <CustomCropperFromFile
                        imageSrc={imageSrc}
                        aspectRatio={aspect}
                        circularCrop={circularCrop}
                        onCrop={(blob, meta) => {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                const file = new File([blob], 'cropped-image.jpg', {
                                    type: blob.type,
                                });
                                onComplete(file, meta);
                                onClose();
                            };
                            reader.readAsArrayBuffer(blob);
                        }}
                        onMinScaleChange={(min) => {
                            setMinScale(min);
                            if (initialScale === undefined && scale === 0) {
                                setScale(min);
                            }
                        }}

                        onScaleChange={setScale}
                        onPositionChange={throttledSetPosition}
                        externalScale={scale}
                        initialScale={initialScale}
                        initialPosition={position}
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
