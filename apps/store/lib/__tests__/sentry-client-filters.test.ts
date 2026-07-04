import { describe, expect, it } from "vitest";
import { shouldDropNoisySentryClientEvent } from "../sentry-client-filters";

describe("shouldDropNoisySentryClientEvent", () => {
  it("drops transient Firebase auth network failures", () => {
    expect(
      shouldDropNoisySentryClientEvent({
        exception: {
          values: [
            {
              type: "FirebaseError",
              value: "Firebase: Error (auth/network-request-failed).",
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it("drops user-deleted IndexedDB noise", () => {
    expect(
      shouldDropNoisySentryClientEvent({
        message: "IndexedDB database deleted by request of the user",
      }),
    ).toBe(true);
  });

  it("drops Firebase WebChannel aborts", () => {
    expect(
      shouldDropNoisySentryClientEvent({
        exception: {
          values: [
            {
              type: "AbortError",
              value: "The operation was aborted.",
              stacktrace: {
                frames: [
                  {
                    filename:
                      "https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel",
                  },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it("drops expected store route aborts", () => {
    expect(
      shouldDropNoisySentryClientEvent({
        request: {
          url: "https://store.example.com/api/storefront-assistant",
        },
        exception: {
          values: [
            {
              type: "AbortError",
              value: "signal is aborted without reason",
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it("drops App Check reCAPTCHA duplicate setup noise", () => {
    expect(
      shouldDropNoisySentryClientEvent({
        exception: {
          values: [
            {
              type: "FirebaseError",
              value:
                "App Check reCAPTCHA has already been rendered in this element.",
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it("drops WebGL context creation capability failures", () => {
    expect(
      shouldDropNoisySentryClientEvent({
        message: "WebGL context creation failed.",
      }),
    ).toBe(true);
  });

  it("drops stackless WebKit load failures", () => {
    expect(
      shouldDropNoisySentryClientEvent({
        exception: {
          values: [
            {
              type: "TypeError",
              value: "Load failed",
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it("drops stackless client RSC omitted-message wrappers", () => {
    expect(
      shouldDropNoisySentryClientEvent({
        exception: {
          values: [
            {
              type: "Error",
              value:
                "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance.",
            },
          ],
        },
        request: {
          url: "https://www.japaprint.com/en",
        },
      }),
    ).toBe(true);
  });

  it("drops injected microdata readonly assignment noise", () => {
    expect(
      shouldDropNoisySentryClientEvent({
        exception: {
          values: [
            {
              type: "TypeError",
              value:
                "Attempted to assign to readonly property extractFilteredSchemaValuesFromMicroData",
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it("drops browser tooling object lookup noise", () => {
    expect(
      shouldDropNoisySentryClientEvent({
        message:
          "Object Not Found Matching Id:1, MethodName:update, ParamCount:4",
      }),
    ).toBe(true);
  });

  it("drops third-party reCAPTCHA script undefined-property noise", () => {
    expect(
      shouldDropNoisySentryClientEvent({
        exception: {
          values: [
            {
              type: "TypeError",
              value: "Cannot read properties of undefined (reading 'zO')",
              stacktrace: {
                frames: [
                  {
                    filename:
                      "app:///recaptcha/releases/Br0hYqpfWeFzYCAXLD4UuCIV/recaptcha__en.js",
                    function: "CE.<anonymous>",
                  },
                ],
              },
            },
          ],
        },
        request: {
          url: "https://www.japaprint.com/en",
        },
      }),
    ).toBe(true);
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
