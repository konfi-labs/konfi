"use client";

import { Stack, Text } from "@chakra-ui/react";
import {
  FieldData,
  FormData,
  isNestedCustomer,
  Locale,
  SelectOption,
  Warehouse,
} from "@konfi/types";
import { isUndefined } from "es-toolkit";
import { Fragment, memo, useMemo } from "react";
import {
  FieldValues,
  UseFieldArrayInsert,
  UseFieldArrayPrepend,
  useFormContext,
  useFormState,
  UseFormSetValue,
  useWatch,
} from "react-hook-form";
import { Field } from "../../../ui/field";
import { toaster } from "../../../ui/toaster";
import type { FormControllerProps } from "../FormController";
import { InputSwitcher } from "./InputSwitcher";

import { i18n, TFunction } from "i18next";
import type { JSX } from "react";

type FieldControllerProps = {
  fields: FormData["sections"][0]["fields"];
  fieldArrayIndex?: number;
  update?: boolean;
  searchResults?: FormControllerProps["searchResults"];
  searchFn?: FormControllerProps["searchFn"];
  sectionName?: FormData["sections"][0]["name"];
  newField?: string;
  warehouses?: Warehouse[] | null;
  stackDirection?: "row" | "column";
  prepend?: UseFieldArrayPrepend<FieldValues, string>;
  CombinationInput?: ({
    index,
    insertAction,
    newField,
    itemId,
  }: {
    index: number;
    insertAction: UseFieldArrayInsert<FieldValues, string>;
    newField?: boolean;
    itemId?: string;
  }) => JSX.Element | null;
  ProductGroupedIndexedSearch?: ({
    fieldData,
    fieldArrayIndex,
    lng,
    update,
  }: {
    fieldData: FieldData;
    fieldArrayIndex: number | undefined;
    lng?: Locale;
    update?: boolean;
  }) => JSX.Element;
  Generate?: React.ComponentType<{
    fieldData: FieldData;
    setValue: UseFormSetValue<FieldValues>;
    systemPrompt: string;
    context: string;
  }>;
  FileManagerActions?: React.ComponentType<{
    fieldData: FieldData;
  }>;
  insert?: UseFieldArrayInsert<FieldValues, string>;
  dynamicOptions?: {
    contacts?: SelectOption[];
    shippingAddresses?: SelectOption[];
    billingAddresses?: SelectOption[];
  };
  orderProcessingQueue?: number;
  renderAfterField?: FormControllerProps["renderAfterField"];
  itemId?: string;
  t: TFunction;
  i18n: i18n;
};

type FieldControllerItemProps = Omit<FieldControllerProps, "fields"> & {
  fieldData: FieldData;
  index: number;
};

function normalizeDependencyValue(candidate: unknown): string {
  return `${candidate}`.trim().toLowerCase();
}

function dependencyMatches(
  value: unknown,
  expectedValue: string | string[],
): boolean {
  const normalizedValue = normalizeDependencyValue(value);

  return Array.isArray(expectedValue)
    ? expectedValue
        .map((candidate) => normalizeDependencyValue(candidate))
        .includes(normalizedValue)
    : normalizedValue === normalizeDependencyValue(expectedValue);
}

function resolveDependencyPath(
  dependencyName: string,
  sectionName: string | undefined,
  fieldArrayIndex: number | undefined,
  watchNested?: true,
) {
  return !isUndefined(fieldArrayIndex) && watchNested
    ? `${sectionName}[${fieldArrayIndex}].${dependencyName}`
    : dependencyName;
}

function getFieldDependencyPaths(
  fieldData: FieldData,
  sectionName: string | undefined,
  fieldArrayIndex: number | undefined,
) {
  const paths = new Set<string>();

  if (typeof fieldData.dependsOn === "string") {
    paths.add(
      resolveDependencyPath(
        fieldData.dependsOn,
        sectionName,
        fieldArrayIndex,
        fieldData.watchNested,
      ),
    );
  }

  for (const dependency of fieldData.dependencies ?? []) {
    paths.add(
      resolveDependencyPath(
        dependency.name,
        sectionName,
        fieldArrayIndex,
        dependency.watchNested,
      ),
    );
  }

  return [...paths];
}

