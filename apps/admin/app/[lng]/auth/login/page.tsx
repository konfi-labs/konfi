import i18next from "@/i18n/i18next";
import {
  ADMIN_AUTH_ERROR_COOKIE_NAME,
  normalizeAdminAuthErrorReason,
} from "@/lib/auth-errors";
import { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import LoginPage from "./login-page";

type LoginPageSearchParams = {
  authError?: string | string[];
};

export default function Page({
  searchParams,
}: {
  searchParams: Promise<LoginPageSearchParams>;
}) {
  return (
    <Suspense fallback={<LoginPage />}>
      <LoginPageWithAuthError searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginPageWithAuthError({
  searchParams,
}: {
  searchParams: Promise<LoginPageSearchParams>;
}) {
  const { authError } = await searchParams;
  const cookieStore = await cookies();
  const cookieAuthError = normalizeAdminAuthErrorReason(
    cookieStore.get(ADMIN_AUTH_ERROR_COOKIE_NAME)?.value,
  );

  return (
    <LoginPage
      authError={normalizeAdminAuthErrorReason(authError) ?? cookieAuthError}
    />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("account.login"),
  };
}
