"use client";

import { applyProductAgentCatalogSetup } from "@/actions/product-agent";
import { useT } from "@/i18n/client";
import { useAgents } from "@/context/agents";
import type { AgentFileMetadata } from "@/lib/ai/durable-agents/types";
import type { ProductAgentCatalogSetupPlan } from "@/lib/ai/durable-agents/product-workflow.types";
import {
  Box,
  Dialog,
  Flex,
  HStack,
  Portal,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react";
import { CustomHeading, MaterialSymbol, toaster } from "@konfi/components";
import { useCallback, useMemo, useState } from "react";
import {
  PaginatedAgentList,
  type PaginatedAgentListControls,
} from "./components/PaginatedAgentList";
import StartAgentPanel from "./components/StartAgentPanel";
import TasksHeader from "./components/TasksHeader";

export default function TasksPage() {
  const { t, i18n } = useT();
  const {
    agents,
    isLoading,
    isStarting,
    startAgent,
    approveAgent,
    rejectAgent,
    cancelAgent,
    removeAgent,
    setAgentFeedback,
    retryAgent,
    respondToAgent,
    refreshAgents,
  } = useAgents();
  const [retryInputFor, setRetryInputFor] = useState<string | null>(null);
  const [retryInputText, setRetryInputText] = useState<string>("");
  const [responseInputFor, setResponseInputFor] = useState<string | null>(null);
  const [responseInputText, setResponseInputText] = useState<string>("");
  const [isResponding, setIsResponding] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isStartAgentDialogOpen, setIsStartAgentDialogOpen] = useState(false);
  const manualRunsEnabled = process.env.NODE_ENV === "development";

  const toggleRetryInput = useCallback((id: string) => {
    setRetryInputFor((prev) => {
      if (prev === id) {
        setRetryInputText("");
        return null;
      }
      return id;
    });
  }, []);

  const handleRetry = useCallback(
    async (runId: string) => {
      if (!manualRunsEnabled) return;
      if (!retryInputText.trim()) return;
      await retryAgent(runId, retryInputText);
      setRetryInputFor(null);
      setRetryInputText("");
    },
    [manualRunsEnabled, retryAgent, retryInputText],
  );

  const toggleResponseInput = useCallback((runId: string) => {
    setResponseInputFor((prev) => {
      if (prev === runId) {
        setResponseInputText("");
        return null;
      }
      return runId;
    });
  }, []);

  const handleRespond = useCallback(
    async (
      runId: string,
      options?: {
        approved?: boolean;
        catalogSetupPlan?: ProductAgentCatalogSetupPlan;
        confirmed?: boolean;
        response?: string;
      },
    ) => {
      const responseText = options?.response ?? responseInputText;

      if (!responseText.trim()) return;
      setIsResponding(true);
      try {
        await respondToAgent(runId, responseText, {
          approved: options?.approved,
          catalogSetupPlan: options?.catalogSetupPlan,
          confirmed: options?.confirmed,
        });
        setResponseInputFor(null);
        setResponseInputText("");
      } finally {
        setIsResponding(false);
      }
    },
    [respondToAgent, responseInputText],
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refreshAgents();
    setIsRefreshing(false);
  }, [refreshAgents]);

  const handleApplyProductCatalogSetup = useCallback(
    async (runId: string, catalogSetupPlan: ProductAgentCatalogSetupPlan) => {
      const result = await applyProductAgentCatalogSetup(
        runId,
        catalogSetupPlan,
      );

      if (result.success) {
        toaster.success({
          title: t("agents.catalogSetup.applySuccessTitle", {
            defaultValue: "Catalog changes applied",
          }),
          description: result.summary,
        });
      } else {
        toaster.error({
          title: t("agents.catalogSetup.applyErrorTitle", {
            defaultValue: "Catalog changes were not applied",
          }),
          description: result.error,
        });
      }

      await refreshAgents();

      return result;
    },
    [refreshAgents, t],
  );

  const handleStartAgent = useCallback(
    async (params: {
      fileMetadata?: AgentFileMetadata[];
      prompt: string;
      taskType: "quote" | "order" | "product" | "autonomous";
    }) => {
      if (!manualRunsEnabled) {
        return null;
      }

      const runId = await startAgent(params);

      if (runId) {
        setIsStartAgentDialogOpen(false);
      }

      return runId;
    },
    [manualRunsEnabled, startAgent],
  );

  const activeAgents = useMemo(
    () =>
      agents.filter((a) =>
        ["pending", "processing", "awaiting-approval"].includes(a.status),
      ),
    [agents],
  );
  const completedAgents = useMemo(
    () => agents.filter((a) => ["completed", "approved"].includes(a.status)),
    [agents],
  );
  const failedAgents = useMemo(
    () => agents.filter((a) => ["failed", "rejected"].includes(a.status)),
    [agents],
  );

  const awaitingApprovalCount = useMemo(
    () => agents.filter((a) => a.status === "awaiting-approval").length,
    [agents],
  );
  const agentListControls: PaginatedAgentListControls = {
    isLoading,
    manualRunsEnabled,
    isResponding,
    isStarting,
    locale: i18n.resolvedLanguage ?? "en",
    retryInputFor,
    retryInputText,
    responseInputFor,
    responseInputText,
    t,
    onApprove: approveAgent,
    onCancel: cancelAgent,
    onReject: rejectAgent,
    onRemove: removeAgent,
    onFeedback: setAgentFeedback,
    onApplyCatalogSetup: handleApplyProductCatalogSetup,
    onResponseInputChange: setResponseInputText,
    onResponseSubmit: handleRespond,
    onResponseToggle: toggleResponseInput,
    onRetryInputChange: setRetryInputText,
    onRetrySubmit: handleRetry,
    onRetryToggle: toggleRetryInput,
  };

  return (
    <Box>
      <Flex align="flex-start" justify="space-between" wrap="wrap" gap={4}>
        <CustomHeading
          heading={t("agents.pageTitle", { defaultValue: "AI Agents" })}
          breadcrumb
          goBack
          t={t}
        />
      </Flex>
      {manualRunsEnabled && (
        <Dialog.Root
          lazyMount
          unmountOnExit
          open={isStartAgentDialogOpen}
          onOpenChange={(details) => setIsStartAgentDialogOpen(details.open)}
          size="xl"
        >
          <Portal>
            <Dialog.Backdrop />
            <Dialog.Positioner>
              <Dialog.Content>
                <Dialog.Header>
                  <Dialog.Title>
                    {t("agents.startAgentTitle", {
                      defaultValue: "Start an AI agent",
                    })}
                  </Dialog.Title>
                </Dialog.Header>
                <Dialog.CloseTrigger />
                <Dialog.Body pb={6}>
                  <VStack align="stretch" gap={4}>
                    <Text color="fg.muted" fontSize="sm">
                      {t("agents.startAgentDescription", {
                        defaultValue:
                          "Choose a durable agent and paste the full request. Product agents prepare reusable drafts for review without creating anything automatically.",
                      })}
                    </Text>
                    <StartAgentPanel
                      isStarting={isStarting}
                      onStartAction={handleStartAgent}
                    />
                  </VStack>
                </Dialog.Body>
              </Dialog.Content>
            </Dialog.Positioner>
          </Portal>
        </Dialog.Root>
      )}
      <Tabs.Root
        value={activeTab}
        onValueChange={(e) => setActiveTab(e.value)}
        variant="enclosed"
        lazyMount
        unmountOnExit
      >
        <HStack justify="space-between">
          <Tabs.List>
            <Tabs.Trigger value="all">
              <MaterialSymbol>list</MaterialSymbol>
              {t("agents.tabs.all", { defaultValue: "All" })} ({agents.length})
            </Tabs.Trigger>
            <Tabs.Trigger value="active">
              <MaterialSymbol>play_arrow</MaterialSymbol>
              {t("agents.tabs.active", { defaultValue: "Active" })} (
              {activeAgents.length})
            </Tabs.Trigger>
            <Tabs.Trigger value="completed">
              <MaterialSymbol>check_circle</MaterialSymbol>
              {t("agents.tabs.completed", { defaultValue: "Completed" })} (
              {completedAgents.length})
            </Tabs.Trigger>
            <Tabs.Trigger value="failed">
              <MaterialSymbol>cancel</MaterialSymbol>
              {t("agents.tabs.failed", { defaultValue: "Failed" })} (
              {failedAgents.length})
            </Tabs.Trigger>
            <Tabs.Indicator />
          </Tabs.List>
          <TasksHeader
            activeCount={activeAgents.length}
            awaitingApprovalCount={awaitingApprovalCount}
            onStartAgent={
              manualRunsEnabled
                ? () => setIsStartAgentDialogOpen(true)
                : undefined
            }
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
          />
        </HStack>
        <Tabs.Content value="all" pt="6">
          <PaginatedAgentList agents={agents} {...agentListControls} />
        </Tabs.Content>
        <Tabs.Content value="active" pt="6">
          <PaginatedAgentList agents={activeAgents} {...agentListControls} />
        </Tabs.Content>
        <Tabs.Content value="completed" pt="6">
          <PaginatedAgentList agents={completedAgents} {...agentListControls} />
        </Tabs.Content>
        <Tabs.Content value="failed" pt="6">
          <PaginatedAgentList agents={failedAgents} {...agentListControls} />
        </Tabs.Content>
      </Tabs.Root>
    </Box>
  );
}
