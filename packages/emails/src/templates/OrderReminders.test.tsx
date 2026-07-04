import { render } from "react-email";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoPaymentDocumentReminder } from "./NoPaymentDocumentReminder";
import { StalledOrdersReminder } from "./StalledOrdersReminder";

const normalizeRenderedHtml = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/\s+/g, " ");

describe("order reminder templates", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_URL", "admin.example.com");
    vi.stubEnv("NEXT_PUBLIC_LEGAL_COMPANY_NAME", "Acme Print Sp. z o.o.");
    vi.stubEnv("NEXT_PUBLIC_VAT_ID", "PL1234567890");
    vi.stubEnv("NEXT_PUBLIC_COMPANY_STREET_ADDRESS", "Market Street 1");
    vi.stubEnv("NEXT_PUBLIC_COMPANY_POSTAL_CODE", "00-100");
    vi.stubEnv("NEXT_PUBLIC_COMPANY_CITY", "Warsaw");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders stalled order lines inside the internal admin layout", async () => {
    const html = normalizeRenderedHtml(
      await render(
        <StalledOrdersReminder
          orderLines={[
            "nr.123 w kanale sprzedaży Main (4 dni po terminie)",
            "nr.124 w kanale sprzedaży Main (2 dni po terminie)",
          ]}
          subject="Zaległe zamówienia - Ada"
        />,
      ),
    );

    expect(html).toContain("Zaległe zamówienia - Ada");
    expect(html).toContain(
      "Poniżej znajduje się lista zamówień, które przekroczyły termin realizacji:",
    );
    expect(html).toContain(
      "nr.123 w kanale sprzedaży Main (4 dni po terminie)",
    );
    expect(html).toContain(
      "nr.124 w kanale sprzedaży Main (2 dni po terminie)",
    );
    expect(html).toContain('src="https://admin.example.com/assets/logo.png"');
    expect(html).toContain("Acme Print Sp. z o.o.");
    expect(html).toContain("NIP: PL1234567890");
  });

  it("renders the missing payment document variant with matching styling", async () => {
    const html = normalizeRenderedHtml(
      await render(
        <NoPaymentDocumentReminder
          orderLines={[
            "nr.201 w kanale sprzedaży B2B",
            "nr.202 w kanale sprzedaży B2B",
          ]}
          subject="Brakujące dokumenty płatności - Ada"
        />,
      ),
    );

    expect(html).toContain("Brakujące dokumenty płatności - Ada");
    expect(html).toContain(
      "Poniżej znajduje się lista zamówień, które nadal nie mają przypisanego dokumentu płatności:",
    );
    expect(html).toContain("nr.201 w kanale sprzedaży B2B");
    expect(html).toContain("nr.202 w kanale sprzedaży B2B");
    expect(html).toContain("background-color:#fafaf9");
  });
});
