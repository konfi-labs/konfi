import { describe, expect, it } from "vitest";
import {
  getChannelNotificationEmails,
  getInboundRecipientAliasTokens,
  normalizeEmailAddress,
  parseEmailAddress,
  resolveAdminForwardingSender,
  resolveChannelForwardingAliasRecipientMatch,
  resolveChannelForwardingRecipientMatch,
  resolveChannelForwardingSenderMatch,
  resolveChannelForwardingAdminRecipient,
  resolveInboundEmailChannel,
  resolveInboundForwardingAdmin,
} from "./addressing";
import type { Channel, Member } from "@konfi/types";

describe("inbound email addressing", () => {
  it("parses mailbox display names and normalizes email casing", () => {
    expect(parseEmailAddress('"Buyer Example" <Buyer@Example.COM>')).toEqual({
      email: "buyer@example.com",
      name: "Buyer Example",
      raw: '"Buyer Example" <Buyer@Example.COM>',
    });
    expect(normalizeEmailAddress(" Admin@Example.local ")).toBe(
      "admin@example.local",
    );
  });

  it("resolves responses only to the matching channel notification email", () => {
    const members = [
      {
        email: "orders@print.example",
        id: "member-1",
        name: "Admin",
      },
      {
        email: "other@example.local",
        id: "member-2",
        name: "Other",
      },
    ] as Member[];

    const recipient = resolveChannelForwardingAdminRecipient({
      channel: {
        notifications: {
          email: "orders@print.example",
          enabledTypes: [],
        },
      } as Pick<Channel, "notifications">,
      members,
      recipients: [
        "orders@print.example",
        "Admin <admin@example.local>",
        "customer@example.com",
      ],
    });

    expect(recipient).toEqual({
      email: "orders@print.example",
      member: {
        id: "member-1",
        name: "Admin",
      },
    });
  });

  it("supports comma-separated channel notification emails", () => {
    expect(
      getChannelNotificationEmails({
        notifications: {
          emails: "orders@print.example, quotes@print.example",
          enabledTypes: [],
        },
      } as Pick<Channel, "notifications">),
    ).toEqual(["orders@print.example", "quotes@print.example"]);
  });

  it("resolves the inbound channel from the matching notification email", () => {
    const channels = [
      {
        id: "channel-a",
        notifications: {
          email: "orders-a@print.example",
          enabledTypes: [],
        },
      },
      {
        id: "channel-b",
        notifications: {
          email: "orders-b@print.example",
          enabledTypes: [],
        },
      },
    ] as Channel[];

    expect(
      resolveChannelForwardingRecipientMatch({
        channels,
        recipients: ["Print <orders-b@print.example>"],
      }),
    ).toEqual({
      channel: channels[1],
      email: "orders-b@print.example",
    });
  });

  it("resolves the inbound channel from a konfi plus-address alias", () => {
    const channels = [
      {
        id: "channel-a",
        name: "General Print",
        notifications: {
          enabledTypes: [],
        },
      },
      {
        id: "channel-b",
        name: "Express Desk",
        notifications: {
          enabledTypes: [],
        },
      },
    ] as Channel[];

    expect(
      resolveChannelForwardingAliasRecipientMatch({
        channels,
        recipients: ["Konfi Express <konfi+expressdesk@mail.print.example>"],
      }),
    ).toEqual({
      channel: channels[1],
      email: "konfi+expressdesk@mail.print.example",
    });
  });

  it("resolves the production W33 inbound alias from the channel name", () => {
    const channels = [
      {
        id: "zb4nsPKNggYHyMxNB6O5",
        name: "PL",
        notifications: {
          email: "zielonka@japa-druk.pl",
          enabledTypes: [],
        },
      },
      {
        id: "qnukXLmJ3JZ5dbAd9nA8",
        name: "W33",
        notifications: {
          email: "zielonka@japa-druk.pl",
          enabledTypes: [],
        },
      },
    ] as Channel[];

    expect(
      resolveChannelForwardingAliasRecipientMatch({
        channels,
        recipients: ["konfi+w33@mail.japaprint.com"],
      }),
    ).toEqual({
      channel: channels[1],
      email: "konfi+w33@mail.japaprint.com",
    });
  });

  it("extracts normalized konfi plus-address alias tokens", () => {
    expect(
      getInboundRecipientAliasTokens([
        "Konfi Express <konfi+Express.Desk@mail.print.example>",
        "orders@print.example",
      ]),
    ).toEqual(["expressdesk"]);
  });

  it("returns null when a konfi plus-address alias matches multiple channels", () => {
    const channels = [
      {
        id: "expressdesk",
        name: "Offset",
        notifications: {
          enabledTypes: [],
        },
      },
      {
        id: "channel-b",
        name: "Express Desk",
        notifications: {
          enabledTypes: [],
        },
      },
    ] as Channel[];

    expect(
      resolveChannelForwardingAliasRecipientMatch({
        channels,
        recipients: ["konfi+expressdesk@mail.print.example"],
      }),
    ).toBeNull();
  });

  it("resolves the inbound channel from a forwarding sender notification email", () => {
    const channels = [
      {
        id: "channel-a",
        notifications: {
          emails: ["orders-a@print.example"],
          enabledTypes: [],
        },
      },
      {
        id: "channel-b",
        notifications: {
          emails: ["forwarding-admin@example.com"],
          enabledTypes: [],
        },
      },
    ] as Channel[];

    expect(
      resolveChannelForwardingSenderMatch({
        channels,
        sender: "Forwarding Admin <forwarding-admin@example.com>",
      }),
    ).toEqual({
      channel: channels[1],
      email: "forwarding-admin@example.com",
    });
  });

  it("restricts forwarding sender notification matches to allowed channels", () => {
    const channels = [
      {
        id: "channel-a",
        notifications: {
          emails: ["forwarding-admin@example.com"],
          enabledTypes: [],
        },
      },
      {
        id: "channel-b",
        notifications: {
          emails: ["forwarding-admin@example.com"],
          enabledTypes: [],
        },
      },
    ] as Channel[];

    expect(
      resolveChannelForwardingSenderMatch({
        allowedChannelIds: ["channel-b"],
        channels,
        sender: "Forwarding Admin <forwarding-admin@example.com>",
      }),
    ).toEqual({
      channel: channels[1],
      email: "forwarding-admin@example.com",
    });
  });

  it("resolves the inbound channel from a non-member forwarding sender email", () => {
    const channels = [
      {
        id: "channel-a",
        name: "PL",
        notifications: {
          emails: ["orders-a@print.example"],
          enabledTypes: [],
        },
      },
      {
        id: "channel-b",
        name: "W33",
        notifications: {
          emails: ["zielonka@japa-druk.pl"],
          enabledTypes: [],
        },
      },
    ] as Channel[];

    expect(
      resolveInboundEmailChannel({
        channels,
        recipients: ["Konfi inbound <konfi@mail.japaprint.com>"],
        sender: "Zielonka <zielonka@japa-druk.pl>",
      }),
    ).toBe(channels[1]);
  });

  it("returns null when multiple channels match the inbound recipients", () => {
    const channels = [
      {
        id: "channel-a",
        notifications: {
          email: "shared@print.example",
          enabledTypes: [],
        },
      },
      {
        id: "channel-b",
        notifications: {
          email: "shared@print.example",
          enabledTypes: [],
        },
      },
    ] as Channel[];

    expect(
      resolveChannelForwardingRecipientMatch({
        channels,
        recipients: ["shared@print.example"],
      }),
    ).toBeNull();
  });

  it("returns null when recipients do not include a channel email", () => {
    expect(
      resolveChannelForwardingAdminRecipient({
        channel: {
          notifications: {
            email: "orders@print.example",
            enabledTypes: [],
          },
        } as Pick<Channel, "notifications">,
        members: [],
        recipients: ["unknown@print.example"],
      }),
    ).toBeNull();
  });

  it("uses a matching channel sender email as the forwarding admin fallback", () => {
    const recipient = resolveInboundForwardingAdmin({
      channel: {
        notifications: {
          emails: ["zielonka@japa-druk.pl"],
          enabledTypes: [],
        },
      } as Pick<Channel, "notifications">,
      members: [],
      recipients: ["Konfi inbound <konfi+w33@mail.japaprint.com>"],
      sender: "Zielonka <zielonka@japa-druk.pl>",
    });

    expect(recipient).toEqual({
      email: "zielonka@japa-druk.pl",
      member: {
        id: "inbound-email-agent",
        name: "Inbound email agent",
      },
    });
  });

  it("resolves a forwarding admin from the message sender", () => {
    const recipient = resolveAdminForwardingSender({
      members: [
        {
          email: "Admin.Example@Print.Example",
          id: "member-1",
          name: "Admin Example",
        },
      ] as Member[],
      sender: '"Admin Example" <admin.example@print.example>',
    });

    expect(recipient).toEqual({
      email: "admin.example@print.example",
      member: {
        id: "member-1",
        name: "Admin Example",
      },
    });
  });
});
