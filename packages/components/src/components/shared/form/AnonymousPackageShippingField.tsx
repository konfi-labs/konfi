"use client";

import {
  Box,
  Grid,
  GridItem,
  HStack,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ShippingOptions, type ShippingMethodId } from "@konfi/types";
import { isAnonymousPackageShippingAllowedFor } from "@konfi/utils";
import { TFunction } from "i18next";
import { useEffect } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Field } from "../../ui/field";
import { Switch } from "../../ui/switch";
import { InfoTip } from "../../ui/toggle-tip";

interface AnonymousPackageShippingFieldProps {
  t: TFunction;
  shippingOption?: ShippingMethodId | null;
  compact?: boolean;
}

export function AnonymousPackageShippingField({
  t,
  shippingOption,
  compact = false,
}: AnonymousPackageShippingFieldProps) {
  const { control, setValue } = useFormContext();
  const watchedShippingOption = useWatch({
    control,
    name: "shippingOption",
  }) as ShippingMethodId | null | undefined;
  const shippingCountry = useWatch({
    control,
    name: "shipping.country",
  }) as string | undefined;
  const anonymousPackageShipping = useWatch({
    control,
    name: "anonymousPackageShipping",
  }) as boolean | undefined;
  const resolvedShippingOption = shippingOption ?? watchedShippingOption;
  const hasCourierShipping =
    resolvedShippingOption &&
    resolvedShippingOption !== ShippingOptions.PERSONAL_COLLECTION;
  const supportsAnonymousPackageShipping =
    !shippingCountry || isAnonymousPackageShippingAllowedFor(shippingCountry);
  const anonymousPackageShippingEnabled = Boolean(anonymousPackageShipping);
  const tooltipContent = (
    <Box maxW="sm">
      {t("forms.anonymousPackageShipping.tooltip", {
        defaultValue:
          "Depending on the courier company handling the shipment, the sender will appear as the provided address or the courier's logistics center. The shipping provider, such as InPost or DHL, will be chosen based on anonymous shipping availability. Anonymous package shipping is not available with cash on delivery or international shipping.",
      })}
    </Box>
  );
  const labelAddressFields: Array<{
    name: string;
    label: string;
    placeholder: string;
    fullWidth?: boolean;
  }> = [
    {
      name: "anonymousPackageLabelAddress.labelName",
      label: t("forms.anonymousPackageLabelAddress.labelName", {
        defaultValue: "Label address name",
      }),
      placeholder: t(
        "forms.anonymousPackageLabelAddress.labelNamePlaceholder",
        {
          defaultValue: "e.g. Sender on label",
        },
      ),
    },
    {
      name: "anonymousPackageLabelAddress.company",
      label: t("forms.anonymousPackageLabelAddress.company", {
        defaultValue: "Company",
      }),
      placeholder: t("forms.anonymousPackageLabelAddress.companyPlaceholder", {
        defaultValue: "Company",
      }),
    },
    {
      name: "anonymousPackageLabelAddress.name",
      label: t("forms.anonymousPackageLabelAddress.name", {
        defaultValue: "Full name",
      }),
      placeholder: t("forms.anonymousPackageLabelAddress.namePlaceholder", {
        defaultValue: "First and last name",
      }),
    },
    {
      name: "anonymousPackageLabelAddress.street",
      label: t("forms.anonymousPackageLabelAddress.street", {
        defaultValue: "Street",
      }),
      placeholder: t("forms.anonymousPackageLabelAddress.streetPlaceholder", {
        defaultValue: "Street and number",
      }),
      fullWidth: true,
    },
    {
      name: "anonymousPackageLabelAddress.city",
      label: t("forms.anonymousPackageLabelAddress.city", {
        defaultValue: "City",
      }),
      placeholder: t("forms.anonymousPackageLabelAddress.cityPlaceholder", {
        defaultValue: "City",
      }),
    },
    {
      name: "anonymousPackageLabelAddress.zip",
      label: t("forms.anonymousPackageLabelAddress.zip", {
        defaultValue: "Postal code",
      }),
      placeholder: t("forms.anonymousPackageLabelAddress.zipPlaceholder", {
        defaultValue: "Postal code",
      }),
    },
    {
      name: "anonymousPackageLabelAddress.phone",
      label: t("forms.anonymousPackageLabelAddress.phone", {
        defaultValue: "Phone",
      }),
      placeholder: t("forms.anonymousPackageLabelAddress.phonePlaceholder", {
        defaultValue: "Phone",
      }),
    },
    {
      name: "anonymousPackageLabelAddress.email",
      label: t("forms.anonymousPackageLabelAddress.email", {
        defaultValue: "Email",
      }),
      placeholder: t("forms.anonymousPackageLabelAddress.emailPlaceholder", {
        defaultValue: "Email",
      }),
      fullWidth: true,
    },
  ] as const;
  const labelAddressFieldsNode = anonymousPackageShippingEnabled ? (
    <VStack mt={4} align="stretch" gap={4}>
      <Text fontSize="sm" color="fg.muted">
        {t("forms.anonymousPackageLabelAddress.description", {
          defaultValue:
            "Optional. If you fill these fields, this sender address can be used on the parcel label instead of our default one.",
        })}
      </Text>
      <Grid
        templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))" }}
        gap={4}
      >
        {labelAddressFields.map((fieldConfig) => (
          <GridItem
            key={fieldConfig.name}
            colSpan={{ base: 1, md: fieldConfig.fullWidth ? 2 : 1 }}
          >
            <Controller
              name={fieldConfig.name}
              control={control}
              render={({ field }) => (
                <Field label={fieldConfig.label}>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder={fieldConfig.placeholder}
                  />
                </Field>
              )}
            />
          </GridItem>
        ))}
      </Grid>
    </VStack>
  ) : null;

  useEffect(() => {
    if (
      anonymousPackageShipping &&
      (!hasCourierShipping || !supportsAnonymousPackageShipping)
    ) {
      setValue("anonymousPackageShipping", false, {
        shouldDirty: true,
        shouldTouch: true,
      });
    }
  }, [
    anonymousPackageShipping,
    hasCourierShipping,
    setValue,
    supportsAnonymousPackageShipping,
  ]);

  if (!hasCourierShipping) {
    return null;
  }

  if (compact) {
    return (
      <Controller
        name="anonymousPackageShipping"
        control={control}
        render={({ field }) => (
          <Box mt={6}>
            <HStack align="center" gap={2}>
              <Switch
                checked={Boolean(field.value)}
                disabled={!supportsAnonymousPackageShipping}
                colorPalette="primary"
                onCheckedChange={({ checked }) =>
                  field.onChange(Boolean(checked))
                }
                inputProps={{ name: field.name, onBlur: field.onBlur }}
              >
                {t("forms.anonymousPackageShipping.label", {
                  defaultValue: "Anonymous package shipping",
                })}
              </Switch>
              <InfoTip content={tooltipContent} />
            </HStack>
            {labelAddressFieldsNode}
          </Box>
        )}
      />
    );
  }

  return (
    <Box mt={6}>
      <HStack align="center" gap={2} mb={3}>
        <Text as="h2" fontSize="xl" fontWeight="semibold">
          {t("forms.anonymousPackageShipping.heading", {
            defaultValue: "Do you want the package shipping to be anonymous?",
          })}
        </Text>
        <InfoTip content={tooltipContent} />
      </HStack>
      <Controller
        name="anonymousPackageShipping"
        control={control}
        render={({ field }) => (
          <Box>
            <Switch
              checked={Boolean(field.value)}
              disabled={!supportsAnonymousPackageShipping}
              colorPalette="primary"
              onCheckedChange={({ checked }) =>
                field.onChange(Boolean(checked))
              }
              inputProps={{ name: field.name, onBlur: field.onBlur }}
            >
              {t("forms.anonymousPackageShipping.label", {
                defaultValue: "Anonymous package shipping",
              })}
            </Switch>
            <Text ps={12} mt={1} fontSize="sm" color="fg.muted">
              {t("forms.anonymousPackageShipping.description", {
                defaultValue:
                  "If you choose anonymous package shipping, Our company will not appear on the shipment labeling.",
              })}
            </Text>
            {labelAddressFieldsNode}
          </Box>
        )}
      />
    </Box>
  );
}
