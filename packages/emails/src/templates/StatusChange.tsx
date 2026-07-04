import { Heading, Text } from "react-email";
import { Layout } from "../components/Layout";
import { type EmailBrand, getSharedStyles } from "../components/theme";

export interface StatusChangeProps {
  brand?: EmailBrand;
  name: string;
  status: string;
  orderNumber: string;
}

export function StatusChange({
  brand = "store",
  name,
  status,
  orderNumber,
}: StatusChangeProps) {
  const sharedStyles = getSharedStyles(brand);
  return (
    <Layout brand={brand} preview={`Zmiana statusu zamówienia #${orderNumber}`}>
      <Heading as="h1" style={sharedStyles.heading}>
        Zmiana statusu zamówienia
      </Heading>
      <Text style={sharedStyles.paragraph}>Cześć {name},</Text>
      <Text style={sharedStyles.paragraph}>
        Status Twojego zamówienia nr. {orderNumber} został zmieniony na:
      </Text>
      <Text style={sharedStyles.badge}>{status}</Text>
    </Layout>
  );
}

export default StatusChange;
