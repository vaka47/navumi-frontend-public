'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';

//import { Input } from '@/components/ui/input';
//import { Textarea } from '@/components/ui/textarea';
//import { Button } from '@/components/ui/button';
//import { Checkbox } from '@/components/ui/checkbox';
//import { Label } from '@/components/ui/label';
import { Autocomplete } from '@react-google-maps/api';
import { motion, AnimatePresence } from 'framer-motion';
//import { useGooglePlacesReady } from "@/lib/hooks/useGooglePlacesReady";
import { loadGooglePlaces } from "@/lib/google/loadGooglePlaces";
import { getBrowserApiBase } from '@/lib/apiBase';
//import { ChangeEvent } from 'react';
import { Dialog, DialogContent, DialogPortal, DialogOverlay } from '@/components/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';



//import GoogleAutocompleteInput from '@/components/search/GoogleAutocompleteInput';
import { ActivityAutocomplete } from '@/components/search/ActivityAutocomplete';
import { HashtagAutocomplete } from '@/components/search/HashtagAutocomplete';
import CampDateInputs from '@/components/camp/CampDateInputs';
import PhotoCropModal from '@/components/camp/PhotoCropModal';

import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    arrayMove,
    useSortable,
    horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { uploadFilesToGcs } from '@/lib/directUpload';

interface Props {
    open: boolean;
    onClose: () => void;
}

interface Activity {
    id: number;
    name: string;
}

interface Hashtag {
    id: number;
    name: string;
}

interface GalleryItem {
    id: string;
    originalFile: File;
    croppedFile?: File;
    url: string;
    cropMeta?: { scale: number; position: { x: number; y: number } };
}

async function downscaleCampImage(
    file: File,
    maxSide: number = 2000,
    targetType: string = 'image/jpeg',
    quality: number = 0.85
): Promise<File> {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            try {
                let w = img.naturalWidth;
                let h = img.naturalHeight;
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

function getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const cookie = document.cookie
        .split('; ')
        .find((row) => row.startsWith(name + '='));
    return cookie ? decodeURIComponent(cookie.split('=')[1]) : null;
}

function SortablePhoto({
                           id,
                           index,
                           croppedFile,
                           originalFile,
                           onClick,
                           onRemove,
                       }: {
    id: string;
    index: number;
    croppedFile?: File;
    originalFile?: File;
    onClick: () => void;
    onRemove: () => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: isDragging ? CSS.Transform.toString(transform) : undefined,
        zIndex: isDragging ? 50 : 'auto',
    };

    const previewUrl = useMemo(() => {
        try {
            const file = croppedFile ?? originalFile;
            if (!file) return '';
            return URL.createObjectURL(file);
        } catch {
            return '';
        }
    }, [croppedFile, originalFile]);



    // добавил для закрытися хвостов превьюх. может надо будет удалить
    useEffect(() => {
        return () => { try { if (previewUrl) URL.revokeObjectURL(previewUrl); } catch {} };
    }, [previewUrl]);



    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`relative w-[120px] h-[80px] flex items-center justify-center bg-gray-100 rounded-md overflow-hidden ${
                isDragging ? 'scale-105 z-50' : ''
            }`}
            onClick={onClick}
        >
            <div
                {...attributes}
                {...listeners}
                className="w-full h-full flex items-center justify-center cursor-pointer"
            >
                <img
                    src={previewUrl}
                    alt={`Фото ${index + 1}`}
                    className="w-full h-full object-cover"
                />
            </div>
            {index === 0 && (
                <span className="absolute top-1 left-1 bg-black bg-opacity-60 text-white text-xs px-2 py-0.5 rounded">
                    Заглавное
                </span>
            )}
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                }}
                className="absolute top-1 right-1 z-10 w-6 h-6 rounded-full bg-black bg-opacity-60 text-white text-xs font-bold flex items-center justify-center"
            >
                ✕
            </button>
        </div>
    );
}

export function ExpandingTextarea() {
    const [isFocused, setIsFocused] = useState(false);
    const [description, setDescription] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsFocused(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={containerRef} className="relative">
            {/* 👇 ВСЕГДА в DOM — уходит в FormData при submit */}
            <input type="hidden" name="description" value={description} />

            {!isFocused && (
                <div
                    onClick={() => setIsFocused(true)}
                    className="w-full min-h-[60px] max-h-[60px] overflow-y-auto text-sm text-black border-b border-gray-150 px-1 py-0 cursor-text whitespace-pre-wrap"
                >
                    {description ? (
                        description
                    ) : (
                        <span className="text-gray-400 block mt-[16px]">Описание</span>
                    )}
                </div>
            )}

            <AnimatePresence>
                {isFocused && (
                    <motion.textarea
                        // ❗ без name — чтобы не было дубликата полей в FormData
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Опишите ваш будущий кэмп: локация, расписание, тренеры, проживание..."
                        className="absolute bottom-0 w-full bg-white border border-gray-150 focus:border-black focus:outline-none px-2 py-2 resize-none z-50 rounded-md shadow-lg text-sm"
                        style={{ height: 370 }}
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.25 }}
                    />
                )}
            </AnimatePresence>

            {isFocused && (
                <button
                    type="button"
                    onClick={() => setIsFocused(false)}
                    className="absolute bottom-2 right-2 bg-green-600 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center z-50"
                >
                    ✓
                </button>
            )}
        </div>
    );
}




