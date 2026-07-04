import { describe, expect, it } from "vitest";
import { getMiddleTruncatedTextParts } from "../MiddleTruncatedText";

describe("getMiddleTruncatedTextParts", () => {
  it("keeps short values intact after trimming", () => {
    expect(getMiddleTruncatedTextParts("  Konfi  ", 4)).toEqual({
      leading: "Konfi",
      trailing: "",
    });
  });

  it("splits long values into leading and trailing segments", () => {
    expect(getMiddleTruncatedTextParts("ABCDEFGHIJKLMNO", 4)).toEqual({
      leading: "ABCDEFGHIJK",
      trailing: "LMNO",
    });
  });

  it("returns the full value when trailing chars are disabled", () => {
    expect(getMiddleTruncatedTextParts("ABCDEFGHIJKLMNO", 0)).toEqual({
      leading: "ABCDEFGHIJKLMNO",
      trailing: "",
    });
  });
});
