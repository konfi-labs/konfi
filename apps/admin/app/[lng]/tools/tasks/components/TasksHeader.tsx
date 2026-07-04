import { useT } from "@/i18n/client";
import {
  Badge,
  Button,
  HStack,
  IconButton,
  ProgressCircle,
  Text,
} from "@chakra-ui/react";
import { ButtonLink, MaterialSymbol } from "@konfi/components";
import { ADMIN_TOOLS_AGENT_MEMORY } from "@konfi/utils";

interface TasksHeaderProps {
  activeCount: number;
  awaitingApprovalCount: number;
  onStartAgent?: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function TasksHeader({
  activeCount,
  awaitingApprovalCount,
  onStartAgent,
  onRefresh,
  isRefreshing,
}: TasksHeaderProps) {
  const { t, i18n } = useT();
  const agentMemoryLabel = t("tools.agentMemory", {
    defaultValue: "Agent Memory",
  });

  return (
    <HStack justify="flex-end" wrap="wrap" gap={3}>
      {activeCount > 0 && (
        <HStack
          px={3}
          py={1.5}
          colorPalette="primary"
          borderRadius="full"
          gap={2}
        >
          <ProgressCircle.Root size="xs" value={null}>
            <ProgressCircle.Circle>
              <ProgressCircle.Track />
              <ProgressCircle.Range />
            </ProgressCircle.Circle>
          </ProgressCircle.Root>
          <Text fontSize="sm" fontWeight="medium">
            {t("agents.activeCount", {
              defaultValue: "{{count}} active",
              count: activeCount,
            })}
          </Text>
        </HStack>
      )}
      {awaitingApprovalCount > 0 && (
        <HStack px={3} py={1.5} gap={2}>
          <MaterialSymbol>approval</MaterialSymbol>
          <Text fontSize="sm" fontWeight="medium">
            {t("agents.awaitingApproval", {
              defaultValue: "{{count}} awaiting approval",
              count: awaitingApprovalCount,
            })}
          </Text>
        </HStack>
      )}
      <IconButton
        size="sm"
        variant="outline"
        onClick={onRefresh}
        loading={isRefreshing}
        aria-label={t("agents.refresh", { defaultValue: "Refresh" })}
      >
        <MaterialSymbol>refresh</MaterialSymbol>
      </IconButton>
      <ButtonLink
        size="sm"
        variant="outline"
        href={ADMIN_TOOLS_AGENT_MEMORY}
        lng={i18n.resolvedLanguage}
        ariaLabel={agentMemoryLabel}
      >
        <MaterialSymbol>psychology_alt</MaterialSymbol>
        {agentMemoryLabel}
      </ButtonLink>
      {onStartAgent && (
        <Button
          size="sm"
          colorPalette="primary"
          borderRadius="full"
          onClick={onStartAgent}
        >
          <MaterialSymbol>play_arrow</MaterialSymbol>
          <HStack as="span" gap={1.5}>
            <span>
              {t("agents.startAgent", { defaultValue: "Start agent" })}
            </span>
            <Badge
              colorPalette="orange"
              variant="solid"
              borderRadius="full"
              px={1.5}
            >
              DEV
            </Badge>
          </HStack>
        </Button>
      )}
    </HStack>
  );
}

export default TasksHeader;
