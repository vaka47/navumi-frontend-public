'use client';

import { Autocomplete } from '@react-google-maps/api';
import { Search as SearchIcon, MapPin, SlidersHorizontal, Target, Tag as TagIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RefObject, useState, useEffect, useRef } from 'react';
import { DateInput } from '@/components/ui/DateInput';
import { format } from 'date-fns'
import MobileDateSelector from '@/components/ui/MobileDateSelector';
import { ActivityAutocomplete } from './ActivityAutocomplete';
import { HashtagAutocomplete } from './HashtagAutocomplete';
import MobileActivitySelector from '@/components/ui/MobileActivitySelector';
import { cn } from '@/lib/utils';
import AdvancedFilters from "@/components/search/AdvancedFilters";
import { useBottomNavBar } from "@/context/BottomNavBarContext";

const DEBUG_SEARCH_LAYOUT = process.env.NODE_ENV !== 'production';






interface Activity {
    id: number;
    name: string;
}

interface Hashtag {
    id: number;
    name: string;
}

interface SearchFiltersProps {
    searchQuery: string;
    setSearchQuery: (value: string) => void;
    startDate: string;
    setStartDate: (value: string) => void;
    endDate: string;
    setEndDate: (value: string) => void;
    location: string;
    setLocation: (value: string, opts?: { confirmed?: boolean }) => void;
    setLatitude: (value: string) => void;
    setLongitude: (value: string) => void;
    isLoaded: boolean;
    autocompleteRef: RefObject<google.maps.places.Autocomplete | null>;
    activities: Activity[];
    selectedActivities: string[];
    setSelectedActivities: (value: string[]) => void;
    hashtags: Hashtag[];
    selectedHashtags: string[];
    setSelectedHashtags: (value: string[]) => void;
    onlyKids: boolean;
    setOnlyKids: (value: boolean) => void;
    withCoach: boolean;
    setWithCoach: (value: boolean) => void;
    excludeSoldOut: boolean;
    setExcludeSoldOut: (value: boolean) => void;
    hotOffers: boolean;
    setHotOffers: (value: boolean) => void;
    onSearch: () => void;
    //onReset: () => void;
    collapsed?: boolean;
    setCollapsed?: (v: boolean) => void;
    summaryText?: string;
    lockCollapse?: (locked: boolean) => void;
    layoutEpoch?: number;
}

