import type { Metadata } from "next";
import SearchLandingShell from "../../SearchLandingShell";
import {
  buildSearchBreadcrumbs,
  buildSearchLandingContent,
  buildSearchLandingMetadata,
  buildSearchQueryString,
  buildSearchWebSiteStructuredData,
  resolveActivityBySlug,
} from "@/lib/seo/searchLanding";

type RouteParams = { activity: string };

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { activity: activitySlug } = await params;
  const activity = await resolveActivityBySlug(activitySlug);
  const activityName = activity?.name || "";
  return buildSearchLandingMetadata({
    pathname: `/search/activity/${activitySlug}`,
    activity: activityName || activitySlug,
  });
}

export default async function ActivityLandingPage({ params }: { params: Promise<RouteParams> }) {
  const { activity: activitySlug } = await params;
  const activity = await resolveActivityBySlug(activitySlug);
  const activityName = activity?.name || activitySlug;
  const queryString = activity?.id ? buildSearchQueryString({ activityId: activity.id }) : "";
  const { title, description } = buildSearchLandingContent({ activity: activityName });
  const breadcrumbs = buildSearchBreadcrumbs({
    activityLabel: activityName,
    activitySlug,
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
