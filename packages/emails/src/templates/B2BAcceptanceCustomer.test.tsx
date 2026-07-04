import { render } from "react-email";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { B2BAcceptanceCustomer } from "./B2BAcceptanceCustomer";

const normalizeRenderedHtml = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/\s+/g, " ");

describe("B2BAcceptanceCustomer", () => {
  beforeEach(() => {
    vi.stubEnv("STORE_URL", "https://store.example.com");
    vi.stubEnv("NEXT_PUBLIC_LEGAL_COMPANY_NAME", "Acme Print Sp. z o.o.");
    vi.stubEnv("NEXT_PUBLIC_VAT_ID", "PL1234567890");
    vi.stubEnv("NEXT_PUBLIC_COMPANY_STREET_ADDRESS", "Market Street 1");
    vi.stubEnv("NEXT_PUBLIC_COMPANY_POSTAL_CODE", "00-100");
    vi.stubEnv("NEXT_PUBLIC_COMPANY_CITY", "Warsaw");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders Polish characters in the acceptance copy", async () => {
    const html = normalizeRenderedHtml(
      await render(
        <B2BAcceptanceCustomer
          bankPaymentsEnabled
          companyName="Drukarnia Łódź"
          customerName="Łukasz"
          deferredPaymentsEnabled
          discount={12}
          linkedProductsCount={3}
          onPickupPaymentsEnabled={false}
          supportEmail="pomoc@example.com"
        />,
      ),
    );

    expect(html).toContain("Dostęp B2B zaakceptowany");
    expect(html).toContain("Dzień dobry Łukasz");
    expect(html).toContain("Drukarnia Łódź");
    expect(html).toContain("został zaakceptowany");
    expect(html).toContain("Możesz już");
    expect(html).toContain("korzystać z przypisanych produktów i warunków");
    expect(html).toContain("Włączono:");
    expect(html).toContain("dostęp B2B");
    expect(html).toContain("Rabat:");
    expect(html).toContain("12%");
    expect(html).toContain("Metody płatności:");
    expect(html).toContain("przelew bankowy, płatność odroczona");
    expect(html).toContain("Przypisane produkty:");
    expect(html).toContain(">3</span>");
  });

  it("renders Polish fallback copy when there is no owner", async () => {
    const html = normalizeRenderedHtml(await render(<B2BAcceptanceCustomer />));

    expect(html).toContain("W razie pytań skontaktuj się z obsługą klienta.");
  });
});
