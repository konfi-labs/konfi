import "server-only";

import { getAdminDb } from "@/lib/firebase/serverApp";
import { withTenantOwned } from "@konfi/firebase";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { FieldValue } from "firebase-admin/firestore";
import type { ForwardingAdminRecipient } from "./addressing";
import { createSystemInboundMember } from "./creation";
import type {
  InboundEmailContent,
  InboundEmailRecord,
  InboundRoutingDecision,
  ResendInboundWebhookEvent,
} from "./types";

function getDb() {
  return getAdminDb();
}

function normalizeText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function withInboundTenant<T extends object>(
  data: T & { tenantId?: string | null },
  tenantContext: TenantContext | undefined,
  operationName: string,
) {
  return tenantContext
    ? withTenantOwned(data, tenantContext, operationName)
    : data;
}

export function buildInboundEmailRecord({
  adminRecipient,
  channelId,
  content,
  event,
  tenantContext,
}: {
  adminRecipient: ForwardingAdminRecipient | null;
  channelId: string;
  content: InboundEmailContent;
  event: ResendInboundWebhookEvent;
  tenantContext?: TenantContext;
}): InboundEmailRecord {
  return withInboundTenant(
    {
      adminRecipientEmail: adminRecipient?.email ?? "",
      attachments: event.data.attachments ?? [],
      bcc: event.data.bcc ?? [],
      cc: event.data.cc ?? [],
      channelId,
      createdBy: adminRecipient?.member ?? createSystemInboundMember(),
      eventCreatedAt: event.created_at,
      from: event.data.from,
      headers: content.headers,
      html: content.html ?? null,
      id: event.data.email_id,
      messageId: event.data.message_id,
      resendEmailId: event.data.email_id,
      routingDecision: null,
      runId: null,
      status: "received",
      subject: normalizeText(event.data.subject),
      text: normalizeText(content.text),
      to: event.data.to,
    },
    tenantContext,
    "inbound email record",
  );
}

export function buildInboundEmailUpdate(
  data: Record<string, unknown> & { tenantId?: string | null },
  tenantContext: TenantContext | undefined,
  operationName: string,
) {
  return withInboundTenant(data, tenantContext, operationName);
}

export async function getInboundEmailRecord(inboundEmailId: string) {
  const snapshot = await getDb()
    .collection("inboundEmails")
    .doc(inboundEmailId)
    .get();

  return snapshot.exists ? (snapshot.data() as InboundEmailRecord) : null;
}

export async function persistInboundEmailRecordIfNew(
  record: InboundEmailRecord,
  tenantContext?: TenantContext,
) {
  const db = getDb();
  const docRef = db.collection("inboundEmails").doc(record.id);
  const recordForWrite = withInboundTenant(
    record,
    tenantContext,
    "inbound email record",
  );

  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(docRef);

    if (existing.exists) {
      return {
        created: false,
        record: existing.data() as InboundEmailRecord,
      };
    }

    transaction.set(docRef, {
      ...recordForWrite,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      created: true,
      record: recordForWrite,
    };
  });
}

export async function markInboundEmailWorkflowStarted({
  inboundEmailId,
  runId,
  tenantContext,
}: {
  inboundEmailId: string;
  runId: string;
  tenantContext?: TenantContext;
}) {
  await getDb()
    .collection("inboundEmails")
    .doc(inboundEmailId)
    .set(
      buildInboundEmailUpdate(
        {
          runId,
          updatedAt: FieldValue.serverTimestamp(),
        },
        tenantContext,
        "inbound email workflow start",
      ),
      { merge: true },
    );
}

export async function claimInboundEmailStartContextResolved({
  adminRecipient,
  channelId,
  inboundEmailId,
  tenantContext,
}: {
  adminRecipient: ForwardingAdminRecipient;
  channelId: string;
  inboundEmailId: string;
  tenantContext?: TenantContext;
}) {
  const db = getDb();
  const docRef = db.collection("inboundEmails").doc(inboundEmailId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(docRef);

    if (!snapshot.exists) return false;

    const record = snapshot.data() as InboundEmailRecord;

    const blockReason = record.routingDecision?.blockReason;
    const canRepairNoChannel =
      !record.channelId && blockReason === "no-channel";
    const canRepairNoForwardingAdmin =
      record.channelId === channelId &&
      !record.adminRecipientEmail &&
      blockReason === "no-forwarding-admin";

    if (
      record.status !== "blocked" ||
      record.runId ||
      (!canRepairNoChannel && !canRepairNoForwardingAdmin)
    ) {
      return false;
    }

    transaction.set(
      docRef,
      buildInboundEmailUpdate(
        {
          adminRecipientEmail: adminRecipient.email,
          channelId,
          createdBy: adminRecipient.member,
          routingDecision: null,
          status: "received",
          updatedAt: FieldValue.serverTimestamp(),
        },
        tenantContext,
        "inbound email start context repair",
      ),
      { merge: true },
    );

    return true;
  });
}

export async function persistBlockedInboundEmail({
  decision,
  inboundEmailId,
  tenantContext,
}: {
  decision: InboundRoutingDecision;
  inboundEmailId: string;
  tenantContext?: TenantContext;
}) {
  await getDb()
    .collection("inboundEmails")
    .doc(inboundEmailId)
    .set(
      buildInboundEmailUpdate(
        {
          routingDecision: decision,
          status: "blocked",
          updatedAt: FieldValue.serverTimestamp(),
        },
        tenantContext,
        "blocked inbound email",
      ),
      { merge: true },
    );
}
