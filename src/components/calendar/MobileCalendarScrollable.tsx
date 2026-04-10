'use client';

import { addMonths, isBefore, startOfMonth, format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { useEffect, useRef } from 'react';
import { ru } from 'date-fns/locale';
//import { cn } from '@/lib/utils';

interface Props {
    startDate: Date | null;
    endDate: Date | null;
    setStartDate: (date: Date | null) => void;
    setEndDate: (date: Date | null) => void;
    selecting: 'start' | 'end';
    setSelecting: (value: 'start' | 'end') => void;
    close: () => void;
}

export default function MobileCalendarScrollable({
                                                     startDate,
                                                     endDate,
                                                     setStartDate,
                                                     setEndDate,
                                                     selecting,
                                                     setSelecting,
                                                     close,
                                                 }: Props) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const months = Array.from({ length: 60 }, (_, i) => startOfMonth(addMonths(new Date(), i)));
    const containerRef = useRef<HTMLDivElement | null>(null);
    //const hasScrolledRef = useRef(false);

    const scrollToDate = (date: Date) => {
        const formatted = format(date, "dd.MM.yyyy"); // 👈 нужный формат
        requestAnimationFrame(() => {
            const target = containerRef.current?.querySelector(`[data-day="${formatted}"]`);
            if (target) {
                (target as HTMLElement).scrollIntoView({ block: "center" });
                hasAutoScrolled.current = true;
            }
        });
    };

    const hasAutoScrolled = useRef(false);

    useEffect(() => {
        if (!containerRef.current || hasAutoScrolled.current) return;

        if (startDate) {
            scrollToDate(startDate);
        } else if (endDate) {
            scrollToDate(endDate);
        } else {
            requestAnimationFrame(() => {
                const currentMonthEl = containerRef.current?.querySelector('[data-current-month]');
                currentMonthEl?.scrollIntoView({ block: 'start' });
                hasAutoScrolled.current = true;
            });
        }
    }, []);




    useEffect(() => {
        if (containerRef.current) {
            // Удаление прошедших недель ТОЛЬКО для текущего месяца
            const currentMonth = containerRef.current.querySelector('[data-current-month]');
            const weeks = currentMonth?.querySelectorAll('.rdp-week');
            if (weeks) {
                weeks.forEach((week) => {
                    const isAllDisabled = Array.from(week.querySelectorAll('.rdp-day')).every((day) =>
                        day.getAttribute('aria-disabled') === 'true'
                    );
                    if (isAllDisabled) {
                        (week as HTMLElement).style.display = 'none';
                    }
                });
            }
        }
    }, [startDate, endDate, selecting]);


    const handleDateSelect = (date: Date | undefined) => {
        if (!date) return;

        if (selecting === 'start') {
            if (isBefore(date, today)) return;
            setStartDate(date);
            if (endDate && isBefore(endDate, date)) {
                setEndDate(null);
                setSelecting('end');
                return;
            }
            if (!endDate) {
                setSelecting('end');
            }
        } else {
            if (isBefore(date, today)) return;
            if (startDate && isBefore(date, startDate)) return;
            setEndDate(date);
            setSelecting('start');
            close();
        }
    };

    const shouldHideDate = (date: Date, monthIndex: number) => {
        if (monthIndex !== 0) return false; // показываем всё в остальных месяцах
        return isBefore(date, today); // скрываем даты до сегодня в текущем месяце
    };

    return (
        <div className="flex-1 overflow-y-scroll pb-8" ref={containerRef}>
            {months.map((month, i) => (
                <div
                    key={month.toISOString()}
                    className={`flex flex-col items-center justify-center gap-4 border-b border-gray-300 ${
                        i === months.length - 1 ? '' : 'mb-5'
                    }`}
                    data-current-month={i === 0 ? 'true' : undefined}
                >
                    <Calendar
                        month={month}
                        mode="single"
                        selected={selecting === 'start' ? startDate || undefined : endDate || undefined}
                        onSelect={handleDateSelect}
                        disabled={(date) =>
                            selecting === 'start'
                                ? isBefore(date, today)
                                : isBefore(date, today) || (startDate ? isBefore(date, startDate) : false)
                        }
                        locale={ru}
                        weekStartsOn={1}
                        showOutsideDays={false}
                        hidden={(date) => shouldHideDate(date, i)}
                        className=""
                        classNames={{
                            month_caption: 'mb-4 text-center text-base font-semibold text-black dark:text-white',
                            nav: 'hidden',
                            table: 'table-fixed w-full',
                            head_row: 'h-8',
                            row: 'h-12',
                            weekdays: 'flex',
                            weekday: 'flex flex-1 justify-center items-center text-[0.8rem] font-normal text-muted-foreground select-none rounded-md',
                            day: 'text-center group/day relative aspect-square h-full w-full select-none p-0 [&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md',
                            today: 'border border-gray-300 rounded-md p-0 w-[28px] h-[28px] text-sm leading-none text-black',
                        }}
                    />
                </div>
            ))}
        </div>
    );
}