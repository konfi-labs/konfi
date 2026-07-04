type FinishReason =
  | "content-filter"
  | "error"
  | "length"
  | "other"
  | "stop"
  | "tool-calls";

type ToolSet = Record<string, unknown>;

interface StepResult<TTools extends ToolSet> {
  dynamicToolCalls: readonly unknown[];
  finishReason?: FinishReason;
  text: string;
  toolCalls: readonly unknown[];
  tools?: TTools;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export const AI_DETERMINISTIC_BOUNDARY_INSTRUCTIONS = `## AI / deterministic boundary
- Use AI for ambiguous interpretation, planning, extraction, and tool selection.
- Use tool calls or structured output for AI decisions. Do not parse model prose with regex or string heuristics to decide intent, approval, IDs, or workflow state.
- Deterministic code must validate AI output against known IDs, enums, schemas, thresholds, and persisted state before acting.
- Regex and string parsing are appropriate only for truly deterministic source formats such as URLs, placeholders, dates, HTML cleanup, or provider error text.
- If evidence is missing or ambiguous, return a blocked item or ask the user through the interaction tool instead of inventing values.`;

export const AGENT_INTERFACE_NEUTRAL_INSTRUCTIONS = `## Interface-neutral interactions
- Treat the tasks page, assistant chat, sidebar, and future json-render-style component surfaces as views over the same agent interaction contract.
- When user input, approval, or edits are needed, call the pause/approval tool and include a structured interaction payload for renderers.
- Prefer forms with prefilled data for editable structured state, approvals for yes/no decisions, and plain questions only for genuinely free-form clarification.
- Do not rely on page-specific state or prose-only prompts as the source of truth for resumable workflow state.`;

export const AGENT_HARNESS_SHARED_INSTRUCTIONS = `## Autonomous harness rules
- Start with the simplest viable workflow; use the agent loop only for decisions that need model judgment.
- Use ground-truth tool results as the source of truth and carry their IDs forward exactly.
- Keep working until the task is complete, clearly blocked, or waiting on a human checkpoint.
- Ask for human input only when the next safe action depends on information or approval the tools cannot provide.
- Respect step limits and stop conditions; summarize progress when finishing or blocking.
- Use narrow, well-described tools and pass complete context to each tool call.`;

export const DURABLE_AGENT_MAX_RETRIES = 0;

export type AgentInteractionKind = "question" | "approval" | "form" | "status";

export type AgentInteractionFieldKind =
  | "text"
  | "textarea"
  | "boolean"
  | "json"
  | "select";

export interface AgentInteractionFieldOption {
  description?: string;
  label: string;
  value: string;
}

export interface AgentInteractionField {
  description?: string;
  id: string;
  kind: AgentInteractionFieldKind;
  label: string;
  options?: readonly AgentInteractionFieldOption[];
  required?: boolean;
  value?: unknown;
}

export interface AgentInteractionAction {
  id: string;
  intent: "confirm" | "reject" | "submit" | "cancel" | "secondary";
  label: string;
  value?: Record<string, unknown>;
}

export interface AgentInteractionSpec {
  actions?: readonly AgentInteractionAction[];
  body?: string;
  fields?: readonly AgentInteractionField[];
  kind: AgentInteractionKind;
  metadata?: Record<string, unknown>;
  title: string;
  version: "konfi.agent-interaction.v1";
}

export interface AgentPromptSection {
  body: readonly string[] | string;
  title: string;
}

export interface AgentInteractionLabelInput {
  approveLabel?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  declineLabel?: string;
  fieldDescription?: string;
  fieldLabel?: string;
  rejectLabel?: string;
  submitLabel?: string;
  title?: string;
}

export interface BuildAgentHarnessPromptOptions {
  contextSections?: readonly AgentPromptSection[];
  language?: string;
  role: string;
  rules: readonly string[] | string;
  workflow: readonly string[] | string;
}

export interface BuildSpecializedAgentInstructionsOptions {
  capabilities: readonly string[];
  language: string;
  role: string;
  style?: string;
}

type FinishReasonWithUnknown = FinishReason | "unknown";

function compactSections(sections: readonly (string | undefined)[]): string[] {
  return sections.filter((section): section is string =>
    Boolean(section?.trim()),
  );
}

function formatPromptBody(body: readonly string[] | string): string {
  if (typeof body === "string") {
    return body;
  }

  return body.map((item) => `- ${item}`).join("\n");
}

function formatPromptSection(section: AgentPromptSection): string {
  return `## ${section.title}\n${formatPromptBody(section.body)}`;
}

export function getAgentInteractionLabel(
  labels: AgentInteractionLabelInput | undefined,
  key: keyof AgentInteractionLabelInput,
  fallback: string,
): string {
  const value = labels?.[key];

  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 80)
    : fallback;
}

