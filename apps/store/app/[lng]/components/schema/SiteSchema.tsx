import { JsonLdScript } from "./JsonLdScript";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, "");
}

function resolveAbsoluteUrl(
  siteUrl: string,
  path: string | undefined,
): string | undefined {
  const value = path?.trim();

  if (!value) {
    return undefined;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return new URL(value.replace(/^\/+/g, ""), `${siteUrl}/`).toString();
}

export function SiteSchema({
  locale,
  logoUrl,
  siteName,
  siteUrl,
}: {
  locale: string;
  logoUrl?: string;
  siteName: string;
  siteUrl: string;
}) {
  const normalizedSiteUrl = trimTrailingSlash(siteUrl);
  const resolvedLogoUrl = resolveAbsoluteUrl(normalizedSiteUrl, logoUrl);
  const schemas = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      ...(resolvedLogoUrl ? { logo: resolvedLogoUrl } : {}),
      name: siteName,
      url: normalizedSiteUrl,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      inLanguage: locale,
      name: siteName,
      potentialAction: {
        "@type": "SearchAction",
        target: `${normalizedSiteUrl}/${locale}/search?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
      url: normalizedSiteUrl,
    },
  ];

  return <JsonLdScript id="site-json-ld" jsonLd={schemas} />;
}
