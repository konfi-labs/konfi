import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ──────────────────────────────────────────────────────────────────────────────
// Hoisted mocks (must be at the top, used by vi.mock factories)
// ──────────────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  // Fake Timestamp / FieldValue sentinels
  let nowSeconds = 1_700_000_000;

  const mockTimestampNow = vi.fn(() => ({
    seconds: nowSeconds,
    nanoseconds: 0,
    toDate: () => new Date(nowSeconds * 1000),
  }));

  const mockFieldValueArrayUnion = vi.fn((...items: unknown[]) => ({
    _type: "arrayUnion",
    items,
  }));

  // Per-doc update spy factory — each doc gets its own ref with a fresh spy.
  function makeOrderRef(id: string) {
    return { id, update: vi.fn().mockResolvedValue(undefined) };
  }

  // The query chain mock
  const queryGetFn = vi.fn();
  const whereChain = {
    where: vi.fn().mockReturnThis(),
    get: queryGetFn,
  };
  const mockCollectionGroup = vi.fn(() => ({
    where: vi.fn().mockReturnValue(whereChain),
  }));

  const mockGetAdminDb = vi.fn(() => ({
    collectionGroup: mockCollectionGroup,
  }));

  // Settings loader mocks
  const mockLoadOrderWorkflowStatusesSettingsForChannel = vi.fn();
  const mockLoadInternalTransitSettingsForChannel = vi.fn();

  // Email helper mock
  const mockMaybeSendPickupReadyEmailForArrivedOrder = vi
    .fn()
    .mockResolvedValue(undefined);

  // requireTenantContextTenantId mock
  const mockRequireTenantContextTenantId = vi.fn(
    (ctx: { tenantId?: string }) => ctx.tenantId ?? "default",
  );

  return {
    nowSeconds,
    setNowSeconds: (s: number) => {
      nowSeconds = s;
    },
    mockTimestampNow,
    mockFieldValueArrayUnion,
    makeOrderRef,
    queryGetFn,
    whereChain,
    mockCollectionGroup,
    mockGetAdminDb,
    mockLoadOrderWorkflowStatusesSettingsForChannel,
    mockLoadInternalTransitSettingsForChannel,
    mockMaybeSendPickupReadyEmailForArrivedOrder,
    mockRequireTenantContextTenantId,
  };
});

// ──────────────────────────────────────────────────────────────────────────────
// Module mocks
// ──────────────────────────────────────────────────────────────────────────────

vi.mock("firebase-admin/firestore", () => ({
  Timestamp: {
    now: mocks.mockTimestampNow,
    fromDate: (d: Date) => ({
      seconds: Math.floor(d.getTime() / 1000),
      nanoseconds: 0,
    }),
    fromMillis: (ms: number) => ({
      seconds: Math.floor(ms / 1000),
      nanoseconds: 0,
    }),
  },
  FieldValue: {
    arrayUnion: mocks.mockFieldValueArrayUnion,
    serverTimestamp: () => ({ _type: "serverTimestamp" }),
    delete: () => ({ _type: "fieldDelete" }),
  },
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.mockGetAdminDb,
}));

vi.mock("@/lib/internal-transit/server", () => ({
  loadOrderWorkflowStatusesSettingsForChannel:
    mocks.mockLoadOrderWorkflowStatusesSettingsForChannel,
  loadInternalTransitSettingsForChannel:
    mocks.mockLoadInternalTransitSettingsForChannel,
}));

vi.mock("@/actions/order-updates", () => ({
  maybeSendPickupReadyEmailForArrivedOrder:
    mocks.mockMaybeSendPickupReadyEmailForArrivedOrder,
}));

vi.mock("@konfi/firebase", () => ({
  requireTenantContextTenantId: mocks.mockRequireTenantContextTenantId,
}));

// ──────────────────────────────────────────────────────────────────────────────
// Helpers / fixtures
// ──────────────────────────────────────────────────────────────────────────────

