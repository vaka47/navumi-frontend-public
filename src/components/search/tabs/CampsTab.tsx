'use client';

import React from 'react';
import CampSearchResults from '@/components/search/CampSearchResults';

export default function CampsTab({ qs, active = true }: { qs: string; active?: boolean }) {
  return <CampSearchResults qs={qs} active={active} />;
}
