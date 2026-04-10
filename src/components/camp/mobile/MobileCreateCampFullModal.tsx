// components/MobileCreateCampFullModal.tsx

"use client";

import { useState, useEffect } from "react";
import StepOneBasicInfo from "./steps/StepOneBasicInfo";
import StepTwoDescription from "./steps/StepTwoDescription";
import StepThreePhotos from "./steps/StepThreePhotos";
//import { useRouter } from "next/navigation";
import { useMobileCampModal } from "@/context/MobileCampModalContext";
import { acquireHideHeader, releaseHideHeader } from "@/lib/headerVisibility";
import { useBottomNavBar } from "@/context/BottomNavBarContext";
import { useOverlayEnvironment } from "@/context/OverlayEnvironmentContext";
import { useLayerStack } from "@/context/LayerStackContext";
import { uploadFilesToGcs } from "@/lib/directUpload";
import { getBrowserApiBase } from '@/lib/apiBase';

//interface Props {
//    open: boolean;
//    onClose: () => void;
//}

const resolveApiBase = () => getBrowserApiBase().replace(/\/+$/, '');

export default function MobileCreateCampFullModal() {
    const { setHide } = useBottomNavBar();
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState<FormData>(new FormData());
    const [campTitle, setCampTitle] = useState("");
    //const [gallery, ] = useState<GalleryItem[]>([]);
    //const router = useRouter();

    const [submitting, setSubmitting] = useState(false);
    const [submitStage, setSubmitStage] = useState<'idle' | 'upload' | 'create'>('idle');
    const [submitProgress, setSubmitProgress] = useState(0);
    const [submitFiles, setSubmitFiles] = useState<{ fileIndex: number; fileCount: number } | null>(null);
    const { setOpen } = useMobileCampModal();
    const { isOverlay } = useOverlayEnvironment();
    const { closeTopScreen } = useLayerStack();
    
    const handleClose = () => {
        if (isOverlay) {
            closeTopScreen();
        } else {
            setOpen(false);
        }
    };



    const handleComplete = async () => {
        if (submitting) return;
        setSubmitting(true);
        try {
            const csrfToken = getCookie("csrftoken");

            const galleryMetaRaw = formData.get('galleryData') as string | null;
            const originals = formData.getAll('photos').filter(f => f instanceof File) as File[];
            const cropped = formData.getAll('croppedPhotos').filter(f => f instanceof File) as File[];

            let ci = 0; // индекс в массиве cropped
            let finalFiles: File[] = [];

            if (galleryMetaRaw) {
                try {
                    type CropData = { scale: number; position: { x: number; y: number } } | null;
                    type GalleryMetaItem = { id: string; cropData: CropData };

                    const meta = JSON.parse(galleryMetaRaw) as GalleryMetaItem[];
                    finalFiles = meta.map((m, idx) => {
                        if (m?.cropData) {
                            const f = cropped[ci++];
                            return f ?? originals[idx]; // страховка
                        }
                        return originals[idx];
                    }).filter(Boolean) as File[];
                } catch {
                    finalFiles = originals;
                }
            } else {
                finalFiles = originals;
            }

            finalFiles = finalFiles.slice(0, 10);

            // 3) Загружаем все фотографии напрямую в GCS и собираем object_name[]
            let preuploadedNames: string[] = [];
            try {
                setSubmitStage('upload');
                setSubmitProgress(0);
                setSubmitFiles(null);
                preuploadedNames = await uploadFilesToGcs(finalFiles, csrfToken, 'camp', (info) => {
                    setSubmitProgress(info.percent);
                    setSubmitFiles({ fileIndex: info.fileIndex, fileCount: info.fileCount });
                });
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error('[MobileCreateCampFullModal] direct upload failed', e);
                alert(e instanceof Error ? e.message : 'Ошибка загрузки фото');
                setSubmitting(false);
                setSubmitStage('idle');
                setSubmitProgress(0);
                setSubmitFiles(null);
                return;
            }

            // 4) Чистим лишние поля и кладём то, что ждёт бэкенд
            // Убираем все тяжёлые бинарные поля, которые использовались только
            // для промежуточного состояния мастера (они не нужны бэкенду).
            formData.delete("title_image");
            formData.delete("gallery_images");
            formData.delete("photos");
            formData.delete("croppedPhotos");

            // Оставляем небольшой файл-обложку в multipart, чтобы не ломать title_image
            if (finalFiles.length) {
                formData.set("title_image", finalFiles[0]);
            }

            // Всё остальное — через preuploaded_gallery (объекты в GCS)
            if (preuploadedNames.length) {
                formData.set("preuploaded_gallery", JSON.stringify(preuploadedNames));
            }

            ["galleryData", "galleryFiles", "galleryBackup"].forEach(k => formData.delete(k));


            //if (gallery.length > 0) {
            //    formData.set(
            //        "title_image",
            //        gallery[0].croppedFile || gallery[0].originalFile
            //    );
            //    gallery.slice(0, 10).forEach((item) => {
            //        formData.append(
            //            "gallery_images",
            //            item.croppedFile || item.originalFile
            //        );
            //    });
            // }

            setSubmitStage('create');
            const API_BASE = resolveApiBase();
            const createCampUrl = API_BASE.startsWith('/')
                ? `${API_BASE}/api/create-camp`
                : `${API_BASE}/api/create-camp/`;
            const res = await fetch(
                createCampUrl,
                {
                    method: "POST",
                    headers: { "X-CSRFToken": csrfToken || "" },
                    credentials: "include",
                    body: formData,
                }
            );

            if (res.ok) {
                // Читаем ответ для проверки успешности
                try {
                    const data = await res.json().catch(() => null);
                    // eslint-disable-next-line no-console
                    console.log('[MobileCreateCampFullModal] camp created successfully', { data });
                    const campId = (data && typeof (data as Record<string, unknown>).id === 'number')
                        ? (data as Record<string, unknown>).id as number
                        : null;
                    if (campId && typeof window !== 'undefined') {
                        try {
                            window.dispatchEvent(new CustomEvent('navumi:camp-created', { detail: { id: campId } }));
                        } catch { /* noop */ }
                    }
                } catch (e) {
                    // eslint-disable-next-line no-console
                    console.warn('[MobileCreateCampFullModal] failed to parse response', e);
                }
                
                // Сбрасываем состояние отправки перед закрытием
                setSubmitting(false);
                setSubmitStage('idle');
                setSubmitProgress(0);
                setSubmitFiles(null);
                
                // закрываем полноэкранную модалку
                // Небольшая задержка для плавного закрытия
                setTimeout(() => {
                    handleClose();
                }, 100);
            } else {
                // Обрабатываем ошибку
                let errorMessage = "Ошибка создания кэмпа";
                try {
                    const data = await res.json().catch(() => ({}));
                    errorMessage = data.error || data.message || errorMessage;
                } catch {
                    // Если не удалось распарсить JSON, используем статус
                    errorMessage = `Ошибка создания кэмпа (${res.status})`;
                }
                alert(errorMessage);
                setSubmitting(false);
                setSubmitStage('idle');
                setSubmitProgress(0);
                setSubmitFiles(null);
            }
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[MobileCreateCampFullModal] submit error', err);
            alert("Ошибка сети");
            setSubmitting(false);
            setSubmitStage('idle');
            setSubmitProgress(0);
            setSubmitFiles(null);
        }
    };

    const [showConfirmExit, setShowConfirmExit] = useState(false);
    const { setRequestExit } = useMobileCampModal();
    const [, setNextHref] = useState<string | null>(null);


    useEffect(() => {
        if (setRequestExit) {
            setRequestExit(() => (nextHref?: string) => {
                setNextHref(nextHref || "/search");
                setShowConfirmExit(true);
            });
        }
    }, [setRequestExit]);



    useEffect(() => {
        acquireHideHeader();
        setHide(true);
        if (typeof document !== 'undefined') {
            const root = document.documentElement;
            root.classList.add('camp-modal-open');
        }
        return () => {
            releaseHideHeader();
            setHide(false);
            if (typeof document !== 'undefined') {
                const root = document.documentElement;
                root.classList.remove('camp-modal-open');
                root.classList.remove('camp-modal-pac-hidden');
            }
        };
    }, [setHide]);



    return (
        <div className="absolute inset-0 h-full bg-white overflow-hidden">

            {/* Шапка */}
            <div className="pt-2 pb-2.5 px-4 border-b border-gray-200">
                <h1 className="text-lg font-semibold">
                    {step === 1 && "Создание кэмпа"}
                    {step > 1 && campTitle}
                </h1>
                <p className="text-sm text-gray-500">{step} шаг из 3</p>
            </div>

            {/* Контент */}
            <div className="flex flex-col h-full">
                <div className="flex-1 overflow-y-auto px-4 pt-2 pb-28 space-y-4">
                    {step === 1 && (
                        <StepOneBasicInfo
                            formData={formData}
                            setFormData={setFormData}
                            setCampTitle={setCampTitle}
                            onNext={() => setStep(2)}
                        />
                    )}
                    {step === 2 && (
                        <StepTwoDescription
                            formData={formData}
                            setFormData={setFormData}
                            onBack={() => setStep(1)}
                            onNext={() => setStep(3)}
                        />
                    )}
                    {step === 3 && (
                        <StepThreePhotos
                            formData={formData}
                            setFormData={setFormData}
                            onBack={() => setStep(2)}
                            onSubmit={handleComplete}
                            submitting={submitting}
                        />
                    )}
                </div>
            </div>

            {/* Закрыть */}
            <button
                className="absolute right-4 top-4 text-gray-400 hover:text-black text-xl"
                onClick={() => setShowConfirmExit(true)}
                disabled={submitting}
            >
                ✕
            </button>


            {showConfirmExit && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
                    <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-lg">
                        <h2 className="text-base font-semibold mb-2">Прервать создание кэмпа?</h2>
                        <p className="text-sm text-gray-600 mb-4">
                            Все несохранённые данные будут потеряны. Вы уверены, что хотите выйти?
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                className="text-sm text-gray-600 hover:text-black"
                                onClick={() => setShowConfirmExit(false)}
                            >
                                Отмена
                            </button>
                            <button
                                className="text-sm font-semibold text-red-600 hover:text-red-700"
                                onClick={() => {
                                    setShowConfirmExit(false);
                                    handleClose();
                                }}
                            >
                                Да, выйти
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {submitting && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-white/80">
                    <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-400 border-t-transparent" />
                    <div className="text-sm text-gray-700">
                        {submitStage === 'upload'
                            ? `Загружаем фото ${submitProgress}%${submitFiles ? ` (${submitFiles.fileIndex}/${submitFiles.fileCount})` : ''}`
                            : 'Создаем кэмп...'}
                    </div>
                </div>
            )}

        </div>
    );
}

function getCookie(name: string): string | null {
    if (typeof document === "undefined") return null;
    const cookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith(name + "="));
    return cookie ? decodeURIComponent(cookie.split("=")[1]) : null;
}

//interface GalleryItem {
//    id: string;
//    originalFile: File;
//    croppedFile?: File;
//    url: string;
//    cropMeta?: { scale: number; position: { x: number; y: number } };
//}