function inferFinishReason<TTools extends ToolSet>(
  step: StepResult<TTools>,
): FinishReasonWithUnknown {
  const finishReason =
    (step.finishReason as FinishReasonWithUnknown | undefined) ?? "unknown";

  if (finishReason !== "unknown") {
    return finishReason;
  }

  if (step.toolCalls.length > 0 || step.dynamicToolCalls.length > 0) {
    return "tool-calls";
  }

  if (step.text.length > 0) {
    return "stop";
  }

  return "other";
}

export function formatAgentStepLog<TTools extends ToolSet>(
  step: StepResult<TTools>,
): string {
  const normalizedReason = inferFinishReason(step);
  const details: string[] = [];

  if (step.toolCalls.length > 0) {
    details.push(`toolCalls=${step.toolCalls.length}`);
  }

  if (step.dynamicToolCalls.length > 0) {
    details.push(`dynamicToolCalls=${step.dynamicToolCalls.length}`);
  }

  if (step.text.length > 0) {
    details.push(`textChars=${step.text.length}`);
  }

  const tokenUsage =
    step.usage.totalTokens ?? step.usage.outputTokens ?? step.usage.inputTokens;

  if (tokenUsage) {
    details.push(`tokens=${tokenUsage}`);
  }

  return details.length > 0
    ? `${normalizedReason} (${details.join(", ")})`
    : normalizedReason;
}

export function buildAgentHarnessSystemPrompt({
  contextSections = [],
  language,
  role,
  rules,
  workflow,
}: BuildAgentHarnessPromptOptions): string {
  return compactSections([
    `You are ${role}.`,
    AGENT_HARNESS_SHARED_INSTRUCTIONS,
    AI_DETERMINISTIC_BOUNDARY_INSTRUCTIONS,
    AGENT_INTERFACE_NEUTRAL_INSTRUCTIONS,
    `## Workflow\n${formatPromptBody(workflow)}`,
    `## Rules\n${formatPromptBody(rules)}`,
    ...contextSections.map(formatPromptSection),
    language ? `Language: ${language}` : undefined,
  ]).join("\n\n");
}

export function buildSpecializedAgentInstructions({
  capabilities,
  language,
  role,
  style = "Be concise and direct.",
}: BuildSpecializedAgentInstructionsOptions): string {
  return compactSections([
    `You are ${role}.`,
    AGENT_HARNESS_SHARED_INSTRUCTIONS,
    AI_DETERMINISTIC_BOUNDARY_INSTRUCTIONS,
    `## Capabilities\n${formatPromptBody(capabilities)}`,
    `Language: ${language}. ${style}`,
  ]).join("\n\n");
}

export function createAgentQuestionInteraction({
  confirmLabel = "Confirm",
  context,
  declineLabel = "Reject",
  metadata,
  question,
  title,
}: {
  confirmLabel?: string;
  context?: string;
  declineLabel?: string;
  metadata?: Record<string, unknown>;
  question: string;
  title: string;
}): AgentInteractionSpec {
  return {
    actions: [
      { id: "confirm", intent: "confirm", label: confirmLabel },
      { id: "reject", intent: "reject", label: declineLabel },
    ],
    body: context ? `${question}\n\n${context}` : question,
    kind: "question",
    metadata,
    title,
    version: "konfi.agent-interaction.v1",
  };
}

export function createAgentApprovalInteraction({
  approveLabel = "Approve",
  body,
  metadata,
  rejectLabel = "Reject",
  title,
}: {
  approveLabel?: string;
  body: string;
  metadata?: Record<string, unknown>;
  rejectLabel?: string;
  title: string;
}): AgentInteractionSpec {
  return {
    actions: [
      { id: "approve", intent: "confirm", label: approveLabel },
      { id: "reject", intent: "reject", label: rejectLabel },
    ],
    body,
    kind: "approval",
    metadata,
    title,
    version: "konfi.agent-interaction.v1",
  };
}

export function createAgentFormInteraction({
  body,
  cancelLabel = "Cancel",
  fields,
  metadata,
  submitLabel = "Submit",
  title,
}: {
  body?: string;
  cancelLabel?: string;
  fields: readonly AgentInteractionField[];
  metadata?: Record<string, unknown>;
  submitLabel?: string;
  title: string;
}): AgentInteractionSpec {
  return {
    actions: [
      { id: "submit", intent: "submit", label: submitLabel },
      { id: "cancel", intent: "cancel", label: cancelLabel },
    ],
    body,
    fields,
    kind: "form",
    metadata,
    title,
    version: "konfi.agent-interaction.v1",
  };
}
