import { Button, Heading, Hr, Section, Text } from "react-email";
import { Layout } from "../components/Layout";
import { type EmailBrand, getSharedStyles } from "../components/theme";

export interface ComplaintNotificationProps {
  brand?: EmailBrand;
  channelName: string;
  description: string;
  orderId: string;
  url: string;
}

export function ComplaintNotification({
  brand = "admin",
  channelName,
  description,
  orderId,
  url,
}: ComplaintNotificationProps) {
  const sharedStyles = getSharedStyles(brand);
  return (
    <Layout brand={brand} preview={`Nowa reklamacja w kanale ${channelName}`}>
      <Heading as="h1" style={sharedStyles.heading}>
        Nowa reklamacja
      </Heading>
      <Text style={sharedStyles.paragraph}>
        W kanale {channelName} utworzono nowa reklamacje dla zamowienia{" "}
        {orderId}.
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

export default ComplaintNotification;
