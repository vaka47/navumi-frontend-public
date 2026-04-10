"use client";

import Link from "next/link";
import { Sparkles, HeartHandshake, Info } from "lucide-react";
import { useAboutOverlay } from "@/hooks/useAboutOverlay";
import { useSupportOverlay } from "@/hooks/useSupportOverlay";
import { useResponsibilityOverlay } from "@/hooks/useResponsibilityOverlay";

export default function RecommendationsPage() {
  const openAboutOverlay = useAboutOverlay();
  const openSupportOverlay = useSupportOverlay();
  const openResponsibilityOverlay = useResponsibilityOverlay();

  return (
    <div className="pb-8" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)" }}>
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-b">
        <div className="max-w-4xl mx-auto px-2 sm:px-4 h-12 flex items-center">
          <div className="truncate font-semibold text-lg">Рекомендации</div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-8 text-gray-800">
        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="w-5 h-5 text-blue-600" /> Рекомендации скоро появятся
          </h2>
          <p>
            Скоро здесь появятся рекомендации, основанные на ваших предпочтениях: активности, локации, сохранённых
            кэмпах и профилях клубов. Мы аккуратно собираем сигналы, чтобы предлагать вам именно те поездки, которые
            вас действительно вдохновляют.
          </p>
          <p>Спасибо за то, что вы с нами!</p>
        </section>

        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Info className="w-5 h-5 text-blue-600" /> Пока вы можете
          </h2>
          <p>Пока система рекомендаций готовится к запуску, вы можете:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <Link
                href="/about"
                className="underline underline-offset-2"
                onClick={(event) => {
                  event.preventDefault();
                  openAboutOverlay();
                }}
              >
                почитать о проекте
              </Link>
            </li>
            <li>
              <Link
                href="/support"
                className="font-semibold underline underline-offset-2"
                onClick={(event) => {
                  event.preventDefault();
                  openSupportOverlay();
                }}
              >
                поддержать проект
              </Link>
            </li>
            <li>
              <Link
                href="/responsibility"
                className="underline underline-offset-2"
                onClick={(event) => {
                  event.preventDefault();
                  openResponsibilityOverlay();
                }}
              >
                узнать о нашей ответственности
              </Link>
            </li>
          </ul>
        </section>

        <section className="space-y-3 text-[15px] leading-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <HeartHandshake className="w-5 h-5 text-blue-600" /> Ваш вклад важен
          </h2>
          <p>
            Чем активнее вы пользуетесь Navumi — ищете кэмпы, сохраняете понравившиеся, подписываетесь на клубы —
            тем точнее со временем станут рекомендации. Это поможет быстрее находить поездки, которые подходят
            именно вам.
          </p>
        </section>
      </div>
    </div>
  );
}
