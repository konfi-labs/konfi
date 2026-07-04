import { themeColors } from "@konfi/components/theme";
import { describe, expect, it } from "vitest";
import colors from "./colors";

describe("admin theme colors", () => {
  it("keeps black primary actions separate from blue informational accents", () => {
    expect(colors.primary["500"].value).toBe("oklch(0.205 0 0)");
    expect(colors.primaryAccent).toBe(themeColors.primary);
  });
});
