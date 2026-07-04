"use client";

import {
  Alert,
  Badge,
  Box,
  Button,
  createListCollection,
  Fieldset,
  HStack,
  Input,
  Presence,
  Select,
  Separator,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { Field } from "@konfi/components";
import type {
  Department,
  Warehouse as FakturowniaWarehouse,
} from "@konfi/fakturownia/out/client/models";
import { formatTotal } from "@konfi/utils";
import { Controller, useFormContext } from "react-hook-form";
import { useT } from "@/i18n/client";
import { formatDisplayTotal } from "./invoice-form-position-builder";
import type { InvoiceFormValues } from "./invoice-form-types";

interface FakturowniaInvoiceAdditionalSectionProps {
  fakturowniaWarehouses: FakturowniaWarehouse[] | null;
  fakturowniaDepartments: Department[] | null;
  shouldShowDepartmentAlert: boolean;
  handleRefreshDictionaries: () => void;
  isDictionariesLoading: boolean;
  defaultOid?: string;
  hasAnyDiscount: boolean;
  undiscountedTotals: {
    net: number;
    gross: number;
  };
  totals: {
    net: number;
    gross: number;
  };
  paidAmount: number;
  totalDiscountAmount: number;
}

export function FakturowniaInvoiceAdditionalSection({
  fakturowniaWarehouses,
  fakturowniaDepartments,
  shouldShowDepartmentAlert,
  handleRefreshDictionaries,
  isDictionariesLoading,
  defaultOid,
  hasAnyDiscount,
  undiscountedTotals,
  totals,
  paidAmount,
  totalDiscountAmount,
}: FakturowniaInvoiceAdditionalSectionProps) {
  const { t } = useT(["fakturownia", "translation"]);
  const { control } = useFormContext<InvoiceFormValues>();

  return (
    <Fieldset.Root>
      <Fieldset.Legend fontSize={"xl"}>
        {t("fakturownia.invoiceCreate.additional", {
          defaultValue: "Additional information",
        })}
      </Fieldset.Legend>
      <Fieldset.Content>
        <VStack gap={4} align="stretch">
          <Field
            label={t("fakturownia.invoiceCreate.notes", {
              defaultValue: "Notes",
            })}
          >
            <Controller
              name="notes"
              control={control}
              render={({ field }) => (
                <Textarea
                  borderRadius="3xl"
                  rows={3}
                  {...field}
                  value={field.value ?? ""}
                />
              )}
            />
          </Field>

          <HStack gap={4} alignItems="flex-end">
            {fakturowniaWarehouses && fakturowniaWarehouses.length > 0 && (
              <Field
                label={t("fakturownia.invoiceCreate.fakturowniaWarehouse", {
                  defaultValue: "Fakturownia warehouse",
                })}
              >
                <Controller
                  name="warehouseId"
                  control={control}
                  render={({ field }) => {
                    const warehouseCollection = createListCollection({
                      items: fakturowniaWarehouses.map((warehouse) => ({
                        value: warehouse.id ? String(warehouse.id) : "",
                        label: warehouse.name || `#${warehouse.id}`,
                      })),
                    });
                    return (
                      <Select.Root
                        collection={warehouseCollection}
                        value={field.value ? [field.value] : []}
                        onValueChange={({ value }) => field.onChange(value[0])}
                      >
                        <Select.HiddenSelect />
                        <Select.Control>
                          <Select.Trigger>
                            <Select.ValueText
                              placeholder={t(
                                "fakturownia.invoiceCreate.selectWarehouse",
                                { defaultValue: "Select warehouse" },
                              )}
                            />
                          </Select.Trigger>
                          <Select.IndicatorGroup>
                            <Select.Indicator />
                          </Select.IndicatorGroup>
                        </Select.Control>
                        <Select.Positioner>
                          <Select.Content>
                            {warehouseCollection.items.map((item) => (
                              <Select.Item key={item.value} item={item}>
                                {item.label}
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select.Positioner>
                      </Select.Root>
                    );
                  }}
                />
              </Field>
            )}
            {fakturowniaDepartments && fakturowniaDepartments.length > 0 && (
              <Field
                label={t("fakturownia.invoiceCreate.fakturowniaDepartment", {
                  defaultValue: "Department",
                })}
              >
                <Controller
                  name="departmentId"
                  control={control}
                  render={({ field }) => {
                    const departmentCollection = createListCollection({
                      items: fakturowniaDepartments.map((department) => ({
                        value: department.id ? String(department.id) : "",
                        label: department.shortcut || `#${department.id}`,
                      })),
                    });
                    return (
                      <Select.Root
                        collection={departmentCollection}
                        value={field.value ? [field.value] : []}
                        onValueChange={({ value }) => field.onChange(value[0])}
                      >
                        <Select.HiddenSelect />
                        <Select.Control>
                          <Select.Trigger>
                            <Select.ValueText
                              placeholder={t(
                                "fakturownia.invoiceCreate.selectDepartment",
                                { defaultValue: "Select department" },
                              )}
                            />
                          </Select.Trigger>
                          <Select.IndicatorGroup>
                            <Select.Indicator />
                          </Select.IndicatorGroup>
                        </Select.Control>
                        <Select.Positioner>
                          <Select.Content>
                            {departmentCollection.items.map((item) => (
                              <Select.Item key={item.value} item={item}>
                                {item.label}
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select.Positioner>
                      </Select.Root>
                    );
                  }}
                />
              </Field>
            )}
            {shouldShowDepartmentAlert && (
              <Alert.Root status="warning" variant="subtle">
                <Alert.Indicator />
                <Alert.Content>
                  <VStack align="start" gap={2}>
                    <Alert.Title>
                      {t("fakturownia.invoiceCreate.departmentRequiredTitle", {
                        defaultValue: "Department required",
                      })}
                    </Alert.Title>
                    <Alert.Description>
                      {t(
                        "fakturownia.invoiceCreate.departmentRequiredDescription",
                        {
                          defaultValue:
                            "Select a department before creating the document. If departments are missing, refresh the data or reload the page.",
                        },
                      )}
                    </Alert.Description>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={handleRefreshDictionaries}
                      loading={isDictionariesLoading}
                    >
                      {t(
                        "fakturownia.invoiceCreate.departmentRequiredRefresh",
                        { defaultValue: "Refresh departments" },
                      )}
                    </Button>
                  </VStack>
                </Alert.Content>
              </Alert.Root>
            )}

            <Field
              label={t("fakturownia.invoiceCreate.oid", {
                defaultValue: "Order identifier (OID)",
              })}
              disabled={!!defaultOid}
            >
              <Controller
                name="oid"
                control={control}
                render={({ field }) => (
                  <Input {...field} value={field.value ?? ""} />
                )}
              />
            </Field>
          </HStack>

          <Separator my={4} />

          <Box>
            <Text fontWeight="medium" fontSize="xl" mb={2}>
              {t("fakturownia.invoiceCreate.summary", {
                defaultValue: "Summary",
              })}
            </Text>
            <HStack gap={8} align="flex-start">
              <Box>
                <Text fontWeight="medium" mb={1}>
                  {hasAnyDiscount
                    ? t("fakturownia.invoiceCreate.originalPrice", {
                        defaultValue: "Original",
                      })
                    : t("fakturownia.invoiceCreate.totals", {
                        defaultValue: "Totals",
                      })}
                </Text>
                <Text>
                  {t("fakturownia.invoiceCreate.totalNet", {
                    defaultValue: "Total net",
                  })}
                  : {formatTotal(undiscountedTotals.net)}
                </Text>
                <Text>
                  {t("fakturownia.invoiceCreate.totalGross", {
                    defaultValue: "Total gross",
                  })}
                  : {formatTotal(undiscountedTotals.gross)}
                </Text>
                <Presence present={!hasAnyDiscount}>
                  <Text fontWeight={hasAnyDiscount ? "normal" : "semibold"}>
                    {t("fakturownia.invoiceCreate.balanceDue", {
                      defaultValue: "Amount due",
                    })}
                    :{" "}
                    {formatDisplayTotal(
                      undiscountedTotals.gross - (paidAmount || 0),
                    )}
                  </Text>
                </Presence>
              </Box>
              {hasAnyDiscount && (
                <Box>
                  <HStack gap={2} mb={1}>
                    <Text fontWeight="medium">
                      {t("fakturownia.invoiceCreate.afterDiscount", {
                        defaultValue: "After discount",
                      })}
                    </Text>
                    <Badge colorPalette="success" variant="solid">
                      -{formatTotal(totalDiscountAmount)}
                    </Badge>
                  </HStack>
                  <Text>
                    {t("fakturownia.invoiceCreate.totalNet", {
                      defaultValue: "Total net",
                    })}
                    : {formatTotal(totals.net)}
                  </Text>
                  <Text>
                    {t("fakturownia.invoiceCreate.totalGross", {
                      defaultValue: "Total gross",
                    })}
                    : {formatTotal(totals.gross)}
                  </Text>
                  <Text fontWeight="semibold">
                    {t("fakturownia.invoiceCreate.balanceDue", {
                      defaultValue: "Amount due",
                    })}
                    : {formatDisplayTotal(totals.gross - (paidAmount || 0))}
                  </Text>
                </Box>
              )}
            </HStack>
          </Box>
        </VStack>
      </Fieldset.Content>
    </Fieldset.Root>
  );
}
