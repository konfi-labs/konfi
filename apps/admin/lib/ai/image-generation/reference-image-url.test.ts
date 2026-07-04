import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// `server-only` intentionally throws when imported outside Next.js Server Components.
// In unit tests, we mock it to a no-op so we can validate the pure URL validation logic.
vi.mock("server-only", () => ({}));

let assertAllowedReferenceImageUrl: (
  referenceImageUrl: string,
  params: { bucketName: string },
) => void;

describe("assertAllowedReferenceImageUrl", () => {
  const bucketName = "konfi-test.appspot.com";
  const originalAllowedHosts = process.env.AI_REFERENCE_IMAGE_ALLOWED_HOSTS;

  beforeAll(async () => {
    ({ assertAllowedReferenceImageUrl } =
      await import("./reference-image-url"));
  });

  afterEach(() => {
    if (typeof originalAllowedHosts === "string") {
      process.env.AI_REFERENCE_IMAGE_ALLOWED_HOSTS = originalAllowedHosts;
    } else {
      delete process.env.AI_REFERENCE_IMAGE_ALLOWED_HOSTS;
    }
  });

  it("allows Firebase Storage download URL for configured bucket", () => {
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/ai%2Freference%2F2026-01-12%2Ffile.png?alt=media&token=abc`;
    expect(() =>
      assertAllowedReferenceImageUrl(url, { bucketName }),
    ).not.toThrow();
  });

  it("rejects non-https URLs", () => {
    const url = `http://firebasestorage.googleapis.com/v0/b/${bucketName}/o/ai%2Freference%2Ffile.png?alt=media&token=abc`;
    expect(() => assertAllowedReferenceImageUrl(url, { bucketName })).toThrow(
      /https/i,
    );
  });

  it("rejects Firebase Storage URLs for other buckets", () => {
    const url =
      "https://firebasestorage.googleapis.com/v0/b/other-bucket.appspot.com/o/ai%2Freference%2Ffile.png?alt=media&token=abc";
    expect(() => assertAllowedReferenceImageUrl(url, { bucketName })).toThrow(
      /not allowed/i,
    );
  });

  it("rejects URLs with embedded credentials", () => {
    const url = `https://user:pass@firebasestorage.googleapis.com/v0/b/${bucketName}/o/ai%2Freference%2Ffile.png?alt=media&token=abc`;
    expect(() => assertAllowedReferenceImageUrl(url, { bucketName })).toThrow(
      /credentials/i,
    );
  });

  it("allows hostnames from AI_REFERENCE_IMAGE_ALLOWED_HOSTS", () => {
    process.env.AI_REFERENCE_IMAGE_ALLOWED_HOSTS =
      "example.com, images.example.net";

    expect(() =>
      assertAllowedReferenceImageUrl("https://example.com/some/path.png", {
        bucketName,
      }),
    ).not.toThrow();
    expect(() =>
      assertAllowedReferenceImageUrl("https://images.example.net/x", {
        bucketName,
      }),
    ).not.toThrow();
  });

  it("rejects other hostnames by default", () => {
    delete process.env.AI_REFERENCE_IMAGE_ALLOWED_HOSTS;

    expect(() =>
      assertAllowedReferenceImageUrl("https://example.com/some/path.png", {
        bucketName,
      }),
    ).toThrow(/not allowed/i);
  });
});
