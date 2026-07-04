"use client";

import {
  Box,
  Button,
  Heading,
  Separator,
  Show,
  Stack,
  Text,
} from "@chakra-ui/react";
import {
  AddressTypeEnum,
  Contact,
  FieldData,
  FormData,
  Locale,
  SelectOption,
  ShippingOptions,
  Warehouse,
} from "@konfi/types";
import { generateAddressOptions, generateContactOptions } from "@konfi/utils";
import { isUndefined } from "es-toolkit";
import { isEqual } from "es-toolkit/compat";
import { i18n, TFunction } from "i18next";
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
} from "react";
import {
  FieldErrors,
  FieldValues,
  FormProvider,
  UseFieldArrayInsert,
  UseFieldArrayPrepend,
  UseFormReturn,
  UseFormSetValue,
  useWatch,
} from "react-hook-form";
import { toaster } from "../../ui/toaster";
import { MaterialSymbol } from "../MaterialSymbol";
import { FieldArray } from "./field-controllers/FieldArray";
import { FieldController } from "./field-controllers/FieldController";
import { SectionSummary } from "./section-summary/SectionSummary";

const createEmptyContact = (): Contact => ({
  name: "",
  email: "",
  phone: "",
  active: true,
});

function matchesContactOption(
  contact: Contact,
  option: Pick<SelectOption, "value" | "object">,
) {
  return isEqual(option.object, contact) || option.value === contact.name;
}

const COMPOSING_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "file",
  "hidden",
  "image",
  "radio",
  "reset",
  "submit",
]);
const IMPLICIT_SUBMIT_WINDOW_MS = 250;
type SubmitLikeEvent = {
  currentTarget: HTMLFormElement;
  nativeEvent: Event;
};

function shouldPreventImplicitSubmit(
  event: KeyboardEvent<HTMLFormElement>,
  submitOnEnter: boolean,
) {
  if (
    submitOnEnter ||
    event.defaultPrevented ||
    event.key !== "Enter" ||
    event.nativeEvent.isComposing ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  ) {
    return false;
  }

  const target = event.target;

  if (
    !target ||
    typeof target !== "object" ||
    !("closest" in target) ||
    typeof target.closest !== "function"
  ) {
    return false;
  }

  if ("isContentEditable" in target && target.isContentEditable) {
    return false;
  }

  const tagName =
    "tagName" in target && typeof target.tagName === "string"
      ? target.tagName.toUpperCase()
      : "";

  if (tagName === "TEXTAREA") {
    return false;
  }

  if (
    target.closest(
      [
        "[data-allow-enter-submit='true']",
        "[data-scope='combobox'][data-state='open']",
        "[role='combobox'][aria-expanded='true']",
        "button",
        "[role='button']",
      ].join(", "),
    )
  ) {
    return false;
  }

  if (tagName !== "INPUT") {
    return false;
  }

  const inputType =
    "getAttribute" in target && typeof target.getAttribute === "function"
      ? (target.getAttribute("type")?.toLowerCase() ?? "text")
      : "text";

  return !COMPOSING_INPUT_TYPES.has(inputType);
}

function shouldTrackImplicitSubmit(
  event: KeyboardEvent<HTMLFormElement>,
  submitOnEnter: boolean,
) {
  if (
    submitOnEnter ||
    event.key !== "Enter" ||
    event.isDefaultPrevented() ||
    event.nativeEvent.isComposing ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  ) {
    return false;
  }

  const target = event.target;

  if (
    !target ||
    typeof target !== "object" ||
    !("closest" in target) ||
    typeof target.closest !== "function"
  ) {
    return false;
  }

  if ("isContentEditable" in target && target.isContentEditable) {
    return false;
  }

  const tagName =
    "tagName" in target && typeof target.tagName === "string"
      ? target.tagName.toUpperCase()
      : "";

  if (tagName !== "INPUT") {
    return false;
  }

  return !target.closest(
    ["[data-allow-enter-submit='true']", "button", "[role='button']"].join(
      ", ",
    ),
  );
}

