"use client";

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';
import { getBrowserApiBase } from '@/lib/apiBase';
import { ChevronLeft, HeartHandshake, CreditCard, Coins, Server, Wrench, Shield, Megaphone, Bug, Users, Mail, Copy } from 'lucide-react';

type SupportLocale = 'ru' | 'en';

const SUPPORT_CARD_NUMBERS: Record<SupportLocale, string> = {
  ru: '2200 9802 2035 0265',
  en: '4251 2502 3579 0812',
};

function normalizeSupportLocale(value?: string | null): SupportLocale | null {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized.startsWith('en')) return 'en';
  if (normalized.startsWith('ru')) return 'ru';
  return null;
}

function resolveRenderedSupportLocale(root?: HTMLElement | null): SupportLocale | null {
  const text = (root?.textContent || '').toLowerCase();
  if (
    text.includes('support the project') ||
    text.includes('financial support') ||
    text.includes('what your support covers') ||
    text.includes('transfer fees')
  ) {
    return 'en';
  }
  if (
    text.includes('поддержать проект') ||
    text.includes('финансовая поддержка') ||
    text.includes('зачем нужна поддержка') ||
    text.includes('комиссия зависит')
  ) {
    return 'ru';
  }
  return null;
}

function resolveSupportLocale(root?: HTMLElement | null): SupportLocale {
  if (typeof window === 'undefined') return 'ru';

  const url = new URL(window.location.href);
  const queryLocale =
    normalizeSupportLocale(url.searchParams.get('lang')) ||
    normalizeSupportLocale(url.searchParams.get('locale')) ||
    normalizeSupportLocale(url.searchParams.get('language')) ||
    normalizeSupportLocale(url.searchParams.get('hl')) ||
    normalizeSupportLocale(url.searchParams.get('lng'));
  if (queryLocale) return queryLocale;

  const pathLocale = normalizeSupportLocale(url.pathname.split('/').filter(Boolean)[0]);
  if (pathLocale) return pathLocale;

  const hostLocale = normalizeSupportLocale(url.hostname.split('.')[0]);
  if (hostLocale) return hostLocale;

  const localeCookie = document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => /^(NEXT_LOCALE|navumi_locale|django_language)=/i.test(item));
  if (localeCookie) {
    const [, rawValue = ''] = localeCookie.split('=');
    try {
      const cookieLocale = normalizeSupportLocale(decodeURIComponent(rawValue));
      if (cookieLocale) return cookieLocale;
    } catch {
      // Ignore malformed cookie values.
    }
  }

  const renderedLocale = resolveRenderedSupportLocale(root);
  if (renderedLocale) return renderedLocale;

  const browserLocale = normalizeSupportLocale(navigator.language);
  if (browserLocale) return browserLocale;

  const htmlLocale = normalizeSupportLocale(document.documentElement.lang);
  if (htmlLocale) return htmlLocale;

  return 'ru';
}

async function trackSupportCardCopy(locale: SupportLocale) {
  try {
    await fetch(`${getBrowserApiBase()}/api/support/card-copy/`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      credentials: 'omit',
      keepalive: true,
      body: JSON.stringify({ language: locale }),
    });
  } catch {
    // Analytics must never block copying the card number.
  }
}

