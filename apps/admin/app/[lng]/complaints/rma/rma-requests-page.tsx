"use client";

import {
  resolveRmaRequest,
  updateRmaRequestStatus,
} from "@/actions/complaints";
import ChannelsSelect from "@/components/layout/ChannelsSelect";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  HStack,
  Input,
  Separator,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import {
  ButtonLink,
  CustomHeading,
  MaterialSymbol,
  RefreshButton,
  toaster,
} from "@konfi/components";
import type { RmaRequest } from "@konfi/types";
import { RmaRequestStatus, RmaResolutionType } from "@konfi/types";
import {
  ADMIN_ORDERS,
  RMA_REQUESTS_COLLECTION,
  getNextRmaRequestStatuses,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import {
  collection,
  type DocumentData,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  query as firestoreQuery,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { Route } from "next";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";

const PAGE_SIZE = 50;
const RESOLUTION_TYPES = [
  RmaResolutionType.REMAKE,
  RmaResolutionType.REPLACE,
  RmaResolutionType.REPAIR,
  RmaResolutionType.REFUND,
  RmaResolutionType.CREDIT,
  RmaResolutionType.REJECT,
] as const;

interface ResolutionDraft {
  amount: string;
  dispatchProviderRefund: boolean;
  notes: string;
  type: RmaResolutionType;
}

function getRmaRequestFromSnapshot(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): RmaRequest {
  return {
    id: snapshot.id,
    ...snapshot.data(),
  } as RmaRequest;
}

function getStatusColor(status: RmaRequestStatus): string {
  if (status === RmaRequestStatus.NEW) return "blue";
  if (status === RmaRequestStatus.UNDER_REVIEW) return "yellow";
  if (status === RmaRequestStatus.APPROVED) return "success";
  if (status === RmaRequestStatus.REJECTED) return "red";
  if (status === RmaRequestStatus.COMPLETED) return "success";
  return "gray";
}

function formatDate(value: RmaRequest["createdAt"], locale: string): string {
  return new Intl.DateTimeFormat(locale).format(value.toDate());
}

function parseAmountToMinorUnits(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) {
    return 0;
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.round(parsed * 100);
}

function resolutionNeedsAmount(type: RmaResolutionType): boolean {
  return type === RmaResolutionType.CREDIT || type === RmaResolutionType.REFUND;
}

export default function RmaRequestsPage() {
  const { t, i18n } = useT(["orders", "translation"]);
  const resolvedLanguage = i18n.resolvedLanguage ?? "pl";
  const { channel } = useChannels();
  const [requests, setRequests] = useState<RmaRequest[]>([]);
  const [resolutionDrafts, setResolutionDrafts] = useState<
    Record<string, ResolutionDraft>
  >({});
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadRequests = useCallback(async () => {
    if (!channel) {
      setRequests([]);
      return;
    }

    setLoading(true);
    try {
      const requestsRef = collection(
        firestore,
        `channels/${channel.id}/${RMA_REQUESTS_COLLECTION}`,
      );
      const snapshot = await getDocs(
        firestoreQuery(
          requestsRef,
          orderBy("createdAt", "desc"),
          firestoreLimit(PAGE_SIZE),
        ),
      );
      setRequests(
        snapshot.docs
          .map(getRmaRequestFromSnapshot)
          .filter((request) => request.active !== false),
      );
    } catch (error) {
      console.error("Failed to load RMA requests:", error);
      toaster.error({
        title: t("rmaRequests.loadFailed.title", {
          defaultValue: "RMA requests were not loaded",
        }),
        description: t("rmaRequests.loadFailed.description", {
          defaultValue: "Check the selected channel and try again.",
        }),
      });
    } finally {
      setLoading(false);
    }
  }, [channel, t]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const stats = useMemo(
    () => ({
      active: requests.filter(
        (request) =>
          request.status !== RmaRequestStatus.COMPLETED &&
          request.status !== RmaRequestStatus.CANCELED &&
          request.status !== RmaRequestStatus.REJECTED,
      ).length,
      approved: requests.filter(
        (request) => request.status === RmaRequestStatus.APPROVED,
      ).length,
      total: requests.length,
    }),
    [requests],
  );

  const transitionStatus = (
    request: RmaRequest,
    nextStatus: RmaRequestStatus,
  ) => {
    if (!channel) return;

    setUpdatingId(request.id);
    startTransition(() => {
      void (async () => {
        try {
          await updateRmaRequestStatus({
            channelId: channel.id,
            rmaRequestId: request.id,
            status: nextStatus,
          });
          toaster.success({
            title: t("rmaRequests.statusSaved.title", {
              defaultValue: "RMA status updated",
            }),
            description: t("rmaRequests.statusSaved.description", {
              defaultValue: "The request is ready for the next review step.",
            }),
          });
          await loadRequests();
        } catch (error) {
          console.error("Failed to update RMA request status:", error);
          toaster.error({
            title: t("rmaRequests.statusFailed.title", {
              defaultValue: "RMA status was not updated",
            }),
            description:
              error instanceof Error
                ? error.message
                : t("rmaRequests.statusFailed.description", {
                    defaultValue: "Check the request and try again.",
                  }),
          });
        } finally {
          setUpdatingId(null);
        }
      })();
    });
  };

  const getResolutionDraft = (request: RmaRequest): ResolutionDraft =>
    resolutionDrafts[request.id] ?? {
      amount: request.resolution?.amount
        ? String(request.resolution.amount / 100)
        : "",
      dispatchProviderRefund: false,
      notes: request.resolution?.notes ?? "",
      type: request.resolution?.type ?? RmaResolutionType.REMAKE,
    };

  const updateResolutionDraft = (
    request: RmaRequest,
    patch: Partial<ResolutionDraft>,
  ) => {
    setResolutionDrafts((current) => ({
      ...current,
      [request.id]: {
        ...getResolutionDraft(request),
        ...patch,
      },
    }));
  };

  const applyResolution = (request: RmaRequest) => {
    if (!channel) return;

    const draft = getResolutionDraft(request);
    const amount = parseAmountToMinorUnits(draft.amount);

    if (resolutionNeedsAmount(draft.type) && amount <= 0) {
      toaster.error({
        title: t("rmaRequests.resolution.amountRequired.title", {
          defaultValue: "Amount is required",
        }),
        description: t("rmaRequests.resolution.amountRequired.description", {
          defaultValue: "Refund and store credit outcomes need an amount.",
        }),
      });
      return;
    }

    setUpdatingId(request.id);
    startTransition(() => {
      void (async () => {
        try {
          const result = await resolveRmaRequest({
            amount,
            channelId: channel.id,
            dispatchProviderRefund: draft.dispatchProviderRefund,
            notes: draft.notes,
            resolutionType: draft.type,
            rmaRequestId: request.id,
          });
          const providerRefundMessage =
            draft.dispatchProviderRefund &&
            result.providerRefundStatus === "FAILED"
              ? t("rmaRequests.resolution.providerRefundFailed", {
                  defaultValue:
                    "The RMA was saved, but provider refund dispatch failed: {{error}}",
                  error:
                    result.providerRefundError ??
                    t("rmaRequests.resolution.providerRefundUnknownError", {
                      defaultValue: "Unknown provider error",
                    }),
                })
              : draft.dispatchProviderRefund
                ? t("rmaRequests.resolution.providerRefundRequested", {
                    defaultValue:
                      "Provider refund dispatch was requested. Check the payment audit for the final provider status.",
                  })
                : undefined;
          const fulfillmentRequestMessage =
            result.fulfillmentRequestStatus === "FAILED"
              ? t("rmaRequests.resolution.fulfillmentRequestFailed", {
                  defaultValue:
                    "The RMA was saved, but fulfillment request processing failed: {{error}}",
                  error:
                    result.fulfillmentRequestError ??
                    t("rmaRequests.resolution.fulfillmentRequestUnknownError", {
                      defaultValue: "Unknown fulfillment error",
                    }),
                })
              : result.fulfillmentRequestStatus === "COMPLETED"
                ? t("rmaRequests.resolution.fulfillmentRequestProcessed", {
                    count: result.fulfillmentRequestCreatedCount ?? 0,
                    defaultValue:
                      "{{count}} fulfillment request was created for the linked order.",
                  })
                : undefined;

          if (result.fulfillmentRequestStatus === "FAILED") {
            toaster.warning({
              title: t(
                "rmaRequests.resolution.savedWithFulfillmentWarning.title",
                {
                  defaultValue: "RMA saved, fulfillment not processed",
                },
              ),
              description: fulfillmentRequestMessage,
            });
          } else if (result.providerRefundStatus === "FAILED") {
            toaster.warning({
              title: t("rmaRequests.resolution.savedWithRefundWarning.title", {
                defaultValue: "RMA saved, refund not dispatched",
              }),
              description: providerRefundMessage,
            });
          } else {
            toaster.success({
              title: t("rmaRequests.resolution.saved.title", {
                defaultValue: "RMA resolution saved",
              }),
              description:
                providerRefundMessage ??
                fulfillmentRequestMessage ??
                t("rmaRequests.resolution.saved.description", {
                  defaultValue:
                    "The resolution has been linked to the request audit trail.",
                }),
            });
          }
          await loadRequests();
        } catch (error) {
          console.error("Failed to resolve RMA request:", error);
          toaster.error({
            title: t("rmaRequests.resolution.failed.title", {
              defaultValue: "RMA resolution was not saved",
            }),
            description:
              error instanceof Error
                ? error.message
                : t("rmaRequests.resolution.failed.description", {
                    defaultValue: "Check the request and try again.",
                  }),
          });
        } finally {
          setUpdatingId(null);
        }
      })();
    });
  };

  return (
    <Stack gap={6} pb={4}>
      <CustomHeading
        heading={t("rmaRequests.title", {
          defaultValue: "RMA Requests",
        })}
        mb={2}
        breadcrumb
        channelsSwitch={<ChannelsSelect />}
        goBack
        t={t}
      />

      <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
        <Card.Root>
          <Card.Body>
            <Text color="fg.muted" fontSize="sm">
              {t("rmaRequests.stats.total", { defaultValue: "Total" })}
            </Text>
            <Text fontSize="2xl" fontWeight="bold">
              {stats.total}
            </Text>
          </Card.Body>
        </Card.Root>
        <Card.Root>
          <Card.Body>
            <Text color="fg.muted" fontSize="sm">
              {t("rmaRequests.stats.active", { defaultValue: "Active" })}
            </Text>
            <Text fontSize="2xl" fontWeight="bold">
              {stats.active}
            </Text>
          </Card.Body>
        </Card.Root>
        <Card.Root>
          <Card.Body>
            <Text color="fg.muted" fontSize="sm">
              {t("rmaRequests.stats.approved", { defaultValue: "Approved" })}
            </Text>
            <Text fontSize="2xl" fontWeight="bold">
              {stats.approved}
            </Text>
          </Card.Body>
        </Card.Root>
      </SimpleGrid>

      <HStack justify="space-between" gap={3} flexWrap="wrap">
        <Box minW={0}>
          <Text fontWeight="medium">
            {t("rmaRequests.queue.title", {
              defaultValue: "Review Queue",
            })}
          </Text>
          <Text color="fg.muted" fontSize="sm">
            {t("rmaRequests.queue.description", {
              defaultValue:
                "Review structured returns, exchanges, and claims for the selected channel.",
            })}
          </Text>
        </Box>
        <RefreshButton
          label={t("rmaRequests.refresh", {
            defaultValue: "Refresh RMA requests",
          })}
          refreshFunction={loadRequests}
        />
      </HStack>

      <Separator />

      <Skeleton loading={loading}>
        {requests.length > 0 ? (
          <Stack gap={4}>
            {requests.map((request) => {
              const nextStatuses = getNextRmaRequestStatuses(
                request.status,
              ).filter((status) => status !== request.status);
              const isUpdating = isPending && updatingId === request.id;
              const canResolve =
                request.status !== RmaRequestStatus.COMPLETED &&
                request.status !== RmaRequestStatus.CANCELED;
              const resolutionDraft = getResolutionDraft(request);
              const needsAmount = resolutionNeedsAmount(resolutionDraft.type);

              return (
                <Card.Root key={request.id} variant="outline">
                  <Card.Body>
                    <Stack gap={4}>
                      <HStack justify="space-between" gap={3} flexWrap="wrap">
                        <HStack gap={3} minW={0}>
                          <Badge colorPalette={getStatusColor(request.status)}>
                            {t(`rmaRequests.status.${request.status}`, {
                              defaultValue: request.status,
                            })}
                          </Badge>
                          <Badge variant="subtle">
                            {t(`rmaRequests.type.${request.type}`, {
                              defaultValue: request.type,
                            })}
                          </Badge>
                          <Text fontWeight="medium" minW={0} truncate>
                            #{request.id}
                          </Text>
                        </HStack>
                        <Text color="fg.muted" fontSize="sm">
                          {formatDate(request.createdAt, resolvedLanguage)}
                        </Text>
                      </HStack>

                      <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
                        <Box minW={0}>
                          <Text color="fg.muted" fontSize="sm">
                            {t("rmaRequests.fields.order", {
                              defaultValue: "Order",
                            })}
                          </Text>
                          <ButtonLink
                            ariaLabel={t("rmaRequests.openOrder", {
                              defaultValue: "Open Order",
                            })}
                            href={`${ADMIN_ORDERS}/${request.orderId}` as Route}
                            lng={resolvedLanguage}
                          >
                            {request.orderId}
                            <MaterialSymbol>open_in_new</MaterialSymbol>
                          </ButtonLink>
                        </Box>
                        <Box minW={0}>
                          <Text color="fg.muted" fontSize="sm">
                            {t("rmaRequests.fields.complaint", {
                              defaultValue: "Complaint",
                            })}
                          </Text>
                          {request.complaintId ? (
                            <ButtonLink
                              ariaLabel={t("rmaRequests.openComplaint", {
                                defaultValue: "Open Complaint",
                              })}
                              href={
                                `/complaints/${request.complaintId}` as Route
                              }
                              lng={resolvedLanguage}
                            >
                              {request.complaintId}
                              <MaterialSymbol>open_in_new</MaterialSymbol>
                            </ButtonLink>
                          ) : (
                            <Text color="fg.muted">
                              {t("rmaRequests.noComplaint", {
                                defaultValue: "No complaint link",
                              })}
                            </Text>
                          )}
                        </Box>
                        <Box minW={0}>
                          <Text color="fg.muted" fontSize="sm">
                            {t("rmaRequests.fields.items", {
                              defaultValue: "Items",
                            })}
                          </Text>
                          <Text>{request.items.length}</Text>
                        </Box>
                      </SimpleGrid>

                      {request.description ? (
                        <Text color="fg.muted" lineClamp={2}>
                          {request.description}
                        </Text>
                      ) : null}

                      <Stack gap={3}>
                        <HStack justify="space-between" gap={3} flexWrap="wrap">
                          <Box>
                            <Text fontWeight="medium">
                              {t("rmaRequests.resolution.title", {
                                defaultValue: "Resolution",
                              })}
                            </Text>
                            <Text color="fg.muted" fontSize="sm">
                              {request.resolution
                                ? t("rmaRequests.resolution.current", {
                                    defaultValue: "Current outcome: {{type}}",
                                    type: t(
                                      `rmaRequests.resolution.type.${request.resolution.type}`,
                                      {
                                        defaultValue: request.resolution.type,
                                      },
                                    ),
                                  })
                                : t("rmaRequests.resolution.notSet", {
                                    defaultValue:
                                      "Choose a structured outcome before closing the request.",
                                  })}
                            </Text>
                          </Box>
                          {request.resolutionEventIds?.length ? (
                            <Badge variant="subtle">
                              {t("rmaRequests.resolution.auditCount", {
                                count: request.resolutionEventIds.length,
                                defaultValue: "{{count}} audit record",
                              })}
                            </Badge>
                          ) : null}
                          {request.replacementOrderIds?.length ? (
                            <Badge colorPalette="blue" variant="subtle">
                              {t("rmaRequests.resolution.replacementCount", {
                                count: request.replacementOrderIds.length,
                                defaultValue: "{{count}} linked order",
                              })}
                            </Badge>
                          ) : null}
                        </HStack>

                        {canResolve ? (
                          <Stack gap={3}>
                            <HStack gap={2} flexWrap="wrap">
                              {RESOLUTION_TYPES.map((type) => (
                                <Button
                                  key={type}
                                  colorPalette={
                                    resolutionDraft.type === type
                                      ? "primary"
                                      : undefined
                                  }
                                  onClick={() =>
                                    updateResolutionDraft(request, { type })
                                  }
                                  size="sm"
                                  variant={
                                    resolutionDraft.type === type
                                      ? "solid"
                                      : "outline"
                                  }
                                >
                                  {t(`rmaRequests.resolution.type.${type}`, {
                                    defaultValue: type,
                                  })}
                                </Button>
                              ))}
                            </HStack>
                            {needsAmount ? (
                              <Stack gap={2} align="flex-start">
                                <Input
                                  inputMode="decimal"
                                  maxW="220px"
                                  onChange={(event) =>
                                    updateResolutionDraft(request, {
                                      amount: event.currentTarget.value,
                                    })
                                  }
                                  placeholder={t(
                                    "rmaRequests.resolution.amountPlaceholder",
                                    {
                                      defaultValue: "Amount, e.g. 25.00",
                                    },
                                  )}
                                  value={resolutionDraft.amount}
                                />
                                {resolutionDraft.type ===
                                RmaResolutionType.REFUND ? (
                                  <Checkbox.Root
                                    checked={
                                      resolutionDraft.dispatchProviderRefund
                                    }
                                    onCheckedChange={(details) =>
                                      updateResolutionDraft(request, {
                                        dispatchProviderRefund:
                                          details.checked === true,
                                      })
                                    }
                                  >
                                    <Checkbox.HiddenInput />
                                    <Checkbox.Control />
                                    <Checkbox.Label>
                                      {t(
                                        "rmaRequests.resolution.dispatchProviderRefund",
                                        {
                                          defaultValue:
                                            "Dispatch provider refund now",
                                        },
                                      )}
                                    </Checkbox.Label>
                                  </Checkbox.Root>
                                ) : null}
                              </Stack>
                            ) : null}
                            <Textarea
                              onChange={(event) =>
                                updateResolutionDraft(request, {
                                  notes: event.currentTarget.value,
                                })
                              }
                              placeholder={t(
                                "rmaRequests.resolution.notesPlaceholder",
                                {
                                  defaultValue:
                                    "Optional resolution notes for the audit trail",
                                },
                              )}
                              value={resolutionDraft.notes}
                            />
                            <Button
                              alignSelf="flex-start"
                              colorPalette="primary"
                              loading={isUpdating}
                              onClick={() => applyResolution(request)}
                              size="sm"
                            >
                              {t("rmaRequests.resolution.apply", {
                                defaultValue: "Apply resolution",
                              })}
                            </Button>
                          </Stack>
                        ) : null}
                      </Stack>

                      <HStack gap={2} flexWrap="wrap">
                        {nextStatuses.length > 0 ? (
                          nextStatuses.map((status) => (
                            <Button
                              key={status}
                              loading={isUpdating}
                              onClick={() => transitionStatus(request, status)}
                              size="sm"
                              variant="outline"
                            >
                              {t(`rmaRequests.actions.${status}`, {
                                defaultValue: status,
                              })}
                            </Button>
                          ))
                        ) : (
                          <Text color="fg.muted" fontSize="sm">
                            {t("rmaRequests.noActions", {
                              defaultValue:
                                "This request has no available status actions.",
                            })}
                          </Text>
                        )}
                      </HStack>
                    </Stack>
                  </Card.Body>
                </Card.Root>
              );
            })}
          </Stack>
        ) : (
          <Card.Root>
            <Card.Body>
              <Stack align="center" gap={3} py={8} textAlign="center">
                <MaterialSymbol>assignment_return</MaterialSymbol>
                <Text fontWeight="medium">
                  {t("rmaRequests.empty.title", {
                    defaultValue: "No RMA requests",
                  })}
                </Text>
                <Text color="fg.muted" maxW="md">
                  {t("rmaRequests.empty.description", {
                    defaultValue:
                      "Create a structured RMA claim from a complaint to start the review workflow.",
                  })}
                </Text>
              </Stack>
            </Card.Body>
          </Card.Root>
        )}
      </Skeleton>
    </Stack>
  );
}
