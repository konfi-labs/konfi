import {
  getAuthenticatedAdminMember,
  requireSuperAdminAuth,
} from "@/actions/auth-utils";
import { runMonthlyWhatsNewWorkflow } from "@/lib/whats-new/monthly-workflow";
import { runWeeklyWhatsNewWorkflow } from "@/lib/whats-new/weekly-workflow";
import {
  getWorkflow,
  isTaskTypeSupported,
} from "@/lib/ai/durable-agents/registry";
import {
  summarizeOrderForBenchmark,
  summarizeQuoteForBenchmark,
} from "@/lib/ai/benchmarks/quote-comparison";
import { summarizeProductForBenchmark } from "@/lib/ai/benchmarks/product-comparison";
import {
  buildInboundEmailRoutingBenchmarkContext,
  buildInboundEmailRoutingBenchmarkRequestText,
  runInboundEmailRoutingBenchmark,
  summarizeInboundEmailRoutingLiveRun,
  type InboundEmailRoutingBenchmarkSender,
} from "@/lib/ai/benchmarks/inbound-email-routing";
import {
  getChannelNotificationEmails,
  loadInboundEmailStartContextStep,
  markInboundEmailWorkflowStarted,
  persistInboundEmailRecordIfNew,
  runInboundEmailWorkflow,
  type InboundEmailBenchmarkRoutingContext,
  type InboundEmailRecord,
} from "@/lib/ai/inbound-email";
import {
  buildInboundMissingInformationLabels,
  buildInboundRoutingRationaleMessages,
} from "@/lib/ai/inbound-email/routing";
import i18next from "@/i18n/i18next";
import { getAdminDb, getTenantContext } from "@/lib/firebase/serverApp";
import {
  isInboundEmailRoutingBenchmarkTaskType,
  isWhatsNewBenchmarkTaskType,
  WHATS_NEW_BENCHMARK_TASK_TYPES,
  type AiBenchmarkTaskType,
  type BenchmarkAgentTaskType,
  type WhatsNewBenchmarkTaskType,
} from "@/lib/ai/benchmarks/types";
import {
  DEFAULT_LOCALE,
  type Attribute,
  type Order,
  type Product,
  type Quote,
} from "@konfi/types";
import { withTenantOwned } from "@konfi/firebase";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";

export const maxDuration = 120;

interface StartBenchmarkBody {
  agentTaskType?: string;
  channelId?: string;
  prompt?: string;
  targetOrderId?: string;
  targetProductId?: string;
  targetQuoteId?: string;
}

function isBenchmarkTaskType(value: string): value is BenchmarkAgentTaskType {
  return isTaskTypeSupported(value);
}

function isSupportedBenchmarkTaskType(
  value: string,
): value is AiBenchmarkTaskType {
  return (
    isBenchmarkTaskType(value) ||
    isInboundEmailRoutingBenchmarkTaskType(value) ||
    isWhatsNewBenchmarkTaskType(value)
  );
}

function getWhatsNewBenchmarkWorkflow(taskType: WhatsNewBenchmarkTaskType) {
  return taskType === WHATS_NEW_BENCHMARK_TASK_TYPES.WEEKLY
    ? runWeeklyWhatsNewWorkflow
    : runMonthlyWhatsNewWorkflow;
}

function getAutonomousBenchmarkPrompt(taskType: WhatsNewBenchmarkTaskType) {
  return taskType === WHATS_NEW_BENCHMARK_TASK_TYPES.WEEKLY
    ? "Autonomous weekly What's New cron benchmark"
    : "Autonomous monthly What's New cron benchmark";
}

function buildInboundBenchmarkAuthHeaders(senderEmail: string) {
  const senderDomain = senderEmail.split("@").at(1) ?? "";

  return {
    "authentication-results": [
      "mx.example.local",
      `dmarc=pass header.from=${senderDomain}`,
      `spf=pass smtp.mailfrom=${senderDomain}`,
      `dkim=pass header.d=${senderDomain}`,
    ].join("; "),
    "return-path": `<${senderEmail}>`,
  };
}

