"use client";

import { Box, Field, HStack, Input, Text } from "@chakra-ui/react";
import { Configuration, Product } from "@konfi/types";
import { getEnabledPageCountConfig, normalizePageCount } from "@konfi/utils";
import {
  ChangeEvent,
  FocusEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { i18n, TFunction } from "i18next";

type Props = {
  configuration: Configuration;
  product: Product;
  updateConfiguration: (configuration: Partial<Configuration>) => void;
  t: TFunction;
  i18n: i18n;
};

export function PageCountInput({
  configuration,
  product,
  updateConfiguration,
  t,
  i18n,
}: Props) {
  const pageCountConfig = useMemo(
    () =>
      getEnabledPageCountConfig(
        product,
        configuration.selectedAttributeOptions,
      ),
    [configuration.selectedAttributeOptions, product],
  );
  const normalizedConfigurationPageCount = pageCountConfig
    ? (normalizePageCount(configuration.pageCount, pageCountConfig) ??
      pageCountConfig.minimum)
    : undefined;
  const [inputValue, setInputValue] = useState(
    normalizedConfigurationPageCount !== undefined
      ? String(normalizedConfigurationPageCount)
      : "",
  );
  const [isEditing, setIsEditing] = useState(false);
  const lastSyncedPageCountRef = useRef(normalizedConfigurationPageCount);

  useEffect(() => {
    if (normalizedConfigurationPageCount === lastSyncedPageCountRef.current) {
      return;
    }

    lastSyncedPageCountRef.current = normalizedConfigurationPageCount;

    if (isEditing) {
      return;
    }

    setInputValue(
      normalizedConfigurationPageCount !== undefined
        ? String(normalizedConfigurationPageCount)
        : "",
    );
  }, [isEditing, normalizedConfigurationPageCount]);

  if (!pageCountConfig) {
    return null;
  }

  const editValue = Number(inputValue);
  const normalizedPageCount =
    inputValue.trim() !== "" && Number.isFinite(editValue)
      ? normalizePageCount(editValue, pageCountConfig)
      : normalizedConfigurationPageCount;
  const language = i18n.resolvedLanguage ?? i18n.language;
  const routeLanguage =
    typeof window === "undefined"
      ? undefined
      : window.location.pathname.split("/")[1];
  const isPolish = language?.startsWith("pl") || routeLanguage === "pl";
  const pageCountBreakdown =
    typeof normalizedPageCount === "number"
      ? t("translation:forms.pageCountBreakdown", {
          defaultValue: isPolish
            ? "{{innerPages}} (środek) + {{coverPages}} (okładka)"
            : "{{innerPages}} (inner) + {{coverPages}} (cover)",
          innerPages: normalizedPageCount,
          coverPages: pageCountConfig.coverPages,
        })
      : undefined;
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.currentTarget.value;
    setInputValue(rawValue);

    if (rawValue === "") {
      return;
    }

    const nextValue = Number(rawValue);

    if (!Number.isFinite(nextValue)) {
      return;
    }

    const clampedValue = Math.min(
      pageCountConfig.maximum,
      Math.max(pageCountConfig.minimum, nextValue),
    );

    updateConfiguration({ pageCount: clampedValue });
  };
  const handleFocus = () => {
    setIsEditing(true);
  };
  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    setIsEditing(false);

    const nextValue = Number(event.currentTarget.value);
    const nextPageCount = Number.isFinite(nextValue)
      ? (normalizePageCount(nextValue, pageCountConfig) ??
        pageCountConfig.minimum)
      : normalizedConfigurationPageCount;

    updateConfiguration({ pageCount: nextPageCount });
    setInputValue(String(nextPageCount));
  };

  return (
    <Box py={"2"} w={"100%"}>
      <HStack align={"center"} justify={"space-between"} mb={"2"}>
        <Text fontSize={"xl"} fontWeight={"600"}>
          {t("translation:forms.labels.pageCount", {
            defaultValue: isPolish ? "Liczba stron" : "Number of pages",
          })}
        </Text>
        <Text color={"fg.muted"} fontSize={"sm"} fontWeight={"600"}>
          {pageCountBreakdown}
        </Text>
      </HStack>
      <Field.Root>
        <Input
          type="number"
          min={pageCountConfig.minimum}
          max={pageCountConfig.maximum}
          step={pageCountConfig.step}
          value={inputValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        <Field.HelperText>
          {t("translation:forms.help.pageCount", {
            defaultValue: isPolish
              ? "Wybierz od {{minimum}} do {{maximum}} z krokiem {{step}}. Strony okładki (+{{coverPages}}) są stałe."
              : "Choose from {{minimum}} to {{maximum}} in steps of {{step}}. Cover pages (+{{coverPages}}) are fixed.",
            minimum: pageCountConfig.minimum,
            maximum: pageCountConfig.maximum,
            step: pageCountConfig.step,
            coverPages: pageCountConfig.coverPages,
          })}
        </Field.HelperText>
      </Field.Root>
    </Box>
  );
}
