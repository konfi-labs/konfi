import { render } from "react-email";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AbandonedCartReminder } from "./AbandonedCartReminder";

const normalizeRenderedHtml = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/\s+/g, " ");

describe("AbandonedCartReminder", () => {
  beforeEach(() => {
    vi.stubEnv("STORE_URL", "store.example.com");
    vi.stubEnv(
      "NEXT_PUBLIC_STORE_EMAIL_LOGO_URL",
      "/assets/store-email-logo.png",
    );
    vi.stubEnv("NEXT_PUBLIC_LEGAL_COMPANY_NAME", "Acme Print Sp. z o.o.");
    vi.stubEnv("NEXT_PUBLIC_VAT_ID", "PL1234567890");
    vi.stubEnv("NEXT_PUBLIC_COMPANY_STREET_ADDRESS", "Market Street 1");
    vi.stubEnv("NEXT_PUBLIC_COMPANY_POSTAL_CODE", "00-100");
    vi.stubEnv("NEXT_PUBLIC_COMPANY_CITY", "Warsaw");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders richer cart item details and public company footer data", async () => {
    const html = normalizeRenderedHtml(
      await render(
        <AbandonedCartReminder
          buttonLabel="Return to cart"
          cartUrl="https://store.example.com/cart"
          greeting="Hello"
          heading="Your cart is waiting"
          intro="Complete your order:"
          items={[
            {
              description: "Silk laminated, 350 gsm",
              id: "item-1",
              imageUrl:
                "https://cdn.test/channels/store-channel/products/product-1/front.png?fit=crop&auto=format,compress",
              productName: "Premium Business Cards",
              quantity: 2,
            },
            {
              description: "Unnamed item",
              id: "item-2",
              quantity: 1,
            },
          ]}
          locale="en"
          name="Alex"
          outro="We'll hold on to your configuration for a little while longer."
          preview="Your cart is waiting"
          quantityLabel="Quantity"
        />,
      ),
    );

    expect(html).toContain('lang="en"');
    expect(html).not.toContain("data-skip-in-text");
    expect(html).toContain('"Montserrat"');
    expect(html).toContain('"Unbounded"');
    expect(html).toContain(
      'src="https://store.example.com/assets/logo.png"',
    );
    expect(html).toContain(
      '<h1 style="font-size:28px;font-weight:700;line-height:36px;color:#005fec;margin:0 0 16px"',
    );
    expect(html).toContain("background-color:#fafaf9");
    expect(html).not.toContain("padding:8px 12px;margin:24px 0");
    expect(html).toContain(
      'src="https://cdn.test/channels/store-channel/products/product-1/front.png?fit=crop&amp;auto=format,compress"',
    );
    expect(html).toContain("Premium Business Cards");
    expect(html).toContain("Silk laminated, 350 gsm");
    expect(html).toContain("Quantity: 2");
    expect(html).toContain("Acme Print Sp. z o.o.");
    expect(html).toContain("VAT ID: PL1234567890");
    expect(html).toContain("Market Street 1");
    expect(html).toContain("00-100 Warsaw");
  });

  it("uses Polish footer and quantity labels for Polish reminders", async () => {
    const html = normalizeRenderedHtml(
      await render(
        <AbandonedCartReminder
          greeting="Cześć"
          items={[
            {
              description: "Baner 100 x 200 cm",
              id: "item-1",
              productName: "Baner reklamowy",
              quantity: 3,
            },
          ]}
          locale="pl"
          name="Ola"
          quantityLabel="Ilość"
        />,
      ),
    );

    expect(html).toContain('lang="pl"');
    expect(html).toContain("Ilość: 3");
    expect(html).toContain("NIP: PL1234567890");
  });
});
