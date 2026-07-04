import { describe, expect, it } from "vitest";
import { shouldDropNoisySentryClientEvent } from "./sentry-client-filters";

describe("shouldDropNoisySentryClientEvent", () => {
  it("drops protected-preview service worker update failures", () => {
    expect(
      shouldDropNoisySentryClientEvent({
        exception: {
          values: [
            {
              type: "TypeError",
              value:
                "Failed to update a ServiceWorker for scope ('https://admin-preview.vercel.app/') with script ('https://admin-preview.vercel.app/sw.js'): A bad HTTP response code (401) was received when fetching the script.",
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it("drops framework-only RSC connection closed reports", () => {
    expect(
      shouldDropNoisySentryClientEvent({
        exception: {
          values: [
            {
              type: "Error",
              value: "Connection closed.",
              stacktrace: {
                frames: [
                  {
                    filename:
                      "node_modules/next/dist/compiled/react-server-dom-turbopack/cjs/react-server-dom-turbopack-client.browser.production.js",
                    function: "close",
                  },
                ],
              },
            },
          ],
        },
        request: {
          url: "https://admin.japaprint.com/pl/tools",
        },
      }),
    ).toBe(true);
  });

  it("keeps connection closed errors when first-party frames are present", () => {
    expect(
      shouldDropNoisySentryClientEvent({
        exception: {
          values: [
            {
              type: "Error",
              value: "Connection closed.",
              stacktrace: {
                frames: [
                  {
                    filename:
                      "node_modules/next/dist/compiled/react-server-dom-turbopack/cjs/react-server-dom-turbopack-client.browser.production.js",
                  },
                  {
                    filename: "webpack-internal:///(app)/app/[lng]/tools/page.tsx",
                  },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it("keeps normal application errors", () => {
    expect(
      shouldDropNoisySentryClientEvent({
        exception: {
          values: [
            {
              type: "TypeError",
              value: "Cannot read properties of undefined",
            },
          ],
        },
      }),
    ).toBe(false);
  });
});
