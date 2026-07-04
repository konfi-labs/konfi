"use client";

import { UserAuthGuard } from "app/[lng]/components/Guard";

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <UserAuthGuard>{children}</UserAuthGuard>;
}
