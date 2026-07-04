import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ALLEGRO_REQUIRED_SCOPES,
  getAllegroCallbackUrl,
  getAllegroPublicOrigin,
  getMissingAllegroScopes,
} from "../allegro-auth";

describe("allegro auth URLs", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the explicit Allegro redirect URL when configured", () => {
    vi.stubEnv(
      "ALLEGRO_REDIRECT_URI",
      "https://admin.example.com/api/auth/callback/allegro",
    );
    vi.stubEnv("ADMIN_URL", "https://fallback.example.com");

    expect(getAllegroCallbackUrl("https://request.example.com")).toBe(
      "https://admin.example.com/api/auth/callback/allegro",
    );
    expect(getAllegroPublicOrigin("https://request.example.com")).toBe(
      "https://admin.example.com",
    );
  });

  it("falls back to the public admin URL before the request origin", () => {
    const previousRedirectUri = process.env.ALLEGRO_REDIRECT_URI;
    const previousAdminUrl = process.env.ADMIN_URL;
    const previousPublicAdminUrl = process.env.NEXT_PUBLIC_ADMIN_URL;
    delete process.env.ALLEGRO_REDIRECT_URI;
    delete process.env.ADMIN_URL;
    process.env.NEXT_PUBLIC_ADMIN_URL = "admin.example.com/pl";

    try {
      expect(getAllegroCallbackUrl("https://request.example.com")).toBe(
        "https://admin.example.com/api/auth/callback/allegro",
      );
      expect(getAllegroPublicOrigin("https://request.example.com")).toBe(
        "https://admin.example.com",
      );
    } finally {
      if (previousRedirectUri === undefined) {
        delete process.env.ALLEGRO_REDIRECT_URI;
      } else {
        process.env.ALLEGRO_REDIRECT_URI = previousRedirectUri;
      }

      if (previousAdminUrl === undefined) {
        delete process.env.ADMIN_URL;
      } else {
        process.env.ADMIN_URL = previousAdminUrl;
      }

      if (previousPublicAdminUrl === undefined) {
        delete process.env.NEXT_PUBLIC_ADMIN_URL;
      } else {
        process.env.NEXT_PUBLIC_ADMIN_URL = previousPublicAdminUrl;
      }
    }
  });

  it("requests the order write scope required for fulfillment status updates", () => {
    expect(ALLEGRO_REQUIRED_SCOPES).toContain("allegro:api:orders:write");
    expect(
      getMissingAllegroScopes(
        "allegro:api:profile:read allegro:api:orders:read",
        ["allegro:api:orders:write"],
      ),
    ).toEqual(["allegro:api:orders:write"]);
  });
});
