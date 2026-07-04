import { Heading, Text } from "react-email";
import { Layout } from "../components/Layout";
import { type EmailBrand, getSharedStyles } from "../components/theme";

export interface RatingRequestProps {
  brand?: EmailBrand;
  name: string;
}

export function RatingRequest({
  brand = "store",
  name,
}: RatingRequestProps) {
  const sharedStyles = getSharedStyles(brand);
  return (
    <Layout brand={brand} preview="Podziel się swoją opinią!">
      <Heading as="h1" style={sharedStyles.heading}>
        Podziel się swoją opinią!
      </Heading>
      <Text style={sharedStyles.paragraph}>Cześć {name},</Text>
      <Text style={sharedStyles.paragraph}>
        Dziękujemy za Twoje zamówienie! Byłoby nam bardzo miło, gdybyś
        podzielił(a) się swoją opinią na temat zakupionych produktów.
      </Text>
      <Text style={sharedStyles.paragraph}>
        Twoja opinia pomoże innym klientom w podjęciu decyzji zakupowej.
      </Text>
    </Layout>
  );
}

export default RatingRequest;
