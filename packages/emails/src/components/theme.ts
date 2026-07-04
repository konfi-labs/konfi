export type EmailLocale = "en" | "pl";
export type EmailBrand = "admin" | "store";

interface EmailBranding {
  fallbackLabel: string | undefined;
  logoAlt: string;
  logoHeight: number;
  logoMarginBottom?: string;
  logoUrl: string | undefined;
  logoWidth: number;
}

const EMAIL_BODY_FALLBACK =
  '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif';
const EMAIL_HEADING_FALLBACK =
  '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif';

interface EmailTypography {
  bodyFontFamily: string;
  fontFaceCss: string;
  headingFontFamily: string;
}

const getPublicEnv = (key: string): string | undefined => {
  const value = process.env[key]?.trim();

  return value ? value : undefined;
};

export function getPublicCompanyDetails() {
  return {
    city: getPublicEnv("NEXT_PUBLIC_COMPANY_CITY"),
    companyName: getPublicEnv("NEXT_PUBLIC_LEGAL_COMPANY_NAME"),
    postalCode: getPublicEnv("NEXT_PUBLIC_COMPANY_POSTAL_CODE"),
    streetAddress: getPublicEnv("NEXT_PUBLIC_COMPANY_STREET_ADDRESS"),
    vatId: getPublicEnv("NEXT_PUBLIC_VAT_ID"),
  };
}

function normalizePublicBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/u, "");

  if (/^https?:\/\//iu.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed.replace(/^\/+/u, "")}`;
}

function resolvePublicUrl(
  value: string | undefined,
  options?: {
    baseUrl?: string;
  },
): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^https?:\/\//iu.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("/")) {
    return options?.baseUrl
      ? new URL(
          trimmed,
          `${normalizePublicBaseUrl(options.baseUrl)}/`,
        ).toString()
      : undefined;
  }

  return `https://${trimmed.replace(/^\/+/u, "")}`;
}

export function buildPublicAssetUrl(
  baseUrl: string | undefined,
  pathname: string,
): string | undefined {
  if (!baseUrl) {
    return undefined;
  }

  return new URL(pathname, `${normalizePublicBaseUrl(baseUrl)}/`).toString();
}

export function getEmailBranding(brand: EmailBrand): EmailBranding {
  const { companyName } = getPublicCompanyDetails();
  const shortCompanyName = getPublicEnv("NEXT_PUBLIC_SHORT_COMPANY_NAME");
  const adminBaseUrl =
    process.env.ADMIN_URL ?? process.env.NEXT_PUBLIC_ADMIN_URL;
  const storeBaseUrl =
    process.env.STORE_URL ?? process.env.NEXT_PUBLIC_STORE_URL;

  if (brand === "admin") {
    return {
      fallbackLabel: "Konfi",
      logoAlt: "Konfi",
      logoHeight: 28,
      logoMarginBottom: "24px",
      logoUrl:
        resolvePublicUrl("/assets/logo.png", {
          baseUrl: adminBaseUrl,
        }) ?? buildPublicAssetUrl(adminBaseUrl, "/icon3.png"),
      logoWidth: 81,
    };
  }

  const fallbackLabel = shortCompanyName ?? companyName;

  return {
    fallbackLabel,
    logoAlt: fallbackLabel ?? "Store logo",
    logoHeight: 48,
    logoUrl:
      resolvePublicUrl("/assets/logo.png", {
        baseUrl: storeBaseUrl,
      }) ?? buildPublicAssetUrl(storeBaseUrl, "/assets/icon3.png"),
    logoWidth: 96,
  };
}

export function getCompanyFooterLines(locale: EmailLocale): string[] {
  const { city, companyName, postalCode, streetAddress, vatId } =
    getPublicCompanyDetails();

  const identity = [
    companyName,
    vatId ? `${locale === "pl" ? "NIP" : "VAT ID"}: ${vatId}` : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" | ");

  const cityLine = [postalCode, city]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  return [identity || undefined, streetAddress, cityLine || undefined].filter(
    (value): value is string => Boolean(value),
  );
}

export function getEmailTypography(brand: EmailBrand): EmailTypography {
  if (brand === "admin") {
    return {
      bodyFontFamily: `"Geist", ${EMAIL_BODY_FALLBACK}`,
      headingFontFamily: `"Geist", ${EMAIL_HEADING_FALLBACK}`,
      fontFaceCss: `
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap');
      `,
    };
  }

  return {
    bodyFontFamily: `"Montserrat", ${EMAIL_BODY_FALLBACK}`,
    headingFontFamily: `"Unbounded", ${EMAIL_HEADING_FALLBACK}`,
    fontFaceCss: `
      @font-face {
        font-family: 'Montserrat';
        font-style: normal;
        font-weight: 400;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtr6Ew-.ttf) format('truetype');
      }
      @font-face {
        font-family: 'Montserrat';
        font-style: normal;
        font-weight: 500;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtZ6Ew-.ttf) format('truetype');
      }
      @font-face {
        font-family: 'Montserrat';
        font-style: normal;
        font-weight: 600;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCu170w-.ttf) format('truetype');
      }
      @font-face {
        font-family: 'Montserrat';
        font-style: normal;
        font-weight: 700;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCuM70w-.ttf) format('truetype');
      }
      @font-face {
        font-family: 'Unbounded';
        font-style: normal;
        font-weight: 700;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/unbounded/v12/Yq6F-LOTXCb04q32xlpat-6uR42XTqtG6__2040.ttf) format('truetype');
      }
    `,
  };
}

