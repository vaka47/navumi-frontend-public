'use client';

import React, {
    useEffect,
    useRef,
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
}

export default function CustomCropperFromFile({
                                                  imageSrc,
                                                  aspectRatio,
                                                  onCrop,
                                                  onMinScaleChange,
                                                  onScaleChange,
                                                  onPositionChange,
                                                  externalScale,
                                                  initialScale,
                                                  initialPosition,
                                                  circularCrop,
                                              }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);

    const [scale, setScale] = useState(1);
    const [, setMinScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    //const [imageSrc, setImageSrc] = useState<string>("");

    //const MAX_ZOOM_RATIO = 3;



    const applyZoom = useCallback((nextScale: number, center?: { x: number; y: number }) => {
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
    }, [scale, position, onScaleChange, onPositionChange]);

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
            const initial = Math.min(scaleX, scaleY);

            setMinScale(initial);
            onMinScaleChange?.(initial);

            if (!didInitRef.current) {
                const startingScale = initialScale ?? initial;
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

    useEffect(() => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas || !img) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, position.x, position.y, img.naturalWidth * scale, img.naturalHeight * scale);
    }, [scale, position]);

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

    return (
        <div className="relative w-full h-full">
            <div className="relative w-full h-full border border-gray-300 bg-black overflow-hidden" style={{ aspectRatio }}>
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
            </div>
        </div>
    );
}
