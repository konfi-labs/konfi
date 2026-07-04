import Layout from "@/components/layout/Layout";
import { languages } from "@/i18n/settings";
import { getTenantContextForRequest } from "@/lib/firebase/serverApp";
import { fonts } from "@/theme/fonts";
import { Metadata } from "next";
import { headers } from "next/headers";
import Script from "next/script";
import { Suspense } from "react";
import { unstable_serialize } from "swr";
import "katex/dist/katex.min.css";
import { Providers } from "./providers";
import { prefetchAdminConfigFlags } from "@/actions";
import { getInpostGeowidgetToken } from "@/lib/inpost/integration-config";

export async function generateStaticParams() {
  return languages.map((lng: string) => ({ lng }));
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lng: string }>;
}) {
  const { lng } = await params;

  return (
    <html
      lang={lng}
      translate="no"
      className={`${fonts.sans.variable} ${fonts.mono.variable}`}
      suppressHydrationWarning={true}
    >
      <body>
        <Suspense fallback={null}>
          <WebpackNonceScript />
        </Suspense>
        <Suspense fallback={null}>
          <TenantScopedProviders lng={lng}>{children}</TenantScopedProviders>
        </Suspense>
      </body>
    </html>
  );
}

async function TenantScopedProviders({
  children,
  lng,
}: {
  children: React.ReactNode;
  lng: string;
}) {
  const tenantContextPromise = getTenantContextForRequest();

  const tenantContext = await tenantContextPromise;
  const configFlagsPromise = prefetchAdminConfigFlags();
  const inpostGeowidgetTokenPromise = getInpostGeowidgetToken(tenantContext);
  let swrFallback: Record<string, unknown> = {};
  try {
    const configFlags = await configFlagsPromise;
    swrFallback = {
      "admin-config-flags": configFlags,
      [unstable_serialize([
        "admin-config-flags",
        tenantContext.deploymentMode,
        tenantContext.requireTenantId,
        tenantContext.tenantId ?? "",
      ])]: configFlags,
    };
  } catch {
    // Prefetch failed — SWR will fetch client-side
  }
  const inpostGeowidgetToken = await inpostGeowidgetTokenPromise;

  return (
    <Providers
      inpostGeowidgetToken={inpostGeowidgetToken}
      swrFallback={swrFallback}
      tenantContext={tenantContext}
    >
      <Layout lng={lng}>{children}</Layout>
    </Providers>
  );
}

async function WebpackNonceScript() {
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") || "";

  return (
    <Script
      strategy="afterInteractive"
      id="nonce-script"
      nonce={nonce}
      dangerouslySetInnerHTML={{
        __html: `__webpack_nonce__ = ${JSON.stringify(nonce)}`,
      }}
    />
  );
}

export const metadata: Metadata = {
  title: {
    template: "%s | Konfi",
    default: "Konfi",
  },
};
