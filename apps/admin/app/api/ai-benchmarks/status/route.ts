import { requireSuperAdminAuth } from "@/actions/auth-utils";
import {
  compareOrderBenchmarkOutput,
  compareQuoteBenchmarkOutput,
} from "@/lib/ai/benchmarks/quote-comparison";
import { compareProductBenchmarkOutput } from "@/lib/ai/benchmarks/product-comparison";
import { mapBenchmarkDocToRun } from "@/lib/ai/benchmarks/firestore";
import { summarizeInboundEmailRoutingLiveRun } from "@/lib/ai/benchmarks/inbound-email-routing";
import {
  judgeInboundEmailRoutingBenchmarkOutput,
  judgeLiveRunBenchmarkOutput,
  judgeOrderBenchmarkOutput,
  judgeProductBenchmarkOutput,
  judgeQuoteBenchmarkOutput,
  judgeWhatsNewBenchmarkOutput,
} from "@/lib/ai/benchmarks/judge";
import type { ProductAgentData } from "@/lib/ai/durable-agents/product-workflow.types";
import { summarizeLiveRunBenchmarkOutput } from "@/lib/ai/benchmarks/live-run";
import type { QuoteAgentData } from "@/lib/ai/durable-agents/types";
import { getAdminDb } from "@/lib/firebase/serverApp";
import type { FeedGenerationResult } from "@/lib/whats-new/feed";
import type {
  AiBenchmarkComparisonResult,
  AiBenchmarkInboundEmailRoutingLiveSummary,
  AiBenchmarkJudgeResult,
  AiBenchmarkLiveRunSummary,
  AiBenchmarkStatus,
  AiBenchmarkWhatsNewSummary,
  BenchmarkAgentTaskType,
} from "@/lib/ai/benchmarks/types";
import {
  isInboundEmailRoutingBenchmarkTaskType,
  isWhatsNewBenchmarkTaskType,
} from "@/lib/ai/benchmarks/types";
import {
  getInboundEmailRecord,
  type InboundEmailRecord,
} from "@/lib/ai/inbound-email";
import { getTenantContext } from "@/lib/firebase/serverApp";
import { withTenantOwned } from "@konfi/firebase";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import type { Order, Product, Quote } from "@konfi/types";
import type { WeeklyCampaignProposal } from "@/lib/whats-new/campaign-proposals";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { connection, NextRequest, NextResponse } from "next/server";
import { getRun } from "workflow/api";

export const maxDuration = 300;

