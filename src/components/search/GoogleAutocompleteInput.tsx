'use client';

import { Autocomplete } from '@react-google-maps/api';
import { useRef, useEffect } from 'react';

interface Props {
    value: string;
    onChange: (value: string) => void;
    onPlaceSelected: (place: { name: string; lat: number; lng: number }) => void;
    placeholder?: string;
    className?: string;
    isSelectingRef?: React.MutableRefObject<boolean>; // 👈 Новый проп
}

export default function GoogleAutocompleteInput({
                                                    value,
                                                    onChange,
                                                    onPlaceSelected,
                                                    placeholder = 'Город / место',
                                                    className = '',
                                                    isSelectingRef,
                                                }: Props) {
    const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (!autocompleteRef.current) return;

        const listener = autocompleteRef.current.addListener('place_changed', () => {
            const place = autocompleteRef.current?.getPlace();
            if (!place || !place.geometry || !place.geometry.location) return;

            onPlaceSelected({
                name: place.formatted_address || place.name || '',
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng(),
            });
        });

        return () => listener.remove();
    }, [onPlaceSelected]);

    return (
        <div
            onMouseDown={() => {
                if (isSelectingRef) isSelectingRef.current = true;
            }}
            onMouseUp={() => {
                setTimeout(() => {
                    if (isSelectingRef) isSelectingRef.current = false;
                }, 100);
            }}
        >
            <Autocomplete
                onLoad={(autocomplete) => {
                    autocompleteRef.current = autocomplete;
                }}
            >
                <input
                    ref={inputRef}
                    type="text"
                    placeholder={placeholder}
                    className={`w-full border px-3 py-2 rounded ${className}`}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                />
            </Autocomplete>
        </div>
    );
}
