import { NotificationType } from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  buildReminderJobs,
  formatNoPaymentDocumentLine,
  formatStalledOrderLine,
  type ReminderChannelRecord,
  type ReminderMemberRecord,
  type ReminderOrderRecord,
} from "./helpers";

const baseChannel: ReminderChannelRecord = {
  id: "channel-1",
  name: "Main channel",
  notifications: {
    email: "channel@example.com",
    enabledTypes: [
      NotificationType.STALLED_ORDERS_REMINDER,
      NotificationType.NO_PAYMENT_DOCUMENTS,
    ],
  },
};

const baseMember: ReminderMemberRecord = {
  email: "member@example.com",
  id: "member-1",
  name: "Ada",
};

const baseOrder: ReminderOrderRecord = {
  channelId: "channel-1",
  createdById: "member-1",
  deadlineSeconds: 100,
  id: "order-1",
  number: 42,
};

describe("buildReminderJobs", () => {
  it("prefers member-specific notification email overrides", () => {
    const jobs = buildReminderJobs({
      channels: [baseChannel],
      currentTimestampSeconds: 100 + 3 * 86400,
      fallbackEmail: "fallback@example.com",
      kind: "stalled-orders-reminder",
      members: [
        {
          ...baseMember,
          notifications: {
            [NotificationType.STALLED_ORDERS_REMINDER]: {
              email: "override@example.com",
              enabled: true,
            },
          },
        },
      ],
      notificationType: NotificationType.STALLED_ORDERS_REMINDER,
      orders: [baseOrder],
      subjectForMember: (memberName) => `Subject ${memberName}`,
      toOrderLine: (order, context) =>
        formatStalledOrderLine(
          order,
          context.channelsById.get(order.channelId)?.name ?? "",
          context.currentTimestampSeconds,
        ),
    });

    expect(jobs).toEqual([
      {
        kind: "stalled-orders-reminder",
        memberId: "member-1",
        memberName: "Ada",
        notificationEmail: "override@example.com",
        orderLines: [
          "nr.42 w kanale sprzedaży Main channel (3 dni po terminie)",
        ],
        subject: "Subject Ada",
      },
    ]);
  });

  it("falls back to the global notifications email when member and channel email are missing", () => {
    const jobs = buildReminderJobs({
      channels: [
        {
          ...baseChannel,
          notifications: {
            enabledTypes: [NotificationType.NO_PAYMENT_DOCUMENTS],
          },
        },
      ],
      currentTimestampSeconds: 0,
      fallbackEmail: "fallback@example.com",
      kind: "no-payment-document-id",
      members: [{ ...baseMember, email: undefined }],
      notificationType: NotificationType.NO_PAYMENT_DOCUMENTS,
      orders: [baseOrder],
      subjectForMember: (memberName) => `Subject ${memberName}`,
      toOrderLine: (order, context) =>
        formatNoPaymentDocumentLine(
          order,
          context.channelsById.get(order.channelId)?.name ?? "",
        ),
    });

    expect(jobs[0]?.notificationEmail).toBe("fallback@example.com");
  });

  it("skips reminders when the channel disables the notification type", () => {
    const jobs = buildReminderJobs({
      channels: [
        {
          ...baseChannel,
          notifications: {
            email: "channel@example.com",
            enabledTypes: [],
          },
        },
      ],
      currentTimestampSeconds: 0,
      kind: "stalled-orders-reminder",
      members: [baseMember],
      notificationType: NotificationType.STALLED_ORDERS_REMINDER,
      orders: [baseOrder],
      subjectForMember: (memberName) => `Subject ${memberName}`,
      toOrderLine: (order, context) =>
        formatStalledOrderLine(
          order,
          context.channelsById.get(order.channelId)?.name ?? "",
          context.currentTimestampSeconds,
        ),
    });

    expect(jobs).toEqual([]);
  });

  it("creates separate jobs when one member has orders in multiple channels", () => {
    const jobs = buildReminderJobs({
      channels: [
        {
          ...baseChannel,
          id: "channel-1",
          name: "Enabled channel",
          notifications: {
            email: "channel-one@example.com",
            enabledTypes: [NotificationType.NO_PAYMENT_DOCUMENTS],
          },
        },
        {
          ...baseChannel,
          id: "channel-2",
          name: "Disabled channel",
          notifications: {
            email: "channel-two@example.com",
            enabledTypes: [],
          },
        },
      ],
      currentTimestampSeconds: 0,
      kind: "no-payment-document-id",
      members: [{ ...baseMember, email: undefined }],
      notificationType: NotificationType.NO_PAYMENT_DOCUMENTS,
      orders: [
        { ...baseOrder, id: "order-1", number: 42, channelId: "channel-1" },
        { ...baseOrder, id: "order-2", number: 43, channelId: "channel-2" },
      ],
      subjectForMember: (memberName) => `Subject ${memberName}`,
      toOrderLine: (order, context) =>
        formatNoPaymentDocumentLine(
          order,
          context.channelsById.get(order.channelId)?.name ?? "",
        ),
    });

    expect(jobs).toEqual([
      {
        kind: "no-payment-document-id",
        memberId: "member-1",
        memberName: "Ada",
        notificationEmail: "channel-one@example.com",
        orderLines: ["nr.42 w kanale sprzedaży Enabled channel"],
        subject: "Subject Ada",
      },
    ]);
  });

  it("skips reminders when no valid order line can be built", () => {
    const jobs = buildReminderJobs({
      channels: [baseChannel],
      currentTimestampSeconds: 0,
      kind: "no-payment-document-id",
      members: [baseMember],
      notificationType: NotificationType.NO_PAYMENT_DOCUMENTS,
      orders: [{ ...baseOrder, channelId: "missing-channel" }],
      subjectForMember: (memberName) => `Subject ${memberName}`,
      toOrderLine: (order, context) => {
        const channelName = context.channelsById.get(order.channelId)?.name;
        return channelName
          ? formatNoPaymentDocumentLine(order, channelName)
          : undefined;
      },
    });

    expect(jobs).toEqual([]);
  });
});