export default function CreateCampModal({ open, onClose }: Props) {
    const [formData] = useState<FormData>(new FormData());
    const [csrfToken, setCsrfToken] = useState<string | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(''), 7000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    const [, setSuccess] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStage, setSubmitStage] = useState<'idle' | 'upload' | 'create'>('idle');
    const [submitProgress, setSubmitProgress] = useState(0);
    const [submitFiles, setSubmitFiles] = useState<{ fileIndex: number; fileCount: number } | null>(null);

    const TITLE_MAX = 50;
const TITLE_LEN_MSG = 'допустимая длинна названия кэмпа 50 знаков';

    //const [locationName, setLocationName] = useState('');
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    const [activities, setActivities] = useState<Activity[]>([]);
    const [hashtags, setHashtags] = useState<Hashtag[]>([]);
    const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
    const [selectedHashtags, setSelectedHashtags] = useState<string[]>([]);
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [location, setLocation] = useState('');


    const [confirmExitOpen, setConfirmExitOpen] = useState(false);
    const requestCloseWithConfirm = () => setConfirmExitOpen(true);

    // Пока открыт десктопный модал создания кэмпа — разрешаем показывать
    // подсказки Google Places независимо от SearchFilters (через класс camp-modal-open).
    useEffect(() => {
        if (!open) return;
        if (typeof document === 'undefined') return;
        const root = document.documentElement;
        root.classList.add('camp-modal-open');
        return () => {
            root.classList.remove('camp-modal-open');
        };
    }, [open]);

    // Внутри модалки: прячем подсказки Google Places, пока введено < 3 символов.
    useEffect(() => {
        if (!open) return;
        if (typeof document === 'undefined') return;
        const root = document.documentElement;
        const len = (location || '').trim().length;
        if (len < 3) root.classList.add('camp-modal-pac-hidden');
        else root.classList.remove('camp-modal-pac-hidden');
        return () => {
            root.classList.remove('camp-modal-pac-hidden');
        };
    }, [open, location]);


    useEffect(() => {
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            setEndDate('');
        }
    }, [startDate, endDate]);


    const [gallery, setGallery] = useState<GalleryItem[]>([]);
    const [activeCropFile, setActiveCropFile] = useState<File | null>(null);
    const [activeCropIndex, setActiveCropIndex] = useState<number | null>(null);


    //const placesReady = useGooglePlacesReady(200);
    const [mountAuto, setMountAuto] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function prepare() {
            setMountAuto(false);
            if (!open) return;
            try {
                await loadGooglePlaces();          // 👈 лениво грузим скрипт
                // микропаузу можно оставить (визуально приятнее)
                setTimeout(() => { if (!cancelled) setMountAuto(true); }, 150);
            } catch (e) {
                console.error("Failed to load Google Places:", e);
                // опционально: показать тост/ошибку
            }
        }
        prepare();
        return () => { cancelled = true; };
    }, [open]);



    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        })
    );

    const resolveApiBase = () => getBrowserApiBase().replace(/\/+$/, '');

    useEffect(() => {
        if (!open) return;
        setCsrfToken(getCookie('csrftoken'));
        const apiBase = resolveApiBase();
        try { console.info('[CreateCampModal] API_BASE =', apiBase); } catch {}
        let cancelled = false;

        const pickArray = (payload: unknown): unknown[] => {
            if (Array.isArray(payload)) return payload;
            if (payload && typeof payload === 'object') {
                const source = payload as Record<string, unknown>;
                for (const key of ['results', 'items', 'data']) {
                    const candidate = source[key];
                    if (Array.isArray(candidate)) return candidate;
                }
            }
            return [];
        };

        const loadList = async (path: string, setter: React.Dispatch<React.SetStateAction<Activity[] | Hashtag[]>>, label: string) => {
            try {
                const resp = await fetch(`${apiBase}${path}`, {
                    credentials: 'include',
                    cache: 'no-store',
                    headers: { Accept: 'application/json' },
                });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const contentType = resp.headers.get('content-type') || '';
                if (!contentType.includes('application/json')) {
                    const preview = await resp.text();
                    throw new Error(`Unexpected response (${contentType || 'unknown'}): ${preview.slice(0, 120)}`);
                }
                const payload = (await resp.json()) as unknown;
                if (cancelled) return;
                setter(pickArray(payload) as Activity[] | Hashtag[]);
            } catch (err) {
                if (!cancelled) console.error(`Failed to load ${label}`, err);
            }
        };

        loadList('/api/activities/', setActivities, 'activities');
        loadList('/api/hashtags/', setHashtags, 'hashtags');

        return () => {
            cancelled = true;
        };
    }, [open]);


    const [hashtagInput, setHashtagInput] = useState('');

	    const geocodeLocation = async (query: string): Promise<{ lat: string; lng: string } | null> => {
	        if (typeof window === 'undefined' || !window.google?.maps?.Geocoder) return null;
	        const trimmed = query.trim();
	        if (!trimmed) return null;
	        return new Promise((resolve) => {
	            try {
	                const geocoder = new window.google.maps.Geocoder();
	                geocoder.geocode({ address: trimmed }, (results, status) => {
	                    if (status !== 'OK' || !results || !results[0]?.geometry?.location) {
	                        resolve(null);
	                        return;
	                    }
	                    const loc = results[0].geometry.location;
	                    resolve({ lat: loc.lat().toString(), lng: loc.lng().toString() });
	                });
	            } catch {
	                resolve(null);
	            }
	        });
	    };

	    const handleSubmit = async () => {
	        setError('');
	        setIsSubmitting(true);

        const title = formData.get('title')?.toString().trim() || '';
        const price = formData.get('price')?.toString().trim() || '';
        const description = formData.get('description')?.toString().trim() || '';

        // ✅ Название
        if (!title) {
            setError('Пожалуйста, введите название кэмпа');
            setIsSubmitting(false);
            return;
        }
        if (title.length > TITLE_MAX) {
  setError(TITLE_LEN_MSG);
  setIsSubmitting(false);
  return;
}

	        // ✅ Локация
	        const locationName = (location || '').trim();
	        if (!locationName) {
	            setError('Пожалуйста, выберите локацию из предложенных вариантов');
	            setIsSubmitting(false);
	            return;
	        }

	        let lat = latitude;
	        let lng = longitude;

	        if (!lat || !lng) {
	            const resolved = await geocodeLocation(locationName);
	            if (!resolved) {
	                setError('Пожалуйста, выберите локацию из предложенных вариантов');
	                setIsSubmitting(false);
	                return;
	            }
	            lat = resolved.lat;
	            lng = resolved.lng;
	            setLatitude(lat);
	            setLongitude(lng);
	        }

        // ✅ Даты
        if (!startDate || !endDate) {
            setError('Выберите даты начала и окончания кэмпа');
            setIsSubmitting(false);
            return;
        }

        // ✅ Цена
        if (!price) {
            setError('Пожалуйста, укажите цену');
            setIsSubmitting(false);
            return;
        }

        const phone = formData.get('phone')?.toString().trim() || '';
        if (!phone) {
            setError('Пожалуйста, укажите телефон для связи');
            setIsSubmitting(false);
            return;
        }

        // ✅ Активности: минимум одна, и каждая — из предложенных
        if (selectedActivities.length === 0) {
            setError('Выберите хотя бы одну активность из предложенного списка');
            setIsSubmitting(false);
            return;
        }

        const validActivityIds = activities.map((a) => a.id.toString());
        const invalidActivities = selectedActivities.filter(id => !validActivityIds.includes(id));
        if (invalidActivities.length > 0) {
            setError('Выберите активности только из предложенного списка');
            setIsSubmitting(false);
            return;
        }

        // ✅ Хэштеги: если есть — только из предложенного списка (и без ручного текста)

        const validHashtagIds = hashtags.map((h) => h.id.toString());
        const allHashtagsValid = selectedHashtags.every(id => validHashtagIds.includes(id));
        const manualInput = hashtagInput.trim();

        const onlyManualText = manualInput.length > 0 && selectedHashtags.length === 0;
        const hasInvalidTags = selectedHashtags.length > 0 && !allHashtagsValid;

        if (onlyManualText || hasInvalidTags) {
            setError('Выберите хэштеги только из предложенного списка');
            setIsSubmitting(false);
            return;
        }

        if (!description) {
            setError('Пожалуйста, заполните описание кэмпа');
            setIsSubmitting(false);
            return;
        }

        // ✅ Фото: хотя бы одно
        if (gallery.length === 0) {
            setError('Добавьте хотя бы одно фото кэмпа');
            setIsSubmitting(false);
            return;
        }




        // 🧠 Сохраняем данные в форму
	        formData.set('location_name', locationName);
	        formData.set('latitude', lat);
	        formData.set('longitude', lng);
        formData.set('activities', JSON.stringify(selectedActivities));
        formData.set('start_date', startDate);
        formData.set('end_date', endDate);
        selectedHashtags.forEach((id) => formData.append('hashtags', id));

        const finalFiles: File[] = gallery
            .slice(0, 10)
            .map((item) => item.croppedFile || item.originalFile)
            .filter((f): f is File => !!f);

        if (finalFiles.length) {
            formData.set('title_image', finalFiles[0]);
        }

        let preuploadedNames: string[] = [];
        if (finalFiles.length > 0) {
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
                console.error('[CreateCampModal] direct upload failed', e);
                setError(e instanceof Error ? e.message : 'Ошибка загрузки фото');
                setIsSubmitting(false);
                setSubmitStage('idle');
                setSubmitProgress(0);
                setSubmitFiles(null);
                return;
            }
        }

        formData.delete('gallery_images');
        if (preuploadedNames.length) {
            formData.set('preuploaded_gallery', JSON.stringify(preuploadedNames));
        }

        try {
            setSubmitStage('create');
            const API_BASE = resolveApiBase();
            const createCampUrl = API_BASE.startsWith('/')
                ? `${API_BASE}/api/create-camp`
                : `${API_BASE}/api/create-camp/`;
            const res = await fetch(createCampUrl, {
                method: 'POST',
                headers: { 'X-CSRFToken': csrfToken || '' },
                credentials: 'include',
                body: formData,
            });

            if (res.ok) {
                let campId: number | null = null;
                try {
                    const data = await res.json().catch(() => null);
                    if (data && typeof (data as Record<string, unknown>).id === 'number') {
                        campId = (data as Record<string, unknown>).id as number;
                    }
                } catch { /* noop */ }

                if (campId && typeof window !== 'undefined') {
                    try {
                        window.dispatchEvent(new CustomEvent('navumi:camp-created', { detail: { id: campId } }));
                    } catch { /* noop */ }
                }

                setSuccess(true);
                setTimeout(() => {
                    try { onClose(); } catch { /* noop */ }
                }, 300);
            } else {
                const data = await res.json().catch(() => null);
                if (data?.details) {
                    console.warn('Camp create validation errors', data.details);
                    setError(Object.entries(data.details).map(([k, v]) => `${k}: ${v}`).join(' | '));
                } else {
                    setError(data?.error || 'Ошибка создания кэмпа');
                };
            }
        } catch {
            setError('Ошибка сети');
        } finally {
            setIsSubmitting(false);
            setSubmitStage('idle');
            setSubmitProgress(0);
            setSubmitFiles(null);
        }
    };




    const [, setActiveId] = useState<string | null>(null);
    const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        // Получаем поля вручную перед отправкой
        const form = event.currentTarget;
        const formDataFromDom = new FormData(form);

        for (const [key, value] of formDataFromDom.entries()) {
            formData.set(key, value.toString());
        }

        handleSubmit();
    };

    const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

    const handlePlaceSelect = () => {
        const place = autocompleteRef.current?.getPlace();
        const location = place?.geometry?.location;
        if (!place || !location) return;

        const components = place.address_components || [];

        const city = components.find((c) => c.types.includes('locality'))?.long_name || '';
        const region = components.find((c) => c.types.includes('administrative_area_level_1'))?.long_name || '';
        const country = components.find((c) => c.types.includes('country'))?.long_name || '';

        const capitalExceptions = ['Париж', 'Москва', 'Берлин', 'Рим', 'Лондон', 'Мадрид', 'Амстердам', 'Вена', 'Прага', 'Токио'];

        const parts: string[] = [];

        if (city) parts.push(city);

        if (
            region &&
            region !== city &&
            region !== country &&
            !capitalExceptions.includes(city) &&
            !city.toLowerCase().includes(region.toLowerCase())
        ) {
            parts.push(region);
        }

        if (country) parts.push(country);

        const address = parts.join(', ');

        setLocation(address);
        setLatitude(location.lat().toString());
        setLongitude(location.lng().toString());

        console.log('🚀 CLEANED ADDRESS:', address);
    };

    //const [description, setDescription] = useState('');
    //const [expanded, setExpanded] = useState(false);


    //const handleCloseWithConfirmation = () => {
    //    const shouldClose = window.confirm('Прервать создание кэмпа? Все несохранённые данные будут потеряны.');
    //    if (shouldClose) {
    //        onClose();
    //    }
    //};


    const formRef = useRef<HTMLFormElement>(null);
    const [resetKey, setResetKey] = useState(0);

    const revokeGalleryURLs = (items: GalleryItem[]) => {
        items.forEach(it => { try { if (it.url) URL.revokeObjectURL(it.url); } catch {} });
    };

    const resetAll = React.useCallback(() => {
        // сброс ошибок/кропа
        setError('');
        setActiveCropFile(null);
        setActiveCropIndex(null);

        // сброс выбора / дат / гео
        setSelectedActivities([]);
        setSelectedHashtags([]);
        setHashtagInput('');
        setStartDate('');
        setEndDate('');
        setLocation('');
        setLatitude('');
        setLongitude('');

        setGallery(prev => { revokeGalleryURLs(prev); return []; });

        formRef.current?.reset();

        formData.forEach((_, key) => formData.delete(key));

        setResetKey(k => k + 1);
    }, [formData]);

    const prevOpenRef = useRef(open);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);
    useEffect(() => {
        if (open && !prevOpenRef.current) {
            resetAll();
        }
        prevOpenRef.current = open;
    }, [open, resetAll]);

    useEffect(() => {
        if (!open) return;
        if (typeof window === 'undefined') return;
        if (window.innerWidth < 768) return;
        const el = contentEl;
        if (!el) return;

        const logLayout = (reason: string) => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            const offsetParent = el.offsetParent as HTMLElement | null;
            const offsetParentRect = offsetParent?.getBoundingClientRect();
            const getChain = () => {
                const chain: Array<Record<string, string>> = [];
                let node: HTMLElement | null = el.parentElement;
                let safety = 0;
                while (node && safety < 8) {
                    const cs = window.getComputedStyle(node);
                    chain.push({
                        tag: node.tagName.toLowerCase(),
                        id: node.id || '',
                        className: node.className || '',
                        position: cs.position,
                        transform: cs.transform,
                        top: cs.top,
                        left: cs.left,
                    });
                    node = node.parentElement;
                    safety += 1;
                }
                return chain;
            };
            try {
                // eslint-disable-next-line no-console
                console.info('[CreateCampModal][layout]', {
                    reason,
                    rect: {
                        top: Math.round(rect.top),
                        left: Math.round(rect.left),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                    },
                    style: {
                        position: style.position,
                        top: style.top,
                        left: style.left,
                        transform: style.transform,
                        marginTop: style.marginTop,
                        marginBottom: style.marginBottom,
                    },
                    viewport: {
                        innerW: window.innerWidth,
                        innerH: window.innerHeight,
                        clientW: document.documentElement.clientWidth,
                        clientH: document.documentElement.clientHeight,
                    },
                });
                // eslint-disable-next-line no-console
                console.info('[CreateCampModal][layout-json]', JSON.stringify({
                    reason,
                    rect: {
                        top: Math.round(rect.top),
                        left: Math.round(rect.left),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                    },
                    style: {
                        position: style.position,
                        top: style.top,
                        left: style.left,
                        transform: style.transform,
                        marginTop: style.marginTop,
                        marginBottom: style.marginBottom,
                    },
                    offsetParent: offsetParent
                        ? {
                              tag: offsetParent.tagName.toLowerCase(),
                              className: offsetParent.className || '',
                              rect: offsetParentRect
                                  ? {
                                        top: Math.round(offsetParentRect.top),
                                        left: Math.round(offsetParentRect.left),
                                        width: Math.round(offsetParentRect.width),
                                        height: Math.round(offsetParentRect.height),
                                    }
                                  : null,
                          }
                        : null,
                    ancestors: getChain(),
                    viewport: {
                        innerW: window.innerWidth,
                        innerH: window.innerHeight,
                        clientW: document.documentElement.clientWidth,
                        clientH: document.documentElement.clientHeight,
                    },
                }));
            } catch { /* noop */ }
        };

        const onResize = () => logLayout('resize');
        const raf1 = requestAnimationFrame(() => {
            const raf2 = requestAnimationFrame(() => logLayout('raf2'));
            return () => cancelAnimationFrame(raf2);
        });
        window.addEventListener('resize', onResize);
        return () => {
            cancelAnimationFrame(raf1);
            window.removeEventListener('resize', onResize);
        };
    }, [open, contentEl]);

    return (
        <>
        <Dialog
            open={open}
            onOpenChange={(next) => {
                // если хотят закрыть (крестик, Esc, programmatic)
                if (!next) {
                    requestCloseWithConfirm();
                    return; // не вызываем onClose — оставляем модалку открытой до подтверждения
                }
            }}
        >

            
                <style jsx global>{`
                /* Только внутри модалки создания кэмпа */
                .camp-modal input::placeholder,
                .camp-modal textarea::placeholder {
                    color: #9ca3af !important;        /* Tailwind gray-400 */
                    font-size: 0.875rem !important;    /* Tailwind text-sm */
                    opacity: 1;                        /* чтобы Firefox не делал их бледнее */
                }

                /* Вендорные варианты (на всякий) */
                .camp-modal input::-webkit-input-placeholder,
                .camp-modal textarea::-webkit-input-placeholder {
                    color: #9ca3af; font-size: 0.875rem; opacity: 1;
                }
                .camp-modal input::-moz-placeholder,
                .camp-modal textarea::-moz-placeholder {
                    color: #9ca3af; font-size: 0.875rem; opacity: 1;
                }
                .camp-modal input:-ms-input-placeholder,
                .camp-modal textarea:-ms-input-placeholder {
                    color: #9ca3af; font-size: 0.875rem;
                }
                .camp-modal input::-ms-input-placeholder,
                .camp-modal textarea::-ms-input-placeholder {
                    color: #9ca3af; font-size: 0.875rem;
                }
                `}</style>


            <DialogContent
                ref={(node) => {
                    contentRef.current = node;
                    setContentEl(node);
                }}
                className="camp-modal w-full max-w-2xl min-w-0 bg-white overflow-visible"
                style={{ maxHeight: '90vh' }}
                onInteractOutside={(e) => {
                    if (activeCropFile) {
                        e.preventDefault(); // ✅ если открыт CropModal, не закрываем родительский Dialog
                        return;
                    }

                    const target = e.target as HTMLElement;
                    if (target.closest('.pac-container')) {
                        e.preventDefault();
                        return;
                    }

                    // Если вне Google Autocomplete — подтверждаем
                    e.preventDefault();
                    requestCloseWithConfirm();
                }}

                onEscapeKeyDown={(e) => {
                    e.preventDefault();
                    requestCloseWithConfirm();
                }}
            >
                <div className="max-h-[80vh] overflow-y-auto px-1 relative">
                    {error && (
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-red-100 border border-red-300 text-red-800 rounded-md text-sm shadow-md max-w-[90%] text-center">
                            {error}
                        </div>
                    )}
                    {isSubmitting && (
                        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-white/80">
                            <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-400 border-t-transparent" />
                            <div className="text-sm text-gray-700">
                                {submitStage === 'upload'
                                    ? `Загружаем фото ${submitProgress}%${submitFiles ? ` (${submitFiles.fileIndex}/${submitFiles.fileCount})` : ''}`
                                    : 'Создаем кэмп...'}
                            </div>
                        </div>
                    )}
                            <form
                                onSubmit={handleFormSubmit}
                                className="flex flex-col gap-y-3.5 px-1 mt-2.5 text-sm"
                            >
                                <input
  name="title"
  placeholder="Название кэмпа"
  className="w-full bg-transparent border-0 border-b border-gray-150 focus:border-black focus:outline-none px-1 py-2 transition-colors duration-200 font-semibold"
  maxLength={TITLE_MAX}
  onKeyDown={(e) => {
    // показываем предупреждение при попытке ввести 51-й символ
    const isChar =
      e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
    const el = e.currentTarget as HTMLInputElement;
    if (isChar && (el.value ?? '').length >= TITLE_MAX) {
      e.preventDefault();
      setError(TITLE_LEN_MSG);
    }
  }}
  onPaste={(e) => {
    const el = e.currentTarget as HTMLInputElement;
    const paste = e.clipboardData.getData('text') ?? '';
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const free = TITLE_MAX - (el.value.length - (end - start));
    if (paste.length > free) {
      e.preventDefault();
      if (free > 0) {
        const next =
          el.value.slice(0, start) + paste.slice(0, free) + el.value.slice(end);
        el.value = next;
      }
      setError(TITLE_LEN_MSG);
    }
  }}
/>


                                <div className="relative">
                                    {mountAuto ? (
                                    <Autocomplete
                                        onLoad={(autocomplete) => {
                                            if (!autocompleteRef.current) {
                                                autocompleteRef.current = autocomplete;
                                            }
                                        }}
                                        onPlaceChanged={handlePlaceSelect}
                                    >
                                        <input
                                            type="text"
                                            placeholder="Город / место"
                                            value={location}
                                            onChange={(e) => setLocation(e.target.value)}
                                            className="w-full bg-transparent border-0 border-b border-gray-150 focus:border-black focus:outline-none px-1 py-2 transition-colors duration-200"
                                        />
                                    </Autocomplete>
                                    ) : (
                                        <div className="flex flex-col gap-1">
                                            <input
                                                type="text"
                                                placeholder="Город / место (загружаю подсказки…)"
                                                value={location}
                                                disabled
                                                className="w-full bg-transparent border-0 border-b border-gray-150 text-gray-400 px-1 py-2"
                                            />
                                            <p className="text-[11px] text-gray-500">
                                                Загружаем Google‑подсказки локаций… После загрузки введите минимум 3 буквы и выберите город из списка.
                                            </p>
                                        </div>
                                    )}
                                </div>


                                <div className="border-b border-gray-150 pb-1">
                                    <CampDateInputs
                                        startDate={startDate}
                                        endDate={endDate}
                                        setStartDate={setStartDate}
                                        setEndDate={setEndDate}
                                    />
                                </div>


                                <div className="relative border-b border-gray-150">
                                    <ActivityAutocomplete
                                        activities={activities}
                                        selectedActivities={selectedActivities}
                                        setSelectedActivities={(value) => {
                                            if (value.length <= 4) {
                                                setSelectedActivities(value);
                                            } else if (value.length > selectedActivities.length) {
                                                alert('Можно выбрать не более 4 активностей для одного кэмпа.');
                                            }
                                        }}
                                        placeholder="🎯 Активности"
                                        maxSelectable={4}
                                        noPadding
                                        showCloseButton
                                        fixedHeight="27px"
                                    />
                                </div>


                                <div className="relative border-b border-gray-150">
                                    <HashtagAutocomplete
                                        hashtags={hashtags}
                                        selectedHashtags={selectedHashtags}
                                        setSelectedHashtags={setSelectedHashtags}
                                        input={hashtagInput}
                                        setInput={setHashtagInput}
                                        noPadding
                                        showCloseButton
                                        fixedHeight="27px"
                                    />
                                </div>


                                <div className="flex w-full pb-0">
                                    {/* Цена + валюта */}
                                    <div className="w-[30%] border-b border-gray-150 relative flex items-center">
                                        <input
                                            type="text"
                                            name="price"
                                            placeholder="Цена"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            onInput={(e) => {
                                                const input = e.target as HTMLInputElement;
                                                input.value = input.value.replace(/\D/g, '');
                                            }}
                                            className="w-full bg-transparent border-none focus:outline-none px-1 py-2 transition-colors duration-200"
                                        />
                                        <select
                                            name="currency"
                                            defaultValue="RUB"
                                            className="absolute right-0 pr-1 text-sm bg-transparent border-none focus:outline-none text-gray-800 appearance-none"
                                        >
                                            <option value="RUB">₽</option>
                                            <option value="USD" disabled className="text-gray-400">USD</option>
                                            <option value="EUR" disabled className="text-gray-400">EUR</option>
                                        </select>
                                    </div>


                                    {/* Отступ */}
                                    <div className="w-[5%]" />

                                    {/* Телефон */}
                                    <div className="w-[30%] border-b border-gray-150">
                                        <input
                                            name="phone"
                                            placeholder="Телефон"
                                            inputMode="tel"
                                            pattern="[0-9+\-]*"
                                            onInput={(e) => {
                                                const input = e.target as HTMLInputElement;
                                                input.value = input.value.replace(/[^\d+\-]/g, '');
                                            }}
                                            className="w-full bg-transparent border-none focus:outline-none px-1 py-2 transition-colors duration-200"
                                        />
                                    </div>

                                    {/* Отступ */}
                                    <div className="w-[5%]" />

                                    {/* Telegram */}
                                    <div className="w-[30%] border-b border-gray-150">
                                        <input
                                            name="telegram_nickname"
                                            placeholder="Telegram (без @)"
                                            onInput={(e) => {
                                                const input = e.target as HTMLInputElement;
                                                input.value = input.value.replace(/[а-яёА-ЯЁ]/g, '');
                                            }}
                                            className="w-full bg-transparent border-none focus:outline-none px-1 py-2 transition-colors duration-200"
                                        />
                                    </div>
                                </div>


                                <div className="hidden sm:grid grid-cols-2 gap-2 pb-0">
                                    {/* Сайт — левая часть */}
                                    <div className="relative flex items-end pr-4">
                                        <div className="w-full border-b border-gray-150 pr-6">
                                            <input
                                                name="website"
                                                placeholder="Сайт (если есть)"
                                                className="w-full bg-transparent border-none focus:outline-none px-1 py-2 transition-colors duration-200"
                                            />
                                        </div>

                                        {/* Вертикальный разделитель */}
                                        <div
                                            className="absolute right-0"
                                            style={{
                                                height: '24px',         // 👈 Сделай короче по вкусу
                                                top: '6px',             // 👈 Смещение вверх
                                                borderRight: '1px solid #E5E7EB' // Tailwind цвет border-gray-200
                                            }}
                                        />
                                    </div>

                                    {/* Чекбоксы */}
                                    <div className="pl-4 py-3 flex items-end">
                                        <div className="flex items-center gap-6">
                                            <label className="flex items-center gap-2">
                                                <input type="checkbox" name="is_kids_camp" className="accent-black" />
                                                детский кэмп
                                            </label>
                                            <label className="flex items-center gap-2">
                                                <input type="checkbox" name="has_kids_coach" className="accent-black" />
                                                + детский тренер
                                            </label>
                                        </div>
                                    </div>
                                </div>


                                {/* Описание (с расширяемым вводом) */}
                                <ExpandingTextarea key={resetKey} />

                                {/* галерея */}
                                <div className="mt-0">
                                    {/* Счётчик по центру */}
                                    <p className="text-xs text-gray-500 text-center mb-1">
                                        {gallery.length}/10 фото выбрано
                                    </p>

                                    {/* Кнопка-заглушка — только если галерея пуста */}
                                    {gallery.length === 0 && (
                                        <label
                                            htmlFor="camp-photos"
                                            className="cursor-pointer w-full flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg py-1 text-gray-400 hover:text-black hover:border-gray-400 transition text-sm flex-col gap-0"
                                        >
                                            <div className="text-2xl leading-none">+</div>
                                            <div>Добавь фото</div>
                                                <input
                                                    id="camp-photos"
                                                    type="file"
                                                    accept="image/*"
                                                    multiple
                                                    hidden
                                                    disabled={gallery.length >= 10}
                                                    onChange={async (e) => {
                                                        const files = Array.from(e.target.files || []);
                                                        const supportedFiles = files.filter((f) => {
                                                            const mime = (f.type || '').toLowerCase();
                                                            const name = (f.name || '').toLowerCase();
                                                            if (mime.includes('heic') || mime.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif')) {
                                                                return false;
                                                            }
                                                            return !mime || mime.startsWith('image/');
                                                        });
                                                        const unsupportedCount = files.length - supportedFiles.length;

                                                        const allowedCount = Math.max(0, 10 - gallery.length);
                                                        if (allowedCount <= 0 || supportedFiles.length === 0) {
                                                            if (unsupportedCount > 0) {
                                                                alert('Некоторые файлы не были добавлены: поддерживаются только изображения (кроме HEIC/HEIF).');
                                                            }
                                                            e.target.value = '';
                                                            return;
                                                        }

                                                        const filesToAdd = supportedFiles.slice(0, allowedCount);
                                                        const ignoredCount = supportedFiles.length - filesToAdd.length;

                                                        const downscaledItems: GalleryItem[] = [];
                                                        for (const f of filesToAdd) {
                                                            const df = await downscaleCampImage(f);
                                                            downscaledItems.push({
                                                                id: df.name + '-' + df.lastModified,
                                                                originalFile: df,
                                                                url: URL.createObjectURL(df),
                                                            });
                                                        }

                                                        setGallery((prev) => [...prev, ...downscaledItems]);

                                                        if (unsupportedCount > 0) {
                                                            alert('Некоторые файлы не были добавлены: поддерживаются только изображения (кроме HEIC/HEIF).');
                                                        }
                                                        if (ignoredCount > 0) {
                                                            alert(`Добавлено только ${filesToAdd.length} из ${supportedFiles.length} фото. Максимум — 10.`);
                                                        }

                                                        e.target.value = '';
                                                    }}
                                                />
                                        </label>
                                    )}

                                    {/* Список фото (drag & drop) */}
                                    <DndContext
                                        sensors={sensors}
                                        collisionDetection={closestCenter}
                                        modifiers={[restrictToHorizontalAxis]}
                                        onDragStart={({ active }) => setActiveId(active.id as string)}
                                        onDragOver={({ active, over }) => {
                                            if (!over || active.id === over.id) return;
                                            const oldIndex = gallery.findIndex((item) => item.id === active.id);
                                            const newIndex = gallery.findIndex((item) => item.id === over.id);
                                            if (oldIndex !== newIndex) {
                                                setGallery((items) => arrayMove(items, oldIndex, newIndex));
                                            }
                                        }}
                                        onDragEnd={() => setActiveId(null)}
                                    >
                                        <SortableContext
                                            items={Array.isArray(gallery) ? gallery.map((item) => item.id) : []}
                                            strategy={horizontalListSortingStrategy}
                                        >
                                            <div className="mt-0 pb-0 overflow-x-auto w-full">
                                                <div className="flex gap-2 w-fit items-center">
                                                    {Array.isArray(gallery) && (
                                                        <>
                                                            {/* Плюсик перед первым фото, если можно ещё загружать */}
                                                            {gallery.length > 0 && gallery.length < 10 && (
                                                                <div className="flex items-center h-[64px]">
                                                                    <label
                                                                        htmlFor="camp-photos-inline"
                                                                        className="cursor-pointer w-[96px] h-[64px] flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg text-gray-400 hover:text-black hover:border-gray-400 transition text-xl"
                                                                    >
                                                                        +
                                                                        <input
                                                                            id="camp-photos-inline"
                                                                            type="file"
                                                                            accept="image/*"
                                                                            multiple
                                                                            hidden
                                                                            disabled={gallery.length >= 10}
                                                                            onChange={async (e) => {
                                                                                const files = Array.from(e.target.files || []);
                                                                                const supportedFiles = files.filter((f) => {
                                                                                    const mime = (f.type || '').toLowerCase();
                                                                                    const name = (f.name || '').toLowerCase();
                                                                                    if (mime.includes('heic') || mime.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif')) {
                                                                                        return false;
                                                                                    }
                                                                                    return !mime || mime.startsWith('image/');
                                                                                });
                                                                                const unsupportedCount = files.length - supportedFiles.length;

                                                                                const allowedCount = Math.max(0, 10 - gallery.length);
                                                                                if (allowedCount <= 0 || supportedFiles.length === 0) {
                                                                                    if (unsupportedCount > 0) {
                                                                                        alert('Некоторые файлы не были добавлены: поддерживаются только изображения (кроме HEIC/HEIF).');
                                                                                    }
                                                                                    e.target.value = '';
                                                                                    return;
                                                                                }

                                                                                const filesToAdd = supportedFiles.slice(0, allowedCount);
                                                                                const ignoredCount = supportedFiles.length - filesToAdd.length;

                                                                                const downscaledItems: GalleryItem[] = [];
                                                                                for (const f of filesToAdd) {
                                                                                    const df = await downscaleCampImage(f);
                                                                                    downscaledItems.push({
                                                                                        id: df.name + '-' + df.lastModified,
                                                                                        originalFile: df,
                                                                                        url: URL.createObjectURL(df),
                                                                                    });
                                                                                }

                                                                                setGallery((prev) => [...prev, ...downscaledItems]);

                                                                                if (unsupportedCount > 0) {
                                                                                    alert('Некоторые файлы не были добавлены: поддерживаются только изображения (кроме HEIC/HEIF).');
                                                                                }
                                                                                if (ignoredCount > 0) {
                                                                                    alert(`Добавлено только ${filesToAdd.length} из ${supportedFiles.length} фото. Максимум — 10.`);
                                                                                }

                                                                                e.target.value = '';
                                                                            }}
                                                                        />
                                                                    </label>
                                                                </div>
                                                            )}

                                                            {gallery
                                                                .filter((item) => item.originalFile)
                                                                .map(({ id, croppedFile, originalFile }, index) => (
                                                                    <SortablePhoto
                                                                        key={id}
                                                                        id={id}
                                                                        index={index}
                                                                        croppedFile={croppedFile}
                                                                        originalFile={originalFile}
                                                                        onClick={() => {
                                                                            setActiveCropFile(originalFile);
                                                                            setActiveCropIndex(index);
                                                                        }}
                                                                        onRemove={() => {
                                                                            setGallery((prev) => prev.filter((_, i) => i !== index));
                                                                        }}
                                                                    />
                                                                ))}
                                                        </>
                                                    )}

                                                </div>
                                            </div>
                                        </SortableContext>
                                    </DndContext>
                                </div>


                                {/* {error && <p className="text-red-500 text-center">{error}</p>} */}

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full bg-black text-white py-2 rounded-full hover:bg-black/80 transition"
                                >
                                    {isSubmitting ? (submitStage === 'upload' ? 'Загрузка...' : 'Создание...') : 'Создать кэмп'}
                                </button>
                            </form>

                </div>
            </DialogContent>

            {activeCropFile && (
                <PhotoCropModal
                    imageSrc={URL.createObjectURL(activeCropFile)}
                    aspect={1.5}
                    startAtCover
                    initialScale={
                        activeCropIndex !== null
                            ? gallery[activeCropIndex]?.cropMeta?.scale
                            : undefined
                    }
                    initialPosition={
                        activeCropIndex !== null
                            ? gallery[activeCropIndex]?.cropMeta?.position
                            : undefined
                    }
                    onClose={() => {
                        setActiveCropFile(null);
                        setActiveCropIndex(null);
                    }}
                    onComplete={(croppedFile, cropMeta) => {
                        if (activeCropIndex !== null) {
                            setGallery((prev) =>
                                prev.map((item, i) =>
                                    i === activeCropIndex ? { ...item, croppedFile, cropMeta } : item
                                )
                            );
                        }
                        setActiveCropFile(null);
                        setActiveCropIndex(null);
                    }}
                />
            )}
        </Dialog>

            {confirmExitOpen && (
                <Dialog open={confirmExitOpen} onOpenChange={setConfirmExitOpen}>
                    <DialogPortal>
                        {/* единый слой поверх всего */}
                        <div className="fixed inset-0 z-[10000]">
                            {/* затемняем и ПЕРЕХВАТЫВАЕМ клики */}
                            <DialogOverlay className="fixed inset-0 bg-black/40" />
                            <DialogPrimitive.Content
                                className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                     max-w-sm w-full bg-white rounded-xl p-6 shadow-lg focus:outline-none z-[20000]"
                            >
                                <h3 className="text-base font-semibold mb-2">Прервать создание кэмпа?</h3>
                                <p className="text-sm text-gray-600 mb-4">Данные не сохранятся. Выйти?</p>
                                <div className="flex justify-end gap-3">
                                    <button
                                        type="button"
                                        className="text-sm text-gray-600 hover:text-black"
                                        onClick={() => setConfirmExitOpen(false)}
                                    >
                                        Отмена
                                    </button>
                                    <button
                                        type="button"
                                        className="text-sm font-semibold text-red-600 hover:text-red-700"
                                        onClick={() => {
                                            setConfirmExitOpen(false);
                                            resetAll();         // <-- очистка всего
                                            onClose();          // закрываем родительскую модалку
                                        }}
                                    >
                                        Да, выйти
                                    </button>
                                </div>
                            </DialogPrimitive.Content>
                        </div>
                    </DialogPortal>
                </Dialog>
            )}

        </>

    );

}
