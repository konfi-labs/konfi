"use client";

import {
  Alert,
  Box,
  Button,
  chakra,
  FileUpload,
  Heading,
  HStack,
  Input,
  parseColor,
  Text,
  Textarea,
} from "@chakra-ui/react";
import {
  Customer,
  FieldData,
  OrderItem,
  SelectOption,
  ShippingOptions,
  ShippingTypes,
  Warehouse,
} from "@konfi/types";

import {
  FileMimeType,
  formatStreetLine,
  getAvailableShippingOptions,
  getStatusColor,
} from "@konfi/utils";
import type { MDXEditorMethods, MDXEditorProps } from "@mdxeditor/editor";
import { isNull, isUndefined, uniqBy } from "es-toolkit";
import { i18n, TFunction } from "i18next";
import dynamic from "next/dynamic";
import {
  type ComponentType,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Controller,
  FieldValues,
  useFormContext,
  useFormState,
  UseFormSetValue,
  useWatch,
} from "react-hook-form";
import {
  ColorPickerArea,
  ColorPickerContent,
  ColorPickerControl,
  ColorPickerEyeDropper,
  ColorPickerInput,
  ColorPickerRoot,
  ColorPickerSliders,
  ColorPickerTrigger,
} from "../../../ui/color-picker";
import { Switch } from "../../../ui/switch";
import {
  DatePickerInput,
  getDateTimeInputParts,
} from "../../date-picker-input";
import { Image } from "../../Image";
import { MaterialSymbol } from "../../MaterialSymbol";
import { DeadlineTimeGrid, DEFAULT_DEADLINE_TIME } from "./DeadlineTimeGrid";
import FileManager from "./FileManager";
import { GenerateInputWrapper } from "./GenerateInputWrapper";
import { GetCustomerDataDialog } from "./GetCustomerDataDialog";
import {
  InpostGeowidget,
  InpostGeowidgetPoint,
  useInpostGeowidgetToken,
} from "./InpostGeowidget";
import { RadioGridController } from "./RadioGridController";
import { RadioInput } from "./RadioInput";

const Select = dynamic<{
  field: FieldData;
  options: SelectOption[] | null | undefined;
  disabled: boolean;
}>(() => import("./Select").then((mod) => mod.SelectInput), { ssr: false });
const Slider = dynamic<{ field: FieldData }>(
  () => import("./Slider").then((mod) => mod.Slider),
  { ssr: false },
);
const MultiOptionSelect = dynamic<{
  _field: FieldData;
  options: SelectOption[] | null | undefined;
  t: TFunction;
}>(
  () =>
    import("./MultiOptionSelect").then(
      (mod) => mod.MultiOptionSelectFieldController,
    ),
  {
    ssr: false,
  },
);
const AsyncCreatableSelect = dynamic<{
  fieldData: FieldData;
  disabled: boolean;
  searchOptions: { label: any; value: any; object: any }[] | undefined;
  searchFn:
    | { [x: string]: (searchKey: string) => Promise<any[] | undefined | void> }
    | undefined;
  t: TFunction;
}>(
  () =>
    import("./AsyncCreatableSelect").then((mod) => mod.AsyncCreatableSelect),
  {
    ssr: false,
  },
);
const AsyncSelect = dynamic<{
  fieldData: FieldData;
  disabled: boolean;
  searchOptions: { label: any; value: any; object: any }[] | undefined;
  searchFn:
    | { [x: string]: (searchKey: string) => Promise<any[] | undefined | void> }
    | undefined;
  t: TFunction;
}>(() => import("./AsyncSelect").then((mod) => mod.AsyncSelect), {
  ssr: false,
});
const MdxPreview = dynamic<{ source: string | undefined }>(
  () => import("./MdxPreview").then((mod) => mod.Preview),
  { ssr: false },
);
const AddressAutocomplete = dynamic<{
  fieldData: FieldData;
  disabled: boolean;
  toaster: {
    create: (options: {
      title: string;
      description?: string;
      type?: "error" | "info" | "success" | "warning";
      duration?: number;
    }) => void;
  };
  t: TFunction;
  i18n: i18n;
}>(
  () =>
    import("./AddressAutocomplete").then(
      (mod) => mod.AddressAutocompleteFieldController,
    ),
  {
    ssr: false,
  },
);
const SuggestDeadline = dynamic<{ orderProcessingQueue: number; t: TFunction }>(
  () => import("./SuggestDeadline").then((mod) => mod.SuggestDeadline),
  { ssr: false },
);
const Editor = dynamic(() => import("./InitializedMDXEditor"), {
  ssr: false,
});
export const ForwardRefEditor = forwardRef<
  MDXEditorMethods,
  MDXEditorProps & { t: TFunction; fieldData?: FieldData }
