"use client";

import { useAuth } from "@/context/auth";
import { useStoreRuntimeConfig } from "@/context/runtime-config";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  createListCollection,
  HStack,
  Input,
  Separator,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
  toaster,
} from "@konfi/components";
import { Order, OrderItem, RmaRequest, RmaRequestType } from "@konfi/types";
import { formatDate } from "@konfi/utils";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { createCustomerRmaRequest } from "app/actions/rma";
import { useEffect, useMemo, useState, useTransition } from "react";

interface RmaItemSelection {
  quantity: number;
  selected: boolean;
}

interface RmaRequestPanelProps {
  borderColor: string;
  order: Order;
  orderItems: OrderItem[];
}

function orderRequestsByCreatedAt(requests: RmaRequest[]) {
  return requests.toSorted((left, right) => {
    const leftMs = left.createdAt?.toDate?.().getTime?.() ?? 0;
    const rightMs = right.createdAt?.toDate?.().getTime?.() ?? 0;

    return rightMs - leftMs;
  });
}

export function RmaRequestPanel({
  borderColor,
  order,
  orderItems,
}: RmaRequestPanelProps) {
  const { t, i18n } = useT();
  const { user } = useAuth();
  const runtimeConfig = useStoreRuntimeConfig();
  const [description, setDescription] = useState("");
  const [requests, setRequests] = useState<RmaRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [selectedType, setSelectedType] = useState<RmaRequestType>(
    RmaRequestType.CLAIM,
  );
  const [selectedItems, setSelectedItems] = useState<
    Record<string, RmaItemSelection>
  >({});
  const [isSubmitting, startSubmitting] = useTransition();

  const typeOptions = useMemo(
    () =>
      [
        RmaRequestType.CLAIM,
        RmaRequestType.RETURN,
        RmaRequestType.EXCHANGE,
      ].map((type) => ({
        label: t(`RmaRequestType.${type}`, { defaultValue: type }),
        value: type,
      })),
    [t],
  );
  const typeCollection = useMemo(
    () => createListCollection({ items: typeOptions }),
    [typeOptions],
  );
  const selectedRequestItems = useMemo(
    () =>
      Object.entries(selectedItems)
        .filter(([, selection]) => selection.selected)
        .map(([orderItemId, selection]) => ({
          orderItemId,
          quantity: selection.quantity,
        })),
    [selectedItems],
  );
  const sortedRequests = useMemo(
    () => orderRequestsByCreatedAt(requests),
    [requests],
  );

  useEffect(() => {
    if (!user) {
      setRequests([]);
      setLoadingRequests(false);
      return;
    }

    setLoadingRequests(true);
    const rmaQuery = query(
      collection(firestore, `channels/${runtimeConfig.channelId}/rmaRequests`),
      where("active", "==", true),
      where("customerId", "==", user.uid),
      where("orderId", "==", order.id),
    );

    return onSnapshot(
      rmaQuery,
      (snapshot) => {
        setRequests(
          snapshot.docs.map((doc) => ({
            ...(doc.data() as RmaRequest),
            id: doc.id,
          })),
        );
        setLoadingRequests(false);
      },
      (error) => {
        console.error("Failed to load RMA requests:", error);
        setLoadingRequests(false);
      },
    );
  }, [order.id, runtimeConfig.channelId, user]);

  function updateItemSelection(orderItem: OrderItem, selected: boolean) {
    setSelectedItems((current) => ({
      ...current,
      [orderItem.id]: {
        quantity: current[orderItem.id]?.quantity ?? orderItem.quantity,
        selected,
      },
    }));
  }

  function updateItemQuantity(orderItem: OrderItem, quantity: number) {
    setSelectedItems((current) => ({
      ...current,
      [orderItem.id]: {
        quantity: Math.min(
          Math.max(1, Math.round(quantity)),
          orderItem.quantity,
        ),
        selected: current[orderItem.id]?.selected ?? true,
      },
    }));
  }

  function handleSubmit() {
    startSubmitting(async () => {
      const result = await createCustomerRmaRequest({
        channelId: runtimeConfig.channelId,
        description,
        items: selectedRequestItems,
        orderId: order.id,
        type: selectedType,
      });

      if (!result.ok) {
        toaster.error({
          title: t("orderPage.rma.createErrorTitle", {
            defaultValue: "RMA request was not sent",
          }),
          description: t(`orderPage.rma.errors.${result.errorCode}`, {
            defaultValue: t("orderPage.rma.errors.unknown", {
              defaultValue: "Try again or contact support.",
            }),
          }),
        });
        return;
      }

      setDescription("");
      setSelectedItems({});
      toaster.success({
        title: t("orderPage.rma.createSuccessTitle", {
          defaultValue: "RMA request sent",
        }),
        description: t("orderPage.rma.createSuccessDescription", {
          defaultValue: "We will review your request and contact you.",
        }),
      });
    });
  }

  const canSubmit =
    description.trim().length >= 10 && selectedRequestItems.length > 0;

  return (
    <Box
      className={"noprint"}
      mt={["6", "8"]}
      border={"1px solid"}
      borderColor={borderColor}
      borderRadius={"3xl"}
      p={"8"}
    >
      <Text as="h2" fontSize="lg" fontWeight="bold">
        {t("orderPage.rma.heading", { defaultValue: "Returns and claims" })}
      </Text>
      <Text color="gray.fg" mt={2}>
        {t("orderPage.rma.description", {
          defaultValue:
            "Submit a return, exchange, or claim request for this order.",
        })}
      </Text>

      <Separator my={"6"} />

      <Stack gap={4}>
        {loadingRequests ? (
          <Text color="gray.fg">
            {t("orderPage.rma.loading", {
              defaultValue: "Loading RMA requests…",
            })}
          </Text>
        ) : sortedRequests.length > 0 ? (
          <Stack gap={3}>
            {sortedRequests.map((request) => (
              <Box
                key={request.id}
                border={"1px solid"}
                borderColor={borderColor}
                borderRadius={"xl"}
                p={4}
              >
                <HStack gap={2} wrap="wrap">
                  <Badge colorPalette="primary">
                    {t(`RmaRequestStatus.${request.status}`, {
                      defaultValue: request.status,
                    })}
                  </Badge>
                  <Badge variant="subtle">
                    {t(`RmaRequestType.${request.type}`, {
                      defaultValue: request.type,
                    })}
                  </Badge>
                  <Text color="gray.fg" fontSize="sm">
                    {formatDate(request.createdAt, i18n.resolvedLanguage)}
                  </Text>
                </HStack>
                {request.description ? (
                  <Text mt={3}>{request.description}</Text>
                ) : null}
              </Box>
            ))}
          </Stack>
        ) : (
          <Text color="gray.fg">
            {t("orderPage.rma.empty", {
              defaultValue: "No RMA requests have been submitted yet.",
            })}
          </Text>
        )}

        <Separator />

        <Stack gap={4}>
          <Box>
            <Text fontWeight="medium" mb={2}>
              {t("orderPage.rma.typeLabel", {
                defaultValue: "Request type",
              })}
            </Text>
            <SelectRoot
              collection={typeCollection}
              name="rma_type"
              value={[selectedType]}
              onValueChange={(details) => {
                const nextType = details.value[0] as RmaRequestType | undefined;
                setSelectedType(nextType ?? RmaRequestType.CLAIM);
              }}
            >
              <SelectTrigger>
                <SelectValueText
                  placeholder={t("orderPage.rma.typePlaceholder", {
                    defaultValue: "Select request type",
                  })}
                />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((option) => (
                  <SelectItem item={option} key={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectRoot>
          </Box>

          <Box>
            <Text fontWeight="medium" mb={2}>
              {t("orderPage.rma.itemsLabel", {
                defaultValue: "Affected items",
              })}
            </Text>
            <Stack gap={3}>
              {orderItems.map((item) => {
                const selection = selectedItems[item.id];

                return (
                  <Stack key={item.id} gap={2}>
                    <Checkbox.Root
                      checked={selection?.selected ?? false}
                      onCheckedChange={(details) =>
                        updateItemSelection(item, details.checked === true)
                      }
                    >
                      <Checkbox.HiddenInput />
                      <Checkbox.Control />
                      <Checkbox.Label>
                        {item.description || item.product?.name || item.id}
                      </Checkbox.Label>
                    </Checkbox.Root>
                    {selection?.selected ? (
                      <Input
                        type="number"
                        min={1}
                        max={item.quantity}
                        name={`rma_quantity_${item.id}`}
                        autoComplete="off"
                        value={selection.quantity}
                        onChange={(event) =>
                          updateItemQuantity(
                            item,
                            Number(event.currentTarget.value),
                          )
                        }
                        width={{ base: "100%", sm: "160px" }}
                        aria-label={t("orderPage.rma.quantityLabel", {
                          defaultValue: "Affected quantity",
                        })}
                      />
                    ) : null}
                  </Stack>
                );
              })}
            </Stack>
          </Box>

          <Box>
            <Text fontWeight="medium" mb={2}>
              {t("orderPage.rma.descriptionLabel", {
                defaultValue: "What happened?",
              })}
            </Text>
            <Textarea
              value={description}
              name="rma_description"
              autoComplete="off"
              onChange={(event) => setDescription(event.currentTarget.value)}
              minH="120px"
              maxLength={5000}
              placeholder={t("orderPage.rma.descriptionPlaceholder", {
                defaultValue:
                  "Describe the issue, expected resolution, and any details that will help us review the request…",
              })}
            />
            <Text color="gray.fg" fontSize="sm" mt={2}>
              {t("orderPage.rma.descriptionHint", {
                defaultValue: "Minimum 10 characters.",
              })}
            </Text>
          </Box>

          <Button
            alignSelf="flex-start"
            colorPalette="primary"
            disabled={!canSubmit || isSubmitting}
            loading={isSubmitting}
            onClick={handleSubmit}
          >
            {t("orderPage.rma.submit", { defaultValue: "Submit Request" })}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