function isExplicitSubmitTrigger(target: unknown) {
  if (
    !target ||
    typeof target !== "object" ||
    !("tagName" in target) ||
    typeof target.tagName !== "string"
  ) {
    return false;
  }

  const tagName = target.tagName.toUpperCase();

  if (tagName === "BUTTON") {
    return true;
  }

  if (tagName !== "INPUT") {
    return false;
  }

  const inputType =
    "getAttribute" in target && typeof target.getAttribute === "function"
      ? (target.getAttribute("type")?.toLowerCase() ?? "text")
      : "text";

  return inputType === "image" || inputType === "submit";
}

function getFormSectionKey(
  section: FormData["sections"][number],
  index: number,
) {
  return `${section.name ?? section.heading ?? "section"}:${index}`;
}

function shouldPreventImplicitSubmitOnSubmit(
  event: SubmitLikeEvent,
  submitOnEnter: boolean,
) {
  if (submitOnEnter) {
    return false;
  }

  const nativeEvent = event.nativeEvent;

  if (
    nativeEvent &&
    typeof nativeEvent === "object" &&
    "submitter" in nativeEvent &&
    isExplicitSubmitTrigger(nativeEvent.submitter)
  ) {
    return false;
  }

  return !isExplicitSubmitTrigger(
    event.currentTarget.ownerDocument.activeElement,
  );
}