function getInboundBenchmarkSender({
  senderMatch,
}: InboundEmailBenchmarkRoutingContext): InboundEmailRoutingBenchmarkSender {
  const candidate =
    senderMatch.status === "exact"
      ? senderMatch.candidate
      : senderMatch.candidates.at(0);
  const email =
    candidate?.contact?.email?.trim() ||
    candidate?.customer?.email?.trim() ||
    "benchmark@example.com";

  return {
    email,
    name:
      candidate?.contact?.name ||
      candidate?.customer?.personName ||
      candidate?.customer?.name ||
      "",
  };
}

function buildInboundBenchmarkEmailRecord({
  adminRecipientEmail,
  channelId,
  createdBy,
  id,
  productName,
  requestText,
  sender,
}: {
  adminRecipientEmail: string;
  channelId: string;
  createdBy: Awaited<ReturnType<typeof getAuthenticatedAdminMember>>;
  id: string;
  productName: string;
  requestText: string;
  sender: InboundEmailRoutingBenchmarkSender;
}): InboundEmailRecord {
  const from = sender.name ? `${sender.name} <${sender.email}>` : sender.email;

  return {
    adminRecipientEmail,
    attachments: [],
    bcc: [],
    cc: [],
    channelId,
    createdBy,
    eventCreatedAt: new Date().toISOString(),
    from,
    headers: buildInboundBenchmarkAuthHeaders(sender.email),
    html: null,
    id,
    messageId: `<${id}@benchmark.example.local>`,
    resendEmailId: id,
    routingDecision: null,
    runId: null,
    status: "received",
    subject: `Benchmark inbound request for ${productName}`,
    text: requestText,
    to: [`Konfi inbound <${adminRecipientEmail}>`],
  };
}

function tenantOwnedBenchmarkData<T extends object>(
  data: T & { tenantId?: string | null },
  tenantContext: TenantContext,
  operationName: string,
) {
  return withTenantOwned(data, tenantContext, operationName);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTimestampLike(value: unknown): value is { toDate: () => Date } {
  return (
    isRecord(value) && "toDate" in value && typeof value.toDate === "function"
  );
}

function serializeWorkflowValue(value: unknown): unknown {
  if (isTimestampLike(value)) {
    return value.toDate();
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeWorkflowValue(item));
  }

  if (isRecord(value)) {
    const result: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value)) {
      result[key] = serializeWorkflowValue(entry);
    }

    return result;
  }

  return value;
}

