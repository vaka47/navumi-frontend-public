'use client';

import { ProfileContext } from '@/components/profile/ProfileContext';
import UserProfilePage, { type Profile } from '@/components/profile/UserProfilePage';

type ProfilePageClientProps = {
  username: string;
  initialProfile?: Profile | null;
};

export default function ProfilePageClient({ username, initialProfile }: ProfilePageClientProps) {
  return (
    <ProfileContext.Provider value={{ username }}>
      <UserProfilePage key={username} initialProfile={initialProfile ?? null} />
    </ProfileContext.Provider>
  );
}
