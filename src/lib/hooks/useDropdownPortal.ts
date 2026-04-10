// src/lib/hooks/useDropdownPortal.ts
import { useEffect, useMemo } from 'react';

const DEBUG = true;

function pickHostFor(anchor: HTMLElement | null): HTMLElement {
    if (anchor) {
        const dialog = anchor.closest<HTMLElement>('[role="dialog"]');
        if (dialog) return dialog;
        const portal = anchor.closest<HTMLElement>('[data-radix-portal]');
        if (portal) return portal;
    }
    return document.body;
}

export function useDropdownPortal(
    anchorRef: React.RefObject<HTMLElement>,
    open: boolean
) {
    const el = useMemo(() => {
        const node = document.createElement('div');
        node.setAttribute('data-portal', 'tags-menu');

        node.style.position      = 'absolute'; // позиционируем относительно host
        node.style.left          = '0px';
        node.style.top           = '0px';
        node.style.width         = '0px';
        node.style.height        = '0px';      // ⬅️ будем задавать реальную высоту позже
        node.style.zIndex        = String(2147483647);
        node.style.pointerEvents = 'auto';
        node.style.visibility    = 'hidden';
        node.style.overflow      = 'visible';
        node.style.transform     = 'none';
        node.style.willChange    = 'top,left';
        if (DEBUG) node.style.outline = '1px dashed #f40';
        return node;
    }, []);

    // монтируем в ближайший диалог/портал и гарантируем, что host — позиционированный
    useEffect(() => {
        let prevPos: string | null = null;
        let host: HTMLElement | null = null;

        const mountInto = () => {
            const nextHost = pickHostFor(anchorRef.current ?? null);
            if (el.parentElement !== nextHost) {
                nextHost.appendChild(el);
                if (DEBUG) console.debug(
                    '[portal] mounted into',
                    nextHost.getAttribute('role') === 'dialog' ? 'dialog' :
                        nextHost.hasAttribute('data-radix-portal') ? 'radix-portal' : 'body'
                );
            }
            // если host со статическим позиционированием — сделаем его относительным
            const cs = getComputedStyle(nextHost);
            if (cs.position === 'static') {
                if (host !== nextHost) { prevPos = nextHost.style.position || ''; }
                nextHost.style.position = 'relative';
            }
            host = nextHost;
        };

        mountInto();
        const mo = new MutationObserver(mountInto);
        mo.observe(document.body, { childList: true, subtree: true });
        if (open) mountInto();

        return () => {
            mo.disconnect();
            // вернуть оригинальное position, если меняли
            if (host && prevPos !== null) host.style.position = prevPos;
            el.remove();
        };
    }, [el, open, anchorRef]);

    // позиционирование
    useEffect(() => {
        if (!open) {
            el.style.visibility = 'hidden';
            const c = el.firstElementChild as HTMLElement | null;
            if (c) c.style.visibility = 'hidden';
            if (DEBUG) console.debug('[portal] hidden (open=false)');
            return;
        }

        // внутри useEffect(...), функция place()
        const place = () => {
            const a = anchorRef.current;
            const host = el.parentElement as HTMLElement | null;
            if (!a || !host) { if (DEBUG) console.debug('[portal] no anchor/host'); return; }

            const ar = a.getBoundingClientRect();
            const hr = host.getBoundingClientRect();

            // базовая привязка контейнера (нормальный режим)
            const leftAbs = Math.round(ar.left - hr.left + host.scrollLeft);
            let topAbs    = Math.round(ar.bottom - hr.top + host.scrollTop);

            el.style.left  = `${leftAbs}px`;
            el.style.width = `${Math.round(ar.width)}px`;

            const c = el.firstElementChild as HTMLElement | null;

            // гарантии непрозрачности/скролла
            if (c) {
                c.style.background   ||= '#fff';
                c.style.position     ||= 'relative';
                c.style.maxHeight    ||= 'min(60vh, 420px)';
                c.style.overflowY    ||= 'auto';
                c.style.borderRadius ||= '12px';
                c.style.boxShadow    ||= '0 12px 32px rgba(0,0,0,.12)';
            }

            // --- измерение высоты
            let h = 0;
            if (c) {
                // 1) обычная попытка
                h = Math.round(c.getBoundingClientRect().height || c.scrollHeight);
                if (h < 24) { c.style.minHeight = '40px'; }

                // 2) аварийная попытка (если getBCR=0)
                if (h === 0) {
                    const prev = {
                        pos: c.style.position, vis: c.style.visibility,
                        maxH: c.style.maxHeight, h: c.style.height, w: c.style.width,
                        left: c.style.left, top: c.style.top,
                    };
                    // временно делаем fixed и "видимым" для измерения
                    c.style.position   = 'fixed';
                    c.style.visibility = 'hidden';
                    c.style.left       = `${Math.round(ar.left)}px`;
                    c.style.top        = `${Math.round(ar.bottom)}px`;
                    c.style.width      = `${Math.round(ar.width)}px`;
                    c.style.maxHeight  = 'none';
                    c.style.height     = 'auto';

                    h = Math.round(c.scrollHeight);

                    // откатим — дальше решим, в каком режиме показывать
                    c.style.position   = prev.pos;
                    c.style.visibility = prev.vis;
                    c.style.maxHeight  = prev.maxH;
                    c.style.height     = prev.h;
                    c.style.width      = prev.w;
                    c.style.left       = prev.left;
                    c.style.top        = prev.top;
                }
            }

            // --- выбор режима
            if (h > 0) {
                // НОРМАЛЬНЫЙ РЕЖИМ: контейнер "держит" высоту
                el.style.height = `${h}px`;

                // flip внутри host
                const hostH      = host === document.body
                    ? (window.innerHeight || document.documentElement.clientHeight)
                    : host.clientHeight;
                const anchorTop  = Math.round(ar.top - hr.top + host.scrollTop);
                const anchorBot  = Math.round(ar.bottom - hr.top + host.scrollTop);
                const spaceBelow = hostH - anchorBot;

                if (h > spaceBelow && anchorTop > spaceBelow) {
                    topAbs = Math.max(12, anchorTop - h - 6);
                    if (DEBUG) console.debug('[portal] flip up');
                } else {
                    if (DEBUG) console.debug('[portal] pin below');
                }

                el.style.top = `${topAbs}px`;
                el.style.visibility = 'visible';
                if (c) c.style.visibility = 'visible';

                if (DEBUG) console.debug('[portal] metrics', {
                    left: leftAbs, top: topAbs, h,
                    hostPos: getComputedStyle(host).position,
                    hostOv: `${getComputedStyle(host).overflow} / ${getComputedStyle(host).overflowY}`,
                });
            } else if (c) {
                // АВАРИЙНЫЙ РЕЖИМ: показываем сам дропдаун fixed к якорю во вьюпорте
                const vwH = window.innerHeight || document.documentElement.clientHeight;
                let top = Math.round(ar.bottom);
                c.style.position = 'fixed';
                c.style.left     = `${Math.round(ar.left)}px`;
                c.style.top      = `${top}px`;
                c.style.width    = `${Math.round(ar.width)}px`;
                c.style.maxHeight = 'min(60vh, 420px)';
                c.style.overflowY = 'auto';

                // грубый flip по вьюпорту (без точной высоты)
                if (ar.top > vwH - ar.bottom) {
                    top = Math.max(12, Math.round(ar.top) - 320); // приблизительный maxH вверх
                    c.style.top = `${top}px`;
                    if (DEBUG) console.debug('[portal] FIXED FALLBACK (flip up)');
                } else {
                    if (DEBUG) console.debug('[portal] FIXED FALLBACK (pin below)');
                }

                // сам контейнер прячем (ноль), чтобы не мешал
                el.style.top = '0px';
                el.style.left = '0px';
                el.style.width = '0px';
                el.style.height = '0px';
                el.style.visibility = 'visible';
            }
        };


        let raf1 = 0, raf2 = 0;
        const schedule = () => { raf1 = requestAnimationFrame(() => { place(); raf2 = requestAnimationFrame(place); }); };

        const ro = new ResizeObserver(place);
        ro.observe(el);

        const mo = new MutationObserver(schedule);
        mo.observe(el, { childList: true, subtree: true });

        window.addEventListener('resize', place);
        document.addEventListener('scroll', place, true);

        schedule();
        if (DEBUG) console.debug('[portal] shown (open=true)');

        return () => {
            cancelAnimationFrame(raf1); cancelAnimationFrame(raf2);
            ro.disconnect(); mo.disconnect();
            window.removeEventListener('resize', place);
            document.removeEventListener('scroll', place, true);
        };
    }, [open, anchorRef, el]);

    // клики внутри портала не считаем «вне»
    useEffect(() => {
        const stopper = (e: Event) => e.stopPropagation();
        el.addEventListener('mousedown', stopper, true);
        el.addEventListener('pointerdown', stopper, true);
        return () => {
            el.removeEventListener('mousedown', stopper, true);
            el.removeEventListener('pointerdown', stopper, true);
        };
    }, [el]);

    return el;
}
