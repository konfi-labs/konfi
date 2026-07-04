import "server-only";

import { sendEmail } from "@/lib/email";
import { getAdminDb, getTenantContext } from "@/lib/firebase/serverApp";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";
import { requireTenantContextTenantId } from "@konfi/firebase";
import {
  NoPaymentDocumentReminder,
  StalledOrdersReminder,
} from "@konfi/emails";
import {
  Channel,
  Member,
  NotificationType,
  Order,
  OrderStatus,
} from "@konfi/types";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { createElement } from "react";
import { Timestamp } from "firebase-admin/firestore";
import {
  buildReminderJobs,
  formatNoPaymentDocumentLine,
  formatStalledOrderLine,
  type ReminderChannelRecord,
  type ReminderEmailJob,
  type ReminderMemberRecord,
  type ReminderOrderRecord,
} from "./helpers";

const THREE_DAYS_IN_SECONDS = 3 * 24 * 60 * 60;
const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;

export type OrderReminderKind =
  | "stalled-orders-reminder"
  | "no-payment-document-id";

export interface OrderReminderJobBatch {
  jobs: ReminderEmailJob[];
  scannedOrders: number;
}

function getRequiredEnvironmentVariable(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not defined`);
  }

  return value;
}

function getAdminFirestore() {
  return getAdminDb();
}

function toReminderOrderRecord(
  snapshot: FirebaseFirestore.QueryDocumentSnapshot,
): ReminderOrderRecord {
  const data = snapshot.data() as Order;

  return {
    channelId: data.channelId,
    createdById: data.createdBy.id,
    deadlineSeconds: data.deadline?.seconds,
    id: snapshot.id,
    number: data.number,
  };
}

function shouldScopeToTenant(tenantContext: TenantContext) {
  return (
    tenantContext.deploymentMode === "saas" || tenantContext.requireTenantId
  );
}

function getTenantScopeId(tenantContext: TenantContext): string | undefined {
  return shouldScopeToTenant(tenantContext)
    ? requireTenantContextTenantId(tenantContext, "order reminder cron")
    : undefined;
}

async function loadMembersAndChannels(tenantContext: TenantContext) {
  const firestore = getAdminFirestore();
  const tenantId = getTenantScopeId(tenantContext);
  const membersQuery = tenantId
    ? firestore.collection("members").where("tenantId", "==", tenantId)
    : firestore.collection("members");
  const channelsQuery = tenantId
    ? firestore.collection("channels").where("tenantId", "==", tenantId)
    : firestore.collection("channels");
  const [membersSnapshot, channelsSnapshot] = await Promise.all([
    membersQuery.get(),
    channelsQuery.get(),
  ]);

  return {
    channels: channelsSnapshot.docs.map((doc) => ({
      ...(doc.data() as Channel),
      id: doc.id,
    })) satisfies ReminderChannelRecord[],
    members: membersSnapshot.docs.map((doc) => ({
      ...(doc.data() as Member),
      id: doc.id,
    })) satisfies ReminderMemberRecord[],
  };
}

function buildStalledOrderLine(
  order: ReminderOrderRecord,
  context: {
    channelsById: Map<string, ReminderChannelRecord>;
    currentTimestampSeconds: number;
  },
) {
  const channelName = context.channelsById.get(order.channelId)?.name;

  if (!channelName) {
    console.error(
      `Channel not found for stalled order ${order.id} (${order.number})`,
    );
    return undefined;
  }

  return formatStalledOrderLine(
    order,
    channelName,
    context.currentTimestampSeconds,
  );
}

function buildMissingPaymentDocumentLine(
  order: ReminderOrderRecord,
  context: {
    channelsById: Map<string, ReminderChannelRecord>;
    currentTimestampSeconds: number;
  },
) {
  const channelName = context.channelsById.get(order.channelId)?.name;

  if (!channelName) {
    console.error(
      `Channel not found for missing payment document order ${order.id} (${order.number})`,
    );
    return undefined;
  }

  return formatNoPaymentDocumentLine(order, channelName);
}

export async function collectStalledOrderReminderJobsStep(): Promise<OrderReminderJobBatch> {
  "use step";

  return collectStalledOrderReminderJobsForTenantStep();
}

export async function collectStalledOrderReminderJobsForTenantStep(
  tenantId?: string,
): Promise<OrderReminderJobBatch> {
  "use step";

  const firestore = getAdminFirestore();
  const tenantContext = getTenantContext(tenantId);
  const tenantScopeId = getTenantScopeId(tenantContext);
  const currentTimestamp = Timestamp.now();
  const threeDaysAgo = new Timestamp(
    currentTimestamp.seconds - THREE_DAYS_IN_SECONDS,
    0,
  );
  let ordersQuery: FirebaseFirestore.Query = firestore
    .collectionGroup("orders")
    .where("active", "==", true)
    .where("status", "not-in", [
      OrderStatus.FULFILLED,
      OrderStatus.CANCELED,
      OrderStatus.DRAFT,
      OrderStatus.READY,
    ])
    .where("createdAt", "<=", threeDaysAgo)
    .where("deadline", "<=", currentTimestamp);
  if (tenantScopeId) {
    ordersQuery = ordersQuery.where("tenantId", "==", tenantScopeId);
  }

  const [ordersSnapshot, context] = await Promise.all([
    ordersQuery.get(),
    loadMembersAndChannels(tenantContext),
  ]);

  const jobs = buildReminderJobs({
    channels: context.channels,
    currentTimestampSeconds: currentTimestamp.seconds,
    fallbackEmail: isSharedSaasTenantRuntime(tenantContext)
      ? undefined
      : process.env.NOTIFICATIONS_EMAIL?.trim() || undefined,
    kind: "stalled-orders-reminder",
    members: context.members,
    notificationType: NotificationType.STALLED_ORDERS_REMINDER,
    orders: ordersSnapshot.docs.map(toReminderOrderRecord),
    subjectForMember: (memberName) => `Zaległe zamówienia - ${memberName}`,
    toOrderLine: buildStalledOrderLine,
  });

  return {
    jobs,
    scannedOrders: ordersSnapshot.size,
  };
}

export async function collectNoPaymentDocumentReminderJobsStep(): Promise<OrderReminderJobBatch> {
  "use step";

  return collectNoPaymentDocumentReminderJobsForTenantStep();
}

export async function collectNoPaymentDocumentReminderJobsForTenantStep(
  tenantId?: string,
): Promise<OrderReminderJobBatch> {
  "use step";

  const firestore = getAdminFirestore();
  const tenantContext = getTenantContext(tenantId);
  const tenantScopeId = getTenantScopeId(tenantContext);
  const currentTimestamp = Timestamp.now();
  const sevenDaysAgo = new Timestamp(
    currentTimestamp.seconds - SEVEN_DAYS_IN_SECONDS,
    0,
  );
  let ordersQuery: FirebaseFirestore.Query = firestore
    .collectionGroup("orders")
    .where("active", "==", true)
    .where("paymentDocumentId", "==", "")
    .where("createdAt", "<=", sevenDaysAgo);
  if (tenantScopeId) {
    ordersQuery = ordersQuery.where("tenantId", "==", tenantScopeId);
  }

  const [ordersSnapshot, context] = await Promise.all([
    ordersQuery.get(),
    loadMembersAndChannels(tenantContext),
  ]);

  const jobs = buildReminderJobs({
    channels: context.channels,
    currentTimestampSeconds: currentTimestamp.seconds,
    fallbackEmail: isSharedSaasTenantRuntime(tenantContext)
      ? undefined
      : process.env.NOTIFICATIONS_EMAIL?.trim() || undefined,
    kind: "no-payment-document-id",
    members: context.members,
    notificationType: NotificationType.NO_PAYMENT_DOCUMENTS,
    orders: ordersSnapshot.docs.map(toReminderOrderRecord),
    subjectForMember: (memberName) =>
      `Brakujące dokumenty płatności - ${memberName}`,
    toOrderLine: buildMissingPaymentDocumentLine,
  });

  return {
    jobs,
    scannedOrders: ordersSnapshot.size,
  };
}

export async function sendOrderReminderEmailStep(
  job: ReminderEmailJob,
  tenantId?: string,
) {
  "use step";

  const tenantContext = getTenantContext(tenantId);
  const noReplyEmail = isSharedSaasTenantRuntime(tenantContext)
    ? undefined
    : getRequiredEnvironmentVariable("NO_REPLY_EMAIL");
  const template =
    job.kind === "stalled-orders-reminder"
      ? createElement(StalledOrdersReminder, {
          orderLines: job.orderLines,
          subject: job.subject,
        })
      : createElement(NoPaymentDocumentReminder, {
          orderLines: job.orderLines,
          subject: job.subject,
        });

  await sendEmail({
    to: job.notificationEmail,
    from: noReplyEmail,
    subject: job.subject,
    tenantContext,
    template,
  });

  console.log(
    `Sent ${job.kind} reminder to ${job.notificationEmail} for member ${job.memberName}`,
  );

  return {
    memberId: job.memberId,
    notificationEmail: job.notificationEmail,
    orderCount: job.orderLines.length,
  };
}
