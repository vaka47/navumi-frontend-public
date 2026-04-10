import type { Metadata } from "next";
import SearchLandingShell from "../../../../SearchLandingShell";
import {
  buildSearchBreadcrumbs,
  buildSearchLandingContent,
  buildSearchLandingMetadata,
  buildSearchQueryString,
  buildSearchWebSiteStructuredData,
  formatLocationFromSlug,
  resolveActivityBySlug,
} from "@/lib/seo/searchLanding";

type RouteParams = { activity: string; location: string };

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { activity: activitySlug, location: locationSlug } = await params;
  const activity = await resolveActivityBySlug(activitySlug);
  const activityName = activity?.name || activitySlug;
  const locationName = formatLocationFromSlug(locationSlug) || locationSlug;
  return buildSearchLandingMetadata({
    pathname: `/search/activity/${activitySlug}/location/${locationSlug}`,
    activity: activityName,
    location: locationName,
  });
}

export default async function ActivityLocationLandingPage({ params }: { params: Promise<RouteParams> }) {
  const { activity: activitySlug, location: locationSlug } = await params;
  const activity = await resolveActivityBySlug(activitySlug);
  const activityName = activity?.name || activitySlug;
  const locationName = formatLocationFromSlug(locationSlug) || locationSlug;
  const queryString = activity?.id
    ? buildSearchQueryString({ activityId: activity.id, location: locationName })
    : buildSearchQueryString({ location: locationName });
  const { title, description } = buildSearchLandingContent({ activity: activityName, location: locationName });
  const breadcrumbs = buildSearchBreadcrumbs({
    activityLabel: activityName,
    activitySlug,
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
