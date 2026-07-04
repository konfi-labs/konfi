import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractGooglePlaceAddressFields,
  getGooglePlaceReviews,
  mapGooglePlaceAutocompletePredictions,
  resolveGooglePlaceRegionCode,
} from "./places";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveGooglePlaceRegionCode", () => {
  it("should resolve localized country names", () => {
    expect(resolveGooglePlaceRegionCode("Polska")).toBe("PL");
    expect(resolveGooglePlaceRegionCode("Germany")).toBe("DE");
  });

  it("should preserve two-letter country codes", () => {
    expect(resolveGooglePlaceRegionCode("pl")).toBe("PL");
  });
});

describe("mapGooglePlaceAutocompletePredictions", () => {
  it("should map place predictions and ignore incomplete suggestions", () => {
    const suggestions = mapGooglePlaceAutocompletePredictions({
      suggestions: [
        {
          placePrediction: {
            place: "places/abc",
            placeId: "abc",
            text: { text: "Example Street 10, Example City, Poland" },
            structuredFormat: {
              mainText: { text: "Example Street 10" },
              secondaryText: { text: "Example City, Poland" },
            },
          },
        },
        {
          placePrediction: {
            text: { text: "Missing identifiers" },
          },
        },
      ],
    });

    expect(suggestions).toEqual([
      {
        place: "places/abc",
        placeId: "abc",
        label: "Example Street 10, Example City, Poland",
        mainText: "Example Street 10",
        secondaryText: "Example City, Poland",
      },
    ]);
  });
});

describe("extractGooglePlaceAddressFields", () => {
  it("should map address components into the konfi address shape", () => {
    const address = extractGooglePlaceAddressFields({
      addressComponents: [
        {
          longText: "Example Street",
          types: ["route"],
        },
        {
          longText: "10",
          types: ["street_number"],
        },
        {
          longText: "5",
          types: ["subpremise"],
        },
        {
          longText: "00-123",
          types: ["postal_code"],
        },
        {
          longText: "Example City",
          types: ["locality"],
        },
        {
          longText: "Poland",
          shortText: "PL",
          types: ["country"],
        },
      ],
    });

    expect(address).toEqual({
      street: "Example Street",
      number: "10",
      local: "5",
      zip: "00-123",
      city: "Example City",
      country: "Poland",
      countryCode: "PL",
    });
  });

  it("should fall back to postal town for city values", () => {
    const address = extractGooglePlaceAddressFields({
      addressComponents: [
        {
          longText: "Cambridge",
          types: ["postal_town"],
        },
        {
          longText: "United Kingdom",
          shortText: "GB",
          types: ["country"],
        },
      ],
    });

    expect(address.city).toBe("Cambridge");
    expect(address.countryCode).toBe("GB");
  });

  it("should prefer locality over district-like sublocality values", () => {
    const address = extractGooglePlaceAddressFields({
      addressComponents: [
        {
          longText: "Śródmieście",
          types: ["sublocality_level_1", "sublocality", "political"],
        },
        {
          longText: "Example City",
          types: ["locality", "political"],
        },
      ],
    });

    expect(address.city).toBe("Example City");
  });
});

describe("getGooglePlaceReviews", () => {
  it("throws Places API errors instead of returning an empty review list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: "API key expired. Please renew the API key.",
            },
          }),
          {
            status: 400,
            statusText: "Bad Request",
          },
        ),
      ),
    );

    await expect(
      getGooglePlaceReviews("place-1", "expired-key", "pl"),
    ).rejects.toThrow("API key expired. Please renew the API key.");
  });
});
