import { render } from "react-email";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { B2BInquiryAdmin } from "./B2BInquiryAdmin";

const normalizeRenderedHtml = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/\s+/g, " ");

describe("B2BInquiryAdmin", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_URL", "https://admin.example.com");
    vi.stubEnv("NEXT_PUBLIC_LEGAL_COMPANY_NAME", "Acme Print Sp. z o.o.");
    vi.stubEnv("NEXT_PUBLIC_VAT_ID", "PL1234567890");
    vi.stubEnv("NEXT_PUBLIC_COMPANY_STREET_ADDRESS", "Market Street 1");
    vi.stubEnv("NEXT_PUBLIC_COMPANY_POSTAL_CODE", "00-100");
    vi.stubEnv("NEXT_PUBLIC_COMPANY_CITY", "Warsaw");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders long business descriptions with email-safe wrapping styles", async () => {
    const longDescription =
      "Potrzebujemy stalego dostepu B2B dla konfiguracji " +
      "averylongunbrokencustomerdescriptionwithoutnaturalbreakpoints1234567890";

    const html = normalizeRenderedHtml(
      await render(
        <B2BInquiryAdmin
          businessDescription={longDescription}
          companyName="Acme Print"
          customerEmail="buyer@example.com"
          inquiryId="b2b-123"
          nip="0000000000"
          url="https://admin.example.com/b2b/b2b-123"
          userId="user-123"
        />,
      ),
    );

    expect(html).toContain(longDescription);
    expect(html).toContain("max-width:100%");
    expect(html).toContain("overflow-wrap:break-word");
    expect(html).toContain("word-break:break-word");
    expect(html).toContain("word-wrap:break-word");
  });
});
