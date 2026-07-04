import "server-only";

import { buildSpecializedAgentInstructions } from "./agent-harness";
import { getVertexClient } from "./server-vertex";
export { getDefaultSystemPrompt } from "./agent-system-prompt";
import { MODELS } from "@konfi/firebase";
import {
  Experimental_InferAgentUIMessage as InferAgentUIMessage,
  ToolLoopAgent,
  ToolSet,
  tool,
  isStepCount,
} from "ai";
import { z } from "zod";

// Specialized agent types
export type SpecializedAgentType =
  | "search" // Web search and URL analysis (Google Search + URL Context)
  | "code" // Python code execution for calculations
  | "maps"; // Location-based queries (Google Maps)

export interface AgentInvocationResult {
  agentType: SpecializedAgentType;
  query: string;
  result: string;
  sources?: Array<{ url: string; title: string }>;
}

type NativeToolSet = ToolSet;

const specializedAgentCallOptionsSchema = z.object({
  locale: z
    .string()
    .min(2)
    .describe("Response locale/language for this agent invocation."),
  taskContext: z
    .string()
    .optional()
    .describe("Short runtime context that should influence this call only."),
});

export type SpecializedAgentCallOptions = z.infer<
  typeof specializedAgentCallOptionsSchema
>;

const SPECIALIZED_AGENT_TASK_CONTEXT: Record<SpecializedAgentType, string> = {
  code: "Run executable analysis for a delegated calculation or data task.",
  maps: "Answer a delegated location or geographic question.",
  search: "Research a delegated web or URL-analysis question.",
};

const SPECIALIZED_AGENT_TOTAL_TIMEOUT_MS = 50_000;
const SPECIALIZED_AGENT_STEP_TIMEOUT_MS = 45_000;

function appendRuntimeCallOptions(
  instructions: string | undefined,
  options: SpecializedAgentCallOptions,
): string {
  return [
    instructions,
    [
      "## Runtime call options",
      `- Response locale: ${options.locale}`,
      options.taskContext
        ? `- Task context: ${options.taskContext}`
        : undefined,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
  ]
    .filter((section): section is string => Boolean(section?.trim()))
    .join("\n\n");
}

function getSpecializedAgentCallOptions(
  agentType: SpecializedAgentType,
  locale: string,
): SpecializedAgentCallOptions {
  return {
    locale,
    taskContext: SPECIALIZED_AGENT_TASK_CONTEXT[agentType],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return String(error);
}

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.name === "AbortError" ||
      error.message.toLowerCase().includes("aborted")
    );
  }

  return (
    isRecord(error) &&
    (error.name === "AbortError" ||
      error.code === 20 ||
      (typeof error.message === "string" &&
        error.message.toLowerCase().includes("aborted")))
  );
}

function getSpecializedAgentFailureResult(
  agentType: SpecializedAgentType,
  error: unknown,
): string {
  if (isAbortLikeError(error)) {
    return `The ${agentType} agent timed out before returning a result. Do not retry the same tool call unchanged; answer from the information already available or ask the user to narrow the request.`;
  }

  return `Error executing ${agentType} agent: ${getErrorMessage(error)}`;
}

/**
 * Get native tools for the search agent (Google Search + URL Context)
 */
function getSearchAgentTools(): NativeToolSet {
  return {};
}

/**
 * Get native tools for the code agent (Code Execution)
 */
function getCodeAgentTools(): NativeToolSet {
  return {};
}

/**
 * Get native tools for the maps agent (Google Maps)
 */
function getMapsAgentTools(): NativeToolSet {
  return {};
}

// ============================================================================
// Specialized ToolLoopAgents
// ============================================================================

/**
 * Create a search agent using ToolLoopAgent for web search and URL analysis
 */
export async function createSearchAgent() {
  const vertex = await getVertexClient();
  const model = vertex(MODELS.GEMINI_3_FLASH);
  const tools = getSearchAgentTools();
  const instructions = buildSpecializedAgentInstructions({
    capabilities: [
      "Use google_search for web queries and current information.",
      "Use url_context for analyzing URLs provided by the user or parent assistant.",
      "Return accurate, sourced answers and distinguish source evidence from model judgment.",
    ],
    language: "the runtime locale provided in call options",
    role: "a research assistant",
    style: "Provide accurate information with sources. Be concise and direct.",
  });

  return new ToolLoopAgent({
    callOptionsSchema: specializedAgentCallOptionsSchema,
    id: "search-agent",
    model,
    instructions,
    prepareCall: ({ options, ...settings }) => ({
      ...settings,
      instructions: appendRuntimeCallOptions(instructions, options),
    }),
    tools,
    stopWhen: isStepCount(5),
  });
}

