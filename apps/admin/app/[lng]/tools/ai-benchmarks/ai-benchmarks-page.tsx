"use client";

import { useAuth } from "@/context/auth";
import type { AgentMessage, AgentStatus } from "@/context/agents";
import { useChannels } from "@/context/channels";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import type {
  AiBenchmarkAgentOption,
  AiBenchmarkDiffEntry,
  AiBenchmarkOrderOption,
  AiBenchmarkProductOption,
  AiBenchmarkQuoteOption,
  AiBenchmarkRun,
  AiBenchmarkTaskType,
} from "@/lib/ai/benchmarks/types";
import { isWhatsNewBenchmarkTaskType } from "@/lib/ai/benchmarks/types";
import {
  Badge,
  Box,
  Button,
  Card,
  createListCollection,
  Dialog,
  EmptyState,
  Field,
  Grid,
  HStack,
  Portal,
  Progress,
  Select,
  SimpleGrid,
  Spinner,
  Stat,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import {
  CustomHeading,
  MaterialSymbol,
  Tooltip,
  toaster,
} from "@konfi/components";
import { db } from "@konfi/firebase";
import { copyTextToClipboard } from "@konfi/utils";
import { onSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import AgentInteractionPanel from "../tasks/components/AgentInteractionPanel";
import {
  getLatestPendingHook,
  getPendingInteraction,
} from "../tasks/components/taskHelpers";

interface BenchmarkOptionsResponse {
  agents: AiBenchmarkAgentOption[];
  orders: AiBenchmarkOrderOption[];
  products: AiBenchmarkProductOption[];
  quotes: AiBenchmarkQuoteOption[];
}

interface BenchmarkRunsResponse {
  hasMore: boolean;
  nextCursor?: string;
  runs: AiBenchmarkRun[];
  totalCount: number;
}

const STOPPED_STATUSES = new Set<AiBenchmarkRun["status"]>([
  "completed",
  "failed",
]);

const HISTORY_PAGE_SIZE = 10;

interface BenchmarkAgentRun {
  messages?: AgentMessage[];
  runId: string;
  status: AgentStatus;
}

function formatDuration(milliseconds?: number) {
  if (milliseconds === undefined) {
    return "-";
  }

  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

function getScoreColor(score?: number) {
  if (score === undefined) {
    return "gray";
  }

  if (score >= 85) {
    return "success";
  }

  if (score >= 60) {
    return "yellow";
  }

  return "red";
}

function getStatusColor(status: AiBenchmarkRun["status"]) {
  switch (status) {
    case "completed":
      return "success";
    case "awaiting-user-input":
      return "orange";
    case "failed":
      return "red";
    case "running":
    case "starting":
      return "blue";
  }
}

function getRunScore(run: AiBenchmarkRun) {
  return run.deterministicComparison?.percentage ?? run.judge?.score;
}

function mergeBenchmarkRuns(
  previousRuns: AiBenchmarkRun[],
  incomingRuns: AiBenchmarkRun[],
) {
  const runsById = new Map<string, AiBenchmarkRun>();

  for (const run of previousRuns) {
    runsById.set(run.id, run);
  }

  for (const run of incomingRuns) {
    runsById.set(run.id, run);
  }

  return Array.from(runsById.values()).toSorted(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

function isNumberScore(score: number | undefined): score is number {
  return score !== undefined;
}

function getLocalizedRecordValue(
  value: Record<string, string> | undefined,
  language: string | undefined,
) {
  const normalizedLanguage = language?.split("-")[0];

  return (
    (language ? value?.[language] : undefined) ??
    (normalizedLanguage ? value?.[normalizedLanguage] : undefined) ??
    value?.en ??
    value?.pl ??
    Object.values(value ?? {}).find((entry) => entry.trim().length > 0)
  );
}

export default function AiBenchmarksPage() {
  const { t } = useT(["agentBenchmarks", "translation"]);
  const { isSuperAdminClient, user } = useAuth();
  const { channel } = useChannels();
  const [agents, setAgents] = useState<AiBenchmarkAgentOption[]>([]);
  const [orders, setOrders] = useState<AiBenchmarkOrderOption[]>([]);
  const [quotes, setQuotes] = useState<AiBenchmarkQuoteOption[]>([]);
  const [products, setProducts] = useState<AiBenchmarkProductOption[]>([]);
  const [runs, setRuns] = useState<AiBenchmarkRun[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [hasMoreRuns, setHasMoreRuns] = useState(false);
  const [historyTotalCount, setHistoryTotalCount] = useState(0);
  const [agentTaskType, setAgentTaskType] =
    useState<AiBenchmarkTaskType>("quote");
  const [targetOrderId, setTargetOrderId] = useState("");
  const [targetProductId, setTargetProductId] = useState("");
  const [targetQuoteId, setTargetQuoteId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [activeBenchmarkRunId, setActiveBenchmarkRunId] = useState<
    string | null
  >(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [isLoadingMoreRuns, setIsLoadingMoreRuns] = useState(false);
  const [activeAgentRun, setActiveAgentRun] =
    useState<BenchmarkAgentRun | null>(null);
  const [interactionResponse, setInteractionResponse] = useState("");

  const channelId = channel?.id;
  const selectedAgent = agents.find(
    (agent) => agent.taskType === agentTaskType,
  );
  const selectedTargetType =
    selectedAgent?.targetType ??
    (agentTaskType === "quote" ? "quote" : undefined);
  const selectedQuote = quotes.find((quote) => quote.id === targetQuoteId);
  const selectedOrder = orders.find((order) => order.id === targetOrderId);
  const selectedProduct = products.find(
    (product) => product.id === targetProductId,
  );
  const activeRun = runs.find((run) => run.id === activeBenchmarkRunId);
  const requiresPrompt = selectedAgent?.requiresPrompt ?? true;
  const agentCollection = useMemo(
    () =>
      createListCollection({
        items: agents.map((agent) => ({
          label: t(`agents.taskType.${agent.taskType}`, {
            defaultValue: agent.label,
          }),
          value: agent.taskType,
        })),
      }),
    [agents, t],
  );
  const quoteCollection = useMemo(
    () =>
      createListCollection({
        items: quotes.map((quote) => ({
          label: `#${quote.number} · ${quote.customerName} · ${quote.totalPrice}`,
          value: quote.id,
        })),
      }),
    [quotes],
  );
  const orderCollection = useMemo(
    () =>
      createListCollection({
        items: orders.map((order) => ({
          label: `#${order.number} · ${order.customerName} · ${order.totalPrice}`,
          value: order.id,
        })),
      }),
    [orders],
  );
  const productCollection = useMemo(
    () =>
      createListCollection({
        items: products.map((product) => ({
          label: `${product.name} · ${product.priceType} · ${product.priceRows}`,
          value: product.id,
        })),
      }),
    [products],
  );
  const pendingHook = useMemo(
    () => getLatestPendingHook(activeAgentRun?.messages),
    [activeAgentRun?.messages],
  );
  const pendingInteraction = useMemo(
    () => getPendingInteraction(pendingHook),
    [pendingHook],
  );
  const canApproveActiveRun =
    activeAgentRun?.status === "awaiting-approval" &&
    pendingHook?.hookType === "quoteApproval";
  const canRespondToActiveRun =
    activeAgentRun?.status === "awaiting-approval" &&
    pendingHook?.hookType === "userConfirmation";

  const getIdToken = useCallback(async () => {
    if (!user) {
      return null;
    }

    try {
      return await user.getIdToken();
    } catch {
      return null;
    }
  }, [user]);

  const fetchBenchmarkRuns = useCallback(
    async (cursor?: string | null) => {
      if (!channelId) {
        throw new Error("Missing channel id");
      }

      const params = new URLSearchParams({
        channelId,
        limit: HISTORY_PAGE_SIZE.toString(),
      });

      if (cursor) {
        params.set("cursor", cursor);
      }

      const response = await fetch(`/api/ai-benchmarks/list?${params}`);
      if (!response.ok) {
        throw new Error("Failed to load benchmark history");
      }

      return (await response.json()) as BenchmarkRunsResponse;
    },
    [channelId],
  );

  const loadBenchmarks = useCallback(async () => {
    setIsLoading(true);
    try {
      if (!channelId || !isSuperAdminClient) {
        setAgents([]);
        setOrders([]);
        setProducts([]);
        setQuotes([]);
        setRuns([]);
        setHistoryCursor(null);
        setHasMoreRuns(false);
        setHistoryTotalCount(0);
        return;
      }

      const [optionsResponse, history] = await Promise.all([
        fetch(`/api/ai-benchmarks/options?channelId=${channelId}`),
        fetchBenchmarkRuns(),
      ]);

      if (!optionsResponse.ok) {
        throw new Error("Failed to load benchmark options");
      }

      const options =
        (await optionsResponse.json()) as BenchmarkOptionsResponse;

      setAgents(options.agents);
      setOrders(options.orders);
      setProducts(options.products);
      setQuotes(options.quotes);
      setRuns(history.runs);
      setHistoryCursor(history.nextCursor ?? null);
      setHasMoreRuns(history.hasMore);
      setHistoryTotalCount(history.totalCount);
      setActiveBenchmarkRunId((current) => {
        if (current && history.runs.some((run) => run.id === current)) {
          return current;
        }

        return (
          history.runs.find(
            (run) =>
              run.status === "running" ||
              run.status === "starting" ||
              run.status === "awaiting-user-input",
          )?.id ?? null
        );
      });

      if (options.agents.length > 0) {
        setAgentTaskType((current) =>
          options.agents.some((agent) => agent.taskType === current)
            ? current
            : options.agents[0].taskType,
        );
      }
      if (options.quotes.length > 0) {
        setTargetQuoteId((current) =>
          options.quotes.some((quote) => quote.id === current)
            ? current
            : options.quotes[0].id,
        );
      } else {
        setTargetQuoteId("");
      }
      if (options.orders.length > 0) {
        setTargetOrderId((current) =>
          options.orders.some((order) => order.id === current)
            ? current
            : options.orders[0].id,
        );
      } else {
        setTargetOrderId("");
      }
      if (options.products.length > 0) {
        setTargetProductId((current) =>
          options.products.some((product) => product.id === current)
            ? current
            : options.products[0].id,
        );
      } else {
        setTargetProductId("");
      }
    } catch (error) {
      console.error("[AI Benchmarks] Load error:", error);
      toaster.error({
        title: t("agentBenchmarks.errors.load", {
          defaultValue: "Could not load benchmarks",
        }),
      });
    } finally {
      setIsLoading(false);
    }
  }, [channelId, fetchBenchmarkRuns, isSuperAdminClient, t]);

  useEffect(() => {
    void loadBenchmarks();
  }, [loadBenchmarks]);

  const loadMoreBenchmarkRuns = useCallback(async () => {
    if (!historyCursor || isLoadingMoreRuns) {
      return;
    }

    setIsLoadingMoreRuns(true);
    try {
      const history = await fetchBenchmarkRuns(historyCursor);
      setRuns((previousRuns) => mergeBenchmarkRuns(previousRuns, history.runs));
      setHistoryCursor(history.nextCursor ?? null);
      setHasMoreRuns(history.hasMore);
      setHistoryTotalCount(history.totalCount);
    } catch (error) {
      console.error("[AI Benchmarks] Load more error:", error);
      toaster.error({
        title: t("agentBenchmarks.errors.load", {
          defaultValue: "Could not load benchmarks",
        }),
      });
    } finally {
      setIsLoadingMoreRuns(false);
    }
  }, [fetchBenchmarkRuns, historyCursor, isLoadingMoreRuns, t]);

  const pollRun = useCallback(
    async (benchmarkRunId: string) => {
      setIsPolling(true);
      try {
        const response = await fetch(
          `/api/ai-benchmarks/status?benchmarkRunId=${benchmarkRunId}`,
        );
        if (!response.ok) {
          throw new Error("Failed to refresh benchmark status");
        }

        const data = (await response.json()) as { run: AiBenchmarkRun };
        setRuns((previousRuns) => mergeBenchmarkRuns(previousRuns, [data.run]));

        if (STOPPED_STATUSES.has(data.run.status)) {
          setActiveBenchmarkRunId(null);
          setActiveAgentRun(null);
        }
      } catch (error) {
        console.error("[AI Benchmarks] Poll error:", error);
        toaster.error({
          title: t("agentBenchmarks.errors.status", {
            defaultValue: "Could not refresh benchmark status",
          }),
        });
        setActiveBenchmarkRunId(null);
        setActiveAgentRun(null);
      } finally {
        setIsPolling(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (!activeBenchmarkRunId) {
      return;
    }

    void pollRun(activeBenchmarkRunId);
    const interval = window.setInterval(() => {
      void pollRun(activeBenchmarkRunId);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [activeBenchmarkRunId, pollRun]);

  useEffect(() => {
    if (!activeBenchmarkRunId) {
      setActiveAgentRun(null);
    }
  }, [activeBenchmarkRunId]);

  useEffect(() => {
    if (
      !activeRun?.agentRunId ||
      isWhatsNewBenchmarkTaskType(activeRun.agentTaskType)
    ) {
      setActiveAgentRun(null);
      return;
    }

    const agentDocRef = db.doc<{
      messages?: AgentMessage[];
      status?: AgentStatus;
    }>(firestore, "/agents", activeRun.agentRunId);

    const unsubscribe = onSnapshot(
      agentDocRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          return;
        }

        const data = snapshot.data();
        setActiveAgentRun({
          messages: Array.isArray(data.messages) ? data.messages : undefined,
          runId: activeRun.agentRunId ?? snapshot.id,
          status: data.status ?? "processing",
        });
      },
      (error) => {
        console.error("[AI Benchmarks] Agent subscription error:", error);
      },
    );

    return unsubscribe;
  }, [activeRun?.agentRunId, activeRun?.agentTaskType]);

  useEffect(() => {
    setInteractionResponse("");
  }, [activeAgentRun?.runId, pendingHook?.toolCallId]);

  const startBenchmark = useCallback(async () => {
    if (!channelId || (requiresPrompt && !prompt.trim())) {
      return;
    }

    if (
      (selectedTargetType === "quote" && !targetQuoteId) ||
      (selectedTargetType === "order" && !targetOrderId) ||
      (selectedTargetType === "product" && !targetProductId)
    ) {
      toaster.error({
        title: t("agentBenchmarks.errors.targetRequired", {
          defaultValue: "Select a target first",
        }),
      });
      return;
    }

    setIsStarting(true);
    try {
      const response = await fetch("/api/ai-benchmarks/start", {
        body: JSON.stringify({
          agentTaskType,
          channelId,
          prompt: requiresPrompt ? prompt.trim() : undefined,
          targetOrderId:
            selectedTargetType === "order" ? targetOrderId : undefined,
          targetProductId:
            selectedTargetType === "product" ? targetProductId : undefined,
          targetQuoteId:
            selectedTargetType === "quote" ? targetQuoteId : undefined,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        throw new Error(error.error ?? "Failed to start benchmark");
      }

      const data = (await response.json()) as { benchmarkRunId: string };
      setActiveBenchmarkRunId(data.benchmarkRunId);
      setPrompt("");
      toaster.success({
        title: t("agentBenchmarks.started", {
          defaultValue: "Benchmark started",
        }),
      });
      await loadBenchmarks();
    } catch (error) {
      console.error("[AI Benchmarks] Start error:", error);
      toaster.error({
        title: t("agentBenchmarks.errors.start", {
          defaultValue: "Could not start benchmark",
        }),
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsStarting(false);
    }
  }, [
    agentTaskType,
    channelId,
    loadBenchmarks,
    prompt,
    requiresPrompt,
    selectedTargetType,
    targetOrderId,
    targetProductId,
    targetQuoteId,
    t,
  ]);

  const approveActiveRun = useCallback(
    async (approved: boolean) => {
      if (!activeAgentRun || !activeBenchmarkRunId) {
        return;
      }

      const idToken = await getIdToken();
      if (!idToken) {
        toaster.error({
          title: t("agentBenchmarks.errors.resume", {
            defaultValue: "Could not continue benchmark run",
          }),
        });
        return;
      }

      setIsResponding(true);
      try {
        const response = await fetch("/api/agents/approve", {
          body: JSON.stringify({
            approved,
            comment: interactionResponse.trim() || undefined,
            runId: activeAgentRun.runId,
          }),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          method: "POST",
        });

        if (!response.ok) {
          const error = (await response.json()) as { error?: string };
          throw new Error(error.error ?? "Failed to resume benchmark run");
        }

        setInteractionResponse("");
        await pollRun(activeBenchmarkRunId);
      } catch (error) {
        console.error("[AI Benchmarks] Approval error:", error);
        toaster.error({
          title: t("agentBenchmarks.errors.resume", {
            defaultValue: "Could not continue benchmark run",
          }),
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        setIsResponding(false);
      }
    },
    [
      activeAgentRun,
      activeBenchmarkRunId,
      getIdToken,
      interactionResponse,
      pollRun,
      t,
    ],
  );

  const respondToActiveRun = useCallback(
    async (overrideText?: string, confirmed = true) => {
      if (!activeAgentRun || !activeBenchmarkRunId) {
        return;
      }

      const responseText = (overrideText ?? interactionResponse).trim();
      if (!responseText) {
        return;
      }

      const idToken = await getIdToken();
      if (!idToken) {
        toaster.error({
          title: t("agentBenchmarks.errors.resume", {
            defaultValue: "Could not continue benchmark run",
          }),
        });
        return;
      }

      setIsResponding(true);
      try {
        const response = await fetch("/api/agents/respond", {
          body: JSON.stringify({
            confirmed,
            response: responseText,
            runId: activeAgentRun.runId,
            toolCallId: pendingHook?.toolCallId,
          }),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          method: "POST",
        });

        if (!response.ok) {
          const error = (await response.json()) as { error?: string };
          throw new Error(error.error ?? "Failed to send benchmark response");
        }

        setInteractionResponse("");
        await pollRun(activeBenchmarkRunId);
      } catch (error) {
        console.error("[AI Benchmarks] Respond error:", error);
        toaster.error({
          title: t("agentBenchmarks.errors.resume", {
            defaultValue: "Could not continue benchmark run",
          }),
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        setIsResponding(false);
      }
    },
    [
      activeAgentRun,
      activeBenchmarkRunId,
      getIdToken,
      interactionResponse,
      pendingHook?.toolCallId,
      pollRun,
      t,
    ],
  );

  const rerunBenchmark = useCallback(
    async (run: AiBenchmarkRun) => {
      if (!channelId) {
        return;
      }

      setIsStarting(true);
      try {
        const response = await fetch("/api/ai-benchmarks/start", {
          body: JSON.stringify({
            agentTaskType: run.agentTaskType,
            channelId,
            prompt: isWhatsNewBenchmarkTaskType(run.agentTaskType)
              ? undefined
              : run.prompt,
            targetOrderId: run.targetOrder?.id,
            targetProductId: run.targetProduct?.id,
            targetQuoteId: run.targetQuote?.id,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });

        if (!response.ok) {
          const error = (await response.json()) as { error?: string };
          throw new Error(error.error ?? "Failed to start benchmark");
        }

        const data = (await response.json()) as { benchmarkRunId: string };
        setActiveBenchmarkRunId(data.benchmarkRunId);
        toaster.success({
          title: t("agentBenchmarks.started", {
            defaultValue: "Benchmark started",
          }),
        });
        await loadBenchmarks();
      } catch (error) {
        console.error("[AI Benchmarks] Rerun error:", error);
        toaster.error({
          title: t("agentBenchmarks.errors.start", {
            defaultValue: "Could not start benchmark",
          }),
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        setIsStarting(false);
      }
    },
    [channelId, loadBenchmarks, t],
  );

  const deleteRun = useCallback(
    async (runId: string) => {
      setRuns((previous) => previous.filter((run) => run.id !== runId));
      setHistoryTotalCount((previous) => Math.max(0, previous - 1));
      if (activeBenchmarkRunId === runId) {
        setActiveBenchmarkRunId(null);
        setActiveAgentRun(null);
      }
    },
    [activeBenchmarkRunId],
  );

  const stats = useMemo(() => {
    const completed = runs.filter((run) => run.status === "completed");
    const scores = completed
      .map((run) => getRunScore(run))
      .filter(isNumberScore);
    const averageScore = scores.length
      ? Math.round(
          scores.reduce((sum, score) => sum + score, 0) / scores.length,
        )
      : undefined;

    return {
      averageScore,
      completedCount: completed.length,
      totalCount: historyTotalCount,
    };
  }, [historyTotalCount, runs]);

  if (!isSuperAdminClient) {
    return (
      <EmptyState.Root>
        <EmptyState.Content>
          <EmptyState.Indicator>
            <MaterialSymbol fontSize={48}>admin_panel_settings</MaterialSymbol>
          </EmptyState.Indicator>
          <EmptyState.Title>
            {t("agentBenchmarks.superAdminOnly", {
              defaultValue: "Super Admin only",
            })}
          </EmptyState.Title>
          <EmptyState.Description>
            {t("agentBenchmarks.superAdminOnlyDescription", {
              defaultValue:
                "AI benchmark runs use live data and are only available to Super Admin users.",
            })}
          </EmptyState.Description>
        </EmptyState.Content>
      </EmptyState.Root>
    );
  }

  return (
    <VStack align="stretch" gap={6}>
      <CustomHeading
        breadcrumb
        goBack
        heading={t("agentBenchmarks.pageTitle", {
          defaultValue: "AI Benchmarks",
        })}
        t={t}
      />

      <Text color="fg.muted" maxW="4xl">
        {t("agentBenchmarks.pageDescription", {
          defaultValue:
            "Run available AI benchmarks against live admin data, preserve every run, and score generated output.",
        })}
      </Text>

      <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
        <Stat.Root>
          <Stat.Label>
            {t("agentBenchmarks.stats.total", { defaultValue: "Runs" })}
          </Stat.Label>
          <Stat.ValueText>{stats.totalCount}</Stat.ValueText>
        </Stat.Root>
        <Stat.Root>
          <Stat.Label>
            {t("agentBenchmarks.stats.completed", {
              defaultValue: "Completed",
            })}
          </Stat.Label>
          <Stat.ValueText>{stats.completedCount}</Stat.ValueText>
        </Stat.Root>
        <Stat.Root>
          <Stat.Label>
            {t("agentBenchmarks.stats.averageScore", {
              defaultValue: "Average score",
            })}
          </Stat.Label>
          <Stat.ValueText>
            {stats.averageScore === undefined ? "-" : `${stats.averageScore}%`}
          </Stat.ValueText>
        </Stat.Root>
      </SimpleGrid>

      <Card.Root>
        <Card.Header>
          <HStack justify="space-between" align="flex-start" gap={4}>
            <Box>
              <Card.Title>
                {t("agentBenchmarks.start.title", {
                  defaultValue: "Run benchmark",
                })}
              </Card.Title>
              <Card.Description>
                {t("agentBenchmarks.start.description", {
                  defaultValue:
                    "Quote, order, and product benchmarks compare generated data to a selected target and score the run with deterministic checks plus an AI judge. Autonomous cron benchmarks use their production instructions.",
                })}
              </Card.Description>
            </Box>
            <Button
              onClick={loadBenchmarks}
              loading={isLoading}
              variant="outline"
              size="sm"
            >
              <MaterialSymbol>refresh</MaterialSymbol>
              {t("agents.refresh", { defaultValue: "Refresh" })}
            </Button>
          </HStack>
        </Card.Header>
        <Card.Body>
          <Grid templateColumns={{ base: "1fr", lg: "280px 1fr" }} gap={4}>
            <VStack align="stretch" gap={4}>
              <Field.Root>
                <Field.Label>
                  {t("agentBenchmarks.start.agent", {
                    defaultValue: "Benchmark",
                  })}
                </Field.Label>
                <Select.Root
                  collection={agentCollection}
                  value={[agentTaskType]}
                  onValueChange={({ value }) => {
                    const nextValue = value[0];
                    if (!nextValue) {
                      return;
                    }

                    setAgentTaskType(nextValue as AiBenchmarkTaskType);
                  }}
                  positioning={{ sameWidth: true }}
                >
                  <Select.HiddenSelect name="benchmark-agent-task-type" />
                  <Select.Control>
                    <Select.Trigger borderRadius="3xl">
                      <Select.ValueText
                        placeholder={t("agentBenchmarks.start.agent", {
                          defaultValue: "Benchmark",
                        })}
                      />
                    </Select.Trigger>
                    <Select.IndicatorGroup>
                      <Select.Indicator />
                    </Select.IndicatorGroup>
                  </Select.Control>
                  <Portal>
                    <Select.Positioner>
                      <Select.Content>
                        {agentCollection.items.map((item) => (
                          <Select.Item key={item.value} item={item}>
                            {item.label}
                            <Select.ItemIndicator />
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Positioner>
                  </Portal>
                </Select.Root>
                <Field.HelperText>
                  {selectedAgent
                    ? t(
                        `agentBenchmarks.options.${selectedAgent.taskType}.description`,
                        { defaultValue: selectedAgent.description },
                      )
                    : undefined}
                </Field.HelperText>
              </Field.Root>

              {selectedTargetType === "quote" && (
                <Field.Root required>
                  <Field.Label>
                    {t("agentBenchmarks.start.quote", {
                      defaultValue: "Target quote",
                    })}
                  </Field.Label>
                  <Select.Root
                    collection={quoteCollection}
                    value={targetQuoteId ? [targetQuoteId] : []}
                    onValueChange={({ value }) => {
                      const nextValue = value[0];
                      if (!nextValue) {
                        return;
                      }

                      setTargetQuoteId(nextValue);
                    }}
                    positioning={{ sameWidth: true }}
                    disabled={quoteCollection.items.length === 0}
                  >
                    <Select.HiddenSelect name="benchmark-target-quote" />
                    <Select.Control>
                      <Select.Trigger borderRadius="3xl">
                        <Select.ValueText
                          placeholder={t("agentBenchmarks.start.quote", {
                            defaultValue: "Target quote",
                          })}
                        />
                      </Select.Trigger>
                      <Select.IndicatorGroup>
                        <Select.Indicator />
                      </Select.IndicatorGroup>
                    </Select.Control>
                    <Portal>
                      <Select.Positioner>
                        <Select.Content>
                          {quoteCollection.items.map((item) => (
                            <Select.Item key={item.value} item={item}>
                              {item.label}
                              <Select.ItemIndicator />
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select.Positioner>
                    </Portal>
                  </Select.Root>
                  <Field.HelperText>
                    {selectedQuote
                      ? t("agentBenchmarks.start.quoteHelp", {
                          count: selectedQuote.itemsCount,
                          defaultValue:
                            "{{count}} items will be used as the expected output.",
                        })
                      : t("agentBenchmarks.start.noQuotes", {
                          defaultValue: "No quotes available for this channel.",
                        })}
                  </Field.HelperText>
                </Field.Root>
              )}

              {selectedTargetType === "order" && (
                <Field.Root required>
                  <Field.Label>
                    {t("agentBenchmarks.start.order", {
                      defaultValue: "Target order",
                    })}
                  </Field.Label>
                  <Select.Root
                    collection={orderCollection}
                    value={targetOrderId ? [targetOrderId] : []}
                    onValueChange={({ value }) => {
                      const nextValue = value[0];
                      if (!nextValue) {
                        return;
                      }

                      setTargetOrderId(nextValue);
                    }}
                    positioning={{ sameWidth: true }}
                    disabled={orderCollection.items.length === 0}
                  >
                    <Select.HiddenSelect name="benchmark-target-order" />
                    <Select.Control>
                      <Select.Trigger borderRadius="3xl">
                        <Select.ValueText
                          placeholder={t("agentBenchmarks.start.order", {
                            defaultValue: "Target order",
                          })}
                        />
                      </Select.Trigger>
                      <Select.IndicatorGroup>
                        <Select.Indicator />
                      </Select.IndicatorGroup>
                    </Select.Control>
                    <Portal>
                      <Select.Positioner>
                        <Select.Content>
                          {orderCollection.items.map((item) => (
                            <Select.Item key={item.value} item={item}>
                              {item.label}
                              <Select.ItemIndicator />
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select.Positioner>
                    </Portal>
                  </Select.Root>
                  <Field.HelperText>
                    {selectedOrder
                      ? t("agentBenchmarks.start.orderHelp", {
                          count: selectedOrder.itemsCount,
                          defaultValue:
                            "{{count}} items will be used as the expected output.",
                        })
                      : t("agentBenchmarks.start.noOrders", {
                          defaultValue: "No orders available for this channel.",
                        })}
                  </Field.HelperText>
                </Field.Root>
              )}

              {selectedTargetType === "product" && (
                <Field.Root required>
                  <Field.Label>
                    {t("agentBenchmarks.start.product", {
                      defaultValue: "Target product",
                    })}
                  </Field.Label>
                  <Select.Root
                    collection={productCollection}
                    value={targetProductId ? [targetProductId] : []}
                    onValueChange={({ value }) => {
                      const nextValue = value[0];
                      if (!nextValue) {
                        return;
                      }

                      setTargetProductId(nextValue);
                    }}
                    positioning={{ sameWidth: true }}
                    disabled={productCollection.items.length === 0}
                  >
                    <Select.HiddenSelect name="benchmark-target-product" />
                    <Select.Control>
                      <Select.Trigger borderRadius="3xl">
                        <Select.ValueText
                          placeholder={t("agentBenchmarks.start.product", {
                            defaultValue: "Target product",
                          })}
                        />
                      </Select.Trigger>
                      <Select.IndicatorGroup>
                        <Select.Indicator />
                      </Select.IndicatorGroup>
                    </Select.Control>
                    <Portal>
                      <Select.Positioner>
                        <Select.Content>
                          {productCollection.items.map((item) => (
                            <Select.Item key={item.value} item={item}>
                              {item.label}
                              <Select.ItemIndicator />
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select.Positioner>
                    </Portal>
                  </Select.Root>
                  <Field.HelperText>
                    {selectedProduct
                      ? t("agentBenchmarks.start.productHelp", {
                          count: selectedProduct.attributeCount,
                          defaultValue:
                            "{{count}} attributes will be used as the expected output.",
                        })
                      : t("agentBenchmarks.start.noProducts", {
                          defaultValue:
                            "No products available for this channel.",
                        })}
                  </Field.HelperText>
                </Field.Root>
              )}
            </VStack>

            {requiresPrompt ? (
              <Field.Root required>
                <Field.Label>
                  {t("agentBenchmarks.start.prompt", {
                    defaultValue: "Benchmark prompt",
                  })}
                </Field.Label>
                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.currentTarget.value)}
                  rows={8}
                  placeholder={t("agentBenchmarks.start.promptPlaceholder", {
                    defaultValue:
                      "Describe what the agent should produce as if it should recreate the selected target.",
                  })}
                />
                <Field.HelperText>
                  {t("agentBenchmarks.start.promptHelp", {
                    defaultValue:
                      "The prompt is preserved with the benchmark run for later comparisons.",
                  })}
                </Field.HelperText>
              </Field.Root>
            ) : (
              <Box bg="bg.subtle" borderRadius="xl" p={4}>
                <Text fontSize="sm" fontWeight="medium">
                  {t("agentBenchmarks.start.autonomousTitle", {
                    defaultValue: "Autonomous benchmark",
                  })}
                </Text>
                <Text color="fg.muted" fontSize="sm" mt={1}>
                  {t("agentBenchmarks.start.autonomousDescription", {
                    defaultValue:
                      "This cron job uses its production instructions. The run is scored by an AI judge after the workflow finishes.",
                  })}
                </Text>
              </Box>
            )}
          </Grid>
        </Card.Body>
        <Card.Footer justifyContent="flex-end">
          <Button
            colorPalette="primary"
            disabled={
              !channelId ||
              (requiresPrompt && !prompt.trim()) ||
              (selectedTargetType === "quote" && !targetQuoteId) ||
              (selectedTargetType === "order" && !targetOrderId) ||
              (selectedTargetType === "product" && !targetProductId)
            }
            loading={isStarting}
            onClick={startBenchmark}
          >
            <MaterialSymbol>play_arrow</MaterialSymbol>
            {t("agentBenchmarks.start.button", {
              defaultValue: "Start benchmark",
            })}
          </Button>
        </Card.Footer>
      </Card.Root>

      {activeRun && (
        <Card.Root borderColor="primary.solid" borderWidth="1px">
          <Card.Body>
            <VStack align="stretch" gap={4}>
              <HStack gap={3}>
                <Box flex="1">
                  <Text fontWeight="semibold">
                    {t("agentBenchmarks.active.title", {
                      defaultValue: "Active benchmark",
                    })}
                  </Text>
                  <Text color="fg.muted" fontSize="sm">
                    {activeRun.agentRunId}
                  </Text>
                </Box>
                <Badge colorPalette={getStatusColor(activeRun.status)}>
                  {t(`agentBenchmarks.status.${activeRun.status}`, {
                    defaultValue: activeRun.status,
                  })}
                </Badge>
              </HStack>

              {pendingInteraction &&
                activeAgentRun?.status === "awaiting-approval" && (
                  <Box>
                    <AgentInteractionPanel
                      interaction={pendingInteraction}
                      labels={{
                        prefilledData: t("agents.interaction.prefilledData", {
                          defaultValue: "Prefilled data",
                        }),
                        selected: t("agents.interaction.selected", {
                          defaultValue: "Selected",
                        }),
                        titleFallback: t("agents.interaction.pendingQuestion", {
                          defaultValue: "Agent question",
                        }),
                        valueLabel: t("agents.interaction.valueLabel", {
                          defaultValue: "ID",
                        }),
                      }}
                      onSelectValue={setInteractionResponse}
                      selectedValue={interactionResponse}
                    />

                    {canApproveActiveRun && (
                      <VStack align="stretch" gap={3}>
                        <Field.Root>
                          <Field.Label>
                            {t("agentBenchmarks.actions.comment", {
                              defaultValue: "Comment",
                            })}
                          </Field.Label>
                          <Textarea
                            value={interactionResponse}
                            onChange={(event) =>
                              setInteractionResponse(event.currentTarget.value)
                            }
                            rows={3}
                            borderRadius="3xl"
                            placeholder={t(
                              "agentBenchmarks.actions.commentPlaceholder",
                              {
                                defaultValue:
                                  "Add an optional approval note or rejection reason.",
                              },
                            )}
                          />
                        </Field.Root>
                        <HStack justify="flex-end" gap={2}>
                          <Button
                            variant="outline"
                            onClick={() => void approveActiveRun(false)}
                            loading={isResponding}
                          >
                            <MaterialSymbol>close</MaterialSymbol>
                            {t("agents.reject", { defaultValue: "Reject" })}
                          </Button>
                          <Button
                            colorPalette="primary"
                            onClick={() => void approveActiveRun(true)}
                            loading={isResponding}
                          >
                            <MaterialSymbol>check</MaterialSymbol>
                            {t("agents.approve", { defaultValue: "Approve" })}
                          </Button>
                        </HStack>
                      </VStack>
                    )}

                    {canRespondToActiveRun && (
                      <VStack align="stretch" gap={3}>
                        <Field.Root>
                          <Field.Label>
                            {t("agents.responsePrompt", {
                              defaultValue: "Respond to the agent:",
                            })}
                          </Field.Label>
                          <Textarea
                            value={interactionResponse}
                            onChange={(event) =>
                              setInteractionResponse(event.currentTarget.value)
                            }
                            rows={3}
                            borderRadius="3xl"
                            placeholder={t(
                              "agentBenchmarks.actions.responsePlaceholder",
                              {
                                defaultValue:
                                  "Type the response that should be sent back to the agent.",
                              },
                            )}
                          />
                        </Field.Root>
                        <HStack gap={2} flexWrap="wrap">
                          <Button
                            size="xs"
                            variant="outline"
                            borderRadius="full"
                            loading={isResponding}
                            onClick={() =>
                              void respondToActiveRun(
                                t("agents.quickYes", { defaultValue: "Yes" }),
                                true,
                              )
                            }
                          >
                            <MaterialSymbol>check</MaterialSymbol>
                            {t("agents.quickYes", { defaultValue: "Yes" })}
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            borderRadius="full"
                            loading={isResponding}
                            onClick={() =>
                              void respondToActiveRun(
                                t("agents.quickNo", { defaultValue: "No" }),
                                false,
                              )
                            }
                          >
                            <MaterialSymbol>close</MaterialSymbol>
                            {t("agents.quickNo", { defaultValue: "No" })}
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            borderRadius="full"
                            loading={isResponding}
                            onClick={() =>
                              void respondToActiveRun(
                                t("agents.quickContinue", {
                                  defaultValue: "Continue",
                                }),
                                true,
                              )
                            }
                          >
                            <MaterialSymbol>arrow_forward</MaterialSymbol>
                            {t("agents.quickContinue", {
                              defaultValue: "Continue",
                            })}
                          </Button>
                        </HStack>
                        <HStack justify="flex-end">
                          <Button
                            colorPalette="primary"
                            onClick={() => void respondToActiveRun()}
                            loading={isResponding}
                            disabled={!interactionResponse.trim()}
                          >
                            <MaterialSymbol>send</MaterialSymbol>
                            {t("agents.sendResponse", {
                              defaultValue: "Send",
                            })}
                          </Button>
                        </HStack>
                      </VStack>
                    )}
                  </Box>
                )}
            </VStack>
          </Card.Body>
        </Card.Root>
      )}

      <VStack align="stretch" gap={3}>
        <HStack justify="space-between">
          <HStack gap={3} flexWrap="wrap">
            <Text fontSize="lg" fontWeight="semibold">
              {t("agentBenchmarks.history.title", {
                defaultValue: "Run history",
              })}
            </Text>
            {historyTotalCount > runs.length && (
              <Text color="fg.muted" fontSize="sm">
                {t("agentBenchmarks.history.loadedCount", {
                  defaultValue: "{{loaded}} of {{total}} loaded",
                  loaded: runs.length,
                  total: historyTotalCount,
                })}
              </Text>
            )}
          </HStack>
          {isLoading && <Spinner size="sm" />}
        </HStack>
        {runs.length === 0 ? (
          <EmptyState.Root>
            <EmptyState.Content>
              <EmptyState.Indicator>
                <MaterialSymbol fontSize={48}>science</MaterialSymbol>
              </EmptyState.Indicator>
              <EmptyState.Title>
                {t("agentBenchmarks.empty.title", {
                  defaultValue: "No benchmark runs",
                })}
              </EmptyState.Title>
              <EmptyState.Description>
                {t("agentBenchmarks.empty.description", {
                  defaultValue:
                    "Start a benchmark to preserve its prompt, timing, output comparison, and scores.",
                })}
              </EmptyState.Description>
            </EmptyState.Content>
          </EmptyState.Root>
        ) : (
          <>
            {runs.map((run) => (
              <BenchmarkRunCard
                key={run.id}
                run={run}
                onDelete={() => void deleteRun(run.id)}
                onRefresh={() => setActiveBenchmarkRunId(run.id)}
                onRerun={() => void rerunBenchmark(run)}
              />
            ))}
            {hasMoreRuns && (
              <HStack justify="center" pt={2}>
                <Button
                  variant="outline"
                  onClick={() => void loadMoreBenchmarkRuns()}
                  loading={isLoadingMoreRuns}
                >
                  <MaterialSymbol>expand_more</MaterialSymbol>
                  {isLoadingMoreRuns
                    ? t("agentBenchmarks.history.loadingMore", {
                        defaultValue: "Loading runs…",
                      })
                    : t("agentBenchmarks.history.loadMore", {
                        defaultValue: "Load more runs",
                      })}
                </Button>
              </HStack>
            )}
          </>
        )}
      </VStack>
    </VStack>
  );
}

function BenchmarkRunCard({
  run,
  onDelete,
  onRefresh,
  onRerun,
}: {
  run: AiBenchmarkRun;
  onDelete: () => void;
  onRefresh: () => void;
  onRerun: () => void;
}) {
  const { t, i18n } = useT(["agentBenchmarks", "translation"]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const deterministicScore = run.deterministicComparison?.percentage;
  const judgeScore = run.judge?.score;
  const isActive =
    run.status === "running" ||
    run.status === "starting" ||
    run.status === "awaiting-user-input";

  const [isCopied, setIsCopied] = useState(false);
  const language = i18n.resolvedLanguage ?? i18n.language;

  const handleCopyMarkdown = useCallback(async () => {
    const lines: string[] = [];

    const agentLabel = t(`agents.taskType.${run.agentTaskType}`, {
      defaultValue: run.agentTaskType,
    });
    const statusLabel = t(`agentBenchmarks.status.${run.status}`, {
      defaultValue: run.status,
    });

    lines.push(
      `## ${t("agentBenchmarks.markdown.benchmark", {
        agent: agentLabel,
        defaultValue: "Benchmark: {{agent}}",
      })}`,
    );
    if (run.targetQuote) {
      lines.push(
        t("agentBenchmarks.markdown.targetQuote", {
          customer: run.targetQuote.customerName,
          defaultValue: "**Target quote:** #{{number}} - {{customer}}",
          number: run.targetQuote.number,
        }),
      );
    }
    if (run.targetOrder) {
      lines.push(
        t("agentBenchmarks.markdown.targetOrder", {
          customer: run.targetOrder.customerName,
          defaultValue: "**Target order:** #{{number}} - {{customer}}",
          number: run.targetOrder.number,
        }),
      );
    }
    if (run.targetProduct) {
      lines.push(
        t("agentBenchmarks.markdown.targetProduct", {
          defaultValue: "**Target product:** {{product}}",
          product: run.targetProduct.name,
        }),
      );
    }
    lines.push(
      t("agentBenchmarks.markdown.prompt", {
        defaultValue: "**Prompt:** {{prompt}}",
        prompt: run.prompt,
      }),
    );
    lines.push(
      t("agentBenchmarks.markdown.status", {
        defaultValue: "**Status:** {{status}}",
        status: statusLabel,
      }),
    );
    if (run.metrics.agentActiveDurationMs !== undefined) {
      lines.push(
        t("agentBenchmarks.markdown.agentTime", {
          defaultValue: "**Agent time:** {{duration}}",
          duration: formatDuration(run.metrics.agentActiveDurationMs),
        }),
      );
    }
    if (run.metrics.stepsCount !== undefined) {
      lines.push(
        t("agentBenchmarks.markdown.steps", {
          count: run.metrics.stepsCount,
          defaultValue: "**Steps:** {{count}}",
        }),
      );
    }

    if (run.whatsNew) {
      lines.push(
        `\n### ${t("agentBenchmarks.markdown.whatsNewOutput", {
          defaultValue: "What's New output",
        })}\n`,
      );
      lines.push(
        t("agentBenchmarks.markdown.period", {
          defaultValue: "**Period:** {{period}}",
          period: run.whatsNew.periodKey,
        }),
      );
      if (run.whatsNew.skipped) {
        lines.push(
          t("agentBenchmarks.markdown.skipped", {
            defaultValue: "**Skipped:** {{reason}}",
            reason: run.whatsNew.reason ?? "-",
          }),
        );
      }
      const whatsNewTitle = getLocalizedRecordValue(
        run.whatsNew.title,
        language,
      );
      if (whatsNewTitle) {
        lines.push(
          t("agentBenchmarks.markdown.title", {
            defaultValue: "**Title:** {{title}}",
            title: whatsNewTitle,
          }),
        );
      }
      const whatsNewDescription = getLocalizedRecordValue(
        run.whatsNew.description,
        language,
      );
      if (whatsNewDescription) {
        lines.push(
          t("agentBenchmarks.markdown.description", {
            defaultValue: "**Description:** {{description}}",
            description: whatsNewDescription,
          }),
        );
      }
      if (run.whatsNew.highlightFeatures?.length) {
        lines.push(
          `\n${t("agentBenchmarks.markdown.highlights", {
            defaultValue: "**Highlights:**",
          })}`,
        );
        for (const highlight of run.whatsNew.highlightFeatures) {
          lines.push(
            `- ${getLocalizedRecordValue(highlight, language) ?? "-"}`,
          );
        }
      }
    }

    if (run.liveRun) {
      lines.push(
        `\n### ${t("agentBenchmarks.markdown.liveRunOutput", {
          defaultValue: "Live-run output",
        })}\n`,
      );
      for (const field of run.liveRun.fields) {
        const fieldLabel = t(`agentBenchmarks.liveRun.fields.${field.field}`, {
          defaultValue: field.label,
        });
        lines.push(`**${fieldLabel}:** ${field.value}`);
      }
    }

    if (run.deterministicComparison) {
      const { diffs, percentage } = run.deterministicComparison;
      lines.push(
        `\n### ${t("agentBenchmarks.markdown.deterministicComparison", {
          defaultValue: "Deterministic comparison - {{score}}%",
          score: percentage,
        })}\n`,
      );
      lines.push(
        `| ${t("agentBenchmarks.comparison.field", {
          defaultValue: "Field",
        })} | ${t("agentBenchmarks.comparison.expected", {
          defaultValue: "Expected",
        })} | ${t("agentBenchmarks.comparison.actual", {
          defaultValue: "Actual",
        })} | ${t("agentBenchmarks.comparison.score", {
          defaultValue: "Score",
        })} |`,
      );
      lines.push(`|-------|----------|--------|-------|`);
      for (const diff of diffs) {
        const fieldLabel = t(
          `agentBenchmarks.comparison.fields.${diff.field}`,
          { defaultValue: diff.label },
        );
        const pct = Math.round((diff.score / diff.weight) * 100);
        lines.push(
          `| ${fieldLabel} | ${diff.expected} | ${diff.actual} | ${pct}% |`,
        );
      }
    }

    if (run.judge) {
      lines.push(
        `\n### ${t("agentBenchmarks.markdown.aiJudge", {
          defaultValue: "AI judge - {{score}}%",
          score: run.judge.score,
        })}\n`,
      );
      lines.push(run.judge.rationale);
      if (run.judge.strengths.length > 0) {
        lines.push(
          `\n${t("agentBenchmarks.markdown.strengths", {
            defaultValue: "**Strengths:**",
          })}`,
        );
        for (const s of run.judge.strengths) lines.push(`- ${s}`);
      }
      if (run.judge.problems.length > 0) {
        lines.push(
          `\n${t("agentBenchmarks.markdown.problems", {
            defaultValue: "**Problems:**",
          })}`,
        );
        for (const p of run.judge.problems) lines.push(`- ${p}`);
      }
    }

    if (run.error) {
      lines.push(
        `\n${t("agentBenchmarks.markdown.error", {
          defaultValue: "**Error:** {{error}}",
          error: run.error,
        })}`,
      );
    }

    const result = await copyTextToClipboard(lines.join("\n"));
    if (result.status !== "copied") {
      toaster.error({
        title: t("agentBenchmarks.copy.errorTitle", {
          defaultValue: "Could not copy report",
        }),
      });
      return;
    }

    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [language, run, t]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/ai-benchmarks/${run.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        throw new Error(error.error ?? "Failed to delete");
      }
      onDelete();
    } catch (error) {
      console.error("[AI Benchmarks] Delete error:", error);
      toaster.error({
        title: t("agentBenchmarks.errors.delete", {
          defaultValue: "Could not delete benchmark run",
        }),
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsDeleting(false);
    }
  }, [run.id, onDelete, t]);

  return (
    <Card.Root>
      <Card.Header>
        <HStack align="flex-start" justify="space-between" gap={4}>
          <Box>
            <HStack gap={2} mb={1} flexWrap="wrap">
              <Badge colorPalette={getStatusColor(run.status)}>
                {t(`agentBenchmarks.status.${run.status}`, {
                  defaultValue: run.status,
                })}
              </Badge>
              <Badge variant="surface">
                {t(`agents.taskType.${run.agentTaskType}`, {
                  defaultValue: run.agentTaskType,
                })}
              </Badge>
              {run.targetQuote && (
                <Badge variant="outline">
                  {t("agentBenchmarks.history.quoteBadge", {
                    defaultValue: "Quote #{{number}}",
                    number: run.targetQuote.number,
                  })}
                </Badge>
              )}
              {run.targetOrder && (
                <Badge variant="outline">
                  {t("agentBenchmarks.history.orderBadge", {
                    defaultValue: "Order #{{number}}",
                    number: run.targetOrder.number,
                  })}
                </Badge>
              )}
              {run.targetProduct && (
                <Badge variant="outline">
                  {t("agentBenchmarks.history.productBadge", {
                    defaultValue: "Product",
                  })}
                </Badge>
              )}
            </HStack>
            <Card.Title>
              {run.targetQuote?.customerName ??
                run.targetOrder?.customerName ??
                run.targetProduct?.name ??
                run.prompt}
            </Card.Title>
            <Card.Description>{run.prompt}</Card.Description>
          </Box>
          <HStack gap={2} flexShrink={0}>
            {!isActive && (run.deterministicComparison ?? run.judge) && (
              <Tooltip
                content={t("agentBenchmarks.actions.copyMarkdown", {
                  defaultValue: "Copy as Markdown",
                })}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleCopyMarkdown()}
                  aria-label={t("agentBenchmarks.actions.copyMarkdown", {
                    defaultValue: "Copy as Markdown",
                  })}
                >
                  <MaterialSymbol>
                    {isCopied ? "check" : "content_copy"}
                  </MaterialSymbol>
                </Button>
              </Tooltip>
            )}
            {!isActive && (
              <Button size="sm" variant="outline" onClick={onRerun}>
                <MaterialSymbol>replay</MaterialSymbol>
                {t("agentBenchmarks.actions.rerun", { defaultValue: "Rerun" })}
              </Button>
            )}
            {isActive && (
              <Button size="sm" variant="outline" onClick={onRefresh}>
                <MaterialSymbol>sync</MaterialSymbol>
                {t("agents.refresh", { defaultValue: "Refresh" })}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              colorPalette="red"
              disabled={isActive}
              loading={isDeleting}
              onClick={() => void handleDelete()}
              aria-label={t("common.delete", { defaultValue: "Delete" })}
            >
              <MaterialSymbol>delete</MaterialSymbol>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDetailsOpen(true)}
              aria-label={t("agentBenchmarks.actions.viewDetails", {
                defaultValue: "View details",
              })}
            >
              <MaterialSymbol>fullscreen</MaterialSymbol>
            </Button>
          </HStack>
        </HStack>
      </Card.Header>
      <Card.Body>
        <SimpleGrid columns={{ base: 1, md: 4 }} gap={3}>
          <BenchmarkMetric
            label={t("agentBenchmarks.metrics.duration", {
              defaultValue: "Agent time",
            })}
            value={formatDuration(run.metrics.agentActiveDurationMs)}
          />
          <BenchmarkMetric
            label={t("agentBenchmarks.metrics.steps", {
              defaultValue: "Steps",
            })}
            value={run.metrics.stepsCount?.toString() ?? "-"}
          />
          <BenchmarkMetric
            label={t("agentBenchmarks.metrics.deterministic", {
              defaultValue: "Deterministic score",
            })}
            value={
              deterministicScore === undefined ? "-" : `${deterministicScore}%`
            }
            colorPalette={getScoreColor(deterministicScore)}
          />
          <BenchmarkMetric
            label={t("agentBenchmarks.metrics.judge", {
              defaultValue: "Judge score",
            })}
            value={judgeScore === undefined ? "-" : `${judgeScore}%`}
            colorPalette={getScoreColor(judgeScore)}
          />
        </SimpleGrid>

        {run.status === "running" && (
          <Progress.Root value={null} size="xs" mt={4}>
            <Progress.Track>
              <Progress.Range />
            </Progress.Track>
          </Progress.Root>
        )}

        {(run.error ?? run.judgeError) && (
          <Text mt={3} color="fg.error" fontSize="sm" lineClamp={2}>
            {run.error ?? run.judgeError}
          </Text>
        )}
      </Card.Body>

      {/* Details dialog */}
      <Dialog.Root
        open={detailsOpen}
        onOpenChange={(d) => setDetailsOpen(d.open)}
        size="xl"
        scrollBehavior="inside"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>
                  <HStack gap={2} flexWrap="wrap">
                    <Text>
                      {t(`agents.taskType.${run.agentTaskType}`, {
                        defaultValue: run.agentTaskType,
                      })}
                    </Text>
                    <Badge colorPalette={getStatusColor(run.status)} size="sm">
                      {t(`agentBenchmarks.status.${run.status}`, {
                        defaultValue: run.status,
                      })}
                    </Badge>
                    {run.targetQuote && (
                      <Badge variant="outline" size="sm">
                        {t("agentBenchmarks.history.quoteBadge", {
                          defaultValue: "Quote #{{number}}",
                          number: run.targetQuote.number,
                        })}
                      </Badge>
                    )}
                    {run.targetOrder && (
                      <Badge variant="outline" size="sm">
                        {t("agentBenchmarks.history.orderBadge", {
                          defaultValue: "Order #{{number}}",
                          number: run.targetOrder.number,
                        })}
                      </Badge>
                    )}
                    {run.targetProduct && (
                      <Badge variant="outline" size="sm">
                        {t("agentBenchmarks.history.productBadge", {
                          defaultValue: "Product",
                        })}
                      </Badge>
                    )}
                  </HStack>
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.CloseTrigger />
              <Dialog.Body pb={6}>
                <VStack align="stretch" gap={6}>
                  {/* Prompt */}
                  <Box>
                    <Text
                      fontSize="xs"
                      fontWeight="medium"
                      color="fg.muted"
                      textTransform="uppercase"
                      letterSpacing="wide"
                      mb={2}
                    >
                      {t("agentBenchmarks.start.prompt", {
                        defaultValue: "Benchmark prompt",
                      })}
                    </Text>
                    <Box
                      p={3}
                      bg="bg.subtle"
                      borderRadius="xl"
                      borderWidth="1px"
                      borderColor="border.subtle"
                    >
                      <Text fontSize="sm" whiteSpace="pre-wrap">
                        {run.prompt}
                      </Text>
                    </Box>
                  </Box>

                  {/* Metrics */}
                  <SimpleGrid columns={{ base: 2, md: 4 }} gap={3}>
                    <BenchmarkMetric
                      label={t("agentBenchmarks.metrics.duration", {
                        defaultValue: "Agent time",
                      })}
                      value={formatDuration(run.metrics.agentActiveDurationMs)}
                    />
                    <BenchmarkMetric
                      label={t("agentBenchmarks.metrics.steps", {
                        defaultValue: "Steps",
                      })}
                      value={run.metrics.stepsCount?.toString() ?? "-"}
                    />
                    <BenchmarkMetric
                      label={t("agentBenchmarks.metrics.deterministic", {
                        defaultValue: "Deterministic score",
                      })}
                      value={
                        deterministicScore === undefined
                          ? "-"
                          : `${deterministicScore}%`
                      }
                      colorPalette={getScoreColor(deterministicScore)}
                    />
                    <BenchmarkMetric
                      label={t("agentBenchmarks.metrics.judge", {
                        defaultValue: "Judge score",
                      })}
                      value={judgeScore === undefined ? "-" : `${judgeScore}%`}
                      colorPalette={getScoreColor(judgeScore)}
                    />
                  </SimpleGrid>

                  {run.whatsNew && (
                    <Box>
                      <HStack justify="space-between" mb={3} gap={3}>
                        <Text fontSize="sm" fontWeight="semibold">
                          {t("agentBenchmarks.whatsNew.title", {
                            defaultValue: "What's New output",
                          })}
                        </Text>
                        <Badge variant="surface">
                          {run.whatsNew.periodKey}
                        </Badge>
                      </HStack>
                      <VStack align="stretch" gap={3}>
                        {run.whatsNew.skipped ? (
                          <Box p={3} bg="bg.subtle" borderRadius="xl">
                            <Text fontSize="sm" color="fg.muted">
                              {run.whatsNew.reason ??
                                t("agentBenchmarks.whatsNew.skipped", {
                                  defaultValue:
                                    "The workflow skipped this run.",
                                })}
                            </Text>
                          </Box>
                        ) : (
                          <>
                            <Box p={3} bg="bg.subtle" borderRadius="xl">
                              <Text fontSize="sm" fontWeight="medium">
                                {getLocalizedRecordValue(
                                  run.whatsNew.title,
                                  language,
                                ) ?? "-"}
                              </Text>
                              <Text fontSize="sm" color="fg.muted" mt={1}>
                                {getLocalizedRecordValue(
                                  run.whatsNew.description,
                                  language,
                                ) ?? "-"}
                              </Text>
                            </Box>
                            {run.whatsNew.highlightFeatures?.length ? (
                              <VStack align="stretch" gap={1}>
                                {run.whatsNew.highlightFeatures.map(
                                  (highlight, index) => (
                                    <HStack
                                      key={`${highlight.en ?? highlight.pl}-${index}`}
                                      gap={2}
                                      align="flex-start"
                                    >
                                      <Text color="fg.muted" flexShrink={0}>
                                        {index + 1}.
                                      </Text>
                                      <Text fontSize="sm">
                                        {getLocalizedRecordValue(
                                          highlight,
                                          language,
                                        ) ?? "-"}
                                      </Text>
                                    </HStack>
                                  ),
                                )}
                              </VStack>
                            ) : null}
                            {typeof run.whatsNew.campaignProposalCount ===
                            "number" ? (
                              <Box p={3} bg="bg.subtle" borderRadius="xl">
                                <HStack justify="space-between" gap={3}>
                                  <Text fontSize="sm" fontWeight="medium">
                                    {t(
                                      "agentBenchmarks.whatsNew.campaignProposal",
                                      {
                                        defaultValue: "Campaign proposal",
                                      },
                                    )}
                                  </Text>
                                  <Badge variant="surface">
                                    {t(
                                      "agentBenchmarks.whatsNew.campaignProposalCount",
                                      {
                                        count:
                                          run.whatsNew.campaignProposalCount,
                                        defaultValue: "{{count}} generated",
                                      },
                                    )}
                                  </Badge>
                                </HStack>
                                {run.whatsNew.campaignProposalError ||
                                run.whatsNew.campaignProposalReason ? (
                                  <Text fontSize="sm" color="fg.muted" mt={1}>
                                    {run.whatsNew.campaignProposalError ??
                                      run.whatsNew.campaignProposalReason}
                                  </Text>
                                ) : null}
                              </Box>
                            ) : null}
                          </>
                        )}
                      </VStack>
                    </Box>
                  )}

                  {run.liveRun && (
                    <Box>
                      <Text fontSize="sm" fontWeight="semibold" mb={3}>
                        {t("agentBenchmarks.liveRun.title", {
                          defaultValue: "Live-run output",
                        })}
                      </Text>
                      <SimpleGrid columns={{ base: 1, md: 2 }} gap={2}>
                        {run.liveRun.fields.map((field) => (
                          <Box
                            key={field.field}
                            p={3}
                            bg="bg.subtle"
                            borderRadius="xl"
                            minW={0}
                          >
                            <Text color="fg.muted" fontSize="xs">
                              {t(
                                `agentBenchmarks.liveRun.fields.${field.field}`,
                                { defaultValue: field.label },
                              )}
                            </Text>
                            <Text
                              fontSize="sm"
                              fontWeight="medium"
                              wordBreak="break-word"
                            >
                              {field.value}
                            </Text>
                          </Box>
                        ))}
                      </SimpleGrid>
                    </Box>
                  )}

                  {/* Deterministic comparison */}
                  {run.deterministicComparison && (
                    <Box>
                      <HStack justify="space-between" mb={3}>
                        <Text fontSize="sm" fontWeight="semibold">
                          {t("agentBenchmarks.comparison.title", {
                            defaultValue: "Deterministic comparison",
                          })}
                        </Text>
                        <Badge
                          colorPalette={getScoreColor(deterministicScore)}
                          size="md"
                        >
                          {deterministicScore}%
                        </Badge>
                      </HStack>
                      <Grid
                        templateColumns={{
                          base: "1fr",
                          md: "180px 1fr 1fr 96px",
                        }}
                        gap={2}
                        px={1}
                        pb={2}
                      >
                        <Text
                          color="fg.subtle"
                          fontSize="xs"
                          fontWeight="medium"
                          textTransform="uppercase"
                          letterSpacing="wide"
                        >
                          {t("agentBenchmarks.comparison.field", {
                            defaultValue: "Field",
                          })}
                        </Text>
                        <Text
                          color="fg.subtle"
                          fontSize="xs"
                          fontWeight="medium"
                          textTransform="uppercase"
                          letterSpacing="wide"
                        >
                          {t("agentBenchmarks.comparison.expected", {
                            defaultValue: "Expected",
                          })}
                        </Text>
                        <Text
                          color="fg.subtle"
                          fontSize="xs"
                          fontWeight="medium"
                          textTransform="uppercase"
                          letterSpacing="wide"
                        >
                          {t("agentBenchmarks.comparison.actual", {
                            defaultValue: "Actual",
                          })}
                        </Text>
                        <Text
                          color="fg.subtle"
                          fontSize="xs"
                          fontWeight="medium"
                          textTransform="uppercase"
                          letterSpacing="wide"
                        >
                          {t("agentBenchmarks.comparison.score", {
                            defaultValue: "Score",
                          })}
                        </Text>
                      </Grid>
                      {run.deterministicComparison.diffs.map((diff) => (
                        <DiffRow key={diff.field} diff={diff} t={t} />
                      ))}
                    </Box>
                  )}

                  {/* AI Judge */}
                  {run.judge && (
                    <Box>
                      <HStack justify="space-between" mb={3}>
                        <Text fontSize="sm" fontWeight="semibold">
                          {t("agentBenchmarks.judge.title", {
                            defaultValue: "AI judge",
                          })}
                        </Text>
                        <Badge
                          colorPalette={getScoreColor(judgeScore)}
                          size="md"
                        >
                          {judgeScore}%
                        </Badge>
                      </HStack>
                      <VStack align="stretch" gap={3}>
                        <Box p={3} bg="bg.subtle" borderRadius="xl">
                          <Text fontSize="sm" color="fg.muted">
                            {run.judge.rationale}
                          </Text>
                        </Box>
                        {run.judge.strengths.length > 0 && (
                          <Box>
                            <HStack gap={1.5} mb={2}>
                              <MaterialSymbol color="success.fg" fontSize={16}>
                                check_circle
                              </MaterialSymbol>
                              <Text
                                fontSize="xs"
                                fontWeight="medium"
                                color="success.fg"
                                textTransform="uppercase"
                                letterSpacing="wide"
                              >
                                {t("agentBenchmarks.judge.strengths", {
                                  defaultValue: "Strengths",
                                })}
                              </Text>
                            </HStack>
                            <VStack align="stretch" gap={1}>
                              {run.judge.strengths.map((s, i) => (
                                <HStack key={i} gap={2} align="flex-start">
                                  <Text
                                    color="success.fg"
                                    flexShrink={0}
                                    mt={0.5}
                                  >
                                    ·
                                  </Text>
                                  <Text fontSize="sm">{s}</Text>
                                </HStack>
                              ))}
                            </VStack>
                          </Box>
                        )}
                        {run.judge.problems.length > 0 && (
                          <Box>
                            <HStack gap={1.5} mb={2}>
                              <MaterialSymbol color="red.fg" fontSize={16}>
                                cancel
                              </MaterialSymbol>
                              <Text
                                fontSize="xs"
                                fontWeight="medium"
                                color="red.fg"
                                textTransform="uppercase"
                                letterSpacing="wide"
                              >
                                {t("agentBenchmarks.judge.problems", {
                                  defaultValue: "Problems",
                                })}
                              </Text>
                            </HStack>
                            <VStack align="stretch" gap={1}>
                              {run.judge.problems.map((p, i) => (
                                <HStack key={i} gap={2} align="flex-start">
                                  <Text color="red.fg" flexShrink={0} mt={0.5}>
                                    ·
                                  </Text>
                                  <Text fontSize="sm">{p}</Text>
                                </HStack>
                              ))}
                            </VStack>
                          </Box>
                        )}
                      </VStack>
                    </Box>
                  )}

                  {/* Errors */}
                  {run.judgeError && (
                    <Box
                      p={3}
                      bg="bg.subtle"
                      borderRadius="xl"
                      borderWidth="1px"
                      borderColor="border.error"
                    >
                      <HStack gap={2} mb={1}>
                        <MaterialSymbol color="fg.error" fontSize={16}>
                          error
                        </MaterialSymbol>
                        <Text
                          fontSize="xs"
                          fontWeight="medium"
                          color="fg.error"
                          textTransform="uppercase"
                          letterSpacing="wide"
                        >
                          {t("agentBenchmarks.judge.error", {
                            defaultValue: "Judge error",
                          })}
                        </Text>
                      </HStack>
                      <Text fontSize="sm" color="fg.error">
                        {run.judgeError}
                      </Text>
                    </Box>
                  )}
                  {run.error && (
                    <Box
                      p={3}
                      bg="bg.subtle"
                      borderRadius="xl"
                      borderWidth="1px"
                      borderColor="border.error"
                    >
                      <HStack gap={2} mb={1}>
                        <MaterialSymbol color="fg.error" fontSize={16}>
                          error
                        </MaterialSymbol>
                        <Text
                          fontSize="xs"
                          fontWeight="medium"
                          color="fg.error"
                          textTransform="uppercase"
                          letterSpacing="wide"
                        >
                          {t("agentBenchmarks.errors.run", {
                            defaultValue: "Run error",
                          })}
                        </Text>
                      </HStack>
                      <Text fontSize="sm" color="fg.error">
                        {run.error}
                      </Text>
                    </Box>
                  )}
                </VStack>
              </Dialog.Body>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </Card.Root>
  );
}

function BenchmarkMetric({
  label,
  value,
  colorPalette = "gray",
}: {
  label: string;
  value: string;
  colorPalette?: string;
}) {
  return (
    <Box bg="bg.subtle" borderRadius="xl" p={3}>
      <Text color="fg.muted" fontSize="xs">
        {label}
      </Text>
      <Badge colorPalette={colorPalette} mt={1}>
        {value}
      </Badge>
    </Box>
  );
}

function DiffRow({
  diff,
  t,
}: {
  diff: AiBenchmarkDiffEntry;
  t: ReturnType<typeof useT>["t"];
}) {
  return (
    <Grid
      templateColumns={{ base: "1fr", md: "180px 1fr 1fr 96px" }}
      gap={2}
      alignItems="center"
      py={2}
      borderTopWidth="1px"
      borderColor="border.subtle"
    >
      <Text fontWeight="medium" fontSize="sm">
        {t(`agentBenchmarks.comparison.fields.${diff.field}`, {
          defaultValue: diff.label,
        })}
      </Text>
      <Text color="fg.muted" fontSize="sm">
        {diff.expected}
      </Text>
      <Text color="fg.muted" fontSize="sm">
        {diff.actual}
      </Text>
      <Badge colorPalette={getScoreColor((diff.score / diff.weight) * 100)}>
        {Math.round((diff.score / diff.weight) * 100)}%
      </Badge>
    </Grid>
  );
}
