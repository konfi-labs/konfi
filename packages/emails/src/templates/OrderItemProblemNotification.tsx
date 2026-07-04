import { Button, Heading, Hr, Section, Text } from "react-email";
import { Layout } from "../components/Layout";
import { type EmailBrand, getSharedStyles } from "../components/theme";

export interface OrderItemProblemNotificationProps {
  actorName: string;
  brand?: EmailBrand;
  channelName: string;
  description: string;
  itemName: string;
  orderNumber: string;
  url: string;
}

export function OrderItemProblemNotification({
  actorName,
  brand = "admin",
  channelName,
  description,
  itemName,
  orderNumber,
  url,
}: OrderItemProblemNotificationProps) {
  const sharedStyles = getSharedStyles(brand);

  return (
    <Layout
      brand={brand}
      preview={`Nowy problem pozycji zamowienia w kanale ${channelName}`}
    >
      <Heading as="h1" style={sharedStyles.heading}>
        Nowy problem pozycji zamowienia
      </Heading>
      <Text style={sharedStyles.paragraph}>
        {actorName} zglosil problem dla pozycji {itemName} w zamowieniu{" "}
        {orderNumber} w kanale {channelName}.
      </Text>
      <Section style={{ ...sharedStyles.panel, marginTop: "0" }}>
        <Text style={{ ...sharedStyles.paragraph, margin: "0" }}>
          {description || "Brak opisu"}
        </Text>
      </Section>
      <Hr style={sharedStyles.divider} />
      <Section style={sharedStyles.ctaSection}>
        <Button href={url} style={sharedStyles.button}>
          Otworz zamowienie
        </Button>
      </Section>
    </Layout>
  );
}

export default OrderItemProblemNotification;
