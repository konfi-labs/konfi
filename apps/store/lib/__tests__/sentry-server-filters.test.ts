import { describe, expect, it } from "vitest";
import { shouldDropNoisySentryServerRequestError } from "../sentry-server-filters";

describe("shouldDropNoisySentryServerRequestError", () => {
  it("drops closed RSC stream request errors", () => {
    expect(
      shouldDropNoisySentryServerRequestError(
        {
          message: "Connection closed.",
          stack:
            "react-server-dom-turbopack-client.node.production.js:2126:39",
        },
        {
          request: {
            method: "POST",
            path: "/en",
          },
          routerKind: "App Router",
          routerPath: "/[lng]",
          routeType: "render",
        },
      ),
    ).toBe(true);
  });

  it("keeps ordinary server render errors", () => {
    expect(
      shouldDropNoisySentryServerRequestError(
        {
          message: "Store runtime config could not be resolved.",
        },
        {
          routerKind: "App Router",
          routerPath: "/[lng]/page",
          routeType: "render",
        },
      ),
    ).toBe(false);
  });
});
