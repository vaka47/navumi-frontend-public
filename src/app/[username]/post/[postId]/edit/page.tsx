// src/app/[username]/post/[postId]/edit/page.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useParams } from 'next/navigation';
import { CreatePostProfileMobilePageImpl } from '@/components/post/CreatePostProfileMobilePage';

export default function EditPostMobilePage() {
  const params = useParams<{ username: string; postId: string }>();
  const postIdNum = Number(params?.postId || 0);
  return (
    <CreatePostProfileMobilePageImpl
      mode="edit"
      postId={Number.isFinite(postIdNum) && postIdNum > 0 ? postIdNum : undefined}
    />
  );
}