/**
 * Create a code execution agent using ToolLoopAgent for calculations
 */
export async function createCodeAgent() {
  const vertex = await getVertexClient();
  const model = vertex(MODELS.GEMINI_3_FLASH);
  const tools = getCodeAgentTools();
  const instructions = buildSpecializedAgentInstructions({
    capabilities: [
      "Use code_execution for calculations, data analysis, and algorithmic tasks.",
      "Prefer executable checks over mental math when results affect business decisions.",
      "Summarize inputs, assumptions, and final results without exposing unnecessary implementation noise.",
    ],
    language: "the runtime locale provided in call options",
    role: "a computational assistant",
    style: "Show useful work. Be concise and direct.",
  });

  return new ToolLoopAgent({
    callOptionsSchema: specializedAgentCallOptionsSchema,
    id: "code-agent",
    model,
    instructions,
    prepareCall: ({ options, ...settings }) => ({
      ...settings,
      instructions: appendRuntimeCallOptions(instructions, options),
    }),
    tools,
    stopWhen: isStepCount(5),
  });
}

/**
 * Create a maps agent using ToolLoopAgent for location queries
 */
export async function createMapsAgent() {
  const vertex = await getVertexClient();
  const model = vertex(MODELS.GEMINI_3_FLASH);
  const tools = getMapsAgentTools();
  const instructions = buildSpecializedAgentInstructions({
    capabilities: [
      "Use google_maps for location queries, directions, and geographic information.",
      "Keep location facts grounded in tool output and clarify uncertainty when tool data is incomplete.",
    ],
    language: "the runtime locale provided in call options",
    role: "a location specialist",
  });

  return new ToolLoopAgent({
    callOptionsSchema: specializedAgentCallOptionsSchema,
    id: "maps-agent",
    model,
    instructions,
    prepareCall: ({ options, ...settings }) => ({
      ...settings,
      instructions: appendRuntimeCallOptions(instructions, options),
    }),
    tools,
    stopWhen: isStepCount(5),
  });
}

// Type exports for UI message inference
export type SearchAgentUIMessage = InferAgentUIMessage<
  Awaited<ReturnType<typeof createSearchAgent>>
>;
export type CodeAgentUIMessage = InferAgentUIMessage<
  Awaited<ReturnType<typeof createCodeAgent>>
>;
export type MapsAgentUIMessage = InferAgentUIMessage<
  Awaited<ReturnType<typeof createMapsAgent>>
>;

// ============================================================================
// Agent Invocation Helpers
// ============================================================================

/**
 * Invoke a specialized agent and return the result
 * Uses the new ToolLoopAgent.generate() method for cleaner execution
 */
async function invokeSpecializedAgent(
  agentType: SpecializedAgentType,
  query: string,
  locale: string,
  abortSignal?: AbortSignal,
): Promise<AgentInvocationResult> {
  try {
    const options = getSpecializedAgentCallOptions(agentType, locale);
    let result: Awaited<
      ReturnType<Awaited<ReturnType<typeof createSearchAgent>>["generate"]>
    >;

    switch (agentType) {
      case "search": {
        const agent = await createSearchAgent();
        result = await agent.generate({
          abortSignal,
          options,
          prompt: query,
          timeout: {
            totalMs: SPECIALIZED_AGENT_TOTAL_TIMEOUT_MS,
            stepMs: SPECIALIZED_AGENT_STEP_TIMEOUT_MS,
          },
        });
        break;
      }
      case "code": {
        const agent = await createCodeAgent();
        result = await agent.generate({
          abortSignal,
          options,
          prompt: query,
          timeout: {
            totalMs: SPECIALIZED_AGENT_TOTAL_TIMEOUT_MS,
            stepMs: SPECIALIZED_AGENT_STEP_TIMEOUT_MS,
          },
        });
        break;
      }
      case "maps": {
        const agent = await createMapsAgent();
        result = await agent.generate({
          abortSignal,
          options,
          prompt: query,
          timeout: {
            totalMs: SPECIALIZED_AGENT_TOTAL_TIMEOUT_MS,
            stepMs: SPECIALIZED_AGENT_STEP_TIMEOUT_MS,
          },
        });
        break;
      }
    }

    return {
      agentType,
      query,
      result:
        result.text.trim() ||
        "The specialized agent completed but returned no visible text.",
    };
  } catch (error) {
    const result = getSpecializedAgentFailureResult(agentType, error);
    if (isAbortLikeError(error)) {
      console.warn(
        `[Specialized Agent ${agentType}] Timed out after ${SPECIALIZED_AGENT_TOTAL_TIMEOUT_MS}ms.`,
      );
    } else {
      console.error(`[Specialized Agent ${agentType}] Error:`, error);
    }

    return {
      agentType,
      query,
      result,
    };
  }
}

