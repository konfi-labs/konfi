import { describe, expect, it } from "vitest";

import {
  readTenantModuleAccess,
  readTenantModuleFlags,
  shouldReadTenantModuleAccess,
} from "./tenant-module-access";

describe("tenant module access", () => {
  it("reads SaaS module flags from runtime snapshots and tenant overrides", () => {
    expect(
      shouldReadTenantModuleAccess({
        deploymentMode: "saas",
        requireTenantId: true,
      }),
    ).toBe(true);
    expect(
      readTenantModuleFlags({
        moduleFlags: { aiImage: true },
        runtimePlanSnapshot: {
          moduleFlags: { aiImage: false, imposition: false },
        },
      }),
    ).toEqual({
      aiImage: true,
      imposition: false,
    });
  });

  it("denies free plan image access while allowing quota override", () => {
    expect(
      readTenantModuleAccess({ planId: "free" }, "aiImage", {
        denyFreePlan: true,
      }),
    ).toBe(false);
    expect(
      readTenantModuleAccess(
        { planId: "free", quotaEnforcementDisabled: true },
        "aiImage",
        { denyFreePlan: true },
      ),
    ).toBe(true);
  });

  it("denies modules explicitly disabled by the plan", () => {
    expect(
      readTenantModuleAccess(
        {
          planId: "starter",
          planSnapshot: {
            moduleFlags: { imposition: false },
          },
        },
        "imposition",
      ),
    ).toBe(false);
  });
});
