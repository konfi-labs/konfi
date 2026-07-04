import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasTenantAllegroOAuthConfig,
  hasTenantMicrosoftOAuthConfig,
} from "./tenant-oauth-integrations";

vi.mock("server-only", () => ({}));

const documents = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: () => ({
    collection: () => ({
      doc: (documentId: string) => ({
        get: async () => {
          const document = documents.get(documentId);

          return {
            data: () => document,
            exists: Boolean(document),
          };
        },
      }),
    }),
  }),
  getTenantContextForRequest: vi.fn(),
}));

const dedicatedContext: TenantContext = {
  deploymentMode: "dedicated",
  requireTenantId: false,
  tenantId: "default",
};

const saasContext: TenantContext = {
  deploymentMode: "saas",
  requireTenantId: true,
  tenantId: "tenant-a",
};

describe("tenant OAuth integrations", () => {
  beforeEach(() => {
    documents.clear();
    vi.unstubAllEnvs();
    vi.stubEnv("ALLEGRO_CLIENT_ID", "");
    vi.stubEnv("ALLEGRO_CLIENT_SECRET", "");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "");
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "");
    vi.stubEnv("MICROSOFT_REDIRECT_URI", "");
  });

  it("keeps OAuth env app credentials available outside shared SaaS", async () => {
    vi.stubEnv("ALLEGRO_CLIENT_ID", "allegro-client");
    vi.stubEnv("ALLEGRO_CLIENT_SECRET", "allegro-secret");

    await expect(hasTenantAllegroOAuthConfig(dedicatedContext)).resolves.toBe(
      true,
    );
  });

  it("requires a visible Allegro tenant integration in shared SaaS", async () => {
    vi.stubEnv("ALLEGRO_CLIENT_ID", "allegro-client");
    vi.stubEnv("ALLEGRO_CLIENT_SECRET", "allegro-secret");

    await expect(hasTenantAllegroOAuthConfig(saasContext)).resolves.toBe(false);

    documents.set("tenant-a_allegro", {
      integrationKey: "allegro",
      status: "oauth_pending",
      tenantId: "tenant-a",
    });

    await expect(hasTenantAllegroOAuthConfig(saasContext)).resolves.toBe(true);
  });

  it("does not expose a tenant OAuth integration without OAuth app env", async () => {
    documents.set("tenant-a_allegro", {
      integrationKey: "allegro",
      status: "connected",
      tenantId: "tenant-a",
    });

    await expect(hasTenantAllegroOAuthConfig(saasContext)).resolves.toBe(false);
  });

  it("accepts Microsoft or Outlook as the tenant email OAuth integration key", async () => {
    vi.stubEnv("MICROSOFT_CLIENT_ID", "microsoft-client");
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "microsoft-secret");
    vi.stubEnv("MICROSOFT_REDIRECT_URI", "https://admin.example.com/callback");

    documents.set("tenant-a_outlook", {
      integrationKey: "outlook",
      status: "needs_attention",
      tenantId: "tenant-a",
    });

    await expect(hasTenantMicrosoftOAuthConfig(saasContext)).resolves.toBe(
      true,
    );
  });
});
