"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, Shield, AlertTriangle, Info, Mail } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useOverlayEnvironment } from "@/context/OverlayEnvironmentContext";

export default function ResponsibilityPage() {
  const router = useRouter();
  const { authenticated, profile } = useAuth();
  const overlayEnv = useOverlayEnvironment();
  const fallback = authenticated && profile?.username ? `/${profile.username}` : "/search";

  const handleBack = () => {
    if (overlayEnv.isOverlay) {
      overlayEnv.close();
      return;
    }
    try {
      router.replace(fallback);
    } catch {
      if (typeof window !== "undefined") window.location.assign(fallback);
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
    <div className="pb-8" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)" }}>
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-b">
        <div className="max-w-4xl mx-auto px-2 sm:px-4 h-12 flex items-center">
          <button
            onClick={handleBack}
            aria-label="Назад"
            className="p-2 rounded-md hover:bg-gray-100 active:bg-gray-200 mr-2"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="truncate font-semibold text-lg flex-1">Ответственность</div>
          <button
            onClick={async () => {
              if (typeof window === 'undefined') return;
              const url = `${window.location.origin}/responsibility`;
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
            <Shield className="w-5 h-5 text-blue-600" /> Ответственность сервиса
          </h2>
          <p>
            Navumi — это сервис поиска спортивных кэмпов. Мы помогаем вам находить предложения по дате,
            локации, активности и другим параметрам, но не являемся организатором кэмпов и не оказываем
            туристические или тренерские услуги.
          </p>
          <p>
            Регистрация клубов и размещение анонсов кэмпов на данный момент происходит в свободном порядке.
            Информация о программах, условиях участия, стоимости и наличии мест публикуется самими клубами.
            Navumi не гарантирует точность этих данных и не несёт ответственности за действия и решения
            третьих лиц.
          </p>
        </section>

        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <AlertTriangle className="w-5 h-5 text-blue-600" /> Что мы не гарантируем
          </h2>
          <p>Navumi не несёт ответственности за:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>качество оказания услуг клубами и тренерами;</li>
            <li>отмену, перенос или изменение условий кэмпов;</li>
            <li>возможные мошеннические действия со стороны третьих лиц.</li>
          </ul>
          <p>
            Все договорённости по участию в кэмпе вы заключаете напрямую с клубом. Мы лишь перенаправляем вас
            по тем контактам (телефон, сайт, мессенджеры, соцсети), которые организатор указал при регистрации
            или создании анонса.
          </p>
        </section>

        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Info className="w-5 h-5 text-blue-600" /> Как действовать безопасно
          </h2>
          <p>Пожалуйста, будьте внимательны при выборе кэмпа и организатора:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>проверяйте сайт и соцсети клуба;</li>
            <li>уточняйте официальные реквизиты и договор при необходимости;</li>
            <li>не переводите деньги, если у вас есть сомнения в надёжности организатора.</li>
          </ul>
        </section>

        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Mail className="w-5 h-5 text-blue-600" /> Если заметили что-то подозрительное
          </h2>
          <p>
            Если вы заметили подозрительный аккаунт или кэмп, сообщите нам через раздел «Контакты» или форму
            жалобы на странице клуба/кэмпа. Это поможет сделать Navumi безопаснее для всех.
          </p>
        </section>
      </div>
    </div>
  );
}
