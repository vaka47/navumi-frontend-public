"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const canonicalize = (value: string) => {
  if (!value) return "";
  const params = new URLSearchParams(value);
  const pairs: Array<[string, string]> = [];
  params.forEach((val, key) => pairs.push([key, val]));
  pairs.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  return pairs.map(([k, v]) => `${k}=${v}`).join("&");
};

export default function SearchLandingInit({ queryString }: { queryString: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const appliedRef = useRef(false);

  useEffect(() => {
    if (appliedRef.current) return;
    if (!queryString) {
      appliedRef.current = true;
      return;
    }
    const current = canonicalize(searchParams?.toString() || "");
    const desired = canonicalize(queryString);
    if (current === desired) {
      appliedRef.current = true;
      return;
    }
    if (current) {
      appliedRef.current = true;
      return;
    }
    const nextUrl = `${pathname}?${queryString}`;
    router.replace(nextUrl, { scroll: false });
    appliedRef.current = true;
  }, [pathname, queryString, router, searchParams]);

  return null;
}
