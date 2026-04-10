'use client';

let hideHeaderCount = 0;

export function acquireHideHeader() {
  if (typeof document === 'undefined') return;
  hideHeaderCount += 1;
  const hadClass = document.body.classList.contains('hide-header');
  if (hideHeaderCount === 1) {
    try {
      document.body.classList.add('hide-header');
      // eslint-disable-next-line no-console
      console.log('[headerVisibility] acquireHideHeader', {
        hideHeaderCount,
        hadClass,
        hasClassNow: document.body.classList.contains('hide-header'),
        stack: new Error().stack?.split('\n').slice(1, 4).join('\n'),
      });
    } catch {
      /* noop */
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('[headerVisibility] acquireHideHeader (count > 1)', {
      hideHeaderCount,
      hasClass: document.body.classList.contains('hide-header'),
    });
  }
}

export function releaseHideHeader() {
  if (typeof document === 'undefined') return;
  const hadClass = document.body.classList.contains('hide-header');
  const prevCount = hideHeaderCount;
  if (hideHeaderCount > 0) hideHeaderCount -= 1;
  if (hideHeaderCount === 0) {
    try {
      document.body.classList.remove('hide-header');
      // eslint-disable-next-line no-console
      console.log('[headerVisibility] releaseHideHeader', {
        prevCount,
        hideHeaderCount,
        hadClass,
        hasClassNow: document.body.classList.contains('hide-header'),
        stack: new Error().stack?.split('\n').slice(1, 4).join('\n'),
      });
    } catch {
      /* noop */
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('[headerVisibility] releaseHideHeader (count > 0)', {
      prevCount,
      hideHeaderCount,
      hasClass: document.body.classList.contains('hide-header'),
    });
  }
}

