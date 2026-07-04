"use client";

import { SocialProvider } from "@/context/social";

export default function SocialLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SocialProvider>{children}</SocialProvider>;
}
