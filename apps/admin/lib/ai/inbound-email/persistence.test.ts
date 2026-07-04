vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const serverTimestampMarker = Symbol("server-timestamp");
  const state: {
    record: InboundEmailRecordTestData | null;
    setCalls: Array<{
      data: Record<string, unknown>;
      options?: { merge?: boolean };
    }>;
  } = {
    record: null,
    setCalls: [],
  };
  const docRef = {
    id: "email-1",
  };
  const mockDb = {
    collection: vi.fn((collectionName: string) => {
      if (collectionName !== "inboundEmails") {
        throw new Error(`Unexpected collection ${collectionName}`);
      }

      return {
        doc: vi.fn((docId: string) => {
          if (docId !== docRef.id) {
            throw new Error(`Unexpected document ${docId}`);
          }

          return docRef;
        }),
      };
    }),
    runTransaction: vi.fn(
      async (
        handler: (transaction: {
          get: (ref: typeof docRef) => Promise<{
            data: () => InboundEmailRecordTestData | null;
            exists: boolean;
          }>;
          set: (
            ref: typeof docRef,
            data: Record<string, unknown>,
            options?: { merge?: boolean },
          ) => void;
        }) => Promise<boolean>,
      ) => {
        const transaction = {
          get: vi.fn(async (ref: typeof docRef) => {
            if (ref !== docRef) {
              throw new Error("Unexpected transaction reference");
            }

            return {
              data: () => state.record,
              exists: state.record !== null,
            };
          }),
          set: (
            ref: typeof docRef,
            data: Record<string, unknown>,
            options?: { merge?: boolean },
          ) => {
            if (ref !== docRef) {
              throw new Error("Unexpected transaction set reference");
            }

            state.setCalls.push({ data, options });
            state.record = {
              ...(state.record ?? createBlockedRecordTestData()),
              ...data,
            };
          },
        };

        return handler(transaction);
      },
    ),
  };

  return {
    mockDb,
    mockGetFirebaseAdminApp: vi.fn(() => ({ name: "firebase-admin-app" })),
    mockGetFirestore: vi.fn(() => mockDb),
    serverTimestampMarker,
    state,
  };
});

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.mockGetFirestore,
  getFirebaseAdminApp: mocks.mockGetFirebaseAdminApp,
}));

vi.mock("@konfi/firebase", () => ({
  withTenantOwned: <T extends object>(
    data: T & { tenantId?: string | null },
    context: TenantContext,
    operationName: string,
  ) => {
    if (context.deploymentMode !== "saas" && !context.requireTenantId) {
      return data;
    }

    const tenantId = data.tenantId?.trim() || context.tenantId?.trim();
    if (!tenantId) {
      throw new Error(
        `Missing tenantId for ${operationName} in ${context.deploymentMode} deployment mode.`,
      );
    }

    return { ...data, tenantId };
  },
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => mocks.serverTimestampMarker,
  },
  getFirestore: mocks.mockGetFirestore,
}));

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildInboundEmailRecord,
  claimInboundEmailStartContextResolved,
} from "./persistence";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import type {
  InboundEmailBlockReason,
  InboundEmailRecord,
  InboundRoutingDecision,
} from "./types";

type InboundEmailRecordTestData = InboundEmailRecord;

const adminRecipient = {
  email: "zielonka@japa-druk.pl",
  member: {
    id: "inbound-email-agent",
    name: "Inbound email agent",
  },
};
const saasTenantContext = {
  deploymentMode: "saas",
  requireTenantId: true,
  tenantId: "tenant-a",
} satisfies TenantContext;

function createBlockedDecision(
  blockReason: InboundEmailBlockReason,
): InboundRoutingDecision {
  return {
    blockReason,
    items: [],
    missingInformation: [],
    model: null,
    outcome: "blocked",
    rationale: "Blocked before workflow start.",
    senderAuthentication: {
      dkim: "none",
      dmarc: "none",
      reasons: [],
      spf: "none",
      verdict: "untrusted",
    },
  };
}