export async function POST(request: NextRequest) {
  try {
    await requireSuperAdminAuth();
    const createdBy = await getAuthenticatedAdminMember();
    const body = (await request.json()) as StartBenchmarkBody;
    const {
      agentTaskType,
      channelId,
      prompt,
      targetOrderId,
      targetProductId,
      targetQuoteId,
    } = body;

    if (!agentTaskType || !channelId) {
      return NextResponse.json(
        { error: "agentTaskType and channelId are required" },
        { status: 400 },
      );
    }

    if (!isSupportedBenchmarkTaskType(agentTaskType)) {
      return NextResponse.json(
        { error: `Unsupported agent task type: ${agentTaskType}` },
        { status: 400 },
      );
    }

    if (isInboundEmailRoutingBenchmarkTaskType(agentTaskType)) {
      if (prompt?.trim()) {
        return NextResponse.json(
          {
            error:
              "Prompt is not supported for inbound email routing benchmarks",
          },
          { status: 400 },
        );
      }

      const firestore = getAdminDb();
      const benchmarkRef = firestore.collection("aiBenchmarkRuns").doc();
      const now = FieldValue.serverTimestamp();
      const context = await loadInboundEmailStartContextStep({ channelId });

      if (!context.channel) {
        return NextResponse.json(
          { error: "Selected channel was not found" },
          { status: 404 },
        );
      }

      const tenantContext = getTenantContext(
        context.channel.tenantId ?? undefined,
      );
      const adminRecipientEmail = getChannelNotificationEmails(
        context.channel,
      )[0];

      if (!adminRecipientEmail) {
        return NextResponse.json(
          {
            error:
              "Inbound email benchmark requires a notification email on the selected channel",
          },
          { status: 400 },
        );
      }

      const inboundEmailId = `benchmark-${benchmarkRef.id}`;
      const benchmarkRoutingContext = buildInboundEmailRoutingBenchmarkContext({
        channelId,
      });
      const sender = getInboundBenchmarkSender(benchmarkRoutingContext);
      const benchmarkItem = benchmarkRoutingContext.items.at(0);
      const productName = benchmarkItem?.product?.name || "business cards";
      const requestText = buildInboundEmailRoutingBenchmarkRequestText({
        item: benchmarkItem,
      });
      const inboundEmailRecord = tenantOwnedBenchmarkData(
        buildInboundBenchmarkEmailRecord({
          adminRecipientEmail,
          channelId,
          createdBy,
          id: inboundEmailId,
          productName,
          requestText,
          sender,
        }),
        tenantContext,
        "inbound email benchmark record",
      );
      if (!i18next.hasLoadedNamespace("translation")) {
        await i18next.loadNamespaces("translation");
      }
      const t = i18next.getFixedT(DEFAULT_LOCALE, "translation");
      const inboundEmailRouting = {
        ...runInboundEmailRoutingBenchmark(
          buildInboundMissingInformationLabels(t),
          buildInboundRoutingRationaleMessages(t),
        ),
        liveRun: summarizeInboundEmailRoutingLiveRun(inboundEmailRecord),
      };
      await persistInboundEmailRecordIfNew(inboundEmailRecord, tenantContext);

      const run = await start(runInboundEmailWorkflow, [
        { inboundEmailId },
        {
          channelId,
          benchmarkRoutingContext,
          sendAdminReply: false,
        },
      ]);

      await markInboundEmailWorkflowStarted({
        inboundEmailId,
        runId: run.runId,
        tenantContext,
      });

      await benchmarkRef.set(
        tenantOwnedBenchmarkData(
          {
            agentRunId: run.runId,
            agentTaskType,
            benchmarkType: agentTaskType,
            channelId,
            createdBy,
            inboundEmailId,
            inboundEmailRouting,
            metrics: {
              startedAt: now,
              statusPolls: 0,
            },
            prompt: "Inbound email routing guardrail benchmark",
            status: "running",
            targetQuote: null,
            createdAt: now,
            updatedAt: now,
          },
          tenantContext,
          "inbound email benchmark run",
        ),
        { merge: true },
      );

      return NextResponse.json({
        agentRunId: run.runId,
        benchmarkRunId: benchmarkRef.id,
        success: true,
      });
    }

    if (isWhatsNewBenchmarkTaskType(agentTaskType)) {
      if (prompt?.trim()) {
        return NextResponse.json(
          {
            error:
              "Prompt is not supported for autonomous What's New benchmarks",
          },
          { status: 400 },
        );
      }

      const firestore = getAdminDb();
      const benchmarkRef = firestore.collection("aiBenchmarkRuns").doc();
      const workflow = getWhatsNewBenchmarkWorkflow(agentTaskType);
      const run = await start(workflow, [
        {
          channelId,
          force: true,
          includeEvaluationContext: true,
          includeOutput: true,
          persist: false,
        },
      ]);
      const now = FieldValue.serverTimestamp();
      const benchmarkPrompt = getAutonomousBenchmarkPrompt(agentTaskType);

      await benchmarkRef.set(
        {
          agentRunId: run.runId,
          agentTaskType,
          benchmarkType: agentTaskType,
          channelId,
          createdBy,
          metrics: {
            startedAt: now,
            statusPolls: 0,
          },
          prompt: benchmarkPrompt,
          status: "running",
          targetQuote: null,
          createdAt: now,
          updatedAt: now,
        },
        { merge: true },
      );

      return NextResponse.json({
        benchmarkRunId: benchmarkRef.id,
        agentRunId: run.runId,
        success: true,
      });
    }

    if (!prompt?.trim()) {
      return NextResponse.json(
        { error: "prompt is required for agent benchmarks" },
        { status: 400 },
      );
    }

    if (agentTaskType === "quote" && !targetQuoteId) {
      return NextResponse.json(
        { error: "targetQuoteId is required for quote benchmarks" },
        { status: 400 },
      );
    }

    if (agentTaskType === "order" && !targetOrderId) {
      return NextResponse.json(
        { error: "targetOrderId is required for order benchmarks" },
        { status: 400 },
      );
    }

    if (agentTaskType === "product" && !targetProductId) {
      return NextResponse.json(
        { error: "targetProductId is required for product benchmarks" },
        { status: 400 },
      );
    }

    const benchmarkPrompt = prompt.trim();
    const firestore = getAdminDb();
    const targetQuoteRef = targetQuoteId
      ? firestore
          .collection("channels")
          .doc(channelId)
          .collection("quotes")
          .doc(targetQuoteId)
      : null;
    const targetOrderRef = targetOrderId
      ? firestore
          .collection("channels")
          .doc(channelId)
          .collection("orders")
          .doc(targetOrderId)
      : null;
    const targetProductRef = targetProductId
      ? firestore
          .collection("channels")
          .doc(channelId)
          .collection("products")
          .doc(targetProductId)
      : null;
    const [
      targetQuoteSnapshot,
      targetOrderSnapshot,
      targetProductSnapshot,
      attributesSnapshot,
    ] = await Promise.all([
      targetQuoteRef?.get() ?? Promise.resolve(null),
      targetOrderRef?.get() ?? Promise.resolve(null),
      targetProductRef?.get() ?? Promise.resolve(null),
      firestore.collection("attributes").get(),
    ]);

    if (targetQuoteRef && !targetQuoteSnapshot?.exists) {
      return NextResponse.json(
        { error: "Target quote was not found" },
        { status: 404 },
      );
    }

    if (targetOrderRef && !targetOrderSnapshot?.exists) {
      return NextResponse.json(
        { error: "Target order was not found" },
        { status: 404 },
      );
    }

    if (targetProductRef && !targetProductSnapshot?.exists) {
      return NextResponse.json(
        { error: "Target product was not found" },
        { status: 404 },
      );
    }

    const attributes = attributesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Attribute[];
    const workflowAttributes = serializeWorkflowValue(
      attributes,
    ) as Attribute[];
    const workflow = await getWorkflow(agentTaskType);
    const run = await start(workflow, [
      {
        prompt: benchmarkPrompt,
        createdBy,
        channelId,
      },
      {
        channelId,
        attributes: workflowAttributes,
      },
    ]);

    const targetQuote = targetQuoteSnapshot?.exists
      ? ({ id: targetQuoteSnapshot.id, ...targetQuoteSnapshot.data() } as Quote)
      : undefined;
    const targetOrder = targetOrderSnapshot?.exists
      ? ({ id: targetOrderSnapshot.id, ...targetOrderSnapshot.data() } as Order)
      : undefined;
    const targetProduct = targetProductSnapshot?.exists
      ? ({
          id: targetProductSnapshot.id,
          ...targetProductSnapshot.data(),
        } as Product)
      : undefined;
    const benchmarkRef = firestore.collection("aiBenchmarkRuns").doc();
    const now = FieldValue.serverTimestamp();
    const benchmarkType = targetQuote
      ? "quote-match"
      : targetOrder
        ? "order-match"
        : targetProduct
          ? "product-match"
          : "live-run";

    await Promise.all([
      firestore
        .collection("agents")
        .doc(run.runId)
        .set(
          {
            runId: run.runId,
            taskType: agentTaskType,
            prompt: benchmarkPrompt,
            channelId,
            createdBy,
            status: "processing",
            attributes,
            benchmarkRunId: benchmarkRef.id,
            messages: [{ role: "user", content: benchmarkPrompt }],
            createdAt: now,
            updatedAt: now,
          },
          { merge: true },
        ),
      benchmarkRef.set(
        {
          agentRunId: run.runId,
          agentTaskType,
          benchmarkType,
          channelId,
          createdBy,
          metrics: {
            startedAt: now,
            statusPolls: 0,
          },
          prompt: benchmarkPrompt,
          status: "running",
          targetQuote: targetQuote
            ? summarizeQuoteForBenchmark(targetQuote)
            : null,
          targetOrder: targetOrder
            ? summarizeOrderForBenchmark(targetOrder)
            : null,
          targetProduct: targetProduct
            ? summarizeProductForBenchmark(targetProduct)
            : null,
          createdAt: now,
          updatedAt: now,
        },
        { merge: true },
      ),
    ]);

    return NextResponse.json({
      benchmarkRunId: benchmarkRef.id,
      agentRunId: run.runId,
      success: true,
    });
  } catch (error) {
    console.error("[AI Benchmarks Start] Error:", error);
    const status =
      error instanceof Error && "statusCode" in error
        ? Number((error as { statusCode: number }).statusCode)
        : 500;

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start run" },
      { status },
    );
  }
}
