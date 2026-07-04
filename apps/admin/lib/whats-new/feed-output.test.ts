import { describe, expect, it } from "vitest";
import {
  feedOutputSchema,
  MAX_FEED_HIGHLIGHTS,
  monthlyFeedGenerationOutputSchema,
  normalizeGeneratedFeedOutput,
  feedGenerationOutputSchema,
  hasDuplicatedLocalizedText,
  hasRepetitiveHighlights,
} from "./feed-output";

describe("feed-output", () => {
  it("accepts and trims overlong AI highlight lists", () => {
    const rawOutput = {
      title: {
        en: "April Growth Strategy",
        pl: "Strategia wzrostu na kwiecień",
      },
      description: {
        en: "Focus on seasonal Polish events like First Communion and Matura exams while utilizing new calendar configurations.",
        pl: "Skup się na wydarzeniach sezonowych, takich jak Komunie i Matury, wykorzystując nowe konfiguracje kalendarzy.",
      },
      highlightFeatures: [
        {
          en: "Launch Communion Memories campaign",
          pl: "Uruchom kampanię Wspomnienia Komunijne",
        },
        {
          en: "Promote exam-season flyers",
          pl: "Promuj ulotki na sezon maturalny",
        },
        {
          en: "Feature three-part calendars in Hero",
          pl: "Pokaż kalendarze trójdzielne w Hero",
        },
        {
          en: "Run a Shopping Sunday flash sale",
          pl: "Uruchom błyskawiczną wyprzedaż na niedzielę handlową",
        },
        {
          en: "Offer Majowka banner discounts",
          pl: "Zaoferuj zniżki na banery na Majówkę",
        },
        {
          en: "Refresh poster SEO before events",
          pl: "Odśwież SEO plakatów przed wydarzeniami",
        },
      ],
    };

    expect(feedGenerationOutputSchema.safeParse(rawOutput).success).toBe(true);
    expect(feedOutputSchema.safeParse(rawOutput).success).toBe(false);

    expect(normalizeGeneratedFeedOutput(rawOutput)).toEqual({
      ...rawOutput,
      highlightFeatures: rawOutput.highlightFeatures.slice(
        0,
        MAX_FEED_HIGHLIGHTS,
      ),
    });
  });

  it("requires evidence ids for monthly AI growth highlights", () => {
    const rawOutput = {
      title: {
        en: "May Growth Plan",
        pl: "Plan wzrostu na maj",
      },
      description: {
        en: "Focus monthly work on active catalog opportunities.",
        pl: "Skup działania miesięczne na aktywnym katalogu.",
      },
      highlightFeatures: [
        {
          en: "Promote banner printing",
          pl: "Promuj druk banerów",
          supportingEntityType: "product",
          supportingEntityId: "banner-product",
        },
        {
          en: "Review campaign visibility",
          pl: "Sprawdź widoczność kampanii",
          supportingEntityType: "campaign",
          supportingEntityId: "communion-campaign",
        },
      ],
    };

    expect(monthlyFeedGenerationOutputSchema.safeParse(rawOutput).success).toBe(
      true,
    );
    expect(
      monthlyFeedGenerationOutputSchema.safeParse({
        ...rawOutput,
        highlightFeatures: rawOutput.highlightFeatures.map((highlight) => ({
          en: highlight.en,
          pl: highlight.pl,
        })),
      }).success,
    ).toBe(false);
  });

  it("detects duplicated English copy in Polish fields", () => {
    expect(
      hasDuplicatedLocalizedText({
        title: {
          en: "Weekly admin updates",
          pl: "Weekly admin updates",
        },
        description: {
          en: "Reviewed recent catalog changes.",
          pl: "Przejrzano ostatnie zmiany w katalogu.",
        },
        highlightFeatures: [
          {
            en: "Review attribute updates",
            pl: "Sprawdź aktualizacje atrybutów",
          },
          {
            en: "Check product changes",
            pl: "Sprawdź zmiany produktów",
          },
        ],
      }),
    ).toBe(true);

    expect(
      hasDuplicatedLocalizedText({
        title: {
          en: "Weekly admin updates",
          pl: "Tygodniowe aktualizacje panelu",
        },
        description: {
          en: "Reviewed recent catalog changes.",
          pl: "Przejrzano ostatnie zmiany w katalogu.",
        },
        highlightFeatures: [
          {
            en: "Review attribute updates",
            pl: "Sprawdź aktualizacje atrybutów",
          },
          {
            en: "Check product changes",
            pl: "Sprawdź zmiany produktów",
          },
        ],
      }),
    ).toBe(false);
  });

  it("detects repetitive highlight prefixes", () => {
    expect(
      hasRepetitiveHighlights({
        title: {
          en: "Weekly admin updates",
          pl: "Tygodniowe aktualizacje panelu",
        },
        description: {
          en: "Reviewed catalog changes.",
          pl: "Przejrzano zmiany w katalogu.",
        },
        highlightFeatures: [
          {
            en: "Review attribute and option updates: Cover Varnish",
            pl: "Sprawdź zmiany atrybutów: Cover Varnish",
          },
          {
            en: "Review attribute and option updates: offset 90g",
            pl: "Sprawdź zmiany atrybutów: offset 90g",
          },
          {
            en: "Review attribute and option updates",
            pl: "Sprawdź zmiany atrybutów",
          },
          {
            en: "Review attribute and option updates: Foil sealing",
            pl: "Sprawdź zmiany atrybutów: Foil sealing",
          },
        ],
      }),
    ).toBe(true);

    expect(
      hasRepetitiveHighlights({
        title: {
          en: "Weekly admin updates",
          pl: "Tygodniowe aktualizacje panelu",
        },
        description: {
          en: "Reviewed catalog changes.",
          pl: "Przejrzano zmiany w katalogu.",
        },
        highlightFeatures: [
          {
            en: "Review product SEO updates",
            pl: "Sprawdź aktualizacje SEO produktów",
          },
          {
            en: "Check attribute option changes",
            pl: "Zweryfikuj zmiany opcji atrybutów",
          },
          {
            en: "Scan catalog updates before publishing",
            pl: "Przejrzyj katalog przed publikacją",
          },
          {
            en: "Coordinate admin cleanup work",
            pl: "Skoordynuj porządki w panelu",
          },
        ],
      }),
    ).toBe(false);
  });
});
