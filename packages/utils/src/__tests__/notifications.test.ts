import {
  type Channel,
  type ChannelNotificationSettings,
  NotificationType,
} from "@konfi/types";
import { describe, expect, it } from "vitest";

import {
  getChannelNotificationEmail,
  getChannelNotificationEmails,
  parseEmailString,
} from "../notifications";

function createChannel(
  notifications?: Partial<ChannelNotificationSettings>,
): Channel {
  return {
    notifications,
  } as Channel;
}

describe("parseEmailString", () => {
  it("returns an empty array for empty input", () => {
    expect(parseEmailString("")).toEqual([]);
    expect(parseEmailString("   \n\t  ")).toEqual([]);
  });

  it("parses comma, semicolon, and newline separated emails", () => {
    expect(
      parseEmailString(
        "ops@example.com; support@example.com\nbilling@example.com",
      ),
    ).toEqual([
      "ops@example.com",
      "support@example.com",
      "billing@example.com",
    ]);
  });

  it("filters invalid entries and duplicate emails", () => {
    expect(
      parseEmailString(" ops@example.com , invalid, ops@example.com"),
    ).toEqual(["ops@example.com"]);
  });
});

describe("getChannelNotificationEmails", () => {
  it("returns deduplicated multi-email notification recipients", () => {
    const channel = createChannel({
      enabledTypes: [NotificationType.STORE_ORDER_CREATED],
      emails: [" ops@example.com ", "support@example.com", "ops@example.com"],
      email: "legacy@example.com",
    });

    expect(
      getChannelNotificationEmails(channel, "fallback@example.com"),
    ).toEqual(["ops@example.com", "support@example.com", "legacy@example.com"]);
  });

  it("parses string recipients and falls back only when no channel email exists", () => {
    const channel = createChannel({
      enabledTypes: [NotificationType.STORE_ORDER_CREATED],
      emails: "ops@example.com; support@example.com",
    });

    expect(
      getChannelNotificationEmails(channel, "fallback@example.com"),
    ).toEqual(["ops@example.com", "support@example.com"]);
    expect(
      getChannelNotificationEmails(createChannel(), "fallback@example.com"),
    ).toEqual(["fallback@example.com"]);
  });

  it("keeps the deprecated single-email wrapper compatible", () => {
    expect(
      getChannelNotificationEmail(
        createChannel({
          enabledTypes: [NotificationType.STORE_ORDER_CREATED],
          emails: ["ops@example.com", "support@example.com"],
        }),
        "fallback@example.com",
      ),
    ).toBe("ops@example.com");

    expect(
      getChannelNotificationEmail(
        createChannel({
          enabledTypes: [NotificationType.STORE_ORDER_CREATED],
          emails: "string@example.com; support@example.com",
        }),
        "fallback@example.com",
      ),
    ).toBe("string@example.com");

    expect(
      getChannelNotificationEmail(
        createChannel({
          enabledTypes: [NotificationType.STORE_ORDER_CREATED],
          email: "legacy@example.com",
        }),
        "fallback@example.com",
      ),
    ).toBe("legacy@example.com");

    expect(
      getChannelNotificationEmail(
        createChannel({
          enabledTypes: [NotificationType.STORE_ORDER_CREATED],
        }),
        "fallback@example.com",
      ),
    ).toBe("fallback@example.com");
  });
});
