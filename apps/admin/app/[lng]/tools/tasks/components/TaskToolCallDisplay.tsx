import { useState } from "react";
import {
  Badge,
  Box,
  Collapsible,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { useT } from "@/i18n/client";

interface TaskToolCallDisplayProps {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
}

const toolIcon: Record<string, string> = {
  searchCustomers: "search",
  getCustomerById: "person",
  selectCustomer: "person_check",
  searchProducts: "inventory_2",
  getProductDetails: "info",
  addItemToQuote: "add_shopping_cart",
  removeItemFromQuote: "remove_shopping_cart",
  calculateItemPrice: "calculate",
  getExpressProcessingSettings: "delivery_truck_speed",
  applyExpressProcessing: "bolt",
  setContactInfo: "contacts",
  setShippingOption: "local_shipping",
  setSpecialNotes: "note",
  getQuoteSummary: "summarize",
  requestQuoteApproval: "approval",
  inspectProductCreationCatalog: "manage_search",
  prepareProductDraft: "inventory",
  finalizeProductDraft: "task_alt",
};

export function TaskToolCallDisplay({
  toolName,
  args,
  result,
}: TaskToolCallDisplayProps) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);

  const icon = toolIcon[toolName] || "build";
  const hasResult = result !== undefined && result !== null;
  const isSuccess =
    hasResult &&
    typeof result === "object" &&
    (result as Record<string, unknown>)?.success !== false &&
    !(result as Record<string, unknown>)?.error;

  const hasDetails = Object.keys(args).length > 0 || hasResult;

  return (
    <Box fontSize="sm">
      <HStack
        gap={1.5}
        cursor={hasDetails ? "pointer" : "default"}
        onClick={hasDetails ? () => setExpanded(!expanded) : undefined}
        py={0.5}
        color="fg.muted"
        _hover={hasDetails ? { color: "fg" } : undefined}
        userSelect="none"
      >
        <MaterialSymbol>{icon}</MaterialSymbol>
        <Text fontSize="xs" fontWeight="medium">
          {t(`agents.tools.${toolName}`, { defaultValue: toolName })}
        </Text>
        {hasResult && (
          <Badge
            size="sm"
            colorPalette={isSuccess ? "success" : "red"}
            variant="outline"
          >
            {isSuccess
              ? t("agents.toolSuccess", { defaultValue: "Success" })
              : t("agents.toolFailed", { defaultValue: "Failed" })}
          </Badge>
        )}
        {hasDetails && (
          <MaterialSymbol>
            {expanded ? "expand_less" : "expand_more"}
          </MaterialSymbol>
        )}
      </HStack>

      <Collapsible.Root open={expanded}>
        <Collapsible.Content>
          <VStack
            align="start"
            gap={2}
            mt={1}
            pl={3}
            ml={1}
            borderLeftWidth="2px"
            borderColor="border.muted"
          >
            {Object.keys(args).length > 0 && (
              <Box>
                <Text fontSize="xs" fontWeight="medium" color="fg.muted" mb={1}>
                  {t("agents.toolArgs", { defaultValue: "Arguments" })}
                </Text>
                <Box
                  as="pre"
                  fontSize="xs"
                  p={2}
                  borderWidth="1px"
                  borderColor="border.subtle"
                  borderRadius="md"
                  overflow="auto"
                  maxH="100px"
                >
                  {JSON.stringify(args, null, 2)}
                </Box>
              </Box>
            )}
            {hasResult && (
              <Box>
                <Text fontSize="xs" fontWeight="medium" color="fg.muted" mb={1}>
                  {t("agents.toolResult", { defaultValue: "Result" })}
                </Text>
                <Box
                  as="pre"
                  fontSize="xs"
                  p={2}
                  borderWidth="1px"
                  borderColor="border.subtle"
                  borderRadius="md"
                  overflow="auto"
                  maxH="150px"
                >
                  {JSON.stringify(result, null, 2)}
                </Box>
              </Box>
            )}
          </VStack>
        </Collapsible.Content>
      </Collapsible.Root>
    </Box>
  );
}

export default TaskToolCallDisplay;
