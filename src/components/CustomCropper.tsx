'use client';


import React, {
    useRef,
    useEffect,
    useState,
    useCallback,
} from 'react';

interface Props {
    imageSrc: string;
    aspectRatio: number;
    onCrop: (blob: Blob, meta: { scale: number; position: { x: number; y: number } }) => void;
    onMinScaleChange: (min: number) => void;
    onScaleChange?: (scale: number) => void;
    onPositionChange?: (position: { x: number; y: number }) => void;
    externalScale?: number;
    initialScale?: number;
    initialPosition?: { x: number; y: number };
    circularCrop?: boolean;
    startAtCover?: boolean;
}

export default function CustomCropper({
                                          imageSrc,
                                          aspectRatio,
                                          onCrop,
                                          onScaleChange,
                                          onMinScaleChange,
                                          externalScale,
                                          initialScale,
                                          initialPosition,
                                          onPositionChange,
                                          circularCrop,
                                          startAtCover = true,
                                      }: Props) {

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);

    const [scale, setScale] = useState(1);
    const [minScale, setMinScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });

    const MAX_ZOOM_RATIO = 3;

    const applyZoom = useCallback(
        (nextScale: number, center?: { x: number; y: number }) => {
            const canvas = canvasRef.current;
            const img = imgRef.current;
            if (!canvas || !img) return;

            const cw = canvas.width;
            const ch = canvas.height;
            const iw = img.naturalWidth * nextScale;
            const ih = img.naturalHeight * nextScale;

            const prevScale = scale;

            const cx = center?.x ?? cw / 2;
            const cy = center?.y ?? ch / 2;

            const imageX = (cx - position.x) / prevScale;
            const imageY = (cy - position.y) / prevScale;

            let newX = cx - imageX * nextScale;
            let newY = cy - imageY * nextScale;

            if (iw <= cw) newX = (cw - iw) / 2;
            else newX = Math.min(0, Math.max(cw - iw, newX));

            if (ih <= ch) newY = (ch - ih) / 2;
            else newY = Math.min(0, Math.max(ch - ih, newY));

            setScale(nextScale);
            setPosition({ x: newX, y: newY });
            onScaleChange?.(nextScale);
            onPositionChange?.({ x: newX, y: newY });
        },
        [scale, position, onScaleChange, onPositionChange]
    );

    const didInitRef = useRef(false);

    useEffect(() => {
        const img = imgRef.current;
        const canvas = canvasRef.current;
        if (!img || !canvas) return;

        didInitRef.current = false;

        img.onload = () => {
            const iw = img.naturalWidth;
            const ih = img.naturalHeight;
            const cw = canvas.parentElement?.clientWidth ?? 0;
            const ch = canvas.parentElement?.clientHeight ?? 0;

            canvas.width = cw;
            canvas.height = ch;

            const scaleX = cw / iw;
            const scaleY = ch / ih;
            const contain = Math.min(scaleX, scaleY);
            const cover = Math.max(scaleX, scaleY);

            try {
                // eslint-disable-next-line no-console
                console.info('[CustomCropper][init]', {
                    iw,
                    ih,
                    cw,
                    ch,
                    aspectRatio,
                    contain,
                    cover,
                    startAtCover,
                    initialScale,
                    initialPosition,
                });
            } catch { /* noop */ }

            setMinScale(contain);
            onMinScaleChange?.(contain);

            if (!didInitRef.current) {
                const startingScale = initialScale ?? (startAtCover ? cover : contain);
                const startingPosition = initialPosition ?? {
                    x: (cw - iw * startingScale) / 2,
                    y: (ch - ih * startingScale) / 2,
                };

                setScale(startingScale);
                setPosition(startingPosition);
                onScaleChange?.(startingScale);
                onPositionChange?.(startingPosition);
                didInitRef.current = true;
            }
        };

        if (img.complete) {
            img.onload?.(new Event('load') as unknown as Event);
        }
    }, [imageSrc, initialScale, initialPosition, onMinScaleChange, onScaleChange, onPositionChange]);
   
    useEffect(() => {
        if (externalScale !== undefined && imgRef.current?.complete) {
            applyZoom(externalScale);
        }
    }, [externalScale, applyZoom]);

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const prevScale = scale;
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        const nextScale = Math.max(minScale, Math.min(minScale * MAX_ZOOM_RATIO, prevScale + delta));

        if (nextScale === prevScale) return;

        const rect = canvasRef.current?.getBoundingClientRect();
        const center = rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : undefined;

        applyZoom(nextScale, center);
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas || !img) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, position.x, position.y, img.naturalWidth * scale, img.naturalHeight * scale);
    }, [scale, position]);

    useEffect(() => {
        let isDragging = false;
        let startX = 0;
        let startY = 0;

        const onMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            startX = e.clientX;
            startY = e.clientY;

            const img = imgRef.current;
            const canvas = canvasRef.current;
            if (!img || !canvas) return;

            const iw = img.naturalWidth * scale;
            const ih = img.naturalHeight * scale;
            const cw = canvas.width;
            const ch = canvas.height;

            setPosition((prev) => {
                let x = prev.x + dx;
                let y = prev.y + dy;

                if (iw <= cw) x = (cw - iw) / 2;
                else x = Math.min(0, Math.max(cw - iw, x));

                if (ih <= ch) y = (ch - ih) / 2;
                else y = Math.min(0, Math.max(ch - ih, y));

                const newPos = { x, y };
                onPositionChange?.(newPos);
                return newPos;
            });
        };

        const onUp = () => {
            isDragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };

        const onDown = (e: MouseEvent) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        };

        const onTouchStart = (e: TouchEvent) => {
            if (e.touches.length !== 1) return;
            e.preventDefault();
            isDragging = true;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            document.addEventListener('touchmove', onTouchMove, { passive: false });
            document.addEventListener('touchend', onTouchEnd);
        };

        const onTouchMove = (e: TouchEvent) => {
            if (!isDragging || e.touches.length !== 1) return;
            e.preventDefault();
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;

            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;

            const img = imgRef.current;
            const canvas = canvasRef.current;
            if (!img || !canvas) return;

            const iw = img.naturalWidth * scale;
            const ih = img.naturalHeight * scale;
            const cw = canvas.width;
            const ch = canvas.height;

            setPosition((prev) => {
                let x = prev.x + dx;
                let y = prev.y + dy;

                if (iw <= cw) x = (cw - iw) / 2;
                else x = Math.min(0, Math.max(cw - iw, x));

                if (ih <= ch) y = (ch - ih) / 2;
                else y = Math.min(0, Math.max(ch - ih, y));

                const newPos = { x, y };
                onPositionChange?.(newPos);
                return newPos;
            });
        };

        const onTouchEnd = () => {
            isDragging = false;
            document.removeEventListener('touchmove', onTouchMove);
            document.removeEventListener('touchend', onTouchEnd);
        };


        canvasRef.current?.addEventListener('mousedown', onDown);
        canvasRef.current?.addEventListener('touchstart', onTouchStart, { passive: false });
        return () => {
            canvasRef.current?.removeEventListener('mousedown', onDown);
            canvasRef.current?.removeEventListener('touchstart', onTouchStart);
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.removeEventListener('touchmove', onTouchMove);
            document.removeEventListener('touchend', onTouchEnd);
        };
    }, [scale, onPositionChange]);

    const handleCrop = useCallback(() => {
        canvasRef.current?.toBlob((blob) => {
            if (blob) onCrop(blob, { scale, position });
        }, 'image/jpeg', 0.95);
    }, [onCrop, scale, position]);

    useEffect(() => {
        const handler = () => handleCrop();
        window.addEventListener('custom-crop', handler);
        return () => window.removeEventListener('custom-crop', handler);
    }, [handleCrop]);



    if (!imageSrc || typeof imageSrc !== "string") {
        console.warn("⚠️ CustomCropper получил пустой imageSrc", imageSrc);
        return null;
    }

    return (
        <div className="relative w-full h-full" onWheelCapture={handleWheel}>
            <div
                className="relative w-full h-full border border-gray-300 bg-black overflow-hidden"
                style={{ aspectRatio }}
            >
                <canvas
                    ref={canvasRef}
                    className="cursor-grab absolute top-0 left-0 w-full h-full"
                />

                {circularCrop && (
                    <div className="absolute inset-0 z-20 pointer-events-none">
                        <div
                            className="absolute inset-0 m-auto border-2 border-white rounded-full"
                            style={{
                                width: '100%',
                                height: '100%',
                                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
                            }}
                        />
                    </div>
                )}


                <img ref={imgRef} src={imageSrc} alt="source" className="hidden" />
                <div className="absolute inset-0 pointer-events-none z-10">
                  {[1, 2].map((i) => (
                        <div
                            key={`v-${i}`}
                            className="absolute top-0 bottom-0 w-px bg-white/30"
                            style={{ left: `${(i * 100) / 3}%` }}
                        />
                    ))}
                  {[1, 2].map((i) => (
                        <div
                            key={`h-${i}`}
                            className="absolute left-0 right-0 h-px bg-white/30"
                            style={{ top: `${(i * 100) / 3}%` }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
