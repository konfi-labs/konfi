import { Button, Heading, Hr, Section, Text } from "react-email";
import { Layout } from "../components/Layout";
import { type EmailBrand, getSharedStyles } from "../components/theme";

export interface CampaignNotificationProps {
  availabilityType: string;
  brand?: EmailBrand;
  campaignName: string;
  description: string;
  endDate: string;
  startDate: string;
  url?: string;
}

export function CampaignNotification({
  availabilityType,
  brand = "admin",
  campaignName,
  description,
  endDate,
  startDate,
  url,
}: CampaignNotificationProps) {
  const sharedStyles = getSharedStyles(brand);
  return (
    <Layout brand={brand} preview={`Nowa kampania: ${campaignName}`}>
      <Heading as="h1" style={sharedStyles.heading}>
        Nowa kampania
      </Heading>
      <Text style={sharedStyles.badge}>{campaignName}</Text>
      <Text style={sharedStyles.paragraph}>{description}</Text>
      <Section style={{ ...sharedStyles.panel, marginTop: "0" }}>
        <Text style={{ ...sharedStyles.paragraph, marginTop: "0" }}>
          Start: {startDate}
        </Text>
        <Text style={sharedStyles.paragraph}>Koniec: {endDate}</Text>
        <Text style={{ ...sharedStyles.paragraph, marginBottom: "0" }}>
          Dostepnosc: {availabilityType}
        </Text>
      </Section>
      {url && (
        <>
          <Hr style={sharedStyles.divider} />
          <Section style={sharedStyles.ctaSection}>
            <Button href={url} style={sharedStyles.button}>
              Otworz kampanie
            </Button>
          </Section>
        </>
      )}
    </Layout>
  );
}

export default CampaignNotification;
