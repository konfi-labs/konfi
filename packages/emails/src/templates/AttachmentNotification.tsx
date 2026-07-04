import { Button, Heading, Text, Section } from "react-email";
import { Layout } from "../components/Layout";
import { type EmailBrand, getSharedStyles } from "../components/theme";

export interface AttachmentNotificationProps {
  brand?: EmailBrand;
  name: string;
  orderNumber: string;
  fileName: string;
  url: string;
}

export function AttachmentNotification({
  brand = "store",
  name,
  orderNumber,
  fileName,
  url,
}: AttachmentNotificationProps) {
  const sharedStyles = getSharedStyles(brand);
  const fileNameText: React.CSSProperties = {
    color: sharedStyles.itemTitle.color,
    fontWeight: "700",
  };

  return (
    <Layout brand={brand} preview={`Nowy dokument do zamówienia #${orderNumber}`}>
      <Heading as="h1" style={sharedStyles.heading}>
        Nowy dokument do zamówienia
      </Heading>
      <Text style={sharedStyles.paragraph}>Cześć {name},</Text>
      <Text style={sharedStyles.paragraph}>
        Do Twojego zamówienia nr. {orderNumber} został dodany nowy dokument:{" "}
        <span style={fileNameText}>{fileName}</span>
      </Text>
      <Text style={sharedStyles.paragraph}>
        Dokument został również dołączony do tej wiadomości jako załącznik.
      </Text>
      <Section style={sharedStyles.ctaSection}>
        <Button href={url} style={sharedStyles.button}>
          Zobacz zamówienie
        </Button>
      </Section>
    </Layout>
  );
}

export default AttachmentNotification;
