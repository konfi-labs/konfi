import { describe, expect, it } from "vitest";
import {
  GOOGLE_REDIRECT_CURRENT_USER_MAX_AGE_MS,
  isRecentFirebaseSignIn,
  shouldFallbackToGoogleRedirect,
} from "./google-auth-flow";

describe("shouldFallbackToGoogleRedirect", () => {
  it("falls back when popups are blocked or unsupported", () => {
    expect(shouldFallbackToGoogleRedirect("auth/popup-blocked")).toBe(true);
    expect(
      shouldFallbackToGoogleRedirect(
        "auth/operation-not-supported-in-this-environment",
      ),
    ).toBe(true);
  });

  it("does not redirect after user cancellation", () => {
    expect(shouldFallbackToGoogleRedirect("auth/popup-closed-by-user")).toBe(
      false,
    );
    expect(shouldFallbackToGoogleRedirect("auth/cancelled-popup-request")).toBe(
      false,
    );
  });
});

describe("isRecentFirebaseSignIn", () => {
  const nowMs = Date.parse("2026-06-10T10:00:00.000Z");

  it("accepts a current redirect fallback user signed in recently", () => {
    expect(isRecentFirebaseSignIn("2026-06-10T09:59:30.000Z", nowMs)).toBe(
      true,
    );
  });

  it("rejects stale persisted users", () => {
    expect(
      isRecentFirebaseSignIn(
        new Date(
          nowMs - GOOGLE_REDIRECT_CURRENT_USER_MAX_AGE_MS - 1,
        ).toISOString(),
        nowMs,
      ),
    ).toBe(false);
  });

  it("rejects missing, invalid, and future timestamps", () => {
    expect(isRecentFirebaseSignIn(undefined, nowMs)).toBe(false);
    expect(isRecentFirebaseSignIn("not a date", nowMs)).toBe(false);
    expect(isRecentFirebaseSignIn("2026-06-10T10:00:01.000Z", nowMs)).toBe(
      false,
    );
  });
});
