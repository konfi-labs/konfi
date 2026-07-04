import "server-only";

import { z } from "zod";
import { getVertexClient } from "@/lib/ai/server-vertex";
import type { QuoteAgentData } from "@/lib/ai/durable-agents/types";
import type { InboundEmailRecord } from "@/lib/ai/inbound-email/types";
import type { FeedGenerationResult } from "@/lib/whats-new/feed";
import { inboundEmailRoutingBenchmarkExpectation } from "./inbound-email-routing";
import type {
  AiBenchmarkComparisonResult,
  AiBenchmarkInboundEmailRoutingLiveSummary,
  AiBenchmarkJudgeResult,
  AiBenchmarkLiveRunSummary,
  BenchmarkAgentTaskType,
  WhatsNewBenchmarkTaskType,
} from "./types";
import type { Order, Product, Quote } from "@konfi/types";
import { MODELS } from "@konfi/firebase";

const JUDGE_MODEL = MODELS.GEMINI_3_FLASH_LITE;

interface CompactValueOptions {
  maxArrayItems: number;
  maxDepth: number;
  maxObjectEntries: number;
  maxStringLength: number;
}

const DEFAULT_COMPACT_VALUE_OPTIONS: CompactValueOptions = {
  maxArrayItems: 20,
  maxDepth: 6,
  maxObjectEntries: 24,
  maxStringLength: 700,
};

async function getAiRuntime() {
  return await import("ai");
}

function compactQuote(quote: Quote) {
  return {
    contact: quote.contact,
    customer:
      typeof quote.customer === "object"
        ? {
            id: quote.customer.id,
            name: quote.customer.name,
          }
        : quote.customer,
    items: quote.items.map((item) => ({
      combination: item.calculatedCombination ?? item.combination,
      customPrice: item.customPrice,
      customSizes: item.customSizes,
      description: item.description,
      expressPercent: item.expressPercent,
      height: item.height,
      productId: item.product?.id,
      productName: item.product?.name,
      quantity: item.quantity,
      totalPrice: item.totalPrice,
      unit: item.unit,
      volume: item.volume,
      width: item.width,
    })),
    shippingOption: quote.shippingOption,
    shippingPrice: quote.shippingPrice,
    specialNotes: quote.specialNotes,
    totalPrice: quote.totalPrice,
  };
}

function summarizeDeepValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > 160 ? `${value.slice(0, 160).trim()}...` : value;
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return {
      omittedNestedItems: value.length,
    };
  }

  if (typeof value === "object") {
    const primitiveEntries = Object.entries(
      value as Record<string, unknown>,
    ).filter(([, entry]) => {
      return (
        entry === null ||
        entry === undefined ||
        typeof entry === "string" ||
        typeof entry === "number" ||
        typeof entry === "boolean"
      );
    });

    if (primitiveEntries.length === 0) {
      return {
        omittedNestedFields: Object.keys(value).length,
      };
    }

    return Object.fromEntries(primitiveEntries.slice(0, 8));
  }

  return String(value);
}

export function compactBenchmarkValue(
  value: unknown,
  options: Partial<CompactValueOptions> = {},
  depth: number = 0,
): unknown {
  const resolvedOptions = {
    ...DEFAULT_COMPACT_VALUE_OPTIONS,
    ...options,
  };

  if (typeof value === "string") {
    return value.length > resolvedOptions.maxStringLength
      ? `${value.slice(0, resolvedOptions.maxStringLength).trim()}...`
      : value;
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const compacted = value
      .slice(0, resolvedOptions.maxArrayItems)
      .map((item) =>
        depth >= resolvedOptions.maxDepth
          ? summarizeDeepValue(item)
          : compactBenchmarkValue(item, resolvedOptions, depth + 1),
      );

    if (value.length > resolvedOptions.maxArrayItems) {
      compacted.push({
        omittedItems: value.length - resolvedOptions.maxArrayItems,
      });
    }

    return compacted;
  }

  if (typeof value === "object") {
    if (depth >= resolvedOptions.maxDepth) {
      return summarizeDeepValue(value);
    }

    const entries = Object.entries(value as Record<string, unknown>).slice(
      0,
      resolvedOptions.maxObjectEntries,
    );
    const compacted: Record<string, unknown> = {};

    for (const [key, entry] of entries) {
      compacted[key] = compactBenchmarkValue(entry, resolvedOptions, depth + 1);
    }

    const omittedCount = Object.keys(value).length - entries.length;
    if (omittedCount > 0) {
      compacted.omittedFields = omittedCount;
    }

    return compacted;
  }

  return String(value);
}

