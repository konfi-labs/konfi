import { render } from "react-email";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttachmentNotification } from "./AttachmentNotification";

const normalizeRenderedHtml = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/\s+/g, " ");

describe("AttachmentNotification", () => {
  beforeEach(() => {
    vi.stubEnv("STORE_URL", "store.example.com");
    vi.stubEnv("NEXT_PUBLIC_LEGAL_COMPANY_NAME", "Acme Print Sp. z o.o.");
    vi.stubEnv("NEXT_PUBLIC_VAT_ID", "PL1234567890");
    vi.stubEnv("NEXT_PUBLIC_COMPANY_STREET_ADDRESS", "Market Street 1");
    vi.stubEnv("NEXT_PUBLIC_COMPANY_POSTAL_CODE", "00-100");
    vi.stubEnv("NEXT_PUBLIC_COMPANY_CITY", "Warsaw");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders the attachment name inline without the nested mono block", async () => {
    const html = normalizeRenderedHtml(
      await render(
        <AttachmentNotification
          brand="admin"
          fileName="specyfikacja.pdf"
          name="Ola"
          orderNumber="ORD-123"
          url="https://store.example.com/account/orders/ORD-123"
        />,
      ),
    );

    expect(html).toContain("Do Twojego zamówienia nr. ORD-123 został dodany nowy dokument:");
    expect(html).toContain('"Geist"');
    expect(html).toContain("specyfikacja.pdf");
    expect(html).not.toContain("SFMono-Regular");
  });
});
