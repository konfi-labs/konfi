import {
  buildInboundEmailRecord,
  claimInboundEmailStartContextResolved,
  createBlockedRoutingDecision,
  fetchReceivedEmailContent,
  getInboundEmailRecord,
  loadInboundEmailStartContextStep,
  markInboundEmailWorkflowStarted,
  persistBlockedInboundEmail,
  persistInboundEmailRecordIfNew,
  getInboundRecipientAliasTokens,
  resolveInboundForwardingAdmin,
  runInboundEmailWorkflow,
  verifyResendInboundWebhookPayload,
  type InboundEmailRecord,
  type InboundEmailStartContext,
  type ResendWebhookHeaders,
} from "@/lib/ai/inbound-email";
import type { SenderAuthentication } from "@/lib/ai/inbound-email/sender-auth";
import { getTenantContext } from "@/lib/firebase/serverApp";
import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";

export const maxDuration = 120;

function getWebhookHeaders(headers: Headers): ResendWebhookHeaders {
  return {
    id: headers.get("svix-id") ?? "",
    signature: headers.get("svix-signature") ?? "",
    timestamp: headers.get("svix-timestamp") ?? "",
  };
}

function getWebhookSecret() {
  return process.env.RESEND_WEBHOOK_SECRET ?? "";
}

function createNoAdminDecision(senderAuthentication: SenderAuthentication) {
  return createBlockedRoutingDecision({
    blockReason: "no-forwarding-admin",
    missingInformation: [
      "No forwarding admin recipient could be resolved from the inbound email sender or recipients.",
    ],
    rationale:
      "No forwarding admin recipient matched the inbound email sender or recipients, so no automated response can be sent safely.",
    senderAuthentication,
  });
}

function createNoChannelDecision(senderAuthentication: SenderAuthentication) {
  return createBlockedRoutingDecision({
    blockReason: "no-channel",
    missingInformation: [
      "No channel could be resolved from the inbound email recipients or forwarding sender.",
    ],
    rationale:
      "No unique channel could be resolved from the inbound email recipients or forwarding sender, so the workflow cannot safely choose catalog and settings.",
    senderAuthentication,
  });
}

function shouldRepairBlockedStartContextRecord(record: InboundEmailRecord) {
  const blockReason = record.routingDecision?.blockReason;

  return (
    record.status === "blocked" &&
    !record.runId &&
    ((!record.channelId && blockReason === "no-channel") ||
      (Boolean(record.channelId) &&
        !record.adminRecipientEmail &&
        blockReason === "no-forwarding-admin"))
  );
}

