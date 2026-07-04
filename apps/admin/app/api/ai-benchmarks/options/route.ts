import { requireSuperAdminAuth } from "@/actions/auth-utils";
import {
  getRegisteredTaskTypes,
  isTaskTypeSupported,
} from "@/lib/ai/durable-agents/registry";
import {
  summarizeOrderForBenchmark,
  summarizeQuoteForBenchmark,
} from "@/lib/ai/benchmarks/quote-comparison";
import { summarizeProductForBenchmark } from "@/lib/ai/benchmarks/product-comparison";
import { getAdminDb } from "@/lib/firebase/serverApp";
import type {
  AiBenchmarkAgentOption,
  AiBenchmarkOrderOption,
  AiBenchmarkProductOption,
  AiBenchmarkQuoteOption,
  BenchmarkAgentTaskType,
} from "@/lib/ai/benchmarks/types";
import { WHATS_NEW_BENCHMARK_TASK_TYPES } from "@/lib/ai/benchmarks/types";
import { INBOUND_EMAIL_BENCHMARK_TASK_TYPE } from "@/lib/ai/inbound-email/types";
import type { Order, Product, Quote } from "@konfi/types";

import { connection, NextRequest, NextResponse } from "next/server";

function isBenchmarkAgentTaskType(
  value: string,
): value is BenchmarkAgentTaskType {
  return isTaskTypeSupported(value);
}

export async function GET(request: NextRequest) {
  await connection();

  try {
    await requireSuperAdminAuth();

    const channelId = request.nextUrl.searchParams.get("channelId");
    if (!channelId) {
      return NextResponse.json(
        { error: "Missing channelId parameter" },
        { status: 400 },
      );
    }

    const agents = getRegisteredTaskTypes()
      .flatMap((entry): AiBenchmarkAgentOption[] => {
        if (!isBenchmarkAgentTaskType(entry.taskType)) {
          return [];
        }

        return [
          {
            benchmarkType:
              entry.taskType === "quote"
                ? "quote-match"
                : entry.taskType === "order"
                  ? "order-match"
                  : entry.taskType === "product"
                    ? "product-match"
                    : "live-run",
            description: entry.description,
            label: entry.label,
            requiresPrompt: true,
            requiresQuoteTarget: entry.taskType === "quote",
            targetType:
              entry.taskType === "quote" ||
              entry.taskType === "order" ||
              entry.taskType === "product"
                ? entry.taskType
                : undefined,
            taskType: entry.taskType,
          },
        ];
      })
      .concat([
        {
          benchmarkType: INBOUND_EMAIL_BENCHMARK_TASK_TYPE,
          description:
            "Inbound email routing workflow scored by an AI judge with guardrail fixtures for order, quote, and blocked outcomes",
          label: "Inbound Email Routing",
          requiresPrompt: false,
          requiresQuoteTarget: false,
          taskType: INBOUND_EMAIL_BENCHMARK_TASK_TYPE,
        },
        {
          benchmarkType: WHATS_NEW_BENCHMARK_TASK_TYPES.WEEKLY,
          description:
            "Autonomous weekly What's New cron generation scored by an AI judge",
          label: "Weekly What's New",
          requiresPrompt: false,
          requiresQuoteTarget: false,
          taskType: WHATS_NEW_BENCHMARK_TASK_TYPES.WEEKLY,
        },
        {
          benchmarkType: WHATS_NEW_BENCHMARK_TASK_TYPES.MONTHLY,
          description:
            "Autonomous monthly What's New growth cron generation scored by an AI judge",
          label: "Monthly What's New",
          requiresPrompt: false,
          requiresQuoteTarget: false,
          taskType: WHATS_NEW_BENCHMARK_TASK_TYPES.MONTHLY,
        },
      ]);

    const firestore = getAdminDb();
    const channelRef = firestore.collection("channels").doc(channelId);
    const [quotesSnapshot, ordersSnapshot, productsSnapshot] =
      await Promise.all([
        channelRef.collection("quotes").limit(100).get(),
        channelRef.collection("orders").limit(100).get(),
        channelRef.collection("products").limit(100).get(),
      ]);

    const quotes: AiBenchmarkQuoteOption[] = quotesSnapshot.docs
      .map((doc) => {
        const quote = { id: doc.id, ...doc.data() } as Quote;
        return {
          ...summarizeQuoteForBenchmark(quote),
          createdAt:
            quote.createdAt instanceof Date
              ? quote.createdAt.toISOString()
              : quote.createdAt &&
                  typeof quote.createdAt === "object" &&
                  "toDate" in quote.createdAt &&
                  typeof quote.createdAt.toDate === "function"
                ? quote.createdAt.toDate().toISOString()
                : undefined,
        };
      })
      .toSorted((left, right) => right.number - left.number);

    const orders: AiBenchmarkOrderOption[] = ordersSnapshot.docs
      .map((doc) => {
        const order = { id: doc.id, ...doc.data() } as Order;
        return {
          ...summarizeOrderForBenchmark(order),
          createdAt:
            order.createdAt instanceof Date
              ? order.createdAt.toISOString()
              : order.createdAt &&
                  typeof order.createdAt === "object" &&
                  "toDate" in order.createdAt &&
                  typeof order.createdAt.toDate === "function"
                ? order.createdAt.toDate().toISOString()
                : undefined,
        };
      })
      .toSorted((left, right) => right.number - left.number);

    const products: AiBenchmarkProductOption[] = productsSnapshot.docs
      .map((doc) => {
        const product = { id: doc.id, ...doc.data() } as Product;
        return {
          ...summarizeProductForBenchmark(product),
          updatedAt:
            product.updatedAt instanceof Date
              ? product.updatedAt.toISOString()
              : product.updatedAt &&
                  typeof product.updatedAt === "object" &&
                  "toDate" in product.updatedAt &&
                  typeof product.updatedAt.toDate === "function"
                ? product.updatedAt.toDate().toISOString()
                : undefined,
        };
      })
      .toSorted((left, right) => left.name.localeCompare(right.name));

    return NextResponse.json({ agents, orders, products, quotes });
  } catch (error) {
    console.error("[AI Benchmarks Options] Error:", error);
    const status =
      error instanceof Error && "statusCode" in error
        ? Number((error as { statusCode: number }).statusCode)
        : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load options",
      },
      { status },
    );
  }
}
