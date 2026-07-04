import { Button, Heading, Text, Section } from "react-email";
import { Layout } from "../components/Layout";
import { type EmailBrand, getSharedStyles } from "../components/theme";

export interface NewOrderCustomerProps {
  brand?: EmailBrand;
  name: string;
  orderNumber: string;
  url: string;
}

export function NewOrderCustomer({
  brand = "store",
  name,
  orderNumber,
  url,
}: NewOrderCustomerProps) {
  const sharedStyles = getSharedStyles(brand);
  return (
    <Layout brand={brand} preview={`Potwierdzenie zamówienia #${orderNumber}`}>
      <Heading as="h1" style={sharedStyles.heading}>
        Nowe zamówienie
      </Heading>
      <Text style={sharedStyles.paragraph}>Cześć {name},</Text>
      <Text style={sharedStyles.paragraph}>
        Twoje zamówienie nr. {orderNumber} zostało przyjęte. Dziękujemy za
        złożenie zamówienia!
      </Text>
      {url && (
        <Section style={sharedStyles.ctaSection}>
          <Button href={url} style={sharedStyles.button}>
            Zobacz zamówienie
          </Button>
        </Section>
      )}
    </Layout>
  );
}

export default NewOrderCustomer;
