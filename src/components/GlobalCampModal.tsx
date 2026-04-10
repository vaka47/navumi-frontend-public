"use client";

import { useMobileCampModal } from "@/context/MobileCampModalContext";
import CreateCampModal from "@/components/camp/CreateCampModal";
import MobileCreateCampFullModal from "@/components/camp/mobile/MobileCreateCampFullModal";
import { useEffect, useState } from "react";

export default function GlobalCampModal() {
    const { open, setOpen } = useMobileCampModal();
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        // определяем ширину на клиенте
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
        };
        handleResize(); // сразу установить
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    if (!open) return null;

    return isMobile ? (
        <MobileCreateCampFullModal />
    ) : (
        <CreateCampModal open={open} onClose={() => setOpen(false)} />
    );

}
