import { describe, expect, it } from "vitest";
import { normalizeTenantContextHint } from "./tenant-handoff";

describe("tenant handoff helpers", () => {
  it("normalizes tenant context hints from Cloud runtime links", () => {
    expect(normalizeTenantContextHint(" tenant_123 ")).toBe("tenant_123");
    expect(normalizeTenantContextHint("tenant-abc")).toBe("tenant-abc");
  });

  it("rejects empty or unsafe tenant context hints", () => {
    expect(normalizeTenantContextHint("")).toBeUndefined();
    expect(normalizeTenantContextHint("../tenant")).toBeUndefined();
    expect(normalizeTenantContextHint("tenant/123")).toBeUndefined();
  });
});
