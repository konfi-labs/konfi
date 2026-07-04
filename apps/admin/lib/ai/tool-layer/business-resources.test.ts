import { describe, expect, it } from "vitest";
import { sanitizeBusinessRecordData } from "./business-resources";

describe("sanitizeBusinessRecordData", () => {
  it("redacts API token key variants", () => {
    expect(
      sanitizeBusinessRecordData({
        apiToken: "secret-1",
        api_token: "secret-2",
        nested: {
          providerApiToken: "secret-3",
        },
      }),
    ).toMatchObject({
      apiToken: "[redacted]",
      api_token: "[redacted]",
      nested: {
        providerApiToken: "[redacted]",
      },
    });
  });
});