>((props, ref) => <Editor {...props} editorRef={ref} t={props.t} />);
ForwardRefEditor.displayName = "ForwardRefEditor";

const getLocalDateTimeParts = (value?: string) => {
  return getDateTimeInputParts(value);
};

const createLocalDateTimeValue = (date: string, time: string) => {
  if (!date) {
    return "";
  }

  return `${date}T${time || DEFAULT_DEADLINE_TIME}`;
};

const DEFAULT_COLOR_PICKER_VALUE = "#ffffff";

type OrderItemWithShippingTypes = OrderItem & {
  product: NonNullable<OrderItem["product"]> & {
    shipping: {
      types: ShippingTypes[];
    };
  };
};

function hasKnownShippingTypes(
  item: OrderItem,
): item is OrderItemWithShippingTypes {
  return (
    Array.isArray(item.product?.shipping?.types) &&
    item.product.shipping.types.length > 0
  );
}

function getShippingTypesForItem(item: OrderItem): ShippingTypes[] {
  return hasKnownShippingTypes(item) ? item.product.shipping.types : [];
}

const getColorPickerDefaultValue = (value: unknown) => {
  const normalizedValue =
    typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : DEFAULT_COLOR_PICKER_VALUE;

  try {
    return parseColor(normalizedValue);
  } catch (error) {
    if (normalizedValue !== DEFAULT_COLOR_PICKER_VALUE) {
      console.error("Invalid color picker value:", value, error);
    }

    return parseColor(DEFAULT_COLOR_PICKER_VALUE);
  }
};

