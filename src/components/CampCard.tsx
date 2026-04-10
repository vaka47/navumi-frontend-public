import NextImage from "next/image";
import NextLink from "next/link";
import { getBrowserApiBase } from "@/lib/apiBase";

interface CampProps {
    camp_number?: number;
    id?: number;
    title: string;
    location: string;
    price: number;
    currency: string;
    imageUrl?: string;
    organizer: string;
    activities: string[];
}

export default function CampCard({
                                     camp_number,
                                     id,
                                     title,
                                     location,
                                     price,
                                     currency,
                                     imageUrl,
                                     organizer,
                                     activities,
                                 }: CampProps) {
    const API_BASE = getBrowserApiBase();

    const actualCampNumber = camp_number ?? id;

    if (!actualCampNumber) {
        console.error("❌ Ошибка: `camp_number` и `id` отсутствуют в объекте", { title, organizer });
        return null;
    }

    return (
        <NextLink
            href={`/${organizer}/camp/${actualCampNumber}`}
            className="block bg-white rounded-xl overflow-hidden shadow hover:shadow-lg transition-all duration-300"
        >
            {/* 🔍 Изображение */}
            {imageUrl ? (
                <div className="relative w-full h-48 sm:h-56 md:h-64">
                    <NextImage
                        src={imageUrl.startsWith("http") ? imageUrl : `${API_BASE}${imageUrl}`}
                        alt={title}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover"
                        priority={false}
                    />
                </div>
            ) : (
                <div className="w-full h-48 sm:h-56 md:h-64 bg-gray-200 flex items-center justify-center text-gray-500 text-sm">
                    ❌ Нет фото
                </div>
            )}

            {/* 📌 Контент */}
            <div className="p-4 space-y-1">
                <h2 className="text-lg sm:text-xl font-semibold truncate">{title}</h2>
                <p className="text-sm sm:text-base text-gray-500 truncate">📍 {location}</p>
                <p className="text-sm sm:text-base text-blue-600 font-semibold">
                    💰 {price} {currency}
                </p>
                <p className="text-xs sm:text-sm text-gray-400 line-clamp-2">{activities?.join(", ")}</p>
            </div>
        </NextLink>
    );
}
