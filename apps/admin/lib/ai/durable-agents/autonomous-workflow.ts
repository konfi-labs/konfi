import "server-only";

import { appendAgentMessageStep } from "./steps";
import { runAutonomousAgentStep } from "./autonomous-workflow.steps";
import type { AgentFileMetadata } from "./types";
import type { Attribute, NestedMember } from "@konfi/types";
import { getWorkflowMetadata } from "workflow";

export interface AutonomousWorkflowInput {
  prompt: string;
  createdBy: NestedMember;
  channelId: string;
  tenantId?: string;
  fileMetadata?: AgentFileMetadata[];
}

export interface AutonomousWorkflowContext {
  attributes: Attribute[];
  channelId: string;
  tenantId?: string;
  locale?: string;
}

export async function createAutonomousWorkflow(
  input: AutonomousWorkflowInput,
  workflowContext: AutonomousWorkflowContext,
) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const result = await runAutonomousAgentStep({
    attributes: workflowContext.attributes,
    channelId: workflowContext.channelId,
    createdBy: input.createdBy,
    fileMetadata: input.fileMetadata,
    locale: workflowContext.locale,
    prompt: input.prompt,
    runId: workflowRunId,
    ...((input.tenantId ?? workflowContext.tenantId)
      ? { tenantId: input.tenantId ?? workflowContext.tenantId }
      : {}),
  });

  await appendAgentMessageStep({
    runId: workflowRunId,
    status: "completed",
    messages: result.messages,
    stepsCount: result.stepsCount,
    result: {
      finishReason: result.finishReason,
      text: result.text,
    },
    clearPendingHook: true,
    message: result.text
      ? undefined
      : {
          role: "assistant",
          content:
            "Autonomous run completed, but the model did not return a visible final message.",
        },
  });

  return result;
}
