import { describe, expect, it } from "vitest";
import type { TenantModuleFlags, TenantPlanLimits } from "./index";
import type {
  KnownUsageMetricKey,
  LimitDeniedEvent,
  UsageDelta,
  UsageMetricUnit,
} from "./usage-control";

const configurableSettingsMetricKeys = [
  "settings.statuses.count",
  "settings.units.count",
  "settings.currencies.count",
] satisfies KnownUsageMetricKey[];

describe("usage control contracts", () => {
  it("supports optional commerce module flags for SaaS provisioning", () => {
    const moduleFlags = {
      rmaWorkflow: true,
      taxEngine: true,
    } satisfies TenantModuleFlags;

    expect(moduleFlags).toEqual({
      rmaWorkflow: true,
      taxEngine: true,
    });
  });

  it("supports configurable settings plan limits", () => {
    const limits = {
      maxConfigurableCurrencies: 3,
      maxConfigurableStatuses: 12,
      maxConfigurableUnits: 8,
    } satisfies TenantPlanLimits;

    expect(limits).toEqual({
      maxConfigurableCurrencies: 3,
      maxConfigurableStatuses: 12,
      maxConfigurableUnits: 8,
    });
  });

  it("uses count units for configurable settings metric keys", () => {
    const unit = "count" satisfies UsageMetricUnit;
    const deltas = configurableSettingsMetricKeys.map(
      (key): UsageDelta => ({
        amount: 1,
        key,
        unit,
      }),
    );

    expect(deltas).toEqual([
      {
        amount: 1,
        key: "settings.statuses.count",
        unit: "count",
      },
      {
        amount: 1,
        key: "settings.units.count",
        unit: "count",
      },
      {
        amount: 1,
        key: "settings.currencies.count",
        unit: "count",
      },
    ]);
  });

  it("allows limit denied events for configurable settings metrics", () => {
    const event = {
      attempted: 4,
      current: 3,
      eventId: "event_123",
      hard: true,
      key: "settings.currencies.count",
      limit: 3,
      occurredAt: "2026-05-18T12:00:00.000Z",
      reason: "hard_limit_exceeded",
      source: "runtime",
      type: "usage.limit_denied",
      unit: "count",
    } satisfies LimitDeniedEvent;

    expect(event.key).toBe("settings.currencies.count");
    expect(event.unit).toBe("count");
  });
});