export const InputSwitcher = ({
  fieldArrayIndex,
  fieldData,
  disabled,
  searchOptions,
  searchFn,
  toaster,
  update,
  Generate,
  FileManagerActions,
  dynamicOptions,
  orderProcessingQueue = 0,
  t,
  i18n,
}: {
  fieldArrayIndex: number | undefined;
  fieldData: FieldData;
  disabled: boolean;
  searchOptions: { label: any; value: any; object: any }[] | undefined;
  searchFn:
    | { [x: string]: (searchKey: string) => Promise<any[] | undefined | void> }
    | undefined;
  toaster: any;
  update?: boolean;
  warehouses?: Warehouse[] | null;
  dynamicOptions?: {
    contacts?: SelectOption[];
    shippingAddresses?: SelectOption[];
    billingAddresses?: SelectOption[];
  };
  Generate?: React.ComponentType<{
    fieldData: FieldData;
    setValue: UseFormSetValue<FieldValues>;
    systemPrompt: string;
    context: string;
    onLoadingChange?: (loading: boolean) => void;
  }>;
  FileManagerActions?: ComponentType<{
    fieldData: FieldData;
  }>;
  orderProcessingQueue?: number;
  t: TFunction;
  i18n: i18n;
}) => {
  const editorRef = useRef<MDXEditorMethods>(null);
  const geowidgetRef = useRef<InpostGeowidget>(null);
  const configuredInpostGeowidgetToken = useInpostGeowidgetToken();
  const { setValue, register, getValues, control, getFieldState } =
    useFormContext();
  const fieldFormState = useFormState({
    control,
    exact: true,
    name: fieldData.name,
  });
  const fieldError = getFieldState(fieldData.name, fieldFormState).error;
  const [preview, setPreview] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [customerDataLookupSequence, setCustomerDataLookupSequence] =
    useState(0);
  const [rejectedFiles, setRejectedFiles] = useState<
    { file: File; errors: string[] }[]
  >([]);
  const locale = i18n.resolvedLanguage ?? i18n.language ?? "en-US";
  const datePlaceholder =
    fieldData.placeholder ||
    t("forms.placeholders.selectDate", {
      defaultValue: "Select date",
    });
  const shouldWatchValue = fieldData.watch || fieldData.type === "radioGrid";
  const value = useWatch({
    control,
    name: fieldData.name,
    disabled: !shouldWatchValue,
  });

  const resolveContextFieldName = useCallback(
    (contextField: string, currentFieldName: string) => {
      // If the context field starts with "root." or "/", it's a root-level field
      if (contextField.startsWith("root.") || contextField.startsWith("/")) {
        return contextField.replace(/^(root\.|\/)/, "");
      }

      // If the context field contains array notation or dots, return as is
      if (contextField.includes("[") || contextField.includes(".")) {
        return contextField;
      }

      // Extract array prefix from current field name (e.g., "cards[0]" from "cards[0].title")
      const arrayMatch = currentFieldName.match(/^(.+\[\d+\])\./);
      if (arrayMatch) {
        const arrayPrefix = arrayMatch[1];
        return `${arrayPrefix}.${contextField}`;
      }

      return contextField;
    },
    [],
  );

  const contextFieldNames = useMemo(() => {
    if (!fieldData.generate?.context) return [];

    return fieldData.generate.context.map((contextField) =>
      resolveContextFieldName(contextField, fieldData.name),
    );
  }, [fieldData.generate?.context, fieldData.name, resolveContextFieldName]);

  const watchedContextValues = useWatch({
    control,
    name: contextFieldNames,
    disabled: contextFieldNames.length === 0,
  });
  const context = useMemo(() => {
    if (!fieldData.generate?.context) return "{}";

    const contextObject = fieldData.generate.context.reduce(
      (acc, key, idx) => {
        // Use the original key (without array notation) as the object key
        const contextKey = key.includes("[") || key.includes(".") ? key : key;
        acc[contextKey] = watchedContextValues[idx] ?? t("ui.missingData");
        return acc;
      },
      {} as Record<string, any>,
    );

    return JSON.stringify(contextObject);
  }, [fieldData.generate?.context, watchedContextValues, t]);

  useEffect(() => {
    if (fieldData.type === "inpost-geowidget") {
      // Select initial point by providing it's name
      geowidgetRef.current?.selectPoint("05-200");
    }
  }, [fieldData.type]);

  const onPoint = useCallback(
    (point: InpostGeowidgetPoint) => {
      setValue("shipping", {
        name: point.name,
        street: point.address_details.street,
        number: point.address_details.building_number,
        local: point.address_details.flat_number,
        zip: point.address_details.post_code,
        city: point.address_details.city,
        country: t("ui.country.poland", { defaultValue: "Poland" }),
        metadata: point.location_description,
      });
    },
    [setValue, t],
  );

  const shouldWatchCustomer =
    fieldData.name === "customer" ||
    fieldData.name === "billing" ||
    fieldData.name === "shipping" ||
    fieldData.name === "contact";
  const watchCustomer = useWatch({
    control,
    disabled: !shouldWatchCustomer,
    name: "customer",
  }) as Customer | undefined;
  const shouldWatchItems = fieldData.name === "shippingOption";
  const watchItems = useWatch({
    control,
    disabled: !shouldWatchItems,
    name: "items",
  }) as OrderItem[] | undefined;

  const options = useMemo(() => {
    // If optionsKey is provided and dynamicOptions exist, use them
    if (fieldData.optionsKey && dynamicOptions) {
      return dynamicOptions[fieldData.optionsKey];
    }

    // Otherwise use the default options or field-specific handling
    if (
      fieldData.name === "shippingOption" &&
      fieldData.filterShippingOptionsByProduct &&
      watchItems
    ) {
      // The shippingOption handling is preserved
      if (!fieldData.options) return [];
      const hasCompleteProductShippingTypes =
        watchItems.length > 0 && watchItems.every(hasKnownShippingTypes);
      if (update && !hasCompleteProductShippingTypes) {
        return fieldData.options.map(
          (option) =>
            ({
              label: fieldData.enumName
                ? t(`${fieldData.enumName}.${option.value}`, {
                    defaultValue: option.label,
                  })
                : option.label,
              value: option.value,
            }) as SelectOption,
        );
      }

      const availableShippingOptions = getAvailableShippingOptions(
        watchItems.map(getShippingTypesForItem),
      );

      return fieldData.options
        .filter((option) =>
          availableShippingOptions?.includes(option.value as ShippingOptions),
        )
        .map(
          (option) =>
            ({
              label: fieldData.enumName
                ? t(`${fieldData.enumName}.${option.value}`, {
                    defaultValue: option.label,
                  })
                : option.label,
              value: option.value,
            }) as SelectOption,
        );
    }

    // Default case - use options from fieldData
    if (!fieldData.options) return [];

    return fieldData.options.map(
      (option) =>
        ({
          label: fieldData.enumName
            ? t(`${fieldData.enumName}.${option.value}`, {
                defaultValue: option.label,
              })
            : option.label,
          value: option.value,
          color: getStatusColor(option.value) ?? null,
        }) as SelectOption,
    );
  }, [fieldData, dynamicOptions, watchItems, t]);
  // Remove the effect that was setting contact and address states
  // Options are now passed via dynamicOptions prop

  // Helper function to wrap input with GenerateInputWrapper if generation is enabled
  const wrapWithGenerateInput = (inputElement: React.ReactNode) => {
    if (fieldData.generate) {
      return (
        <GenerateInputWrapper loading={isGenerating}>
          {inputElement}
        </GenerateInputWrapper>
      );
    }
    return inputElement;
  };

  const handleCustomerDataInputChange = useCallback(() => {
    if (!fieldData.getCustomerDataModal) {
      return;
    }

    setCustomerDataLookupSequence((current) => current + 1);
  }, [fieldData.getCustomerDataModal]);

  useEffect(() => {
    if (!watchCustomer) return;
    if (watchCustomer?.email !== undefined) {
      const email = watchCustomer.email;
      setValue("email", email);
    } else {
      setValue("email", "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchCustomer]);

  // Synchronize editor content when mdxPreview is enabled and value changes
  useEffect(() => {
    if (
      fieldData.type === "textarea" &&
      fieldData.mdxPreview &&
      editorRef.current &&
      value !== undefined
    ) {
      editorRef.current.setMarkdown(value || "");
    }
  }, [fieldData.type, fieldData.mdxPreview, value]);

  const input = useMemo(() => {
    switch (fieldData.type) {
      case "checkbox":
        return (
          <Controller
            name={fieldData.name}
            control={control}
            render={({ field }) => (
              <Switch
                name={field.name}
                colorPalette={"primary"}
                checked={Boolean(field.value)}
                onCheckedChange={({ checked }) => {
                  const nextChecked = Boolean(checked);

                  field.onChange(nextChecked);

                  if (field.name !== "exactTime") {
                    return;
                  }

                  const deadlineValue = getValues("deadlineString");

                  if (typeof deadlineValue !== "string") {
                    return;
                  }

                  const { date, time } = getLocalDateTimeParts(deadlineValue);
                  const normalizedDeadline = nextChecked
                    ? createLocalDateTimeValue(date, time)
                    : date;

                  if (normalizedDeadline === deadlineValue) {
                    return;
                  }

                  setValue("deadlineString", normalizedDeadline, {
                    shouldDirty: true,
                    shouldTouch: true,
                    shouldValidate: true,
                  });
                }}
                inputProps={{ onBlur: field.onBlur }}
                fontWeight={"600"}
              >
                {fieldData.placeholder}
              </Switch>
            )}
          />
        );
      case "select":
        return (
          <Select field={fieldData} options={options} disabled={disabled} />
        );
      case "textarea":
        return wrapWithGenerateInput(
          fieldData.mdxPreview ? (
            <Controller
              name={fieldData.name}
              control={control}
              render={({ field }) => (
                <ForwardRefEditor
                  ref={editorRef}
                  fieldData={fieldData}
                  markdown={field.value}
                  onChange={field.onChange}
                  t={t}
                />
              )}
            />
          ) : fieldData.watch ? (
            <Controller
              name={fieldData.name}
              control={control}
              render={({ field }) => (
                <Textarea
                  bg={{ base: "white", _dark: "gray.950" }}
                  ref={field.ref}
                  name={field.name}
                  value={typeof field.value === "string" ? field.value : ""}
                  onBlur={field.onBlur}
                  onChange={(event) => {
                    field.onChange(event);
                    handleCustomerDataInputChange();
                  }}
                  placeholder={fieldData.placeholder}
                  resize={"vertical"}
                  rounded={"3xl"}
                  autoresize
                  disabled={disabled}
                  autoComplete={fieldData.autocomplete}
                  required={fieldData.isRequired}
                />
              )}
            />
          ) : (
            <Textarea
              bg={{ base: "white", _dark: "gray.950" }}
              {...register(fieldData.name, {
                onChange: handleCustomerDataInputChange,
              })}
              placeholder={fieldData.placeholder}
              resize={"vertical"}
              rounded={"3xl"}
              autoresize
              disabled={disabled}
              autoComplete={fieldData.autocomplete}
              required={fieldData.isRequired}
            />
          ),
        );
      case "date":
        return wrapWithGenerateInput(
          <Controller
            name={fieldData.name}
            control={control}
            render={({ field }) => (
              <DatePickerInput
                value={field.value ?? ""}
                onValueChange={field.onChange}
                locale={locale}
                disabled={disabled}
                showClearButton={fieldData.clearable}
                clearLabel={t("forms.labels.clearDate", {
                  defaultValue: "Clear date",
                })}
                todayLabel={t("common.todaysDate", {
                  defaultValue: "Today's date",
                })}
                triggerLabel={fieldData.label ?? fieldData.placeholder}
                inputProps={{
                  name: field.name,
                  ref: field.ref,
                  onBlur: field.onBlur,
                  placeholder: datePlaceholder,
                  autoComplete: fieldData.autocomplete,
                  required: fieldData.isRequired,
                  disabled,
                  pattern: fieldData.pattern,
                  "aria-label": fieldData.label ?? fieldData.placeholder,
                }}
              />
            )}
          />,
        );
      case "datetime-local":
        return wrapWithGenerateInput(
          <Controller
            name={fieldData.name}
            control={control}
            render={({ field }) => {
              const { date, time } = getLocalDateTimeParts(field.value);

              return (
                <DatePickerInput
                  value={field.value ?? ""}
                  onValueChange={(nextDate) =>
                    field.onChange(createLocalDateTimeValue(nextDate, time))
                  }
                  locale={locale}
                  closeOnSelect={false}
                  format={(selectedDate) =>
                    `${selectedDate.toString()} ${time || DEFAULT_DEADLINE_TIME}`
                  }
                  disabled={disabled}
                  todayLabel={t("common.todaysDate", {
                    defaultValue: "Today's date",
                  })}
                  triggerLabel={fieldData.label ?? fieldData.placeholder}
                  inputProps={{
                    name: field.name,
                    ref: field.ref,
                    onBlur: field.onBlur,
                    placeholder: datePlaceholder,
                    autoComplete: fieldData.autocomplete,
                    required: fieldData.isRequired,
                    disabled,
                    pattern: fieldData.pattern,
                    "aria-label": fieldData.label ?? fieldData.placeholder,
                  }}
                  contentEndElement={({ close }) => (
                    <DeadlineTimeGrid
                      value={time}
                      label={t("forms.labels.time", {
                        defaultValue: "Time",
                      })}
                      disabled={disabled || !date}
                      onValueChange={(nextTime) => {
                        field.onChange(
                          createLocalDateTimeValue(date, nextTime),
                        );
                        close();
                      }}
                    />
                  )}
                />
              );
            }}
          />,
        );
      case "slider":
        return <Slider field={fieldData} />;
      case "multiSelect":
        return <MultiOptionSelect _field={fieldData} options={options} t={t} />;
      case "search":
        return fieldData.isCreatable ? (
          <>
            <AsyncCreatableSelect
              fieldData={fieldData}
              disabled={disabled}
              searchOptions={searchOptions}
              searchFn={searchFn}
              t={t}
            />{" "}
            {fieldData.name === "customer" &&
              typeof watchCustomer === "object" &&
              watchCustomer?.specialNotes && (
                <Alert.Root
                  status={"warning"}
                  rounded={"3xl"}
                  mt={2}
                  borderRadius="3xl"
                >
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>{t("ui.attention")}</Alert.Title>
                    <Alert.Description>
                      {watchCustomer.specialNotes}
                    </Alert.Description>
                  </Alert.Content>
                </Alert.Root>
              )}{" "}
          </>
        ) : (
          <AsyncSelect
            fieldData={fieldData}
            disabled={disabled}
            searchOptions={searchOptions}
            searchFn={searchFn}
            t={t}
          />
        );
      case "radio":
        return !isUndefined(options) && !isNull(options) ? (
          <RadioInput
            name={fieldData.name}
            options={options}
            columns={1}
            isObject={fieldData.isObject}
            t={t}
            i18n={i18n}
          />
        ) : null;
      case "radioGrid":
        return !isUndefined(options) && !isNull(options) ? (
          <RadioGridController
            name={fieldData.name}
            options={options}
            value={value ?? getValues(fieldData.name)}
            onChange={(selectedValue) =>
              setValue(fieldData.name, selectedValue, {
                shouldDirty: true,
                shouldTouch: true,
                shouldValidate: true,
              })
            }
            gridColumns={fieldData.gridColumns}
            showImages={fieldData.showImages}
            imageUrlTemplate={fieldData.imageUrlTemplate}
            invalid={!!fieldError}
          />
        ) : null;
      case "addressAutocomplete":
        return (
          <AddressAutocomplete
            fieldData={fieldData}
            disabled={disabled}
            toaster={toaster}
            t={t}
            i18n={i18n}
          />
        );
      case "inpost-geowidget":
        return (
          <Box
            borderRadius="md"
            outline={fieldError ? "2px solid" : undefined}
            outlineColor={fieldError ? "border.error" : undefined}
            outlineOffset="2px"
          >
            <InpostGeowidget
              ref={geowidgetRef}
              token={
                configuredInpostGeowidgetToken ??
                process.env.NEXT_PUBLIC_INPOST_GEOWIDGET_TOKEN ??
                ""
              }
              onPoint={(point) => onPoint(point)}
              language={"pl"}
              config={"parcelCollect"}
            />
            {value?.name && (
              <Box mt={2}>
                <Heading mb={2} as={"h3"} fontSize={"xl"}>
                  {t("ui.fileUpload.selectedPaczkomat")}
                </Heading>
                <Box w={"200px"}>
                  <Image
                    ratio={10}
                    src={"/assets/paczkomat-logo-poziom.svg"}
                    alt={t("ui.paczkomat")}
                    width={50}
                    height={50}
                    priority={false}
                    transparentBackground={true}
                  />
                </Box>
                <Text mt={2} lineHeight={1.2}>
                  {t("ui.paczkomat")} {value?.name}
                  <br />
                  <chakra.span fontWeight={"bold"} fontSize={"xl"}>
                    {formatStreetLine(
                      value?.street,
                      value?.number,
                      value?.local,
                    )}
                    {", "}
                    {value?.city}
                    <br />
                  </chakra.span>
                  <chakra.span fontSize={"lg"}>{value?.metadata}</chakra.span>
                </Text>
              </Box>
            )}
          </Box>
        );
      case "groupedIndexedSearch":
        return null;
      case "fileInputDropzone":
        return (
          <Controller
            name={fieldData.name}
            control={control}
            render={({ field }) => (
              <Box w={fieldData.imageProps?.rootProps?.w ?? "auto"}>
                <FileUpload.Root
                  name={field.name}
                  maxW={fieldData.imageProps?.rootProps?.maxW ?? "xl"}
                  w={fieldData.imageProps?.rootProps?.w ?? "100%"}
                  alignItems="stretch"
                  maxFiles={fieldData.imageProps?.maxNumber ?? 1}
                  maxFileSize={
                    !isUndefined(fieldData.imageProps?.maxFileSize)
                      ? fieldData.imageProps.maxFileSize * 1024 * 1024
                      : 5 * 1024 * 1024
                  }
                  accept={
                    fieldData.imageProps?.acceptType ?? [
                      "image/jpeg",
                      "image/jpg",
                      "image/png",
                      "image/tiff",
                    ]
                  }
                  onFileAccept={({ files }) => {
                    field.onChange(uniqBy(files, (file) => file.name));
                    setRejectedFiles([]);
                  }}
                  onFileReject={({ files }) => {
                    setRejectedFiles(files);
                  }}
                  invalid={fieldError !== undefined}
                >
                  <FileUpload.HiddenInput />
                  <FileUpload.Dropzone
                    minH={fieldData.imageProps?.dropzoneProps?.minH}
                    py={fieldData.imageProps?.dropzoneProps?.py}
                  >
                    <FileUpload.DropzoneContent>
                      <Box>{t("ui.fileUpload.dragAndDrop")}</Box>
                      <Box color="fg.muted">
                        {t("ui.fileUpload.fileDescription", {
                          types: `${fieldData.imageProps?.acceptType?.map((type) => `.${FileMimeType[type]}`).join(", ") ?? ".jpeg, .jpg, .png, .tiff"}`,
                          maxSize: !isUndefined(
                            fieldData.imageProps?.maxFileSize,
                          )
                            ? fieldData.imageProps.maxFileSize
                            : 5,
                          maxFiles: fieldData.imageProps?.maxNumber ?? 1,
                        })}
                      </Box>
                    </FileUpload.DropzoneContent>
                  </FileUpload.Dropzone>
                  <FileUpload.List files={field.value} />
                  <FileUpload.ClearTrigger
                    asChild
                    onClick={() => field.onChange([])}
                  >
                    <Button
                      variant="outline"
                      colorScheme="primary"
                      size="sm"
                      mt={2}
                    >
                      {t("ui.fileUpload.clearFiles")}
                    </Button>
                  </FileUpload.ClearTrigger>
                </FileUpload.Root>
                {rejectedFiles.length > 0 && (
                  <Alert.Root status="error" mt={2}>
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>
                        {t("ui.fileUpload.rejectedFilesTitle", {
                          defaultValue: "Some files couldn't be uploaded",
                        })}
                      </Alert.Title>
                      <Alert.Description>
                        {rejectedFiles.map((rejection, index) => (
                          <Box key={index}>
                            <Text fontWeight="semibold">
                              {rejection.file.name}
                            </Text>
                            {rejection.errors.map((error, errorIndex) => (
                              <Text key={errorIndex} fontSize="sm">
                                {error === "FILE_INVALID_TYPE"
                                  ? t("ui.fileUpload.invalidFileType", {
                                      defaultValue: "Invalid file type",
                                    })
                                  : error === "FILE_TOO_LARGE"
                                    ? t("ui.fileUpload.fileTooLarge", {
                                        defaultValue: "File is too large",
                                      })
                                    : error === "TOO_MANY_FILES"
                                      ? t("ui.fileUpload.tooManyFiles", {
                                          defaultValue: "Too many files",
                                        })
                                      : error}
                              </Text>
                            ))}
                          </Box>
                        ))}
                      </Alert.Description>
                    </Alert.Content>
                  </Alert.Root>
                )}
              </Box>
            )}
          />
        );
      case "colorPicker":
        return (
          <Controller
            name={fieldData.name}
            control={control}
            render={({ field }) => (
              <ColorPickerRoot
                name={field.name}
                defaultValue={getColorPickerDefaultValue(field.value)}
                onValueChange={(e) => field.onChange(e.valueAsString)}
                positioning={{ strategy: "fixed", hideWhenDetached: true }}
                invalid={!!fieldError}
              >
                <ColorPickerControl>
                  <ColorPickerInput />
                  <ColorPickerTrigger />
                </ColorPickerControl>
                <ColorPickerContent portalled={false} zIndex={1401}>
                  <ColorPickerArea />
                  <HStack>
                    <ColorPickerEyeDropper />
                    <ColorPickerSliders />
                  </HStack>
                </ColorPickerContent>
              </ColorPickerRoot>
            )}
          />
        );
      case "fileManager":
        return (
          <FileManager
            fieldData={fieldData}
            t={t}
            Actions={FileManagerActions}
          />
        );
      default:
        return wrapWithGenerateInput(
          fieldData.watch ? (
            <Controller
              name={fieldData.name}
              control={control}
              render={({ field }) => (
                <Input
                  bg={{ base: "white", _dark: "gray.950" }}
                  ref={field.ref}
                  name={field.name}
                  value={
                    typeof field.value === "string" ||
                    typeof field.value === "number"
                      ? field.value
                      : ""
                  }
                  onBlur={field.onBlur}
                  onChange={(event) => {
                    field.onChange(event);
                    handleCustomerDataInputChange();
                  }}
                  placeholder={fieldData.placeholder}
                  type={fieldData.type || "text"}
                  autoComplete={fieldData.autocomplete}
                  step={fieldData.type === "number" ? 0.01 : undefined}
                  pattern={fieldData.pattern}
                  disabled={disabled}
                  readOnly={disabled}
                  required={fieldData.isRequired}
                />
              )}
            />
          ) : (
            <Input
              bg={{ base: "white", _dark: "gray.950" }}
              {...register(fieldData.name, {
                onChange: handleCustomerDataInputChange,
              })}
              placeholder={fieldData.placeholder}
              type={fieldData.type || "text"}
              autoComplete={fieldData.autocomplete}
              step={fieldData.type === "number" ? 0.01 : undefined}
              pattern={fieldData.pattern}
              disabled={disabled}
              readOnly={disabled}
              required={fieldData.isRequired}
            />
          ),
        );
    }
  }, [
    control,
    fieldArrayIndex,
    fieldData,
    disabled,
    options,
    register,
    searchFn,
    searchOptions,
    toaster,
    value,
    watchCustomer,
    onPoint,
    dynamicOptions,
    isGenerating,
    FileManagerActions,
    handleCustomerDataInputChange,
    locale,
    datePlaceholder,
    t,
  ]);

  // Check if dynamic options are required but not provided
  if (
    fieldData.name === "shipping" &&
    fieldData.optionsKey === "shippingAddresses" &&
    (!dynamicOptions?.shippingAddresses ||
      dynamicOptions.shippingAddresses.length === 0)
  )
    return null;
  if (
    fieldData.name === "billing" &&
    fieldData.optionsKey === "billingAddresses" &&
    (!dynamicOptions?.billingAddresses ||
      dynamicOptions.billingAddresses.length === 0)
  )
    return null;

  return (
    <>
      {fieldData.mdxPreview ? (
        <Button
          top={fieldData.generate ? "-10" : "-4"}
          right={0}
          position={"absolute"}
          colorPalette={"primary"}
          size={"xs"}
          variant={"ghost"}
          onClick={() => setPreview(!preview)}
        >
          <MaterialSymbol>preview</MaterialSymbol>
          {t("ui.preview")}
        </Button>
      ) : null}
      {fieldData.generate && Generate && (
        <Generate
          fieldData={fieldData}
          setValue={setValue}
          systemPrompt={fieldData.generate.systemPrompt}
          context={context}
          key={context}
          onLoadingChange={setIsGenerating}
        />
      )}
      {fieldData.mdxPreview ? (
        preview ? (
          <MdxPreview source={value} />
        ) : (
          input
        )
      ) : (
        input
      )}
      {fieldData.getCustomerDataModal && (
        <GetCustomerDataDialog
          fieldName={fieldData.name}
          lookupSequence={customerDataLookupSequence}
          t={t}
        />
      )}
      {fieldData.name === "deadlineString" && (
        <SuggestDeadline t={t} orderProcessingQueue={orderProcessingQueue} />
      )}
    </>
  );
};