export interface EmailColors {
  border: string;
  page: string;
  primary: string;
  primaryDark: string;
  primarySoft: string;
  surface: string;
  surfaceSubtle: string;
  text: string;
  textMuted: string;
  textSubtle: string;
}

const storeEmailColors = {
  border: "#e7e5e4",
  page: "#f5f5f4",
  primary: "#1b76ff",
  primaryDark: "#005fec",
  primarySoft: "#eef5ff",
  surface: "#ffffff",
  surfaceSubtle: "#fafaf9",
  text: "#1c1917",
  textMuted: "#57534e",
  textSubtle: "#78716c",
} as const satisfies EmailColors;

// Admin palette mirrors the neutral near-black "OpenAI" feel of the admin app.
const adminEmailColors = {
  border: "#e7e5e4",
  page: "#fafaf9",
  primary: "#0a0a0a",
  primaryDark: "#000000",
  primarySoft: "#f5f5f4",
  surface: "#ffffff",
  surfaceSubtle: "#fafaf9",
  text: "#0a0a0a",
  textMuted: "#525252",
  textSubtle: "#737373",
} as const satisfies EmailColors;

export function getEmailColors(brand: EmailBrand): EmailColors {
  return brand === "admin" ? adminEmailColors : storeEmailColors;
}

export const emailColors = storeEmailColors;

export interface SharedStyles {
  badge: React.CSSProperties;
  button: React.CSSProperties;
  ctaSection: React.CSSProperties;
  divider: React.CSSProperties;
  heading: React.CSSProperties;
  itemDescription: React.CSSProperties;
  itemImage: React.CSSProperties;
  itemImageColumn: React.CSSProperties;
  itemPanel: React.CSSProperties;
  itemQuantity: React.CSSProperties;
  itemTextColumn: React.CSSProperties;
  itemTitle: React.CSSProperties;
  panel: React.CSSProperties;
  paragraph: React.CSSProperties;
  wrappedParagraph: React.CSSProperties;
  statLabel: React.CSSProperties;
  statRow: React.CSSProperties;
  statValue: React.CSSProperties;
}

export function getSharedStyles(brand: EmailBrand): SharedStyles {
  const colors = getEmailColors(brand);
  const isAdmin = brand === "admin";

  // Admin emails use heavier rounding to match the OpenAI-style admin app.
  const panelRadius = isAdmin ? "20px" : "16px";
  const itemPanelRadius = isAdmin ? "16px" : "14px";

  return {
    badge: {
      display: "inline-block",
      backgroundColor: colors.surfaceSubtle,
      color: colors.textMuted,
      border: `1px solid ${colors.border}`,
      padding: "8px 14px",
      borderRadius: "999px",
      fontSize: "13px",
      fontWeight: "700",
      margin: "8px 0 20px",
    },
    button: {
      display: "inline-block",
      textAlign: "center" as const,
      padding: "14px 24px",
      backgroundColor: colors.primary,
      color: "#ffffff",
      borderRadius: "999px",
      fontSize: "14px",
      fontWeight: "700",
      textDecoration: "none",
      boxSizing: "border-box" as const,
    },
    ctaSection: {
      textAlign: "left" as const,
      padding: "8px 0 0",
    },
    divider: {
      borderColor: colors.border,
      margin: "24px 0",
    },
    heading: {
      fontSize: "28px",
      fontWeight: "700",
      lineHeight: "36px",
      color: isAdmin ? colors.text : colors.primaryDark,
      margin: "0 0 16px",
      letterSpacing: isAdmin ? "-0.01em" : undefined,
    },
    itemDescription: {
      fontSize: "14px",
      lineHeight: "22px",
      color: colors.textMuted,
      margin: "0 0 8px",
    },
    itemImage: {
      display: "block",
      width: "92px",
      height: "92px",
      borderRadius: "12px",
      objectFit: "cover" as const,
      border: `1px solid ${colors.border}`,
      backgroundColor: colors.surfaceSubtle,
    },
    itemImageColumn: {
      width: "108px",
      paddingRight: "16px",
      verticalAlign: "top" as const,
    },
    itemPanel: {
      backgroundColor: "#ffffff",
      borderRadius: itemPanelRadius,
      border: `1px solid ${colors.border}`,
      padding: "18px",
      margin: "0 0 12px",
    },
    itemQuantity: {
      fontSize: "13px",
      lineHeight: "20px",
      color: colors.textMuted,
      fontWeight: "600",
      margin: "0",
    },
    itemTextColumn: {
      verticalAlign: "top" as const,
    },
    itemTitle: {
      fontSize: "16px",
      lineHeight: "24px",
      color: colors.text,
      fontWeight: "700",
      margin: "0 0 6px",
    },
    panel: {
      backgroundColor: colors.surfaceSubtle,
      borderRadius: panelRadius,
      border: `1px solid ${colors.border}`,
      padding: "20px",
      margin: "24px 0",
    },
    paragraph: {
      fontSize: "16px",
      lineHeight: "26px",
      color: colors.textMuted,
      margin: "0 0 16px",
    },
    wrappedParagraph: {
      fontSize: "16px",
      lineHeight: "26px",
      color: colors.textMuted,
      margin: "0 0 16px",
      maxWidth: "100%",
      overflowWrap: "break-word",
      wordBreak: "break-word",
      wordWrap: "break-word",
    },
    statLabel: {
      color: colors.textSubtle,
      fontWeight: "500",
    },
    statRow: {
      fontSize: "14px",
      lineHeight: "24px",
      color: colors.textMuted,
      margin: "0 0 8px",
    },
    statValue: {
      fontWeight: "700",
      color: colors.text,
    },
  };
}

export const sharedStyles = getSharedStyles("store");