function resolveInboundAdminRecipient({
  context,
  recipients,
  sender,
}: {
  context: InboundEmailStartContext;
  recipients: readonly string[];
  sender: string;
}) {
  return resolveInboundForwardingAdmin({
    channel: context.channel,
    members: context.members,
    recipients,
    sender,
  });
}

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const webhookHeaders = getWebhookHeaders(request.headers);

  let event;
  try {
    event = verifyResendInboundWebhookPayload({
      headers: webhookHeaders,
      payload,
      webhookSecret: getWebhookSecret(),
    });
  } catch (error) {
    console.error("[Inbound Email] Invalid Resend webhook:", error);

    return NextResponse.json(
      { error: "Invalid Resend webhook" },
      { status: 400 },
    );
  }

  try {
    const inboundEmailId = event.data.email_id;
    const existing = await getInboundEmailRecord(inboundEmailId);

    if (existing) {
      if (shouldRepairBlockedStartContextRecord(existing)) {
        const context = await loadInboundEmailStartContextStep({
          channelId: existing.channelId || undefined,
          recipients: existing.to.length > 0 ? existing.to : event.data.to,
          sender: existing.from || event.data.from,
        });
        const adminRecipient = context.channel
          ? resolveInboundAdminRecipient({
              context,
              recipients: existing.to.length > 0 ? existing.to : event.data.to,
              sender: existing.from || event.data.from,
            })
          : null;

        if (context.channel && adminRecipient) {
          const tenantContext = getTenantContext(
            context.channel.tenantId ?? undefined,
          );
          const repairClaimed = await claimInboundEmailStartContextResolved({
            adminRecipient,
            channelId: context.channelId,
            inboundEmailId,
            tenantContext,
          });

          if (!repairClaimed) {
            const latest = await getInboundEmailRecord(inboundEmailId);

            return NextResponse.json(
              {
                duplicate: true,
                runId: latest?.runId ?? null,
                status: latest?.status ?? existing.status,
                success: true,
              },
              { status: 200 },
            );
          }

          const run = await start(runInboundEmailWorkflow, [
            { inboundEmailId },
            {
              channelId: context.channelId,
            },
          ]);

          await markInboundEmailWorkflowStarted({
            inboundEmailId,
            runId: run.runId,
            tenantContext,
          });

          return NextResponse.json(
            {
              duplicate: true,
              inboundEmailId,
              repaired: true,
              runId: run.runId,
              success: true,
            },
            { status: 202 },
          );
        }
      }

      return NextResponse.json(
        {
          duplicate: true,
          runId: existing.runId ?? null,
          status: existing.status,
          success: true,
        },
        { status: 200 },
      );
    }

    const context = await loadInboundEmailStartContextStep({
      recipients: event.data.to,
      sender: event.data.from,
    });
    const adminRecipient = resolveInboundAdminRecipient({
      context,
      recipients: event.data.to,
      sender: event.data.from,
    });
    const tenantContext = context.channel
      ? getTenantContext(context.channel.tenantId ?? undefined)
      : undefined;
    const existingRecord = await persistInboundEmailRecordIfNew(
      buildInboundEmailRecord({
        adminRecipient,
        channelId: context.channelId,
        content: await fetchReceivedEmailContent(inboundEmailId),
        event,
        tenantContext,
      }),
      tenantContext,
    );

    if (!existingRecord.created) {
      return NextResponse.json(
        {
          duplicate: true,
          runId: existingRecord.record.runId ?? null,
          status: existingRecord.record.status,
          success: true,
        },
        { status: 200 },
      );
    }

    if (!context.channel) {
      const decision = createNoChannelDecision({
        dkim: "none",
        dmarc: "none",
        spf: "none",
        reasons: [
          "Sender authentication was not evaluated because no channel was resolved.",
        ],
        verdict: "untrusted",
      });

      await persistBlockedInboundEmail({
        decision,
        inboundEmailId,
        tenantContext,
      });

      return NextResponse.json(
        {
          adminRecipientResolved: Boolean(
            existingRecord.record.adminRecipientEmail,
          ),
          aliasTokens: getInboundRecipientAliasTokens(event.data.to),
          blocked: true,
          channelResolved: false,
          recipientEmails: event.data.to,
          reason: "no-channel",
          success: true,
        },
        { status: 202 },
      );
    }

    if (!existingRecord.record.adminRecipientEmail) {
      const decision = createNoAdminDecision({
        dkim: "none",
        dmarc: "none",
        spf: "none",
        reasons: [
          "Sender authentication was not evaluated because no forwarding admin recipient was resolved.",
        ],
        verdict: "untrusted",
      });

      await persistBlockedInboundEmail({
        decision,
        inboundEmailId,
        tenantContext,
      });

      return NextResponse.json(
        {
          blocked: true,
          channelResolved: true,
          reason: "no-forwarding-admin",
          success: true,
        },
        { status: 202 },
      );
    }

    const run = await start(runInboundEmailWorkflow, [
      { inboundEmailId },
      {
        channelId: context.channelId,
      },
    ]);

    await markInboundEmailWorkflowStarted({
      inboundEmailId,
      runId: run.runId,
      tenantContext,
    });

    return NextResponse.json(
      {
        inboundEmailId,
        runId: run.runId,
        success: true,
      },
      { status: 202 },
    );
  } catch (error) {
    console.error("[Inbound Email] Failed to start inbound workflow:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to start inbound email workflow",
      },
      { status: 500 },
    );
  }
}
