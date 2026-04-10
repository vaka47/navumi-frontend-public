import { useState } from "react";
import Image from "next/image";

const mockCamp = {
    id: 1,
    title: "Серф-кэмп на Бали",
    location: "Бали, Индонезия",
    activity: "Серфинг",
    organizer: "Surf Club Bali",
    startDate: "2025-03-15",
    endDate: "2025-03-22",
    price: 1200,
    currency: "USD",
    isSoldOut: false,
    isHotDeal: true,
    hotDealPrice: 999,
    image: "/camp-example.jpg",
};

export default function CampDetail() {
    const [isSubscribed, setIsSubscribed] = useState(false);

    return (
        <div className="max-w-3xl mx-auto p-4">
            <Image src={mockCamp.image} alt={mockCamp.title} width={800} height={400} className="rounded-lg shadow-md" />

            <h1 className="text-2xl font-bold mt-4">{mockCamp.title}</h1>
            <p className="text-gray-500">{mockCamp.location} • {mockCamp.activity}</p>
            <p className="mt-2"><strong>📅 Даты:</strong> {mockCamp.startDate} – {mockCamp.endDate}</p>
            <p className="mt-2"><strong>👥 Организатор:</strong> {mockCamp.organizer}</p>

            {mockCamp.isSoldOut && <span className="bg-red-600 text-white px-3 py-1 rounded-lg text-sm">🔥 SOLD OUT</span>}
            {mockCamp.isHotDeal && !mockCamp.isSoldOut && (
                <span className="bg-yellow-400 text-black px-3 py-1 rounded-lg text-sm">🔥 Горящее предложение!</span>
            )}

            <p className="mt-4 text-lg font-bold">
                💰 {mockCamp.isHotDeal ? (
                <>
                    <del className="text-gray-500">{mockCamp.price} {mockCamp.currency}</del> {mockCamp.hotDealPrice} {mockCamp.currency}
                </>
            ) : (
                `${mockCamp.price} ${mockCamp.currency}`
            )}
            </p>

            <button
                onClick={() => setIsSubscribed(!isSubscribed)}
                className={`mt-4 px-6 py-2 text-white rounded-lg ${
                    isSubscribed ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"
                }`}
            >
                {isSubscribed ? "✅ Подписаны" : "🔔 Подписаться"}
            </button>
        </div>
    );
}