export async function judgeQuoteBenchmarkOutput(options: {
  expectedQuote: Quote;
  generatedData: QuoteAgentData;
  deterministicComparison: AiBenchmarkComparisonResult;
}): Promise<AiBenchmarkJudgeResult> {
  const { generateText, Output } = await getAiRuntime();
  const vertex = await getVertexClient();

  const schema = z.object({
    score: z.number().min(0).max(100),
    rationale: z.string(),
    strengths: z.array(z.string()),
    problems: z.array(z.string()),
  });

  const result = await generateText({
    model: vertex(JUDGE_MODEL),
    output: Output.object({ schema }),
    prompt: JSON.stringify({
      deterministicComparison: options.deterministicComparison,
      expectedQuote: compactQuote(options.expectedQuote),
      generatedQuoteData: options.generatedData,
    }),
    instructions:
      "You judge whether an AI agent reconstructed the expected Konfi quote. Score from 0 to 100. Focus on customer, products, quantities, sizes, prices, discounts, shipping, and notes. Be strict about business-critical differences, but do not penalize harmless formatting differences already covered by deterministic scoring.",
    temperature: 0,
  });

  return {
    ...result.output,
    model: JUDGE_MODEL,
  };
}

export async function judgeOrderBenchmarkOutput(options: {
  expectedOrder: Order;
  generatedData: QuoteAgentData;
  deterministicComparison: AiBenchmarkComparisonResult;
}): Promise<AiBenchmarkJudgeResult> {
  const { generateText, Output } = await getAiRuntime();
  const vertex = await getVertexClient();

  const schema = z.object({
    score: z.number().min(0).max(100),
    rationale: z.string(),
    strengths: z.array(z.string()),
    problems: z.array(z.string()),
  });

  const result = await generateText({
    model: vertex(JUDGE_MODEL),
    output: Output.object({ schema }),
    prompt: JSON.stringify({
      deterministicComparison: options.deterministicComparison,
      expectedOrder: compactBenchmarkValue(options.expectedOrder),
      generatedOrderData: options.generatedData,
    }),
    instructions:
      "You judge whether an AI agent reconstructed the expected Konfi order. Score from 0 to 100. Focus on customer, contact, products, quantities, sizes, prices, shipping, payment-sensitive notes, and operational readiness. Be strict about business-critical differences, but do not penalize harmless formatting differences already covered by deterministic scoring.",
    temperature: 0,
  });

  return {
    ...result.output,
    model: JUDGE_MODEL,
  };
}

export async function judgeProductBenchmarkOutput(options: {
  expectedProduct: Product;
  generatedData: unknown;
  deterministicComparison: AiBenchmarkComparisonResult;
}): Promise<AiBenchmarkJudgeResult> {
  const { generateText, Output } = await getAiRuntime();
  const vertex = await getVertexClient();

  const schema = z.object({
    score: z.number().min(0).max(100),
    rationale: z.string(),
    strengths: z.array(z.string()),
    problems: z.array(z.string()),
  });

  const result = await generateText({
    model: vertex(JUDGE_MODEL),
    output: Output.object({ schema }),
    prompt: JSON.stringify(
      compactBenchmarkValue({
        deterministicComparison: options.deterministicComparison,
        expectedProduct: options.expectedProduct,
        generatedProductData: options.generatedData,
      }),
    ),
    instructions:
      "You judge whether an AI agent reconstructed the expected Konfi product draft. Score from 0 to 100. Focus on product name, product type, attributes, options, dimensions, price type, price rows, shipping, catalog readiness, and unresolved blocked items. Be strict about invented catalog values and missing pricing, but do not penalize harmless formatting differences already covered by deterministic scoring.",
    temperature: 0,
  });

  return {
    ...result.output,
    model: JUDGE_MODEL,
  };
}

export async function judgeWhatsNewBenchmarkOutput(options: {
  benchmarkType: WhatsNewBenchmarkTaskType;
  result: FeedGenerationResult;
}): Promise<AiBenchmarkJudgeResult> {
  const { generateText, Output } = await getAiRuntime();
  const vertex = await getVertexClient();

  const schema = z.object({
    score: z.number().min(0).max(100),
    rationale: z.string(),
    strengths: z.array(z.string()),
    problems: z.array(z.string()),
  });

  const result = await generateText({
    model: vertex(JUDGE_MODEL),
    output: Output.object({ schema }),
    prompt: JSON.stringify(
      compactBenchmarkValue({
        benchmarkType: options.benchmarkType,
        result: options.result,
      }),
    ),
    instructions: [
      "You judge an autonomous Konfi What's New cron benchmark.",
      "There is no user prompt; the job should independently decide what admins need to see.",
      "Score from 0 to 100.",
      "For weekly runs, reward concise, informative bilingual summaries grounded in recent change-log evidence. Do not require weekly highlights to be action-oriented.",
      "For weekly campaign proposals, judge the generated campaign and promotion output when present: local timing, selected calendar event, one to three product IDs, discount at or below 30 percent, clear bilingual copy, automatic promotion shape, and whether returning zero proposals is justified by existing campaign or promotion context.",
      "For monthly runs, reward concise bilingual growth recommendations grounded in the provided products, promotions, campaigns, hero cards, and research.",
      "Penalize invented entities, vague advice, missing English or Polish text, missing highlights, and overly long copy.",
      "For campaign proposals, also penalize irrelevant global events, non-local timing for Poland, duplicate promotion angles, unknown products, excessive discounts, or a zero count without a clear reason.",
      "For monthly growth recommendations, also penalize recommendations that are not actionable for a print shop admin.",
      "If the job skipped because no relevant evidence exists, score whether the skip reason is appropriate instead of demanding generated copy.",
    ].join(" "),
    temperature: 0,
  });

  return {
    ...result.output,
    model: JUDGE_MODEL,
  };
}

