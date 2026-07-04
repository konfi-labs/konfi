import { describe, expect, it } from "vitest";
import {
  canUseGoogleRedirectCurrentUser,
  GOOGLE_PROVIDER_ID,
  STORE_GOOGLE_REDIRECT_CURRENT_USER_MAX_AGE_MS,
} from "./google-auth-flow";

describe("canUseGoogleRedirectCurrentUser", () => {
  const nowMs = Date.parse("2026-06-10T10:00:00.000Z");

  it("accepts a recent Google sign-in fallback user", () => {
    expect(
      canUseGoogleRedirectCurrentUser({
        isAnonymous: false,
        lastSignInTime: "2026-06-10T09:59:30.000Z",
        mode: "sign-in",
        nowMs,
        providerIds: [GOOGLE_PROVIDER_ID],
      }),
    ).toBe(true);
  });

  it("accepts a recent Google-linked fallback user", () => {
    expect(
      canUseGoogleRedirectCurrentUser({
        isAnonymous: false,
        lastSignInTime: "2026-06-10T09:59:30.000Z",
        mode: "link",
        nowMs,
        providerIds: [GOOGLE_PROVIDER_ID],
      }),
    ).toBe(true);
  });

  it("rejects stale persisted users", () => {
    expect(
      canUseGoogleRedirectCurrentUser({
        isAnonymous: false,
        lastSignInTime: new Date(
          nowMs - STORE_GOOGLE_REDIRECT_CURRENT_USER_MAX_AGE_MS - 1,
        ).toISOString(),
        mode: "sign-in",
        nowMs,
        providerIds: [GOOGLE_PROVIDER_ID],
      }),
    ).toBe(false);
  });

  it("rejects users without a linked Google provider", () => {
    expect(
      canUseGoogleRedirectCurrentUser({
        isAnonymous: false,
        lastSignInTime: "2026-06-10T09:59:30.000Z",
        mode: "sign-in",
        nowMs,
        providerIds: ["password"],
      }),
    ).toBe(false);
  });

  it("rejects anonymous sign-in fallback users", () => {
    expect(
      canUseGoogleRedirectCurrentUser({
        isAnonymous: true,
        lastSignInTime: "2026-06-10T09:59:30.000Z",
        mode: "sign-in",
        nowMs,
        providerIds: [GOOGLE_PROVIDER_ID],
      }),
    ).toBe(false);
  });
});
