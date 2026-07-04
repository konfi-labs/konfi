import { describe, expect, it, beforeEach, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import {
  AiUsageQuotaError,
  finalizeAiUsage,
  releaseAiUsageReservation,
  reserveAiUsage,
} from "../usage-metering";

vi.mock("server-only", () => ({}));

type StoredDoc = {
  exists: boolean;
  data: Record<string, unknown>;
};

class FakeDocSnapshot {
  exists: boolean;
  private value: Record<string, unknown>;

  constructor(doc?: StoredDoc) {
    this.exists = doc?.exists ?? false;
    this.value = doc?.data ?? {};
  }

  data(): Record<string, unknown> {
    return this.value;
  }
}

class FakeDocumentReference {
  constructor(
    private firestore: FakeFirestore,
    readonly path: string,
  ) {}

  async get(): Promise<FakeDocSnapshot> {
    return new FakeDocSnapshot(this.firestore.docs.get(this.path));
  }
}

class FakeCollectionReference {
  constructor(
    private firestore: FakeFirestore,
    private path: string,
  ) {}

  doc(id: string): FakeDocumentReference {
    return new FakeDocumentReference(this.firestore, `${this.path}/${id}`);
  }

  async add(data: Record<string, unknown>) {
    this.firestore.events.push({ data, path: this.path });
    return new FakeDocumentReference(
      this.firestore,
      `${this.path}/event-${this.firestore.events.length}`,
    );
  }
}

class FakeTransaction {
  constructor(private firestore: FakeFirestore) {}

  async get(ref: FakeDocumentReference): Promise<FakeDocSnapshot> {
    return ref.get();
  }

  set(
    ref: FakeDocumentReference,
    data: Record<string, unknown>,
    _options?: { merge?: boolean },
  ) {
    this.firestore.writes.push({ path: ref.path, data });
  }
}

class FakeFirestore {
  docs = new Map<string, StoredDoc>();
  events: Array<{ data: Record<string, unknown>; path: string }> = [];
  writes: Array<{ path: string; data: Record<string, unknown> }> = [];

  collection(path: string): FakeCollectionReference {
    return new FakeCollectionReference(this, path);
  }

  doc(path: string): FakeDocumentReference {
    return new FakeDocumentReference(this, path);
  }

  async runTransaction<T>(
    callback: (transaction: FakeTransaction) => Promise<T>,
  ): Promise<T> {
    return callback(new FakeTransaction(this));
  }
}

const saasContext: TenantContext = {
  deploymentMode: "saas",
  requireTenantId: true,
  tenantId: "tenant-1",
};

const dedicatedContext: TenantContext = {
  deploymentMode: "dedicated",
  requireTenantId: false,
};

function asFirestore(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function seedTenant(
  fake: FakeFirestore,
  data: Record<string, unknown> = {},
): void {
  fake.docs.set("tenants/tenant-1", {
    exists: true,
    data: {
      id: "tenant-1",
      deploymentMode: "saas",
      name: "Tenant",
      planId: "starter",
      slug: "tenant",
      status: "ACTIVE",
      ...data,
    },
  });
}

function eventsFor(
  fake: FakeFirestore,
  path: string,
): Record<string, unknown>[] {
  const addedEvents = fake.events
    .filter((event) => event.path === path)
    .map((event) => event.data);
  const writtenEvents = fake.writes
    .filter((write) => write.path.startsWith(`${path}/`))
    .map((write) => write.data);

  return [...addedEvents, ...writtenEvents];
}

function writesFor(fake: FakeFirestore, path: string) {
  return fake.writes.filter((write) => write.path.startsWith(path));
}

describe("AI usage metering", () => {
  beforeEach(() => {
    vi.stubEnv("AI_USAGE_ENFORCEMENT", "");
    vi.stubEnv("AI_USAGE_LOG_ONLY", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "test-project");
  });

  it("reserves and finalizes text usage for SaaS tenants", async () => {
    const fake = new FakeFirestore();
    seedTenant(fake, {
      limits: { aiTextTokensPerWeek: 500, aiTextTokensPer5Hours: 250 },
    });

    const reservation = await reserveAiUsage({
      context: saasContext,
      estimatedTotalTokens: 100,
      firestore: asFirestore(fake),
      modality: "text",
      model: "gemini-3.1-flash-lite",
      source: "admin-action",
    });

    expect(reservation.mode).toBe("enforce");
    // Text reservations write to weekly + 5-hour window docs so durable O(1)
    // summaries are maintained for both burst-window enforcement and operator
    // visibility.
    expect(fake.writes).toHaveLength(2);
    const writePaths = fake.writes.map((w) => w.path);
    expect(writePaths).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^aiUsageWeekly\/\d{4}-W\d{2}\/tenants\/tenant-1$/,
        ),
        expect.stringMatching(
          /^aiUsage5h\/\d{4}-\d{2}-\d{2}T\d{2}\/tenants\/tenant-1$/,
        ),
      ]),
    );

    await finalizeAiUsage({
      firestore: asFirestore(fake),
      reservation,
      textUsage: {
        cachedInputTokens: 3,
        inputTokens: 40,
        outputTokens: 20,
        reasoningTokens: 2,
        totalTokens: 60,
      },
    });

    const legacyEvents = eventsFor(fake, "aiUsageEvents");
    const usageEvents = eventsFor(fake, "usageEvents");

    expect(legacyEvents).toHaveLength(1);
    expect(legacyEvents[0]).toMatchObject({
      tenantId: "tenant-1",
      source: "admin-action",
      modality: "text",
      status: "finalized",
      inputTokens: 40,
      outputTokens: 20,
    });
    // Two usage.recorded events: weekly + 5-hour windows.
    expect(usageEvents).toHaveLength(2);
    const periodKinds = usageEvents
      .map((event) => event.period?.kind)
      .toSorted();
    expect(periodKinds).toEqual(["five_hour", "week"]);
    for (const event of usageEvents) {
      expect(event).toMatchObject({
        deltas: [
          { amount: 40, key: "ai.input_tokens", unit: "tokens" },
          { amount: 20, key: "ai.output_tokens", unit: "tokens" },
          { amount: 2, key: "ai.reasoning_tokens", unit: "tokens" },
          { amount: 3, key: "ai.cached_input_tokens", unit: "tokens" },
        ],
        source: "ai",
        tenantId: "tenant-1",
        type: "usage.recorded",
      });
    }

    expect(writesFor(fake, "usageSummaries/tenant-1_current")).toHaveLength(1);
    expect(writesFor(fake, "usageWindowSummaries/")).toHaveLength(2);
  });

  it("releases a reserved text call after failure", async () => {
    const fake = new FakeFirestore();
    seedTenant(fake, {
      limits: { aiTextTokensPerWeek: 500, aiTextTokensPer5Hours: 250 },
    });

    const reservation = await reserveAiUsage({
      context: saasContext,
      estimatedTotalTokens: 100,
      firestore: asFirestore(fake),
      modality: "text",
      model: "gemini-3.1-flash-lite",
      source: "admin-action",
    });

    await releaseAiUsageReservation({
      firestore: asFirestore(fake),
      reservation,
    });

    expect(eventsFor(fake, "aiUsageEvents")).toMatchObject([
      {
        status: "released",
        tenantId: "tenant-1",
      },
    ]);
    expect(eventsFor(fake, "usageEvents")).toEqual([]);
  });

  it("bypasses dedicated enforcement when disabled", async () => {
    vi.stubEnv("AI_USAGE_ENFORCEMENT", "disabled");
    const fake = new FakeFirestore();

    const reservation = await reserveAiUsage({
      context: dedicatedContext,
      estimatedTotalTokens: 100_000,
      firestore: asFirestore(fake),
      modality: "text",
      model: "gemini-3.1-pro-preview",
      source: "admin-action",
    });

    expect(reservation.mode).toBe("disabled");
    expect(writesFor(fake, "aiUsageMonthly/")).toHaveLength(0);
    expect(fake.events).toHaveLength(0);
  });

  it("blocks Free-plan image usage before reservation", async () => {
    const fake = new FakeFirestore();
    seedTenant(fake, {
      planId: "free",
    });

    await expect(
      reserveAiUsage({
        context: saasContext,
        firestore: asFirestore(fake),
        imageGenerations: 1,
        modality: "image",
        model: "gemini-3.1-flash-image",
        source: "image",
      }),
    ).rejects.toBeInstanceOf(AiUsageQuotaError);

    expect(writesFor(fake, "aiUsageMonthly/")).toHaveLength(0);
    expect(eventsFor(fake, "aiUsageEvents")[0]).toMatchObject({
      modality: "image",
      overLimit: true,
      status: "denied",
      tenantId: "tenant-1",
    });
    expect(eventsFor(fake, "usageEvents")[0]).toMatchObject({
      current: 0,
      key: "ai.image_generations",
      limit: 0,
      reason: "feature_disabled",
      tenantId: "tenant-1",
      type: "usage.limit_denied",
      unit: "count",
    });
  });
});
