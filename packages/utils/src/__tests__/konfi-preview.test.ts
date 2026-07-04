import { describe, expect, it } from "vitest";
import { toKonfiPreviewUrl } from "../konfi-preview";

describe("toKonfiPreviewUrl", () => {
  it("returns empty string for falsy input", () => {
    expect(toKonfiPreviewUrl(undefined)).toBe("");
    expect(toKonfiPreviewUrl(null)).toBe("");
    expect(toKonfiPreviewUrl("")).toBe("");
  });

  it("normalizes Windows drive letters and separators", () => {
    expect(toKonfiPreviewUrl("e:/Temp/konfi-order-previews/file.png")).toBe(
      "konfi-preview://E/Temp/konfi-order-previews/file.png",
    );
    expect(toKonfiPreviewUrl("e:/Temp/konfi order previews/file 1.png")).toBe(
      "konfi-preview://E/Temp/konfi%20order%20previews/file%201.png",
    );
    expect(toKonfiPreviewUrl("e\\\Temporary\\preview.png")).toBe(
      "konfi-preview://E/Temporary/preview.png",
    );
  });

  it("handles POSIX paths", () => {
    expect(toKonfiPreviewUrl("/tmp/konfi-order-previews/preview.png")).toBe(
      "konfi-preview://localhost/tmp/konfi-order-previews/preview.png",
    );
    expect(toKonfiPreviewUrl("tmp/preview space.png")).toBe(
      "konfi-preview://localhost/tmp/preview%20space.png",
    );
  });

  it("rejects UNC paths", () => {
    expect(toKonfiPreviewUrl("\\\\server\\share\\preview.png")).toBe("");
    expect(toKonfiPreviewUrl("//server/share/preview.png")).toBe("");
  });
});
