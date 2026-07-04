import { useOrders } from "@/context/orders";
import { useTenantContext } from "@/context/tenant";
import { useDefaultComputerChannelGuard } from "@/hooks/useDefaultComputerChannelGuard";
import { useRealtimeFormDocument } from "@/hooks/useRealtimeFormDocument";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { CreateToasterReturn } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import { create, db, update } from "@konfi/firebase";
import {
  Channel,
  Customer,
  FormattedOrderItem,
  FormTypes,
  isNestedCustomer,
  Locale,
  NestedCustomer,
  OrderItem,
  Quote,
  QuoteCreate,
  QuoteUpdate,
  SelectOption,
  Settings,
  ShippingOptions,
  TenantContext,
} from "@konfi/types";
import {
  formatMailLink,
  generateKeywords,
  getAvailablePaymentTypes,
  getIconByFormType,
  getOrderFileStatusOptions,
  getOrderWorkflowStatusOptions,
  getPaymentMethodOptions,
  getPrintingMethodOptions,
  getShippingMethodOptions,
  getSubtotalPrice,
  getTotalPrice,
  isShippingFree,
  OrderCreateSchema,
  orderForm,
  orderItemInitialValues,
  QuoteCreateSchema,
  quoteForm,
  QuoteUpdateSchema,
  updateQuoteForm,
} from "@konfi/utils";
import { useCatalog } from "context/catalog";
import { useChannels } from "context/channels";
import {
  useConfigurationMembers,
  useConfigurationSettings,
  useConfigurationWarehouses,
} from "context/configuration";
import { useCustomers } from "context/customers";
import { useQuotes } from "context/quotes";
import { isNull, isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { Timestamp } from "firebase/firestore";
import { TFunction } from "i18next";
import { Route } from "next";
import { NavigateOptions } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { useRouter } from "next/navigation";
import { Dispatch, SetStateAction, useEffect, useMemo, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { MutatorOptions } from "swr";
import { InferType } from "yup";
import Drawer from "../Drawer";
import { By } from "../form/field-controllers/By";
import { CombinationInput } from "../form/field-controllers/CombinationInput";
import GenerateOrderItems from "../form/field-controllers/GenerateOrderItems";
import { ProductGroupedIndexedSearch } from "../form/field-controllers/ProductGroupedIndexedSearch";
import {
  handleCreateOrder as handleConvertQuoteToOrder,
  initialValuesCreateFromQuote,
  stripEmptyOrderItemsResolver,
} from "../orders/OrderForm";

type CreateInput = InferType<typeof QuoteCreateSchema>;
type UpdateInput = InferType<typeof QuoteUpdateSchema>;

export type QuoteFormLiveValues = Pick<
  CreateInput,
  "customer" | "contact" | "shippingOption" | "specialNotes" | "items"
>;

const QuoteForm = ({
  quote,
  orderItems,
  prefill,
  type,
  asDrawer = false,
  open,
  setOpen,
  onValuesChange,
  mutate,
}: {
  quote?: Quote;
  orderItems?: FormattedOrderItem[];
  prefill?: Partial<CreateInput>;
  type: keyof typeof FormTypes;
  asDrawer?: boolean;
  open?: boolean;
  setOpen?: Dispatch<SetStateAction<boolean>>;
  onValuesChange?: (values: QuoteFormLiveValues) => void;
  mutate?: (
    data?: any,
    options?: boolean | MutatorOptions<any>,
  ) => Promise<any>;
}) => {
  const { t, i18n } = useT();
  const { quotesRefresh } = useQuotes();
  const { customersInputSearchResults, searchCustomersInput } = useCustomers();
  const { productsInputSearchResults, searchProductsInput } = useCatalog();
  const { channel } = useChannels();
  const tenantContext = useTenantContext();
  const { confirmDefaultComputerChannel, defaultComputerChannelDialog } =
    useDefaultComputerChannelGuard();
  const label = `${t(`FormTypes.${type}`)} ${type !== "CONVERT" ? "Wycenę" : ""} ${type === "CONVERT" ? "na Zamówienie" : ""}`;
  const { push } = useRouter();
  const { members } = useConfigurationMembers();
  const { warehouses } = useConfigurationWarehouses();
  const {
    storeSettings,
    printingMethodsSettings,
    shippingMethodsSettings,
    paymentMethodsSettings,
    orderWorkflowStatusesSettings,
  } = useConfigurationSettings();
  const { processingQueue } = useOrders();
  const carriedOutByOptions: SelectOption[] = useMemo(
    () =>
      members
        ? members?.map(
            (member) =>
              ({
                label: member.name,
                value: member.name,
              }) as SelectOption,
          )
        : [],
    [members],
  );
  const printingMethodOptions = useMemo(
    () => getPrintingMethodOptions(printingMethodsSettings, t),
    [printingMethodsSettings, t],
  );
  const shippingMethodOptions = useMemo(
    () => getShippingMethodOptions(shippingMethodsSettings, {}, t),
    [shippingMethodsSettings, t],
  );
  const paymentMethodOptions = useMemo(
    () => getPaymentMethodOptions(paymentMethodsSettings, t),
    [paymentMethodsSettings, t],
  );
  const orderStatusOptions = useMemo(
    () => getOrderWorkflowStatusOptions(orderWorkflowStatusesSettings, t),
    [orderWorkflowStatusesSettings, t],
  );
  const fileStatusOptions = useMemo(
    () => getOrderFileStatusOptions(orderWorkflowStatusesSettings, t),
    [orderWorkflowStatusesSettings, t],
  );
  const CreateSchemaYupResolver = stripEmptyOrderItemsResolver(
    yupResolver(QuoteCreateSchema),
  );
  const UpdateSchemaYupResolver = stripEmptyOrderItemsResolver(
    yupResolver(QuoteUpdateSchema),
  );
  const ConvertSchemaYupResolver = stripEmptyOrderItemsResolver(
    yupResolver(OrderCreateSchema),
  );
  const CreateForm = useForm({
    defaultValues: initialValuesCreate(orderItems),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "CREATE",
  });

  const UpdateForm = useForm({
    defaultValues: quote && initialValuesUpdate(quote),
    resolver: UpdateSchemaYupResolver,
    disabled: type !== "UPDATE",
  });

  const DuplicateForm = useForm({
    defaultValues: quote && initialValuesDuplicate(quote),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "DUPLICATE",
  });

  const ConvertForm = useForm({
    defaultValues: quote && initialValuesCreateFromQuote(quote),
    resolver: ConvertSchemaYupResolver,
    disabled: type !== "CONVERT",
  });

  const prefillAppliedRef = useRef(false);

  useEffect(() => {
    if (type !== "CREATE" || !prefill || prefillAppliedRef.current) {
      return;
    }

    prefillAppliedRef.current = true;
    const currentValues = CreateForm.getValues();
    const freshItems = orderItems as unknown as OrderItem[] | undefined;

    CreateForm.reset({
      ...currentValues,
      ...prefill,
      customer: prefill.customer ?? currentValues.customer,
      contact: prefill.contact ?? currentValues.contact,
      shippingOption: prefill.shippingOption ?? currentValues.shippingOption,
      specialNotes: prefill.specialNotes ?? currentValues.specialNotes,
      items:
        freshItems && freshItems.length > 0 ? freshItems : currentValues.items,
    });
  }, [CreateForm, orderItems, prefill, type]);

  const watchShippingOptionCreateForm = useWatch({
    name: "shippingOption",
    control: CreateForm?.control,
    disabled: CreateForm.formState.disabled,
  });

  const watchItemsCreateForm = useWatch({
    name: "items",
    control: CreateForm?.control,
    disabled: CreateForm.formState.disabled,
  });

  const watchCustomerCreateForm: string | NestedCustomer = useWatch({
    name: "customer",
    control: CreateForm?.control,
    disabled: CreateForm.formState.disabled,
  });

  const watchContactCreateForm = useWatch({
    name: "contact",
    control: CreateForm?.control,
    disabled: CreateForm.formState.disabled,
  });

  const watchSpecialNotesCreateForm = useWatch({
    name: "specialNotes",
    control: CreateForm?.control,
    disabled: CreateForm.formState.disabled,
  });

  useEffect(() => {
    if (onValuesChange && type === "CREATE")
      onValuesChange({
        customer: watchCustomerCreateForm,
        contact: watchContactCreateForm,
        shippingOption: watchShippingOptionCreateForm,
        specialNotes: watchSpecialNotesCreateForm,
        items: watchItemsCreateForm,
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    watchShippingOptionCreateForm,
    watchItemsCreateForm,
    watchCustomerCreateForm,
    watchContactCreateForm,
    watchSpecialNotesCreateForm,
    type,
  ]);

  const watchShippingOptionConvertForm = useWatch({
    name: "shippingOption",
    control: ConvertForm?.control,
    disabled: ConvertForm.formState.disabled,
  });

  const watchItemsConvertForm = useWatch({
    name: "items",
    control: ConvertForm?.control,
    disabled: ConvertForm.formState.disabled,
  });

  const watchCustomerConvertForm: string | NestedCustomer = useWatch({
    name: "customer",
    control: ConvertForm?.control,
    disabled: ConvertForm.formState.disabled,
  });
  const watchCustomerUpdateForm: string | NestedCustomer = useWatch({
    name: "customer",
    control: UpdateForm?.control,
    disabled: UpdateForm.formState.disabled,
  });
  const watchCustomerDuplicateForm: string | NestedCustomer = useWatch({
    name: "customer",
    control: DuplicateForm?.control,
    disabled: DuplicateForm.formState.disabled,
  });

  useRealtimeFormDocument({
    collectionPath: "/customers",
    enabled: type === "CREATE" && isNestedCustomer(watchCustomerCreateForm),
    fieldName: "customer",
    form: CreateForm,
    value: isNestedCustomer(watchCustomerCreateForm)
      ? watchCustomerCreateForm
      : undefined,
  });
  useRealtimeFormDocument({
    collectionPath: "/customers",
    enabled: type === "UPDATE" && isNestedCustomer(watchCustomerUpdateForm),
    fieldName: "customer",
    form: UpdateForm,
    value: isNestedCustomer(watchCustomerUpdateForm)
      ? watchCustomerUpdateForm
      : undefined,
  });
  useRealtimeFormDocument({
    collectionPath: "/customers",
    enabled:
      type === "DUPLICATE" && isNestedCustomer(watchCustomerDuplicateForm),
    fieldName: "customer",
    form: DuplicateForm,
    value: isNestedCustomer(watchCustomerDuplicateForm)
      ? watchCustomerDuplicateForm
      : undefined,
  });
  useRealtimeFormDocument({
    collectionPath: "/customers",
    enabled: type === "CONVERT" && isNestedCustomer(watchCustomerConvertForm),
    fieldName: "customer",
    form: ConvertForm,
    value: isNestedCustomer(watchCustomerConvertForm)
      ? watchCustomerConvertForm
      : undefined,
  });

  const availablePaymentTypes = useMemo(() => {
    if (type !== "CONVERT") return [];
    const castedCustomer = isNestedCustomer(watchCustomerConvertForm)
      ? (watchCustomerConvertForm as Customer)
      : undefined;
    return getAvailablePaymentTypes(
      watchShippingOptionConvertForm ?? ShippingOptions.PERSONAL_COLLECTION,
      false,
      castedCustomer?.allowedBankPayments || false,
      castedCustomer?.allowedDefferedPayments || false,
      castedCustomer?.allowedOnPickupPayments || false,
      getTotalPrice(watchItemsConvertForm, 0),
      false,
      paymentMethodsSettings,
    );
  }, [
    paymentMethodsSettings,
    type,
    watchCustomerConvertForm,
    watchShippingOptionConvertForm,
    watchItemsConvertForm,
  ]);

  if (isNull(channel)) return null;

  const handleSubmitCreateQuote = async (data: CreateInput) => {
    await confirmDefaultComputerChannel(channel.id, async () => {
      await handleCreateQuote(
        data,
        quotesRefresh,
        channel,
        toaster,
        storeSettings,
        push,
        t,
        i18n.resolvedLanguage as Locale,
        tenantContext,
      );
    });
  };

  const handleSubmitConvertQuote = async (
    data: InferType<typeof OrderCreateSchema>,
  ) => {
    await confirmDefaultComputerChannel(channel.id, async () => {
      await handleConvertQuoteToOrder(
        data,
        channel,
        toaster,
        storeSettings,
        push,
        t,
        i18n.resolvedLanguage as Locale,
        undefined,
        undefined,
        tenantContext,
      );
    });
  };

  if (asDrawer)
    return (
      <>
        <Drawer
          header={label}
          size={"xl"}
          closeOnOverlayClick={false}
          open={open}
          setOpen={setOpen}
          lazyMount
          unmountOnExit
        >
          <FormController
            methods={
              type === "CREATE"
                ? CreateForm
                : type === "UPDATE"
                  ? UpdateForm
                  : type === "DUPLICATE"
                    ? DuplicateForm
                    : ConvertForm
            }
            buttonLeftIcon={getIconByFormType(type)}
            buttonLabel={label}
            formData={
              type === "CONVERT"
                ? orderForm(
                    carriedOutByOptions,
                    [],
                    availablePaymentTypes,
                    t,
                    printingMethodOptions,
                    shippingMethodOptions,
                    paymentMethodOptions,
                    orderStatusOptions,
                    fileStatusOptions,
                  )
                : type === "UPDATE"
                  ? updateQuoteForm(t)
                  : quoteForm(t)
            }
            update={type === "UPDATE"}
            searchResults={{
              customers: customersInputSearchResults,
              products: productsInputSearchResults,
            }}
            searchFn={{
              customers: searchCustomersInput,
              products: searchProductsInput,
            }}
            handleSubmit={async (data) =>
              type === "CREATE" || type === "DUPLICATE"
                ? await handleSubmitCreateQuote(data)
                : type === "CONVERT"
                  ? await handleSubmitConvertQuote(data)
                  : !isUndefined(quote)
                    ? handleUpdateQuote(
                        quote.id,
                        data,
                        quotesRefresh,
                        channel,
                        toaster,
                        storeSettings,
                        mutate,
                        t,
                        tenantContext,
                      )
                    : toaster.error({
                        title: t("error.somethingWrong", {
                          defaultValue: "Something went wrong",
                        }),
                        description: t("quote.notFound", {
                          defaultValue: "Quote not found for editing",
                        }),
                        duration: 3000,
                      })
            }
            ProductGroupedIndexedSearch={ProductGroupedIndexedSearch}
            CombinationInput={CombinationInput}
            By={<By update={type === "UPDATE"} />}
            warehouses={type === "CONVERT" ? warehouses : null}
            GenerateOrderItems={GenerateOrderItems}
            orderProcessingQueue={processingQueue.current}
            t={t}
            i18n={i18n}
          />
        </Drawer>
        {defaultComputerChannelDialog}
      </>
    );
  else
    return (
      <>
        <FormController
          methods={
            type === "CREATE"
              ? CreateForm
              : type === "UPDATE"
                ? UpdateForm
                : type === "DUPLICATE"
                  ? DuplicateForm
                  : ConvertForm
          }
          buttonLeftIcon={getIconByFormType(type)}
          buttonLabel={label}
          formData={
            type === "CONVERT"
              ? orderForm(
                  carriedOutByOptions,
                  [],
                  availablePaymentTypes,
                  t,
                  printingMethodOptions,
                  shippingMethodOptions,
                  paymentMethodOptions,
                  orderStatusOptions,
                  fileStatusOptions,
                )
              : type === "UPDATE"
                ? updateQuoteForm(t)
                : quoteForm(t)
          }
          update={type === "UPDATE"}
          searchResults={{
            customers: customersInputSearchResults,
            products: productsInputSearchResults,
          }}
          searchFn={{
            customers: searchCustomersInput,
            products: searchProductsInput,
          }}
          handleSubmit={async (data) =>
            type === "CREATE" || type === "DUPLICATE"
              ? await handleSubmitCreateQuote(data)
              : type === "CONVERT"
                ? await handleSubmitConvertQuote(data)
                : !isUndefined(quote)
                  ? await handleUpdateQuote(
                      quote?.id,
                      data,
                      quotesRefresh,
                      channel,
                      toaster,
                      storeSettings,
                      mutate,
                      t,
                      tenantContext,
                    )
                  : toaster.error({
                      title: t("error.somethingWrong", {
                        defaultValue: "Something went wrong",
                      }),
                      description: t("quote.notFound", {
                        defaultValue: "Quote not found for editing",
                      }),
                      duration: 3000,
                    })
          }
          ProductGroupedIndexedSearch={ProductGroupedIndexedSearch}
          CombinationInput={CombinationInput}
          By={<By update={type === "UPDATE"} />}
          warehouses={type === "CONVERT" ? warehouses : null}
          GenerateOrderItems={GenerateOrderItems}
          orderProcessingQueue={processingQueue.current}
          t={t}
          i18n={i18n}
        />
        {defaultComputerChannelDialog}
      </>
    );
};

const initialValuesCreate = (orderItems?: FormattedOrderItem[]) => {
  const values: CreateInput = {
    customer: {
      id: "",
      name: "",
      personName: "",
      email: "",
      nip: "",
      allowedBankPayments: false,
      allowedOnPickupPayments: false,
      allowedDefferedPayments: false,
      contacts: [],
      addresses: [],
      b2b: false,
      linkedProductsIds: [],
      specialNotes: "",
    },
    contact: {
      name: "",
      email: "",
      phone: "",
      active: true,
    },
    shippingOption: ShippingOptions.PERSONAL_COLLECTION,
    specialNotes: "",
    items: (orderItems as unknown as OrderItem[]) ?? [orderItemInitialValues],
    createdBy: {
      id: "",
      name: "",
    },
    mailLink: "",
    appliedPromotionCodes: [],
  };
  return values;
};

const handleCreateQuote = async (
  data: CreateInput,
  quotesRefresh: () => void,
  channel: Channel,
  toaster: CreateToasterReturn,
  storeSettings: Settings | null,
  push: (href: Route, options?: NavigateOptions) => void,
  t: TFunction,
  lng: Locale,
  tenantContext?: TenantContext,
) => {
  try {
    if (isNull(storeSettings)) throw "storeSettings is undefined";
    if (isUndefined(data.shippingOption) || isNull(data.shippingOption))
      throw "data.shippingOption is undefined or null";

    const shippingPrice = isShippingFree(
      getSubtotalPrice(data.items),
      storeSettings.freeShipping.enabled,
      storeSettings.freeShipping.min,
    )
      ? 0
      : storeSettings.shippingOptionsPrices[data.shippingOption];

    const totalPrice: number = getTotalPrice(data.items, shippingPrice);
    const quote: QuoteCreate = {
      id: "",
      name: "",
      number: 0,
      customer:
        typeof data.customer === "object"
          ? {
              id: data.customer.id,
              name: data.customer.name,
              personName: data.customer.personName,
              email: data.customer.email,
              nip: data.customer.nip,
              allowedBankPayments: data.customer.allowedBankPayments,
              allowedOnPickupPayments: data.customer.allowedOnPickupPayments,
              allowedDefferedPayments: data.customer.allowedDefferedPayments,
              contacts: data.customer.contacts,
              addresses: data.customer.addresses,
              b2b: data.customer.b2b,
              linkedProductsIds: data.customer.linkedProductsIds,
              specialNotes: data.customer.specialNotes,
              discount: data.customer.discount,
            }
          : data.customer,
      contact: data.contact ?? {
        name: "",
        email: "",
        phone: "",
        active: true,
      },
      shippingOption: data.shippingOption,
      shippingPrice: shippingPrice,
      totalPrice: totalPrice,
      specialNotes: data.specialNotes,
      items: data.items.map((item: OrderItem) => ({
        ...item,
        product: {
          id: item.product?.id ?? "",
          name: item.product?.name ?? "",
          channelId: item.product?.channelId ?? "",
          spec: {
            images: item.product?.spec?.images ?? [],
          },
        },
      })),
      currency: channel.currency,
      createdBy: {
        id: data.createdBy.id,
        name: data.createdBy.name,
      },
      createdAt: Timestamp.now(),
      updatedBy: {
        id: data.createdBy.id,
        name: data.createdBy.name,
      },
      updatedAt: Timestamp.now(),
      keywords: generateKeywords(
        typeof data.customer === "object"
          ? data.customer.name
          : (data.customer ?? ""),
      ),
      mailLink: formatMailLink(data.mailLink ?? ""),
      active: true,
      appliedPromotionCodes: [],
    };

    if (
      isNestedCustomer(data.customer) &&
      data.customer.b2b &&
      !isEmpty(data.customer.linkedProductsIds)
    ) {
      if (isNestedCustomer(quote.customer)) {
        quote.customer.b2b = data.customer.b2b;
        quote.customer.linkedProductsIds = data.customer.linkedProductsIds;
      }
    }

    if (process.env.NODE_ENV === "development") {
      console.log("quote", quote);

      const promise = new Promise((resolve) => setTimeout(resolve, 1000));

      toaster.promise(promise, {
        loading: {
          title: t("quote.saving", { defaultValue: "Saving quote" }),
          description: t("quote.saving_description", {
            defaultValue: "Saving quote...",
          }),
        },
        success: {
          title: t("quote.createdDev", {
            defaultValue: "Quote created without saving (DEV)",
          }),
          description: t("quote.createdDevDescription", {
            defaultValue: "Successfully created new quote without saving",
          }),
        },
        error: {
          title: t("error.general", { defaultValue: "Error" }),
          description: t("error.quote_save", {
            defaultValue: "Failed to save quote",
          }),
        },
      });

      await promise;

      push(`/${lng}/quotes` as Route);

      return;
    }

    const promise = create(
      firestore,
      quote,
      undefined,
      db.collection(firestore, "/channels/" + channel.id + "/quotes"),
      db.collection(firestore, "/channels/" + channel.id + "/quotes"),
      undefined,
      undefined,
      undefined,
      undefined,
      tenantContext,
    );

    toaster.promise(promise, {
      loading: {
        title: t("quote.saving", { defaultValue: "Saving quote" }),
        description: t("quote.saving_description", {
          defaultValue: "Saving quote...",
        }),
      },
      success: {
        title: t("quote.created", { defaultValue: "Quote created" }),
        description: t("quote.created_description", {
          defaultValue: "Successfully created new quote",
        }),
      },
      error: {
        title: t("error.general", { defaultValue: "Error" }),
        description: t("error.quote_save", {
          defaultValue: "Failed to save quote",
        }),
      },
    });

    const id = await promise;

    if (id) {
      // Refresh quotes list asynchronously
      quotesRefresh();

      push(`/${lng}/quotes/${id}` as Route);
    } else {
      push(`/${lng}/quotes` as Route);
      toaster.error({
        title: t("error.somethingWrong", {
          defaultValue: "Something went wrong",
        }),
        description: t("quote.notCreated", {
          defaultValue: "Quote was not created",
        }),
      });
    }
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("error.somethingWrong", {
        defaultValue: "Something went wrong",
      }),
      description: t("quote.notCreatedError", {
        defaultValue: "Quote was not created, error code: {error}",
        values: { error },
      }),
    });
  }
};

const initialValuesUpdate = (quote?: Quote) => {
  if (isUndefined(quote)) {
    throw new Error("Quote was not provided to initialValuesUpdate.");
  }

  const values: UpdateInput = {
    customer: quote.customer,
    contact: quote.contact ?? {
      name: "",
      email: "",
      phone: "",
      active: true,
    },
    shippingOption: quote.shippingOption,
    specialNotes: quote.specialNotes,
    items: quote.items,
    updatedBy: quote.updatedBy,
    appliedPromotionCodes: quote.appliedPromotionCodes,
    mailLink: quote.mailLink ?? "",
  };
  return values;
};

const handleUpdateQuote = async (
  quoteId: string,
  data: UpdateInput,
  quotesRefresh: () => void,
  channel: Channel,
  toaster: CreateToasterReturn,
  storeSettings: Settings | null,
  mutate?: (
    data?: any,
    options?: boolean | MutatorOptions<any>,
  ) => Promise<any>,
  t?: (key: string, options?: any) => string,
  tenantContext?: TenantContext,
) => {
  try {
    if (isNull(storeSettings)) throw "storeSettings is undefined";
    if (isUndefined(data.shippingOption) || isNull(data.shippingOption))
      throw "data.shippingOption is undefined or null";

    const shippingPrice = isShippingFree(
      getSubtotalPrice(data.items),
      storeSettings.freeShipping.enabled,
      storeSettings.freeShipping.min,
    )
      ? 0
      : storeSettings.shippingOptionsPrices[data.shippingOption];
    const totalPrice: number = getTotalPrice(data.items, shippingPrice);
    const quote: QuoteUpdate = {
      customer: data.customer,
      contact: data.contact,
      shippingOption: data.shippingOption,
      shippingPrice: shippingPrice,
      totalPrice: totalPrice,
      specialNotes: data.specialNotes,
      items: data.items.map((item: OrderItem) => ({
        ...item,
        product: {
          id: item.product?.id ?? "",
          name: item.product?.name ?? "",
          channelId: item.product?.channelId ?? "",
          spec: {
            images: item.product?.spec?.images ?? [],
          },
        },
      })),
      updatedBy: {
        id: data.updatedBy.id,
        name: data.updatedBy.name,
      },
      updatedAt: Timestamp.now(),
      keywords: generateKeywords(
        typeof data.customer === "object"
          ? data.customer.name
          : (data.customer ?? ""),
      ),
      mailLink: formatMailLink(data.mailLink ?? ""),
      appliedPromotionCodes: data.appliedPromotionCodes,
    };

    if (
      isNestedCustomer(data.customer) &&
      data.customer.b2b &&
      !isEmpty(data.customer.linkedProductsIds)
    ) {
      if (isNestedCustomer(quote.customer)) {
        quote.customer.b2b = data.customer.b2b;
        quote.customer.linkedProductsIds = data.customer.linkedProductsIds;
      }
    }

    if (process.env.NODE_ENV === "development") {
      console.log("quote", quote);
    }

    await update(
      quote,
      db.doc(firestore, "/channels/" + channel.id + "/quotes", quoteId),
      tenantContext,
    );

    // If mutate function is provided, update the SWR cache
    if (mutate) {
      await mutate((prevData: Quote) => {
        if (!prevData) return prevData;
        return {
          ...prevData,
          ...quote,
        };
      }, false);
    }

    quotesRefresh();
    toaster.success({
      title:
        t?.("quote.updated", { defaultValue: "Quote updated" }) ??
        "Quote updated",
      description:
        t?.("quote.updatedDescription", {
          defaultValue: "Successfully updated quote",
        }) ?? "Successfully updated quote",
    });
  } catch (error) {
    console.error(error);
    toaster.error({
      title:
        t?.("error.somethingWrong", { defaultValue: "Something went wrong" }) ??
        "Something went wrong",
      description:
        t?.("quote.notUpdatedError", {
          defaultValue: "Quote was not updated, error code: {{error}}",
          error,
        }) ?? `Quote was not updated, error code: ${error}`,
    });
  }
};

const initialValuesDuplicate = (quote?: Quote) => {
  if (isUndefined(quote)) {
    throw new Error("Quote was not provided to initialValuesDuplicate.");
  }

  const values: CreateInput = {
    customer: quote.customer ?? "",
    contact: quote.contact ?? {
      name: "",
      email: "",
      phone: "",
      active: true,
    },
    shippingOption: quote.shippingOption ?? ShippingOptions.PERSONAL_COLLECTION,
    specialNotes: quote.specialNotes ?? "",
    items: quote.items,
    createdBy: {
      id: "",
      name: "",
    },
    appliedPromotionCodes: [],
  };
  return values;
};

export default QuoteForm;
