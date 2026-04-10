import React, { useState, useCallback } from "react";
import Cropper, { Area } from "react-easy-crop";
import { getCroppedImg } from '@/lib/cropImage';
export default function AvatarCropStandalone({
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

    }, [imageSrc, croppedAreaPixels]);

    return (
        <div>
            <div
                style={{
                    position: "relative",
                    width: 400,
                    height: 400,
                    background: "#ddd",
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
                        mediaStyle: { objectFit: "cover" },
                        cropAreaStyle: {
                            borderRadius: "50%",
                            boxShadow: "0 0 0 9999px rgba(0,0,0,0.5) inset",
                        },
                    }}
                />
            </div>
            <button onClick={handleFinish} style={{ marginTop: 12 }}>
                Сохранить
            </button>
        </div>
    );
}
