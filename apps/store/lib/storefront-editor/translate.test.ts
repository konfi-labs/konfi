import { describe, expect, it, vi } from "vitest";

import { Locale } from "@konfi/types";
import {
  autoTranslateStorefrontHomePage,
  ensureStorefrontSourceTranslations,
  normalizeStorefrontContentLocale,
} from "./translate";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/server-vertex", () => ({
  getStoreVertexClient: vi.fn(),
}));
vi.mock("ai", () => ({
  Output: {
    object: vi.fn((value) => value),
  },
  generateText: vi.fn(),
}));

describe("storefront editor translations", () => {
  it("normalizes supported storefront content locales", () => {
    expect(normalizeStorefrontContentLocale("de-DE")).toBe(Locale.de);
    expect(normalizeStorefrontContentLocale("en-US")).toBe(Locale.en);
    expect(normalizeStorefrontContentLocale("fr-FR")).toBe(Locale.fr);
    expect(normalizeStorefrontContentLocale("pl-PL")).toBe(Locale.pl);
    expect(normalizeStorefrontContentLocale(undefined)).toBe(Locale.pl);
  });

  it("stores source language content without overwriting existing translations", () => {
    expect(
      ensureStorefrontSourceTranslations({
        homePage: {
          blocks: [
            {
              ctaLabel: "Kup teraz",
              enabled: true,
              id: "hero",
              title: "Drukarnia online",
              translations: {
                en: { title: "Online print shop" },
              },
              type: "hero",
            },
          ],
          id: "home",
        },
        sourceLocale: Locale.pl,
      }),
    ).toMatchObject({
      blocks: [
        {
          translations: {
            en: { title: "Online print shop" },
            pl: {
              ctaLabel: "Kup teraz",
              title: "Drukarnia online",
            },
          },
        },
      ],
      sourceLocale: Locale.pl,
    });
  });

  it("keeps source content when auto-translation cannot run", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      await expect(
        autoTranslateStorefrontHomePage({
          homePage: {
            blocks: [
              {
                enabled: true,
                id: "hero",
                title: "Drukarnia online",
                type: "hero",
              },
            ],
            id: "home",
          },
          sourceLocale: Locale.pl,
        }),
      ).resolves.toMatchObject({
        blocks: [
          {
            translations: {
              pl: {
                title: "Drukarnia online",
              },
            },
          },
        ],
        sourceLocale: Locale.pl,
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});
