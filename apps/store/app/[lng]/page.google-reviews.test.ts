import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pageSourcePath = join(process.cwd(), "apps/store/app/[lng]/page.tsx");

describe("store homepage Google reviews", () => {
  it("does not fetch live Google Places reviews during page render", () => {
    const pageSource = readFileSync(pageSourcePath, "utf8");

    expect(pageSource).not.toContain("getGooglePlaceReviews");
    expect(pageSource).not.toContain("GOOGLE_PLACES_API_KEY");
  });
});
