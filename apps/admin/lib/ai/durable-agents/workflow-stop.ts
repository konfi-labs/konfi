import { getRun } from "workflow/api";

export type AgentWorkflowStopStatus =
  | "already-terminal"
  | "cancelled"
  | "not-found";

export interface AgentWorkflowStopResult {
  status: AgentWorkflowStopStatus;
  workflowStatus?: string;
}

export async function stopAgentWorkflowRunIfActive(
  runId: string,
): Promise<AgentWorkflowStopResult> {
  const run = getRun(runId);

  if (!(await run.exists)) {
    return { status: "not-found" };
  }

  const workflowStatus = await run.status;

  if (workflowStatus !== "pending" && workflowStatus !== "running") {
    return {
      status: "already-terminal",
      workflowStatus,
    };
  }

  await run.cancel();

  return {
    status: "cancelled",
    workflowStatus: "cancelled",
  };
}
