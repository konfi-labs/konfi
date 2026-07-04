import Layout from "@/components/layout/Layout";
import { languages } from "@/i18n/settings";
import {
  getAdminDb,
  getStoreRuntimeConfigForRequest,
  shouldSilentlyFallbackFromOptionalStaticDataError,
  shouldDeferStorefrontDataDuringProductionBuild,
  shouldSkipStaticDataDuringCiBuild,
} from "@/lib/firebase/serverApp";
import {
  isStoreMaintenancePath,
  shouldRedirectToStoreMaintenance,
} from "@/lib/maintenance";
import {
  getRuntimeStoreDisplayName,
  resolveCanonicalStorefrontRedirect,
} from "@/lib/runtime-config";
import {
  getCachedStorefrontSharing,
  getCachedStorefrontTheme,
} from "@/lib/storefront-editor/content";
import { applyStorefrontSharingMetadata } from "@/lib/storefront-editor/metadata-assets";
import { getStorefrontEditorSessionForRequest } from "@/lib/storefront-editor/session";
import { storefrontThemeCssVariables } from "@/lib/storefront-editor/theme-vars";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";
import { fonts } from "@/theme/fonts";
import { tenantFirestorePaths } from "@konfi/firebase";
import {
  DEFAULT_LOCALE,
  Locale,
  type CurrencySettings,
  type dbMetadata,
} from "@konfi/types";
import {
  CURRENCIES_SETTINGS_DOC_ID,
  serializeFirestore,
  T_STORE_MAIN_LAYOUT,
} from "@konfi/utils";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { Metadata, type Route } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import Script from "next/script";
import { Suspense, type CSSProperties } from "react";
import { StorefrontAssistantMount } from "./components/assistant/StorefrontAssistantMount";
import { StoreRuntimeShellFallback } from "./components/layout/StoreShellFallback";
import { SiteSchema } from "./components/schema/SiteSchema";
import DeferredGTM from "./DeferredGTM";
import { Providers } from "./providers";
import { StoreChakraProvider } from "./store-chakra-provider";

export const instant = true;

function storefrontThemeStyle(
  theme: Awaited<ReturnType<typeof getCachedStorefrontTheme>>,
): CSSProperties {
  return storefrontThemeCssVariables(theme) as CSSProperties;
}

async function getCachedLayoutMetadata(lng: Locale, channelId: string) {
  "use cache";
  cacheTag(
    `pageMetadata-${T_STORE_MAIN_LAYOUT}`,
    `pageMetadata-${T_STORE_MAIN_LAYOUT}-${lng}`,
    `pageMetadata-${T_STORE_MAIN_LAYOUT}-${channelId}`,
  );
  cacheLife("max");

  if (shouldSkipStaticDataDuringCiBuild()) {
    return {
      title: "Drukarnia Online",
      description: "",
      keywords: "",
    };
  }

  const metadataPath =
    lng === DEFAULT_LOCALE
      ? `channels/${channelId}/metadata/${T_STORE_MAIN_LAYOUT}`
      : `channels/${channelId}/metadata/${T_STORE_MAIN_LAYOUT}/translations/${lng}`;
  let metadataResult: Pick<dbMetadata, "description" | "keywords" | "title"> = {
    title: "",
    description: "",
    keywords: "",
  };

  try {
    const metadataSnapshot = await getAdminDb().doc(metadataPath).get();
    metadataResult = metadataSnapshot.exists
      ? (metadataSnapshot.data() as dbMetadata)
      : metadataResult;
  } catch (error) {
    if (!shouldSilentlyFallbackFromOptionalStaticDataError(error)) {
      console.error("Error loading store layout metadata:", error);
    }
  }

  return {
    title: metadataResult.title,
    description: metadataResult.description,
    keywords: metadataResult.keywords,
  };
}

async function getCachedCurrencySettings(
  channelId: string,
  tenantContext: TenantContext,
) {
  "use cache";
  cacheTag("storeCurrencySettings", channelId);
  cacheLife("max");

  if (shouldSkipStaticDataDuringCiBuild()) {
    return undefined;
  }

  const settingsPath =
    tenantContext.deploymentMode === "saas" || tenantContext.requireTenantId
      ? tenantFirestorePaths.settingsDoc(
          tenantContext,
          channelId,
          CURRENCIES_SETTINGS_DOC_ID,
        )
      : `channels/${channelId}/settings/${CURRENCIES_SETTINGS_DOC_ID}`;
  let currencySettings: CurrencySettings | undefined;

  try {
    const currencySettingsSnapshot = await getAdminDb().doc(settingsPath).get();
    currencySettings = currencySettingsSnapshot.exists
      ? (currencySettingsSnapshot.data() as CurrencySettings)
      : undefined;
  } catch (error) {
    if (!shouldSilentlyFallbackFromOptionalStaticDataError(error)) {
      console.error("Error loading storefront currency settings:", error);
    }
    return undefined;
  }

  return currencySettings
    ? (serializeFirestore(currencySettings) as CurrencySettings)
    : undefined;
}

export async function generateStaticParams() {
  if (shouldSkipStaticDataDuringCiBuild()) {
    return [{ lng: languages[0] }];
  }

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
      className={`${fonts.montserrat.variable} ${fonts.unbounded.variable}`}
      suppressHydrationWarning={true}
    >
      <body>
        <StoreChakraProvider>
          <Suspense fallback={<StoreRuntimeShellFallback />}>
            <StoreRuntimeShell lng={lng}>{children}</StoreRuntimeShell>
          </Suspense>
          <SpeedInsights />
        </StoreChakraProvider>
      </body>
    </html>
  );
}

