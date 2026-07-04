"use client";

import { suggestOrderImpositionTemplatesAdmin } from "@/actions/ai";
import ImposeForm from "@/components/impose/ImposeForm";
import { useTenantContext } from "@/context/tenant";
import { firestore } from "@/lib/firebase/clientApp";
import {
  getProductImpositionTemplatesPath,
  mapProductImpositionTemplateLinkDocument,
  type ProductImpositionTemplateLink,
} from "@/lib/product-imposition-templates";
import {
  Badge,
  Box,
  Button,
  CloseButton,
  createListCollection,
  Dialog,
  HStack,
  Portal,
  Select,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { db, getImpositionWorkflows, tenant } from "@konfi/firebase";
import { CreateImpositionWorkflow, OrderItem } from "@konfi/types";
import {
  type OrderImpositionTemplateExistingMatch,
  type OrderImpositionTemplateSuggestionItem,
  type OrderImpositionWorkflowCandidate,
  shortlistOrderImpositionWorkflowCandidates,
  toSerializableOrderImpositionTemplateSuggestionItems,
} from "@konfi/utils";
import { isUndefined, sortBy } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import {
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import type { TFunction } from "i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

interface SavedImpositionSuggestion {
  inputHash: string;
  suggestions: Array<{ orderItemId: string; workflowIds: string[] }>;
  createdAt: Timestamp;
}

function getImpositionSuggestionPath(channelId: string, orderId: string) {
  return `channels/${channelId}/orders/${orderId}/impositionTemplateSuggestions/latest`;
}

interface OrderImpositionTemplatesSectionProps {
  channelId?: string;
  orderId?: string;
  orderItems: OrderItem[] | null;
  t: TFunction;
}

interface MatchedOrderImpositionTemplate {
  id: string;
  orderItemKey: string;
  orderItem: OrderItem;
  workflow: CreateImpositionWorkflow;
  source: "linked" | "suggested";
}

interface OrderImpositionTemplateMatchData {
  cachedAiSuggestions: SavedImpositionSuggestion["suggestions"] | null;
  directMatches: MatchedOrderImpositionTemplate[];
  existingMatchesByItem: OrderImpositionTemplateExistingMatch[];
  inputHash: string;
  items: OrderImpositionTemplateSuggestionItem[];
  workflowCandidates: OrderImpositionWorkflowCandidate[];
  workflows: CreateImpositionWorkflow[];
}

const COMBINATION_VALUE_SEPARATOR = "-";
const MAX_ORDER_IMPOSITION_MATCH_KEY_TEXT_LENGTH = 250;

function getOrderImpositionMatchKeyText(value: string | null | undefined) {
  return (value ?? "").slice(0, MAX_ORDER_IMPOSITION_MATCH_KEY_TEXT_LENGTH);
}

function getOrderItemSelectedOptions(orderItem: OrderItem) {
  const selectedOptions = new Set<string>();
  const combinationValues = orderItem.combination
    ?.split(COMBINATION_VALUE_SEPARATOR)
    .filter(Boolean);
  const calculatedCombinationValues = orderItem.calculatedCombination
    ?.split(COMBINATION_VALUE_SEPARATOR)
    .filter(Boolean);

  for (const option of [
    ...(combinationValues ?? []),
    ...(calculatedCombinationValues ?? []),
  ]) {
    selectedOptions.add(option);
  }

  return selectedOptions;
}

function doesTemplateMatchOrderItem(
  link: ProductImpositionTemplateLink,
  orderItem: OrderItem,
) {
  if (isEmpty(link.attributeOptions)) {
    return true;
  }

  const selectedOptions = getOrderItemSelectedOptions(orderItem);
  return link.attributeOptions.every((option) => selectedOptions.has(option));
}

async function fetchOrderImpositionTemplateMatchData(
  channelId: string,
  inputHash: string,
  orderItems: OrderItem[],
  orderId?: string,
): Promise<OrderImpositionTemplateMatchData> {
  let cachedAiSuggestions: SavedImpositionSuggestion["suggestions"] | null =
    null;

  if (orderId) {
    try {
      const cachedDoc = await getDoc(
        doc(firestore, getImpositionSuggestionPath(channelId, orderId)),
      );
      if (cachedDoc.exists()) {
        const cached = cachedDoc.data() as SavedImpositionSuggestion;
        if (cached.inputHash === inputHash) {
          cachedAiSuggestions = cached.suggestions;
        }
      }
    } catch (error) {
      console.error("Error loading cached imposition suggestions:", error);
    }
  }

  const workflows = (await getImpositionWorkflows(firestore)) ?? [];
  const workflowsById = new Map(
    workflows.map((workflow) => [workflow.id, workflow]),
  );
  const productIds = Array.from(
    new Set(
      orderItems
        .map((orderItem) => orderItem.product?.id)
        .filter((productId): productId is string => Boolean(productId)),
    ),
  );

  const linksByProductIdEntries = await Promise.all(
    productIds.map(async (productId) => {
      try {
        const snapshot = await getDocs(
          query(
            db.collection(
              firestore,
              getProductImpositionTemplatesPath(channelId, productId),
            ),
          ),
        );
        const links = snapshot.docs.map(
          mapProductImpositionTemplateLinkDocument,
        );
        return [productId, links] as const;
      } catch (error) {
        console.error("Error fetching order imposition templates:", error);
        return [productId, [] as ProductImpositionTemplateLink[]] as const;
      }
    }),
  );
  const linksByProductId = new Map(linksByProductIdEntries);
  const serializableItems =
    toSerializableOrderImpositionTemplateSuggestionItems(orderItems);

  const directMatches = orderItems.flatMap((orderItem, index) => {
    const orderItemKey = serializableItems[index]?.id ?? orderItem.id ?? "";
    const productId = orderItem.product?.id;
    if (!productId) return [];

    const links = linksByProductId.get(productId) ?? [];
    return links
      .filter((link) => doesTemplateMatchOrderItem(link, orderItem))
      .flatMap((link) => {
        const workflow = workflowsById.get(link.impositionWorkflowId);
        if (isUndefined(workflow)) return [];

        return [
          {
            id: `${orderItemKey}:${workflow.id}`,
            orderItemKey,
            orderItem,
            workflow,
            source: "linked" as const,
          },
        ];
      });
  });

  const existingMatchesByItem = Array.from(
    directMatches
      .reduce((accumulator, match) => {
        const entry = accumulator.get(match.orderItemKey) ?? {
          orderItemId: match.orderItemKey,
          workflowNames: [] as string[],
        };
        if (!entry.workflowNames.includes(match.workflow.name)) {
          entry.workflowNames.push(match.workflow.name);
        }
        accumulator.set(match.orderItemKey, entry);
        return accumulator;
      }, new Map<string, { orderItemId: string; workflowNames: string[] }>())
      .values(),
  );
  const matchedWorkflowIds = Array.from(
    new Set(directMatches.map((match) => match.workflow.id)),
  );
  const workflowCandidates = shortlistOrderImpositionWorkflowCandidates({
    items: serializableItems,
    workflows,
    excludedWorkflowIds: matchedWorkflowIds,
  });

  if (workflowCandidates.length === 0) {
    return {
      cachedAiSuggestions,
      directMatches,
      existingMatchesByItem,
      inputHash,
      items: serializableItems,
      workflowCandidates,
      workflows,
    };
  }

  return {
    cachedAiSuggestions,
    directMatches,
    existingMatchesByItem,
    inputHash,
    items: serializableItems,
    workflowCandidates,
    workflows,
  };
}

function mergeSuggestedOrderImpositionMatches(params: {
  data: OrderImpositionTemplateMatchData;
  orderItems: OrderItem[];
  suggestions: SavedImpositionSuggestion["suggestions"] | null;
}) {
  const { data, orderItems, suggestions } = params;
  if (!suggestions) {
    return data.directMatches;
  }

  const workflowsById = new Map(
    data.workflows.map((workflow) => [workflow.id, workflow]),
  );
  const orderItemsByStableId = new Map(
    data.items.map((item, index) => [item.id, orderItems[index]]),
  );
  const suggestionKeys = new Set(data.directMatches.map((match) => match.id));
  const suggestedMatches = suggestions.flatMap((suggestion) => {
    const orderItem = orderItemsByStableId.get(suggestion.orderItemId);
    if (!orderItem) {
      return [];
    }

    return suggestion.workflowIds.flatMap((workflowId) => {
      const workflow = workflowsById.get(workflowId);
      if (!workflow) {
        return [];
      }

      const matchId = `${suggestion.orderItemId}:${workflow.id}`;
      if (suggestionKeys.has(matchId)) {
        return [];
      }

      suggestionKeys.add(matchId);
      return [
        {
          id: matchId,
          orderItemKey: suggestion.orderItemId,
          orderItem,
          workflow,
          source: "suggested" as const,
        },
      ];
    });
  });

  return [...data.directMatches, ...suggestedMatches];
}

function getOrderItemLabel(orderItem: OrderItem, fallback: string) {
  return orderItem.name || orderItem.product?.name || fallback;
}

function getTemplateMatchLabel(
  match: MatchedOrderImpositionTemplate,
  t: TFunction,
) {
  return `${getOrderItemLabel(
    match.orderItem,
    t("order.impositionTemplates.itemFallback", {
      defaultValue: "Order item",
    }),
  )} — ${match.workflow.name}`;
}

export function OrderImpositionTemplatesSection({
  channelId,
  orderId,
  orderItems,
  t,
}: OrderImpositionTemplatesSectionProps) {
  const tenantContext = useTenantContext();
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [backgroundAiSuggestions, setBackgroundAiSuggestions] =
    useState<SavedImpositionSuggestion | null>(null);
  const requestedBackgroundSuggestionKeysRef = useRef(new Set<string>());
  const matchKey = useMemo(() => {
    if (!channelId || !orderItems || orderItems.length === 0) return null;

    const itemKeys = orderItems.map((orderItem) =>
      [
        orderItem.id,
        getOrderImpositionMatchKeyText(orderItem.name),
        getOrderImpositionMatchKeyText(orderItem.description),
        orderItem.product?.id ?? "",
        getOrderImpositionMatchKeyText(orderItem.product?.name),
        orderItem.combination ?? "",
        orderItem.calculatedCombination ?? "",
        orderItem.width ?? "",
        orderItem.height ?? "",
      ].join(":"),
    );

    return ["order-imposition-templates", channelId, itemKeys.join("|")];
  }, [channelId, orderItems]);
  const { data: matchData } = useSWR<OrderImpositionTemplateMatchData | null>(
    matchKey,
    async () => {
      if (!channelId || !orderItems) return null;

      const inputHash = matchKey?.join("|") ?? "";
      return fetchOrderImpositionTemplateMatchData(
        channelId,
        inputHash,
        orderItems,
        orderId,
      );
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );
  const backgroundSuggestionRequestKey = matchData
    ? `${channelId ?? ""}:${orderId ?? ""}:${matchData.inputHash}`
    : null;

  useEffect(() => {
    if (
      !channelId ||
      !orderId ||
      !matchData ||
      !backgroundSuggestionRequestKey ||
      matchData.cachedAiSuggestions ||
      matchData.workflowCandidates.length === 0
    ) {
      return;
    }

    if (
      requestedBackgroundSuggestionKeysRef.current.has(
        backgroundSuggestionRequestKey,
      )
    ) {
      return;
    }

    requestedBackgroundSuggestionKeysRef.current.add(
      backgroundSuggestionRequestKey,
    );

    let cancelled = false;

    void suggestOrderImpositionTemplatesAdmin({
      items: matchData.items,
      workflowCandidates: matchData.workflowCandidates,
      existingMatchesByItem: matchData.existingMatchesByItem,
    })
      .then((result) => {
        if (cancelled) {
          return;
        }

        const savedSuggestion: SavedImpositionSuggestion = {
          inputHash: matchData.inputHash,
          suggestions: result.suggestions,
          createdAt: Timestamp.now(),
        };
        setBackgroundAiSuggestions(savedSuggestion);

        setDoc(
          doc(firestore, getImpositionSuggestionPath(channelId, orderId)),
          tenant.withTenantId(
            savedSuggestion,
            tenantContext,
            "order imposition suggestion cache create",
          ),
        ).catch(console.error);
      })
      .catch((error) => {
        console.error("Error suggesting imposition templates:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [
    backgroundSuggestionRequestKey,
    channelId,
    matchData,
    orderId,
    tenantContext,
  ]);

  const matches = useMemo(() => {
    if (!matchData || !orderItems) {
      return [];
    }

    const suggestionsFromBackground =
      backgroundAiSuggestions &&
      backgroundAiSuggestions.inputHash === matchData.inputHash
        ? backgroundAiSuggestions.suggestions
        : null;
    const suggestions =
      matchData.cachedAiSuggestions ?? suggestionsFromBackground;

    return mergeSuggestedOrderImpositionMatches({
      data: matchData,
      orderItems,
      suggestions,
    });
  }, [backgroundAiSuggestions, matchData, orderItems]);

  const sortedMatches = useMemo(
    () =>
      sortBy(matches, [
        (match) => getOrderItemLabel(match.orderItem, ""),
        (match) => match.workflow.name,
      ]),
    [matches],
  );
  const selectedMatch =
    sortedMatches.find((match) => match.id === selectedMatchId) ??
    sortedMatches[0];
  const collection = useMemo(
    () =>
      createListCollection({
        items: sortedMatches.map((match) => ({
          label: getTemplateMatchLabel(match, t),
          value: match.id,
        })),
      }),
    [sortedMatches, t],
  );

  useEffect(() => {
    if (sortedMatches.length === 0) {
      setSelectedMatchId("");
      return;
    }

    if (!sortedMatches.some((match) => match.id === selectedMatchId)) {
      setSelectedMatchId(sortedMatches[0].id);
    }
  }, [selectedMatchId, sortedMatches]);

  const hasMatches = sortedMatches.length > 0;

  return (
    <>
      <Box border="1px solid" borderColor="gray.muted" borderRadius="3xl" p={5}>
        <HStack justify="space-between" gap={4} align="center" flexWrap="wrap">
          <HStack gap={3} minW={0} flex="1">
            <MaterialSymbol>layers</MaterialSymbol>
            <VStack align="start" gap={0} minW={0}>
              <HStack gap={2}>
                <Text fontWeight="bold" fontSize="lg">
                  {t("order.impositionTemplates.title", {
                    defaultValue: "Imposition templates",
                  })}
                </Text>
                {hasMatches ? (
                  <Badge colorPalette="primary" variant="subtle">
                    {sortedMatches.length}
                  </Badge>
                ) : null}
              </HStack>
              <Text fontSize="sm" color="fg.muted">
                {!hasMatches
                  ? t("order.impositionTemplates.allTemplatesDescription", {
                      defaultValue:
                        "No matching templates were found. Open imposition to search all saved templates.",
                    })
                  : t("order.impositionTemplates.description", {
                      defaultValue:
                        "Open an imposition workspace for templates matching this order configuration.",
                    })}
              </Text>
            </VStack>
          </HStack>

          <HStack gap={3} flexWrap="wrap" justify="end">
            {hasMatches ? (
              <Select.Root
                collection={collection}
                value={selectedMatch ? [selectedMatch.id] : []}
                onValueChange={(details) =>
                  setSelectedMatchId(details.value[0] ?? "")
                }
                size="sm"
                width={{ base: "100%", md: "20rem" }}
                disabled={sortedMatches.length <= 1}
              >
                <Select.HiddenSelect />
                <Select.Control>
                  <Select.Trigger
                    aria-label={t("order.impositionTemplates.selectLabel", {
                      defaultValue: "Template",
                    })}
                  >
                    <Select.ValueText
                      placeholder={t(
                        "order.impositionTemplates.selectPlaceholder",
                        {
                          defaultValue: "Select imposition template...",
                        },
                      )}
                    />
                  </Select.Trigger>
                  <Select.IndicatorGroup>
                    <Select.Indicator />
                  </Select.IndicatorGroup>
                </Select.Control>
                <Select.Positioner>
                  <Select.Content>
                    {collection.items.map((item) => (
                      <Select.Item item={item} key={item.value}>
                        {item.label}
                        <Select.ItemIndicator />
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Positioner>
              </Select.Root>
            ) : null}
            <Button
              size="sm"
              colorPalette="primary"
              onClick={() => setDialogOpen(true)}
            >
              <MaterialSymbol>open_in_new</MaterialSymbol>
              {t("order.impositionTemplates.open", {
                defaultValue: "Open imposition",
              })}
            </Button>
          </HStack>
        </HStack>
      </Box>
      <Dialog.Root
        open={dialogOpen}
        onOpenChange={(details) => setDialogOpen(details.open)}
        size="cover"
        placement="center"
        lazyMount
        unmountOnExit
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner py={8}>
            <Dialog.Content
              maxH="calc(100vh - 4rem)"
              display="flex"
              flexDirection="column"
              overflow="hidden"
              borderRadius="3xl"
            >
              <Dialog.Header>
                <Dialog.Title>
                  {selectedMatch
                    ? t("order.impositionTemplates.dialogTitle", {
                        defaultValue: "Imposition: {{name}}",
                        name: selectedMatch.workflow.name,
                      })
                    : t("order.impositionTemplates.title", {
                        defaultValue: "Imposition templates",
                      })}
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body overflow="auto" minH={0}>
                {selectedMatch ? (
                  <ImposeForm
                    initialTemplate={selectedMatch.workflow}
                    initialTemplateKey={selectedMatch.id}
                  />
                ) : (
                  <ImposeForm />
                )}
              </Dialog.Body>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}
