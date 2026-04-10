// src/components/camp/CampDateInputs.tsx
'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { DateInput } from '@/components/ui/DateInput';

interface Props {
    startDate: string;
    setStartDate: (value: string) => void;
    endDate: string;
    setEndDate: (value: string) => void;
}

export default function CampDateInputs({ startDate, setStartDate, endDate, setEndDate }: Props) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [startDateObj] = useState<Date | null>(startDate ? new Date(startDate) : null);
    const [endDateObj] = useState<Date | null>(endDate ? new Date(endDate) : null);

    useEffect(() => {
        if (startDateObj) setStartDate(startDateObj.toISOString().split('T')[0]);
    }, [startDateObj]);

    useEffect(() => {
        if (endDateObj) setEndDate(endDateObj.toISOString().split('T')[0]);
    }, [endDateObj]);

    return (
        <div className="hidden sm:grid grid-cols-2 gap-2">
            <div className="border-r border-gray-200">
                <DateInput
                    label="С какого числа?"
                    selected={startDate ? new Date(startDate) : undefined}
                    onSelect={(date) => setStartDate(date ? format(date, 'yyyy-MM-dd') : '')}
                    disabled={(date) => date < today}
                />
            </div>
            <div>
                <DateInput
                    label="До какого числа?"
                    selected={endDate ? new Date(endDate) : undefined}
                    onSelect={(date) => setEndDate(date ? format(date, 'yyyy-MM-dd') : '')}
                    disabled={(date) => date < tomorrow || (startDate ? date < new Date(startDate) : false)}
                    defaultMonth={startDate ? new Date(startDate) : undefined}
                />
            </div>
        </div>
    );
}
