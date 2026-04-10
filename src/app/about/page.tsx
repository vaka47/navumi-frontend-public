"use client";

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Info, Search, Users, Map, HeartHandshake, Mail, UserPlus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';
import { useSupportOverlay } from '@/hooks/useSupportOverlay';

function IconShare() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 16V4m0 0l-4 4m4-4l4 4" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export default function AboutPage() {
  const router = useRouter();
  const { authenticated, profile } = useAuth();
  const overlayEnv = useOverlayEnvironment();
  const openSupportOverlay = useSupportOverlay();
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

  return (
    <div className="pb-8" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)' }}>
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-b">
        <div className="max-w-4xl mx-auto px-2 sm:px-4 h-12 flex items-center">
          <button onClick={handleBack} aria-label="Назад" className="p-2 rounded-md hover:bg-gray-100 active:bg-gray-200 mr-2">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="truncate font-semibold text-lg flex-1">О проекте</div>
          <button
            onClick={async () => {
              if (typeof window === 'undefined') return;
              const url = `${window.location.origin}/about`;
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
        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Info className="w-5 h-5 text-blue-600" /> О проекте
          </h2>
          <p>
            Navumi — это место, где активный отдых встречается с удобным поиском. Мы создали сервис,
            вдохновлённый простой идеей: помогать людям находить кэмпы по гибким параметрам — дате,
            локации и виду активности — и связывать их напрямую с организаторами. Параллельно мы даём
            клубам понятные инструменты для размещения анонсов и публикации новостей — без лишних
            барьеров и формы на десять шагов.
          </p>
        </section>

        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Search className="w-5 h-5 text-blue-600" /> Для тех, кто ищет поездку
          </h2>
          <p>
            Хочется на море с утренними пробежками, в горы на трейл, на вело-тур выходного дня или йога-ретрит недалеко от дома?
            Введите пару ключевых слов, выберите город (или просто отметьте точку на карте), укажите даты — и смотрите, что откликается именно вам.
            Мы тщательно продумываем фильтры, чтобы вы могли:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>искать по активностям (бег, лыжи, велосипед, плавание и не только);</li>
            <li>уточнять даты и длительность;</li>
            <li>находить кэмпы в нужной локации;</li>
            <li>сохранять понравившееся и подписываться на организаторов.</li>
          </ul>
          <p>
            Цель — сделать выбор не мучительным поиском, а коротким и радующим маршрутом к тому самому путешествию.
          </p>
        </section>

        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Users className="w-5 h-5 text-blue-600" /> Для клубов и организаторов
          </h2>
          <p>
            Navumi помогает клубам быстро рассказать о своих кэмпах: добавляйте локацию, даты, активности, фото, контакты — и будьте там, где вас ищут.
            Публикуйте новости, делитесь планами и отчётами — формируйте сообщество вокруг своего бренда. Мы стремимся сделать размещение простым,
            а связь с участниками — прямой и тёплой: подписки, уведомления, вопросы — всё в одном месте.
          </p>
        </section>

        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Map className="w-5 h-5 text-blue-600" /> Как это работает
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Поиск — по локации, видам активности и ключевым словам.</li>
            <li>Карта — смотрите кэмпы в нужной точке и рядом.</li>
            <li>Детали — страница кэмпа с описанием, программой и контактами.</li>
            <li>Подписки — следите за клубами и кэмпами, чтобы не пропускать анонсы и скидки.</li>
          </ul>
        </section>

        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <HeartHandshake className="w-5 h-5 text-blue-600" /> Наш подход
          </h2>
          <p>
            Мы верим, что активные поездки — это не только про спорт, но и про людей, впечатления и личные победы. Поэтому в Navumi важно:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Простота интерфейса и понятные шаги для бронирования/связи.</li>
            <li>Прозрачность описаний и условий участия.</li>
            <li>Забота о сообществе: честные отзывы, уважение к участникам и организаторам.</li>
          </ul>
        </section>

        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><UserPlus className="w-5 h-5 text-blue-600" /> Присоединяйтесь</h2>
          <p>
            Если вы давно хотели «выйти из рутины» — самое время. Найдите кэмп по душе и запишитесь: новый опыт начинается с одного клика.
          </p>
          <p>
            Организаторы, мы ждём ваши анонсы: размещайте кэмпы и новости, собирайте участников и растите вместе с аудиторией, которой вы действительно нужны.
          </p>
        </section>

        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Mail className="w-5 h-5 text-blue-600" /> Нам важна ваша поддержка
          </h2>
          <p>
            Проект развивается — и сейчас нам важна любая помощь: обратная связь и идеи по улучшению, тестирование, репосты в соцсетях, рассказы друзьям, партнёрства.
            Напишите нам, если готовы поддержать: от тёплого отзыва до совместных инициатив — всё помогает двигаться вперёд.
          </p>
          <p>
            Наша почта: <a className="text-blue-600 hover:underline" href="mailto:info@navumi.com">info@navumi.com</a>
          </p>
          <p>
            Если у вас возникло желание поддержать проект Navumi материально, мы с радостью будем ждать вас на этой кнопке:
          </p>
          <div className="pt-2">
            <Link
              href="/support"
              className="inline-flex items-center justify-center px-5 py-3 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-700"
              onClick={(event) => {
                event.preventDefault();
                openSupportOverlay();
              }}
            >
              Поддержать проект
            </Link>
          </div>
        </section>

        <section className="text-[15px] leading-6">
          <p>
            Спасибо, что вы с нами. Давайте сделаем кэмпы проще и доступнее для всех!
          </p>
        </section>
      </div>
    </div>
  );
}
