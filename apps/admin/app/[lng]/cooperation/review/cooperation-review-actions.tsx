"use client";

import { useT } from "@/i18n/client";
import type {
  ProductionCooperationActionResult,
  ProductionCooperationActionResultCode,
} from "@/lib/production-cooperation/types";
import {
  Alert,
  Button,
  Card,
  Field,
  HStack,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

async function postAction(
  action: "accept" | "decline",
  body: {
    declineReason?: string;
    lng: string;
    requestId?: string;
    token?: string;
  },
): Promise<ProductionCooperationActionResult> {
  const response = await fetch(`/api/production-cooperation/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return {
      code: "unavailable",
      message: response.ok
        ? "The cooperation service returned an empty response."
        : "The cooperation service returned an unexpected response.",
    };
  }

  let result: ProductionCooperationActionResult;
  try {
    result = (await response.json()) as ProductionCooperationActionResult;
  } catch (error) {
    console.error("Could not parse production cooperation response", error);
    return {
      code: "unavailable",
      message: "The cooperation service returned an invalid response.",
    };
  }

  if (!response.ok) {
    return result;
  }

  return result;
}

async function postCallbackRetry(
  requestId: string,
): Promise<ProductionCooperationActionResult> {
  const response = await fetch("/api/production-cooperation/callback/retry", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requestId }),
  });

  if (!response.ok) {
    return {
      code: "unavailable",
      message: "The cooperation callback could not be retried.",
    };
  }

  return (await response.json()) as ProductionCooperationActionResult;
}

function statusHref(params: {
  code: ProductionCooperationActionResultCode;
  lng: string;
  requestId?: string;
}) {
  const searchParams = new URLSearchParams({ code: params.code });

  if (params.requestId) {
    searchParams.set("requestId", params.requestId);
  }

  return `/${params.lng}/cooperation/status?${searchParams.toString()}` as Route;
}

export function CooperationReviewActions({
  callbackStatus,
  lng,
  requestId,
  token,
}: {
  callbackStatus?: ProductionCooperationActionResult["callbackStatus"];
  lng: string;
  requestId?: string;
  token?: string;
}) {
  const { t } = useT();
  const router = useRouter();
  const [declineReason, setDeclineReason] = useState("");
  const [pendingAction, setPendingAction] = useState<
    "accept" | "decline" | "retry" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const submit = (action: "accept" | "decline") => {
    if (pendingAction) {
      return;
    }

    setError(null);
    setPendingAction(action);

    startTransition(() => {
      void postAction(action, {
        lng,
        declineReason: action === "decline" ? declineReason : undefined,
        requestId,
        token,
      })
        .then((result) => {
          router.push(
            statusHref({
              code: result.code,
              lng,
              requestId: result.requestId,
            }),
          );
        })
        .catch((submitError: unknown) => {
          console.error("Production cooperation action failed", submitError);
          setError(
            t("productionCooperation.actionSubmitError", {
              defaultValue:
                "The action could not be completed. Refresh the request and try again.",
            }),
          );
        })
        .finally(() => {
          setPendingAction(null);
        });
    });
  };

  const retryCallback = () => {
    if (pendingAction || !requestId) {
      return;
    }

    setError(null);
    setPendingAction("retry");

    startTransition(() => {
      void postCallbackRetry(requestId)
        .then((result) => {
          router.push(
            statusHref({
              code: result.code,
              lng,
              requestId: result.requestId,
            }),
          );
        })
        .catch((retryError: unknown) => {
          console.error(
            "Production cooperation callback retry failed",
            retryError,
          );
          setError(
            t("productionCooperation.callbackRetryError", {
              defaultValue:
                "The Cloud sync could not be retried. Check the callback configuration and try again.",
            }),
          );
        })
        .finally(() => {
          setPendingAction(null);
        });
    });
  };

  return (
    <Card.Root variant="outline">
      <Card.Body>
        <VStack align="stretch" gap={4}>
          <Text fontWeight="semibold">
            {t("productionCooperation.review.decisionTitle", {
              defaultValue: "Review Decision",
            })}
          </Text>
          {error ? (
            <Alert.Root status="error" aria-live="polite">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>
                  {t("common.error", { defaultValue: "Error!" })}
                </Alert.Title>
                <Alert.Description>{error}</Alert.Description>
              </Alert.Content>
            </Alert.Root>
          ) : null}
          <Field.Root>
            <Field.Label>
              {t("productionCooperation.review.declineReason", {
                defaultValue: "Decline Reason",
              })}
            </Field.Label>
            <Textarea
              name="declineReason"
              value={declineReason}
              onChange={(event) => setDeclineReason(event.target.value)}
              placeholder={t(
                "productionCooperation.review.declineReasonPlaceholder",
                {
                  defaultValue: "Add a short note for the sender…",
                },
              )}
              rows={3}
            />
          </Field.Root>
          <HStack gap={3} flexWrap="wrap">
            <Button
              colorPalette="primary"
              loading={pendingAction === "accept"}
              disabled={Boolean(pendingAction)}
              onClick={() => submit("accept")}
            >
              <MaterialSymbol>check_circle</MaterialSymbol>
              {t("productionCooperation.review.accept", {
                defaultValue: "Accept Request",
              })}
            </Button>
            <Button
              variant="outline"
              colorPalette="red"
              loading={pendingAction === "decline"}
              disabled={Boolean(pendingAction)}
              onClick={() => submit("decline")}
            >
              <MaterialSymbol>cancel</MaterialSymbol>
              {t("productionCooperation.review.decline", {
                defaultValue: "Decline Request",
              })}
            </Button>
            {callbackStatus === "FAILED" ? (
              <Button
                variant="outline"
                loading={pendingAction === "retry"}
                disabled={Boolean(pendingAction)}
                onClick={retryCallback}
              >
                <MaterialSymbol>sync</MaterialSymbol>
                {t("productionCooperation.review.retrySync", {
                  defaultValue: "Retry Cloud Sync",
                })}
              </Button>
            ) : null}
          </HStack>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}
