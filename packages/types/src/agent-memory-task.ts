export const AGENT_TASK_TYPES = [
  "quote",
  "order",
  "invoice",
  "product",
  "autonomous",
] as const;

export type AgentTaskType = (typeof AGENT_TASK_TYPES)[number];
