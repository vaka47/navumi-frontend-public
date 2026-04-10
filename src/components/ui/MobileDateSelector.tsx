'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import MobileCalendarScrollable from '@/components/calendar/MobileCalendarScrollable';
import { X, CalendarIcon } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface MobileDateSelectorProps {
    startDate: Date | null;
    endDate: Date | null;
    setStartDate: (date: Date | null) => void;
    setEndDate: (date: Date | null) => void;
    onClose?: () => void; // теперь не обязательно
    className?: string;
}

export default function MobileDateSelector({
                                               startDate,
                                               endDate,
                                               setStartDate,
                                               setEndDate,
                                               onClose,
                                               className
                                           }: MobileDateSelectorProps) {
    const [open, setOpen] = useState(false);
    const [selecting, setSelecting] = useState<'start' | 'end'>('start');

    useEffect(() => {
        const setVH = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };
        setVH();
        window.addEventListener('resize', setVH);
        return () => window.removeEventListener('resize', setVH);
    }, []);

    const renderLabel = () => {
        if (startDate && endDate) return `с ${format(startDate, 'dd.MM')} до ${format(endDate, 'dd.MM')}`;
        if (startDate) return `с ${format(startDate, 'dd.MM')}`;
        if (endDate) return `до ${format(endDate, 'dd.MM')}`;
        return 'Даты';
    };

    useEffect(() => {
        const header = document.querySelector('header');
        if (open && header) {
            header.style.display = 'none';
        } else if (header) {
            header.style.display = '';
        }
    }, [open]);

    return (
        <>
            <div
                onClick={() => setOpen(true)}
                className={cn(
                    'w-full px-3 py-3 text-sm text-left cursor-pointer flex items-center gap-3',
                    className,
                    (startDate || endDate) ? 'text-black' : 'text-gray-400',
                    'bg-transparent border-none',
                )}
            >
                <CalendarIcon className="w-5 h-5 text-blue-600" />
                {renderLabel()}
            </div>

            {open && typeof window !== 'undefined' &&
                createPortal(
                    <div className="fixed inset-0 z-[4200] flex flex-col bg-white">
                        {/* Фон */}
                        <div className="fixed inset-0 z-[98] bg-black/30 backdrop-blur-sm" />

                        {/* Модалка */}
                        <div className="relative z-[99] flex flex-col h-full bg-white">
                            {/* Шапка */}
                            <div className="flex justify-between items-center p-4 border-b border-gray-200">
                                <span className="font-semibold text-lg">Выберите даты</span>
                                <button
                                    onClick={() => {
                                        setOpen(false);
                                        setSelecting('start');
                                        onClose?.(); // если передан
                                    }}
                                >
                                    <X className="w-6 h-6 text-gray-600" />
                                </button>
                            </div>

                            {/* Выбор дат */}
                            <div className="p-4">
                                <div className="flex border border-gray-200 rounded-2xl overflow-hidden">
                                    <DateChip
                                        label={startDate ? `с ${format(startDate, 'dd.MM.yyyy')}` : 'с какого?'}
                                        active={selecting === 'start'}
                                        onClick={() => setSelecting('start')}
                                        onClear={() => {
                                            setStartDate(null);
                                            setSelecting('start');
                                        }}
                                    />
                                    <DateChip
                                        label={endDate ? `до ${format(endDate, 'dd.MM.yyyy')}` : 'до какого?'}
                                        active={selecting === 'end'}
                                        onClick={() => setSelecting('end')}
                                        onClear={() => {
                                            setEndDate(null);
                                            setSelecting('end');
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Календарь */}
                            <MobileCalendarScrollable
                                startDate={startDate}
                                endDate={endDate}
                                setStartDate={setStartDate}
                                setEndDate={setEndDate}
                                selecting={selecting}
                                setSelecting={setSelecting}
                                close={() => {
                                    setOpen(false);
                                    setSelecting('start');
                                    onClose?.();
                                }}
                            />
                        </div>
                    </div>,
                    document.body
                )}
        </>
    );
}

function DateChip({
                      label,
                      active,
                      onClick,
                      onClear,
                  }: {
    label: string;
    active: boolean;
    onClick: () => void;
    onClear: () => void;
}) {
    return (
        <div
            className={`flex-1 px-4 py-3 text-base relative transition-all duration-300 ${
                active
                    ? 'border-2 border-primary rounded shadow-md scale-105 z-10'
                    : 'border-none scale-100'
            }`}
            onClick={onClick}
        >
            <div className="text-black pr-6 truncate">{label}</div>
            {(label.includes('с') || label.includes('до')) && (
                <X
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary cursor-pointer"
                    onClick={(e) => {
                        e.stopPropagation();
                        onClear();
                    }}
                />
            )}
        </div>
    );
}
