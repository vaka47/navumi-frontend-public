"use client";

// Intercepted modal route: render the same page inside the `@modal` slot,
// but auto-hide when the URL no longer matches a profile post route.
import { usePathname, useParams } from 'next/navigation';
import PostPageClient from '../../../../[username]/post/[postId]/PostPageClient';

export default function InterceptedPostModal() {
  const pathname = usePathname();
  const params = useParams<{ username: string; postId: string }>();
  const isPost = /^\/[^/]+\/post\/[^/]+\/?$/.test(pathname || '');
  if (!isPost) return null; // если ушли на другой урл (например, кэмп) — закрываем модалку
  if (!params?.username || !params?.postId) return null;
  return <PostPageClient username={params.username} postId={params.postId} />;
}
