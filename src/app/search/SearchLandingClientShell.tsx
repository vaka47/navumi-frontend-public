"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import SearchLandingInit from "./SearchLandingInit";

const SearchPage = dynamic(() => import("./SearchPage"), { ssr: false });

export default function SearchLandingClientShell({ queryString }: { queryString?: string }) {
  return (
    <>
      {queryString ? <SearchLandingInit queryString={queryString} /> : null}
      <Suspense fallback={<div>🔄 Загрузка поиска...</div>}>
        <SearchPage />
      </Suspense>
    </>
  );
}
