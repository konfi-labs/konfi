import { Button, Heading, Text, Section } from "react-email";
import { Layout } from "../components/Layout";
import { type EmailBrand, getSharedStyles } from "../components/theme";

export interface ProformaPaidProps {
  brand?: EmailBrand;
  orderNumber: string;
  url: string;
}

export function ProformaPaid({
  brand = "admin",
  orderNumber,
  url,
}: ProformaPaidProps) {
  const sharedStyles = getSharedStyles(brand);
  return (
    <Layout brand={brand} preview={`Opłacono proformę do zamówienia #${orderNumber}`}>
      <Heading as="h1" style={sharedStyles.heading}>
        Proforma opłacona
      </Heading>
      <Text style={sharedStyles.paragraph}>
        Faktura pro forma do zamówienia nr. {orderNumber} została opłacona.
      </Text>
      <Section style={sharedStyles.ctaSection}>
        <Button href={url} style={sharedStyles.button}>
          Zobacz zamówienie
        </Button>
      </Section>
    </Layout>
  );
}

export default ProformaPaid;
