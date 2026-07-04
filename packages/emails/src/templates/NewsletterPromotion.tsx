import { Button, Heading, Section, Text } from "react-email";
import { Layout } from "../components/Layout";
import { type EmailBrand, getSharedStyles } from "../components/theme";

export interface NewsletterPromotionProps {
  brand?: EmailBrand;
  code: string;
  discountLabel: string;
  url?: string;
}

export function NewsletterPromotion({
  brand = "store",
  code,
  discountLabel,
  url,
}: NewsletterPromotionProps) {
  const sharedStyles = getSharedStyles(brand);
  const codeStyle: React.CSSProperties = {
    ...sharedStyles.badge,
    fontSize: "20px",
    lineHeight: "28px",
    textAlign: "center",
  };

  return (
    <Layout brand={brand} preview={`Kod rabatowy ${code}`}>
      <Heading as="h1" style={sharedStyles.heading}>
        Kod rabatowy
      </Heading>
      <Text style={sharedStyles.paragraph}>
        Dziekujemy za zapis do newslettera. Twoj kod rabatowy to:
      </Text>
      <Text style={codeStyle}>{code}</Text>
      <Text style={sharedStyles.paragraph}>
        Kod obniza wartosc zamowienia o {discountLabel}.
      </Text>
      {url && (
        <Section style={sharedStyles.ctaSection}>
          <Button href={url} style={sharedStyles.button}>
            Przejdz do sklepu
          </Button>
        </Section>
      )}
    </Layout>
  );
}

export default NewsletterPromotion;
