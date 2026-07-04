import { render } from "react-email";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InboundEmailAgentResponse } from "./InboundEmailAgentResponse";

const normalizeRenderedHtml = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/\s+/g, " ");

describe("InboundEmailAgentResponse", () => {
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

  it("renders the inbound email agent response with wrapped draft content", async () => {
    const customerDraft =
      "Please review this customer reply with " +
      "averylongunbrokencustomerresponsewithoutnaturalbreakpoints1234567890";
    const html = normalizeRenderedHtml(
      await render(
        <InboundEmailAgentResponse
          customerDraft={customerDraft}
          customerDraftLabel="Draft customer response for manual review:"
          heading="Quote ready for review for inbound email email-1."
          missingDetails="Missing or unsafe details: payment"
          preview="[Konfi inbound] Quote ready for review: Quote request"
          rationale="Rationale: The email requests printed cards."
          resource="No quote or order was created."
          statusLine="Status: Quote ready for review"
        />,
      ),
    );

    expect(html).toContain("Quote ready for review for inbound email email-1.");
    expect(html).toContain(customerDraft);
    expect(html).toContain("overflow-wrap:break-word");
    expect(html).toContain("word-break:break-word");
    expect(html).toContain('width="81"');
    expect(html).toContain('height="28"');
    expect(html).toContain("max-width:81px");
    expect(html).toContain("width:auto");
  });
});
