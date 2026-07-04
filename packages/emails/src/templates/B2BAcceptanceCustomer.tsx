import { Heading, Section, Text } from "react-email";
import { Layout } from "../components/Layout";
import { type EmailBrand, getSharedStyles } from "../components/theme";

export interface B2BAcceptanceCustomerProps {
  bankPaymentsEnabled?: boolean;
  brand?: EmailBrand;
  companyName?: string;
  customerName?: string;
  deferredPaymentsEnabled?: boolean;
  discount?: number;
  linkedProductsCount?: number;
  onPickupPaymentsEnabled?: boolean;
  ownerEmail?: string;
  ownerName?: string;
  supportEmail?: string;
}

function normalizeText(value: string | undefined) {
  return value?.trim() ?? "";
}

export function B2BAcceptanceCustomer({
  bankPaymentsEnabled,
  brand = "store",
  companyName,
  customerName,
  deferredPaymentsEnabled,
  discount,
  linkedProductsCount,
  onPickupPaymentsEnabled,
  ownerEmail,
  ownerName,
  supportEmail,
}: B2BAcceptanceCustomerProps) {
  const sharedStyles = getSharedStyles(brand);
  const normalizedCompanyName = normalizeText(companyName);
  const normalizedCustomerName = normalizeText(customerName);
  const normalizedOwnerEmail = normalizeText(ownerEmail);
  const normalizedOwnerName = normalizeText(ownerName);
  const normalizedSupportEmail = normalizeText(supportEmail);
  const greetingName =
    normalizedCustomerName || normalizedCompanyName || "Kliencie";
  const companyLabel = normalizedCompanyName || "Twojej firmy";
  const hasOwner = Boolean(normalizedOwnerName || normalizedOwnerEmail);
  const enabledPaymentMethods = [
    bankPaymentsEnabled ? "przelew bankowy" : undefined,
    onPickupPaymentsEnabled ? "płatność przy odbiorze" : undefined,
    deferredPaymentsEnabled ? "płatność odroczona" : undefined,
  ].filter((method): method is string => Boolean(method));
  const normalizedDiscount =
    typeof discount === "number" && Number.isFinite(discount)
      ? Math.max(0, discount)
      : 0;
  const normalizedLinkedProductsCount =
    typeof linkedProductsCount === "number" &&
    Number.isFinite(linkedProductsCount)
      ? Math.max(0, Math.floor(linkedProductsCount))
      : 0;
  const linkedProductsLabel =
    normalizedLinkedProductsCount > 0
      ? `${normalizedLinkedProductsCount}`
      : "brak przypisanych produktów";

  return (
    <Layout brand={brand} preview="Dostęp B2B zaakceptowany">
      <Heading as="h1" style={sharedStyles.heading}>
        Dostęp B2B zaakceptowany
      </Heading>
      <Text style={sharedStyles.paragraph}>Dzień dobry {greetingName},</Text>
      <Text style={sharedStyles.paragraph}>
        Wniosek B2B dla {companyLabel} został zaakceptowany. Możesz już
        korzystać z przypisanych produktów i warunków B2B po zalogowaniu.
      </Text>
      <Section style={sharedStyles.panel}>
        <Text style={sharedStyles.statRow}>
          <span style={sharedStyles.statLabel}>Włączono: </span>
          <span style={sharedStyles.statValue}>dostęp B2B</span>
        </Text>
        <Text style={sharedStyles.statRow}>
          <span style={sharedStyles.statLabel}>Rabat: </span>
          <span style={sharedStyles.statValue}>{normalizedDiscount}%</span>
        </Text>
        <Text style={sharedStyles.statRow}>
          <span style={sharedStyles.statLabel}>Metody płatności: </span>
          <span style={sharedStyles.statValue}>
            {enabledPaymentMethods.length > 0
              ? enabledPaymentMethods.join(", ")
              : "standardowe metody płatności"}
          </span>
        </Text>
        <Text style={{ ...sharedStyles.statRow, marginBottom: "0" }}>
          <span style={sharedStyles.statLabel}>Przypisane produkty: </span>
          <span style={sharedStyles.statValue}>{linkedProductsLabel}</span>
        </Text>
      </Section>
      <Section style={sharedStyles.panel}>
        {hasOwner ? (
          <>
            <Text style={sharedStyles.statRow}>
              <span style={sharedStyles.statLabel}>Opiekun klienta: </span>
              <span style={sharedStyles.statValue}>
                {normalizedOwnerName || normalizedOwnerEmail}
              </span>
            </Text>
            {normalizedOwnerEmail && normalizedOwnerName ? (
              <Text style={{ ...sharedStyles.statRow, marginBottom: "0" }}>
                <span style={sharedStyles.statLabel}>Email: </span>
                <span style={sharedStyles.statValue}>
                  {normalizedOwnerEmail}
                </span>
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={sharedStyles.statRow}>
            W razie pytań skontaktuj się z obsługą klienta.
          </Text>
        )}
        {normalizedSupportEmail ? (
          <Text style={{ ...sharedStyles.statRow, marginBottom: "0" }}>
            <span style={sharedStyles.statLabel}>Pomoc: </span>
            <span style={sharedStyles.statValue}>{normalizedSupportEmail}</span>
          </Text>
        ) : null}
      </Section>
    </Layout>
  );
}

export default B2BAcceptanceCustomer;
