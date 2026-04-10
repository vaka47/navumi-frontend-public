import type { Metadata } from "next";
import SearchLandingShell from "./SearchLandingShell";
import { buildSearchBreadcrumbs, buildSearchWebSiteStructuredData } from "@/lib/seo/searchLanding";

export const metadata: Metadata = {
    title: "Поиск кэмпов и клубов | Navumi",
    description: "Поиск спортивных кэмпов, клубов и туров по активности и локации.",
    alternates: { canonical: "/search" },
};

export default function Page() {
    const breadcrumbs = buildSearchBreadcrumbs({});
    const webSite = buildSearchWebSiteStructuredData();
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(webSite) }}
            />
            <SearchLandingShell
                heading="Поиск кэмпов и клубов"
                description="Подбирайте кэмпы, туры и клубы по активностям, локациям и датам."
            />
        </>
    );
}
