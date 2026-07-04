import type { PreflightIssue } from "@konfi/types";

export type CartPreflightWorkflowInput = {
  filename: string;
  filePath: string;
  itemId: string;
  jobId: string;
  tenantId?: string;
  userId: string;
};

export type CartPreflightWorkflowResult = {
  issues: PreflightIssue[];
  previewPath?: string;
};

export type CartPreflightJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export type CartPreflightJob = {
  id: string;
  filename: string;
  itemId: string;
  tenantId?: string;
  status: CartPreflightJobStatus;
  error?: string;
  issues?: PreflightIssue[];
  previewPath?: string;
  runId?: string;
};

export type StartCartPreflightWorkflowResponse =
  | {
      job: CartPreflightJob;
      runId: string;
    }
  | {
      error: string;
    };