function createBlockedRecordTestData(
  overrides: Partial<InboundEmailRecord> = {},
): InboundEmailRecord {
  return {
    adminRecipientEmail: "",
    attachments: [],
    bcc: [],
    cc: [],
    channelId: "",
    createdBy: {
      id: "inbound-email-agent",
      name: "Inbound email agent",
    },
    eventCreatedAt: "2026-05-11T20:00:00.000Z",
    from: "Zielonka <zielonka@japa-druk.pl>",
    headers: {},
    html: null,
    id: "email-1",
    messageId: "message-1",
    resendEmailId: "email-1",
    routingDecision: createBlockedDecision("no-channel"),
    runId: null,
    status: "blocked",
    subject: "Quote request",
    text: "Please quote this job.",
    to: ["Konfi inbound <konfi@mail.japaprint.com>"],
    ...overrides,
  };
}

describe("claimInboundEmailStartContextResolved", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.record = null;
    mocks.state.setCalls = [];
  });

  it("repairs a no-channel blocked record before the workflow starts", async () => {
    mocks.state.record = createBlockedRecordTestData();

    const claimed = await claimInboundEmailStartContextResolved({
      adminRecipient,
      channelId: "channel-w33",
      inboundEmailId: "email-1",
    });

    expect(claimed).toBe(true);
    expect(mocks.state.setCalls).toEqual([
      {
        data: {
          adminRecipientEmail: "zielonka@japa-druk.pl",
          channelId: "channel-w33",
          createdBy: adminRecipient.member,
          routingDecision: null,
          status: "received",
          updatedAt: mocks.serverTimestampMarker,
        },
        options: { merge: true },
      },
    ]);
  });

  it("repairs a no-forwarding-admin blocked record for the same channel", async () => {
    mocks.state.record = createBlockedRecordTestData({
      channelId: "channel-w33",
      routingDecision: createBlockedDecision("no-forwarding-admin"),
    });

    const claimed = await claimInboundEmailStartContextResolved({
      adminRecipient,
      channelId: "channel-w33",
      inboundEmailId: "email-1",
    });

    expect(claimed).toBe(true);
    expect(mocks.state.record?.adminRecipientEmail).toBe(
      "zielonka@japa-druk.pl",
    );
    expect(mocks.state.record?.status).toBe("received");
    expect(mocks.state.record?.routingDecision).toBeNull();
  });

  it("does not repair a record that already has a workflow run", async () => {
    mocks.state.record = createBlockedRecordTestData({
      runId: "run-1",
    });

    const claimed = await claimInboundEmailStartContextResolved({
      adminRecipient,
      channelId: "channel-w33",
      inboundEmailId: "email-1",
    });

    expect(claimed).toBe(false);
    expect(mocks.state.setCalls).toEqual([]);
  });

  it("does not repair no-forwarding-admin when an admin is already present", async () => {
    mocks.state.record = createBlockedRecordTestData({
      adminRecipientEmail: "admin@example.com",
      channelId: "channel-w33",
      routingDecision: createBlockedDecision("no-forwarding-admin"),
    });

    const claimed = await claimInboundEmailStartContextResolved({
      adminRecipient,
      channelId: "channel-w33",
      inboundEmailId: "email-1",
    });

    expect(claimed).toBe(false);
    expect(mocks.state.setCalls).toEqual([]);
  });

  it("stamps repaired records in SaaS mode", async () => {
    mocks.state.record = createBlockedRecordTestData();

    const claimed = await claimInboundEmailStartContextResolved({
      adminRecipient,
      channelId: "channel-w33",
      inboundEmailId: "email-1",
      tenantContext: saasTenantContext,
    });

    expect(claimed).toBe(true);
    expect(mocks.state.setCalls[0]?.data).toEqual(
      expect.objectContaining({ tenantId: "tenant-a" }),
    );
  });
});

describe("buildInboundEmailRecord", () => {
  it("stamps records in SaaS mode", () => {
    const record = buildInboundEmailRecord({
      adminRecipient,
      channelId: "channel-w33",
      content: {
        headers: {},
        html: null,
        text: "Please quote this job.",
      },
      event: {
        created_at: "2026-05-11T20:00:00.000Z",
        data: {
          created_at: "2026-05-11T20:00:00.000Z",
          email_id: "email-1",
          from: "Customer <customer@example.local>",
          message_id: "message-1",
          subject: "Quote request",
          to: ["Konfi inbound <konfi@mail.example.local>"],
        },
        type: "email.received",
      },
      tenantContext: saasTenantContext,
    });

    expect(record).toEqual(expect.objectContaining({ tenantId: "tenant-a" }));
  });
});
