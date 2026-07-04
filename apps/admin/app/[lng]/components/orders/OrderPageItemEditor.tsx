"use client";

import { CombinationInput } from "@/components/form/field-controllers/CombinationInput";
import { useT } from "@/i18n/client";
import {
  cloneOrderPageItemEditorValues,
  createOrderPageItemEditorValues,
  hasOrderPageItemEditorChanges,
  type OrderPageItemEditorValues,
} from "./OrderPageItemEditor.helpers";
import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  Separator,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  isNestedCustomer,
  Order,
  OrderItem,
  type PrintingMethodId,
} from "@konfi/types";
import { useEffect, useMemo, useRef } from "react";
import {
  FieldValues,
  FormProvider,
  useFieldArray,
  useForm,
  useWatch,
  UseFieldArrayInsert,
} from "react-hook-form";

interface OrderPageItemEditorProps {
  order: Order;
  itemId: string;
  saving?: boolean;
  onCancel: () => void;
  onSave: (values: {
    items: OrderItem[];
    printingMethods: PrintingMethodId[];
  }) => Promise<void>;
  onAttachmentAdded?: () => Promise<void> | void;
}

export default function OrderPageItemEditor({
  order,
  itemId,
  saving = false,
  onCancel,
  onSave,
  onAttachmentAdded,
}: OrderPageItemEditorProps) {
  const { t } = useT(["order", "translation"]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initialValues = useMemo(
    () => createOrderPageItemEditorValues(order),
    [order],
  );
  const form = useForm<OrderPageItemEditorValues>({
    defaultValues: cloneOrderPageItemEditorValues(initialValues),
  });

  const { insert } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchedItems = useWatch({
    control: form.control,
    name: "items",
  });
  const watchedPrintingMethods = useWatch({
    control: form.control,
    name: "printingMethods",
  });

  useEffect(() => {
    form.reset(cloneOrderPageItemEditorValues(initialValues));
  }, [form, initialValues, itemId]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const rafId = window.requestAnimationFrame(() => {
      node.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [itemId]);

  const selectedIndex = useMemo(
    () =>
      (watchedItems ?? order.items ?? []).findIndex(
        (item) => item.id === itemId,
      ),
    [itemId, order.items, watchedItems],
  );

  const selectedItem =
    selectedIndex >= 0
      ? (watchedItems ?? order.items ?? [])[selectedIndex]
      : null;
  const customerId = isNestedCustomer(order.customer) ? order.customer.id : "";

  const hasChanges = useMemo(
    () =>
      hasOrderPageItemEditorChanges(
        {
          items: watchedItems ?? initialValues.items,
          printingMethods:
            watchedPrintingMethods ?? initialValues.printingMethods,
        },
        initialValues,
      ),
    [initialValues, watchedItems, watchedPrintingMethods],
  );

  if (selectedIndex < 0 || !selectedItem) {
    return null;
  }

  const handleCancel = () => {
    form.reset(cloneOrderPageItemEditorValues(initialValues));
    onCancel();
  };

  const handleSave = async () => {
    await onSave({
      items: form.getValues("items"),
      printingMethods: form.getValues("printingMethods") ?? [],
    });
  };

  return (
    <Box
      ref={containerRef}
      mt={6}
      border="3px solid"
      borderColor={hasChanges ? "primary.solid" : "gray.muted"}
      borderRadius="3xl"
      p={6}
      className="noprint"
    >
      <VStack align="stretch" gap={4}>
        <HStack justify="space-between" align="start" gap={4} flexWrap="wrap">
          <VStack align="start" gap={1}>
            <HStack gap={2} flexWrap="wrap">
              <Heading size="md">
                {t("order.editItem", { defaultValue: "Edit item" })}
              </Heading>
              {hasChanges ? (
                <Badge colorPalette="orange" variant="subtle">
                  {t("order.inlineEdit.unsavedChanges", {
                    defaultValue: "Unsaved changes",
                  })}
                </Badge>
              ) : null}
            </HStack>
            <Text fontSize="sm" color="fg.muted">
              {selectedItem.name || selectedItem.product?.name}
            </Text>
            <Text fontSize="sm" color="fg.muted">
              {t("order.inlineEdit.helper", {
                defaultValue:
                  "Update the item configuration below, then save to apply the changes to this order.",
              })}
            </Text>
          </VStack>
          <HStack gap={3}>
            <Button variant="outline" onClick={handleCancel} disabled={saving}>
              {t("order.inlineEdit.cancelEditing", {
                defaultValue: "Cancel",
              })}
            </Button>
            <Button
              colorPalette="primary"
              onClick={handleSave}
              loading={saving}
              disabled={!hasChanges}
            >
              {t("order.inlineEdit.saveItem", {
                defaultValue: "Save Item",
              })}
            </Button>
          </HStack>
        </HStack>
        <Separator />
        <FormProvider {...form}>
          <CombinationInput
            index={selectedIndex}
            insertAction={
              insert as unknown as UseFieldArrayInsert<FieldValues, string>
            }
            itemId={selectedItem.id}
            allowSaveAsNew={false}
            showConfigurationSaveToast={true}
          />
        </FormProvider>
      </VStack>
    </Box>
  );
}
