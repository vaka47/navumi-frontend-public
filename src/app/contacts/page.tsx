"use client";

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
  Mail,
  MessageSquare,
  Users,
  CircleHelp,
  Handshake,
  Newspaper,
  Bug,
  Lightbulb,
  ShieldAlert,
  HeartHandshake,
  Link2
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';
import { useSupportOverlay } from '@/hooks/useSupportOverlay';
import { useSearchOverlay } from '@/hooks/useSearchOverlay';
import { useAboutOverlay } from '@/hooks/useAboutOverlay';

export default function ContactsPage() {
  const router = useRouter();
  const { authenticated, profile } = useAuth();
  const overlayEnv = useOverlayEnvironment();
  const openSupportOverlay = useSupportOverlay();
  const openSearchOverlay = useSearchOverlay();
  const openAboutOverlay = useAboutOverlay();
  const fallback = authenticated && profile?.username ? `/${profile.username}` : '/search';
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

  function IconShare() {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M12 16V4m0 0l-4 4m4-4l4 4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }

  return (
    <div className="pb-8" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)' }}>
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-b">
        <div className="max-w-4xl mx-auto px-2 sm:px-4 h-12 flex items-center">
          <button onClick={handleBack} aria-label="Назад" className="p-2 rounded-md hover:bg-gray-100 active:bg-gray-200 mr-2">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="truncate font-semibold text-lg flex-1">Контакты</div>
          <button
            onClick={async () => {
              if (typeof window === 'undefined') return;
              const url = `${window.location.origin}/contacts`;
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
        {/* Intro */}
        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <MessageSquare className="w-5 h-5 text-blue-600" /> Контакты
          </h2>
          <p>
            Мы всегда рады обратной связи — вопросам, идеям и предложениям. Напишите нам в удобном для вас формате, и мы постараемся ответить как можно скорее.
          </p>
        </section>

        {/* How to reach us */}
        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Mail className="w-5 h-5 text-blue-600" /> Как связаться
          </h2>
          <p>
            Почта: <a className="text-blue-600 hover:underline" href="mailto:info@navumi.com">info@navumi.com</a>
          </p>
          <p className="text-sm text-gray-600">
            Это самый надёжный способ: письма не теряются, к письму легко прикрепить скриншоты и файлы.
          </p>
        </section>

        {/* Who to contact for what */}
        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CircleHelp className="w-5 h-5 text-blue-600" /> По каким вопросам — к кому
          </h2>
          <ul className="space-y-3">
            <li className="flex items-start gap-3"><Users className="w-5 h-5 mt-[2px] text-blue-600" />
              <div>
                <div className="font-medium">Вопросы по конкретному кэмпу (программа, оплата, возврат, условия)</div>
                <div className="text-sm text-gray-600">Лучше сразу писать непосредственно организатору — контакты есть на странице кэмпа.</div>
              </div>
            </li>
            <li className="flex items-start gap-3"><Handshake className="w-5 h-5 mt-[2px] text-blue-600" />
              <div>
                <div className="font-medium">Партнёрства, сотрудничество, спецпроекты</div>
                <div className="text-sm text-gray-600">Письмо на <a className="text-blue-600 hover:underline" href="mailto:info@navumi.com?subject=%D0%9F%D0%B0%D1%80%D1%82%D0%BD%D1%91%D1%80%D1%81%D1%82%D0%B2%D0%BE">info@navumi.com</a> с темой «Партнёрство».</div>
              </div>
            </li>
            <li className="flex items-start gap-3"><Newspaper className="w-5 h-5 mt-[2px] text-blue-600" />
              <div>
                <div className="font-medium">Пресса и медиа</div>
                <div className="text-sm text-gray-600">Запросы, интервью, комментарии — на <a className="text-blue-600 hover:underline" href="mailto:info@navumi.com?subject=%D0%9F%D1%80%D0%B5%D1%81%D1%81%D0%B0">info@navumi.com</a> с темой «Пресса».</div>
              </div>
            </li>
            <li className="flex items-start gap-3"><Bug className="w-5 h-5 mt-[2px] text-blue-600" />
              <div>
                <div className="font-medium">Баги и технические ошибки</div>
                <div className="text-sm text-gray-600">Кратко опишите проблему, шаги для воспроизведения, устройство/браузер и, если возможно, приложите скриншоты или короткое видео.</div>
              </div>
            </li>
            <li className="flex items-start gap-3"><Lightbulb className="w-5 h-5 mt-[2px] text-blue-600" />
              <div>
                <div className="font-medium">Идеи и предложения по функционалу</div>
                <div className="text-sm text-gray-600">Мы очень это ценим — расскажите, чего не хватает и как это должно работать для вас.</div>
              </div>
            </li>
            <li className="flex items-start gap-3"><ShieldAlert className="w-5 h-5 mt-[2px] text-blue-600" />
              <div>
                <div className="font-medium">Жалобы и вопросы модерации (контент, нарушение прав)</div>
                <div className="text-sm text-gray-600">Используйте кнопку «Пожаловаться» рядом с кэмпом/постом/комментарием или напишите на <a className="text-blue-600 hover:underline" href="mailto:abuse@navumi.com">abuse@navumi.com</a> с ссылкой на страницу.</div>
              </div>
            </li>
          </ul>
        </section>

        {/* About */}
        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <HeartHandshake className="w-5 h-5 text-blue-600" /> Немного о нас
          </h2>
          <p>
            Navumi — частная некоммерческая инициатива. Мы делаем сервис, чтобы людям было проще находить подходящие кэмпы, а клубам — легче объявлять о своих выездах.
            В проект вложено много сил, эмоций и времени, поэтому любая обратная связь — это реальная помощь развитию.
          </p>
        </section>

        {/* Help more */}
        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <HeartHandshake className="w-5 h-5 text-blue-600" /> Чем ещё можно помочь
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Поделиться сервисом с друзьями и в соцсетях.</li>
            <li>Прислать отзыв и идеи улучшений.</li>
          </ul>
          <div className="pt-1">
            <button
              type="button"
              onClick={() => openSupportOverlay()}
              className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-700"
            >
              Поддержать проект финансово
            </button>
            <span className="ml-2 text-sm text-gray-600">(реквизиты внутри страницы)</span>
          </div>
        </section>

        {/* Useful links */}
        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Link2 className="w-5 h-5 text-blue-600" /> Полезные ссылки
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Найти кэмп: страница поиска по локации, датам и активностям —
              <Link
                href="/search"
                className="text-blue-600 hover:underline ml-1"
                onClick={(event) => {
                  event.preventDefault();
                  openSearchOverlay();
                }}
              >
                перейти к поиску
              </Link>.
            </li>
            <li>
              О проекте: наша миссия и подход —
              <Link
                href="/about"
                className="text-blue-600 hover:underline ml-1"
                onClick={(event) => {
                  event.preventDefault();
                  openAboutOverlay();
                }}
              >
                прочитать
              </Link>.
            </li>
          </ul>
        </section>

        {/* Thanks */}
        <section className="text-[15px] leading-6">
          <p>Спасибо, что пишете нам. Каждое сообщение делает сервис понятнее, удобнее и полезнее для сообщества пользователей.</p>
        </section>
      </div>
    </div>
  );
}