import type { StoreOrder } from "@konfi/types";
import type { OrderWorkflowStatusesSettings } from "@konfi/utils";
import type { InternalTransitSettings } from "@konfi/types";
import { runInternalTransitSweepForTenant } from "./sweep";

/** Minimal transit-flagged workflow settings fixture. */
function makeWorkflowSettings(
  transitStatusId = "IN_TRANSIT",
): OrderWorkflowStatusesSettings {
  return {
    orderStatuses: [
      {
        id: transitStatusId,
        name: "In Transit",
        icon: "local_shipping",
        colorPalette: "blue",
        isInitial: false,
        isDraft: false,
        isTerminal: false,
        countsAsActive: true,
        blocksActions: false,
        readyForPickup: false,
        fulfilled: false,
        canceled: false,
        sendCustomerEmail: false,
        kanbanColumn: false,
        startsInternalTransit: true,
        enabled: true,
        archived: false,
        isDefault: false,
        order: 0,
      },
    ],
    fileStatuses: [],
  };
}

/** Minimal InternalTransitSettings fixture. */
function makeTransitSettings(
  arrivalStatusId?: string,
): InternalTransitSettings {
  return {
    routes: [
      {
        id: "route-1",
        name: "Route 1",
        toWarehouseId: "wh-2",
        departures: [],
        transitMinutes: 60,
        graceMinutes: 0,
        arrivalStatusId,
        enabled: true,
      },
    ],
    timezone: "Europe/Warsaw",
  };
}

/** Build a minimal StoreOrder fixture. */
function orderFixture(overrides: Partial<StoreOrder> = {}): StoreOrder {
  const base: Partial<StoreOrder> = {
    id: "order-1",
    channelId: "ch-1",
    status: "IN_TRANSIT",
    tenantId: "tenant-1",
    internalTransit: {
      state: "SCHEDULED",
      routeId: "route-1",
      destinationWarehouseId: "wh-2",
      expectedArrivalAt: { seconds: 1_699_990_000, nanoseconds: 0 } as never,
      departureAt: { seconds: 1_699_980_000, nanoseconds: 0 } as never,
      scheduledAt: { seconds: 1_699_970_000, nanoseconds: 0 } as never,
    },
    shippingOption: null,
    tracking: undefined,
    activities: [],
    ...overrides,
  };
  return base as StoreOrder;
}

