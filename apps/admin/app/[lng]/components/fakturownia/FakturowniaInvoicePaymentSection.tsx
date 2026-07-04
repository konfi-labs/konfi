"use client";

import {
  createListCollection,
  Fieldset,
  For,
  HStack,
  Input,
  Select,
  Switch,
  VStack,
} from "@chakra-ui/react";
import { DatePickerInput, Field } from "@konfi/components";
import type { Invoice_status } from "@konfi/fakturownia/out/client/models";
import type { Dispatch, SetStateAction } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { useT } from "@/i18n/client";
import { PAYMENT_TYPES } from "@/lib/fakturownia/payment-type";
import {
  PAYMENT_STATUS_OPTIONS,
  PAYMENT_TERM_OPTIONS,
} from "./invoice-form-options";
import type { InvoiceFormValues } from "./invoice-form-types";

interface FakturowniaInvoicePaymentSectionProps {
  selectedPaymentTypeOption?: {
    requiresCustom?: boolean;
  };
  paymentTerm: string;
  currencyOptions: Array<{
    value: string;
    label: string;
  }>;
  setStatusManuallyEdited: Dispatch<SetStateAction<boolean>>;
  setPaidAmountManuallyEdited: Dispatch<SetStateAction<boolean>>;
}

export function FakturowniaInvoicePaymentSection({
  selectedPaymentTypeOption,
  paymentTerm,
  currencyOptions,
  setStatusManuallyEdited,
  setPaidAmountManuallyEdited,
}: FakturowniaInvoicePaymentSectionProps) {
  const { t, i18n } = useT(["fakturownia", "translation"]);
  const {
    control,
    formState: { errors },
  } = useFormContext<InvoiceFormValues>();

  return (
    <Fieldset.Root>
      <Fieldset.Legend fontSize={"xl"}>
        {t("fakturownia.invoiceCreate.generalInfo", {
          defaultValue: "General information",
        })}
      </Fieldset.Legend>
      <Fieldset.Content>
        <HStack columns={{ base: 1, md: 4 }} gap={4} alignItems="flex-end">
          <Field
            label={t("fakturownia.invoiceCreate.paymentType.label", {
              defaultValue: "Payment method",
            })}
            invalid={
              !!errors.paymentType ||
              (selectedPaymentTypeOption?.requiresCustom &&
                !!errors.customPaymentType)
            }
            errorText={
              errors.customPaymentType?.message || errors.paymentType?.message
            }
            required={true}
          >
            <VStack w="100%" align="stretch" gap={2}>
              <Controller
                name="paymentType"
                control={control}
                render={({ field }) => (
                  <Select.Root
                    required
                    collection={createListCollection({
                      items: PAYMENT_TYPES.map((option) => ({
                        value: option.value,
                        label: t(option.labelKey, {
                          defaultValue: option.fallback,
                        }),
                      })),
                    })}
                    value={[field.value]}
                    onValueChange={({ value }) => field.onChange(value[0])}
                  >
                    <Select.HiddenSelect />
                    <Select.Control>
                      <Select.Trigger>
                        <Select.ValueText />
                      </Select.Trigger>
                      <Select.IndicatorGroup>
                        <Select.Indicator />
                      </Select.IndicatorGroup>
                    </Select.Control>
                    <Select.Positioner>
                      <Select.Content>
                        <For each={PAYMENT_TYPES}>
                          {(option, index) => (
                            <Select.Item
                              key={`${option.value}-${index}`}
                              item={{
                                value: option.value,
                                label: t(option.labelKey, {
                                  defaultValue: option.fallback,
                                }),
                              }}
                            >
                              {t(option.labelKey, {
                                defaultValue: option.fallback,
                              })}
                            </Select.Item>
                          )}
                        </For>
                      </Select.Content>
                    </Select.Positioner>
                  </Select.Root>
                )}
              />

              {selectedPaymentTypeOption?.requiresCustom && (
                <Controller
                  name="customPaymentType"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder={t(
                        "fakturownia.invoiceCreate.paymentType.customPlaceholder",
                        { defaultValue: "Enter payment method label" },
                      )}
                    />
                  )}
                />
              )}
            </VStack>
          </Field>

          <Field
            label={t("fakturownia.invoiceCreate.paymentTerm.label", {
              defaultValue: "Payment term",
            })}
            invalid={!!errors.paymentTerm}
            required={true}
            errorText={errors.paymentTerm?.message}
          >
            <Controller
              name="paymentTerm"
              control={control}
              render={({ field }) => (
                <Select.Root
                  collection={createListCollection({
                    items: PAYMENT_TERM_OPTIONS.map((option) => ({
                      value: option.value,
                      label: t(option.labelKey, {
                        defaultValue: option.fallback,
                      }),
                    })),
                  })}
                  value={[field.value]}
                  onValueChange={({ value }) => field.onChange(value[0])}
                >
                  <Select.HiddenSelect />
                  <Select.Control>
                    <Select.Trigger>
                      <Select.ValueText />
                    </Select.Trigger>
                    <Select.IndicatorGroup>
                      <Select.Indicator />
                    </Select.IndicatorGroup>
                  </Select.Control>
                  <Select.Positioner>
                    <Select.Content>
                      <For each={PAYMENT_TERM_OPTIONS}>
                        {(option, index) => (
                          <Select.Item
                            key={`${option.value}-${index}`}
                            item={{
                              value: option.value,
                              label: t(option.labelKey, {
                                defaultValue: option.fallback,
                              }),
                            }}
                          >
                            {t(option.labelKey, {
                              defaultValue: option.fallback,
                            })}
                          </Select.Item>
                        )}
                      </For>
                    </Select.Content>
                  </Select.Positioner>
                </Select.Root>
              )}
            />
          </Field>

          {paymentTerm === "custom" && (
            <Field
              label={t("fakturownia.invoiceCreate.paymentTo", {
                defaultValue: "Payment due date",
              })}
              invalid={!!errors.paymentTo}
              errorText={errors.paymentTo?.message}
              required={true}
            >
              <Controller
                name="paymentTo"
                control={control}
                render={({ field }) => (
                  <DatePickerInput
                    name={field.name}
                    value={field.value ?? ""}
                    onValueChange={field.onChange}
                    locale={i18n.resolvedLanguage}
                    triggerLabel={t("fakturownia.invoiceCreate.paymentTo", {
                      defaultValue: "Payment due date",
                    })}
                    inputProps={{
                      ref: field.ref,
                      onBlur: field.onBlur,
                      required: true,
                      "aria-label": t("fakturownia.invoiceCreate.paymentTo", {
                        defaultValue: "Payment due date",
                      }),
                    }}
                  />
                )}
              />
            </Field>
          )}

          <Field
            label={t("fakturownia.invoiceCreate.status.label", {
              defaultValue: "Status",
            })}
          >
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Select.Root
                  collection={createListCollection({
                    items: PAYMENT_STATUS_OPTIONS.map((status) => ({
                      value: status.value,
                      label: t(status.labelKey, {
                        defaultValue: status.fallback,
                      }),
                    })),
                  })}
                  value={[field.value]}
                  onValueChange={({ value }) => {
                    setStatusManuallyEdited(true);
                    field.onChange(value[0] as Invoice_status);
                  }}
                >
                  <Select.HiddenSelect />
                  <Select.Control>
                    <Select.Trigger>
                      <Select.ValueText />
                    </Select.Trigger>
                    <Select.IndicatorGroup>
                      <Select.Indicator />
                    </Select.IndicatorGroup>
                  </Select.Control>
                  <Select.Positioner>
                    <Select.Content>
                      <For each={PAYMENT_STATUS_OPTIONS}>
                        {(statusOption, index) => (
                          <Select.Item
                            key={`${statusOption.value}-${index}`}
                            item={{
                              value: statusOption.value,
                              label: t(statusOption.labelKey, {
                                defaultValue: statusOption.fallback,
                              }),
                            }}
                          >
                            {t(statusOption.labelKey, {
                              defaultValue: statusOption.fallback,
                            })}
                          </Select.Item>
                        )}
                      </For>
                    </Select.Content>
                  </Select.Positioner>
                </Select.Root>
              )}
            />
          </Field>

          <Field
            label={t("fakturownia.invoiceCreate.paidAmount", {
              defaultValue: "Amount paid",
            })}
          >
            <Controller
              name="paidAmount"
              control={control}
              render={({ field }) => (
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={Number.isFinite(field.value) ? field.value : 0}
                  onChange={(event) => {
                    const parsed = parseFloat(event.target.value);
                    setPaidAmountManuallyEdited(true);
                    field.onChange(Number.isNaN(parsed) ? 0 : parsed);
                  }}
                />
              )}
            />
          </Field>

          <Field
            label={t("fakturownia.invoiceCreate.currency", {
              defaultValue: "Currency",
            })}
          >
            <Controller
              name="currency"
              control={control}
              render={({ field }) => (
                <Select.Root
                  collection={createListCollection({
                    items: currencyOptions,
                  })}
                  value={[field.value]}
                  onValueChange={({ value }) => field.onChange(value[0])}
                >
                  <Select.HiddenSelect />
                  <Select.Control>
                    <Select.Trigger>
                      <Select.ValueText />
                    </Select.Trigger>
                    <Select.IndicatorGroup>
                      <Select.Indicator />
                    </Select.IndicatorGroup>
                  </Select.Control>
                  <Select.Positioner>
                    <Select.Content>
                      {currencyOptions.map((option) => (
                        <Select.Item key={option.value} item={option}>
                          {option.label}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Positioner>
                </Select.Root>
              )}
            />
          </Field>

          <Field
            label={t("fakturownia.invoiceCreate.language", {
              defaultValue: "Language",
            })}
          >
            <Controller
              name="language"
              control={control}
              render={({ field }) => (
                <Select.Root
                  collection={createListCollection({
                    items: [
                      {
                        value: "pl",
                        label: t("languages.pl", { defaultValue: "Polish" }),
                      },
                      {
                        value: "en",
                        label: t("languages.en", { defaultValue: "English" }),
                      },
                    ],
                  })}
                  value={[field.value]}
                  onValueChange={({ value }) => field.onChange(value[0])}
                >
                  <Select.HiddenSelect />
                  <Select.Control>
                    <Select.Trigger>
                      <Select.ValueText />
                    </Select.Trigger>
                    <Select.IndicatorGroup>
                      <Select.Indicator />
                    </Select.IndicatorGroup>
                  </Select.Control>
                  <Select.Positioner>
                    <Select.Content>
                      <Select.Item
                        item={{
                          value: "pl",
                          label: t("languages.pl", {
                            defaultValue: "Polish",
                          }),
                        }}
                      >
                        {t("languages.pl", { defaultValue: "Polish" })}
                      </Select.Item>
                      <Select.Item
                        item={{
                          value: "en",
                          label: t("languages.en", {
                            defaultValue: "English",
                          }),
                        }}
                      >
                        {t("languages.en", { defaultValue: "English" })}
                      </Select.Item>
                    </Select.Content>
                  </Select.Positioner>
                </Select.Root>
              )}
            />
          </Field>

          <Field
            label={t("fakturownia.invoiceCreate.splitPayment", {
              defaultValue: "Split payment",
            })}
          >
            <Controller
              name="splitPayment"
              control={control}
              render={({ field }) => (
                <Switch.Root
                  name={field.name}
                  checked={field.value}
                  onCheckedChange={({ checked }) => field.onChange(checked)}
                >
                  <Switch.HiddenInput ref={field.ref} onBlur={field.onBlur} />
                  <Switch.Control />
                  <Switch.Label>
                    {t("fakturownia.invoiceCreate.splitPaymentToggle", {
                      defaultValue: "Enable split payment",
                    })}
                  </Switch.Label>
                </Switch.Root>
              )}
            />
          </Field>
        </HStack>
      </Fieldset.Content>
    </Fieldset.Root>
  );
}