export default function SupportPage() {
  const router = useRouter();
  const { authenticated, profile } = useAuth();
  const overlayEnv = useOverlayEnvironment();
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [supportLocale, setSupportLocale] = useState<SupportLocale>('ru');
  const fallback = authenticated && profile?.username ? `/${profile.username}` : '/search';
  const cardNumber = SUPPORT_CARD_NUMBERS[supportLocale];
  const compactCardNumber = cardNumber.replace(/\s/g, '');
  const handleBack = () => {
    if (overlayEnv.isOverlay) {
      overlayEnv.close();
      return;
    }
    try {
      router.replace(fallback);
    } catch {
      if (typeof window !== 'undefined') window.location.assign(fallback);
    }
  };

  useEffect(() => {
    const applyLocale = () => {
      setSupportLocale(resolveSupportLocale(pageRef.current));
    };

    applyLocale();

    const root = pageRef.current;
    const observer = typeof MutationObserver !== 'undefined' && root
      ? new MutationObserver(applyLocale)
      : null;
    if (observer && root) {
      observer.observe(root, { childList: true, characterData: true, subtree: true });
    }

    const timers = [
      window.setTimeout(applyLocale, 250),
      window.setTimeout(applyLocale, 1000),
    ];

    return () => {
      observer?.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const copy = async () => {
    void trackSupportCardCopy(supportLocale);
    const copiedMessage = supportLocale === 'en' ? 'Card number copied' : 'Номер карты скопирован';
    try {
      await navigator.clipboard.writeText(compactCardNumber);
      alert(copiedMessage);
    } catch {
      if (typeof window !== 'undefined') {
        window.prompt(
          supportLocale === 'en' ? 'Copy the card number:' : 'Скопируйте номер карты:',
          cardNumber,
        );
      }
    }
  };

  function IconShare() {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M12 16V4m0 0l-4 4m4-4l4 4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }

  return (
    <div ref={pageRef} className="pb-8" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)' }}>
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-b">
        <div className="max-w-4xl mx-auto px-2 sm:px-4 h-12 flex items-center">
          <button onClick={handleBack} aria-label="Назад" className="p-2 rounded-md hover:bg-gray-100 active:bg-gray-200 mr-2">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="truncate font-semibold text-lg flex-1">Поддержать проект</div>
          <button
            onClick={async () => {
              if (typeof window === 'undefined') return;
              const url = `${window.location.origin}/support`;
              try {
                if ('share' in navigator && navigator.share) {
                  await navigator.share({ url });
                } else if (navigator.clipboard?.writeText) {
                  await navigator.clipboard.writeText(url);
                  alert('Ссылка скопирована');
                } else {
                  window.prompt('Скопируйте ссылку:', url);
                }
              } catch {}
            }}
            aria-label="Поделиться"
            className="p-2 rounded-md hover:bg-gray-100 active:bg-gray-200 ml-2"
          >
            <IconShare />
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-10 text-gray-800">
        {/* Вступление */}
        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <HeartHandshake className="w-5 h-5 text-blue-600" /> Поддержать проект
          </h2>
          <p>
            Navumi — полностью частная некоммерческая инициатива, вдохновлённая желанием помочь людям находить подходящие кэмпы по гибким параметрам
            и облегчить организаторские задачи клубам. В проект вложено много сил, эмоций и времени. Любая поддержка помогает Navumi продолжать существовать
            и развиваться — делать поиск удобнее, а связь между участниками и организаторами прозрачнее и теплее.
          </p>
        </section>

        {/* Финансовая поддержка */}
        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CreditCard className="w-5 h-5 text-blue-600" /> Финансовая поддержка
          </h2>
          <p>
            Если хотите поддержать развитие сервиса финансово, вы можете сделать перевод на карту:
          </p>
          <div className="flex items-center gap-3 p-3 rounded-xl border bg-gray-50 select-all">
            <span className="font-mono text-[16px] tracking-wide">{cardNumber}</span>
            <button
              type="button"
              className="ml-auto inline-flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-full border hover:bg-gray-100"
              onClick={copy}
              aria-label="Скопировать номер карты"
            >
              <Copy className="w-4 h-4" /> Скопировать
            </button>
          </div>
          <p className="text-sm text-gray-600">Комиссия зависит от вашего банка или сервиса перевода.</p>
        </section>

        {/* Зачем нужна поддержка */}
        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Coins className="w-5 h-5 text-blue-600" /> Зачем нужна поддержка
          </h2>
          <ul className="space-y-2">
            <li className="flex items-start gap-3"><Server className="w-5 h-5 mt-[2px] text-blue-600" /> Серверы и инфраструктура: хостинг, базы данных, карты и другие сервисы.</li>
            <li className="flex items-start gap-3"><Wrench className="w-5 h-5 mt-[2px] text-blue-600" /> Разработка и дизайн: новые функции, улучшение UX, тестирование.</li>
            <li className="flex items-start gap-3"><Shield className="w-5 h-5 mt-[2px] text-blue-600" /> Модерация и поддержка: качество контента, безопасность и обратная связь с пользователями.</li>
          </ul>
        </section>

        {/* Нефинансовая поддержка */}
        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Megaphone className="w-5 h-5 text-blue-600" /> Помочь можно не только деньгами
          </h2>
          <ul className="space-y-2">
            <li className="flex items-start gap-3"><Users className="w-5 h-5 mt-[2px] text-blue-600" /> Пишите нам обратную связь и идеи улучшений.</li>
            <li className="flex items-start gap-3"><Bug className="w-5 h-5 mt-[2px] text-blue-600" /> Сообщайте о багах и неточностях — это очень ценно.</li>
            <li className="flex items-start gap-3"><Megaphone className="w-5 h-5 mt-[2px] text-blue-600" /> Расскажите о Navumi друзьям и сделайте репост в соцсетях.</li>
            <li className="flex items-start gap-3"><HeartHandshake className="w-5 h-5 mt-[2px] text-blue-600" /> Предложите партнёрство или совместную инициативу.</li>
          </ul>
        </section>

        {/* Контакты */}
        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Mail className="w-5 h-5 text-blue-600" /> Связаться с нами
          </h2>
          <p>Почта: <a className="text-blue-600 hover:underline" href="mailto:info@navumi.com">info@navumi.com</a></p>
        </section>

        {/* Спасибо */}
        <section className="text-[15px] leading-6">
          <p>
            Спасибо за вашу поддержку и доверие! Каждое доброе слово, каждое сообщение и каждый перевод — это вклад в развитие Navumi и в то,
            чтобы активные поездки становились проще и доступнее для всех.
          </p>
        </section>
      </div>
    </div>
  );
}
