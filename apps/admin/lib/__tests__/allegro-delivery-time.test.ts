import {
  parseAllegroHandlingTimeDays,
  toAllegroHandlingTimeDuration,
} from "@/lib/allegro-delivery-time";
import { describe, expect, it } from "vitest";

describe("allegro-delivery-time", () => {
  it("converts user-facing days to Allegro ISO 8601 durations", () => {
    expect(toAllegroHandlingTimeDuration(1)).toBe("P1D");
    expect(toAllegroHandlingTimeDuration(14)).toBe("P14D");
  });

  it("rejects unsupported day values", () => {
    expect(toAllegroHandlingTimeDuration(0)).toBeUndefined();
    expect(toAllegroHandlingTimeDuration(366)).toBeUndefined();
    expect(toAllegroHandlingTimeDuration(1.5)).toBeUndefined();
  });

  it("parses Allegro day durations for UI defaults", () => {
    expect(parseAllegroHandlingTimeDays("P3D")).toBe(3);
    expect(parseAllegroHandlingTimeDays(" P21D ")).toBe(21);
    expect(parseAllegroHandlingTimeDays("PT24H")).toBeNull();
  });
});