function toMillis(value: unknown): number | undefined {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  if (value && typeof value === "object" && "toMillis" in value) {
    const timestamp = value as { toMillis?: () => number };
    if (typeof timestamp.toMillis === "function") {
      return timestamp.toMillis();
    }
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

function extractCollectedData(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as {
    collectedData?: unknown;
    result?: { collectedData?: unknown };
  };

  return candidate.collectedData ?? candidate.result?.collectedData;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getBenchmarkTenantContext(
  benchmarkData: Record<string, unknown>,
): TenantContext | undefined {
  const tenantId = getString(benchmarkData.tenantId);
  return tenantId ? getTenantContext(tenantId) : undefined;
}

function isVisibleForBenchmarkTenant(
  data: Record<string, unknown> | undefined,
  tenantContext: TenantContext | undefined,
) {
  return (
    !tenantContext?.tenantId ||
    !data?.tenantId ||
    data.tenantId === tenantContext.tenantId
  );
}

function extractInboundEmailId(
  benchmarkData: Record<string, unknown>,
  workflowResult: unknown,
  agentData: Record<string, unknown> | undefined,
) {
  const workflowRecord = isRecord(workflowResult) ? workflowResult : undefined;
  const agentResult = isRecord(agentData?.result)
    ? agentData.result
    : undefined;

  return (
    getString(benchmarkData.inboundEmailId) ??
    getString(workflowRecord?.inboundEmailId) ??
    getString(agentResult?.inboundEmailId)
  );
}

function extractWhatsNewResult(
  value: unknown,
): FeedGenerationResult | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    typeof value.created === "boolean" &&
    typeof value.id === "string" &&
    typeof value.periodKey === "string" &&
    (value.kind === "weekly-update" || value.kind === "monthly-growth")
  ) {
    return {
      created: value.created,
      evaluationContext: isRecord(value.evaluationContext)
        ? value.evaluationContext
        : undefined,
      id: value.id,
      kind: value.kind,
      campaignProposal: isRecord(value.campaignProposal)
        ? (value.campaignProposal as unknown as WeeklyCampaignProposal)
        : undefined,
      campaignProposalCount:
        typeof value.campaignProposalCount === "number"
          ? value.campaignProposalCount
          : undefined,
      campaignProposalError:
        typeof value.campaignProposalError === "string"
          ? value.campaignProposalError
          : undefined,
      campaignProposalReason:
        typeof value.campaignProposalReason === "string"
          ? value.campaignProposalReason
          : undefined,
      output: isRecord(value.output)
        ? (value.output as unknown as FeedGenerationResult["output"])
        : undefined,
      periodKey: value.periodKey,
      reason: typeof value.reason === "string" ? value.reason : undefined,
      seoSuggestionAppliedCount:
        typeof value.seoSuggestionAppliedCount === "number"
          ? value.seoSuggestionAppliedCount
          : undefined,
      seoSuggestionApplyFailures: Array.isArray(
        value.seoSuggestionApplyFailures,
      )
        ? value.seoSuggestionApplyFailures.filter(
            (failure): failure is string => typeof failure === "string",
          )
        : undefined,
      seoSuggestionCount:
        typeof value.seoSuggestionCount === "number"
          ? value.seoSuggestionCount
          : undefined,
      skipped: value.skipped === true ? true : undefined,
    };
  }

  return undefined;
}

function summarizeCampaignProposal(
  proposal: WeeklyCampaignProposal,
): NonNullable<AiBenchmarkWhatsNewSummary["campaignProposal"]> {
  return {
    campaign: {
      campaignIdentifier: proposal.campaign.campaignIdentifier,
      description: proposal.campaign.description,
      endsAt: proposal.campaign.endsAt,
      name: proposal.campaign.name,
      startsAt: proposal.campaign.startsAt,
    },
    calendarEvent: {
      endsAt: proposal.calendarEvent.endsAt,
      id: proposal.calendarEvent.id,
      name: proposal.calendarEvent.name,
      source: proposal.calendarEvent.source,
      startsAt: proposal.calendarEvent.startsAt,
    },
    discountPercent: proposal.discountPercent,
    justification: proposal.justification,
    localizedDescription: proposal.localizedDescription,
    productIds: proposal.productIds,
    promotion: {
      code: proposal.promotion.code,
      isAutomatic: proposal.promotion.isAutomatic,
      productIds: proposal.promotion.rules.flatMap((rule) => rule.values),
      value: proposal.promotion.applicationMethod.value,
    },
  };
}

function summarizeWhatsNewResult(
  result: FeedGenerationResult,
): AiBenchmarkWhatsNewSummary {
  const summary: AiBenchmarkWhatsNewSummary = {
    created: result.created,
    kind: result.kind,
    periodKey: result.periodKey,
  };

  if (result.output?.description) {
    summary.description = result.output.description;
  }
  if (result.output?.highlightFeatures) {
    summary.highlightFeatures = result.output.highlightFeatures;
  }
  if (result.reason) {
    summary.reason = result.reason;
  }
  if (result.campaignProposal) {
    summary.campaignProposal = summarizeCampaignProposal(
      result.campaignProposal,
    );
  }
  if (typeof result.campaignProposalCount === "number") {
    summary.campaignProposalCount = result.campaignProposalCount;
  }
  if (result.campaignProposalError) {
    summary.campaignProposalError = result.campaignProposalError;
  }
  if (result.campaignProposalReason) {
    summary.campaignProposalReason = result.campaignProposalReason;
  }
  if (typeof result.seoSuggestionAppliedCount === "number") {
    summary.seoSuggestionAppliedCount = result.seoSuggestionAppliedCount;
  }
  if (result.seoSuggestionApplyFailures) {
    summary.seoSuggestionApplyFailures = result.seoSuggestionApplyFailures;
  }
  if (typeof result.seoSuggestionCount === "number") {
    summary.seoSuggestionCount = result.seoSuggestionCount;
  }
  if (typeof result.skipped === "boolean") {
    summary.skipped = result.skipped;
  }
  if (result.output?.title) {
    summary.title = result.output.title;
  }

  return summary;
}

function mapAgentStatus(options: {
  workflowStatus: string;
  hasPendingHook: boolean;
  storedStatus?: string;
}): AiBenchmarkStatus {
  if (
    options.workflowStatus === "failed" ||
    options.workflowStatus === "cancelled"
  ) {
    return "failed";
  }

  if (options.workflowStatus === "completed") {
    return "completed";
  }

  if (options.hasPendingHook || options.storedStatus === "awaiting-approval") {
    return "awaiting-user-input";
  }

  return "running";
}

function isLiveRunBenchmarkTaskType(
  value: string | undefined,
): value is BenchmarkAgentTaskType {
  return value === "order" || value === "product";
}

export async function GET(request: NextRequest) {
  await connection();

  try {
    await requireSuperAdminAuth();

    const benchmarkRunId = request.nextUrl.searchParams.get("benchmarkRunId");
    if (!benchmarkRunId) {
      return NextResponse.json(
        { error: "Missing benchmarkRunId parameter" },
        { status: 400 },
      );
    }

    const firestore = getAdminDb();
    const benchmarkRef = firestore
      .collection("aiBenchmarkRuns")
      .doc(benchmarkRunId);
    const benchmarkSnapshot = await benchmarkRef.get();

    if (!benchmarkSnapshot.exists) {
      return NextResponse.json(
        { error: "Benchmark run was not found" },
        { status: 404 },
      );
    }

    const benchmarkData = benchmarkSnapshot.data() ?? {};
    const tenantContext = getBenchmarkTenantContext(benchmarkData);
    const agentRunId =
      typeof benchmarkData.agentRunId === "string"
        ? benchmarkData.agentRunId
        : undefined;
    const benchmarkTaskType =
      typeof benchmarkData.agentTaskType === "string"
        ? benchmarkData.agentTaskType
        : undefined;

    if (
      benchmarkTaskType &&
      isInboundEmailRoutingBenchmarkTaskType(benchmarkTaskType) &&
      !agentRunId
    ) {
      const metrics = {
        ...(benchmarkData.metrics && typeof benchmarkData.metrics === "object"
          ? benchmarkData.metrics
          : {}),
        statusPolls:
          typeof benchmarkData.metrics?.statusPolls === "number"
            ? benchmarkData.metrics.statusPolls + 1
            : 1,
      };

      await benchmarkRef.set(
        {
          metrics,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      const refreshedSnapshot = await benchmarkRef.get();
      const run = mapBenchmarkDocToRun({
        id: refreshedSnapshot.id,
        data: refreshedSnapshot.data() ?? {},
      });

      return NextResponse.json({ run });
    }

    if (!agentRunId) {
      return NextResponse.json(
        { error: "Benchmark run is missing its agent run ID" },
        { status: 500 },
      );
    }

    const workflowRun = getRun(agentRunId);
    const [workflowStatus, completedAt, agentSnapshot] = await Promise.all([
      workflowRun.status,
      workflowRun.completedAt.catch(() => undefined),
      firestore.collection("agents").doc(agentRunId).get(),
    ]);
    const agentData = agentSnapshot.exists ? agentSnapshot.data() : undefined;
    const hasPendingHook =
      typeof agentData?.pendingHookToken === "string" &&
      agentData.pendingHookToken.length > 0;
    const status = mapAgentStatus({
      hasPendingHook,
      storedStatus:
        typeof agentData?.status === "string" ? agentData.status : undefined,
      workflowStatus,
    });

    let workflowResult: unknown;
    if (workflowStatus === "completed") {
      workflowResult = await workflowRun.returnValue.catch((err) => {
        console.error("[AI Benchmarks Status] returnValue rejected:", err);
        return undefined;
      });
    }

    const generatedData =
      extractCollectedData(workflowResult) ??
      extractCollectedData(agentData?.result);
    let deterministicComparison: AiBenchmarkComparisonResult | undefined =
      benchmarkData.deterministicComparison;
    let judge: AiBenchmarkJudgeResult | undefined = benchmarkData.judge;
    let liveRun: AiBenchmarkLiveRunSummary | undefined = benchmarkData.liveRun;
    let judgeError: string | undefined =
      typeof benchmarkData.judgeError === "string"
        ? benchmarkData.judgeError
        : undefined;
    const isFinalStop = status === "completed" || status === "failed";
    const metrics = {
      ...(benchmarkData.metrics && typeof benchmarkData.metrics === "object"
        ? benchmarkData.metrics
        : {}),
      statusPolls:
        typeof benchmarkData.metrics?.statusPolls === "number"
          ? benchmarkData.metrics.statusPolls + 1
          : 1,
    };
    const updateData: Record<string, unknown> = {
      status,
      updatedAt: FieldValue.serverTimestamp(),
      metrics,
    };

    const workflowSteps = (workflowResult as { steps?: unknown } | undefined)
      ?.steps;
    const stepsCount =
      typeof workflowSteps === "number"
        ? workflowSteps
        : typeof agentData?.stepsCount === "number"
          ? agentData.stepsCount
          : undefined;

    if (stepsCount !== undefined) {
      metrics.stepsCount = stepsCount;
    }

    if (isFinalStop && !benchmarkData.metrics?.stoppedAt) {
      const startedAtMs = toMillis(benchmarkData.metrics?.startedAt);
      const stoppedAt = completedAt instanceof Date ? completedAt : new Date();
      metrics.stoppedAt = stoppedAt;
      if (startedAtMs) {
        metrics.agentActiveDurationMs = stoppedAt.getTime() - startedAtMs;
      }
    }

    if (
      benchmarkTaskType &&
      isInboundEmailRoutingBenchmarkTaskType(benchmarkTaskType)
    ) {
      let inboundEmailId = extractInboundEmailId(
        benchmarkData,
        workflowResult,
        agentData,
      );

      let inboundEmailRecord = inboundEmailId
        ? await getInboundEmailRecord(inboundEmailId)
        : null;

      if (
        inboundEmailRecord &&
        !isVisibleForBenchmarkTenant(
          inboundEmailRecord as unknown as Record<string, unknown>,
          tenantContext,
        )
      ) {
        inboundEmailRecord = null;
      }

      if (!inboundEmailRecord) {
        let inboundQuery = firestore
          .collection("inboundEmails")
          .where("runId", "==", agentRunId);

        if (tenantContext?.tenantId) {
          inboundQuery = inboundQuery.where(
            "tenantId",
            "==",
            tenantContext.tenantId,
          );
        }

        const inboundSnapshot = await inboundQuery.limit(1).get();
        const inboundDoc = inboundSnapshot.docs.at(0);

        if (inboundDoc) {
          const inboundData = inboundDoc.data();
          inboundEmailRecord = {
            ...inboundData,
            id:
              typeof inboundData.id === "string"
                ? inboundData.id
                : inboundDoc.id,
          } as InboundEmailRecord;
          inboundEmailId = inboundEmailRecord.id || inboundDoc.id;
        }
      }

      if (inboundEmailRecord && inboundEmailId) {
        const inboundEmailLiveRun: AiBenchmarkInboundEmailRoutingLiveSummary =
          summarizeInboundEmailRoutingLiveRun(inboundEmailRecord);
        updateData.inboundEmailId = inboundEmailId;
        updateData.inboundEmailRouting = {
          ...(isRecord(benchmarkData.inboundEmailRouting)
            ? benchmarkData.inboundEmailRouting
            : {}),
          liveRun: inboundEmailLiveRun,
        };

        if (status === "completed" && !judge) {
          try {
            judge = await judgeInboundEmailRoutingBenchmarkOutput({
              record: inboundEmailRecord,
              summary: inboundEmailLiveRun,
            });
            updateData.judge = judge;
            updateData.judgeError = FieldValue.delete();
          } catch (error) {
            console.error(
              "[AI Benchmarks Status] Inbound email judge failed:",
              error,
            );
            judgeError =
              error instanceof Error
                ? error.message
                : "Judge evaluation failed";
            updateData.judgeError = judgeError;
          }
        }
      }
    }

    if (
      generatedData &&
      benchmarkData.benchmarkType === "quote-match" &&
      benchmarkData.targetQuote?.id &&
      !deterministicComparison
    ) {
      const quoteSnapshot = await firestore
        .collection("channels")
        .doc(String(benchmarkData.channelId))
        .collection("quotes")
        .doc(String(benchmarkData.targetQuote.id))
        .get();

      if (
        quoteSnapshot.exists &&
        isVisibleForBenchmarkTenant(quoteSnapshot.data(), tenantContext)
      ) {
        const expectedQuote = {
          id: quoteSnapshot.id,
          ...quoteSnapshot.data(),
        } as Quote;
        deterministicComparison = compareQuoteBenchmarkOutput({
          expectedQuote,
          generatedData: generatedData as QuoteAgentData,
        });
        updateData.deterministicComparison = deterministicComparison;

        try {
          judge = await judgeQuoteBenchmarkOutput({
            deterministicComparison,
            expectedQuote,
            generatedData: generatedData as QuoteAgentData,
          });
          updateData.judge = judge;
          updateData.judgeError = FieldValue.delete();
        } catch (error) {
          console.error("[AI Benchmarks Status] Judge failed:", error);
          judgeError =
            error instanceof Error ? error.message : "Judge evaluation failed";
          updateData.judgeError = judgeError;
        }
      }
    }

    if (
      generatedData &&
      benchmarkData.benchmarkType === "order-match" &&
      benchmarkData.targetOrder?.id &&
      !deterministicComparison
    ) {
      const orderSnapshot = await firestore
        .collection("channels")
        .doc(String(benchmarkData.channelId))
        .collection("orders")
        .doc(String(benchmarkData.targetOrder.id))
        .get();

      if (
        orderSnapshot.exists &&
        isVisibleForBenchmarkTenant(orderSnapshot.data(), tenantContext)
      ) {
        const expectedOrder = {
          id: orderSnapshot.id,
          ...orderSnapshot.data(),
        } as Order;
        deterministicComparison = compareOrderBenchmarkOutput({
          expectedOrder,
          generatedData: generatedData as QuoteAgentData,
        });
        updateData.deterministicComparison = deterministicComparison;

        try {
          judge = await judgeOrderBenchmarkOutput({
            deterministicComparison,
            expectedOrder,
            generatedData: generatedData as QuoteAgentData,
          });
          updateData.judge = judge;
          updateData.judgeError = FieldValue.delete();
        } catch (error) {
          console.error("[AI Benchmarks Status] Order judge failed:", error);
          judgeError =
            error instanceof Error ? error.message : "Judge evaluation failed";
          updateData.judgeError = judgeError;
        }
      }
    }

    if (
      generatedData &&
      benchmarkData.benchmarkType === "product-match" &&
      benchmarkData.targetProduct?.id &&
      !deterministicComparison
    ) {
      const productSnapshot = await firestore
        .collection("channels")
        .doc(String(benchmarkData.channelId))
        .collection("products")
        .doc(String(benchmarkData.targetProduct.id))
        .get();

      if (
        productSnapshot.exists &&
        isVisibleForBenchmarkTenant(productSnapshot.data(), tenantContext)
      ) {
        const expectedProduct = {
          id: productSnapshot.id,
          ...productSnapshot.data(),
        } as Product;
        deterministicComparison = compareProductBenchmarkOutput({
          expectedProduct,
          generatedData: generatedData as ProductAgentData,
        });
        updateData.deterministicComparison = deterministicComparison;

        try {
          judge = await judgeProductBenchmarkOutput({
            deterministicComparison,
            expectedProduct,
            generatedData,
          });
          updateData.judge = judge;
          updateData.judgeError = FieldValue.delete();
        } catch (error) {
          console.error("[AI Benchmarks Status] Product judge failed:", error);
          judgeError =
            error instanceof Error ? error.message : "Judge evaluation failed";
          updateData.judgeError = judgeError;
        }
      }
    }

    if (
      status === "completed" &&
      generatedData &&
      (benchmarkData.benchmarkType === "live-run" ||
        benchmarkData.benchmarkType === "order-match" ||
        benchmarkData.benchmarkType === "product-match") &&
      isLiveRunBenchmarkTaskType(benchmarkTaskType)
    ) {
      if (!liveRun) {
        liveRun = summarizeLiveRunBenchmarkOutput({
          output: generatedData,
          taskType: benchmarkTaskType,
        });
        updateData.liveRun = liveRun;
      }

      if (!judge) {
        try {
          judge = await judgeLiveRunBenchmarkOutput({
            output: generatedData,
            prompt:
              typeof benchmarkData.prompt === "string"
                ? benchmarkData.prompt
                : "",
            summary: liveRun,
            taskType: benchmarkTaskType,
          });
          updateData.judge = judge;
          updateData.judgeError = FieldValue.delete();
        } catch (error) {
          console.error("[AI Benchmarks Status] Live-run judge failed:", error);
          judgeError =
            error instanceof Error ? error.message : "Judge evaluation failed";
          updateData.judgeError = judgeError;
        }
      }
    }

    const whatsNewResult = extractWhatsNewResult(workflowResult);
    if (
      status === "completed" &&
      whatsNewResult &&
      benchmarkTaskType &&
      isWhatsNewBenchmarkTaskType(benchmarkTaskType)
    ) {
      const whatsNew: AiBenchmarkWhatsNewSummary =
        summarizeWhatsNewResult(whatsNewResult);
      updateData.whatsNew = whatsNew;

      if (!judge) {
        try {
          judge = await judgeWhatsNewBenchmarkOutput({
            benchmarkType: benchmarkTaskType,
            result: whatsNewResult,
          });
          updateData.judge = judge;
          updateData.judgeError = FieldValue.delete();
        } catch (error) {
          console.error(
            "[AI Benchmarks Status] What's New judge failed:",
            error,
          );
          judgeError =
            error instanceof Error ? error.message : "Judge evaluation failed";
          updateData.judgeError = judgeError;
        }
      }
    }

    await benchmarkRef.set(
      tenantContext
        ? withTenantOwned(
            updateData,
            tenantContext,
            "ai benchmark status update",
          )
        : updateData,
      { merge: true },
    );
    const refreshedSnapshot = await benchmarkRef.get();
    const run = mapBenchmarkDocToRun({
      id: refreshedSnapshot.id,
      data: refreshedSnapshot.data() ?? {},
    });

    return NextResponse.json({ run });
  } catch (error) {
    console.error("[AI Benchmarks Status] Error:", error);
    const status =
      error instanceof Error && "statusCode" in error
        ? Number((error as { statusCode: number }).statusCode)
        : 500;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load status",
      },
      { status },
    );
  }
}
