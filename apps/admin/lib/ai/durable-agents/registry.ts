import "server-only";

import type { AgentTaskType } from "./types";
import type { QuoteWorkflowContext, QuoteWorkflowInput } from "./workflow";
import type {
  OrderWorkflowContext,
  OrderWorkflowInput,
} from "./order-workflow";
import type {
  ProductWorkflowContext,
  ProductWorkflowInput,
} from "./product-workflow";
import type {
  AutonomousWorkflowContext,
  AutonomousWorkflowInput,
} from "./autonomous-workflow";

type WorkflowFn = (input: unknown, context: unknown) => Promise<unknown>;

function asWorkflowFn(workflow: unknown): WorkflowFn {
  return workflow as WorkflowFn;
}

export interface WorkflowRegistryEntry {
  label: string;
  description: string;
  /** The durable workflow function. Lazily resolved to avoid circular imports. */
  getWorkflow: () => Promise<WorkflowFn>;
}

/**
 * Central registry mapping task types to their durable workflow functions.
 *
 * To add a new task type:
 * 1. Add the type to `AgentTaskType` in types.ts
 * 2. Create a workflow file (e.g., my-workflow.ts)
 * 3. Register it here with `getWorkflow: () => import("./my-workflow").then(m => m.myWorkflow)`
 */
const registry: Record<AgentTaskType, WorkflowRegistryEntry> = {
  quote: {
    label: "Create Quote",
    description: "AI-assisted quote creation with customer and product search",
    getWorkflow: () =>
      import("./workflow").then((m) => asWorkflowFn(m.createQuoteWorkflow)),
  },
  order: {
    label: "Create Order",
    description: "AI-assisted order creation from an existing quote or prompt",
    getWorkflow: () =>
      import("./order-workflow").then((m) =>
        asWorkflowFn(m.createOrderWorkflow),
      ),
  },
  product: {
    label: "Create Product",
    description:
      "AI-assisted product creation draft with attribute, option, product type, and pricing validation",
    getWorkflow: () =>
      import("./product-workflow").then((m) =>
        asWorkflowFn(m.createProductWorkflow),
      ),
  },
  autonomous: {
    label: "Autonomous Agent",
    description:
      "Full-access autonomous assistant with business data, durable tasks, web, code, and maps tools",
    getWorkflow: () =>
      import("./autonomous-workflow").then((m) =>
        asWorkflowFn(m.createAutonomousWorkflow),
      ),
  },
  invoice: {
    label: "Create Invoice",
    description: "AI-assisted invoice generation",
    // Invoice workflow not yet implemented; falls back gracefully via isSupported()
    getWorkflow: () =>
      Promise.reject(new Error("Invoice workflow not yet implemented")),
  },
};

/** Returns true if the task type has a registered, working workflow. */
export function isTaskTypeSupported(
  taskType: string,
): taskType is AgentTaskType {
  return taskType in registry && taskType !== "invoice";
}

/** Returns all registered task type entries. */
export function getRegisteredTaskTypes(): Array<
  { taskType: AgentTaskType } & WorkflowRegistryEntry
> {
  return Object.entries(registry).map(([taskType, entry]) => ({
    taskType: taskType as AgentTaskType,
    ...entry,
  }));
}

/** Resolves and returns the workflow function for the given task type. */
export async function getWorkflow(
  taskType: AgentTaskType,
): Promise<WorkflowFn> {
  const entry = registry[taskType];
  if (!entry) {
    throw new Error(`Unknown task type: ${taskType}`);
  }
  return entry.getWorkflow();
}

// Re-export input/context types for consumers
export type {
  QuoteWorkflowInput,
  QuoteWorkflowContext,
  OrderWorkflowInput,
  OrderWorkflowContext,
  ProductWorkflowInput,
  ProductWorkflowContext,
  AutonomousWorkflowInput,
  AutonomousWorkflowContext,
};
