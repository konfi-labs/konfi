import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertSaasRuntimeQuotaAction,
  recordSaasRuntimeQuotaUsageAction,
} from "@/actions/saas-runtime-quotas";
import {
  countActiveSettingsDefinitions,
  enforceConfigurableSettingsQuota,
  recordConfigurableSettingsQuotaUsage,
} from "./settings-quota.client";

vi.mock("@/actions/saas-runtime-quotas", () => ({
  assertSaasRuntimeQuotaAction: vi.fn(),
  recordSaasRuntimeQuotaUsageAction: vi.fn(),
}));

const assertQuotaMock = vi.mocked(assertSaasRuntimeQuotaAction);
const recordUsageMock = vi.mocked(recordSaasRuntimeQuotaUsageAction);

describe("settings quota helpers", () => {
  beforeEach(() => {
    assertQuotaMock.mockReset();
    recordUsageMock.mockReset();
  });

  it("counts only enabled non-archived definitions", () => {
    expect(
      countActiveSettingsDefinitions([
        { enabled: true, archived: false },
        { enabled: false, archived: false },
        { enabled: true, archived: true },
        {},
      ]),
    ).toBe(2);
  });

  it("allows edits and archives without consuming quota", async () => {
    await expect(
      enforceConfigurableSettingsQuota({
        current: 4,
        next: 4,
        operation: "settings.save",
        resource: "configurableStatuses",
      }),
    ).resolves.toBe(0);

    expect(assertQuotaMock).not.toHaveBeenCalled();
  });

  it("asserts only the active-count increase", async () => {
    await expect(
      enforceConfigurableSettingsQuota({
        current: 2,
        next: 5,
        operation: "settings.save",
        resource: "configurableUnits",
      }),
    ).resolves.toBe(3);

    expect(assertQuotaMock).toHaveBeenCalledWith({
      current: 2,
      operation: "settings.save",
      requested: 3,
      resource: "configurableUnits",
    });
  });

  it("records usage only when active count increased", async () => {
    await recordConfigurableSettingsQuotaUsage({
      current: 5,
      operation: "settings.save",
      requested: 0,
      resource: "configurableCurrencies",
    });
    expect(recordUsageMock).not.toHaveBeenCalled();

    await recordConfigurableSettingsQuotaUsage({
      current: 5,
      operation: "settings.save",
      requested: 2,
      resource: "configurableCurrencies",
    });
    expect(recordUsageMock).toHaveBeenCalledWith({
      current: 5,
      operation: "settings.save",
      requested: 2,
      resource: "configurableCurrencies",
    });
  });
});
