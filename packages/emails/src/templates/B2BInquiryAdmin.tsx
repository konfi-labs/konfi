import { Button, Heading, Section, Text } from "react-email";
import { Layout } from "../components/Layout";
import { type EmailBrand, getSharedStyles } from "../components/theme";

export interface B2BInquiryAdminProps {
  brand?: EmailBrand;
  businessDescription?: string;
  companyName?: string;
  customerEmail?: string;
  inquiryId?: string;
  nip?: string;
  url?: string;
  userId?: string;
}

function normalizeText(value: string | undefined) {
  return value?.trim() ?? "";
}

export function B2BInquiryAdmin({
  brand = "admin",
  businessDescription,
  companyName,
  customerEmail,
  inquiryId,
  nip,
  url,
  userId,
}: B2BInquiryAdminProps) {
  const sharedStyles = getSharedStyles(brand);
  const normalizedBusinessDescription = normalizeText(businessDescription);
  const normalizedCompanyName = normalizeText(companyName) || "Nie podano";
  const normalizedCustomerEmail = normalizeText(customerEmail);
  const normalizedInquiryId = normalizeText(inquiryId) || "Nie podano";
  const normalizedNip = normalizeText(nip) || "Nie podano";
  const normalizedUserId = normalizeText(userId) || "Nie podano";

  return (
    <Layout
      brand={brand}
      preview={`Nowe zapytanie B2B: ${normalizedCompanyName}`}
    >
      <Heading as="h1" style={sharedStyles.heading}>
        Nowe zapytanie B2B
      </Heading>
      <Text style={sharedStyles.paragraph}>
        W sklepie pojawil sie nowy wniosek o dostep B2B.
      </Text>
      <Section style={sharedStyles.panel}>
        <Text style={sharedStyles.statRow}>
          <span style={sharedStyles.statLabel}>Firma: </span>
          <span style={sharedStyles.statValue}>{normalizedCompanyName}</span>
        </Text>
        <Text style={sharedStyles.statRow}>
          <span style={sharedStyles.statLabel}>NIP: </span>
          <span style={sharedStyles.statValue}>{normalizedNip}</span>
        </Text>
        <Text style={sharedStyles.statRow}>
          <span style={sharedStyles.statLabel}>Klient: </span>
          <span style={sharedStyles.statValue}>{normalizedUserId}</span>
        </Text>
        {normalizedCustomerEmail ? (
          <Text style={sharedStyles.statRow}>
            <span style={sharedStyles.statLabel}>Email: </span>
            <span style={sharedStyles.statValue}>
              {normalizedCustomerEmail}
            </span>
          </Text>
        ) : null}
        <Text style={{ ...sharedStyles.statRow, marginBottom: "0" }}>
          <span style={sharedStyles.statLabel}>Wniosek: </span>
          <span style={sharedStyles.statValue}>{normalizedInquiryId}</span>
        </Text>
      </Section>
      {normalizedBusinessDescription ? (
        <Section style={{ ...sharedStyles.panel, marginTop: "0" }}>
          <Text style={{ ...sharedStyles.wrappedParagraph, marginBottom: "0" }}>
            {normalizedBusinessDescription}
          </Text>
        </Section>
      ) : null}
      {url ? (
        <Section style={sharedStyles.ctaSection}>
          <Button href={url} style={sharedStyles.button}>
            Otworz wniosek
          </Button>
        </Section>
      ) : null}
    </Layout>
  );
}

export default B2BInquiryAdmin;
