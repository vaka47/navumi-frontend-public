'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { forwardRef } from 'react';

interface AdvancedFiltersProps {
    show: boolean;
    setShow: (value: boolean) => void;
    onlyKids: boolean;
    withCoach: boolean;
    excludeSoldOut: boolean;
    hotOffers: boolean;
    onChange: (filter: string, value: boolean) => void;
    borderless?: boolean;
    mobileEnhance?: boolean; // увеличить шрифт/межстрочный на мобильной модалке
}

const AdvancedFilters = forwardRef<HTMLDivElement, AdvancedFiltersProps>(({ 
                                                                              show,
                                                                              onlyKids,
                                                                              withCoach,
                                                                              excludeSoldOut,
                                                                              hotOffers,
                                                                              onChange,
                                                                              borderless = false,
                                                                              mobileEnhance = false
                                                                          }, ref) => {

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    ref={ref}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className={borderless
                        ? (mobileEnhance ? "relative z-[3500] space-y-3" : "relative z-[3500] space-y-2")
                        : `relative z-[3500] border rounded-lg p-4 bg-white shadow-md ${mobileEnhance ? 'space-y-3' : 'space-y-2'} w-full sm:w-1/2`}
                >
                    {/* 👶 Только детские кэмпы */}
                    <label className={`flex items-center ${mobileEnhance ? 'text-base leading-6' : 'text-sm'}`}>
                        <input
                            type="checkbox"
                            checked={onlyKids}
                            onChange={(e) => onChange('onlyKids', e.target.checked)}
                        />
                        <motion.span
                            key={onlyKids ? 'checked' : 'unchecked'}
                            className="ml-4"
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1.05 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 12 }}
                        >
                            👶 Только детские кэмпы
                        </motion.span>
                    </label>

                    {/* 🏅 С детским тренером */}
                    <label className={`flex items-center ${mobileEnhance ? 'text-base leading-6' : 'text-sm'}`}>
                        <input
                            type="checkbox"
                            checked={withCoach}
                            onChange={(e) => onChange('withCoach', e.target.checked)}
                        />
                        <motion.span
                            key={withCoach ? 'checked' : 'unchecked'}
                            className="ml-4"
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1.05 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 12 }}
                        >
                            🏅 С детским тренером
                        </motion.span>
                    </label>

                    {/* ❌ Не показывать Sold Out */}
                    <label className={`flex items-center ${mobileEnhance ? 'text-base leading-6' : 'text-sm'}`}>
                        <input
                            type="checkbox"
                            checked={excludeSoldOut}
                            onChange={(e) => onChange('excludeSoldOut', e.target.checked)}
                        />
                        <motion.span
                            key={excludeSoldOut ? 'checked' : 'unchecked'}
                            className="ml-4"
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1.05 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 12 }}
                        >
                            ❌ Не показывать Sold Out
                        </motion.span>
                    </label>

                    {/* 🔥 Горящие предложения */}
                    <label className={`flex items-center ${mobileEnhance ? 'text-base leading-6' : 'text-sm'}`}>
                        <input
                            type="checkbox"
                            checked={hotOffers}
                            onChange={(e) => onChange('hotOffers', e.target.checked)}
                        />
                        <motion.span
                            key={hotOffers ? 'checked' : 'unchecked'}
                            className="ml-4"
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1.05 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 12 }}
                        >
                            🔥 Горящие предложения
                        </motion.span>
                    </label>

                </motion.div>
            )}
        </AnimatePresence>
    );
});

AdvancedFilters.displayName = "AdvancedFilters";
export default AdvancedFilters;
