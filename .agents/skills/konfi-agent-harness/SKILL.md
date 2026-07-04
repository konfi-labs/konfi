---
name: konfi-agent-harness
description: "Use when designing, reviewing, or fixing Konfi AI agents, durable workflows, external-provider import, external price fetch, quote/order/product agents, AI tool loops, human-in-the-loop prompts, or agent UI/task surfaces. Applies to avoiding regex/prose parsing of model output, adding tool schemas, subagents, json-render-style interaction specs, and separating AI decisions from deterministic validation."
---

# Konfi Agent Harness

Use this skill whenever Konfi AI work touches durable agents, external imports,
price fetching, quote/order/product creation, agent task pages, chat-based agent
interfaces, or reusable agent tooling.

## Research summary

- Anthropic, *Building Effective Agents*: start with the simplest composable
  pattern; distinguish deterministic workflows from agents that dynamically
  choose tools; use agents for open-ended work; invest in high-quality tool
  interfaces; keep human checkpoints for expensive or irreversible actions; add
  stop conditions and observability.
- AI SDK agent docs: use ToolLoopAgent or explicit `generateText`/`streamText`
  workflows with `stopWhen`, `prepareStep`, `toolChoice`, strong `inputSchema`,
  tool lifecycle logging, abort signals, and subagents for context isolation or
  specialized tool access.
- AI SDK call-options docs: when runtime context should modify agent behavior,
  define `callOptionsSchema`, use `prepareCall` to inject context or adjust
  settings, and pass typed `options` to `generate()`/`stream()` instead of
  creating multiple near-identical agents.
- AI SDK workflows/subagents docs: split complex work into prompt chaining,
  routing, parallelization, orchestrator-worker, or evaluator-optimizer patterns
  only when the task needs that structure.
- Vercel json-render: model-generated UI should target a constrained component
  catalog/registry and render structured specs, not arbitrary code. This fits
  confirmations, review forms, editable plans, and generated dashboards.
- OpenClaw-style harnesses: durable work can span channels and domains when the
  harness treats chat, task cards, file editing, browser control, and canvas
  surfaces as interfaces over the same session state and tool contract.

## Core rule: AI vs deterministic boundaries

- Use AI for ambiguous interpretation, planning, extraction, and tool choice.
- Use tool calls or structured output for AI decisions.
- Do **not** parse model prose with regex/string heuristics to decide intent,
  approval, IDs, workflow state, or pricing strategy.
- Deterministic code validates model output against known IDs, schemas, enums,
  thresholds, persisted hook tokens, catalog constraints, and provider data.
- Regex is fine for deterministic source formats: URLs, placeholders, dates,
  HTML cleanup, provider error text, or known external API shapes.
- If evidence is missing, ask the user through a structured interaction tool or
  return a blocked item; do not invent values.

## Konfi implementation checklist

1. Add shared harness instructions from `apps/admin/lib/ai/agent-harness.ts` to
   any new agent prompt or ToolLoopAgent instructions.
2. For extraction/classification calls, prefer AI SDK structured output or forced
   tool calls with `toolChoice: { type: "tool", toolName: "..." }`.
3. Use AI SDK call options when locale, user/session context, task priority,
  provider settings, or enabled tools vary per invocation.
4. Keep deterministic validation separate from the AI call. Examples:
   - customer auto-select requires known customer ID and confidence threshold;
   - external endpoint selections are sanitized against actual endpoint IDs and
     attribute values;
   - product drafts are validated against catalog schema before finalization;
   - pending hook tokens in Firestore remain the source of truth for resumes.
5. Treat tasks pages, assistant chat, sidebars, and future component renderers as
   views over the same agent interaction contract.
6. When asking the user to edit structured data, emit an interaction spec with a
   form and prefilled JSON/data. Use questions only for free-form clarification
   and approvals only for yes/no decisions.
7. Keep long-running durable work in workflows/steps; put Node-dependent code in
   `"use step"` functions and keep workflow functions orchestration-focused.
8. Add focused tests for pure harness utilities and deterministic guards before
   relying on hidden integration behavior.

## Good patterns

- Shared prompt sections for autonomy, deterministic boundaries, and
  interface-neutral UI.
- Tool schemas with precise descriptions and examples of allowed IDs/values.
- Forced tool calls for single-purpose extraction/classification helpers.
- Structured interaction payloads such as `konfi.agent-interaction.v1` with
  `question`, `approval`, or `form` variants.
- Subagents/specialized agents for isolated tool access, such as web search,
  URL analysis, code execution, and maps.
- `callOptionsSchema` + `prepareCall` for per-call runtime data such as locale,
  session context, user role, urgency, or provider/tool settings.
- Forward `abortSignal` from parent tool execution into subagent
  `generate()`/`stream()` calls so cancellation cleans up nested work.
- Tool descriptions, schemas, and input examples that make the agent-computer
  interface obvious and hard to misuse.

## Red flags

- Reading model free text and deciding with regex like `/yes|confirm/i`.
- Using prose-only questions in resumable workflows.
- Adding page-specific task state when the same interaction should also work in
  chat or another renderer.
- Making model outputs deterministic with seeds, low temperature, or retries
  instead of validating them after generation.
- Creating separate agents just to vary per-call context that belongs in typed
  call options.
- Inventing provider parameter names, catalog IDs, option values, or price tiers
  that are not grounded in tool results.
