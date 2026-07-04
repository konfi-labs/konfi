import { describe, expect, it } from "vitest";

import { getGoogleAuthConfig } from "./auth";

describe("getGoogleAuthConfig", () => {
  it("throws a deterministic error when credentials are missing", () => {
    expect(() =>
      getGoogleAuthConfig({
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "project-a",
      }),
    ).toThrow(
      "GOOGLE_APPLICATION_CREDENTIALS environment variable is required",
    );
  });

  it("throws a deterministic error when project id is missing", () => {
    const credentials = Buffer.from(
      JSON.stringify({
        client_email: "merchant@example.com",
        private_key: "private-key",
      }),
    ).toString("base64");

    expect(() =>
      getGoogleAuthConfig({
        GOOGLE_APPLICATION_CREDENTIALS: credentials,
      }),
    ).toThrow(
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID environment variable is required",
    );
  });
});