const FieldControllerItem = memo(function FieldControllerItem({
  fieldData,
  index,
  fieldArrayIndex,
  update,
  searchResults,
  searchFn,
  sectionName,
  newField,
  warehouses,
  stackDirection = "column",
  CombinationInput,
  ProductGroupedIndexedSearch,
  Generate,
  FileManagerActions,
  insert,
  dynamicOptions,
  orderProcessingQueue,
  renderAfterField,
  itemId,
  t,
  i18n,
}: FieldControllerItemProps) {
  const { control, getFieldState } = useFormContext();
  const fieldFormState = useFormState({
    control,
    exact: true,
    name: fieldData.name,
  });
  const fieldError = getFieldState(fieldData.name, fieldFormState).error;
  const dependencyPaths = useMemo(
    () => getFieldDependencyPaths(fieldData, sectionName, fieldArrayIndex),
    [fieldArrayIndex, fieldData, sectionName],
  );
  const watchedDependencyValues = useWatch({
    control,
    disabled: dependencyPaths.length === 0,
    name: dependencyPaths,
  }) as unknown[] | undefined;
  const resolveDependencyValue = (
    dependencyName: string,
    watchNested?: true,
  ): unknown => {
    const dependencyPath = resolveDependencyPath(
      dependencyName,
      sectionName,
      fieldArrayIndex,
      watchNested,
    );
    const dependencyIndex = dependencyPaths.indexOf(dependencyPath);

    return dependencyIndex === -1
      ? undefined
      : watchedDependencyValues?.[dependencyIndex];
  };
  const dependsOn: unknown =
    !isUndefined(fieldData.dependsOn) && typeof fieldData.dependsOn === "string"
      ? resolveDependencyValue(fieldData.dependsOn, fieldData.watchNested)
      : undefined;
  const searchOptions =
    fieldData.searchFor &&
    searchResults?.[fieldData.searchFor]?.map((result) => ({
      label: result.name,
      value: result.id,
      object: result,
    }));
  const disabled =
    (!!update &&
      fieldData.updateDisabled &&
      newField !== `${sectionName}[${fieldArrayIndex}]`) ??
    false;
  const isContactSelectorEmpty =
    fieldData.name === "contact" &&
    fieldData.optionsKey === "contacts" &&
    (!dynamicOptions?.contacts || dynamicOptions.contacts.length === 0);
  const isBillingSelectorEmpty =
    fieldData.name === "billing" &&
    fieldData.optionsKey === "billingAddresses" &&
    (!dynamicOptions?.billingAddresses ||
      dynamicOptions.billingAddresses.length === 0);
  const isEmptyOptionalSelector =
    isContactSelectorEmpty || isBillingSelectorEmpty;
  const shouldRenderField =
    fieldData.dependencies && fieldData.dependencies.length > 0
      ? fieldData.dependencies.every((dependency) =>
          dependencyMatches(
            resolveDependencyValue(dependency.name, dependency.watchNested),
            dependency.value,
          ),
        )
      : !isUndefined(fieldData.dependencyValue)
        ? dependencyMatches(dependsOn, fieldData.dependencyValue)
        : true;

  if (fieldData.name.includes("product") && ProductGroupedIndexedSearch) {
    const showCustomerTip = isNestedCustomer(dependsOn) && !dependsOn?.id;
    return (
      <Fragment>
        {showCustomerTip && (
          <Text fontSize={"xs"}>
            {t("admin.selectCustomerTip", {
              defaultValue:
                "Tip: Select a customer to see linked products and discounts.",
            })}
          </Text>
        )}
        <ProductGroupedIndexedSearch
          fieldData={fieldData}
          fieldArrayIndex={fieldArrayIndex}
          lng={i18n.resolvedLanguage as Locale}
          update={update}
        />
        {renderAfterField?.({ fieldData, sectionName, fieldArrayIndex })}
      </Fragment>
    );
  }

  if (!shouldRenderField) return null;

  if (
    fieldData.combination &&
    !isUndefined(fieldArrayIndex) &&
    !isUndefined(insert)
  ) {
    return (
      <Fragment>
        {CombinationInput && (
          <CombinationInput
            index={fieldArrayIndex}
            insertAction={insert}
            newField={newField === fieldData.name.split(".")[0]}
            itemId={itemId}
          />
        )}
        {renderAfterField?.({ fieldData, sectionName, fieldArrayIndex })}
      </Fragment>
    );
  }

  const fieldContent = isContactSelectorEmpty ? (
    <Text fontSize="sm" color="fg.muted">
      {t("orders.contactEmptyState", {
        defaultValue:
          "This customer has no contacts. Fill in the contact details below.",
      })}
    </Text>
  ) : isBillingSelectorEmpty ? (
    <Text fontSize="sm" color="fg.muted">
      {t("orders.billingEmptyState", {
        defaultValue:
          "This customer has no saved billing addresses. Fill in the billing details below.",
      })}
    </Text>
  ) : (
    <InputSwitcher
      fieldArrayIndex={fieldArrayIndex}
      fieldData={fieldData}
      disabled={disabled}
      searchOptions={searchOptions}
      searchFn={searchFn}
      toaster={toaster}
      update={update}
      warehouses={warehouses}
      Generate={Generate}
      FileManagerActions={FileManagerActions}
      dynamicOptions={dynamicOptions}
      orderProcessingQueue={orderProcessingQueue}
      t={t}
      i18n={i18n}
    />
  );

  return (
    <Fragment>
      <Field
        label={fieldData.label}
        helperText={fieldData.helperText}
        errorText={
          fieldError && !isEmptyOptionalSelector
            ? fieldData.isObject
              ? "Wybierz jedną z opcji."
              : (fieldError.message as string | undefined)
            : undefined
        }
        mt={
          index !== 0 ? (stackDirection === "row" ? undefined : 6) : undefined
        }
        invalid={isEmptyOptionalSelector ? false : !!fieldError}
        required={
          isEmptyOptionalSelector ? false : fieldData.isRequired || false
        }
        disabled={disabled}
        orientation={fieldData.orientation ?? undefined}
      >
        {fieldContent}
      </Field>
      {renderAfterField?.({ fieldData, sectionName, fieldArrayIndex })}
    </Fragment>
  );
});