export default function SearchFilters({
    searchQuery,
    setSearchQuery,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    location,
    setLocation,
    setLatitude,
    setLongitude,
    isLoaded,
    autocompleteRef,
    activities,
    selectedActivities,
    setSelectedActivities,
    hashtags,
    selectedHashtags,
    setSelectedHashtags,
    onlyKids,
    setOnlyKids,
    withCoach,
    setWithCoach,
    excludeSoldOut,
    setExcludeSoldOut,
    hotOffers,
    setHotOffers,
    onSearch,
    //onReset,
    collapsed = false,
    setCollapsed,
    summaryText,
    lockCollapse,
    layoutEpoch,
}: SearchFiltersProps) {
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

        const cleanedAddress = parts.join(', ');

        setLocation(cleanedAddress, { confirmed: true });
        setLatitude(location.lat().toString());
        setLongitude(location.lng().toString());

        console.log('🌍 CLEANED LOCATION:', cleanedAddress);
    };


    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [startDateObj] = useState<Date | null>(
        startDate ? new Date(startDate) : null
    );
    const [endDateObj] = useState<Date | null>(
        endDate ? new Date(endDate) : null
    );

    useEffect(() => {
        if (startDateObj) setStartDate(startDateObj.toISOString().split('T')[0]);
    }, [startDateObj]);

    useEffect(() => {
        if (endDateObj) setEndDate(endDateObj.toISOString().split('T')[0]);
    }, [endDateObj]);

    const [showMobileActivity, setShowMobileActivity] = useState(false);

    function pluralizeFilter(count: number): string {
        const rem100 = count % 100;
        const rem10 = count % 10;

        if (rem100 >= 11 && rem100 <= 14) {
            return `${count} фильтров`;
        }

        if (rem10 === 1) return `${count} фильтр`;
        if (rem10 >= 2 && rem10 <= 4) return `${count} фильтра`;

        return `${count} фильтров`;
    }


    function renderMobileLabel() {
        const total = selectedActivities.length + selectedHashtags.length;

        if (total === 0) return 'Активности';
        if (total === 1) {
            if (selectedActivities.length === 1) return '1 активность';
            if (selectedHashtags.length === 1) return '1 хэштег';
        }

        return pluralizeFilter(total);
    }

    const [showAdvanced, setShowAdvanced] = useState(false);

    const advancedRefDesktop = useRef<HTMLDivElement>(null);
    const advancedRefMobile = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLDivElement | null>(null); // контейнер клика «Ваши пожелания»
    const searchButtonRef = useRef<HTMLButtonElement>(null); // «Поиск»
    const buttonsRowRef = useRef<HTMLDivElement>(null); // контейнер двух кнопок

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const target = event.target as Node;

            // Если клик был вне popup и вне кнопки — закрыть
            if (
                (!advancedRefDesktop.current || !advancedRefDesktop.current.contains(target)) &&
                (!advancedRefMobile.current || !advancedRefMobile.current.contains(target)) &&
                buttonRef.current &&
                !buttonRef.current.contains(target)
            ) {
                setShowAdvanced(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Логи выравнивания двух кнопок
    useEffect(() => {
        if (!DEBUG_SEARCH_LAYOUT) return;
        const row = buttonsRowRef.current;
        const b1 = buttonRef.current;
        const b2 = searchButtonRef.current;
        if (!row || !b1 || !b2) return;

        const measure = (label: string) => {
            try {
                const rRow = row.getBoundingClientRect();
                const r1 = b1.getBoundingClientRect();
                const r2 = b2.getBoundingClientRect();
                const csRow = getComputedStyle(row);
                const cs1 = getComputedStyle(b1);
                const cs2 = getComputedStyle(b2);

                const info = {
                    label,
                    collapsed,
                    row: {
                        h: Math.round(rRow.height),
                        bottom: Math.round(rRow.bottom),
                        alignItems: csRow.alignItems,
                        display: csRow.display,
                        gap: csRow.gap,
                    },
                    wishesBtn: {
                        h: Math.round(r1.height),
                        bottom: Math.round(r1.bottom),
                        display: cs1.display,
                        alignSelf: cs1.alignSelf,
                        lineHeight: cs1.lineHeight,
                        padding: `${cs1.paddingTop} ${cs1.paddingRight} ${cs1.paddingBottom} ${cs1.paddingLeft}`,
                        margin: `${cs1.marginTop} ${cs1.marginRight} ${cs1.marginBottom} ${cs1.marginLeft}`,
                        borderBottomWidth: cs1.borderBottomWidth,
                    },
                    searchBtn: {
                        h: Math.round(r2.height),
                        bottom: Math.round(r2.bottom),
                        display: cs2.display,
                        alignSelf: cs2.alignSelf,
                        lineHeight: cs2.lineHeight,
                        padding: `${cs2.paddingTop} ${cs2.paddingRight} ${cs2.paddingBottom} ${cs2.paddingLeft}`,
                        margin: `${cs2.marginTop} ${cs2.marginRight} ${cs2.marginBottom} ${cs2.marginLeft}`,
                        borderBottomWidth: cs2.borderBottomWidth,
                    },
                    deltaBottom: Math.round(r2.bottom - r1.bottom),
                } as const;
                console.debug('[SearchFilters][buttons-align]', info);
            } catch (e) {
                try { console.warn('[SearchFilters][buttons-align][err]', String(e)); } catch {}
            }
        };

        const onResize = () => measure('window-resize');
        const roRow = new ResizeObserver(() => measure('row-resize'));
        const ro1 = new ResizeObserver(() => measure('wishes-resize'));
        const ro2 = new ResizeObserver(() => measure('search-resize'));
        roRow.observe(row);
        ro1.observe(b1);
        ro2.observe(b2);
        window.addEventListener('resize', onResize);
        // measure после layout
        const raf = requestAnimationFrame(() => measure('raf'));
        measure('init');
        return () => {
            cancelAnimationFrame(raf);
            roRow.disconnect();
            ro1.disconnect();
            ro2.disconnect();
            window.removeEventListener('resize', onResize);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collapsed, showAdvanced]);


    //const [hashtagInput, setHashtagInput] = useState('');
    const { setHide } = useBottomNavBar();

    // Hide Google Places dropdown until 3+ characters are typed to avoid focus loss.
    useEffect(() => {
        if (!isLoaded) return;
        const root = document.documentElement;
        const len = (location?.trim()?.length ?? 0);
        if (len < 3) root.classList.add('pac-hidden');
        else root.classList.remove('pac-hidden');
        return () => { root.classList.remove('pac-hidden'); };
    }, [isLoaded, location]);

    const handleOpenActivitySelector = () => {
        setHide(true);
        setShowMobileActivity(true);
    };

    const handleCloseSelector = () => {
        setHide(false);
        setShowMobileActivity(false);
    };

    //const [showMobileDate, setShowMobileDate] = useState(false);


    const firstRowRef = useRef<HTMLDivElement | null>(null);
    const cardRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const root = document.documentElement;
        const el1 = firstRowRef.current;
        const elCard = cardRef.current;
        if (!el1 || !elCard) return;
        const update = () => {
            try {
                const h1 = Math.ceil(el1.getBoundingClientRect().height);
                const hCard = Math.ceil(elCard.getBoundingClientRect().height);
                const headerH = getComputedStyle(root).getPropertyValue('--header-h')?.trim() || 'auto';
                root.style.setProperty('--search-first-row-h', `${h1}px`);
                root.style.setProperty('--search-form-h', `${hCard}px`);
                root.style.setProperty('--search-top-offset', collapsed ? `${h1}px` : `${hCard}px`);
                try {
                    const r1 = el1.getBoundingClientRect();
                    const rCard = elCard.getBoundingClientRect();
                    if (DEBUG_SEARCH_LAYOUT) {
                        console.debug('[SearchFilters][measure]', {
                            collapsed,
                            firstRow: h1,
                            firstTop: Math.round(r1.top),
                            form: hCard,
                            formTop: Math.round(rCard.top),
                            headerH,
                            topOffset: collapsed ? h1 : hCard
                        });
                    }
                } catch { }
            } catch (e) { try { console.warn('[SearchFilters][measure][err]', String(e)); } catch { } }
        };
        update();
        const ro1 = new ResizeObserver(update);
        const ro2 = new ResizeObserver(update);
        ro1.observe(el1);
        ro2.observe(elCard);
        return () => { ro1.disconnect(); ro2.disconnect(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collapsed, layoutEpoch]);

    return (
        <div
            className="w-full max-w-4xl mx-auto px-4 mt-1 sm:mt-2"
            // Скролл ленты расположен ниже, форму не задвигаем под хедер
            style={{ marginTop: '17px' }}
        >
            <div className="flex flex-col gap-4">
                {/* Заголовок перенесён в Header */}

                {/* Карточка фильтров */}
                <div ref={cardRef} className="w-full border border-gray-300 rounded-2xl overflow-visible shadow-sm divide-y divide-gray-200 bg-white">
                    {/* Ключевые слова (первая строка — остаётся всегда, превращается в сводку) */}
                    <div className="relative px-4 py-3" ref={firstRowRef}>
                        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-600" />
                        <input
                            type="text"
                            placeholder={collapsed ? '' : 'Поиск по словам и именам'}
                            value={collapsed ? (summaryText || '') : searchQuery}
                            readOnly={collapsed}
                            onFocus={() => {
                                if (collapsed) {
                                    lockCollapse?.(false);
                                    setCollapsed?.(false);
                                }
                            }}
                            onClick={() => {
                                if (collapsed) {
                                    lockCollapse?.(false);
                                    setCollapsed?.(false);
                                }
                            }}
                            onChange={(e) => { if (!collapsed) setSearchQuery(e.target.value); }}
                            className="w-full pl-7 border-none focus:outline-none bg-transparent truncate"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="none"
                            spellCheck={false}
                        />
                    </div>

                    {/* Город и даты — часть 2 и 3 строки: прячем в collapsed */}
                    <div className={`grid grid-cols-1 sm:grid-cols-[2fr_2fr] divide-y sm:divide-y-0 sm:divide-x divide-gray-200 ${collapsed ? 'hidden' : ''}`}
                    >
                        {/* Город */}
                        {isLoaded && (
                            <Autocomplete
                                onLoad={(autocomplete) => {
                                    if (autocompleteRef.current === null) {
                                        autocompleteRef.current = autocomplete;
                                    }
                                }}
                                onPlaceChanged={handlePlaceSelect}
                            >
                                <div className="px-4 py-3 sm:border-b-0 relative">
                                    <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-600" />
                                    <input
                                        type="text"
                                        placeholder="Город"
                                        value={location}
                                        onChange={(e) => setLocation(e.target.value)}
                                        className="w-full pl-7 border-none focus:outline-none bg-transparent truncate"
                                        autoComplete="off"
                                        autoCorrect="off"
                                        autoCapitalize="none"
                                        spellCheck={false}
                                    />
                                </div>
                            </Autocomplete>
                        )}

                        {/* 📱 Только для мобильной версии: Даты и Активности */}
                        <div className="flex sm:hidden divide-x divide-gray-200 border-t border-b border-gray-200">
                            <div className="w-1/2">
                                <MobileDateSelector
                                    startDate={startDate ? new Date(startDate) : null}
                                    endDate={endDate ? new Date(endDate) : null}
                                    setStartDate={(date) =>
                                        setStartDate(date ? format(date, 'yyyy-MM-dd') : '')
                                    }
                                    setEndDate={(date) =>
                                        setEndDate(date ? format(date, 'yyyy-MM-dd') : '')
                                    }
                                />

                            </div>
                            <div className="w-1/2">
                                <div
                                    onClick={handleOpenActivitySelector}
                                    className={cn(
                                        "w-full px-3 py-3 border-none bg-transparent focus:outline-none cursor-pointer text-sm flex items-center",
                                        (selectedActivities.length + selectedHashtags.length > 0)
                                            ? "text-gray-800"
                                            : "text-gray-400"
                                    )}
                                >
                                    <Target className="w-5 h-5 text-blue-600 mr-3" />
                                    {renderMobileLabel()}
                                </div>

                                {showMobileActivity && (
                                    <MobileActivitySelector
                                        activities={activities}
                                        hashtags={hashtags}
                                        selectedActivities={selectedActivities}
                                        selectedHashtags={selectedHashtags}
                                        setSelectedActivities={setSelectedActivities}
                                        setSelectedHashtags={setSelectedHashtags}
                                        onClose={handleCloseSelector}
                                    />
                                )}


                            </div>
                        </div>


                        {/* Даты */}
                        <div className="hidden sm:grid">
                            <div className="grid grid-cols-2">
                                <div className="border-r border-gray-200">
                                    <DateInput
                                        label="С какого числа?"
                                        selected={startDate ? new Date(startDate) : undefined}
                                        onSelect={(date) =>
                                            setStartDate(date ? format(date, 'yyyy-MM-dd') : '')
                                        }
                                        disabled={(date) => date < today}
                                    />
                                </div>
                                <div>
                                    <DateInput
                                        label="До какого числа?"
                                        selected={endDate ? new Date(endDate) : undefined}
                                        onSelect={(date) =>
                                            setEndDate(date ? format(date, 'yyyy-MM-dd') : '')
                                        }
                                        disabled={(date) =>
                                            date < tomorrow || (startDate ? date < new Date(startDate) : false)}
                                        defaultMonth={startDate ? new Date(startDate) : undefined}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={cn(
                        "hidden sm:grid grid-cols-2 divide-x divide-gray-200",
                        collapsed && "sm:hidden"
                    )}>

                        {/* Активности */}
                        <div className="relative">
                            <ActivityAutocomplete
                                activities={activities}
                                selectedActivities={selectedActivities}
                                setSelectedActivities={setSelectedActivities}
                                placeholder="Активности"
                                prefixIcon={<Target className="w-5 h-5 text-blue-600" />}
                            />

                        </div>

                        {/* Хэштеги */}
                        <div className="relative">
                            <HashtagAutocomplete
                                hashtags={hashtags}
                                selectedHashtags={selectedHashtags}
                                setSelectedHashtags={setSelectedHashtags}
                                prefixIcon={<TagIcon className="w-5 h-5 text-blue-600" />}
                            />

                        </div>
                    </div>



                </div>


                {/* Кнопки */}
                <div ref={buttonsRowRef} className={`flex justify-between items-end mt-0 mb-2 ${collapsed ? 'hidden' : ''}`}>
                    <div ref={buttonRef} className="h-9 flex items-end">
                        <button
                            type="button"
                            onClick={() => setShowAdvanced((prev) => !prev)}
                            className="inline-flex items-end gap-2 px-0 text-sm font-medium text-gray-600 hover:underline focus:outline-none leading-none pb-[1px]"
                        >
                            <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                            Ваши пожелания
                        </button>
                    </div>

                    <Button
                        ref={searchButtonRef}
                        onClick={() => {
                            lockCollapse?.(true);
                            setCollapsed?.(true);
                            onSearch();
                        }}
                        variant="default"
                        className="flex self-end h-9 min-h-[36px] leading-none rounded-xl px-5"
                    >
                        <SearchIcon className="mr-2 w-4 h-4" />
                        Поиск
                    </Button>
                </div>


                {showAdvanced && (
                    <div className="hidden sm:block">
                        <AdvancedFilters
                            ref={advancedRefDesktop}
                            setShow={setShowAdvanced}
                            show={showAdvanced}
                            onlyKids={onlyKids}
                            withCoach={withCoach}
                            excludeSoldOut={excludeSoldOut}
                            hotOffers={hotOffers}
                            onChange={(filter, value) => {
                                if (filter === 'onlyKids') setOnlyKids(value);
                                if (filter === 'withCoach') setWithCoach(value);
                                if (filter === 'excludeSoldOut') setExcludeSoldOut(value);
                                if (filter === 'hotOffers') setHotOffers(value);
                            }}
                        />
                    </div>
                )}

                {showAdvanced && (
                    <div className="sm:hidden fixed inset-0 z-[4000] bg-black/40 flex items-center justify-center" onClick={() => setShowAdvanced(false)}>
                        <div className="bg-white w-[min(92vw,520px)] rounded-2xl shadow-xl p-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-2">
                                <div className="font-medium">Ваши пожелания</div>
                                <button className="w-8 h-8 rounded-full hover:bg-gray-100" aria-label="Закрыть" onClick={() => setShowAdvanced(false)}>✕</button>
                            </div>
                            <AdvancedFilters
                                ref={advancedRefMobile}
                                setShow={setShowAdvanced}
                                show={true}
                                onlyKids={onlyKids}
                                withCoach={withCoach}
                                excludeSoldOut={excludeSoldOut}
                                hotOffers={hotOffers}
                                borderless
                                mobileEnhance
                                onChange={(filter, value) => {
                                    if (filter === 'onlyKids') setOnlyKids(value);
                                    if (filter === 'withCoach') setWithCoach(value);
                                    if (filter === 'excludeSoldOut') setExcludeSoldOut(value);
                                    if (filter === 'hotOffers') setHotOffers(value);
                                }}
                            />
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
