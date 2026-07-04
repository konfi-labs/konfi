import { describe, expect, it } from "vitest";

import { extractRefreshTokenFromMsalCache } from "./auth";

describe("extractRefreshTokenFromMsalCache", () => {
  it("selects the refresh token matching the response account and client", () => {
    const cacheData = JSON.stringify({
      RefreshToken: {
        unrelated: {
          clientId: "other-client",
          environment: "login.microsoftonline.com",
          homeAccountId: "other-account",
          realm: "tenant-a",
          secret: "wrong-refresh-token",
          target: "openid profile offline_access Mail.Read",
        },
        matching: {
          clientId: "client-a",
          environment: "login.microsoftonline.com",
          homeAccountId: "account-a",
          realm: "tenant-a",
          secret: "expected-refresh-token",
          target: "openid profile offline_access Mail.Read",
        },
      },
    });

    expect(
      extractRefreshTokenFromMsalCache(cacheData, {
        clientId: "client-a",
        environment: "login.microsoftonline.com",
        homeAccountId: "account-a",
        scopes: ["openid", "profile", "offline_access", "Mail.Read"],
        tenantId: "tenant-a",
      }),
    ).toBe("expected-refresh-token");
  });

  it("does not return the first token when metadata does not match", () => {
    const cacheData = JSON.stringify({
      RefreshToken: {
        first: {
          clientId: "other-client",
          secret: "wrong-refresh-token",
        },
      },
    });

    expect(
      extractRefreshTokenFromMsalCache(cacheData, {
        clientId: "client-a",
        homeAccountId: "account-a",
      }),
    ).toBeUndefined();
  });
});
