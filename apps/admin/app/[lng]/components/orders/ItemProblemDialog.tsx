"use client";

import { useT } from "@/i18n/client";
import {
  Button,
  Checkbox,
  Dialog,
  Flex,
  Textarea,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol, toaster } from "@konfi/components";
import { ItemProblem, OrderItem } from "@konfi/types";
import { Timestamp } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

interface ItemProblemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderItem: OrderItem | null;
  existingProblem?: ItemProblem;
  onSubmit: (problem: ItemProblem | null) => void;
}

export function ItemProblemDialog({
  open,
  onOpenChange,
  orderItem,
  existingProblem,
  onSubmit,
}: ItemProblemDialogProps) {
  const { t } = useT(["order", "translation"]);
  const [description, setDescription] = useState("");
  const [resolved, setResolved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when dialog opens with existing problem
  useEffect(() => {
    if (open) {
      if (existingProblem) {
        setDescription(existingProblem.description);
        setResolved(existingProblem.resolved);
      } else {
        setDescription("");
        setResolved(false);
      }
    }
  }, [open, existingProblem]);

  const handleSubmit = useCallback(async () => {
    if (!orderItem) return;

    // Always require a description when creating or updating problems
    if (!description.trim()) {
      toaster.create({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("order.problemDescriptionRequired", {
          defaultValue: "Please enter a problem description",
        }),
        type: "error",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Handle resolvedAt timestamp:
      // - Set it when transitioning from unresolved to resolved
      // - Keep existing if staying resolved
      // - Clear it (undefined) when transitioning from resolved to unresolved
      let resolvedAt: ReturnType<typeof Timestamp.now> | undefined;
      if (resolved) {
        resolvedAt =
          existingProblem?.resolved && existingProblem?.resolvedAt
            ? existingProblem.resolvedAt
            : Timestamp.now();
      }

      const problem: ItemProblem = {
        itemId: orderItem.id,
        description: description.trim(),
        resolved,
        createdAt: existingProblem?.createdAt ?? Timestamp.now(),
        ...(resolvedAt ? { resolvedAt } : {}),
      };

      onSubmit(problem);
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving problem:", error);
      toaster.create({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("order.problemSaveError", {
          defaultValue: "Failed to save problem",
        }),
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    orderItem,
    description,
    resolved,
    existingProblem,
    t,
    onSubmit,
    onOpenChange,
  ]);

  const handleRemoveProblem = useCallback(() => {
    if (!orderItem) return;
    onSubmit(null);
    onOpenChange(false);
  }, [orderItem, onSubmit, onOpenChange]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => onOpenChange(details.open)}
      size="lg"
    >
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header alignContent="center">
            <MaterialSymbol>error</MaterialSymbol>
            <Dialog.Title>
              {existingProblem
                ? t("order.editItemProblem", {
                    defaultValue: "Edit Problem with Position",
                  })
                : t("order.reportItemProblem", {
                    defaultValue: "Report Problem with Position",
                  })}
            </Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <VStack gap={4} align="stretch">
              <Text>
                {t("order.problemDescription", {
                  defaultValue:
                    "Describe the problem with this order item. This will be visible on the order and orders list.",
                })}
              </Text>
              <VStack align="stretch" gap={2}>
                <Text fontWeight="medium">
                  {t("admin.orderItem", { defaultValue: "Order Item" })}:
                </Text>
                <Text color="fg.muted">
                  {orderItem?.product?.name || orderItem?.name || "-"}
                </Text>
              </VStack>
              <VStack align="stretch" gap={2}>
                <Text fontWeight="medium">
                  {t("order.problemDescriptionLabel", {
                    defaultValue: "Problem Description",
                  })}
                  *
                </Text>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("order.problemDescriptionPlaceholder", {
                    defaultValue:
                      "E.g., Wrong file format, missing bleed, incorrect colors...",
                  })}
                  rows={4}
                  resize="vertical"
                  borderRadius="3xl"
                />
              </VStack>
              {existingProblem && (
                <Checkbox.Root
                  checked={resolved}
                  onCheckedChange={(e) => setResolved(!!e.checked)}
                >
                  <Checkbox.HiddenInput />
                  <Checkbox.Control>
                    <Checkbox.Indicator>
                      <MaterialSymbol>check</MaterialSymbol>
                    </Checkbox.Indicator>
                  </Checkbox.Control>
                  <Checkbox.Label>
                    {t("order.markProblemResolved", {
                      defaultValue: "Mark as resolved",
                    })}
                  </Checkbox.Label>
                </Checkbox.Root>
              )}
            </VStack>
          </Dialog.Body>
          <Dialog.Footer>
            <Flex gap={3} width="100%" justifyContent="space-between">
              <Flex>
                {existingProblem && (
                  <Button
                    variant="ghost"
                    colorPalette="red"
                    onClick={handleRemoveProblem}
                    disabled={isSubmitting}
                  >
                    <MaterialSymbol>delete</MaterialSymbol>
                    {t("order.removeProblem", {
                      defaultValue: "Remove Problem",
                    })}
                  </Button>
                )}
              </Flex>
              <Flex gap={3}>
                <Dialog.ActionTrigger asChild>
                  <Button variant="outline" onClick={handleCancel}>
                    {t("common.cancel", { defaultValue: "Cancel" })}
                  </Button>
                </Dialog.ActionTrigger>
                <Button
                  colorPalette={resolved ? "success" : "red"}
                  onClick={handleSubmit}
                  disabled={isSubmitting || !description.trim()}
                  loading={isSubmitting}
                >
                  <MaterialSymbol>
                    {resolved ? "check_circle" : "error"}
                  </MaterialSymbol>
                  {existingProblem
                    ? resolved
                      ? t("order.saveProblemResolved", {
                          defaultValue: "Save as Resolved",
                        })
                      : t("order.updateProblem", {
                          defaultValue: "Update Problem",
                        })
                    : t("order.reportProblem", {
                        defaultValue: "Report Problem",
                      })}
                </Button>
              </Flex>
            </Flex>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
