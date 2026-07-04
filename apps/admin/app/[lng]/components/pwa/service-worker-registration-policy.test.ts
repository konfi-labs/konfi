import { describe, expect, it } from "vitest";
import {
  ADMIN_SERVICE_WORKER_CLEANUP_RELOAD_KEY,
  isUnavailableServiceWorkerScriptResponse,
  shouldReloadAfterAdminServiceWorkerCleanup,
  shouldRegisterAdminServiceWorker,
  shouldSkipAdminServiceWorkerForHostname,
} from "./service-worker-registration-policy";

describe("service worker registration policy", () => {
  it("skips Vercel deployment hostnames", () => {
    expect(
      shouldSkipAdminServiceWorkerForHostname(
        "admin-lvzt-cynaqde89-dawid-sobolewskis-projects.vercel.app",
      ),
    ).toBe(true);
    expect(shouldSkipAdminServiceWorkerForHostname("admin.japaprint.com")).toBe(
      false,
    );
  });

  it("registers only in production or when explicitly enabled", () => {
    expect(
      shouldRegisterAdminServiceWorker({
        hostname: "localhost",
        nodeEnv: "development",
      }),
    ).toBe(false);
    expect(
      shouldRegisterAdminServiceWorker({
        hostname: "localhost",
        nodeEnv: "development",
        enableOverride: "true",
      }),
    ).toBe(true);
    expect(
      shouldRegisterAdminServiceWorker({
        hostname: "admin.japaprint.com",
        nodeEnv: "production",
      }),
    ).toBe(true);
    expect(
      shouldRegisterAdminServiceWorker({
        hostname: "admin-preview.vercel.app",
        nodeEnv: "production",
      }),
    ).toBe(false);
  });

  it("treats unauthorized service worker scripts as unavailable", () => {
    expect(
      isUnavailableServiceWorkerScriptResponse(
        new Response("", { status: 401 }),
      ),
    ).toBe(true);
    expect(
      isUnavailableServiceWorkerScriptResponse(
        new Response("self.addEventListener('install', () => {});", {
          status: 200,
        }),
      ),
    ).toBe(false);
  });

  it("reloads once after cleaning up an active controlled worker", () => {
    expect(ADMIN_SERVICE_WORKER_CLEANUP_RELOAD_KEY).toBe(
      "konfi-admin-sw-cleanup-reloaded",
    );
    expect(
      shouldReloadAfterAdminServiceWorkerCleanup({
        cleanupReloaded: false,
        hadController: true,
        hadRegistrations: true,
      }),
    ).toBe(true);
    expect(
      shouldReloadAfterAdminServiceWorkerCleanup({
        cleanupReloaded: true,
        hadController: true,
        hadRegistrations: true,
      }),
    ).toBe(false);
    expect(
      shouldReloadAfterAdminServiceWorkerCleanup({
        cleanupReloaded: false,
        hadController: false,
        hadRegistrations: true,
      }),
    ).toBe(false);
  });
});
