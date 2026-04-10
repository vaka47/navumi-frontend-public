import type { Metadata } from "next";
import SearchLandingShell from "../../SearchLandingShell";
import {
  buildSearchBreadcrumbs,
  buildSearchLandingContent,
  buildSearchLandingMetadata,
  buildSearchQueryString,
  buildSearchWebSiteStructuredData,
  formatLocationFromSlug,
} from "@/lib/seo/searchLanding";

type RouteParams = { location: string };

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { location: locationSlug } = await params;
  const locationName = formatLocationFromSlug(locationSlug);
  return buildSearchLandingMetadata({
    pathname: `/search/location/${locationSlug}`,
    location: locationName || locationSlug,
  });
}

export default async function LocationLandingPage({ params }: { params: Promise<RouteParams> }) {
  const { location: locationSlug } = await params;
  const locationName = formatLocationFromSlug(locationSlug) || locationSlug;
  const queryString = buildSearchQueryString({ location: locationName });
  const { title, description } = buildSearchLandingContent({ location: locationName });
  const breadcrumbs = buildSearchBreadcrumbs({
    locationLabel: locationName,
    locationSlug,
  });
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
      <SearchLandingShell heading={title} description={description} queryString={queryString} />
    </>
  );
}
