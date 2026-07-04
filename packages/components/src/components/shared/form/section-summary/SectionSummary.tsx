"use client";

import { Badge, Box, HStack, Stack, Text } from "@chakra-ui/react";
import { FieldData, FormData } from "@konfi/types";
import { get } from "es-toolkit/compat";
import type { i18n as I18n, TFunction } from "i18next";
import { useMemo } from "react";
import { useFormContext, useFormState, useWatch } from "react-hook-form";
import { MaterialSymbol } from "../../MaterialSymbol";
import {
  formatFieldValue,
  isEmptyFieldValue,
  type SectionSummaryDynamicOptions,
} from "./formatFieldValue";

type Section = FormData["sections"][number];

type SectionSummaryProps = {
  section: Section;
  dynamicOptions?: SectionSummaryDynamicOptions;
  /** Expand the section — wired to the same handler as the header toggle. */
  onEdit: () => void;
  t: TFunction;
  i18n: I18n;
};

const MAX_VISIBLE_ROWS = 4;

function normalize(candidate: unknown): string {
  return `${candidate}`.trim().toLowerCase();
}

function dependencyMatches(
  value: unknown,
  expected: string | string[],
): boolean {
  const normalized = normalize(value);
  return Array.isArray(expected)
    ? expected.map(normalize).includes(normalized)
    : normalized === normalize(expected);
}

export function SectionSummary({
  section,
  dynamicOptions,
  onEdit,
  t,
  i18n,
}: SectionSummaryProps) {
  const { control, getValues } = useFormContext();

  const fieldNames = useMemo(
    () => section.fields.map((field) => field.name),
    [section.fields],
  );

  // Array sections are previewed by item count rather than per-field values.
  const isArraySection = Boolean(section.fieldArray && section.name);
  const watchNames = isArraySection ? [section.name as string] : fieldNames;

  const watched = useWatch({
    control,
    name: watchNames,
    disabled: watchNames.length === 0,
  }) as unknown[] | undefined;

  const { errors } = useFormState({ control, name: watchNames });

  const valueByName = useMemo(() => {
    const map = new Map<string, unknown>();
    watchNames.forEach((name, index) => map.set(name, watched?.[index]));
    return map;
  }, [watchNames, watched]);

  const resolveDependencyValue = (name: string): unknown =>
    valueByName.has(name) ? valueByName.get(name) : getValues(name);

  const isFieldVisible = (field: FieldData): boolean => {
    if (field.dependencies && field.dependencies.length > 0) {
      return field.dependencies.every((dependency) =>
        dependencyMatches(
          resolveDependencyValue(dependency.name),
          dependency.value,
        ),
      );
    }
    if (field.dependencyValue !== undefined && field.dependsOn) {
      return dependencyMatches(
        resolveDependencyValue(field.dependsOn),
        field.dependencyValue,
      );
    }
    return true;
  };

  const locale = i18n.resolvedLanguage;

  const visibleFields = isArraySection
    ? []
    : section.fields.filter(isFieldVisible);

  const rows = visibleFields
    .map((field) => ({
      key: field.name,
      label: field.label ?? field.name,
      display: formatFieldValue(field, valueByName.get(field.name), {
        t,
        locale,
        dynamicOptions,
      }),
    }))
    .filter((row): row is typeof row & { display: string } =>
      Boolean(row.display),
    );

  const arrayCount = isArraySection
    ? Array.isArray(watched?.[0])
      ? (watched?.[0] as unknown[]).length
      : 0
    : 0;

  const errorCount = isArraySection
    ? get(errors, section.name as string)
      ? 1
      : 0
    : visibleFields.reduce(
        (count, field) => (get(errors, field.name) ? count + 1 : count),
        0,
      );

  const filledCount = rows.length;
  const totalCount = visibleFields.length;
  const hiddenRowCount = Math.max(0, filledCount - MAX_VISIBLE_ROWS);

  return (
    <Box
      aria-label={t("forms.summary.editSection", {
        defaultValue: "Show and edit section",
      })}
      borderRadius={"xl"}
      borderWidth={"1px"}
      cursor={"pointer"}
      flex={"1"}
      minW={0}
      onClick={onEdit}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit();
        }
      }}
      px={4}
      py={3}
      role={"button"}
      tabIndex={0}
      transition={"background 0.15s ease"}
      w={"100%"}
      _hover={{ bg: "bg.muted" }}
    >
      {isArraySection ? (
        <Text color={"fg.muted"} fontSize={"sm"}>
          {t("forms.summary.itemCount", {
            count: arrayCount,
            defaultValue: `${arrayCount} item(s)`,
          })}
        </Text>
      ) : filledCount === 0 ? (
        <Text color={"fg.muted"} fontSize={"sm"}>
          {t("forms.summary.empty", { defaultValue: "No data yet" })}
        </Text>
      ) : (
        <Stack gap={1}>
          {rows.slice(0, MAX_VISIBLE_ROWS).map((row) => (
            <HStack key={row.key} gap={2} minW={0} align={"baseline"}>
              <Text
                color={"fg.muted"}
                flexShrink={0}
                fontSize={"xs"}
                maxW={"45%"}
                truncate
              >
                {row.label}
              </Text>
              <Text fontSize={"sm"} minW={0} truncate>
                {row.display}
              </Text>
            </HStack>
          ))}
          {hiddenRowCount > 0 ? (
            <Text color={"fg.muted"} fontSize={"xs"}>
              {t("forms.summary.more", {
                count: hiddenRowCount,
                defaultValue: `+${hiddenRowCount} more`,
              })}
            </Text>
          ) : null}
        </Stack>
      )}

      <HStack gap={2} mt={2}>
        {!isArraySection ? (
          <Text color={"fg.muted"} fontSize={"xs"}>
            {t("forms.summary.filledCount", {
              filled: filledCount,
              total: totalCount,
              defaultValue: `${filledCount} of ${totalCount} filled`,
            })}
          </Text>
        ) : null}
        {errorCount > 0 ? (
          <Badge colorPalette={"red"} size={"sm"} variant={"subtle"}>
            <MaterialSymbol>error</MaterialSymbol>
            {t("forms.summary.errorCount", {
              count: errorCount,
              defaultValue: `${errorCount} error(s)`,
            })}
          </Badge>
        ) : null}
      </HStack>
    </Box>
  );
}
