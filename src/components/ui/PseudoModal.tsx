// components/ui/PseudoModal.tsx
'use client';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { ModalLayerPortal } from '@/components/ui/ModalLayerPortal';

type PseudoModalProps = {
    open: boolean;
    onClose: () => void;
    className?: string;
    maxWidth?: string;
    children: React.ReactNode;
    container?: Element | null;
    lockScroll?: boolean;
    /** управляет закрытием по клику на фон */
    closeOnBackdrop?: boolean;
    /** управляет закрытием по Esc */
    closeOnEsc?: boolean;
    layout?: 'centered' | 'fullscreen';
};

export default function PseudoModal(props: PseudoModalProps) {
    const {
        open, onClose, className = '', maxWidth = 'max-w-lg', children,
        container, lockScroll = true, closeOnBackdrop = true, closeOnEsc = true,
        layout = 'centered',
    } = props;

    const panelRef = React.useRef<HTMLDivElement | null>(null);
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => { setMounted(true); }, []);

    React.useEffect(() => {
        if (!open || !lockScroll || typeof document === 'undefined') return;
        const prevHtml = document.documentElement.style.overflow;
        const prevBody = document.body.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
        return () => {
            document.documentElement.style.overflow = prevHtml;
            document.body.style.overflow = prevBody;
        };
    }, [open, lockScroll]);

    React.useEffect(() => {
        if (!open || !closeOnEsc) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose, closeOnEsc]);

    React.useEffect(() => {
        if (!open) return;
        const ae = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
        const tag = ae?.tagName?.toLowerCase();
        const isEditable = !!ae && (ae.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select');
        if (!isEditable && panelRef.current) panelRef.current.focus();
    }, [open]);

    const target = React.useMemo(() => {
        if (!container) return null;
        const fallback = typeof document !== 'undefined' ? document.body : null;
        const t = container ?? fallback;
        if (!t) return null;
        try {
            return t.closest?.('[inert],[aria-hidden="true"]') ? fallback : t;
        } catch { return fallback; }
    }, [container]);

    if (!mounted || !open) return null;

    const node = layout === 'fullscreen'
        ? (
            <div className="fixed inset-0 z-[2147483647] bg-white overflow-y-auto pointer-events-auto">
                <div
                    ref={panelRef}
                    data-tpm-panel
                    role="dialog" aria-modal="true" tabIndex={-1}
                    className={[
                        'min-h-full w-full bg-white tpm',
                        'focus:outline-none focus-visible:outline-none',
                        className,
                    ].join(' ')}
                >
                    {children}
                </div>
            </div>
        )
        : (
            <div className="fixed inset-0 z-[2147483647] flex items-center justify-center pointer-events-auto">
                <div
                    className="absolute inset-0 bg-black/60"
                    onMouseDown={(e) => { e.stopPropagation(); if (closeOnBackdrop) onClose(); }}
                />
                <div
                    ref={panelRef}
                    data-tpm-panel
                    role="dialog" aria-modal="true" tabIndex={-1}
                    className={[
                        'relative w-full', maxWidth,
                        'bg-white rounded-2xl shadow-xl overflow-visible p-4 sm:p-5 pointer-events-auto tpm',
                        'focus:outline-none focus-visible:outline-none', className,
                    ].join(' ')}
                >
                    {children}
                </div>
            </div>
        );

    if (container) {
        if (!target) return null;
        return createPortal(node, target);
    }

    return (
        <ModalLayerPortal>
            {node}
        </ModalLayerPortal>
    );
}
