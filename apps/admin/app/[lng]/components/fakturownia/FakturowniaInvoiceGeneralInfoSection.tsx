"use client";

import {
  createListCollection,
  Fieldset,
  For,
  HStack,
  Input,
  Select,
} from "@chakra-ui/react";
import { DatePickerInput, Field } from "@konfi/components";
import type { InvoiceKind } from "@konfi/fakturownia/out/client/models";
import { Controller, useFormContext } from "react-hook-form";
import { useT } from "@/i18n/client";
import { INVOICE_KIND_OPTIONS } from "./invoice-form-options";
import type { InvoiceFormValues } from "./invoice-form-types";

export function FakturowniaInvoiceGeneralInfoSection() {
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
        <HStack columns={{ base: 1, md: 4 }} gap={4}>
          <Field
            label={t("fakturownia.invoiceCreate.kind", {
              defaultValue: "Document type",
            })}
          >
            <Controller
              name="kind"
              control={control}
              render={({ field }) => (
                <Select.Root
                  collection={createListCollection({
                    items: INVOICE_KIND_OPTIONS.map((option) => ({
                      value: option.value,
                      label: t(option.labelKey, {
                        defaultValue: option.fallback,
                      }),
                    })),
                  })}
                  value={[field.value]}
                  onValueChange={({ value }) =>
                    field.onChange(value[0] as InvoiceKind)
                  }
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
                      <For each={INVOICE_KIND_OPTIONS}>
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

          <Field
            label={t("fakturownia.invoiceCreate.issueDate", {
              defaultValue: "Issue date",
            })}
            invalid={!!errors.issueDate}
            errorText={errors.issueDate?.message}
          >
            <Controller
              name="issueDate"
              control={control}
              render={({ field }) => (
                <DatePickerInput
                  name={field.name}
                  value={field.value}
                  onValueChange={field.onChange}
                  locale={i18n.resolvedLanguage}
                  triggerLabel={t("fakturownia.invoiceCreate.issueDate", {
                    defaultValue: "Issue date",
                  })}
                  inputProps={{
                    ref: field.ref,
                    onBlur: field.onBlur,
                    "aria-label": t("fakturownia.invoiceCreate.issueDate", {
                      defaultValue: "Issue date",
                    }),
                  }}
                />
              )}
            />
          </Field>

          <Field
            label={t("fakturownia.invoiceCreate.sellDate", {
              defaultValue: "Sale date",
            })}
            invalid={!!errors.sellDate}
            errorText={errors.sellDate?.message}
          >
            <Controller
              name="sellDate"
              control={control}
              render={({ field }) => (
                <DatePickerInput
                  name={field.name}
                  value={field.value}
                  onValueChange={field.onChange}
                  locale={i18n.resolvedLanguage}
                  triggerLabel={t("fakturownia.invoiceCreate.sellDate", {
                    defaultValue: "Sale date",
                  })}
                  inputProps={{
                    ref: field.ref,
                    onBlur: field.onBlur,
                    "aria-label": t("fakturownia.invoiceCreate.sellDate", {
                      defaultValue: "Sale date",
                    }),
                  }}
                />
              )}
            />
          </Field>

          <Field
            label={t("fakturownia.invoiceCreate.place", {
              defaultValue: "Place",
            })}
            invalid={!!errors.place}
            errorText={errors.place?.message}
          >
            <Controller
              name="place"
              control={control}
              render={({ field }) => (
                <Input
                  placeholder={t("fakturownia.invoiceCreate.placePlaceholder", {
                    defaultValue: "City",
                  })}
                  {...field}
                />
              )}
            />
          </Field>
        </HStack>
      </Fieldset.Content>
    </Fieldset.Root>
  );
}
