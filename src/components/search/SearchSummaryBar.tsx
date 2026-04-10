'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SearchSummaryBar({
  text,
  collapsed,
  onExpand,
  height = 48,
}: { text: string; collapsed: boolean; onExpand: () => void; height?: number }) {
  return (
    <AnimatePresence initial={false}>
      {collapsed && (
        <motion.div
          key="search-summary"
          initial={{ height: 0, opacity: 0, y: -12, boxShadow: '0 0 0 rgba(0,0,0,0)' }}
          animate={{ height, opacity: 1, y: 0, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}
          exit={{ height: 0, opacity: 0, y: -12, boxShadow: '0 0 0 rgba(0,0,0,0)' }}
          transition={{ duration: 0.33, ease: [0.2, 0.7, 0.2, 1] }}
          className="fixed top-0 left-0 right-0 z-[102] pointer-events-none bg-white/90 backdrop-blur"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <div className="w-full max-w-4xl mx-auto px-4 h-full flex items-center">
            <button
              type="button"
              onClick={onExpand}
              className="pointer-events-auto w-full text-left text-[14px] leading-5 truncate text-gray-900 hover:underline"
              title={text}
              aria-label="Развернуть поиск"
            >
              {text || 'Поиск'}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
