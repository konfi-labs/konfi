import {
  ChannelNotificationSettings,
  MemberNotificationSettings,
  NotificationType,
} from "@konfi/types";

export interface ReminderMemberRecord {
  email?: string;
  id: string;
  name: string;
  notifications?: MemberNotificationSettings;
}

export interface ReminderChannelRecord {
  id: string;
  name: string;
  notifications?: ChannelNotificationSettings;
}

export interface ReminderOrderRecord {
  channelId: string;
  createdById: string;
  deadlineSeconds?: number;
  id: string;
  number: number;
}

export interface ReminderEmailJob {
  kind: "stalled-orders-reminder" | "no-payment-document-id";
  memberId: string;
  memberName: string;
  notificationEmail: string;
  orderLines: string[];
  subject: string;
}

interface BuildReminderJobsParams {
  channels: ReminderChannelRecord[];
  currentTimestampSeconds: number;
  fallbackEmail?: string;
  kind: "stalled-orders-reminder" | "no-payment-document-id";
  members: ReminderMemberRecord[];
  notificationType: NotificationType;
  orders: ReminderOrderRecord[];
  subjectForMember: (memberName: string) => string;
  toOrderLine: (
    order: ReminderOrderRecord,
    context: {
      channelsById: Map<string, ReminderChannelRecord>;
      currentTimestampSeconds: number;
    },
  ) => string | undefined;
}

function isNotificationEnabled(params: {
  channel?: ReminderChannelRecord;
  member: ReminderMemberRecord;
  notificationType: NotificationType;
}) {
  const { channel, member, notificationType } = params;
  const memberNotification = member.notifications?.[notificationType];

  if (memberNotification !== undefined) {
    return memberNotification.enabled;
  }

  if (channel?.notifications) {
    return channel.notifications.enabledTypes.includes(notificationType);
  }

  return true;
}

function getNotificationEmail(params: {
  channel?: ReminderChannelRecord;
  fallbackEmail?: string;
  member: ReminderMemberRecord;
  notificationType: NotificationType;
}) {
  const { channel, fallbackEmail, member, notificationType } = params;
  const memberNotification = member.notifications?.[notificationType];

  if (memberNotification?.email) {
    return memberNotification.email;
  }

  if (member.email) {
    return member.email;
  }

  if (channel?.notifications?.email) {
    return channel.notifications.email;
  }

  return fallbackEmail;
}

export function formatStalledOrderLine(
  order: ReminderOrderRecord,
  channelName: string,
  currentTimestampSeconds: number,
) {
  if (order.deadlineSeconds === undefined) {
    return undefined;
  }

  const daysOverdue = Math.floor(
    (currentTimestampSeconds - order.deadlineSeconds) / 86400,
  );

  return `nr.${order.number} w kanale sprzedaży ${channelName} (${daysOverdue} dni po terminie)`;
}

export function formatNoPaymentDocumentLine(
  order: ReminderOrderRecord,
  channelName: string,
) {
  return `nr.${order.number} w kanale sprzedaży ${channelName}`;
}

export function buildReminderJobs({
  channels,
  currentTimestampSeconds,
  fallbackEmail,
  kind,
  members,
  notificationType,
  orders,
  subjectForMember,
  toOrderLine,
}: BuildReminderJobsParams): ReminderEmailJob[] {
  const membersById = new Map(members.map((member) => [member.id, member]));
  const channelsById = new Map(
    channels.map((channel) => [channel.id, channel]),
  );
  const ordersByMemberAndChannel = new Map<string, ReminderOrderRecord[]>();

  for (const order of orders) {
    const jobKey = `${order.createdById}:${order.channelId}`;
    const memberOrders = ordersByMemberAndChannel.get(jobKey);

    if (memberOrders) {
      memberOrders.push(order);
      continue;
    }

    ordersByMemberAndChannel.set(jobKey, [order]);
  }

  const jobs: ReminderEmailJob[] = [];

  for (const [jobKey, memberOrders] of ordersByMemberAndChannel) {
    if (memberOrders.length === 0) {
      continue;
    }

    const [memberId] = jobKey.split(":");
    const member = membersById.get(memberId);
    if (!member) {
      continue;
    }

    const channel = channelsById.get(memberOrders[0].channelId);
    const enabled = isNotificationEnabled({
      channel,
      member,
      notificationType,
    });

    if (!enabled) {
      continue;
    }

    const notificationEmail = getNotificationEmail({
      channel,
      fallbackEmail,
      member,
      notificationType,
    });

    if (!notificationEmail) {
      continue;
    }

    const orderLines = memberOrders
      .map((order) =>
        toOrderLine(order, {
          channelsById,
          currentTimestampSeconds,
        }),
      )
      .filter((value): value is string => value !== undefined);

    if (orderLines.length === 0) {
      continue;
    }

    jobs.push({
      kind,
      memberId,
      memberName: member.name,
      notificationEmail,
      orderLines,
      subject: subjectForMember(member.name),
    });
  }

  return jobs;
}
