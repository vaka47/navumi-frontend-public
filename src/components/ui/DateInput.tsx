'use client';

import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface DateInputProps {
    label: string;
    selected: Date | undefined;
    onSelect: (date: Date | undefined) => void;
    disabled?: (date: Date) => boolean;
    defaultMonth?: Date
}

export function DateInput({ label, selected, onSelect, disabled, defaultMonth }: DateInputProps) {
    const [open, setOpen] = useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <div
                    onClick={() => setOpen(true)}
                    className={cn(
                        'w-full px-4 py-3 cursor-pointer bg-transparent text-sm text-muted-foreground flex items-center justify-between hover:bg-gray-50 transition',
                        'border-none outline-none'
                    )}
                >
                    <span className={selected ? 'text-black' : ''}>
                        {selected
                            ? `${label.startsWith('С') ? 'С ' : 'До '}${format(selected, 'dd.MM.yyyy')}`
                            : label}
                    </span>
                    {selected ? (
                        <X
                            className="ml-2 h-4 w-4 text-primary cursor-pointer"
                            onClick={(e) => {
                                e.stopPropagation();  // не открывать Popover при клике на крестик
                                onSelect(undefined);   // очищаем выбранную дату
                            }}
                        />
                    ) : (
                        <CalendarIcon className="ml-2 h-4 w-4 opacity-70 text-blue-600" />
                    )}
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-[5000]" align="start">
                <Calendar
                    mode="single"
                    selected={selected}
                    onSelect={(date) => {
                        onSelect(date);
                        setOpen(false);
                    }}
                    disabled={disabled}
                    //initialFocus
                    defaultMonth={selected ?? defaultMonth ?? new Date()}
                    classNames={{
                        today: 'border border-gray-300',
                        day_selected: 'bg-primary text-white',
                        day_today: 'border border-gray-300',
                    }}
                />
            </PopoverContent>
        </Popover>
    );
}
