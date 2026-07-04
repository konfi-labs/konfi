import {
  isAnonymousPackageShippingAllowedFor,
  matchesCountry,
  POLAND_COUNTRY_ALIASES,
} from "../../validators/matches-country";

describe("matchesCountry", () => {
  it("returns true when the country matches one of the allowed aliases", () => {
    expect(matchesCountry("Polska", POLAND_COUNTRY_ALIASES)).toBe(true);
    expect(matchesCountry("POLSKA ", POLAND_COUNTRY_ALIASES)).toBe(true);
    expect(matchesCountry("Poland", POLAND_COUNTRY_ALIASES)).toBe(true);
    expect(matchesCountry("PL", POLAND_COUNTRY_ALIASES)).toBe(true);
  });

  it("returns false when the country does not match the allowed aliases", () => {
    expect(matchesCountry("Germany", POLAND_COUNTRY_ALIASES)).toBe(false);
    expect(matchesCountry("DE", POLAND_COUNTRY_ALIASES)).toBe(false);
    expect(matchesCountry(null, POLAND_COUNTRY_ALIASES)).toBe(false);
    expect(matchesCountry(undefined, POLAND_COUNTRY_ALIASES)).toBe(false);
  });
});

describe("isAnonymousPackageShippingAllowedFor", () => {
  it("returns true only for supported domestic aliases", () => {
    expect(isAnonymousPackageShippingAllowedFor("PL")).toBe(true);
    expect(isAnonymousPackageShippingAllowedFor("Poland")).toBe(true);
    expect(isAnonymousPackageShippingAllowedFor("Polska")).toBe(true);
    expect(isAnonymousPackageShippingAllowedFor("DE")).toBe(false);
  });
});
