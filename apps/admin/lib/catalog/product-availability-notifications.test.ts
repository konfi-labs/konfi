import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelAvailabilityAudit } from "./product-availability-audit";

const mocks = vi.hoisted(() => ({
  mockPublishCreatedAppNotification: vi.fn(),
  mockTimestampNow: vi.fn(() => ({ seconds: 0, nanoseconds: 0 })),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/notifications/app-notifications", () => ({
  publishCreatedAppNotification: mocks.mockPublishCreatedAppNotification,
}));

vi.mock("firebase-admin/firestore", () => ({
  Timestamp: {
    now: mocks.mockTimestampNow,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal ChannelAvailabilityAudit with one entry expiring in
 * `daysUntilExpiration` days.
 */
function makeAudit(
  channelId: string,
  daysUntilExpiration: number,
): ChannelAvailabilityAudit {
  return {
    channelId,
    channelName: channelId,
    entries: [
      {
        productId: "p1",
        productName: "Product 1",
        sourceChannelId: channelId,
        status: {
          isExpired: false,
          isExpiringSoon: true,
          daysUntilExpiration,
          expirationDate: new Date("2026-07-01T00:00:00.000Z"),
        },
      },
    ],
  };
}

/**
 * Builds a Firestore mock where each doc id can have an independent
 * `exists` / `data` result. Unregistered ids default to non-existent.
 */
function makeFirestore(
  docOverrides: Record<
    string,
    { exists: boolean; data?: () => Record<string, unknown> }
  > = {},
) {
  const setMock = vi.fn().mockResolvedValue(undefined);

  const firestoreMock = {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockImplementation((id: string) => ({
        get: vi.fn().mockResolvedValue(
          docOverrides[id] ?? { exists: false, data: () => undefined },
        ),
        set: setMock,
      })),
    }),
    _set: setMock,
  };

  return firestoreMock;
}

// A fixed "now" within the week starting 2026-06-09 (Monday).
// windowIndex = floor(1749513600000 / (7 * 86_400_000)) = 2892
const NOW = new Date("2026-06-13T08:00:00.000Z");
const WINDOW_INDEX = Math.floor(NOW.getTime() / (7 * 86_400_000));

// A "now" advanced by exactly 7 days → next window.
const NOW_NEXT_WEEK = new Date(NOW.getTime() + 7 * 86_400_000);
const WINDOW_INDEX_NEXT = Math.floor(NOW_NEXT_WEEK.getTime() / (7 * 86_400_000));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createAvailabilityNotifications (Option B: 7-day window dedupe)", () => {
  let createAvailabilityNotifications: (typeof import("./product-availability-notifications"))["createAvailabilityNotifications"];

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ createAvailabilityNotifications } = await vi.importActual<
      typeof import("./product-availability-notifications")
    >("./product-availability-notifications"));
  });

  it("creates a notification when no doc exists for the bucket+window", async () => {
    // Case 1: existing.exists === false → set should be called once.
    const fs = makeFirestore(); // all ids default to non-existent
    const audits = [makeAudit("ch1", 5)];

    const count = await createAvailabilityNotifications({
      firestore: fs as unknown as FirebaseFirestore.Firestore,
      audits,
      now: NOW,
    });

    expect(count).toBe(1);
    expect(fs._set).toHaveBeenCalledTimes(1);
    expect(mocks.mockPublishCreatedAppNotification).toHaveBeenCalledTimes(1);
  });

  it("skips creation when a current-window notification exists and is not archived", async () => {
    // Case 2: doc exists, archived = false → skip; set must not be called.
    const currentId = `product-availability::ch1::7::${WINDOW_INDEX}`;
    const fs = makeFirestore({
      [currentId]: { exists: true, data: () => ({ archived: false }) },
    });
    const audits = [makeAudit("ch1", 5)];

    const count = await createAvailabilityNotifications({
      firestore: fs as unknown as FirebaseFirestore.Firestore,
      audits,
      now: NOW,
    });

    expect(count).toBe(0);
    expect(fs._set).not.toHaveBeenCalled();
    expect(mocks.mockPublishCreatedAppNotification).not.toHaveBeenCalled();
  });

  it("does not recreate an archived notification within the same window (bug regression)", async () => {
    // Case 3 — the core fix for Option B.
    // An archived doc for the CURRENT window already exists.
    // The cron runs again in the same week → the id is identical →
    // existing.exists is true → skip. Archiving now sticks for the window.
    const currentId = `product-availability::ch1::7::${WINDOW_INDEX}`;
    const fs = makeFirestore({
      [currentId]: { exists: true, data: () => ({ archived: true }) },
    });
    const audits = [makeAudit("ch1", 5)];

    const count = await createAvailabilityNotifications({
      firestore: fs as unknown as FirebaseFirestore.Firestore,
      audits,
      now: NOW,
    });

    expect(count).toBe(0);
    expect(fs._set).not.toHaveBeenCalled();
    expect(mocks.mockPublishCreatedAppNotification).not.toHaveBeenCalled();
  });

  it("re-notifies in a new window even when the previous window's notification was archived", async () => {
    // Case 4: now advanced by ≥7 days → WINDOW_INDEX_NEXT differs from
    // WINDOW_INDEX. The new-window id does not exist → fresh notification IS
    // created.
    expect(WINDOW_INDEX_NEXT).toBeGreaterThan(WINDOW_INDEX);

    const previousId = `product-availability::ch1::7::${WINDOW_INDEX}`;
    const fs = makeFirestore({
      // Previous window's doc exists and is archived — should be ignored
      // because the new id uses WINDOW_INDEX_NEXT.
      [previousId]: { exists: true, data: () => ({ archived: true }) },
    });
    const audits = [makeAudit("ch1", 5)];

    const count = await createAvailabilityNotifications({
      firestore: fs as unknown as FirebaseFirestore.Firestore,
      audits,
      now: NOW_NEXT_WEEK,
    });

    expect(count).toBe(1);
    expect(fs._set).toHaveBeenCalledTimes(1);
    expect(mocks.mockPublishCreatedAppNotification).toHaveBeenCalledTimes(1);

    // Verify the new id includes the next-window index.
    const calledWithId = (mocks.mockPublishCreatedAppNotification.mock.calls[0][0] as { id: string }).id;
    expect(calledWithId).toContain(`::${WINDOW_INDEX_NEXT}`);
  });
});
