import { Button, Heading, Text, Section } from "react-email";
import { Layout } from "../components/Layout";
import { type EmailBrand, getSharedStyles } from "../components/theme";

export interface NewOrderAdminProps {
  brand?: EmailBrand;
  orderNumber: string;
  channelName: string;
  url: string;
}

export function NewOrderAdmin({
  brand = "admin",
  orderNumber,
  channelName,
  url,
}: NewOrderAdminProps) {
  const sharedStyles = getSharedStyles(brand);
  return (
    <Layout brand={brand} preview={`Nowe zamówienie #${orderNumber}`}>
      <Heading as="h1" style={sharedStyles.heading}>
        Nowe zamówienie
      </Heading>
      <Text style={sharedStyles.paragraph}>
        Nowe zamówienie nr. {orderNumber} zostało utworzone w kanale sprzedaży{" "}
        {channelName}.
      </Text>
      <Section style={sharedStyles.ctaSection}>
        <Button href={url} style={sharedStyles.button}>
          Zobacz zamówienie
        </Button>
      </Section>
    </Layout>
  );
}

export default NewOrderAdmin;
