'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Autocomplete } from '@react-google-maps/api';
import MobileDateSelector from '@/components/ui/MobileDateSelector';
import MobileActivitySelector from '@/components/ui/MobileActivitySelector';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
//import { useGooglePlacesReady } from "@/lib/hooks/useGooglePlacesReady";
import { loadGooglePlaces } from "@/lib/google/loadGooglePlaces";
import { getBrowserApiBase } from "@/lib/apiBase";


interface Props {
    formData: FormData;
    setFormData: (data: FormData) => void;
    setCampTitle: (title: string) => void;
    onNext: () => void;
}

interface Activity {
    id: number;
    name: string;
}

interface Hashtag {
    id: number;
    name: string;
}

function parseLocalDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const trimmed = value.toString().trim();
    if (!trimmed) return null;
    // ожидаем формат YYYY-MM-DD
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (!match) {
        const d = new Date(trimmed);
        return isNaN(d.getTime()) ? null : d;
    }
    const [, y, m, d] = match;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

export default function StepOneBasicInfo({ formData, setFormData, setCampTitle, onNext }: Props) {
    const [title, setTitle] = useState(() => formData.get('title')?.toString() || '');
    const [location, setLocation] = useState(() => formData.get('location_name')?.toString() || '');
    const [latitude, setLatitude] = useState(() => formData.get('latitude')?.toString() || '');
    const [longitude, setLongitude] = useState(() => formData.get('longitude')?.toString() || '');
    //const placesReady = useGooglePlacesReady(200);
    const [mountAuto, setMountAuto] = useState(false);

    const TITLE_MAX = 50;
const TITLE_LEN_MSG = 'допустимая длинна названия кэмпа 50 знаков';


    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                await loadGooglePlaces();
                setTimeout(() => { if (!cancelled) setMountAuto(true); }, 150);
            } catch (e) {
                console.error("Failed to load Google Places:", e);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Скрываем выпадающий список Google Places, пока введено < 3 символов
    useEffect(() => {
        if (!mountAuto) return;
        if (typeof document === 'undefined') return;
        const root = document.documentElement;
        const len = (location?.trim()?.length ?? 0);
        if (len < 3) root.classList.add('camp-modal-pac-hidden');
        else root.classList.remove('camp-modal-pac-hidden');
        return () => {
            root.classList.remove('camp-modal-pac-hidden');
        };
    }, [mountAuto, location]);


    const [startDate, setStartDate] = useState(() => {
        return parseLocalDate(formData.get('start_date')?.toString());
    });

    const [endDate, setEndDate] = useState(() => {
        return parseLocalDate(formData.get('end_date')?.toString());
    });

    const [activities, setActivities] = useState<Activity[]>([]);
    const [hashtags, setHashtags] = useState<Hashtag[]>([]);
    const [selectedActivities, setSelectedActivities] = useState<string[]>(() => {
        const val = formData.get('activities')?.toString();
        try {
            return val ? JSON.parse(val) : [];
        } catch {
            return [];
        }
    });
    const [selectedHashtags, setSelectedHashtags] = useState<string[]>(() => {
        const entries = formData.getAll('hashtags');
        return entries.map((x) => x.toString());
    });
    const [showMobileActivity, setShowMobileActivity] = useState(false);

    const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

    useEffect(() => {
        const apiBase = getBrowserApiBase().replace(/\/+$/, '');
        try { console.info('[StepOneBasicInfo] API_BASE =', apiBase); } catch {}
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

        const loadList = async <T,>(path: string, setter: Dispatch<SetStateAction<T[]>>, label: string) => {
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
                setter(pickArray(payload) as T[]);
            } catch (err) {
                if (!cancelled) console.error(`Failed to load ${label}`, err);
            }
        };

        loadList<Activity>('/api/activities/', setActivities, 'activities');
        loadList<Hashtag>('/api/hashtags/', setHashtags, 'hashtags');

        return () => {
            cancelled = true;
        };
    }, []);

    const handlePlaceSelect = () => {
        const place = autocompleteRef.current?.getPlace();
        const loc = place?.geometry?.location;
        if (!place || !loc) return;

        const components = place.address_components || [];
        const city = components.find((c) => c.types.includes('locality'))?.long_name || '';
        const region = components.find((c) => c.types.includes('administrative_area_level_1'))?.long_name || '';
        const country = components.find((c) => c.types.includes('country'))?.long_name || '';

        const parts: string[] = [];
        if (city) parts.push(city);
        if (region && region !== city && region !== country) parts.push(region);
        if (country) parts.push(country);

        const address = parts.join(', ');
        setLocation(address);
        setLatitude(loc.lat().toString());
        setLongitude(loc.lng().toString());
    };

    const isKidsCamp = formData.get('is_kids_camp') === 'on';
    const hasKidsCoach = formData.get('has_kids_coach') === 'on';

    const [isKidsCampState, setIsKidsCampState] = useState(isKidsCamp);
    const [hasKidsCoachState, setHasKidsCoachState] = useState(hasKidsCoach);

    const handleNext = () => {
        if (!title.trim()) {
            alert('Пожалуйста, укажите название кэмпа.');
            return;
        }

        if (title.trim().length > TITLE_MAX) {
  alert(TITLE_LEN_MSG);
  return;
}

        if (!location.trim() || !latitude || !longitude) {
            alert('Пожалуйста, выберите локацию из списка рекомендаций.');
            return;
        }

        if (!startDate || !endDate) {
            alert('Пожалуйста, выберите даты начала и окончания кэмпа.');
            return;
        }

        if (selectedActivities.length < 1) {
            alert('Выберите хотя бы одну активность.');
            return;
        }

        if (selectedActivities.length > 4) {
            alert('Максимум можно выбрать 4 активности.');
            return;
        }

        const priceInput = document.querySelector<HTMLInputElement>('input[name="price"]');
        const price = priceInput?.value.trim() || '';
        if (!price) {
            alert('Пожалуйста, укажите цену.');
            return;
        }

        const currencyEl = document.querySelector<HTMLSelectElement>('select[name="currency"]');
        const currency = currencyEl?.value || 'RUB';

        const phoneInput = document.querySelector<HTMLInputElement>('input[name="phone"]');
        const phone = phoneInput?.value.trim() || '';
        if (!phone) {
            alert('Пожалуйста, укажите номер телефона для связи.');
            return;
        }

        const tgEl = document.querySelector<HTMLInputElement>('input[name="telegram_nickname"]');
        const siteEl = document.querySelector<HTMLInputElement>('input[name="website"]');

// Все проверки пройдены — сохраняем в FormData
        formData.set('title', title);
        formData.set('location_name', location);
        formData.set('latitude', latitude);
        formData.set('longitude', longitude);

// startDate/endDate уже проверены выше → используем non-null assertion
        formData.set('start_date', formatDate(startDate!));
        formData.set('end_date', formatDate(endDate!));

        formData.set('activities', JSON.stringify(selectedActivities));
        formData.set('price', price);
        formData.set('phone', phone);
        formData.set('currency', currency);

// не дублируем хэштеги при повторном «Далее»
        formData.delete('hashtags');
        selectedHashtags.forEach((id) => formData.append('hashtags', id));

// опциональные поля
        if (tgEl?.value?.trim()) formData.set('telegram_nickname', tgEl.value.trim()); else formData.delete('telegram_nickname');
        if (siteEl?.value?.trim()) formData.set('website', siteEl.value.trim()); else formData.delete('website');

// свитчи
        if (isKidsCampState) formData.set('is_kids_camp', 'on'); else formData.delete('is_kids_camp');
        if (hasKidsCoachState) formData.set('has_kids_coach', 'on'); else formData.delete('has_kids_coach');

        setFormData(formData);
        setCampTitle(title);
        onNext();
    };


    function pluralizeRu(count: number, [one, few, many]: [string, string, string]) {
        const mod10 = count % 10;
        const mod100 = count % 100;

        if (mod10 === 1 && mod100 !== 11) return `${count} ${one}`;
        if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return `${count} ${few}`;
        return `${count} ${many}`;
    }


    return (
        <div className="flex flex-col h-full">
            <div className="p-4 space-y-4 overflow-y-auto pb-32">
                <input
  type="text"
  placeholder="Название кэмпа"
  value={title}
  onChange={(e) => {
    const next = e.target.value;
    if (next.length > TITLE_MAX) {
      alert(TITLE_LEN_MSG);
      setTitle(next.slice(0, TITLE_MAX));
    } else {
      setTitle(next);
    }
  }}
  onKeyDown={(e) => {
    const isChar =
      e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (isChar && title.length >= TITLE_MAX) {
      e.preventDefault();
      alert(TITLE_LEN_MSG);
    }
  }}
  onPaste={(e) => {
    const paste = e.clipboardData.getData('text') ?? '';
    const free = TITLE_MAX - title.length;
    if (paste.length > free) {
      e.preventDefault();
      if (free > 0) setTitle(title + paste.slice(0, free));
      alert(TITLE_LEN_MSG);
    }
  }}
  maxLength={TITLE_MAX}
  className="w-full border-b border-gray-150 border-t-0 border-l-0 border-r-0 rounded-none py-2 focus:outline-none bg-transparent text-sm"
/>


                {mountAuto ? (
                    <Autocomplete
                        onLoad={(autocomplete) => (autocompleteRef.current = autocomplete)}
                        onPlaceChanged={handlePlaceSelect}
                    >
                        <input
                            type="text"
                            placeholder="Город / место"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            className="w-full border-b border-gray-150 border-t-0 border-l-0 border-r-0 rounded-none py-2 focus:outline-none bg-transparent text-sm"
                        />
                    </Autocomplete>
                ) : (
                    <div className="flex flex-col gap-1">
                        <input
                            type="text"
                            placeholder="Город / место (загружаю подсказки…)"
                            value={location}
                            disabled
                            className="w-full border-b border-gray-150 rounded-none py-2 bg-transparent text-sm text-gray-400"
                        />
                        <p className="text-[11px] text-gray-500">
                            Загружаем Google‑подсказки локаций… После загрузки введите минимум 3 буквы и выберите город из списка.
                        </p>
                    </div>
                )}

                <div className="border-b border-gray-150 pb-1">
                    <MobileDateSelector
                        startDate={startDate}
                        endDate={endDate}
                        setStartDate={setStartDate}
                        setEndDate={setEndDate}
                        className="py-1 px-1 text-base text-gray-400"
                    />
                </div>

                <div className="border-b border-gray-150 pb-1">
                    <div
                        onClick={() => setShowMobileActivity(true)}
                        className={cn(
                            'py-1 px-1 text-base',
                            selectedActivities.length + selectedHashtags.length > 0
                                ? 'text-black'
                                : 'text-gray-400'
                        )}
                    >
                        {selectedActivities.length + selectedHashtags.length > 0
                            ? `Выбрано: ${pluralizeRu(selectedActivities.length, ['активность', 'активности', 'активностей'])} и ${pluralizeRu(selectedHashtags.length, ['хэштег', 'хэштега', 'хэштегов'])}`
                            : 'Активности'}
                    </div>
                </div>



                {showMobileActivity && (
                    <MobileActivitySelector
                        activities={activities}
                        hashtags={hashtags}
                        selectedActivities={selectedActivities}
                        selectedHashtags={selectedHashtags}
                        setSelectedActivities={setSelectedActivities}
                        setSelectedHashtags={setSelectedHashtags}
                        onClose={() => setShowMobileActivity(false)}
                    />
                )}

                {/* Дополнительные поля */}
                <div className="flex flex-col gap-3">
                    <div className="flex gap-3">
                        <div className="flex-1 border-b border-gray-150">
                            <input
                                name="price"
                                defaultValue={formData.get('price')?.toString() || ''}
                                placeholder="Цена"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                onInput={(e) => {
                                    const input = e.target as HTMLInputElement;
                                    input.value = input.value.replace(/\D/g, '');
                                }}
                                className="w-full bg-transparent border-none focus:outline-none px-1 py-2 text-sm"
                            />
                        </div>
                        <div className="w-[80px] border-b border-gray-150">
                            <select
                                name="currency"
                                defaultValue={formData.get('currency')?.toString() || 'RUB'}
                                className="w-full bg-transparent text-sm border-none focus:outline-none px-1 py-2 text-gray-800 appearance-none"
                            >
                                <option value="RUB">₽</option>
                                <option value="USD" disabled>USD</option>
                                <option value="EUR" disabled>EUR</option>
                            </select>
                        </div>
                    </div>

                    <div className="border-b border-gray-150">
                        <input
                            name="phone"
                            defaultValue={formData.get('phone')?.toString() || ''}
                            placeholder="Телефон"
                            inputMode="tel"
                            pattern="[0-9+\-]*"
                            onInput={(e) => {
                                const input = e.target as HTMLInputElement;
                                input.value = input.value.replace(/[^\d+\-]/g, '');
                            }}
                            className="w-full bg-transparent border-none focus:outline-none px-1 py-2 text-sm"
                        />
                    </div>

                    <div className="border-b border-gray-150">
                        <input
                            name="telegram_nickname"
                            defaultValue={formData.get('telegram_nickname')?.toString() || ''}
                            placeholder="Telegram (без @)"
                            onInput={(e) => {
                                const input = e.target as HTMLInputElement;
                                input.value = input.value.replace(/[а-яёА-ЯЁ]/g, '');
                            }}
                            className="w-full bg-transparent border-none focus:outline-none px-1 py-2 text-sm"
                        />
                    </div>

                    <div className="border-b border-gray-150">
                        <input
                            name="website"
                            defaultValue={formData.get('website')?.toString() || ''}
                            placeholder="Сайт (если есть)"
                            className="w-full bg-transparent border-none focus:outline-none px-1 py-2 text-sm"
                        />
                    </div>

                    <div className="flex items-center justify-between py-3">
                        <label className="text-sm text-gray-800 flex items-center gap-2">
                            <Switch
                                checked={isKidsCampState}
                                onCheckedChange={setIsKidsCampState}
                            />

                            детский кэмп
                        </label>
                        <label className="text-sm text-gray-800 flex items-center gap-2">
                            <Switch
                                checked={hasKidsCoachState}
                                onCheckedChange={setHasKidsCoachState}
                            />

                            + детский тренер
                        </label>
                    </div>
                </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200">
                <button
                    onClick={handleNext}
                    className="w-full bg-black text-white py-3 rounded-full font-semibold text-sm"
                >
                    Далее
                </button>
            </div>
        </div>
    );
}

function formatDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