async function StoreRuntimeShell({
  children,
  lng,
}: {
  children: React.ReactNode;
  lng: string;
}) {
  if (shouldDeferStorefrontDataDuringProductionBuild()) {
    await connection();
  }

  const runtimeConfig = await getStoreRuntimeConfigForRequest();

  if (!runtimeConfig) {
    notFound();
  }

  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") || "";
  const canonicalRedirect = resolveCanonicalStorefrontRedirect({
    requestTarget:
      requestHeaders.get("x-konfi-request-target") ??
      requestHeaders.get("x-konfi-pathname"),
    runtimeConfig,
  });

  if (canonicalRedirect) {
    redirect(canonicalRedirect as Route);
  }

  const requestPathname = requestHeaders.get("x-konfi-pathname");
  const pathname = runtimeConfig.maintenance.enabled ? requestPathname : null;
  const editorSession = runtimeConfig.maintenance.enabled
    ? await getStorefrontEditorSessionForRequest(runtimeConfig).catch(
        (error) => {
          console.error(error);
          return null;
        },
      )
    : null;

  if (
    shouldRedirectToStoreMaintenance({
      hasEditorSession: Boolean(editorSession),
      pathname,
      runtimeConfig,
    })
  ) {
    redirect(`/${lng}/maintenance`);
  }

  const currencySettings = await getCachedCurrencySettings(
    runtimeConfig.channelId,
    runtimeConfig.tenantContext,
  );
  const storefrontTheme = await getCachedStorefrontTheme(
    runtimeConfig.channelId,
  );
  const tenantScopedBranding = isSharedSaasTenantRuntime(
    runtimeConfig.tenantContext,
  );
  const schemaLogoUrl =
    storefrontTheme.logoUrl ??
    (tenantScopedBranding ? undefined : "/assets/logo.png");
  const googleTagManagerId = runtimeConfig.google?.tagManagerEnabled
    ? runtimeConfig.google.tagManagerId
    : undefined;

  return (
    <>
      <NoncedScripts nonce={nonce} />
      <SiteSchema
        locale={lng}
        logoUrl={schemaLogoUrl}
        siteName={getRuntimeStoreDisplayName(
          runtimeConfig,
          tenantScopedBranding ? undefined : process.env.NEXT_PUBLIC_STORE_NAME,
        )}
        siteUrl={runtimeConfig.storeBaseUrl}
      />
      <div style={storefrontThemeStyle(storefrontTheme)}>
        <Providers
          runtimeConfig={runtimeConfig}
          currencySettings={currencySettings}
        >
          <Layout lng={lng} logoUrl={storefrontTheme.logoUrl}>
            {children}
          </Layout>
          {!isStoreMaintenancePath(requestPathname) && (
            <StorefrontAssistantMount lng={lng} showHeroInput={false} />
          )}
        </Providers>
        {process.env.NODE_ENV === "production" && googleTagManagerId && (
          <DeferredGTM gtmId={googleTagManagerId} />
        )}
      </div>
    </>
  );
}

function NoncedScripts({ nonce }: { nonce: string }) {
  return (
    <>
      <Script
        strategy="afterInteractive"
        id="nonce-script"
        nonce={nonce}
        dangerouslySetInnerHTML={{
          __html: `__webpack_nonce__ = ${JSON.stringify(nonce)}`,
        }}
      />
      {process.env.NODE_ENV === "production" && (
        <Script
          id="google-consent-init"
          nonce={nonce}
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                window.dataLayer = window.dataLayer || [];
                window.gtag = function(){dataLayer.push(arguments);};

                // Set default consent before GTM loads
                gtag("consent", "default", {
                  ad_storage: "denied",
                  ad_user_data: "denied",
                  ad_personalization: "denied",
                  personalization_storage: "denied",
                  analytics_storage: "denied",
                  functionality_storage: "denied",
                  security_storage: "denied",
                });
              })();
            `,
          }}
        />
      )}
    </>
  );
}

type MetadataParams = Promise<{ lng: string }>;

export async function generateMetadata({
  params,
}: {
  params: MetadataParams;
}): Promise<Metadata> {
  if (shouldDeferStorefrontDataDuringProductionBuild()) {
    await connection();
  }

  const { lng } = await params;
  const runtimeConfig = await getStoreRuntimeConfigForRequest();

  if (!runtimeConfig) {
    return {
      robots: {
        follow: false,
        index: false,
      },
      title: "Store not found",
    };
  }

  const [metadataResult, sharingSettings] = await Promise.all([
    getCachedLayoutMetadata(lng as Locale, runtimeConfig.channelId),
    getCachedStorefrontSharing(runtimeConfig.channelId),
  ]);

  return applyStorefrontSharingMetadata({
    metadata: {
      metadataBase: new URL(runtimeConfig.storeBaseUrl),
      alternates: {
        canonical: `/`,
        languages: Object.fromEntries(
          languages.map((lang) => [lang, `/${lang}`]),
        ),
      },
      title: {
        template: metadataResult.title,
        default: "Drukarnia Online",
      },
      description: metadataResult.description,
      keywords: metadataResult.keywords,
      openGraph: {
        title: {
          template: metadataResult.title,
          default: "Drukarnia Online",
        },
        description: metadataResult.description,
      },
      twitter: {
        title: {
          template: metadataResult.title,
          default: "Drukarnia Online",
        },
        description: metadataResult.description,
      },
    },
    sharing: sharingSettings,
    withIcons: true,
  });
}
