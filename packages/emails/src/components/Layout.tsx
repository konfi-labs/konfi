import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Section,
  Tailwind,
  Text,
  pixelBasedPreset,
} from "react-email";
import {
  type EmailBrand,
  type EmailLocale,
  getCompanyFooterLines,
  getEmailBranding,
  getEmailColors,
  getEmailTypography,
  getPublicCompanyDetails,
} from "./theme";

interface LayoutProps {
  brand?: EmailBrand;
  children: React.ReactNode;
  locale?: EmailLocale;
  preview?: string;
}

const main = (colors: ReturnType<typeof getEmailColors>): React.CSSProperties => ({
  backgroundColor: colors.page,
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
  margin: "0",
  padding: "0",
});

const container: React.CSSProperties = {
  maxWidth: "640px",
  margin: "0 auto",
  padding: "32px 16px",
};

const shell = (
  colors: ReturnType<typeof getEmailColors>,
  brand: EmailBrand,
): React.CSSProperties => ({
  backgroundColor: colors.surface,
  borderRadius: brand === "admin" ? "0" : "24px",
  overflow: "hidden",
  boxShadow:
    brand === "admin"
      ? "0 24px 56px rgba(10, 10, 10, 0.08)"
      : "0 18px 48px rgba(28, 25, 23, 0.08)",
  border: `1px solid ${colors.border}`,
});

const brandSection = (
  colors: ReturnType<typeof getEmailColors>,
): React.CSSProperties => ({
  backgroundColor: colors.surfaceSubtle,
  borderBottom: `1px solid ${colors.border}`,
  padding: "24px 32px 0",
});

const brandLabel = (
  colors: ReturnType<typeof getEmailColors>,
): React.CSSProperties => ({
  fontSize: "12px",
  lineHeight: "16px",
  fontWeight: "700",
  letterSpacing: "0.04em",
  color: colors.textSubtle,
  margin: "0",
});

const brandImage = (
  width: number,
  height: number,
  marginBottom = "16px",
): React.CSSProperties => ({
  display: "block",
  height: "auto",
  marginBottom,
  maxHeight: `${height}px`,
  maxWidth: `${width}px`,
  width: "auto",
});

const content: React.CSSProperties = {
  padding: "32px",
};

const footerSection = (
  colors: ReturnType<typeof getEmailColors>,
): React.CSSProperties => ({
  backgroundColor: colors.surfaceSubtle,
  borderTop: `1px solid ${colors.border}`,
  padding: "20px 32px 28px",
});

const footerPrimary = (
  colors: ReturnType<typeof getEmailColors>,
): React.CSSProperties => ({
  color: colors.text,
  fontSize: "13px",
  fontWeight: "600",
  lineHeight: "20px",
  margin: "0 0 6px",
});

const footerSecondary = (
  colors: ReturnType<typeof getEmailColors>,
): React.CSSProperties => ({
  color: colors.textSubtle,
  fontSize: "13px",
  lineHeight: "20px",
  margin: "0 0 4px",
});

const buildTailwindConfig = (colors: ReturnType<typeof getEmailColors>) => ({
  presets: [pixelBasedPreset],
  theme: {
    extend: {
      colors: {
        border: colors.border,
        page: colors.page,
        primary: colors.primary,
        "primary-dark": colors.primaryDark,
        "primary-soft": colors.primarySoft,
        surface: colors.surface,
        "surface-subtle": colors.surfaceSubtle,
        text: colors.text,
        "text-muted": colors.textMuted,
        "text-subtle": colors.textSubtle,
      },
    },
  },
});

export function Layout({
  brand = "admin",
  children,
  locale = "pl",
  preview,
}: LayoutProps) {
  const { companyName } = getPublicCompanyDetails();
  const {
    fallbackLabel,
    logoAlt,
    logoHeight,
    logoMarginBottom,
    logoUrl,
    logoWidth,
  } = getEmailBranding(brand);
  const colors = getEmailColors(brand);
  const typography = getEmailTypography(brand);
  const footerLines = getCompanyFooterLines(locale);
  const showBrandHeader = Boolean(logoUrl || fallbackLabel || companyName);
  const tailwindConfig = buildTailwindConfig(colors);

  return (
    <Html lang={locale}>
      <Head>
        <style>{typography.fontFaceCss}</style>
        <style>{`
          body, table, td, div, p, a, span {
            font-family: ${typography.bodyFontFamily};
          }

          h1, h2, h3, h4, h5, h6 {
            font-family: ${typography.headingFontFamily};
          }
        `}</style>
      </Head>
      <Body
        style={{
          ...main(colors),
          fontFamily: typography.bodyFontFamily,
        }}
      >
        <Tailwind config={tailwindConfig}>
          <Container style={container}>
            <Section style={shell(colors, brand)}>
              {showBrandHeader && (
                <Section style={brandSection(colors)}>
                  {logoUrl ? (
                    <Img
                      alt={logoAlt}
                      height={logoHeight.toString()}
                      src={logoUrl}
                      style={brandImage(
                        logoWidth,
                        logoHeight,
                        logoMarginBottom,
                      )}
                      width={logoWidth.toString()}
                    />
                  ) : (
                    <Text style={brandLabel(colors)}>
                      {fallbackLabel ?? companyName}
                    </Text>
                  )}
                </Section>
              )}
              <Section
                style={{
                  ...content,
                  paddingTop: showBrandHeader ? "16px" : "32px",
                }}
              >
                {children}
              </Section>
              {footerLines.length > 0 && (
                <Section style={footerSection(colors)}>
                  {footerLines.map((line, index) => (
                    <Text
                      key={`${index}-${line}`}
                      style={
                        index === 0
                          ? footerPrimary(colors)
                          : footerSecondary(colors)
                      }
                    >
                      {line}
                    </Text>
                  ))}
                </Section>
              )}
            </Section>
          </Container>
        </Tailwind>
      </Body>
    </Html>
  );
}
