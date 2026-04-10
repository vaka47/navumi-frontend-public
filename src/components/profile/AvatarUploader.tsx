'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import Cropper, { Area } from 'react-easy-crop';
import { getCroppedImg } from '@/lib/cropImage';

// Встроенный обрезчик аватарки
function AvatarCropStandalone({
                                  imageSrc,
                                  onComplete,
                              }: {
    imageSrc: string;
    onComplete: (file: File, url: string) => void;
}) {
    const [zoom, setZoom] = useState(1);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

    const handleCropComplete = useCallback((_: Area, croppedPixels: Area) => {
        setCroppedAreaPixels(croppedPixels);
    }, []);

    const handleFinish = useCallback(async () => {
        if (!imageSrc || !croppedAreaPixels) return;
        const { file, url } = await getCroppedImg(imageSrc, croppedAreaPixels);
        onComplete(file, url);
    }, [imageSrc, croppedAreaPixels, onComplete]);

    return (
        <div className="flex flex-col items-center">
            <div
                style={{
                    position: 'relative',
                    width: 360,
                    height: 360,
                    background: '#ddd',
                }}
            >
                <Cropper
                    image={imageSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={1}
                    cropShape="round"
                    showGrid={false}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={handleCropComplete}
                    style={{
                        mediaStyle: { objectFit: 'cover' },
                        cropAreaStyle: {
                            borderRadius: '50%',
                            boxShadow: '0 0 0 9999px rgba(0,0,0,0.5) inset',
                        },
                    }}
                />
            </div>
            <button
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
                onClick={handleFinish}
            >
                Сохранить
            </button>
        </div>
    );
}

// Основной компонент
export default function AvatarUploader({
                                           onAvatarCropped,
                                           size = 160,
                                           initialUrl,
                                       }: {
    onAvatarCropped: (file: File) => void;
    size?: number;
    initialUrl?: string;
}) {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [rawImage, setRawImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (initialUrl) {
            setPreviewUrl(initialUrl);
        }
    }, [initialUrl]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = () => {
                setRawImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="flex flex-col items-center space-y-4 w-full">
            <div
                className="rounded-full overflow-hidden border cursor-pointer"
                style={{ width: size, height: size }}
                onClick={() => fileInputRef.current?.click()}
            >
                {previewUrl && (
                    <img
                        src={previewUrl}
                        alt="Avatar"
                        className="w-full h-full object-cover"
                    />
                )}
            </div>

            <input
                ref={fileInputRef}
                id="file-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
            />

            <Button
                type="button"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
            >
                Выбрать фото
            </Button>

            {/* Crop-блок */}
            {rawImage && (
                <AvatarCropStandalone
                    imageSrc={rawImage}
                    onComplete={(file: File, url: string) => {
                        setPreviewUrl(url);
                        onAvatarCropped(file);
                        setRawImage(null);
                    }}
                />
            )}
        </div>
    );
}
