"use client";

import { isStoreMaintenancePath } from "@/lib/maintenance";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const StorefrontAssistant = dynamic<StorefrontAssistantMountProps>(
  () => import("./StorefrontAssistant").then((mod) => mod.StorefrontAssistant),
  { ssr: false },
);

interface StorefrontAssistantMountProps {
  lng: string;
  showHeroInput?: boolean;
}

function StorefrontAssistantMountContent(props: StorefrontAssistantMountProps) {
  const pathname = usePathname();

  if (
    isStoreMaintenancePath(pathname) ||
    pathname.includes("/auth/") ||
    pathname.endsWith("/cart") ||
    pathname.includes("/checkout")
  ) {
    return null;
  }

  return <StorefrontAssistant {...props} />;
}

export function StorefrontAssistantMount(props: StorefrontAssistantMountProps) {
  return (
    <Suspense fallback={null}>
      <StorefrontAssistantMountContent {...props} />
    </Suspense>
  );
}
