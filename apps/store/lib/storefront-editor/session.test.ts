import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createStorefrontEditorToken,
  DEFAULT_STOREFRONT_EDITOR_TOKEN_AGE_SECONDS,
  MAX_STOREFRONT_EDITOR_TOKEN_AGE_SECONDS,
  verifyStorefrontEditorToken,
} from "./session";

vi.mock("server-only", () => ({}));

describe("storefront editor session tokens", () => {
  beforeEach(() => {
    vi.stubEnv("KONFI_STOREFRONT_EDITOR_SECRET", "test-editor-secret");
    vi.useRealTimers();
  });

  it("creates and verifies a scoped preview token", () => {
    vi.setSystemTime(new Date("2026-05-23T10:00:00.000Z"));
    vi.useFakeTimers();

    const token = createStorefrontEditorToken({
      channelId: "tenant_default",
      tenantId: "tenant",
      uid: "user_1",
    });

    expect(verifyStorefrontEditorToken(token)).toMatchObject({
      channelId: "tenant_default",
      expiresAt:
        Math.floor(Date.now() / 1000) +
        DEFAULT_STOREFRONT_EDITOR_TOKEN_AGE_SECONDS,
      tenantId: "tenant",
      uid: "user_1",
    });
  });

  it("caps custom preview token expiry", () => {
    vi.setSystemTime(new Date("2026-05-23T10:00:00.000Z"));
    vi.useFakeTimers();

    const token = createStorefrontEditorToken({
      channelId: "tenant_default",
      expiresInSeconds: MAX_STOREFRONT_EDITOR_TOKEN_AGE_SECONDS * 2,
      tenantId: "tenant",
      uid: "user_1",
    });

    expect(verifyStorefrontEditorToken(token)).toMatchObject({
      expiresAt:
        Math.floor(Date.now() / 1000) + MAX_STOREFRONT_EDITOR_TOKEN_AGE_SECONDS,
    });
  });

  it("rejects tampered and expired preview tokens", () => {
    vi.setSystemTime(new Date("2026-05-23T10:00:00.000Z"));
    vi.useFakeTimers();

    const token = createStorefrontEditorToken({
      channelId: "tenant_default",
      expiresInSeconds: 10,
      tenantId: "tenant",
      uid: "user_1",
    });

    expect(verifyStorefrontEditorToken(`${token}x`)).toBeNull();

    vi.setSystemTime(new Date("2026-05-23T10:00:11.000Z"));

    expect(verifyStorefrontEditorToken(token)).toBeNull();
  });
});
