import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ADMIN_PRODUCT_PREVIEW_MAX_AGE_SECONDS,
  createAdminProductPreviewSession,
  isAdminProductPreviewRequested,
  verifyAdminProductPreviewSession,
} from "./product-preview.server";

describe("admin product preview sessions", () => {
  beforeEach(() => {
    process.env.STORE_ADMIN_PREVIEW_SECRET = "test-preview-secret";
    delete process.env.ADMIN_PRODUCT_PREVIEW_SECRET;
    delete process.env.ADMIN_FIREBASE_SERVICE_ACCOUNT;
  });

  it("creates a signed session that can be verified before it expires", () => {
    const nowMs = 1_800_000_000_000;
    const session = createAdminProductPreviewSession("admin-user", nowMs);

    expect(verifyAdminProductPreviewSession(session, nowMs)).toEqual({
      exp: Math.floor(nowMs / 1000) + ADMIN_PRODUCT_PREVIEW_MAX_AGE_SECONDS,
      uid: "admin-user",
    });
  });

  it("rejects expired sessions", () => {
    const nowMs = 1_800_000_000_000;
    const session = createAdminProductPreviewSession("admin-user", nowMs);

    expect(
      verifyAdminProductPreviewSession(
        session,
        nowMs + ADMIN_PRODUCT_PREVIEW_MAX_AGE_SECONDS * 1000 + 1000,
      ),
    ).toBeNull();
  });

  it("rejects tampered payloads", () => {
    const nowMs = 1_800_000_000_000;
    const session = createAdminProductPreviewSession("admin-user", nowMs);
    const [payload, signature] = session.split(".");
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...decoded, uid: "other-user" }),
      "utf8",
    ).toString("base64url");

    expect(
      verifyAdminProductPreviewSession(`${tamperedPayload}.${signature}`, nowMs),
    ).toBeNull();
  });

  it("parses explicit admin preview query values", () => {
    expect(isAdminProductPreviewRequested("1")).toBe(true);
    expect(isAdminProductPreviewRequested("admin")).toBe(true);
    expect(isAdminProductPreviewRequested(["true"])).toBe(true);
    expect(isAdminProductPreviewRequested("0")).toBe(false);
    expect(isAdminProductPreviewRequested(undefined)).toBe(false);
  });
});