export async function judgeInboundEmailRoutingBenchmarkOutput(options: {
  record: InboundEmailRecord;
  summary: AiBenchmarkInboundEmailRoutingLiveSummary;
}): Promise<AiBenchmarkJudgeResult> {
  const { generateText, Output } = await getAiRuntime();
  const vertex = await getVertexClient();

  const schema = z.object({
    score: z.number().min(0).max(100),
    rationale: z.string(),
    strengths: z.array(z.string()),
    problems: z.array(z.string()),
  });

  const result = await generateText({
    model: vertex(JUDGE_MODEL),
    output: Output.object({ schema }),
    prompt: JSON.stringify(
      compactBenchmarkValue({
        actualInboundEmail: {
          adminResponse: options.record.adminResponse,
          from: options.record.from,
          headers: options.record.headers,
          routingDecision: options.record.routingDecision,
          status: options.record.status,
          subject: options.record.subject,
          text: options.record.text,
          to: options.record.to,
        },
        expected: inboundEmailRoutingBenchmarkExpectation,
        summary: options.summary,
      }),
    ),
    instructions: [
      "You judge a completed Konfi inbound email routing benchmark.",
      "Score from 0 to 100 based on whether the real workflow and AI extraction routed the inbound email correctly.",
      "The deterministic benchmark context provides one trusted sender/customer and one known catalog item, but the model still has to extract order details from the email text.",
      "Expected result: trusted inbound email is routed as an order, no block reason, no missing information, customer and product are grounded in the benchmark context, payment is bank transfer, shipping is DPD to the provided example address, and the workflow stops at manual creation review rather than creating a quote or order.",
      "Penalize blocked, quote, missing-information, invented customer/product, wrong payment, wrong shipping, quantity mismatch, missing admin review response, or created resources.",
      "Do not penalize harmless wording differences in the admin response.",
    ].join(" "),
    temperature: 0,
  });

  return {
    ...result.output,
    model: JUDGE_MODEL,
  };
}

export async function judgeLiveRunBenchmarkOutput(options: {
  output: unknown;
  prompt: string;
  summary: AiBenchmarkLiveRunSummary;
  taskType: BenchmarkAgentTaskType;
}): Promise<AiBenchmarkJudgeResult> {
  const { generateText, Output } = await getAiRuntime();
  const vertex = await getVertexClient();

  const schema = z.object({
    score: z.number().min(0).max(100),
    rationale: z.string(),
    strengths: z.array(z.string()),
    problems: z.array(z.string()),
  });

  const taskInstructions =
    options.taskType === "product"
      ? [
          "For product creation, reward a complete reusable product draft.",
          "Check whether the product name, product type, attributes, options, dimensions, and pricing strategy are grounded in the prompt.",
          "Penalize unresolved blocked items, invented catalog values, inconsistent price type selection, missing price rows, or drafts that are not ready for product-form review.",
        ]
      : [
          "For order creation, reward a complete order-ready output.",
          "Check whether customer selection, contact, products, quantities, sizes, prices, shipping, and notes match the prompt.",
          "Penalize missing customer or product data, duplicate items, invented values, missing prices, unresolved confirmation state, or incomplete shipping details.",
        ];

  const result = await generateText({
    model: vertex(JUDGE_MODEL),
    output: Output.object({ schema }),
    prompt: JSON.stringify(
      compactBenchmarkValue({
        generatedOutput: options.output,
        prompt: options.prompt,
        summary: options.summary,
        taskType: options.taskType,
      }),
    ),
    instructions: [
      "You judge a completed live-run Konfi AI benchmark.",
      "Score from 0 to 100 based on whether the agent output satisfies the preserved prompt and is safe for admin review.",
      "Do not require deterministic equality to an expected fixture because live-run benchmarks do not have one.",
      ...taskInstructions,
      "Be strict about business-critical omissions, but do not penalize harmless wording or formatting differences.",
    ].join(" "),
    temperature: 0,
  });

  return {
    ...result.output,
    model: JUDGE_MODEL,
  };
}