export interface FormControllerProps {
  methods?: UseFormReturn<any, any, any>;
  buttonLeftIcon?: string;
  buttonLabel?: string;
  formData: FormData;
  update?: boolean;
  searchResults?: { [x: string]: any[] | null };
  searchFn?: {
    [x: string]: (searchKey: string) => Promise<any[] | undefined | void>;
  };
  handleSubmit: (
    data: any,
  ) => void | Promise<void> | Promise<string | undefined>;
  handleInvalid?: (errors: FieldErrors<FieldValues>) => void;
  isProductForm?: boolean;
  warehouses?: Warehouse[] | null;
  GenerateOrderItems?: ({
    prepend,
  }: {
    prepend: UseFieldArrayPrepend<FieldValues, string>;
  }) => JSX.Element | null;
  Templates?: ({ option }: { option: string }) => JSX.Element;
  pricesMatrix?: React.ReactNode;
  children?: React.ReactNode;
  afterAddressSection?: React.ReactNode;
  GetCustomerDataDialog?: React.ReactNode;
  ProductType?: React.ReactNode;
  Attributes?: ({
    isProductForm,
  }: {
    isProductForm?: boolean;
  }) => JSX.Element | null;
  PageCountConfig?: ({
    isProductForm,
  }: {
    isProductForm?: boolean;
  }) => JSX.Element | null;
  DynamicPricingConfig?: ({
    isProductForm,
  }: {
    isProductForm?: boolean;
  }) => JSX.Element | null;
  PriceOffsets?: ({
    isProductForm,
  }: {
    isProductForm?: boolean;
  }) => JSX.Element | null;
  AttributeDependencies?: ({
    isProductForm,
  }: {
    isProductForm?: boolean;
  }) => JSX.Element | null;
  By?: React.ReactNode;
  ToChannel?: React.ReactNode;
  CombinationInput?: ({
    index,
    insertAction,
  }: {
    index: number;
    insertAction: UseFieldArrayInsert<FieldValues, string>;
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
    onLoadingChange?: (loading: boolean) => void;
  }>;
  FileManagerActions?: React.ComponentType<{
    fieldData: FieldData;
  }>;
  orderProcessingQueue?: number;
  submitDisabled?: boolean;
  submitLoading?: boolean;
  submitLoadingLabel?: string;
  renderAfterField?: (context: {
    fieldData: FieldData;
    sectionName?: string;
    fieldArrayIndex?: number;
  }) => React.ReactNode;
  t: TFunction;
  i18n: i18n;
  noSeparator?: boolean;
  submitOnEnter?: boolean;
}

export function FormController({
  methods,
  buttonLeftIcon,
  buttonLabel,
  formData,
  update = false,
  searchResults,
  searchFn,
  handleSubmit,
  handleInvalid,
  isProductForm = false,
  warehouses = null,
  GenerateOrderItems,
  Templates,
  pricesMatrix,
  children,
  afterAddressSection,
  GetCustomerDataDialog,
  ProductType,
  Attributes,
  PageCountConfig,
  DynamicPricingConfig,
  PriceOffsets,
  AttributeDependencies,
  By,
  ToChannel,
  CombinationInput,
  ProductGroupedIndexedSearch,
  Generate,
  FileManagerActions,
  orderProcessingQueue,
  submitDisabled = false,
  submitLoading = false,
  submitLoadingLabel,
  renderAfterField,
  t,
  i18n,
  noSeparator = false,
  submitOnEnter = false,
}: FormControllerProps) {
  const [submitInFlight, setSubmitInFlight] = useState(false);
  const submitInFlightRef = useRef(false);

  const onSubmit = async (data: any) => {
    try {
      await Promise.resolve(handleSubmit(data));
    } catch (error) {
      console.error("Form submission error:", error);
    }
  };
  const onInvalid = (errors: FieldErrors<FieldValues>) => {
    console.error(errors);
    handleInvalid?.(errors);
  };

  if (isUndefined(methods)) {
    toaster.error({
      title: "Cos poszło nie tak",
      description: "Form methods are undefined",
      duration: 3000,
    });
    return null;
  }
  const handleFormSubmit = methods.handleSubmit(onSubmit, onInvalid);
  const lastImplicitSubmitAt = useRef<number | null>(null);
  const isSubmitDisabled =
    submitInFlight || methods.formState.isSubmitting || submitDisabled;
  const isSubmitLoading =
    submitInFlight || methods.formState.isSubmitting || submitLoading;

  const submitForm = (event: Parameters<typeof handleFormSubmit>[0]) => {
    if (!event) {
      return;
    }

    if (submitInFlightRef.current) {
      event.preventDefault();
      return;
    }

    submitInFlightRef.current = true;
    setSubmitInFlight(true);

    void handleFormSubmit(event).finally(() => {
      submitInFlightRef.current = false;
      setSubmitInFlight(false);
    });
  };

  // Generate dynamic options for contacts and addresses
  const watchCustomer = useWatch({
    control: methods.control,
    name: "customer",
  });
  const watchShippingOption = useWatch({
    control: methods.control,
    name: "shippingOption",
  });

  const contactOptions = useMemo(() => {
    return generateContactOptions(watchCustomer?.contacts);
  }, [watchCustomer?.contacts]);

  const hasContactSelector = useMemo(
    () =>
      formData.sections.some((section) =>
        section.fields?.some(
          (field) =>
            field.name === "contact" && field.optionsKey === "contacts",
        ),
      ),
    [formData.sections],
  );

  const customerKey = useMemo(() => {
    if (!watchCustomer) return "none";
    if (typeof watchCustomer === "string") {
      return watchCustomer.trim() || "none";
    }

    const customerRecord = watchCustomer as { id?: string; name?: string };
    const id = customerRecord.id?.trim();
    if (id) return id;

    const name = customerRecord.name?.trim();
    return name || "none";
  }, [watchCustomer]);

  const previousCustomerKey = useRef<string | null>(null);
  const previousContactOptions = useRef<SelectOption[]>([]);

  useEffect(() => {
    if (!hasContactSelector) return;

    if (previousCustomerKey.current === customerKey) {
      previousContactOptions.current = contactOptions;
      return;
    }

    const previousOptions = previousContactOptions.current;
    previousCustomerKey.current = customerKey;
    previousContactOptions.current = contactOptions;

    const currentContact = methods.getValues("contact") as Contact | undefined;
    const contactName = currentContact?.name?.trim() ?? "";
    const contactEmail = currentContact?.email?.trim() ?? "";
    const contactPhone = currentContact?.phone?.trim() ?? "";
    const contactIsEmpty = !contactName && !contactEmail && !contactPhone;

    const hasContactOptions = contactOptions.length > 0;
    const matchesOption = hasContactOptions
      ? contactOptions.some((option) =>
          currentContact ? matchesContactOption(currentContact, option) : false,
        )
      : false;

    // In update flows we should preserve existing contact details even if
    // they don't match active customer contacts (e.g. historical/manual contact).
    if (update && !contactIsEmpty) return;

    if (contactIsEmpty) {
      if (currentContact?.active !== true) {
        methods.setValue("contact", createEmptyContact(), {
          shouldDirty: false,
          shouldTouch: false,
        });
      }
      return;
    }

    if (matchesOption) return;

    const matchedPreviousOption = previousOptions.some((option) =>
      isEqual(option.object, currentContact),
    );

    if (!matchedPreviousOption) return;

    methods.setValue("contact", createEmptyContact(), {
      shouldDirty: true,
      shouldTouch: true,
    });
  }, [contactOptions, customerKey, hasContactSelector, methods, update]);

  const shippingAddressOptions = useMemo(() => {
    return generateAddressOptions(
      watchShippingOption === ShippingOptions.PERSONAL_COLLECTION
        ? []
        : watchCustomer?.addresses,
      AddressTypeEnum.SHIPPING,
      [
        ShippingOptions.CUSTOM,
        ShippingOptions.PERSONAL_COLLECTION,
        ShippingOptions.COMPANY_COURIER,
      ].includes(watchShippingOption)
        ? warehouses
        : [],
    );
  }, [watchCustomer?.addresses, watchShippingOption, warehouses]);

  const billingAddressOptions = useMemo(() => {
    return generateAddressOptions(
      watchCustomer?.addresses,
      AddressTypeEnum.BILLING,
    );
  }, [watchCustomer?.addresses]);
  const dynamicOptions = useMemo(
    () => ({
      contacts: contactOptions,
      shippingAddresses: shippingAddressOptions,
      billingAddresses: billingAddressOptions,
    }),
    [billingAddressOptions, contactOptions, shippingAddressOptions],
  );
  const sectionIdPrefix = useId();

  // Pre-subscribe to all section-level dependencies to ensure reactive updates
  const sectionDependencyNames = useMemo(() => {
    const names = new Set<string>();

    for (const section of formData.sections) {
      if (typeof section.dependsOn === "string") {
        names.add(section.dependsOn);
      }
    }

    return [...names];
  }, [formData.sections]);
  const sectionDependencyValues = useWatch({
    control: methods.control,
    disabled: sectionDependencyNames.length === 0,
    name: sectionDependencyNames,
  }) as unknown[] | undefined;
  const sectionDefaultsSignature = useMemo(
    () =>
      formData.sections
        .map((section, index) =>
          [
            getFormSectionKey(section, index),
            (section.isDefaultExpanded ?? true) ? "1" : "0",
          ].join("\u001e"),
        )
        .join("\u001f"),
    [formData.sections],
  );
  const defaultOpenSectionKeys = useMemo(() => {
    const keys: string[] = [];

    for (const sectionDefault of sectionDefaultsSignature.split("\u001f")) {
      if (!sectionDefault) continue;

      const [sectionKey, defaultOpen] = sectionDefault.split("\u001e");

      if (defaultOpen !== "1") {
        continue;
      }

      keys.push(sectionKey);

      if (!formData.allowMultiple) {
        break;
      }
    }

    return keys;
  }, [formData.allowMultiple, sectionDefaultsSignature]);
  const [openSectionKeys, setOpenSectionKeys] = useState<string[]>(
    defaultOpenSectionKeys,
  );
  const advancedControls = (
    <>
      <Show when={Attributes}>
        {Attributes && <Attributes isProductForm={isProductForm} />}
      </Show>
      <Show when={PageCountConfig}>
        {PageCountConfig && <PageCountConfig isProductForm={isProductForm} />}
      </Show>
      <Show when={DynamicPricingConfig}>
        {DynamicPricingConfig && (
          <DynamicPricingConfig isProductForm={isProductForm} />
        )}
      </Show>
      <Show when={PriceOffsets}>
        {PriceOffsets && <PriceOffsets isProductForm={isProductForm} />}
      </Show>
      <Show when={AttributeDependencies}>
        {AttributeDependencies && (
          <AttributeDependencies isProductForm={isProductForm} />
        )}
      </Show>
    </>
  );
  const hasProductAdvancedControls = Boolean(
    isProductForm &&
    (Attributes ||
      PageCountConfig ||
      DynamicPricingConfig ||
      PriceOffsets ||
      AttributeDependencies ||
      pricesMatrix),
  );
  useEffect(() => {
    setOpenSectionKeys(defaultOpenSectionKeys);
  }, [defaultOpenSectionKeys]);
  const handleSectionOpenChange = useCallback(
    (sectionKey: string, open: boolean) => {
      setOpenSectionKeys((currentKeys) => {
        if (!formData.allowMultiple) {
          return open ? [sectionKey] : [];
        }

        const hasKey = currentKeys.includes(sectionKey);

        if (open) {
          return hasKey ? currentKeys : [...currentKeys, sectionKey];
        }

        return hasKey
          ? currentKeys.filter((currentKey) => currentKey !== sectionKey)
          : currentKeys;
      });
    },
    [formData.allowMultiple],
  );

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={(event) => {
          const shouldBlockRecentImplicitSubmit =
            lastImplicitSubmitAt.current !== null &&
            event.timeStamp - lastImplicitSubmitAt.current <
              IMPLICIT_SUBMIT_WINDOW_MS;

          lastImplicitSubmitAt.current = null;

          if (shouldPreventImplicitSubmitOnSubmit(event, submitOnEnter)) {
            event.preventDefault();
            return;
          }

          if (shouldBlockRecentImplicitSubmit) {
            event.preventDefault();
            return;
          }

          submitForm(event);
        }}
        onKeyDownCapture={(event) => {
          if (shouldTrackImplicitSubmit(event, submitOnEnter)) {
            lastImplicitSubmitAt.current = event.timeStamp;
          }

          if (shouldPreventImplicitSubmit(event, submitOnEnter)) {
            event.preventDefault();
          }
        }}
      >
        {GetCustomerDataDialog}
        {ProductType}
        {children}
        {formData.sections.map((section, index) => {
          // Resolve current dependency value (pre-subscribed via useWatch above)
          let dependsOn: unknown = undefined;
          if (
            !isUndefined(section.dependsOn) &&
            typeof section.dependsOn === "string"
          ) {
            const idx = sectionDependencyNames.indexOf(section.dependsOn);
            dependsOn = idx !== -1 ? sectionDependencyValues?.[idx] : undefined;
          }
          const isVisible = !isUndefined(section.dependencyValue)
            ? Array.isArray(section.dependencyValue)
              ? section.dependencyValue.includes(`${dependsOn}`)
              : `${dependsOn}` === section.dependencyValue
            : true;

          if (!isVisible) {
            return null;
          }

          const shouldRenderAfterAddressSection =
            afterAddressSection && section.dependsOn === "shippingOption";
          const sectionKey = getFormSectionKey(section, index);
          const sectionContentId = `${sectionIdPrefix}-${index}`;
          const sectionIsOpen =
            !formData.allowToggle || openSectionKeys.includes(sectionKey);
          const renderSectionFields = () => (
            <Box flex={"1"} minW={0} w={"100%"}>
              {!isUndefined(section.fieldArray) &&
              !isUndefined(section.name) ? (
                <FieldArray
                  name={section.name}
                  sectionFields={section.fields}
                  defaultValues={section.initialValues}
                  update={update}
                  searchResults={searchResults}
                  searchFn={searchFn}
                  warehouses={warehouses}
                  GenerateOrderItems={GenerateOrderItems}
                  stackDirection={section.stackDirection}
                  Templates={Templates}
                  CombinationInput={CombinationInput}
                  ProductGroupedIndexedSearch={ProductGroupedIndexedSearch}
                  Generate={Generate}
                  FileManagerActions={FileManagerActions}
                  dynamicOptions={dynamicOptions}
                  orderProcessingQueue={orderProcessingQueue}
                  renderAfterField={renderAfterField}
                  t={t}
                  i18n={i18n}
                />
              ) : (
                <FieldController
                  fields={section.fields}
                  update={update}
                  searchResults={searchResults}
                  searchFn={searchFn}
                  warehouses={warehouses}
                  stackDirection={section.stackDirection}
                  CombinationInput={CombinationInput}
                  ProductGroupedIndexedSearch={ProductGroupedIndexedSearch}
                  Generate={Generate}
                  FileManagerActions={FileManagerActions}
                  dynamicOptions={dynamicOptions}
                  orderProcessingQueue={orderProcessingQueue}
                  renderAfterField={renderAfterField}
                  t={t}
                  i18n={i18n}
                />
              )}
              {shouldRenderAfterAddressSection ? afterAddressSection : null}
            </Box>
          );
          const renderSectionHeader = (withinToggle = false) => (
            <Box
              flex={withinToggle ? "1" : undefined}
              maxW={withinToggle ? "100%" : "200px"}
              minW={0}
            >
              <Heading
                alignSelf={"flex-start"}
                as={"h2"}
                maxW={"100%"}
                minW={withinToggle ? 0 : "200px"}
                size={"md"}
                overflowWrap={"anywhere"}
                whiteSpace={"normal"}
              >
                {section.heading}
              </Heading>
              <Text
                mt={4}
                fontSize={"xs"}
                maxW={"100%"}
                color={"gray.500"}
                overflowWrap={"anywhere"}
                whiteSpace={"normal"}
              >
                {section.description}
              </Text>
            </Box>
          );

          return (
            <Fragment key={sectionKey}>
              {noSeparator ? null : (
                <Separator borderColor="border.emphasized" my={8} />
              )}
              {formData.allowToggle ? (
                <Stack
                  direction={
                    section.stackDirection
                      ? section.stackDirection
                      : ["column", "column", "column", "row"]
                  }
                >
                  <Button
                    alignItems={"flex-start"}
                    alignSelf={"flex-start"}
                    aria-controls={sectionContentId}
                    aria-expanded={sectionIsOpen}
                    display={"flex"}
                    gap={3}
                    h={"auto"}
                    justifyContent={"space-between"}
                    maxW={["100%", "100%", "100%", "240px"]}
                    minW={0}
                    onClick={() =>
                      handleSectionOpenChange(sectionKey, !sectionIsOpen)
                    }
                    px={0}
                    py={0}
                    textAlign={"left"}
                    type={"button"}
                    variant={"plain"}
                    w={["100%", "100%", "100%", "240px"]}
                  >
                    {renderSectionHeader(true)}
                    <MaterialSymbol flexShrink={0} mt={1} mr={3}>
                      {sectionIsOpen ? "expand_less" : "expand_more"}
                    </MaterialSymbol>
                  </Button>
                  {sectionIsOpen ? (
                    <Box flex={"1"} id={sectionContentId} minW={0} w={"100%"}>
                      {renderSectionFields()}
                    </Box>
                  ) : (
                    <Box flex={"1"} id={sectionContentId} minW={0} w={"100%"}>
                      <SectionSummary
                        section={section}
                        dynamicOptions={dynamicOptions}
                        onEdit={() => handleSectionOpenChange(sectionKey, true)}
                        t={t}
                        i18n={i18n}
                      />
                    </Box>
                  )}
                </Stack>
              ) : (
                <Stack
                  direction={
                    section.stackDirection
                      ? section.stackDirection
                      : ["column", "column", "column", "row"]
                  }
                >
                  {renderSectionHeader()}
                  {renderSectionFields()}
                </Stack>
              )}
            </Fragment>
          );
        })}
        {hasProductAdvancedControls ? (
          <Stack align="stretch" gap="4" mt="8">
            {advancedControls}
            {isProductForm && pricesMatrix}
          </Stack>
        ) : (
          advancedControls
        )}
        {By}
        {ToChannel}
        <Button
          mt="8"
          mb="4"
          w="100%"
          type="submit"
          colorPalette="primary"
          disabled={isSubmitDisabled}
          loading={isSubmitLoading}
        >
          <MaterialSymbol>{buttonLeftIcon}</MaterialSymbol>
          {isSubmitLoading && submitLoadingLabel
            ? submitLoadingLabel
            : buttonLabel}
        </Button>
      </form>
    </FormProvider>
  );
}
