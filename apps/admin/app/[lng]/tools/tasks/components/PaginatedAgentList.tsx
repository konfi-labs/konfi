"use client";

import AdminLoadingSkeleton from "@/components/layout/AdminLoadingSkeleton";
import { AgentRun, type AgentRunFeedbackValue } from "@/context/agents";
import type { ProductAgentCatalogSetupPlan } from "@/lib/ai/durable-agents/product-workflow.types";
import type { ApplyProductAgentCatalogSetupResponse } from "@/actions/product-agent";
import {
  Badge,
  Box,
  EmptyState,
  HStack,
  IconButton,
  Separator,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol, PageSizeSelect } from "@konfi/components";
import { type TFunction } from "i18next";
import { useEffect, useMemo, useState } from "react";
import TaskCard from "./TaskCard";

const TASKS_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export type PaginatedAgentListControls = {
  isLoading: boolean;
  manualRunsEnabled: boolean;
  isStarting: boolean;
  isResponding: boolean;
  locale: string;
  retryInputFor: string | null;
  retryInputText: string;
  responseInputFor: string | null;
  responseInputText: string;
  t: TFunction;
  onApprove: (runId: string) => void;
  onApplyCatalogSetup: (
    runId: string,
    catalogSetupPlan: ProductAgentCatalogSetupPlan,
  ) => Promise<ApplyProductAgentCatalogSetupResponse>;
  onCancel: (runId: string) => void;
  onFeedback: (
    runId: string,
    value: AgentRunFeedbackValue | null,
  ) => Promise<boolean>;
  onReject: (runId: string) => void;
  onRemove: (runId: string) => void;
  onResponseInputChange: (value: string) => void;
  onResponseSubmit: (
    runId: string,
    options?: {
      approved?: boolean;
      catalogSetupPlan?: ProductAgentCatalogSetupPlan;
      confirmed?: boolean;
      response?: string;
    },
  ) => void;
  onResponseToggle: (runId: string) => void;
  onRetryInputChange: (value: string) => void;
  onRetrySubmit: (runId: string) => void;
  onRetryToggle: (runId: string) => void;
};

type PaginatedAgentListProps = PaginatedAgentListControls & {
  agents: AgentRun[];
};

export function PaginatedAgentList({
  agents,
  isLoading,
  manualRunsEnabled,
  isStarting,
  isResponding,
  locale,
  retryInputFor,
  retryInputText,
  responseInputFor,
  responseInputText,
  t,
  onApprove,
  onApplyCatalogSetup,
  onCancel,
  onFeedback,
  onReject,
  onRemove,
  onResponseInputChange,
  onResponseSubmit,
  onResponseToggle,
  onRetryInputChange,
  onRetrySubmit,
  onRetryToggle,
}: PaginatedAgentListProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<number>(TASKS_PAGE_SIZE_OPTIONS[0]);
  const pageCount = Math.max(1, Math.ceil(agents.length / pageSize));
  const boundedPageIndex = Math.min(pageIndex, pageCount - 1);
  const paginatedAgents = useMemo(() => {
    const start = boundedPageIndex * pageSize;
    return agents.slice(start, start + pageSize);
  }, [agents, boundedPageIndex, pageSize]);

  useEffect(() => {
    if (pageIndex !== boundedPageIndex) {
      setPageIndex(boundedPageIndex);
    }
  }, [boundedPageIndex, pageIndex]);

  if (isLoading) {
    return <AdminLoadingSkeleton variant="list" showHeader={false} rows={3} />;
  }

  if (agents.length === 0) {
    return (
      <EmptyState.Root>
        <EmptyState.Content>
          <EmptyState.Indicator>
            <MaterialSymbol fontSize={48}>automation</MaterialSymbol>
          </EmptyState.Indicator>
          <EmptyState.Title>
            {t("agents.empty.title", { defaultValue: "No agents" })}
          </EmptyState.Title>
          <EmptyState.Description>
            {t("agents.empty.description", {
              defaultValue: "No agents found for this category.",
            })}
          </EmptyState.Description>
        </EmptyState.Content>
      </EmptyState.Root>
    );
  }

  return (
    <VStack gap={3} align="stretch">
      {paginatedAgents.map((agent) => (
        <TaskCard
          key={agent.id}
          agent={agent}
          locale={locale}
          manualRunsEnabled={manualRunsEnabled}
          retryInputOpen={retryInputFor === agent.runId}
          retryInputText={retryInputText}
          responseInputOpen={responseInputFor === agent.runId}
          responseInputText={responseInputText}
          isStarting={isStarting}
          isResponding={isResponding}
          onRetryToggle={onRetryToggle}
          onRetryInputChange={onRetryInputChange}
          onRetrySubmit={onRetrySubmit}
          onResponseToggle={onResponseToggle}
          onResponseInputChange={onResponseInputChange}
          onResponseSubmit={onResponseSubmit}
          onApprove={onApprove}
          onApplyCatalogSetup={onApplyCatalogSetup}
          onReject={onReject}
          onCancel={onCancel}
          onFeedback={onFeedback}
          onRemove={onRemove}
        />
      ))}
      <AgentListPagination
        itemsCount={agents.length}
        pageCount={pageCount}
        pageIndex={boundedPageIndex}
        pageSize={pageSize}
        t={t}
        onPageChange={setPageIndex}
        onPageSizeChange={(nextPageSize) => {
          setPageIndex(0);
          setPageSize(nextPageSize);
        }}
      />
    </VStack>
  );
}

