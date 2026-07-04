import { afterEach, describe, expect, it, vi } from "vitest";
import { formatSenderAddress } from "./email-sender";

describe("formatSenderAddress", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the short company name as the sender display name", () => {
    vi.stubEnv("NEXT_PUBLIC_SHORT_COMPANY_NAME", "Example Print");

    expect(formatSenderAddress("noreply@example.com")).toBe(
      "Example Print <noreply@example.com>",
    );
  });

  it("preserves an explicit sender header", () => {
    vi.stubEnv("NEXT_PUBLIC_SHORT_COMPANY_NAME", "Example Print");

    expect(
      formatSenderAddress("Example Notifications <noreply@example.com>"),
    ).toBe("Example Notifications <noreply@example.com>");
  });
});
