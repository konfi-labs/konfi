import { Locale } from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  normalizeAssistantLocale,
  sanitizeStorefrontAssistantResponse,
} from "./schema";
import type { StorefrontAssistantResponse } from "./types";

describe("storefront assistant schema helpers", () => {
  it("normalizes supported locales and falls back to Polish", () => {
    expect(normalizeAssistantLocale("en")).toBe(Locale.en);
    expect(normalizeAssistantLocale("fr")).toBe(Locale.fr);
    expect(normalizeAssistantLocale("it")).toBe(Locale.pl);
    expect(normalizeAssistantLocale()).toBe(Locale.pl);
  });

  it("filters model output to tool-returned products and contacts", () => {
    const response: StorefrontAssistantResponse = {
      answer: "Open the matching products.",
      contact: {
        contactUrl: "/pl/help/contact",
        email: "quotes@example.com",
      },
      products: [
        {
          name: "Wizytówki standardowe",
          url: "/pl/products/wizytowki-standardowe",
        },
        {
          name: "Invented product",
          url: "/pl/products/invented",
        },
      ],
      refusal: false,
      topic: "product-suggestion",
    };

    expect(
      sanitizeStorefrontAssistantResponse({
        allowedContacts: [
          {
            contactUrl: "/pl/help/contact",
            email: "quotes@example.com",
          },
        ],
        allowedProducts: [
          {
            name: "Wizytówki standardowe",
            url: "/pl/products/wizytowki-standardowe",
          },
        ],
        locale: Locale.pl,
        response,
      }),
    ).toEqual({
      ...response,
      products: [
        {
          name: "Wizytówki standardowe",
          url: "/pl/products/wizytowki-standardowe",
        },
      ],
    });
  });
});
