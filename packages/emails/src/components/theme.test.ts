import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPublicAssetUrl, getEmailBranding } from "./theme";

describe("email theme branding helpers", () => {
  beforeEach(() => {
    vi.stubEnv("STORE_URL", "store.example.com");
    vi.stubEnv("ADMIN_URL", "https://admin.example.com/");
    vi.stubEnv("NEXT_PUBLIC_SHORT_COMPANY_NAME", "Example Print");
    vi.stubEnv("NEXT_PUBLIC_LEGAL_COMPANY_NAME", "Example Print Sp. z o.o.");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes public asset URLs for host-only and full base URLs", () => {
    expect(buildPublicAssetUrl("store.example.com", "/icon3.png")).toBe(
      "https://store.example.com/icon3.png",
    );
    expect(
      buildPublicAssetUrl("https://admin.example.com/", "/icon3.png"),
    ).toBe("https://admin.example.com/icon3.png");
  });

  it("resolves store and admin branding with app logo assets", () => {
    expect(getEmailBranding("store")).toMatchObject({
      fallbackLabel: "Example Print",
      logoAlt: "Example Print",
      logoHeight: 48,
      logoUrl: "https://store.example.com/assets/logo.png",
      logoWidth: 96,
    });

    expect(getEmailBranding("admin")).toMatchObject({
      fallbackLabel: "Konfi",
      logoAlt: "Konfi",
      logoHeight: 28,
      logoUrl: "https://admin.example.com/assets/logo.png",
      logoWidth: 81,
    });
  });

  it("falls back to the public PNG app logo when no env override exists", () => {
    expect(getEmailBranding("store")).toMatchObject({
      fallbackLabel: "Example Print",
      logoAlt: "Example Print",
      logoUrl: "https://store.example.com/assets/logo.png",
    });

    expect(getEmailBranding("admin")).toMatchObject({
      fallbackLabel: "Konfi",
      logoAlt: "Konfi",
      logoUrl: "https://admin.example.com/assets/logo.png",
    });
  });

  it("falls back to public base URLs when server-side ones are unavailable", () => {
    const previousStoreUrl = process.env.STORE_URL;
    const previousAdminUrl = process.env.ADMIN_URL;
    delete process.env.STORE_URL;
    delete process.env.ADMIN_URL;
    vi.stubEnv("NEXT_PUBLIC_STORE_URL", "public-store.example.com");
    vi.stubEnv("NEXT_PUBLIC_ADMIN_URL", "https://public-admin.example.com/");
    vi.stubEnv("NEXT_PUBLIC_SHORT_COMPANY_NAME", "Example Print");
    vi.stubEnv("NEXT_PUBLIC_LEGAL_COMPANY_NAME", "Example Print Sp. z o.o.");

    try {
      expect(getEmailBranding("store")).toMatchObject({
        logoUrl: "https://public-store.example.com/assets/logo.png",
      });

      expect(getEmailBranding("admin")).toMatchObject({
        logoUrl: "https://public-admin.example.com/assets/logo.png",
      });
    } finally {
      if (previousStoreUrl === undefined) {
        delete process.env.STORE_URL;
      } else {
        process.env.STORE_URL = previousStoreUrl;
      }

      if (previousAdminUrl === undefined) {
        delete process.env.ADMIN_URL;
      } else {
        process.env.ADMIN_URL = previousAdminUrl;
      }
    }
  });
});
