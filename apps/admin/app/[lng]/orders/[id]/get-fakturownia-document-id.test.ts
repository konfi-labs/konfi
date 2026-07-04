import { describe, expect, it } from "vitest";
import { getFakturowniaDocumentId } from "./get-fakturownia-document-id";

describe("getFakturowniaDocumentId", () => {
  it("should return payment document id when present", () => {
    expect(
      getFakturowniaDocumentId({
        paymentDocumentId: "FV/1/2026",
        proformaDocumentId: "PRO/1/2026",
      }),
    ).toBe("FV/1/2026");
  });

  it("should fallback to proforma document id when payment document id is missing", () => {
    expect(
      getFakturowniaDocumentId({
        paymentDocumentId: "",
        proformaDocumentId: "PRO/2/2026",
      }),
    ).toBe("PRO/2/2026");
  });

  it("should return undefined when no document ids exist", () => {
    expect(getFakturowniaDocumentId(undefined)).toBeUndefined();
  });
});
