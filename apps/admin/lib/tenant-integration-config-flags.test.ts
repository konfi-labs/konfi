import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTenantIntegrationConfigFlags } from "./tenant-integration-config-flags";

vi.mock("server-only", () => ({}));

const documents = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const getAllCalls = vi.hoisted(() => new Array<string[]>());

interface FakeDocumentReference {
  id: string;
}

const encryptedSecret = {
  algorithm: "aes-256-gcm",
  authTag: "tag",
  ciphertext: "ciphertext",
  iv: "iv",
  keyVersion: "v1",
};

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: () => ({
    collection: () => ({
      doc: (documentId: string): FakeDocumentReference => ({
        id: documentId,
      }),
    }),
    getAll: async (...refs: FakeDocumentReference[]) => {
      getAllCalls.push(refs.map((ref) => ref.id));

      return refs.map((ref) => {
        const document = documents.get(ref.id);

        return {
          data: () => document,
          exists: Boolean(document),
        };
      });
    },
  }),
  getTenantContextForRequest: vi.fn(),
}));

const dedicatedContext: TenantContext = {
  deploymentMode: "dedicated",
  requireTenantId: false,
};

const saasContext: TenantContext = {
  deploymentMode: "saas",
  requireTenantId: true,
  tenantId: "tenant-a",
};

function seedIntegration(
  integrationKey: string,
  data: Record<string, unknown>,
): void {
  documents.set(`tenant-a_${integrationKey}`, {
    integrationKey,
    tenantId: "tenant-a",
    ...data,
  });
}

describe("getTenantIntegrationConfigFlags", () => {
  beforeEach(() => {
    documents.clear();
    getAllCalls.length = 0;
  });

  it("returns disabled tenant flags outside shared SaaS", async () => {
    await expect(
      getTenantIntegrationConfigFlags({
        env: {
          allegroConfigured: true,
          microsoftConfigured: true,
        },
        tenantContext: dedicatedContext,
      }),
    ).resolves.toEqual({
      allegroConfigured: false,
      fakturowniaApiKeyProvided: false,
      microsoftConfigured: false,
      polkurierApiKeyProvided: false,
      przelewy24Configured: false,
      resendConfigured: false,
      stripeConfigured: false,
    });

    expect(getAllCalls).toEqual([]);
  });

  it("reads tenant integration flags in one Firestore batch", async () => {
    seedIntegration("allegro", {
      status: "oauth_pending",
    });
    seedIntegration("outlook", {
      status: "needs_attention",
    });
    seedIntegration("fakturownia", {
      metadata: {
        fakturownia: {
          encryptedApiKey: encryptedSecret,
          subdomain: "tenant",
        },
      },
      status: "connected",
    });
    seedIntegration("polkurier", {
      metadata: {
        polkurier: {
          authLogin: "login",
          baseUrl: "https://polkurier.example",
          encryptedAuthToken: encryptedSecret,
        },
      },
      status: "connected",
    });
    seedIntegration("przelewy24", {
      metadata: {
        przelewy24: {
          encryptedApiKey: encryptedSecret,
          encryptedCrc: encryptedSecret,
          posId: "123",
        },
      },
      status: "connected",
    });
    seedIntegration("resend", {
      metadata: {
        resend: {
          encryptedApiKey: encryptedSecret,
          fromEmail: "orders@example.com",
        },
      },
      status: "connected",
    });
    seedIntegration("stripe", {
      metadata: {
        stripe: {
          encryptedSecretKey: encryptedSecret,
          encryptedWebhookSecret: encryptedSecret,
        },
      },
      status: "connected",
    });

    await expect(
      getTenantIntegrationConfigFlags({
        env: {
          allegroConfigured: true,
          microsoftConfigured: true,
        },
        tenantContext: saasContext,
      }),
    ).resolves.toEqual({
      allegroConfigured: true,
      fakturowniaApiKeyProvided: true,
      microsoftConfigured: true,
      polkurierApiKeyProvided: true,
      przelewy24Configured: true,
      resendConfigured: true,
      stripeConfigured: true,
    });

    expect(getAllCalls).toEqual([
      [
        "tenant-a_allegro",
        "tenant-a_fakturownia",
        "tenant-a_microsoft",
        "tenant-a_outlook",
        "tenant-a_polkurier",
        "tenant-a_przelewy24",
        "tenant-a_resend",
        "tenant-a_stripe",
      ],
    ]);
  });

  it("keeps OAuth app env gates and integration metadata validation", async () => {
    seedIntegration("allegro", {
      status: "connected",
    });
    seedIntegration("microsoft", {
      status: "connected",
    });
    seedIntegration("fakturownia", {
      metadata: {
        fakturownia: {
          encryptedApiKey: "plaintext",
          subdomain: "tenant",
        },
      },
      status: "connected",
    });

    await expect(
      getTenantIntegrationConfigFlags({
        env: {
          allegroConfigured: false,
          microsoftConfigured: false,
        },
        tenantContext: saasContext,
      }),
    ).resolves.toMatchObject({
      allegroConfigured: false,
      fakturowniaApiKeyProvided: false,
      microsoftConfigured: false,
    });
  });
});