/** Build a fake Firestore query snapshot from an array of orders + optional per-doc ref. */
function makeSnapshot(
  orders: Array<{
    order: StoreOrder;
    ref?: ReturnType<typeof mocks.makeOrderRef>;
  }>,
) {
  const docs = orders.map(({ order, ref }) => {
    const docRef = ref ?? mocks.makeOrderRef(order.id ?? "order-x");
    return {
      id: docRef.id,
      ref: docRef,
      data: () => order,
    };
  });
  return { size: docs.length, docs };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

const dedicatedTenantContext = {
  deploymentMode: "dedicated" as const,
  requireTenantId: false,
  tenantId: undefined,
};

const saasTenantContext = {
  deploymentMode: "saas" as const,
  requireTenantId: true,
  tenantId: "tenant-1",
};

describe("runInternalTransitSweepForTenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: query returns empty snapshot
    mocks.queryGetFn.mockResolvedValue({ size: 0, docs: [] });

    // Default: workflow settings — has IN_TRANSIT status with startsInternalTransit=true
    mocks.mockLoadOrderWorkflowStatusesSettingsForChannel.mockResolvedValue(
      makeWorkflowSettings("IN_TRANSIT"),
    );

    // Default: route with no arrivalStatusId
    mocks.mockLoadInternalTransitSettingsForChannel.mockResolvedValue(
      makeTransitSettings(),
    );

    // Reset whereChain spies
    mocks.whereChain.where.mockReturnThis();
  });

  it("returns zero counters when no orders are due", async () => {
    const result = await runInternalTransitSweepForTenant(
      dedicatedTenantContext,
    );
    expect(result).toEqual({ arrived: 0, failed: 0, scanned: 0, skipped: 0 });
  });

  // ── Case 1: Arrival without transition ──────────────────────────────────────
  it("marks order ARRIVED without status transition when route has no arrivalStatusId", async () => {
    const ref = mocks.makeOrderRef("order-1");
    const order = orderFixture({
      id: "order-1",
      status: "IN_TRANSIT",
      tracking: undefined,
    });
    mocks.queryGetFn.mockResolvedValue(makeSnapshot([{ order, ref }]));

    const result = await runInternalTransitSweepForTenant(
      dedicatedTenantContext,
    );

    expect(result).toEqual({ arrived: 1, failed: 0, scanned: 1, skipped: 0 });

    const [updateData] = ref.update.mock.calls[0];

    // Must have ARRIVED state
    expect(updateData["internalTransit.state"]).toBe("ARRIVED");

    // Must include tracking (no previousDeliveredAt)
    expect(updateData).toHaveProperty("tracking");
    expect(updateData.tracking).toMatchObject({ number: "", link: "" });

    // Must NOT include a status key (no transition)
    expect(updateData).not.toHaveProperty("status");

    // activities sentinel must be present
    expect(updateData.activities).toMatchObject({ _type: "arrayUnion" });
    const { items } = updateData.activities as { items: unknown[] };
    expect(items).toHaveLength(1);

    // Email called with previousDeliveredAt=false and original status
    expect(
      mocks.mockMaybeSendPickupReadyEmailForArrivedOrder,
    ).toHaveBeenCalledOnce();
    const emailCall =
      mocks.mockMaybeSendPickupReadyEmailForArrivedOrder.mock.calls[0][0];
    expect(emailCall.previousDeliveredAt).toBe(false);
    expect(emailCall.order.status).toBe("IN_TRANSIT");
  });

  // ── Case 2: Arrival with transition ─────────────────────────────────────────
  it("transitions status and adds two activities when arrivalStatusId differs from current status", async () => {
    mocks.mockLoadInternalTransitSettingsForChannel.mockResolvedValue(
      makeTransitSettings("READY"),
    );

    const ref = mocks.makeOrderRef("order-2");
    const order = orderFixture({
      id: "order-2",
      status: "IN_TRANSIT",
      tracking: undefined,
    });
    mocks.queryGetFn.mockResolvedValue(makeSnapshot([{ order, ref }]));

    const result = await runInternalTransitSweepForTenant(
      dedicatedTenantContext,
    );

    expect(result).toEqual({ arrived: 1, failed: 0, scanned: 1, skipped: 0 });

    const [updateData] = ref.update.mock.calls[0];

    // Status must be set to arrival status
    expect(updateData.status).toBe("READY");

    // Must have TWO activities in the arrayUnion
    const { items } = updateData.activities as { items: unknown[] };
    expect(items).toHaveLength(2);

    // Email sees the post-transition status
    const emailCall =
      mocks.mockMaybeSendPickupReadyEmailForArrivedOrder.mock.calls[0][0];
    expect(emailCall.order.status).toBe("READY");
  });

  // ── Case 3: arrivalStatusId equals current status → no transition ─────────
  it("does not transition when arrivalStatusId matches current status (shouldTransition guard)", async () => {
    mocks.mockLoadInternalTransitSettingsForChannel.mockResolvedValue(
      makeTransitSettings("IN_TRANSIT"), // same as order.status
    );

    const ref = mocks.makeOrderRef("order-3");
    const order = orderFixture({ id: "order-3", status: "IN_TRANSIT" });
    mocks.queryGetFn.mockResolvedValue(makeSnapshot([{ order, ref }]));

    await runInternalTransitSweepForTenant(dedicatedTenantContext);

    const [updateData] = ref.update.mock.calls[0];
    expect(updateData).not.toHaveProperty("status");

    const { items } = updateData.activities as { items: unknown[] };
    expect(items).toHaveLength(1);
  });

  // ── Case 4: previousDeliveredAt — tracking already present ──────────────────
  it("omits tracking key when order already has deliveredAt, preserving original timestamp", async () => {
    const originalDeliveredAt = { seconds: 1_690_000_000, nanoseconds: 0 };
    const ref = mocks.makeOrderRef("order-4");
    const order = orderFixture({
      id: "order-4",
      tracking: {
        deliveredAt: originalDeliveredAt as never,
        number: "TRACK123",
        link: "https://track.example",
        shippingOption: "DHL",
      },
    });
    mocks.queryGetFn.mockResolvedValue(makeSnapshot([{ order, ref }]));

    const result = await runInternalTransitSweepForTenant(
      dedicatedTenantContext,
    );

    expect(result.arrived).toBe(1);

    const [updateData] = ref.update.mock.calls[0];
    // CHARACTERIZATION: tracking key must be absent when previousDeliveredAt=true
    expect(updateData).not.toHaveProperty("tracking");

    // Email called with previousDeliveredAt=true
    const emailCall =
      mocks.mockMaybeSendPickupReadyEmailForArrivedOrder.mock.calls[0][0];
    expect(emailCall.previousDeliveredAt).toBe(true);

    // updatedOrder.tracking.deliveredAt passed to email must be the ORIGINAL timestamp
    expect(emailCall.order.tracking.deliveredAt).toEqual(originalDeliveredAt);
  });

  // ── Case 5: Staff already moved the order ───────────────────────────────────
  it("skips order when doesOrderWorkflowStatusStartInternalTransit returns false", async () => {
    // Workflow settings where IN_TRANSIT does NOT start internal transit
    mocks.mockLoadOrderWorkflowStatusesSettingsForChannel.mockResolvedValue({
      orderStatuses: [
        {
          id: "IN_TRANSIT",
          name: "In Transit",
          icon: "local_shipping",
          colorPalette: "blue",
          isInitial: false,
          isDraft: false,
          isTerminal: false,
          countsAsActive: true,
          blocksActions: false,
          readyForPickup: false,
          fulfilled: false,
          canceled: false,
          sendCustomerEmail: false,
          kanbanColumn: false,
          startsInternalTransit: false, // staff already moved it
          enabled: true,
          archived: false,
          isDefault: false,
          order: 0,
        },
      ],
      fileStatuses: [],
    } as OrderWorkflowStatusesSettings);

    const ref = mocks.makeOrderRef("order-5");
    const order = orderFixture({ id: "order-5" });
    mocks.queryGetFn.mockResolvedValue(makeSnapshot([{ order, ref }]));

    const result = await runInternalTransitSweepForTenant(
      dedicatedTenantContext,
    );

    expect(result).toEqual({ arrived: 0, failed: 0, scanned: 1, skipped: 1 });
    expect(ref.update).not.toHaveBeenCalled();
    expect(
      mocks.mockMaybeSendPickupReadyEmailForArrivedOrder,
    ).not.toHaveBeenCalled();
  });

  // ── Case 6: Stale snapshot — internalTransit.state is not SCHEDULED ─────────
  it("skips order whose internalTransit.state is not SCHEDULED (stale snapshot)", async () => {
    const ref = mocks.makeOrderRef("order-6");
    const order = orderFixture({
      id: "order-6",
      internalTransit: {
        state: "ARRIVED", // already arrived
        routeId: "route-1",
        destinationWarehouseId: "wh-2",
        expectedArrivalAt: { seconds: 1_699_990_000, nanoseconds: 0 } as never,
        departureAt: { seconds: 1_699_980_000, nanoseconds: 0 } as never,
        scheduledAt: { seconds: 1_699_970_000, nanoseconds: 0 } as never,
      },
    });
    mocks.queryGetFn.mockResolvedValue(makeSnapshot([{ order, ref }]));

    const result = await runInternalTransitSweepForTenant(
      dedicatedTenantContext,
    );

    expect(result).toEqual({ arrived: 0, failed: 0, scanned: 1, skipped: 1 });
    expect(ref.update).not.toHaveBeenCalled();
  });

  // ── Case 7: Missing channelId ────────────────────────────────────────────────
  it("skips order with no channelId", async () => {
    const ref = mocks.makeOrderRef("order-7");
    const order = orderFixture({
      id: "order-7",
      channelId: undefined as never,
    });
    mocks.queryGetFn.mockResolvedValue(makeSnapshot([{ order, ref }]));

    const result = await runInternalTransitSweepForTenant(
      dedicatedTenantContext,
    );

    expect(result).toEqual({ arrived: 0, failed: 0, scanned: 1, skipped: 1 });
    expect(ref.update).not.toHaveBeenCalled();
  });

  // ── Case 8: One order throws, loop continues ─────────────────────────────────
  it("counts failed order and continues to the next order when update rejects", async () => {
    const refBad = mocks.makeOrderRef("order-bad");
    refBad.update.mockRejectedValueOnce(new Error("Firestore write failed"));

    const refGood = mocks.makeOrderRef("order-good");
    const orderBad = orderFixture({ id: "order-bad" });
    const orderGood = orderFixture({ id: "order-good" });

    mocks.queryGetFn.mockResolvedValue(
      makeSnapshot([
        { order: orderBad, ref: refBad },
        { order: orderGood, ref: refGood },
      ]),
    );

    const result = await runInternalTransitSweepForTenant(
      dedicatedTenantContext,
    );

    expect(result).toEqual({ arrived: 1, failed: 1, scanned: 2, skipped: 0 });

    // The bad order's email helper must NOT have been called
    // (because update rejected before we reached the email call)
    // The good order's email helper MUST have been called
    expect(
      mocks.mockMaybeSendPickupReadyEmailForArrivedOrder,
    ).toHaveBeenCalledOnce();
    const emailCall =
      mocks.mockMaybeSendPickupReadyEmailForArrivedOrder.mock.calls[0][0];
    expect(emailCall.order.id).toBe("order-good");
  });

  // ── Case 9: Settings cache — same channel ────────────────────────────────────
  it("calls workflow-status loader only once for two orders in the same channel", async () => {
    const ref1 = mocks.makeOrderRef("order-a");
    const ref2 = mocks.makeOrderRef("order-b");
    const order1 = orderFixture({ id: "order-a", channelId: "ch-1" });
    const order2 = orderFixture({ id: "order-b", channelId: "ch-1" });
    mocks.queryGetFn.mockResolvedValue(
      makeSnapshot([
        { order: order1, ref: ref1 },
        { order: order2, ref: ref2 },
      ]),
    );

    await runInternalTransitSweepForTenant(dedicatedTenantContext);

    expect(
      mocks.mockLoadOrderWorkflowStatusesSettingsForChannel,
    ).toHaveBeenCalledOnce();
    expect(
      mocks.mockLoadOrderWorkflowStatusesSettingsForChannel,
    ).toHaveBeenCalledWith("ch-1");
  });

  // ── Case 10: Tenant scoping in SaaS mode ─────────────────────────────────────
  it("adds tenantId where-clause and consults requireTenantContextTenantId in saas mode", async () => {
    mocks.queryGetFn.mockResolvedValue({ size: 0, docs: [] });

    await runInternalTransitSweepForTenant(saasTenantContext);

    // requireTenantContextTenantId must have been called
    expect(mocks.mockRequireTenantContextTenantId).toHaveBeenCalledWith(
      saasTenantContext,
      "internal transit cron",
    );

    // The tenantId where-clause must have been applied — the whereChain.where
    // spy is called for "tenantId" == <tenantId>
    const whereCalls: Array<[string, string, string]> = mocks.whereChain.where
      .mock.calls as Array<[string, string, string]>;
    const tenantWhereCall = whereCalls.find(
      ([field, , value]) => field === "tenantId" && value === "tenant-1",
    );
    expect(tenantWhereCall).toBeDefined();
  });
});