export const FieldController = ({
  fields,
  fieldArrayIndex,
  update,
  searchResults,
  searchFn,
  sectionName,
  newField,
  warehouses,
  stackDirection = "column",
  CombinationInput,
  ProductGroupedIndexedSearch,
  Generate,
  FileManagerActions,
  insert,
  dynamicOptions,
  orderProcessingQueue,
  renderAfterField,
  itemId,
  t,
  i18n,
}: FieldControllerProps) => {
  const fieldNameCounts = fields.reduce<Record<string, number>>(
    (counts, field) => {
      counts[field.name] = (counts[field.name] ?? 0) + 1;
      return counts;
    },
    {},
  );

  return (
    <Stack direction={stackDirection}>
      {fields.map((fieldData, index) => {
        const fieldVariantKey = [
          fieldData.name,
          fieldData.type ?? "text",
          Array.isArray(fieldData.dependencyValue)
            ? fieldData.dependencyValue.join("|")
            : (fieldData.dependencyValue ?? "always"),
          fieldData.searchFor ?? "",
          fieldData.optionsKey ?? "",
        ].join("::");
        const fieldKey =
          fieldNameCounts[fieldData.name] > 1
            ? `${fieldVariantKey}::${index}`
            : fieldData.name;

        return (
          <FieldControllerItem
            key={fieldKey}
            fieldData={fieldData}
            index={index}
            fieldArrayIndex={fieldArrayIndex}
            update={update}
            searchResults={searchResults}
            searchFn={searchFn}
            sectionName={sectionName}
            newField={newField}
            warehouses={warehouses}
            stackDirection={stackDirection}
            CombinationInput={CombinationInput}
            ProductGroupedIndexedSearch={ProductGroupedIndexedSearch}
            Generate={Generate}
            FileManagerActions={FileManagerActions}
            insert={insert}
            dynamicOptions={dynamicOptions}
            orderProcessingQueue={orderProcessingQueue}
            renderAfterField={renderAfterField}
            itemId={itemId}
            t={t}
            i18n={i18n}
          />
        );
      })}
    </Stack>
  );
};