type AgentListPaginationProps = {
  itemsCount: number;
  pageCount: number;
  pageIndex: number;
  pageSize: number;
  t: TFunction;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

function AgentListPagination({
  itemsCount,
  pageCount,
  pageIndex,
  pageSize,
  t,
  onPageChange,
  onPageSizeChange,
}: AgentListPaginationProps) {
  const canPreviousPage = pageIndex > 0;
  const canNextPage = pageIndex < pageCount - 1;

  return (
    <Box
      w="100%"
      borderColor="border.subtle"
      borderRadius="3xl"
      borderWidth="1px"
      p={{ base: 3, xl: 4 }}
    >
      <HStack w="100%" justifyContent="space-between" gap="3" flexWrap="wrap">
        <HStack>
          <Badge variant="outline" px={2}>
            {t("pagination.itemsCount", {
              defaultValue: "Count: {{itemCount}}",
              itemCount: itemsCount,
            })}
          </Badge>
          <PageSizeSelect
            onChange={onPageSizeChange}
            options={TASKS_PAGE_SIZE_OPTIONS}
            t={t}
            value={pageSize}
          />
        </HStack>
        <HStack>
          <IconButton
            aria-label={t("pagination.first", { defaultValue: "First page" })}
            onClick={() => onPageChange(0)}
            disabled={!canPreviousPage}
            size="sm"
            variant="outline"
          >
            <MaterialSymbol>keyboard_double_arrow_left</MaterialSymbol>
          </IconButton>
          <IconButton
            aria-label={t("pagination.previous", { defaultValue: "Previous" })}
            onClick={() => onPageChange(Math.max(pageIndex - 1, 0))}
            disabled={!canPreviousPage}
            size="sm"
            variant="outline"
          >
            <MaterialSymbol>chevron_left</MaterialSymbol>
          </IconButton>
          <Text>
            {t("pagination.page", { defaultValue: "Page" })}
            <strong>
              {` ${pageIndex + 1} ${t("pagination.of", { defaultValue: "of" })} ${pageCount}`}
            </strong>
          </Text>
          <IconButton
            aria-label={t("pagination.next", { defaultValue: "Next" })}
            onClick={() => onPageChange(Math.min(pageIndex + 1, pageCount - 1))}
            disabled={!canNextPage}
            size="sm"
            variant="outline"
          >
            <MaterialSymbol>chevron_right</MaterialSymbol>
          </IconButton>
          <IconButton
            aria-label={t("pagination.last", { defaultValue: "Last page" })}
            onClick={() => onPageChange(pageCount - 1)}
            disabled={!canNextPage}
            size="sm"
            variant="outline"
          >
            <MaterialSymbol>keyboard_double_arrow_right</MaterialSymbol>
          </IconButton>
          <Separator orientation="vertical" height="4" mx={2} />
        </HStack>
      </HStack>
    </Box>
  );
}
