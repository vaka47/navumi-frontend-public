import FollowListPage from '@/components/profile/FollowListPage';

type RouteParams = { username: string };

export default async function Page({ params }: { params: Promise<RouteParams> }) {
  const { username } = await params;
  return <FollowListPage username={username} mode="following" />;
}

