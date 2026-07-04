import { describe, expect, it } from "vitest";
import { resolveAdminSessionRoute } from "./auth-session-route";

describe("resolveAdminSessionRoute", () => {
  it("uses a safe login redirect when one is present", () => {
    expect(
      resolveAdminSessionRoute({
        currentPath: "/pl/auth/login?redirect=%2Fpl%2Forders",
        hasToken: true,
        pathname: "/pl/auth/login",
        safeRedirect: "/pl/orders",
      }),
    ).toEqual({
      route: "/pl/orders",
      usedLoginRedirect: true,
    });
  });

  it("routes authenticated login pages to the dashboard when no redirect is present", () => {
    expect(
      resolveAdminSessionRoute({
        currentPath: "/pl/auth/login",
        hasToken: true,
        pathname: "/pl/auth/login",
        safeRedirect: null,
      }),
    ).toEqual({
      route: "/",
      usedLoginRedirect: false,
    });
  });

  it("preserves login pages without a token", () => {
    expect(
      resolveAdminSessionRoute({
        currentPath: "/pl/auth/login",
        hasToken: false,
        pathname: "/pl/auth/login",
        safeRedirect: null,
      }),
    ).toEqual({
      route: "/pl/auth/login",
      usedLoginRedirect: false,
    });
  });

  it("preserves authenticated non-login routes", () => {
    expect(
      resolveAdminSessionRoute({
        currentPath: "/pl/orders?page=2",
        hasToken: true,
        pathname: "/pl/orders",
        safeRedirect: null,
      }),
    ).toEqual({
      route: "/pl/orders?page=2",
      usedLoginRedirect: false,
    });
  });
});