// ============================================================================
// Specialized Agent Tools for Main Assistant
// ============================================================================

/**
 * Create specialized agent tools that can be added to the main assistant's toolset
 * These tools allow the main assistant to delegate to specialized agents for native Vertex capabilities
 */
export function createSpecializedAgentTools(locale: string): ToolSet {
  return {
    webSearch: tool({
      description:
        "Search the web for real-time information, news, current events, or any query requiring up-to-date web data. Use this for questions about recent events, live data, or when you need to look something up online.",
      inputSchema: z.object({
        query: z.string().describe("The search query to look up on the web."),
      }),
      inputExamples: [
        {
          input: {
            query:
              "latest print marketing campaign opportunities in Poland this month",
          },
        },
      ],
      execute: async ({ query }, { abortSignal }) => {
        if (process.env.NODE_ENV === "development") {
          console.log(
            `[webSearch] Invoking search agent with query: "${query}"`,
          );
        }
        const result = await invokeSpecializedAgent(
          "search",
          query,
          locale,
          abortSignal,
        );
        return {
          answer: result.result,
          sources: result.sources,
        };
      },
    }),

    analyzeUrl: tool({
      description:
        "Analyze and extract information from a specific URL. Use this when the user provides a link and wants you to read or summarize its content.",
      inputSchema: z.object({
        url: z.string().url().describe("The URL to analyze."),
        question: z
          .string()
          .optional()
          .describe("Optional specific question about the URL content."),
      }),
      inputExamples: [
        {
          input: {
            question: "Summarize the agent-building recommendations.",
            url: "https://ai-sdk.dev/docs/agents/building-agents",
          },
        },
      ],
      execute: async ({ url, question }, { abortSignal }) => {
        const query = question
          ? `Analyze this URL and answer: ${question}\nURL: ${url}`
          : `Analyze and summarize the content at: ${url}`;

        if (process.env.NODE_ENV === "development") {
          console.log(`[analyzeUrl] Invoking search agent for URL: "${url}"`);
        }
        const result = await invokeSpecializedAgent(
          "search",
          query,
          locale,
          abortSignal,
        );
        return {
          answer: result.result,
          url,
        };
      },
    }),

    executeCode: tool({
      description:
        "Execute Python code for calculations, data analysis, mathematical operations, or algorithmic tasks. Use this for complex calculations, statistical analysis, or when you need to run actual code.",
      inputSchema: z.object({
        task: z
          .string()
          .describe("Description of the calculation or code task to perform."),
      }),
      inputExamples: [
        {
          input: {
            task: "Calculate gross margin for revenue 12000 PLN and cost 7800 PLN.",
          },
        },
      ],
      execute: async ({ task }, { abortSignal }) => {
        if (process.env.NODE_ENV === "development") {
          console.log(`[executeCode] Invoking code agent with task: "${task}"`);
        }
        const result = await invokeSpecializedAgent(
          "code",
          task,
          locale,
          abortSignal,
        );
        return {
          answer: result.result,
        };
      },
    }),

    locationQuery: tool({
      description:
        "Query Google Maps for location-based information including places, directions, distances, business information, and geographic data. Use this for any location or mapping related questions.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "The location-related query (e.g., 'restaurants near Times Square', 'directions from A to B', 'distance between cities').",
          ),
      }),
      inputExamples: [
        {
          input: {
            query: "distance from Warsaw to Łódź and typical driving time",
          },
        },
      ],
      execute: async ({ query }, { abortSignal }) => {
        if (process.env.NODE_ENV === "development") {
          console.log(
            `[locationQuery] Invoking maps agent with query: "${query}"`,
          );
        }
        const result = await invokeSpecializedAgent(
          "maps",
          query,
          locale,
          abortSignal,
        );
        return {
          answer: result.result,
        };
      },
    }),
  };
}
