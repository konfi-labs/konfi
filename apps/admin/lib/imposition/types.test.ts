import { layoutType } from "@konfi/types";
import { describe, expect, it } from "vitest";
import { parseImpositionPayload } from "./types";

describe("parseImpositionPayload", () => {
  it("rejects booklet payloads whose signature size is not a positive multiple of 4", () => {
    expect(() =>
      parseImpositionPayload({
        layout: layoutType.BOOKLET,
        pagesPerSignature: 6,
      }),
    ).toThrow(/positive multiple of 4/i);
  });

  it("accepts valid booklet signature sizes", () => {
    expect(
      parseImpositionPayload({
        layout: layoutType.BOOKLET,
        pagesPerSignature: 8,
      }),
    ).toMatchObject({
      layout: layoutType.BOOKLET,
      pagesPerSignature: 8,
    });
  });
});
