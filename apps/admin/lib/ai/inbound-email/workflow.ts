import { getWorkflowMetadata } from "workflow";
import type { QuoteAgentData } from "@/lib/ai/durable-agents/types";
import type {
  InboundEmailBenchmarkRoutingContext,
  InboundEmailWorkflowContext,
  InboundEmailWorkflowInput,
  InboundRoutingDecision,
  InboundWorkflowResolution,
} from "./types";

export const inboundEmailWorkflowStepIds = {
  markFailure:
    "step//./lib/ai/inbound-email/steps//markInboundEmailFailureStep",
  markProcessing:
    "step//./lib/ai/inbound-email/steps//markInboundEmailProcessingStep",
  persistManualCreate:
    "step//./lib/ai/inbound-email/steps//persistInboundEmailManualCreateStep",
  route: "step//./lib/ai/inbound-email/steps//routeInboundEmailStep",
  sendAdminReply:
    "step//./lib/ai/inbound-email/steps//sendInboundAdminReplyStep",
} as const;

type WorkflowStep<Input, Output> = (input: Input) => Promise<Output>;
type WorkflowUseStep = <Input, Output>(
  stepId: string,
) => WorkflowStep<Input, Output>;

function getWorkflowUseStep(): WorkflowUseStep {
  const workflowGlobal = globalThis as typeof globalThis &
    Record<symbol, unknown>;
  const useStep = workflowGlobal[Symbol.for("WORKFLOW_USE_STEP")];

  if (typeof useStep !== "function") {
    throw new Error("Workflow step runtime is not available.");
  }

  return useStep as WorkflowUseStep;
}

async function runWorkflowStep<Input, Output>(
  stepId: string,
  input: Input,
): Promise<Output> {
  const step = getWorkflowUseStep()<Input, Output>(stepId);
  return step(input);
}

export async function runInboundEmailWorkflow(
  input: InboundEmailWorkflowInput,
  context: InboundEmailWorkflowContext,
): Promise<InboundWorkflowResolution> {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();

  try {
    await runWorkflowStep<
      { inboundEmailId: string; workflowRunId: string },
      void
    >(inboundEmailWorkflowStepIds.markProcessing, {
      inboundEmailId: input.inboundEmailId,
      workflowRunId,
    });

    const decision = await runWorkflowStep<
      {
        benchmarkRoutingContext?: InboundEmailBenchmarkRoutingContext;
        channelId: string;
        inboundEmailId: string;
      },
      InboundRoutingDecision
    >(inboundEmailWorkflowStepIds.route, {
      benchmarkRoutingContext: context.benchmarkRoutingContext,
      channelId: context.channelId,
      inboundEmailId: input.inboundEmailId,
    });
    const manualCreate =
      decision.outcome === "blocked"
        ? { collectedData: undefined, decision }
        : await runWorkflowStep<
            {
              decision: InboundRoutingDecision;
              inboundEmailId: string;
              workflowRunId: string;
            },
            {
              collectedData: QuoteAgentData;
              decision: InboundRoutingDecision;
            }
          >(inboundEmailWorkflowStepIds.persistManualCreate, {
            decision,
            inboundEmailId: input.inboundEmailId,
            workflowRunId,
          });

    return runWorkflowStep<
      {
        collectedData?: QuoteAgentData;
        decision: InboundRoutingDecision;
        inboundEmailId: string;
        sendEmail?: boolean;
      },
      InboundWorkflowResolution
    >(inboundEmailWorkflowStepIds.sendAdminReply, {
      collectedData: manualCreate.collectedData,
      decision: manualCreate.decision,
      inboundEmailId: input.inboundEmailId,
      sendEmail: context.sendAdminReply !== false,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown inbound email error";

    await runWorkflowStep<
      { error: string; inboundEmailId: string; workflowRunId: string },
      void
    >(inboundEmailWorkflowStepIds.markFailure, {
      error: errorMessage,
      inboundEmailId: input.inboundEmailId,
      workflowRunId,
    });

    throw error;
  }
}
