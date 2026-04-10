'use client';

import React, { useState, useCallback } from "react";
import Cropper, { Area } from "react-easy-crop";
import {getCroppedImg} from "@/lib/cropImage";
//import getCroppedImg, { dataURLtoFile } from "@/lib/cropImage";
import { Button } from "@/components/ui/button";

export default function AvatarCropModal({
                                            onClose,
                                            onCropComplete,
                                            imageSrc,
                                        }: {
    onClose: () => void;
    onCropComplete: (file: File, url: string) => void;
    imageSrc: string;
}) {
    const [zoom, setZoom] = useState(1);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

    const handleCropComplete = useCallback((_: Area, croppedPixels: Area) => {
        setCroppedAreaPixels(croppedPixels);
    }, []);

    const handleSave = useCallback(async () => {
        if (!imageSrc || !croppedAreaPixels) return;
        //const croppedDataUrl = await getCroppedImg(imageSrc, croppedAreaPixels);
        const { file, url } = await getCroppedImg(imageSrc, croppedAreaPixels);
        onCropComplete(file, url);
        onClose();
    }, [croppedAreaPixels, imageSrc, onCropComplete, onClose]);

    return (
        <div className="flex flex-col items-center">
            <div className="relative w-[360px] h-[360px] bg-muted rounded-md overflow-hidden">
                <Cropper
                    image={imageSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={1}
                    cropShape="round"
                    showGrid={true}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={handleCropComplete}
                    style={{
                        mediaStyle: { objectFit: 'cover' },
                        cropAreaStyle: {
                            border: 'none',
                            borderRadius: '50%',
                            boxShadow: '0 0 0 9999px rgba(0,0,0,0.5) inset',
                        },
                    }}
                />
            </div>

            <Button className="mt-4" variant="default" onClick={handleSave} disabled={!croppedAreaPixels}>
                Сохранить
            </Button>
        </div>
    );
}
