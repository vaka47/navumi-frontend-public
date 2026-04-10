'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import PseudoModal from '@/components/ui/PseudoModal';
import { FixedMenuPortal } from '@/components/ui/FixedMenuPortal';
import { loadGooglePlaces } from '@/lib/google/loadGooglePlaces';

export type PickedLocation = {
    address: string;
    latitude: number;
    longitude: number;
    place_id: string;
};

type VisualViewportLike = {
    height: number;
    addEventListener?: (type: 'resize' | 'scroll', listener: EventListenerOrEventListenerObject) => void;
    removeEventListener?: (type: 'resize' | 'scroll', listener: EventListenerOrEventListenerObject) => void;
};

const MIN_CHARS = 3;

export default function LocationPickerOverlayMobile({
    open,
    onClose,
    initialSelected,
    onDone,
    layout = 'fullscreen',
}: {
    open: boolean;
    onClose: () => void;
    initialSelected?: PickedLocation | null;
    onDone: (picked: PickedLocation) => void;
    layout?: 'centered' | 'fullscreen';
}) {
    const [query, setQuery] = useState('');
    const [typed, setTyped] = useState('');
    const [hasFocus, setHasFocus] = useState(false);
    const [suppressMenu, setSuppressMenu] = useState(false);

    const [mapBooting, setMapBooting] = useState(false);
    const [mapError, setMapError] = useState<string | null>(null);

    const [ready, setReady] = useState(false);
    const [loadingPreds, setLoadingPreds] = useState(false);
    const [preds, setPreds] = useState<google.maps.places.AutocompletePrediction[]>([]);

    const [picked, setPicked] = useState<PickedLocation | null>(null);

    const inputRef = useRef<HTMLInputElement>(null);
    const railRef = useRef<HTMLDivElement>(null);

    const mapDivRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const markerRef = useRef<google.maps.Marker | null>(null);
    const geocoderRef = useRef<google.maps.Geocoder | null>(null);
    const lastGeocodeReq = useRef(0);

    // --- dynamic map height based on viewport (mobile)
    const [mapH, setMapH] = useState(360);
    const recomputeMapHeight = useCallback(() => {
        if (typeof window === 'undefined') return;
        const vvp = (window as Window & { visualViewport?: VisualViewportLike }).visualViewport;
        const vv = vvp?.height ?? window.innerHeight;
        // резерв под хедер, строку поиска, отступы и нижнюю строку «Готово»
        const headerH = 48;   // h-12
        const inputH = 48;   // h-12
        const gaps = 12 /* mt-3 */ + 16 /* gap to map */ + 16 /* extra bottom gap */;
        const footerRow = 64; // высота строки статуса + кнопки
        const safe = vvp ? Math.max(vvp.height - window.innerHeight, 0) : 0;

        const reserved = headerH + inputH + gaps + footerRow + safe;
        let h = vv - reserved;

        const minH = 280;                 // минимальная высота
        const softMax = Math.round(vv * 0.82); // не занимать весь экран
        h = Math.max(minH, Math.min(h, softMax));

        setMapH(h);
    }, []);

    useEffect(() => {
        if (!open) return;
        // первичный расчёт + подписки на изменения viewport’а
        recomputeMapHeight();
        const onResize = () => recomputeMapHeight();
        window.addEventListener('resize', onResize);
        const vvp = (window as Window & { visualViewport?: VisualViewportLike }).visualViewport;
        vvp?.addEventListener?.('resize', onResize);
        vvp?.addEventListener?.('scroll', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
            vvp?.removeEventListener?.('resize', onResize);
            vvp?.removeEventListener?.('scroll', onResize);
        };
    }, [open, recomputeMapHeight]);


    const changeZoom = useCallback((delta: number) => {
        const map = mapRef.current;
        if (!map) return;
        const z = map.getZoom() ?? 0;
        map.setZoom(Math.max(0, Math.min(22, z + delta)));
    }, []);

    // контейнер для портала (меню подсказок)
    const [portalContainer, setPortalContainer] = useState<Element | null>(null);
    useEffect(() => {
        if (!open) { setPortalContainer(null); return; }
        const host = railRef.current?.closest('[data-tpm-panel]') as Element | null;
        setPortalContainer(host ?? document.body);
    }, [open]);

    // дебаунс ввода
    useEffect(() => {
        if (!open) return;
        const t = setTimeout(() => setTyped(query.trim()), 180);
        return () => clearTimeout(t);
    }, [query, open]);

    // при открытии — сброс + загрузка Google Places
    useEffect(() => {
        let cancelled = false;
        async function boot() {
            if (!open) return;
            setQuery(initialSelected?.address ?? '');
            setTyped(initialSelected?.address ?? '');
            setPreds([]);
            setPicked(initialSelected ?? null);
            setSuppressMenu(false);
            setLoadingPreds(false);
            setReady(false);

            try {
                await loadGooglePlaces();
                if (!cancelled) {
                    setTimeout(() => { if (!cancelled) setReady(true); }, 120);
                }
            } catch (e) {
                console.error('Google Places load failed', e);
                if (!cancelled) setReady(false);
            }
        }
        boot();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // сервисы Google
    const services = useMemo(() => {
        if (!ready || typeof window === 'undefined' || !window.google?.maps?.places) return null;
        const svc = new window.google.maps.places.AutocompleteService();
        const ps = new window.google.maps.places.PlacesService(document.createElement('div'));
        return { svc, ps };
    }, [ready]);

    // форматирование адреса (общая логика)
    const formatByComponents = useCallback((
        comps: Array<{ long_name: string; types: string[] }> | undefined,
        fallback?: string,
    ) => {
        const city = comps?.find(c => c.types.includes('locality'))?.long_name || '';
        const region = comps?.find(c => c.types.includes('administrative_area_level_1'))?.long_name || '';
        const country = comps?.find(c => c.types.includes('country'))?.long_name || '';
        const capitalExceptions = ['Париж', 'Москва', 'Берлин', 'Рим', 'Лондон', 'Мадрид', 'Амстердам', 'Вена', 'Прага', 'Токио'];
        const parts: string[] = [];
        if (city) parts.push(city);
        if (
            region && region !== city && region !== country &&
            !capitalExceptions.includes(city) &&
            !city.toLowerCase().includes(region.toLowerCase())
        ) parts.push(region);
        if (country) parts.push(country);
        return parts.join(', ') || fallback || '';
    }, []);

    // показать маркер и/или отцентрировать
    const showMarkerAt = useCallback((pos: google.maps.LatLng | google.maps.LatLngLiteral, center = false) => {
        if (!mapRef.current || !markerRef.current) return;
        markerRef.current.setPosition(pos);
        markerRef.current.setVisible(true);
        if (center) {
            mapRef.current.setCenter(pos);
            mapRef.current.setZoom(12);
        }
    }, []);

    // обратное геокодирование → обновляем picked + инпут
    const setMarkerAndReverse = useCallback((pos: google.maps.LatLng) => {
        showMarkerAt(pos, true);
        if (!geocoderRef.current) return;
        const reqId = ++lastGeocodeReq.current;
        geocoderRef.current.geocode({ location: pos }, (results, status) => {
            if (reqId !== lastGeocodeReq.current) return;
            const ok = status === window.google.maps.GeocoderStatus.OK;
            const r = ok && results && results[0] ? results[0] : null;
            const address = r ? formatByComponents(r.address_components, r.formatted_address) : '';
            const value: PickedLocation = {
                address: address || `${pos.lat().toFixed(6)}, ${pos.lng().toFixed(6)}`,
                latitude: pos.lat(),
                longitude: pos.lng(),
                place_id: r?.place_id || '',
            };
            setPicked(value);
            setQuery(value.address);
            setTyped(value.address);
            setPreds([]);
            setSuppressMenu(true);
            setTimeout(() => inputRef.current?.blur(), 0);
        });
    }, [formatByComponents, showMarkerAt]);

    // init карты/маркера/геокодера — новый инстанс на каждое открытие
    useEffect(() => {
        if (!open || !ready) return;
        const div = mapDivRef.current;
        if (!div || !window.google?.maps) return;

        setMapBooting(true);
        setMapError(null);

        const map = new window.google.maps.Map(div, {
            center: { lat: 20, lng: 0 },
            zoom: 2,
            disableDefaultUI: true,
            zoomControl: false,
            gestureHandling: 'greedy',
        });
        const marker = new window.google.maps.Marker({ map, draggable: true, visible: false });
        const geocoder = new window.google.maps.Geocoder();

        mapRef.current = map;
        markerRef.current = marker;
        geocoderRef.current = geocoder;

        const clickL = map.addListener('click', (e: google.maps.MapMouseEvent) => {
            if (!e.latLng) return;
            setMarkerAndReverse(e.latLng);
        });
        const dragL = marker.addListener('dragend', () => {
            const pos = marker.getPosition();
            if (pos) setMarkerAndReverse(pos);
        });

        const idleOnce = google.maps.event.addListenerOnce(map, 'idle', () => setMapBooting(false));
        const tilesOnce = google.maps.event.addListenerOnce(map, 'tilesloaded', () => setMapBooting(false));

        if (initialSelected) {
            const pos = new window.google.maps.LatLng(initialSelected.latitude, initialSelected.longitude);
            marker.setPosition(pos);
            marker.setVisible(true);
            map.setCenter(pos);
            map.setZoom(12);
        }

        return () => {
            clickL.remove();
            dragL.remove();
            idleOnce.remove();
            tilesOnce.remove();
            marker.setMap(null);
            mapRef.current = null;
            markerRef.current = null;
            geocoderRef.current = null;
            if (div) div.innerHTML = '';
            setMapBooting(false);
        };
    }, [open, ready, initialSelected, setMarkerAndReverse]);

    // при появлении picked — показать на карте
    useEffect(() => {
        if (!open || !ready || !picked) return;
        const pos = new window.google.maps.LatLng(picked.latitude, picked.longitude);
        showMarkerAt(pos, true);
    }, [open, ready, picked, showMarkerAt]);

    // поиск подсказок
    useEffect(() => {
        if (!open) return;
        if (typed.length < MIN_CHARS) {
            setPreds([]);
            setLoadingPreds(false);
            return;
        }
        if (!services) { setLoadingPreds(true); return; }

        let alive = true;
        setLoadingPreds(true);
        services.svc.getPlacePredictions(
            { input: typed, types: ['geocode'] },
            (res, status) => {
                if (!alive) return;
                const ok = status === window.google.maps.places.PlacesServiceStatus.OK;
                setPreds(ok && Array.isArray(res) ? res : []);
                setLoadingPreds(false);
            },
        );
        return () => { alive = false; };
    }, [typed, services, open]);

    // форматирование адреса
    const formatPlace = useCallback((place: google.maps.places.PlaceResult) => {
        return formatByComponents(place.address_components, place.formatted_address || place.name || '');
    }, [formatByComponents]);

    // выбор подсказки → детали + отображение на карте
    const choosePrediction = useCallback((p: google.maps.places.AutocompletePrediction) => {
        if (!services) return;
        services.ps.getDetails(
            { placeId: p.place_id, fields: ['geometry', 'address_components', 'name', 'formatted_address'] },
            (place, status) => {
                const ok = status === window.google.maps.places.PlacesServiceStatus.OK;
                if (!ok || !place?.geometry?.location) return;
                const lat = place.geometry.location.lat();
                const lng = place.geometry.location.lng();
                const address = formatPlace(place);
                const value: PickedLocation = { address, latitude: lat, longitude: lng, place_id: p.place_id };
                setPicked(value);
                setQuery(address);
                setTyped(address);
                setPreds([]);
                setSuppressMenu(true);
                setTimeout(() => inputRef.current?.blur(), 0);
                if (mapRef.current && markerRef.current) {
                    const pos = new window.google.maps.LatLng(lat, lng);
                    showMarkerAt(pos, true);
                }
            },
        );
    }, [services, formatPlace, showMarkerAt]);

    // если вручную правят текст — сбросить picked
    useEffect(() => {
        if (!open) return;
        setPicked(prev => (prev && prev.address !== query ? null : prev));
    }, [query, open]);

    const menuOpen = open && hasFocus && !suppressMenu && typed.length >= MIN_CHARS && ((!
        ready) || loadingPreds || preds.length > 0);

    return (
        <PseudoModal
            open={open}
            onClose={onClose}
            maxWidth={layout === 'fullscreen' ? 'max-w-none' : 'max-w-lg'}
            className={[
                'tpm',
                'px-4',
                layout === 'fullscreen' ? 'pt-3 pb-[max(env(safe-area-inset-bottom,0px),16px)]' : 'py-2',
            ].join(' ')}
            lockScroll={false}
            layout={layout}
        >
            <div className="relative" data-tpm-panel>
                {/* Хедер */}
                <div className="sticky top-0 z-10 -mx-4 px-4 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b border-gray-200">
                    <div className="h-12 flex items-center justify-between">
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Закрыть"
                            className="h-10 px-3 -ml-3 rounded-full text-gray-600 hover:bg-gray-100 active:scale-[0.98]"
                        >
                            Закрыть
                        </button>
                        <div className="text-base font-semibold">Отметить локацию</div>
                        <div className="w-[64px]" aria-hidden />
                    </div>
                </div>

                {/* Инпут + дропдаун */}
                <div ref={railRef} className="relative mt-3">
                    <label htmlFor="location-lookup" className="sr-only">Город / место</label>
                    <div className="flex items-center gap-3 px-2 h-12 rounded-xl border border-gray-200 focus-within:border-gray-300 bg-white">
                        <span className="text-gray-400 text-lg" aria-hidden>🔎</span>
                        <input
                            ref={inputRef}
                            type="search"
                            inputMode="search"
                            id="location-lookup"
                            name="location_lookup"
                            autoCorrect="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            enterKeyHint="search"
                            role="combobox"
                            aria-autocomplete="list"
                            aria-expanded={menuOpen}
                            aria-controls="location-suggest"
                            placeholder={ready ? 'Город / место' : 'Город / место (загружаю…)'}
                            value={query}
                            onFocus={() => setHasFocus(true)}
                            onBlur={() => setHasFocus(false)}
                            onChange={(e) => { setSuppressMenu(false); setQuery(e.target.value); }}
                            onKeyDown={(e) => { if (e.key === 'Escape') setSuppressMenu(true); }}
                            className="w-full bg-transparent outline-none border-0 placeholder:text-gray-400 text-[15px]"
                        />
                    </div>

                    {/* Меню подсказок */}
                    <FixedMenuPortal anchorRef={railRef} open={menuOpen} container={portalContainer}>
                        <div
                            id="location-suggest"
                            data-ac-menu
                            className="relative overflow-y-auto overscroll-contain max-h-[320px] border border-gray-200 rounded-xl bg-white shadow-xl"
                            style={{ WebkitOverflowScrolling: 'touch' }}
                            onWheelCapture={(e) => {
                                const el = e.currentTarget as HTMLDivElement;
                                if (el.scrollHeight > el.clientHeight) e.stopPropagation();
                            }}
                            onTouchMoveCapture={(e) => {
                                const el = e.currentTarget as HTMLDivElement;
                                if (el.scrollHeight > el.clientHeight) e.stopPropagation();
                            }}
                        >
                            {!ready && (<div className="px-3 py-2 text-sm text-gray-500">Загружаю карты…</div>)}
                            {ready && loadingPreds && (<div className="px-3 py-2 text-sm text-gray-500">Ищу…</div>)}

                            {ready && !loadingPreds && preds.map(p => (
                                <button
                                    key={p.place_id}
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => choosePrediction(p)}
                                    className="w-full flex items-start gap-3 px-3 py-2 hover:bg-gray-50 text-left"
                                >
                                    <div className="mt-[6px] w-2 h-2 rounded-full bg-gray-300 shrink-0" />
                                    <div className="flex-1">
                                        <div className="text-[15px] leading-snug">{p.structured_formatting?.main_text || p.description}</div>
                                        {p.structured_formatting?.secondary_text && (
                                            <div className="text-xs text-gray-500">{p.structured_formatting.secondary_text}</div>
                                        )}
                                    </div>
                                </button>
                            ))}

                            {ready && !loadingPreds && preds.length === 0 && typed && (
                                <div className="px-3 py-2 text-sm text-gray-500">Ничего не найдено</div>
                            )}
                        </div>
                    </FixedMenuPortal>
                </div>

                {/* Карта + кнопка Готово */}
                <div className="mt-4 min-h-0">
                    <div
                        className="relative border border-gray-200 rounded-2xl overflow-hidden"
                        style={{ height: `${Math.max(280, mapH)}px` }}
                        aria-busy={!ready || mapBooting}
                    >
                        <div
                            ref={mapDivRef}
                            className="absolute inset-0"
                            onWheelCapture={(e) => e.stopPropagation()}
                            onTouchMoveCapture={(e) => e.stopPropagation()}
                        />

                        {/* спиннер */}
                        {(!ready || mapBooting) && (
                            <div className="absolute inset-0 grid place-items-center bg-white/60 backdrop-blur-[1px] pointer-events-none">
                                <div className="flex items-center gap-2 text-gray-600 text-sm">
                                    <span className="inline-block w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                                    <span>{!ready ? 'Загружаю карты…' : 'Загружаю карту…'}</span>
                                </div>
                            </div>
                        )}

                        {mapError && (
                            <div className="absolute inset-0 grid place-items-center bg-white/80 text-sm text-red-600">
                                Не удалось загрузить карту
                            </div>
                        )}

                        {/* + / − */}
                        <div className="absolute right-3 bottom-3 flex flex-col gap-2">
                            <button
                                type="button"
                                aria-label="Приблизить"
                                onClick={() => changeZoom(+1)}
                                className="w-11 h-11 rounded-xl bg-white border border-gray-200 shadow text-lg leading-none grid place-items-center hover:bg-gray-50 active:scale-[0.98]"
                            >+
                            </button>
                            <button
                                type="button"
                                aria-label="Отдалить"
                                onClick={() => changeZoom(-1)}
                                className="w-11 h-11 rounded-xl bg-white border border-gray-200 shadow text-lg leading-none grid place-items-center hover:bg-gray-50 active:scale-[0.98]"
                            >−
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between mt-3">
                        <div className="text-xs text-gray-500">
                            {picked ? 'Локация выбрана' : 'Локация не выбрана'}
                        </div>
                        <button
                            type="button"
                            disabled={!picked}
                            onClick={() => { if (picked) { onDone(picked); onClose(); } }}
                            className={[
                                'px-5 py-3 rounded-full text-sm font-semibold',
                                picked ? 'bg-black text-white hover:bg-black/80' : 'bg-gray-200 text-gray-500 cursor-not-allowed',
                            ].join(' ')}
                        >
                            Готово
                        </button>
                    </div>
                </div>

                <style jsx global>{`
          input[type="search"]::-webkit-search-cancel-button { -webkit-appearance: none; display: none; }
          #location-lookup::placeholder { font-size: 0.9375rem; }
          #location-lookup::-webkit-input-placeholder { font-size: 0.9375rem; }
          #location-lookup::-moz-placeholder { font-size: 0.9375rem; }
          #location-lookup:-ms-input-placeholder { font-size: 0.9375rem; }
          :root { -webkit-tap-highlight-color: transparent; }
        `}</style>
            </div>
        </PseudoModal>
    );
}
