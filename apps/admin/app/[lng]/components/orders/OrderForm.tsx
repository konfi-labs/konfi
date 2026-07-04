import { meilisearchSearch } from "@/actions";
import {
  classifyAndPersistOrderPrintingMethodsAdmin,
  classifyOrderPrintingMethodsAdmin,
} from "@/actions/ai";
import { classifyAndPersistProductionGroupingsAdmin } from "@/actions/production-grouping-classifications";
import {
  assertSaasRuntimeModuleAction,
  assertSaasRuntimeQuotaAction,
  recordSaasRuntimeQuotaUsageAction,
} from "@/actions/saas-runtime-quotas";
import {
  createAdminStripePaymentLink,
  updateOrderStatusField,
} from "@/actions/order-updates";
import { processAdminOrderCreatedStock } from "@/actions/stock";
import { useOrders } from "@/context/orders";
import { useTenantContext } from "@/context/tenant";
import { useDefaultComputerChannelGuard } from "@/hooks/useDefaultComputerChannelGuard";
import { useRealtimeFormDocument } from "@/hooks/useRealtimeFormDocument";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { notifyOrderCreated } from "@/lib/fulfillment/client";
import { toSerializableProductionGroupingItems } from "@/lib/orders/production-materials";
import {
  getFuzzyCustomerSearchSeed,
  rankCustomersByFuzzySearch,
} from "@/lib/customers/customer-search";
import { buildAdminOrderTaxSummary } from "@/lib/orders/tax-summary.client";
import {
  createAdminOrderUpdatePayload,
  parseOrderDeadlineString,
  persistAdminOrderUpdate,
} from "@/components/orders/order-update";
import {
  type CreateOrderPaymentAutoSelectionNotice,
  getCreateOrderPaymentAutoSelectionNotice,
  getAdminOrderDetailsHref,
  hasCreateOrderBillingPrefillNotice,
  normalizePickupAreaWarehouseIds,
  createQuickOrderCustomerPatch,
  getChannelPickupWarehouseAddress,
} from "@/components/orders/OrderForm.helpers";
import { Alert } from "@chakra-ui/react";
import { CreateToasterReturn } from "@chakra-ui/react/toast";
import { yupResolver } from "@hookform/resolvers/yup";
import {
  AnonymousPackageShippingField,
  FormController,
  toaster,
  type FormControllerProps,
} from "@konfi/components";
import {
  create,
  createAddress,
  createContact,
  createCustomer,
  db,
  get,
  getCustomerInvoiceAutomation,
  tenant,
  update,
} from "@konfi/firebase";
import {
  Address,
  AddressTypeEnum,
  Channel,
  Customer,
  DesignatedPickupArea,
  Discount,
  FormattedOrderItem,
  FormTypes,
  isNestedCustomer,
  Locale,
  NestedCustomer,
  NestedMember,
  Order,
  OrderCreate,
  OrderFilesStatus,
  OrderItem,
  OrderStatus,
  OrderUpdate,
  OrderUpdateStore,
  type PaymentMethodId,
  PaymentStatus,
  PaymentType,
  type ProductionGroupingProfile,
  Quote,
  SelectOption,
  Settings,
  ShippingOptions,
  TenantContext,
} from "@konfi/types";
import {
  createEmptyAnonymousPackageLabelAddress,
  formatMailLink,
  generateKeywords,
  getAvailablePaymentTypes,
  getIconByFormType,
  getOrderFileStatusOptions,
  getOrderWorkflowStatusOptions,
  getPaymentMethodOptions,
  getKnownPrintingMethodIds,
  getPickupAreasByShippingOption,
  getPrintingMethodOptions,
  getShippingMethodOptions,
  getSubtotalPrice,
  getTotalPrice,
  hasShippingDestination,
  isAnonymousPackageShippingAllowedFor,
  normalizeAnonymousPackageLabelAddress,
  normalizeInvoiceRecipientAddress,
  isShippingFree,
  AdminQuickOrderCreateSchema,
  OrderCreateSchema,
  orderForm,
  orderItemInitialValues,
  OrderUpdateSchema,
  OrderUpdateSchemaStore,
  stripEmptyOrderItems,
  toSerializableOrderPrintingMethodItems,
  updateOrderForm,
  updateOrderFormStore,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import {
  useConfigurationMembers,
  useConfigurationSettings,
  useConfigurationWarehouses,
} from "context/configuration";
import { isNull, isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { Timestamp, where } from "firebase/firestore";
import { TFunction } from "i18next";
import { Route } from "next";
import { NavigateOptions } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { useRouter } from "next/navigation";
import {
  Dispatch,
  SetStateAction,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FieldErrors,
  FieldValues,
  Resolver,
  useForm,
  useWatch,
} from "react-hook-form";
import useSWRImmutable from "swr/immutable";
import { InferType } from "yup";
import Drawer from "../Drawer";
import { By } from "../form/field-controllers/By";
import { CombinationInput } from "../form/field-controllers/CombinationInput";
import GenerateOrderItems from "../form/field-controllers/GenerateOrderItems";
import { ProductGroupedIndexedSearch } from "../form/field-controllers/ProductGroupedIndexedSearch";
import { ToChannel } from "../form/field-controllers/ToChannel";

type CreateInput = InferType<typeof OrderCreateSchema>;
type UpdateInput = InferType<typeof OrderUpdateSchema>;
type UpdateInputStore = InferType<typeof OrderUpdateSchemaStore>;
type OrderFormType = Exclude<keyof typeof FormTypes, "CONVERT">;
type AdminOrderCreateMode = "standard" | "quick";

const getLocalDateInputValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

type OrderFormProps = {
  order?: Order;
  orderItems?: FormattedOrderItem[];
  type: OrderFormType;
  asDrawer?: boolean;
  open?: boolean;
  setOpen?: Dispatch<SetStateAction<boolean>>;
  onValuesChange?: (values: OrderFormLiveValues) => void;
  createMode?: AdminOrderCreateMode;
  duplicateInitialOverrides?: Partial<CreateInput>;
  createInitialOverrides?: Partial<CreateInput>;
  createOverrides?: Partial<CreateInput>;
  setOptimisticOrder?: (action: Partial<Order>) => void;
  onCreateSuccess?: (payload: {
    channelId: string;
    orderId: string;
  }) => Promise<void> | void;
};

type StoreOrderUpdateFormProps = OrderFormProps & {
  order: Order;
  type: "UPDATE";
};

type StandardOrderUpdateFormProps = OrderFormProps & {
  order: Order;
  type: "UPDATE";
};

export type OrderFormLiveValues = Pick<
  CreateInput,
  | "customer"
  | "contact"
  | "email"
  | "shippingOption"
  | "shipping"
  | "invoice"
  | "invoiceNotes"
  | "billing"
  | "items"
  | "paymentType"
  | "paymentStatus"
>;

type FakturowniaAlert = {
  type: "error" | "warning";
  title: string;
  description: string;
};

type HandleCreateOrderOptions = {
  createMode?: AdminOrderCreateMode;
};

type OrderTranslation = (
  key: string,
  options?: { defaultValue?: string; values?: Record<string, unknown> },
) => string;

function createEmptyNestedMember(): NestedMember {
  return { id: "", name: "" };
}

type OrderFormAddressInput = Omit<
  Address,
  | "name"
  | "type"
  | "nip"
  | "companyName"
  | "invoiceRecipientEnabled"
  | "invoiceRecipientRole"
  | "invoiceRecipientRoleDescription"
  | "invoiceRecipientName"
  | "invoiceRecipientNip"
  | "invoiceRecipientStreet"
  | "invoiceRecipientZip"
  | "invoiceRecipientCity"
  | "jstRecipientEnabled"
  | "jstRecipientName"
  | "jstRecipientNip"
  | "jstRecipientStreet"
  | "jstRecipientZip"
  | "jstRecipientCity"
  | "street"
  | "number"
  | "local"
  | "zip"
  | "city"
  | "country"
  | "active"
> & {
  name?: string | null;
  type?: Address["type"] | null;
  nip?: string | null;
  companyName?: string | null;
  invoiceRecipientEnabled?: boolean | null;
  invoiceRecipientRole?: Address["invoiceRecipientRole"] | null;
  invoiceRecipientRoleDescription?: string | null;
  invoiceRecipientName?: string | null;
  invoiceRecipientNip?: string | null;
  invoiceRecipientStreet?: string | null;
  invoiceRecipientZip?: string | null;
  invoiceRecipientCity?: string | null;
  jstRecipientEnabled?: boolean | null;
  jstRecipientName?: string | null;
  jstRecipientNip?: string | null;
  jstRecipientStreet?: string | null;
  jstRecipientZip?: string | null;
  jstRecipientCity?: string | null;
  street?: string | null;
  number?: string | null;
  local?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
  active?: boolean | null;
};

function normalizeOrderFormAddress(
  address: OrderFormAddressInput,
  fallbackType: AddressTypeEnum,
): Address {
  return normalizeInvoiceRecipientAddress({
    ...address,
    name: address.name ?? "",
    type: address.type ?? fallbackType,
    nip: address.nip ?? "",
    companyName: address.companyName ?? "",
    invoiceRecipientEnabled: address.invoiceRecipientEnabled ?? false,
    invoiceRecipientRole: address.invoiceRecipientRole ?? "recipient",
    invoiceRecipientRoleDescription:
      address.invoiceRecipientRoleDescription ?? "",
    invoiceRecipientName: address.invoiceRecipientName ?? "",
    invoiceRecipientNip: address.invoiceRecipientNip ?? "",
    invoiceRecipientStreet: address.invoiceRecipientStreet ?? "",
    invoiceRecipientZip: address.invoiceRecipientZip ?? "",
    invoiceRecipientCity: address.invoiceRecipientCity ?? "",
    jstRecipientEnabled: address.jstRecipientEnabled ?? false,
    jstRecipientName: address.jstRecipientName ?? "",
    jstRecipientNip: address.jstRecipientNip ?? "",
    jstRecipientStreet: address.jstRecipientStreet ?? "",
    jstRecipientZip: address.jstRecipientZip ?? "",
    jstRecipientCity: address.jstRecipientCity ?? "",
    street: address.street ?? "",
    number: address.number ?? "",
    local: address.local ?? "",
    zip: address.zip ?? "",
    city: address.city ?? "",
    country: address.country ?? "Polska",
    active: address.active ?? true,
  });
}

function createEmptyBillingAddress(): Address {
  return {
    name: "",
    type: AddressTypeEnum.BILLING,
    nip: "",
    companyName: "",
    invoiceRecipientEnabled: false,
    invoiceRecipientRole: "recipient",
    invoiceRecipientRoleDescription: "",
    invoiceRecipientName: "",
    invoiceRecipientNip: "",
    invoiceRecipientStreet: "",
    invoiceRecipientZip: "",
    invoiceRecipientCity: "",
    jstRecipientEnabled: false,
    jstRecipientName: "",
    jstRecipientNip: "",
    jstRecipientStreet: "",
    jstRecipientZip: "",
    jstRecipientCity: "",
    street: "",
    number: "",
    local: "",
    zip: "",
    city: "",
    country: "Polska",
    active: true,
  };
}

function shouldNormalizeOrderFormAddress(address: OrderFormAddressInput) {
  return (
    address.name === null ||
    address.name === undefined ||
    address.type === null ||
    address.type === undefined ||
    address.nip === null ||
    address.nip === undefined ||
    address.companyName === null ||
    address.companyName === undefined ||
    address.invoiceRecipientEnabled === null ||
    address.invoiceRecipientEnabled === undefined ||
    address.invoiceRecipientRole === null ||
    address.invoiceRecipientRole === undefined ||
    address.invoiceRecipientRoleDescription === null ||
    address.invoiceRecipientRoleDescription === undefined ||
    address.invoiceRecipientName === null ||
    address.invoiceRecipientName === undefined ||
    address.invoiceRecipientNip === null ||
    address.invoiceRecipientNip === undefined ||
    address.invoiceRecipientStreet === null ||
    address.invoiceRecipientStreet === undefined ||
    address.invoiceRecipientZip === null ||
    address.invoiceRecipientZip === undefined ||
    address.invoiceRecipientCity === null ||
    address.invoiceRecipientCity === undefined ||
    address.jstRecipientEnabled === null ||
    address.jstRecipientEnabled === undefined ||
    address.jstRecipientName === undefined ||
    address.jstRecipientName === null ||
    address.jstRecipientNip === undefined ||
    address.jstRecipientNip === null ||
    address.jstRecipientStreet === undefined ||
    address.jstRecipientStreet === null ||
    address.jstRecipientZip === undefined ||
    address.jstRecipientZip === null ||
    address.jstRecipientCity === undefined ||
    address.jstRecipientCity === null ||
    address.street === null ||
    address.street === undefined ||
    address.number === null ||
    address.number === undefined ||
    address.local === null ||
    address.local === undefined ||
    address.zip === null ||
    address.zip === undefined ||
    address.city === null ||
    address.city === undefined ||
    address.country === null ||
    address.country === undefined ||
    address.active === null ||
    address.active === undefined
  );
}

function getOrderFormBillingValueForInvoice(
  invoice: unknown,
  billing: OrderFormAddressInput | null | undefined,
): Address | null | undefined {
  if (invoice) {
    if (!billing) {
      return createEmptyBillingAddress();
    }

    if (shouldNormalizeOrderFormAddress(billing)) {
      return normalizeOrderFormAddress(billing, AddressTypeEnum.BILLING);
    }

    return undefined;
  }

  return billing === null ? undefined : null;
}

function expandAllSections(
  formData: ReturnType<typeof orderForm>,
): ReturnType<typeof orderForm> {
  return {
    ...formData,
    sections: formData.sections.map((section) => ({
      ...section,
      isDefaultExpanded: true,
    })),
  };
}

export function createQuickOrderFormData(
  formData: ReturnType<typeof orderForm>,
  t: TFunction,
): ReturnType<typeof orderForm> {
  const itemSection = formData.sections.find(
    (section) => section.name === "items",
  );
  const invoiceField = formData.sections
    .flatMap((section) => section.fields)
    .find((field) => field.name === "invoice");
  const billingSection = formData.sections.find(
    (section) => section.dependsOn === "invoice",
  );
  const paymentTypeField = formData.sections
    .flatMap((section) => section.fields)
    .find((field) => field.name === "paymentType");
  const shippingSections = formData.sections.filter(
    (section) =>
      section.fields.some((field) => field.name === "shippingOption") ||
      section.dependsOn === "shippingOption",
  );

  return {
    ...formData,
    sections: [
      {
        fieldArray: false,
        heading: t("order.quickOrder.customerSection", {
          defaultValue: "Quick customer",
        }),
        description: t("order.quickOrder.customerSectionDescription", {
          defaultValue:
            "Name and phone are optional. Use them when the customer gave enough details during intake.",
        }),
        isDefaultExpanded: true,
        fields: [
          {
            name: "contact.name",
            label: t("order.quickOrder.fullNameLabel", {
              defaultValue: "Full name",
            }),
            isRequired: false,
            placeholder: t("order.quickOrder.fullNamePlaceholder", {
              defaultValue: "e.g. John Smith",
            }),
            autocomplete: "name",
          },
          {
            name: "contact.phone",
            label: t("order.quickOrder.phoneLabel", {
              defaultValue: "Phone",
            }),
            isRequired: false,
            placeholder: t("order.quickOrder.phonePlaceholder", {
              defaultValue: "123456789",
            }),
            autocomplete: "tel-national",
          },
          ...(invoiceField ? [invoiceField] : []),
        ],
      },
      ...(billingSection
        ? [
            {
              ...billingSection,
              isDefaultExpanded: true,
              fields: billingSection.fields.filter(
                (field) =>
                  field.name !== "billing" &&
                  field.name !== "saveBillingAddress",
              ),
            },
          ]
        : []),
      ...(itemSection
        ? [
            {
              ...itemSection,
              isDefaultExpanded: true,
            },
          ]
        : []),
      ...(paymentTypeField
        ? [
            {
              fieldArray: false,
              heading: t("order.quickOrder.paymentSection", {
                defaultValue: "Payment",
              }),
              isDefaultExpanded: true,
              fields: [paymentTypeField],
            },
          ]
        : []),
      ...shippingSections.map((section) => ({
        ...section,
        isDefaultExpanded: false,
      })),
    ],
  };
}

export const stripEmptyOrderItemsResolver =
  <TFieldValues extends FieldValues>(
    resolver: Resolver<TFieldValues>,
  ): Resolver<FieldValues> =>
  (values, context, options) =>
    resolver(
      stripEmptyOrderItems(values) as TFieldValues,
      context,
      options as Parameters<Resolver<TFieldValues>>[2],
    );

function resolveAnonymousPackageShippingValue({
  type,
  isStoreOrder,
  createValue,
  updateValue,
  updateStoreValue,
  duplicateValue,
}: {
  type: OrderFormType;
  isStoreOrder?: boolean;
  createValue?: boolean;
  updateValue?: boolean;
  updateStoreValue?: boolean;
  duplicateValue?: boolean;
}) {
  if (type === "CREATE") {
    return Boolean(createValue);
  }

  if (type === "UPDATE") {
    return Boolean(isStoreOrder ? updateStoreValue : updateValue);
  }

  return Boolean(duplicateValue);
}

async function classifyPrintingMethodsWithFallback(params: {
  items: Parameters<typeof toSerializableOrderPrintingMethodItems>[0];
  currentPrintingMethods?: Order["printingMethods"];
  channelId?: string;
  knownPrintingMethodIds?: NonNullable<Order["printingMethods"]>;
}): Promise<NonNullable<Order["printingMethods"]>> {
  try {
    const { printingMethods } = await classifyOrderPrintingMethodsAdmin({
      items: toSerializableOrderPrintingMethodItems(
        params.items,
        params.knownPrintingMethodIds,
      ),
      currentPrintingMethods: params.currentPrintingMethods ?? [],
      channelId: params.channelId,
    });

    return printingMethods;
  } catch (error) {
    console.error("Failed to classify order printing methods", error);
    return params.currentPrintingMethods ?? [];
  }
}

function filterActiveCustomers(items: Customer[]): Customer[] {
  return items.filter((customer) => customer.active !== false);
}

async function searchOrderFormCustomersInput(
  searchKey: string,
  tenantContext: TenantContext,
): Promise<Customer[]> {
  if (searchKey.length < 3) {
    return [];
  }

  try {
    const searchResult = await meilisearchSearch(
      "CUSTOMERS",
      searchKey,
      undefined,
      undefined,
      5,
    );
    const customerIds = Array.isArray(searchResult) ? searchResult : [];

    if (customerIds.length > 0) {
      const result = await get<Customer>(
        db.query<Customer>(
          firestore,
          "customers",
          customerIds.length,
          undefined,
          tenant.queryConstraints(tenantContext, [
            where("id", "in", customerIds),
          ]),
        ),
      );
      const customersById = new Map(
        filterActiveCustomers(result?.[0] ?? []).map((customer) => [
          customer.id,
          customer,
        ]),
      );

      return customerIds
        .map((customerId) => customersById.get(customerId))
        .filter((customer): customer is Customer => Boolean(customer));
    }
  } catch (error) {
    console.error(
      "Error searching customers with Meilisearch, falling back to Firebase:",
      error,
    );
  }

  const exactResult = await get<Customer>(
    db.search<Customer>(
      firestore,
      "customers",
      searchKey,
      tenant.queryConstraints(tenantContext),
    ),
  );
  const exactCustomers = filterActiveCustomers(exactResult?.[0] ?? []);
  if (exactCustomers.length > 0) {
    return exactCustomers;
  }

  const fuzzySeed = getFuzzyCustomerSearchSeed(searchKey);
  if (!fuzzySeed) {
    return [];
  }

  const fuzzyResult = await get<Customer>(
    db.search<Customer>(
      firestore,
      "customers",
      fuzzySeed,
      tenant.queryConstraints(tenantContext),
    ),
  );

  return rankCustomersByFuzzySearch(
    filterActiveCustomers(fuzzyResult?.[0] ?? []),
    searchKey,
    5,
  );
}

function showShippingDestinationRequiredError(
  toaster: CreateToasterReturn,
  t: OrderTranslation,
) {
  toaster.error({
    title: t("error.somethingWrong", {
      defaultValue: "Something went wrong",
    }),
    description: t("order.shippingDestinationRequired", {
      defaultValue:
        "Select a delivery or pickup destination before saving the order.",
    }),
  });
}

function handleInvalidOrderSubmit(
  errors: FieldErrors<FieldValues>,
  toaster: CreateToasterReturn,
  t: OrderTranslation,
) {
  if (!isUndefined(errors.shipping)) {
    showShippingDestinationRequiredError(toaster, t);
  }
}

function StoreOrderUpdateForm({
  order,
  asDrawer = false,
  open = false,
  setOpen,
  setOptimisticOrder,
}: StoreOrderUpdateFormProps) {
  const { t, i18n } = useT(["order", "orders", "allegro", "translation"]);
  const { channel } = useChannels();
  const tenantContext = useTenantContext();
  const { filteredMembers } = useConfigurationMembers();
  const { warehouses } = useConfigurationWarehouses();
  const {
    printingMethodsSettings,
    productionGroupingSettings,
    shippingMethodsSettings,
    orderWorkflowStatusesSettings,
  } = useConfigurationSettings();
  const { processingQueue } = useOrders();
  const carriedOutByOptions: SelectOption[] = useMemo(
    () =>
      filteredMembers
        ? filteredMembers.map(
            (member) =>
              ({
                label: member.name,
                value: member.name,
              }) as SelectOption,
          )
        : [],
    [filteredMembers],
  );
  const printingMethodOptions = useMemo(
    () => getPrintingMethodOptions(printingMethodsSettings, t),
    [printingMethodsSettings, t],
  );
  const shippingMethodOptions = useMemo(
    () => getShippingMethodOptions(shippingMethodsSettings, {}, t),
    [shippingMethodsSettings, t],
  );
  const orderStatusOptions = useMemo(
    () => getOrderWorkflowStatusOptions(orderWorkflowStatusesSettings, t),
    [orderWorkflowStatusesSettings, t],
  );
  const fileStatusOptions = useMemo(
    () => getOrderFileStatusOptions(orderWorkflowStatusesSettings, t),
    [orderWorkflowStatusesSettings, t],
  );
  const knownPrintingMethodIds = useMemo(
    () => getKnownPrintingMethodIds(printingMethodsSettings),
    [printingMethodsSettings],
  );
  const formLanguage = i18n.resolvedLanguage ?? i18n.language;
  const formT = useMemo(
    () =>
      i18n.getFixedT(formLanguage, [
        "order",
        "orders",
        "allegro",
        "translation",
      ]),
    [formLanguage, i18n],
  );
  const updateDefaultValues = useMemo(
    () => initialValuesUpdateStore(order),
    [order],
  );
  const updateResolver = useMemo(() => yupResolver(OrderUpdateSchemaStore), []);
  const methods = useForm<UpdateInputStore>({
    defaultValues: updateDefaultValues,
    resolver: updateResolver,
  });

  useEffect(() => {
    if (asDrawer && !open) return;

    methods.reset(updateDefaultValues);
  }, [asDrawer, methods, open, updateDefaultValues]);

  const formData = useMemo(
    () =>
      updateOrderFormStore(
        carriedOutByOptions,
        formT,
        printingMethodOptions,
        shippingMethodOptions,
        orderStatusOptions,
        fileStatusOptions,
      ),
    [
      carriedOutByOptions,
      fileStatusOptions,
      formT,
      orderStatusOptions,
      printingMethodOptions,
      shippingMethodOptions,
    ],
  );
  const label = `${t("FormTypes.UPDATE", { defaultValue: "Update" })} ${t("orders.order", { defaultValue: "Order" })}`;

  if (!channel) return null;

  const form = (
    <>
      <FormController
        methods={methods}
        buttonLeftIcon={getIconByFormType("UPDATE")}
        buttonLabel={label}
        formData={formData}
        update
        handleInvalid={(errors) => handleInvalidOrderSubmit(errors, toaster, t)}
        handleSubmit={async (data) =>
          await handleUpdateOrderStore(
            order,
            order.id,
            data,
            channel,
            toaster,
            t,
            setOptimisticOrder,
            tenantContext,
            knownPrintingMethodIds,
            productionGroupingSettings.profile,
            Boolean(methods.formState.dirtyFields.paymentStatus),
          )
        }
        By={<By update autoAddToCarriedOutBy={false} />}
        warehouses={warehouses}
        orderProcessingQueue={processingQueue.current}
        afterAddressSection={<AnonymousPackageShippingField t={t} compact />}
        t={t}
        i18n={i18n}
      />
    </>
  );

  if (asDrawer) {
    return (
      <Drawer
        header={label}
        size={"xl"}
        closeOnOverlayClick={false}
        open={open}
        setOpen={setOpen}
        restoreFocus={false}
        lazyMount
        unmountOnExit
      >
        {form}
      </Drawer>
    );
  }

  return form;
}

function StandardOrderUpdateForm({
  order,
  asDrawer = false,
  open = false,
  setOpen,
  setOptimisticOrder,
}: StandardOrderUpdateFormProps) {
  const { t, i18n } = useT(["order", "orders", "allegro", "translation"]);
  const { channel } = useChannels();
  const tenantContext = useTenantContext();
  const searchCustomersInput = useCallback(
    (searchKey: string) =>
      searchOrderFormCustomersInput(searchKey, tenantContext),
    [tenantContext],
  );
  const searchFns = useMemo(
    () => ({
      customers: searchCustomersInput,
    }),
    [searchCustomersInput],
  );
  const { filteredMembers } = useConfigurationMembers();
  const { warehouses } = useConfigurationWarehouses();
  const {
    storeSettings,
    printingMethodsSettings,
    productionGroupingSettings,
    shippingMethodsSettings,
    paymentMethodsSettings,
    orderWorkflowStatusesSettings,
  } = useConfigurationSettings();
  const { processingQueue } = useOrders();
  const pickupAreaWarehouseIds = useMemo(
    () => normalizePickupAreaWarehouseIds(channel?.warehouses),
    [channel?.warehouses],
  );
  const { data: designatedPickupAreas } = useSWRImmutable(
    pickupAreaWarehouseIds.length > 0 ? pickupAreaWarehouseIds : null,
    fetchDesignatedPickupAreas,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: true,
    },
  );
  const carriedOutByOptions: SelectOption[] = useMemo(
    () =>
      filteredMembers
        ? filteredMembers.map(
            (member) =>
              ({
                label: member.name,
                value: member.name,
              }) as SelectOption,
          )
        : [],
    [filteredMembers],
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
  const knownPrintingMethodIds = useMemo(
    () => getKnownPrintingMethodIds(printingMethodsSettings),
    [printingMethodsSettings],
  );
  const formLanguage = i18n.resolvedLanguage ?? i18n.language;
  const formT = useMemo(
    () =>
      i18n.getFixedT(formLanguage, [
        "order",
        "orders",
        "allegro",
        "translation",
      ]),
    [formLanguage, i18n],
  );
  const updateDefaultValues = useMemo(
    () => initialValuesUpdate(order),
    [order],
  );
  const updateResolver = useMemo(
    () => stripEmptyOrderItemsResolver(yupResolver(OrderUpdateSchema)),
    [],
  );
  const methods = useForm<FieldValues>({
    defaultValues: updateDefaultValues,
    resolver: updateResolver,
  });

  useEffect(() => {
    if (asDrawer && !open) return;

    methods.reset(updateDefaultValues);
  }, [asDrawer, methods, open, updateDefaultValues]);

  const watchShippingOption = useWatch({
    name: "shippingOption",
    control: methods.control,
  });
  const watchCustomer = useWatch({
    name: "customer",
    control: methods.control,
  }) as string | NestedCustomer | undefined;
  const watchAnonymousPackageShipping = useWatch({
    name: "anonymousPackageShipping",
    control: methods.control,
  });
  const watchInvoiceUpdateForm = useWatch({
    name: "invoice",
    control: methods.control,
  });
  const watchBillingUpdateForm = useWatch({
    name: "billing",
    control: methods.control,
  }) as OrderFormAddressInput | null | undefined;
  const filteredPickupAreas = useMemo(() => {
    if (!designatedPickupAreas) return [];

    if (!watchShippingOption) return designatedPickupAreas;

    return getPickupAreasByShippingOption(
      designatedPickupAreas,
      watchShippingOption,
    );
  }, [designatedPickupAreas, watchShippingOption]);
  const pickupAreaOptions: SelectOption[] = useMemo(
    () =>
      filteredPickupAreas
        ? filteredPickupAreas.map(
            (area) =>
              ({
                label: area.name,
                value: area.id,
              }) as SelectOption,
          )
        : [],
    [filteredPickupAreas],
  );
  const availablePaymentTypes = useMemo(() => {
    const castedCustomer = isNestedCustomer(watchCustomer)
      ? (watchCustomer as Customer)
      : undefined;

    return getAvailablePaymentTypes(
      watchShippingOption ?? ShippingOptions.PERSONAL_COLLECTION,
      false,
      castedCustomer?.allowedBankPayments ?? false,
      castedCustomer?.allowedDefferedPayments ?? false,
      castedCustomer?.allowedOnPickupPayments ?? false,
      undefined,
      Boolean(watchAnonymousPackageShipping),
      paymentMethodsSettings,
    );
  }, [
    paymentMethodsSettings,
    watchAnonymousPackageShipping,
    watchCustomer,
    watchShippingOption,
  ]);

  useEffect(() => {
    const currentPaymentType = methods.getValues("paymentType");

    if (
      currentPaymentType &&
      availablePaymentTypes.includes(currentPaymentType)
    ) {
      return;
    }

    const nextPaymentType = availablePaymentTypes[0];

    if (!nextPaymentType) {
      return;
    }

    methods.setValue("paymentType", nextPaymentType);
  }, [availablePaymentTypes, methods]);

  useEffect(() => {
    const nextBilling = getOrderFormBillingValueForInvoice(
      watchInvoiceUpdateForm,
      watchBillingUpdateForm,
    );

    if (nextBilling !== undefined) {
      methods.setValue("billing", nextBilling);
    }
  }, [methods, watchBillingUpdateForm, watchInvoiceUpdateForm]);

  useRealtimeFormDocument({
    collectionPath: "/customers",
    enabled: isNestedCustomer(watchCustomer),
    fieldName: "customer",
    form: methods,
    value: isNestedCustomer(watchCustomer) ? watchCustomer : undefined,
  });

  const formData = useMemo(
    () =>
      updateOrderForm(
        carriedOutByOptions,
        pickupAreaOptions,
        availablePaymentTypes,
        formT,
        printingMethodOptions,
        shippingMethodOptions,
        paymentMethodOptions,
        orderStatusOptions,
        fileStatusOptions,
      ),
    [
      availablePaymentTypes,
      carriedOutByOptions,
      fileStatusOptions,
      formT,
      orderStatusOptions,
      paymentMethodOptions,
      pickupAreaOptions,
      printingMethodOptions,
      shippingMethodOptions,
    ],
  );
  const label = `${t("FormTypes.UPDATE", { defaultValue: "Update" })} ${t("orders.order", { defaultValue: "Order" })}`;

  if (!channel) return null;

  const form = (
    <FormController
      methods={methods}
      buttonLeftIcon={getIconByFormType("UPDATE")}
      buttonLabel={label}
      formData={formData}
      update
      searchFn={searchFns}
      handleInvalid={(errors) => handleInvalidOrderSubmit(errors, toaster, t)}
      handleSubmit={async (data) =>
        await handleUpdateOrder(
          order,
          order.id,
          data as UpdateInput,
          channel,
          toaster,
          storeSettings,
          t,
          setOptimisticOrder,
          tenantContext,
          knownPrintingMethodIds,
          productionGroupingSettings.profile,
          Boolean(methods.formState.dirtyFields.paymentStatus),
        )
      }
      ProductGroupedIndexedSearch={ProductGroupedIndexedSearch}
      CombinationInput={CombinationInput}
      By={<By update autoAddToCarriedOutBy={false} />}
      warehouses={warehouses}
      GenerateOrderItems={GenerateOrderItems}
      orderProcessingQueue={processingQueue.current}
      afterAddressSection={<AnonymousPackageShippingField t={t} compact />}
      t={t}
      i18n={i18n}
    />
  );

  if (asDrawer) {
    return (
      <Drawer
        header={label}
        size={"xl"}
        closeOnOverlayClick={false}
        open={open}
        setOpen={setOpen}
        restoreFocus={false}
        lazyMount
        unmountOnExit
      >
        {form}
      </Drawer>
    );
  }

  return form;
}

export async function fetchDesignatedPickupAreas(warehouses: unknown[]) {
  const warehouseIds = normalizePickupAreaWarehouseIds(warehouses);

  if (warehouseIds.length === 0) {
    return [];
  }

  try {
    const query = db.query<DesignatedPickupArea>(
      firestore,
      "designatedPickupAreas",
      99,
      undefined,
      [where("warehouseId", "in", warehouseIds), where("active", "==", true)],
    );
    const result = await get<DesignatedPickupArea>(query);
    const areas = result ? result[0] : [];
    return Array.isArray(areas) ? areas : [];
  } catch (error) {
    console.error("Error fetching pickup areas:", error);
    return [];
  }
}

const FullOrderForm = ({
  order,
  orderItems,
  type,
  asDrawer = false,
  open = false,
  setOpen,
  onValuesChange,
  createMode = "standard",
  duplicateInitialOverrides,
  createInitialOverrides,
  createOverrides,
  setOptimisticOrder,
  onCreateSuccess,
}: OrderFormProps) => {
  const { t, i18n } = useT(["order", "orders", "allegro", "translation"]);
  const [fakturowniaAlert, setFakturowniaAlert] =
    useState<FakturowniaAlert | null>(null);
  const [createSubmissionLocked, setCreateSubmissionLocked] = useState(false);
  const createSubmissionLockedRef = useRef(false);
  const createNavigationStartedRef = useRef(false);
  const releaseCreateSubmissionLock = useCallback(() => {
    createSubmissionLockedRef.current = false;
    setCreateSubmissionLocked(false);
  }, []);
  const resetCreateSubmissionNavigationState = useCallback(() => {
    createNavigationStartedRef.current = false;
    releaseCreateSubmissionLock();
  }, [releaseCreateSubmissionLock]);
  const [billingPrefillNoticeCustomerKey, setBillingPrefillNoticeCustomerKey] =
    useState<string | null>(null);
  const [paymentTypeAutoSelectionNotice, setPaymentTypeAutoSelectionNotice] =
    useState<CreateOrderPaymentAutoSelectionNotice | null>(null);
  const { channel } = useChannels();
  const tenantContext = useTenantContext();
  const searchCustomersInput = useCallback(
    (searchKey: string) =>
      searchOrderFormCustomersInput(searchKey, tenantContext),
    [tenantContext],
  );
  const { confirmDefaultComputerChannel, defaultComputerChannelDialog } =
    useDefaultComputerChannelGuard();
  const { filteredMembers } = useConfigurationMembers();
  const { warehouses } = useConfigurationWarehouses();
  const {
    storeSettings,
    printingMethodsSettings,
    productionGroupingSettings,
    shippingMethodsSettings,
    paymentMethodsSettings,
    orderWorkflowStatusesSettings,
  } = useConfigurationSettings();
  const { processingQueue } = useOrders();
  const pickupAreaWarehouseIds = useMemo(
    () => normalizePickupAreaWarehouseIds(channel?.warehouses),
    [channel?.warehouses],
  );
  const { data: designatedPickupAreas } = useSWRImmutable(
    pickupAreaWarehouseIds.length > 0 ? pickupAreaWarehouseIds : null,
    fetchDesignatedPickupAreas,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: true,
    },
  );
  const carriedOutByOptions: SelectOption[] = useMemo(
    () =>
      filteredMembers
        ? filteredMembers.map(
            (member) =>
              ({
                label: member.name,
                value: member.name,
              }) as SelectOption,
          )
        : [],
    [filteredMembers],
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
  const knownPrintingMethodIds = useMemo(
    () => getKnownPrintingMethodIds(printingMethodsSettings),
    [printingMethodsSettings],
  );

  const label = `${t(`FormTypes.${type}`, { defaultValue: "Create" })} ${t("orders.order", { defaultValue: "Order" })}`;
  const formLanguage = i18n.resolvedLanguage ?? i18n.language;
  const formT = useMemo(
    () =>
      i18n.getFixedT(formLanguage, [
        "order",
        "orders",
        "allegro",
        "translation",
      ]),
    [formLanguage, i18n],
  );
  const { replace } = useRouter();
  const CreateSchemaYupResolver = useMemo(
    () =>
      stripEmptyOrderItemsResolver(
        yupResolver(
          createMode === "quick"
            ? AdminQuickOrderCreateSchema
            : OrderCreateSchema,
        ),
      ),
    [createMode],
  );
  const StandardCreateSchemaYupResolver = useMemo(
    () => stripEmptyOrderItemsResolver(yupResolver(OrderCreateSchema)),
    [],
  );
  const UpdateSchemaYupResolver = useMemo(
    () => stripEmptyOrderItemsResolver(yupResolver(OrderUpdateSchema)),
    [],
  );
  const UpdateSchemaStoreYupResolver = useMemo(
    () => yupResolver(OrderUpdateSchemaStore),
    [],
  );
  const createDefaultValues = useMemo(
    () =>
      type === "CREATE"
        ? initialValuesCreate(orderItems, createInitialOverrides)
        : undefined,
    [createInitialOverrides, orderItems, type],
  );
  const updateDefaultValues = useMemo(
    () =>
      type === "UPDATE" && order && !order.isFromStore
        ? initialValuesUpdate(order)
        : undefined,
    [order, type],
  );
  const updateStoreDefaultValues = useMemo(
    () =>
      type === "UPDATE" && order?.isFromStore
        ? initialValuesUpdateStore(order)
        : undefined,
    [order, type],
  );
  const duplicateDefaultValues = useMemo(
    () =>
      type === "DUPLICATE" && order
        ? initialValuesDuplicate(order, duplicateInitialOverrides)
        : undefined,
    [duplicateInitialOverrides, order, type],
  );

  const CreateForm = useForm({
    defaultValues: createDefaultValues,
    resolver: CreateSchemaYupResolver,
    disabled: type !== "CREATE",
  });

  const UpdateForm = useForm({
    defaultValues: updateDefaultValues,
    resolver: UpdateSchemaYupResolver,
    disabled: type !== "UPDATE" || Boolean(order?.isFromStore),
  });

  const UpdateFormStore = useForm({
    defaultValues: updateStoreDefaultValues,
    resolver: UpdateSchemaStoreYupResolver,
    disabled: type !== "UPDATE" || !order?.isFromStore,
  });

  const DuplicateForm = useForm({
    defaultValues: duplicateDefaultValues,
    resolver: StandardCreateSchemaYupResolver,
    disabled: type !== "DUPLICATE",
  });

  const watchShippingOption = useWatch({
    name: "shippingOption",
    control: CreateForm?.control,
    disabled: CreateForm.formState.disabled,
  });

  const watchShippingUpdateFormOption = useWatch({
    name: "shippingOption",
    control: UpdateForm?.control,
    disabled: type !== "UPDATE" || Boolean(order?.isFromStore),
  });

  const watchShippingDuplicateFormOption = useWatch({
    name: "shippingOption",
    control: DuplicateForm?.control,
    disabled: type !== "DUPLICATE",
  });

  const watchItems = useWatch({
    name: "items",
    control: CreateForm?.control,
    disabled: CreateForm.formState.disabled,
  });

  const watchContactCreateForm = useWatch({
    name: "contact",
    control: CreateForm?.control,
    disabled: CreateForm.formState.disabled,
  });

  const watchContactNameCreateForm = useWatch({
    name: "contact.name",
    control: CreateForm?.control,
    disabled:
      CreateForm.formState.disabled ||
      type !== "CREATE" ||
      createMode !== "quick",
  });

  const watchEmailCreateForm = useWatch({
    name: "email",
    control: CreateForm?.control,
    disabled: CreateForm.formState.disabled,
  });

  const watchShippingCreateForm = useWatch({
    name: "shipping",
    control: CreateForm?.control,
    disabled: CreateForm.formState.disabled,
  });

  const watchInvoiceCreateForm = useWatch({
    name: "invoice",
    control: CreateForm?.control,
    disabled: CreateForm.formState.disabled,
  });

  const watchBillingCreateForm = useWatch({
    name: "billing",
    control: CreateForm?.control,
    disabled: CreateForm.formState.disabled,
  });

  const watchInvoiceDuplicateForm = useWatch({
    name: "invoice",
    control: DuplicateForm?.control,
    disabled: type !== "DUPLICATE",
  });

  const watchBillingDuplicateForm = useWatch({
    name: "billing",
    control: DuplicateForm?.control,
    disabled: type !== "DUPLICATE",
  }) as OrderFormAddressInput | null | undefined;

  const watchPaymentTypeCreateForm = useWatch({
    name: "paymentType",
    control: CreateForm?.control,
    disabled: CreateForm.formState.disabled,
  });

  const watchPaymentStatusCreateForm = useWatch({
    name: "paymentStatus",
    control: CreateForm?.control,
    disabled: CreateForm.formState.disabled,
  });

  const watchInvoiceNotesCreateForm = useWatch({
    name: "invoiceNotes",
    control: CreateForm?.control,
    disabled: CreateForm.formState.disabled,
  });

  const watchCustomerCreateForm: string | NestedCustomer = useWatch({
    name: "customer",
    control: CreateForm?.control,
    disabled: CreateForm.formState.disabled,
  });
  const watchCustomerCreateFormKey = useMemo(() => {
    if (!isNestedCustomer(watchCustomerCreateForm)) {
      return null;
    }

    const customerId = watchCustomerCreateForm.id?.trim();
    if (customerId) {
      return customerId;
    }

    const customerName = watchCustomerCreateForm.name?.trim();
    return customerName || null;
  }, [watchCustomerCreateForm]);

  const watchCustomerUpdateForm: string | NestedCustomer = useWatch({
    name: "customer",
    control: UpdateForm?.control,
    disabled: type !== "UPDATE" || Boolean(order?.isFromStore),
  });
  const watchCustomerDuplicateForm: string | NestedCustomer = useWatch({
    name: "customer",
    control: DuplicateForm?.control,
    disabled: type !== "DUPLICATE",
  });

  const watchAnonymousPackageShippingCreate = useWatch({
    name: "anonymousPackageShipping",
    control: CreateForm?.control,
    disabled: type !== "CREATE",
  });

  const watchAnonymousPackageShippingUpdate = useWatch({
    name: "anonymousPackageShipping",
    control: UpdateForm?.control,
    disabled: type !== "UPDATE" || Boolean(order?.isFromStore),
  });

  const watchAnonymousPackageShippingUpdateStore = useWatch({
    name: "anonymousPackageShipping",
    control: UpdateFormStore?.control,
    disabled: type !== "UPDATE" || !order?.isFromStore,
  });

  const watchAnonymousPackageShippingDuplicate = useWatch({
    name: "anonymousPackageShipping",
    control: DuplicateForm?.control,
    disabled: type !== "DUPLICATE",
  });

  // Filter pickup areas based on selected shipping option
  const filteredPickupAreas = useMemo(() => {
    if (!designatedPickupAreas) return [];

    // Get the current shipping option from the form being used
    const currentShippingOption =
      type === "CREATE"
        ? watchShippingOption
        : type === "UPDATE"
          ? watchShippingUpdateFormOption
          : watchShippingDuplicateFormOption;

    if (!currentShippingOption) return designatedPickupAreas;

    return getPickupAreasByShippingOption(
      designatedPickupAreas,
      currentShippingOption,
    );
  }, [
    designatedPickupAreas,
    watchShippingOption,
    watchShippingUpdateFormOption,
    watchShippingDuplicateFormOption,
    type,
  ]);

  const pickupAreaOptions: SelectOption[] = useMemo(
    () =>
      filteredPickupAreas
        ? filteredPickupAreas.map(
            (area) =>
              ({
                label: area.name,
                value: area.id,
              }) as SelectOption,
          )
        : [],
    [filteredPickupAreas],
  );

  const handleSubmitCreateOrder = async (formData: CreateInput) => {
    if (!channel) return;
    const mergedFormData = {
      ...formData,
      ...createOverrides,
    };
    const quickCustomer = createQuickOrderCustomerPatch(
      mergedFormData.contact?.name,
    );
    const submissionData: CreateInput =
      createMode === "quick"
        ? {
            ...mergedFormData,
            customer: quickCustomer.customer,
            contact: {
              ...mergedFormData.contact,
              name: quickCustomer.contactName,
              active: true,
            },
            saveCustomer: false,
            saveContact: false,
            sendStatusChangeEmail: false,
            saveBillingAddress: false,
            saveShippingAddress: false,
            shipping:
              mergedFormData.shippingOption ===
              ShippingOptions.PERSONAL_COLLECTION
                ? null
                : mergedFormData.shipping,
          }
        : mergedFormData;
    const targetChannelId = submissionData.toChannel?.id ?? channel.id;
    await confirmDefaultComputerChannel(targetChannelId, async () => {
      if (createSubmissionLockedRef.current) {
        return;
      }

      createSubmissionLockedRef.current = true;
      createNavigationStartedRef.current = false;
      setCreateSubmissionLocked(true);
      setFakturowniaAlert(null);

      try {
        await handleCreateOrder(
          submissionData,
          channel,
          toaster,
          storeSettings,
          (href, options) => {
            createNavigationStartedRef.current = true;
            replace(href, options);
          },
          t,
          i18n.resolvedLanguage as Locale,
          (alert) => setFakturowniaAlert(alert),
          onCreateSuccess,
          tenantContext,
          knownPrintingMethodIds,
          productionGroupingSettings.profile,
          {
            createMode,
          },
        );
      } finally {
        if (!createNavigationStartedRef.current) {
          releaseCreateSubmissionLock();
        }
      }
    });
  };

  useLayoutEffect(() => {
    if (type !== "CREATE") {
      return;
    }

    return () => {
      if (createNavigationStartedRef.current) {
        resetCreateSubmissionNavigationState();
      }
    };
  }, [resetCreateSubmissionNavigationState, type]);

  const createSubmitLoadingLabel = t("order.openingCreatedOrder", {
    defaultValue: "Opening order...",
  });

  const fakturowniaAlertNode =
    (type === "CREATE" || type === "DUPLICATE") && fakturowniaAlert ? (
      <Alert.Root
        status={fakturowniaAlert.type === "error" ? "error" : "warning"}
        mb={4}
        role="alert"
      >
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{fakturowniaAlert.title}</Alert.Title>
          <Alert.Description>{fakturowniaAlert.description}</Alert.Description>
        </Alert.Content>
      </Alert.Root>
    ) : null;

  const availablePaymentTypes = useMemo(() => {
    const castedCustomer = isNestedCustomer(watchCustomerCreateForm)
      ? (watchCustomerCreateForm as Customer)
      : undefined;
    const castedCustomerUpdate = isNestedCustomer(watchCustomerUpdateForm)
      ? (watchCustomerUpdateForm as Customer)
      : undefined;
    const castedCustomerDuplicate = isNestedCustomer(watchCustomerDuplicateForm)
      ? (watchCustomerDuplicateForm as Customer)
      : undefined;
    const resolvedShippingOption =
      type === "CREATE"
        ? (watchShippingOption ?? ShippingOptions.PERSONAL_COLLECTION)
        : type === "UPDATE"
          ? (watchShippingUpdateFormOption ??
            ShippingOptions.PERSONAL_COLLECTION)
          : (watchShippingDuplicateFormOption ??
            ShippingOptions.PERSONAL_COLLECTION);
    const anonymousPackageShipping = resolveAnonymousPackageShippingValue({
      type,
      isStoreOrder: order?.isFromStore,
      createValue: watchAnonymousPackageShippingCreate,
      updateValue: watchAnonymousPackageShippingUpdate,
      updateStoreValue: watchAnonymousPackageShippingUpdateStore,
      duplicateValue: watchAnonymousPackageShippingDuplicate,
    });

    const paymentTypes = getAvailablePaymentTypes(
      resolvedShippingOption,
      false,
      castedCustomer?.allowedBankPayments ||
        castedCustomerUpdate?.allowedBankPayments ||
        castedCustomerDuplicate?.allowedBankPayments ||
        false,
      castedCustomer?.allowedDefferedPayments ||
        castedCustomerUpdate?.allowedDefferedPayments ||
        castedCustomerDuplicate?.allowedDefferedPayments ||
        false,
      castedCustomer?.allowedOnPickupPayments ||
        castedCustomerUpdate?.allowedOnPickupPayments ||
        castedCustomerDuplicate?.allowedOnPickupPayments ||
        false,
      undefined,
      anonymousPackageShipping,
      paymentMethodsSettings,
    );

    if (
      (type === "CREATE" || type === "DUPLICATE") &&
      !paymentTypes.includes(PaymentType.DEFERRED)
    ) {
      return [...paymentTypes, PaymentType.DEFERRED];
    }

    return paymentTypes;
  }, [
    watchCustomerCreateForm,
    watchCustomerUpdateForm,
    watchCustomerDuplicateForm,
    type,
    watchShippingOption,
    watchShippingUpdateFormOption,
    watchShippingDuplicateFormOption,
    watchAnonymousPackageShippingCreate,
    watchAnonymousPackageShippingUpdate,
    watchAnonymousPackageShippingUpdateStore,
    watchAnonymousPackageShippingDuplicate,
    order?.isFromStore,
    paymentMethodsSettings,
  ]);

  useEffect(() => {
    // Store-order updates do not expose payment method changes in this form,
    // so only create/update/duplicate non-store flows need this auto-correction.
    if (type === "UPDATE" && order?.isFromStore) {
      return;
    }

    // Keep the selected payment type aligned with the currently available
    // options when shipping rules (for example anonymous shipping) remove it.
    const syncPaymentType = (
      currentPaymentType: PaymentMethodId | undefined,
      setPaymentType: (paymentType: PaymentMethodId) => void,
    ) => {
      if (
        currentPaymentType &&
        availablePaymentTypes.includes(currentPaymentType)
      ) {
        return;
      }

      const nextPaymentType = availablePaymentTypes[0];

      if (!nextPaymentType) {
        return;
      }

      setPaymentType(nextPaymentType);
    };

    if (type === "CREATE") {
      syncPaymentType(CreateForm.getValues("paymentType"), (paymentType) => {
        CreateForm.setValue("paymentType", paymentType);
      });
      return;
    }

    if (type === "UPDATE") {
      syncPaymentType(UpdateForm.getValues("paymentType"), (paymentType) => {
        UpdateForm.setValue("paymentType", paymentType);
      });
      return;
    }

    syncPaymentType(DuplicateForm.getValues("paymentType"), (paymentType) => {
      DuplicateForm.setValue("paymentType", paymentType);
    });
  }, [
    CreateForm,
    DuplicateForm,
    UpdateForm,
    availablePaymentTypes,
    order?.isFromStore,
    type,
  ]);

  useEffect(() => {
    if (type !== "CREATE" || createMode !== "quick") {
      return;
    }

    const currentContact = CreateForm.getValues("contact");
    const currentCustomer = CreateForm.getValues("customer");
    const sourceName =
      currentContact?.name ||
      (isNestedCustomer(currentCustomer)
        ? currentCustomer.name
        : currentCustomer);
    const quickCustomer = createQuickOrderCustomerPatch(sourceName);

    CreateForm.setValue("customer", quickCustomer.customer);
    CreateForm.setValue("contact.name", quickCustomer.contactName);
    CreateForm.setValue("contact.active", true);
    CreateForm.setValue("saveCustomer", false);
    CreateForm.setValue("saveContact", false);
    CreateForm.setValue("sendStatusChangeEmail", false);
    CreateForm.setValue("saveBillingAddress", false);
    CreateForm.setValue("saveShippingAddress", false);

    const currentShippingOption = CreateForm.getValues("shippingOption");
    if (
      !currentShippingOption ||
      currentShippingOption === ShippingOptions.PERSONAL_COLLECTION
    ) {
      CreateForm.setValue(
        "shippingOption",
        ShippingOptions.PERSONAL_COLLECTION,
      );
      CreateForm.setValue("shipping", null);
    }
  }, [CreateForm, createMode, type]);

  useEffect(() => {
    if (type !== "CREATE" || createMode !== "quick") {
      return;
    }

    const quickCustomer = createQuickOrderCustomerPatch(
      watchContactNameCreateForm,
    );
    const currentCustomer = CreateForm.getValues("customer");

    if (
      typeof currentCustomer !== "string" ||
      currentCustomer !== quickCustomer.customer
    ) {
      CreateForm.setValue("customer", quickCustomer.customer);
    }
  }, [CreateForm, createMode, type, watchContactNameCreateForm]);

  useEffect(() => {
    if (
      type !== "CREATE" ||
      watchShippingOption !== ShippingOptions.PERSONAL_COLLECTION ||
      hasShippingDestination(watchShippingCreateForm)
    ) {
      return;
    }

    const pickupWarehouseAddress = getChannelPickupWarehouseAddress(
      channel,
      warehouses,
    );

    if (!pickupWarehouseAddress) {
      return;
    }

    CreateForm.setValue("shipping", pickupWarehouseAddress);
  }, [
    CreateForm,
    channel,
    type,
    warehouses,
    watchShippingCreateForm,
    watchShippingOption,
  ]);

  useEffect(() => {
    if (
      onValuesChange &&
      type === "CREATE" &&
      !createNavigationStartedRef.current
    ) {
      onValuesChange({
        customer: watchCustomerCreateForm,
        contact: watchContactCreateForm,
        email: watchEmailCreateForm,
        shippingOption: watchShippingOption,
        shipping: watchShippingCreateForm,
        invoice: watchInvoiceCreateForm,
        billing: watchBillingCreateForm,
        items: watchItems,
        paymentType: watchPaymentTypeCreateForm,
        paymentStatus: watchPaymentStatusCreateForm,
        invoiceNotes: watchInvoiceNotesCreateForm,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    watchShippingOption,
    watchShippingCreateForm,
    watchItems,
    watchCustomerCreateForm,
    watchContactCreateForm,
    watchEmailCreateForm,
    watchInvoiceCreateForm,
    watchBillingCreateForm,
    watchPaymentTypeCreateForm,
    watchPaymentStatusCreateForm,
    watchInvoiceNotesCreateForm,
    type,
  ]);

  useEffect(() => {
    if (type !== "CREATE") {
      setBillingPrefillNoticeCustomerKey(null);
      setPaymentTypeAutoSelectionNotice(null);
    }

    if (type === "CREATE" || type === "DUPLICATE") return;
    if (fakturowniaAlert) {
      setFakturowniaAlert(null);
    }
  }, [type, fakturowniaAlert]);

  useEffect(() => {
    if (type !== "CREATE") return;
    const nextBilling = getOrderFormBillingValueForInvoice(
      watchInvoiceCreateForm,
      watchBillingCreateForm,
    );

    if (nextBilling !== undefined) {
      CreateForm.setValue("billing", nextBilling);
    }
  }, [watchBillingCreateForm, watchInvoiceCreateForm, type, CreateForm]);

  useEffect(() => {
    if (type !== "DUPLICATE") return;
    const nextBilling = getOrderFormBillingValueForInvoice(
      watchInvoiceDuplicateForm,
      watchBillingDuplicateForm,
    );

    if (nextBilling !== undefined) {
      DuplicateForm.setValue("billing", nextBilling);
    }
  }, [
    watchBillingDuplicateForm,
    watchInvoiceDuplicateForm,
    type,
    DuplicateForm,
  ]);

  useEffect(() => {
    if (type !== "CREATE") {
      setBillingPrefillNoticeCustomerKey(null);
      return;
    }
    if (createMode === "quick") {
      setBillingPrefillNoticeCustomerKey(null);
      return;
    }
    if (isNestedCustomer(watchCustomerCreateForm)) {
      const billingAddress = hasCreateOrderBillingPrefillNotice(
        watchCustomerCreateForm,
        AddressTypeEnum.BILLING,
      )
        ? watchCustomerCreateForm.addresses?.find(
            (addr) => addr.type === AddressTypeEnum.BILLING,
          )
        : undefined;
      if (billingAddress && CreateForm.getValues("invoice") === false) {
        CreateForm.setValue("invoice", true);
        CreateForm.setValue(
          "billing",
          normalizeOrderFormAddress(billingAddress, AddressTypeEnum.BILLING),
        );
        setBillingPrefillNoticeCustomerKey(watchCustomerCreateFormKey);
      } else if (!billingAddress) {
        // No billing address on customer – ensure defaults
        if (CreateForm.getValues("invoice") !== false) {
          CreateForm.setValue("invoice", false);
        }
        if (CreateForm.getValues("billing") !== initialValuesCreate().billing) {
          CreateForm.setValue("billing", initialValuesCreate().billing);
        }
        setBillingPrefillNoticeCustomerKey(null);
      } else if (
        billingPrefillNoticeCustomerKey !== watchCustomerCreateFormKey
      ) {
        setBillingPrefillNoticeCustomerKey(null);
      }
    } else {
      // Customer cleared or temporal (non-nested) – reset invoice & billing to defaults
      const currentInvoice = CreateForm.getValues("invoice");
      const currentBilling = CreateForm.getValues("billing");
      const defaultBilling = initialValuesCreate().billing;
      if (currentInvoice !== false) CreateForm.setValue("invoice", false);
      if (currentBilling !== defaultBilling)
        CreateForm.setValue("billing", defaultBilling);
      setBillingPrefillNoticeCustomerKey(null);
    }
  }, [
    billingPrefillNoticeCustomerKey,
    watchCustomerCreateForm,
    watchCustomerCreateFormKey,
    type,
    createMode,
    CreateForm,
  ]);

  // Auto-select payment type based on customer capabilities (deferred > bank transfer)
  useEffect(() => {
    if (type !== "CREATE") {
      setPaymentTypeAutoSelectionNotice(null);
      return;
    }
    if (createMode === "quick") {
      setPaymentTypeAutoSelectionNotice(null);
      return;
    }

    // If customer is not nested (cleared or temporal), always reset to default payment type
    if (!isNestedCustomer(watchCustomerCreateForm)) {
      const current = CreateForm.getValues("paymentType");
      if (current !== PaymentType.ON_PICKUP) {
        CreateForm.setValue("paymentType", PaymentType.ON_PICKUP);
      }
      setPaymentTypeAutoSelectionNotice(null);
      return;
    }

    const customer = watchCustomerCreateForm as Customer;
    const autoSelectionNotice =
      getCreateOrderPaymentAutoSelectionNotice(customer);

    if (autoSelectionNotice === "deferred") {
      if (CreateForm.getValues("paymentType") !== PaymentType.DEFERRED) {
        CreateForm.setValue("paymentType", PaymentType.DEFERRED);
      }
      setPaymentTypeAutoSelectionNotice(autoSelectionNotice);
    } else if (autoSelectionNotice === "bankTransfer") {
      if (CreateForm.getValues("paymentType") !== PaymentType.BANK_TRANSFER) {
        CreateForm.setValue("paymentType", PaymentType.BANK_TRANSFER);
      }
      setPaymentTypeAutoSelectionNotice(autoSelectionNotice);
    } else {
      if (CreateForm.getValues("paymentType") !== PaymentType.ON_PICKUP) {
        CreateForm.setValue("paymentType", PaymentType.ON_PICKUP);
      }
      setPaymentTypeAutoSelectionNotice(null);
    }
  }, [watchCustomerCreateForm, type, createMode, CreateForm]);

  useEffect(() => {
    if (type !== "CREATE" || !paymentTypeAutoSelectionNotice) {
      return;
    }

    const selectedPaymentType =
      paymentTypeAutoSelectionNotice === "deferred"
        ? PaymentType.DEFERRED
        : PaymentType.BANK_TRANSFER;

    if (watchPaymentTypeCreateForm !== selectedPaymentType) {
      setPaymentTypeAutoSelectionNotice(null);
    }
  }, [paymentTypeAutoSelectionNotice, type, watchPaymentTypeCreateForm]);

  useEffect(() => {
    // Reset form when order changes
    if (asDrawer && !open) return;

    if (type === "UPDATE" && order) {
      if (order.isFromStore && updateStoreDefaultValues)
        UpdateFormStore.reset(updateStoreDefaultValues);
      else if (updateDefaultValues) UpdateForm.reset(updateDefaultValues);
    } else if (type === "DUPLICATE" && order) {
      if (duplicateDefaultValues) DuplicateForm.reset(duplicateDefaultValues);
    } else if (type === "CREATE" && createDefaultValues) {
      CreateForm.reset(createDefaultValues);
    }
  }, [
    CreateForm,
    DuplicateForm,
    UpdateForm,
    UpdateFormStore,
    asDrawer,
    createDefaultValues,
    duplicateDefaultValues,
    open,
    order,
    type,
    updateDefaultValues,
    updateStoreDefaultValues,
  ]);

  const formData = useMemo(() => {
    if (type === "UPDATE") {
      return order?.isFromStore
        ? updateOrderFormStore(
            carriedOutByOptions,
            formT,
            printingMethodOptions,
            shippingMethodOptions,
            orderStatusOptions,
            fileStatusOptions,
          )
        : updateOrderForm(
            carriedOutByOptions,
            pickupAreaOptions,
            availablePaymentTypes,
            formT,
            printingMethodOptions,
            shippingMethodOptions,
            paymentMethodOptions,
            orderStatusOptions,
            fileStatusOptions,
          );
    }
    const createOrderFormData = orderForm(
      carriedOutByOptions,
      pickupAreaOptions,
      availablePaymentTypes,
      formT,
      printingMethodOptions,
      shippingMethodOptions,
      paymentMethodOptions,
      orderStatusOptions,
      fileStatusOptions,
    );

    if (type !== "CREATE") {
      return createOrderFormData;
    }

    if (createMode === "quick") {
      return createQuickOrderFormData(createOrderFormData, formT);
    }

    return expandAllSections(createOrderFormData);
  }, [
    type,
    createMode,
    order?.isFromStore,
    carriedOutByOptions,
    pickupAreaOptions,
    availablePaymentTypes,
    printingMethodOptions,
    shippingMethodOptions,
    paymentMethodOptions,
    orderStatusOptions,
    fileStatusOptions,
    formT,
  ]);

  const methods = useMemo(() => {
    if (type === "CREATE") return CreateForm;
    if (type === "UPDATE") {
      return order?.isFromStore ? UpdateFormStore : UpdateForm;
    }
    return DuplicateForm;
  }, [
    type,
    order?.isFromStore,
    CreateForm,
    UpdateForm,
    UpdateFormStore,
    DuplicateForm,
  ]);

  const renderOrderFormAfterField = useCallback<
    NonNullable<FormControllerProps["renderAfterField"]>
  >(
    ({ fieldData }) => {
      if (type !== "CREATE") {
        return null;
      }

      if (fieldData.name === "billing" && billingPrefillNoticeCustomerKey) {
        return (
          <Alert.Root status="info" mt={3} role="status" aria-live="polite">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>
                {t("toasts.invoice.prefilled", {
                  defaultValue: "Invoice address pre-filled",
                })}
              </Alert.Title>
              <Alert.Description>
                {t("toasts.invoice.prefilledDescription", {
                  defaultValue:
                    "Billing address has been pre-filled from customer data",
                })}
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        );
      }

      if (fieldData.name !== "paymentType" || !paymentTypeAutoSelectionNotice) {
        return null;
      }

      const titleKey =
        paymentTypeAutoSelectionNotice === "deferred"
          ? "toasts.paymentType.autoSelectedDeferred"
          : "toasts.paymentType.autoSelectedBankTransfer";
      const descriptionKey =
        paymentTypeAutoSelectionNotice === "deferred"
          ? "toasts.paymentType.autoSelectedDeferredDescription"
          : "toasts.paymentType.autoSelectedBankTransferDescription";
      const descriptionDefaultValue =
        paymentTypeAutoSelectionNotice === "deferred"
          ? "Payment type has been auto-selected to 'Order confirmation' due to the customer settings"
          : "Payment type has been auto-selected to 'Bank transfer' due to the customer settings";

      return (
        <Alert.Root status="info" mt={3} role="status" aria-live="polite">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {t(titleKey, { defaultValue: "Payment type auto-selected" })}
            </Alert.Title>
            <Alert.Description>
              {t(descriptionKey, { defaultValue: descriptionDefaultValue })}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      );
    },
    [billingPrefillNoticeCustomerKey, paymentTypeAutoSelectionNotice, t, type],
  );

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
    enabled:
      type === "UPDATE" &&
      !order?.isFromStore &&
      isNestedCustomer(watchCustomerUpdateForm),
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

  if (!channel) return null;

  if (type === "CREATE" && CreateForm.formState.disabled) return null;
  if (
    type === "UPDATE" &&
    (order?.isFromStore
      ? UpdateFormStore.formState.disabled
      : UpdateForm.formState.disabled)
  )
    return null;
  if (type === "DUPLICATE" && DuplicateForm.formState.disabled) return null;

  if (asDrawer)
    return (
      <>
        <Drawer
          header={label}
          size={"xl"}
          closeOnOverlayClick={false}
          open={open}
          setOpen={setOpen}
          restoreFocus={false}
          lazyMount
          unmountOnExit
        >
          {fakturowniaAlertNode}
          <FormController
            methods={methods}
            buttonLeftIcon={getIconByFormType(type)}
            buttonLabel={label}
            submitDisabled={createSubmissionLocked}
            submitLoading={createSubmissionLocked}
            submitLoadingLabel={createSubmitLoadingLabel}
            formData={formData}
            update={type === "UPDATE"}
            searchFn={{
              customers: searchCustomersInput,
            }}
            handleInvalid={(errors) =>
              handleInvalidOrderSubmit(errors, toaster, t)
            }
            handleSubmit={async (data) =>
              type === "CREATE" || type === "DUPLICATE"
                ? await handleSubmitCreateOrder(data)
                : !isUndefined(order)
                  ? order.isFromStore
                    ? await handleUpdateOrderStore(
                        order,
                        order.id,
                        data,
                        channel,
                        toaster,
                        t,
                        setOptimisticOrder,
                        tenantContext,
                        knownPrintingMethodIds,
                        productionGroupingSettings.profile,
                        Boolean(methods.formState.dirtyFields.paymentStatus),
                      )
                    : await handleUpdateOrder(
                        order,
                        order.id,
                        data,
                        channel,
                        toaster,
                        storeSettings,
                        t,
                        setOptimisticOrder,
                        tenantContext,
                        knownPrintingMethodIds,
                        productionGroupingSettings.profile,
                        Boolean(methods.formState.dirtyFields.paymentStatus),
                      )
                  : toaster.error({
                      title: t("error.somethingWrong", {
                        defaultValue: "Something went wrong",
                      }),
                      description: t("order.notFoundForEdit", {
                        defaultValue: "Order not found for editing",
                      }),
                      duration: 3000,
                    })
            }
            ProductGroupedIndexedSearch={ProductGroupedIndexedSearch}
            CombinationInput={CombinationInput}
            By={
              <By
                update={type === "UPDATE"}
                autoAddToCarriedOutBy={type === "CREATE"}
              />
            }
            ToChannel={type === "DUPLICATE" && <ToChannel />}
            warehouses={warehouses}
            GenerateOrderItems={GenerateOrderItems}
            orderProcessingQueue={processingQueue.current}
            renderAfterField={renderOrderFormAfterField}
            afterAddressSection={
              <AnonymousPackageShippingField t={t} compact />
            }
            t={t}
            i18n={i18n}
          />
          {fakturowniaAlertNode}
        </Drawer>
        {defaultComputerChannelDialog}
      </>
    );
  else
    return (
      <>
        {fakturowniaAlertNode}
        <FormController
          methods={methods}
          buttonLeftIcon={getIconByFormType(type)}
          buttonLabel={label}
          submitDisabled={createSubmissionLocked}
          submitLoading={createSubmissionLocked}
          submitLoadingLabel={createSubmitLoadingLabel}
          formData={formData}
          update={type === "UPDATE"}
          searchFn={{
            customers: searchCustomersInput,
          }}
          handleInvalid={(errors) =>
            handleInvalidOrderSubmit(errors, toaster, t)
          }
          handleSubmit={async (data) => {
            if (type === "CREATE" || type === "DUPLICATE") {
              await handleSubmitCreateOrder(data);
            } else if (!isUndefined(order)) {
              if (order.isFromStore) {
                await handleUpdateOrderStore(
                  order,
                  order.id,
                  data,
                  channel,
                  toaster,
                  t,
                  setOptimisticOrder,
                  tenantContext,
                  knownPrintingMethodIds,
                  productionGroupingSettings.profile,
                  Boolean(methods.formState.dirtyFields.paymentStatus),
                );
              } else {
                await handleUpdateOrder(
                  order,
                  order.id,
                  data,
                  channel,
                  toaster,
                  storeSettings,
                  t,
                  setOptimisticOrder,
                  tenantContext,
                  knownPrintingMethodIds,
                  productionGroupingSettings.profile,
                  Boolean(methods.formState.dirtyFields.paymentStatus),
                );
              }
            } else {
              toaster.error({
                title: t("error.somethingWrong", {
                  defaultValue: "Something went wrong",
                }),
                description: t("order.notFoundForEdit", {
                  defaultValue: "Order not found for editing",
                }),
                duration: 3000,
              });
            }
          }}
          ProductGroupedIndexedSearch={ProductGroupedIndexedSearch}
          CombinationInput={CombinationInput}
          By={
            <By
              update={type === "UPDATE"}
              autoAddToCarriedOutBy={type === "CREATE"}
            />
          }
          ToChannel={type === "DUPLICATE" && <ToChannel />}
          warehouses={warehouses}
          GenerateOrderItems={GenerateOrderItems}
          orderProcessingQueue={processingQueue.current}
          renderAfterField={renderOrderFormAfterField}
          afterAddressSection={<AnonymousPackageShippingField t={t} compact />}
          t={t}
          i18n={i18n}
        />
        {fakturowniaAlertNode}
        {defaultComputerChannelDialog}
      </>
    );
};

const OrderForm = (props: OrderFormProps) => {
  const { order, type } = props;

  if (type === "UPDATE" && order) {
    if (order.isFromStore) {
      return <StoreOrderUpdateForm {...props} order={order} type={"UPDATE"} />;
    }

    return <StandardOrderUpdateForm {...props} order={order} type={"UPDATE"} />;
  }

  return <FullOrderForm {...props} />;
};

export const initialValuesCreate = (
  orderItems?: FormattedOrderItem[],
  overrides?: Partial<CreateInput>,
) => {
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
      discount: 0,
    },
    contact: {
      name: "",
      email: "",
      phone: "",
      active: true,
    },
    externalSource: null,
    email: "",
    anonymousPackageShipping: false,
    anonymousPackageLabelAddress: createEmptyAnonymousPackageLabelAddress(),
    shippingOption: ShippingOptions.PERSONAL_COLLECTION,
    shipping: null,
    invoice: false,
    billing: null,
    exactTime: false,
    deadlineString: getLocalDateInputValue(),
    specialNotes: "",
    invoiceNotes: "",
    items: (orderItems as unknown as OrderItem[]) ?? [orderItemInitialValues],
    difficulty: 5,
    priority: 2,
    status: OrderStatus.NEW,
    paymentType: PaymentType.ON_PICKUP,
    paymentStatus: PaymentStatus.NEW,
    filesStatus: OrderFilesStatus.FILES_ARE_READY,
    paymentDocumentId: "",
    createdBy: {
      id: "",
      name: "",
    },
    isTest: false,
    appliedPromotionCodes: [],
    printingMethods: [],
    designatedPickupAreaId: "",
    carriedOutBy: [],
    saveCustomer: false,
    saveContact: false,
    sendStatusChangeEmail: false,
    saveShippingAddress: false,
    saveBillingAddress: false,
    mailLink: "",
    active: true,
  };
  return {
    ...values,
    ...overrides,
  };
};

export const handleCreateOrder = async (
  data: CreateInput,
  channel: Channel,
  toaster: CreateToasterReturn,
  storeSettings: Settings | null,
  navigateAfterCreate: (href: Route, options?: NavigateOptions) => void,
  t: TFunction,
  lng: Locale,
  onFakturowniaAlert?: (alert: FakturowniaAlert) => void,
  onCreateSuccess?: (payload: {
    channelId: string;
    orderId: string;
  }) => Promise<void> | void,
  tenantContext?: TenantContext,
  knownPrintingMethodIds?: NonNullable<Order["printingMethods"]>,
  productionGroupingProfile?: ProductionGroupingProfile,
  options: HandleCreateOrderOptions = {},
) => {
  try {
    if (isNull(storeSettings)) {
      toaster.error({
        title: t("error.somethingWrong", {
          defaultValue: "Something went wrong",
        }),
        description: t("settings.storeUndefined", {
          defaultValue:
            "Store settings are undefined, you can edit them in Configuration > Store Settings",
        }),
      });
      return;
    }
    if (isUndefined(data.shippingOption) || isNull(data.shippingOption)) {
      toaster.error({
        title: t("error.somethingWrong", {
          defaultValue: "Something went wrong",
        }),
        description: t("order.shippingOptionRequired", {
          defaultValue: "Shipping option is required to create an order.",
        }),
      });
      return;
    }

    const canCreateWithoutShippingDestination =
      options.createMode === "quick" &&
      data.shippingOption === ShippingOptions.PERSONAL_COLLECTION;

    if (
      !canCreateWithoutShippingDestination &&
      !hasShippingDestination(data.shipping)
    ) {
      showShippingDestinationRequiredError(toaster, t);
      return;
    }

    if (
      data.anonymousPackageShipping &&
      !isAnonymousPackageShippingAllowedFor(data.shipping?.country)
    ) {
      toaster.error({
        title: t("error.somethingWrong", {
          defaultValue: "Something went wrong",
        }),
        description: t(
          "forms.anonymousPackageShipping.internationalUnavailable",
          {
            defaultValue:
              "Anonymous package shipping is not available for international shipping.",
          },
        ),
      });
      return;
    }

    if (channel.id === process.env.NEXT_PUBLIC_STORE_CHANNEL_ID) {
      toaster.error({
        title: t("error.permissionDenied", {
          defaultValue: "Permission denied",
        }),
        description: t("error.cannotCreateOrderStoreChannel", {
          defaultValue: "Cannot create order on store channel",
        }),
      });
      return;
    }

    const fakturowniaCheckEnabled = process.env.NODE_ENV === "development";
    const _channelId = !isUndefined(data?.toChannel?.id)
      ? data?.toChannel?.id
      : channel.id;

    const externalOrderId = data.externalSource?.externalOrderId?.trim();
    if (data.externalSource?.provider === "ALLEGRO" && externalOrderId) {
      const existingOrderResult = await get<Order>(
        db.query<Order>(
          firestore,
          `/channels/${_channelId}/orders`,
          1,
          undefined,
          [where("externalSource.externalOrderId", "==", externalOrderId)],
        ),
      );
      const existingOrder = existingOrderResult?.[0]?.[0];

      if (existingOrder?.id) {
        toaster.warning({
          title: t("allegro.importDuplicateTitle", {
            defaultValue: "Order already imported",
          }),
          description: t("allegro.importDuplicateDescription", {
            defaultValue:
              "This Allegro order already exists in Konfi. Opening the existing order.",
          }),
        });
        navigateAfterCreate(
          getAdminOrderDetailsHref(lng, existingOrder.id, _channelId) as Route,
        );
        return;
      }
    }

    const existingCustomerId = isNestedCustomer(data.customer)
      ? data.customer.id?.trim()
      : undefined;
    if (existingCustomerId && fakturowniaCheckEnabled) {
      try {
        const automation = await getCustomerInvoiceAutomation(
          firestore,
          existingCustomerId,
        );
        const fakturowniaClientId =
          automation?.fakturowniaClientId?.trim() ?? "";
        if (fakturowniaClientId) {
          try {
            const { getOverdueInvoicesForClient } =
              await import("@/actions/fakturownia");
            const overdueCheck =
              await getOverdueInvoicesForClient(fakturowniaClientId);
            if (overdueCheck.hasOverdueInvoices) {
              const alertPayload = {
                type: "error" as const,
                title: t("order.fakturowniaUnpaid.title", {
                  defaultValue: "Overdue invoices detected",
                }),
                description: t("order.fakturowniaUnpaid.description", {
                  defaultValue:
                    "This customer has overdue invoices in Fakturownia.",
                }),
              };
              if (onFakturowniaAlert) {
                onFakturowniaAlert(alertPayload);
              } else {
                toaster.error({
                  title: alertPayload.title,
                  description: alertPayload.description,
                  duration: 8000,
                });
              }
              return;
            }
          } catch (checkError) {
            console.error(
              "[OrderForm] Failed to check Fakturownia invoices",
              checkError,
            );
            const warningPayload = {
              type: "warning" as const,
              title: t("order.fakturowniaUnpaidCheckFailed.title", {
                defaultValue: "Invoice verification failed",
              }),
              description: t("order.fakturowniaUnpaidCheckFailed.description", {
                defaultValue:
                  "We couldn't verify Fakturownia invoice status. The order wasn't blocked, but please verify manually.",
              }),
            };
            if (onFakturowniaAlert) {
              onFakturowniaAlert(warningPayload);
            } else {
              toaster.warning({
                title: warningPayload.title,
                description: warningPayload.description,
                duration: 8000,
              });
            }
          }
        }
      } catch (automationError) {
        console.error(
          "[OrderForm] Failed to load customer invoice automation",
          automationError,
        );
      }
    }

    const shippingPrice = isShippingFree(
      getSubtotalPrice(data.items),
      storeSettings.freeShipping.enabled,
      storeSettings.freeShipping.min,
    )
      ? 0
      : storeSettings.shippingOptionsPrices[data.shippingOption];
    const printingMethods = data.printingMethods ?? [];

    const totalPrice: number = getTotalPrice(data.items, shippingPrice);
    const timestampNow = Timestamp.now();
    const orderCurrency =
      !isUndefined(data?.toChannel) && !isUndefined(data?.toChannel.currency)
        ? data.toChannel.currency
        : channel.currency;
    const taxSummary = await buildAdminOrderTaxSummary({
      channelId: _channelId,
      country: data.billing?.country ?? data.shipping?.country,
      currency: orderCurrency,
      items: data.items,
      shippingGrossAmount: shippingPrice,
    });
    const order: OrderCreate = {
      id: "",
      name: "",
      number: 0,
      contact: data.contact,
      email: data.email,
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
              discount: data.customer.discount ?? 0,
            }
          : data.customer,
      externalSource: data.externalSource
        ? {
            ...data.externalSource,
            importedAt: data.externalSource.importedAt ?? timestampNow,
            lastSyncedAt: data.externalSource.lastSyncedAt ?? timestampNow,
          }
        : null,
      anonymousPackageShipping: data.anonymousPackageShipping ?? false,
      anonymousPackageLabelAddress: data.anonymousPackageShipping
        ? normalizeAnonymousPackageLabelAddress(
            data.anonymousPackageLabelAddress,
          )
        : null,
      shippingOption: data.shippingOption ?? null,
      shippingPrice: shippingPrice,
      shippingPriceDiscount: new Discount().object,
      shipping: data.shipping ?? null,
      invoice: data.invoice ?? false,
      billing:
        data.invoice && data.billing
          ? normalizeInvoiceRecipientAddress(data.billing)
          : null,
      exactTime: data.exactTime,
      deadlineString: data.deadlineString,
      deadline: Timestamp.fromDate(
        parseOrderDeadlineString(data.deadlineString),
      ),
      totalPrice: totalPrice,
      totalPriceDiscount: new Discount().object,
      specialNotes: data.specialNotes ?? "",
      invoiceNotes: data.invoiceNotes ?? "",
      items: data.items.map((item: OrderItem) => {
        const id = item.product?.id;
        const name = item.product?.name;

        if (!id || !name) {
          throw new Error(
            `Order item "${item.id}" is missing required product identity (id: "${id ?? ""}", name: "${name ?? ""}"). Correct the order before resubmitting.`,
          );
        }

        return {
          ...item,
          product: {
            id,
            name,
            channelId: item.product?.channelId ?? "",
            spec: {
              images: item.product?.spec?.images ?? [],
            },
          },
        };
      }),
      currency: orderCurrency,
      currencySnapshot: {
        fromCurrencyCode: orderCurrency,
        toCurrencyCode: orderCurrency,
        amountMinor: totalPrice,
        convertedAmountMinor: totalPrice,
        rate: 1,
        rateSource: "default",
        capturedAt: timestampNow,
      },
      ...(taxSummary ? { taxSummary } : {}),
      difficulty: data.difficulty ?? initialValuesCreate().difficulty,
      priority: data.priority ?? initialValuesCreate().priority,
      status: data.status,
      paymentType: data.paymentType,
      paymentStatus: data.paymentStatus,
      filesStatus: data.filesStatus,
      paymentDocumentId: data.paymentDocumentId,
      messages: [],
      fulfilledItems: [],
      inProgressItems: [],
      priorityItems: [],
      activities: [
        {
          type: "ORDER_STATUS_UPDATE",
          value: data.status,
          timestamp: timestampNow,
        },
        {
          type: "PAYMENT_STATUS_UPDATE",
          value: data.paymentStatus,
          timestamp: timestampNow,
        },
      ],
      createdBy: {
        id: data.createdBy.id,
        name: data.createdBy.name,
      },
      createdAt: timestampNow,
      updatedBy: {
        id: data.createdBy.id,
        name: data.createdBy.name,
      },
      updatedAt: timestampNow,
      keywords: generateKeywords(
        typeof data.customer === "object" ? data.customer.name : data.customer,
      ),
      active: true,
      isFromStore: false,
      isTest: data.isTest ?? false,
      channelId: data?.toChannel?.id ?? channel.id,
      appliedPromotionCodes: data.appliedPromotionCodes ?? [],
      printingMethods,
      designatedPickupAreaId: data.designatedPickupAreaId ?? "",
      mailLink: formatMailLink(data.mailLink ?? ""),
      sendStatusChangeEmail: data.sendStatusChangeEmail ?? false,
      carriedOutBy: data.carriedOutBy,
    };

    if (order.externalSource?.externalOrderId) {
      order.keywords.push(order.externalSource.externalOrderId.toLowerCase());
    }

    if (order.externalSource?.externalBuyerLogin) {
      order.keywords.push(
        order.externalSource.externalBuyerLogin.toLowerCase(),
      );
    }

    if (
      isNestedCustomer(data.customer) &&
      data.customer.b2b &&
      !isEmpty(data.customer.linkedProductsIds)
    ) {
      if (isNestedCustomer(order.customer)) {
        order.customer.b2b = data.customer.b2b;
        order.customer.linkedProductsIds = data.customer.linkedProductsIds;
      }
    }

    if (process.env.NODE_ENV === "development") {
      console.log("order", order);
      try {
        // Simulate async action (previously used toaster.promise). If this ever throws, outer catch will handle.
        await new Promise((resolve) => setTimeout(resolve, 1000));
        toaster.success({
          title: t("order.createdDev", {
            defaultValue: "Order created without saving (DEV)",
          }),
          description: t("order.createdDevDescription", {
            defaultValue: "Successfully created new order",
          }),
        });
        navigateAfterCreate(`/${lng}/orders` as Route);
        return;
      } catch (e) {
        toaster.error({
          title: t("error.somethingWrong", {
            defaultValue: "Something went wrong",
          }),
          description: t("error.order_save", {
            defaultValue: "Failed to save order",
          }),
        });
        return;
      }
    }

    // Create order directly and show explicit success/error toasts
    await assertSaasRuntimeQuotaAction({
      operation: "admin.order.create",
      resource: "ordersPerMonth",
    });

    if (data.saveCustomer && !isNestedCustomer(data.customer)) {
      await assertSaasRuntimeQuotaAction({
        operation: "admin.order.customer.create",
        resource: "customers",
      });
    }

    if ((data.printingMethods ?? []).length > 0) {
      await assertSaasRuntimeModuleAction({
        module: "printingMethods",
        operation: "admin.order.printing-methods.create",
      });
    }

    const id = await create(
      firestore,
      order,
      undefined,
      db.collection(firestore, "/channels/" + _channelId + "/orders"),
      db.collection(firestore, "/channels/" + _channelId + "/orders"),
      true,
      undefined,
      undefined,
      undefined,
      tenantContext,
    );

    if (!id) {
      toaster.error({
        title: t("error.somethingWrong", {
          defaultValue: "Something went wrong",
        }),
        description: t("order.notCreated", {
          defaultValue: "Order was not created",
        }),
      });
      return;
    }

    if (order.paymentType === PaymentType.STRIPE) {
      try {
        await createAdminStripePaymentLink({
          channelId: _channelId,
          orderId: id,
          updatedBy: order.createdBy,
        });
      } catch (error) {
        console.error("Failed to create Stripe payment link:", error);
        toaster.warning({
          title: t("orderPage.payment.linkCreateError", {
            defaultValue: "Failed to create Stripe payment link",
          }),
          description:
            error instanceof Error
              ? error.message
              : t("orders.unknownError", {
                  defaultValue: "Unknown error",
                }),
        });
      }
    }

    toaster.success({
      title: t("toasts.order.created", { defaultValue: "Order created" }),
      description: t("toasts.order.createdDescription", {
        defaultValue: "Successfully created new order",
      }),
    });

    void recordSaasRuntimeQuotaUsageAction({
      operation: "admin.order.create",
      resource: "ordersPerMonth",
    }).catch((error: unknown) => {
      console.error("Failed to record order quota usage", error);
    });

    void processAdminOrderCreatedStock({
      channelId: _channelId,
      orderId: id,
    })
      .then((stockReservation) => {
        if (!stockReservation.ok) {
          console.info("Order stock reservation skipped or failed", {
            orderId: id,
            result: stockReservation,
          });
        }
      })
      .catch((error: unknown) => {
        console.info("Order stock reservation skipped or failed", {
          error,
          orderId: id,
        });
      });

    if (onCreateSuccess) {
      void Promise.resolve(
        onCreateSuccess({ channelId: _channelId, orderId: id }),
      ).catch((error: unknown) => {
        console.error("Order post-create success handler failed", error);
      });
    }

    void notifyOrderCreated({
      channelId: _channelId,
      orderId: id,
    }).catch((error: unknown) => {
      console.error(
        "Failed to process fulfillment requests for new order",
        error,
      );
    });

    void classifyAndPersistOrderPrintingMethodsAdmin({
      channelId: _channelId,
      orderId: id,
      items: toSerializableOrderPrintingMethodItems(
        data.items,
        knownPrintingMethodIds,
      ),
      currentPrintingMethods: data.printingMethods ?? [],
    }).catch((error: unknown) => {
      console.error("Failed to classify printing methods for new order", error);
    });

    void classifyAndPersistProductionGroupingsAdmin({
      channelId: _channelId,
      items: toSerializableProductionGroupingItems(data.items),
      orderId: id,
      profile: productionGroupingProfile,
    }).catch((error: unknown) => {
      console.error(
        "Failed to classify production groupings for new order",
        error,
      );
    });

    const saveOperations: Promise<void>[] = [];
    const existingCustomerIdForRelatedData = isNestedCustomer(data.customer)
      ? data.customer.id
      : null;
    const customerNameForRelatedData = isNestedCustomer(data.customer)
      ? data.customer.name
      : data.customer;

    if (data.saveCustomer && !isNestedCustomer(data.customer)) {
      const shippingAddress =
        data.saveShippingAddress && data.shipping ? data.shipping : null;
      const billingAddress =
        data.saveBillingAddress && data.billing
          ? normalizeInvoiceRecipientAddress(data.billing)
          : null;

      saveOperations.push(
        createCustomer(
          data.customer,
          generateKeywords(data.customer),
          { id: data.createdBy.id, name: data.createdBy.name },
          data.saveContact ? data.contact : undefined,
          shippingAddress,
          billingAddress,
          tenantContext,
        )
          .then(async (createdCustomerId) => {
            if (!createdCustomerId) {
              throw new Error("Customer id was not returned after create.");
            }

            await recordSaasRuntimeQuotaUsageAction({
              operation: "admin.order.customer.create",
              resource: "customers",
            });
            toaster.success({
              title: t("customer.saved", { defaultValue: "Customer saved" }),
              description: t("customer.savedDescription", {
                defaultValue: "Customer was successfully saved",
              }),
            });
          })
          .catch((error) => {
            console.error(error);
            toaster.error({
              title: t("customer.notSavedError", {
                defaultValue: "Customer was not saved, error code: {error}",
                values: { error },
              }),
            });
          }),
      );
    }

    if (data.saveContact && existingCustomerIdForRelatedData) {
      saveOperations.push(
        createContact(existingCustomerIdForRelatedData, data.contact)
          .then(() => {
            toaster.success({
              title: t("contact.saved", { defaultValue: "Contact saved" }),
              description: t("contact.savedDescription", {
                defaultValue: "Contact was successfully saved",
              }),
            });
          })
          .catch((error) => {
            console.error(error);
            toaster.error({
              title: t("contact.notSavedError", {
                defaultValue: "Contact was not saved, error code: {error}",
                values: { error },
              }),
            });
          }),
      );
    } else if (
      data.saveContact &&
      !data.saveCustomer &&
      !existingCustomerIdForRelatedData
    ) {
      toaster.error({
        title: t("contact.notSavedNotCustomer", {
          defaultValue: "Contact was not saved, user is not a customer",
        }),
      });
    }

    if (
      data.saveShippingAddress &&
      existingCustomerIdForRelatedData &&
      data.shipping
    ) {
      const address = { ...data.shipping } as Address;
      if (!address.name) address.name = customerNameForRelatedData;

      saveOperations.push(
        createAddress(existingCustomerIdForRelatedData, address)
          .then(() => {
            toaster.success({
              title: t("shipping_address.saved", {
                defaultValue: "Shipping address saved",
              }),
              description: t("shipping_address.savedDescription", {
                defaultValue: "Shipping address was successfully saved",
              }),
            });
          })
          .catch((error) => {
            console.error(error);
            toaster.error({
              title: t("shipping_address.notSavedError", {
                defaultValue:
                  "Shipping address was not saved, error code: {error}",
                values: { error },
              }),
            });
          }),
      );
    } else if (
      data.saveShippingAddress &&
      !data.saveCustomer &&
      !existingCustomerIdForRelatedData
    ) {
      toaster.error({
        title: t("shipping_address.notSavedNotCustomer", {
          defaultValue:
            "Shipping address was not saved, user is not a customer",
        }),
      });
    }

    if (
      data.saveBillingAddress &&
      existingCustomerIdForRelatedData &&
      data.billing
    ) {
      const address = normalizeInvoiceRecipientAddress({
        ...data.billing,
      } as Address);
      if (!address.name) address.name = customerNameForRelatedData;

      saveOperations.push(
        createAddress(existingCustomerIdForRelatedData, address)
          .then(() => {
            toaster.success({
              title: t("billing_address.saved", {
                defaultValue: "Billing address saved",
              }),
              description: t("billing_address.savedDescription", {
                defaultValue: "Billing address was successfully saved",
              }),
            });
          })
          .catch((error) => {
            console.error(error);
            toaster.error({
              title: t("billing_address.notSavedError", {
                defaultValue:
                  "Billing address was not saved, error code: {error}",
                values: { error },
              }),
            });
          }),
      );
    } else if (
      data.saveBillingAddress &&
      !data.saveCustomer &&
      !existingCustomerIdForRelatedData
    ) {
      toaster.error({
        title: t("billing_address.notSavedNotCustomer", {
          defaultValue: "Billing address was not saved, user is not a customer",
        }),
      });
    }

    if (saveOperations.length > 0) {
      await Promise.all(saveOperations).catch((error) => {
        console.error("Error in save operations:", error);
      });
    }

    navigateAfterCreate(getAdminOrderDetailsHref(lng, id, _channelId) as Route);
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("error.somethingWrong", {
        defaultValue: "Something went wrong",
      }),
      description: t("order.notCreatedError", {
        defaultValue: "Order was not created, error code: {error}",
        values: { error },
      }),
    });
  }
};

export const initialValuesUpdate = (order?: Order) => {
  if (isUndefined(order)) {
    throw new Error("Order was not provided to initialValuesUpdate.");
  }

  const values: UpdateInput = {
    customer: order.customer ?? "",
    contact: order.contact ?? {
      name: "",
      email: "",
      phone: "",
      active: true,
    },
    email: order.email ?? "",
    anonymousPackageShipping: order.anonymousPackageShipping ?? false,
    anonymousPackageLabelAddress:
      order.anonymousPackageLabelAddress ??
      createEmptyAnonymousPackageLabelAddress(),
    shippingOption: order.shippingOption ?? ShippingOptions.PERSONAL_COLLECTION,
    shipping: order.shipping ?? null,
    invoice: order.invoice ?? false,
    billing: order.billing
      ? normalizeOrderFormAddress(order.billing, AddressTypeEnum.BILLING)
      : null,
    exactTime: order.exactTime ?? false,
    deadlineString: order.deadlineString ?? "",
    specialNotes: order.specialNotes ?? "",
    invoiceNotes: order.invoiceNotes ?? "",
    items: order.items ?? [orderItemInitialValues],
    difficulty: order.difficulty ?? 5,
    priority: order.priority ?? 2,
    status: order.status ?? OrderStatus.NEW,
    paymentType: order.paymentType ?? PaymentType.PROFORMA,
    paymentStatus: order.paymentStatus ?? PaymentStatus.NEW,
    filesStatus: order.filesStatus ?? OrderFilesStatus.FILES_ARE_READY,
    paymentDocumentId: order.paymentDocumentId ?? "",
    updatedBy: createEmptyNestedMember(),
    isTest: order.isTest ?? false,
    appliedPromotionCodes: [],
    printingMethods: order.printingMethods ?? [],
    carriedOutBy: order.carriedOutBy ?? [],
    designatedPickupAreaId: order.designatedPickupAreaId ?? "",
    saveCustomer: false,
    saveContact: false,
    sendStatusChangeEmail: order.sendStatusChangeEmail ?? false,
    saveShippingAddress: false,
    saveBillingAddress: false,
    mailLink: order.mailLink ?? "",
    active: order.active ?? true,
  };
  return values;
};

const handleUpdateOrder = async (
  _order: Order,
  orderId: Order["id"],
  data: UpdateInput,
  channel: Channel,
  toaster: CreateToasterReturn,
  storeSettings: Settings | null,
  t: (
    key: string,
    options?: { defaultValue?: string; values?: Record<string, unknown> },
  ) => string,
  setOptimisticOrder?: (action: Partial<Order>) => void,
  tenantContext?: TenantContext,
  knownPrintingMethodIds?: NonNullable<Order["printingMethods"]>,
  productionGroupingProfile?: ProductionGroupingProfile,
  paymentStatusDirty = false,
) => {
  try {
    if (!hasShippingDestination(data.shipping)) {
      showShippingDestinationRequiredError(toaster, t);
      return;
    }

    if (
      data.anonymousPackageShipping &&
      !isAnonymousPackageShippingAllowedFor(data.shipping?.country)
    ) {
      toaster.error({
        title: t("error.somethingWrong", {
          defaultValue: "Something went wrong",
        }),
        description: t(
          "forms.anonymousPackageShipping.internationalUnavailable",
          {
            defaultValue:
              "Anonymous package shipping is not available for international shipping.",
          },
        ),
      });
      return;
    }

    const printingMethods = data.printingMethods ?? [];
    const order = createAdminOrderUpdatePayload(
      {
        customer: data.customer,
        contact: data.contact,
        email: data.email ?? "",
        anonymousPackageShipping: data.anonymousPackageShipping ?? false,
        anonymousPackageLabelAddress: data.anonymousPackageShipping
          ? normalizeAnonymousPackageLabelAddress(
              data.anonymousPackageLabelAddress,
            )
          : null,
        invoice: data.invoice,
        items: data.items,
        shippingOption:
          data.shippingOption ?? ShippingOptions.PERSONAL_COLLECTION,
        shipping: data.shipping,
        designatedPickupAreaId: data.designatedPickupAreaId ?? "",
        billing: data.billing,
        exactTime: data.exactTime,
        deadlineString: data.deadlineString,
        specialNotes: data.specialNotes,
        invoiceNotes: data.invoiceNotes ?? "",
        status: data.status,
        paymentType: data.paymentType,
        paymentStatus: data.paymentStatus,
        filesStatus: data.filesStatus,
        difficulty: data.difficulty,
        priority: data.priority,
        updatedBy: data.updatedBy,
        isTest: data.isTest,
        appliedPromotionCodes: data.appliedPromotionCodes,
        paymentDocumentId: data.paymentDocumentId ?? "",
        printingMethods,
        carriedOutBy: data.carriedOutBy,
        mailLink: data.mailLink,
        sendStatusChangeEmail: data.sendStatusChangeEmail ?? false,
        active: data.active ?? true,
      },
      storeSettings,
    );
    delete (order as Partial<Order>).paymentStatus;
    const taxSummary = await buildAdminOrderTaxSummary({
      channelId: channel.id,
      country: data.billing?.country ?? data.shipping?.country,
      currency: _order.currency,
      items: data.items,
      shippingGrossAmount: order.shippingPrice,
    });

    if (taxSummary) {
      order.taxSummary = taxSummary;
    }

    if (process.env.NODE_ENV === "development") {
      console.log("order", order);
      toaster.success({
        title: t("order.updatedDev", {
          defaultValue: "Order updated without saving (DEV)",
        }),
        description: t("order.updatedDevDescription", {
          defaultValue: "Successfully updated order",
        }),
      });
      return;
    }

    if (setOptimisticOrder) {
      startTransition(() => {
        setOptimisticOrder(
          (paymentStatusDirty
            ? { ...order, paymentStatus: data.paymentStatus }
            : order) as unknown as Order,
        );
      });
    }

    await persistAdminOrderUpdate(channel.id, orderId, order, tenantContext);
    if (paymentStatusDirty) {
      await updateOrderStatusField({
        channelId: channel.id,
        field: "paymentStatus",
        orderId,
        source: "admin-order-form",
        updatedBy: data.updatedBy,
        value: data.paymentStatus,
      });
    }

    void classifyAndPersistOrderPrintingMethodsAdmin({
      channelId: channel.id,
      orderId,
      items: toSerializableOrderPrintingMethodItems(
        data.items,
        knownPrintingMethodIds,
      ),
      currentPrintingMethods: data.printingMethods ?? [],
    }).catch((error: unknown) => {
      console.error(
        "Failed to classify printing methods for updated order",
        error,
      );
    });

    void classifyAndPersistProductionGroupingsAdmin({
      channelId: channel.id,
      items: toSerializableProductionGroupingItems(data.items),
      orderId,
      profile: productionGroupingProfile,
    }).catch((error: unknown) => {
      console.error(
        "Failed to classify production groupings for updated order",
        error,
      );
    });

    toaster.success({
      title: t("order.updated", { defaultValue: "Order updated" }),
      description: t("order.updatedDescription", {
        defaultValue: "Successfully updated order",
      }),
    });
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("error.somethingWrong", {
        defaultValue: "Something went wrong",
      }),
      description: t("order.notUpdatedError", {
        defaultValue: "Order was not updated, error code: {error}",
        values: { error },
      }),
    });
    if (setOptimisticOrder) {
      startTransition(() => {
        setOptimisticOrder(_order);
      });
    }
  }
};

export const initialValuesUpdateStore = (order?: Order) => {
  if (isUndefined(order)) {
    throw new Error("Order was not provided to initialValuesUpdateStore.");
  }

  const values: UpdateInputStore = {
    anonymousPackageShipping: order.anonymousPackageShipping ?? false,
    anonymousPackageLabelAddress:
      order.anonymousPackageLabelAddress ??
      createEmptyAnonymousPackageLabelAddress(),
    shippingOption: order.shippingOption ?? ShippingOptions.PERSONAL_COLLECTION,
    shipping: order.shipping ?? null,
    deadlineString: order.deadlineString,
    specialNotes: order.specialNotes,
    invoiceNotes: order.invoiceNotes ?? "",
    priority: order.priority,
    status: order.status,
    paymentStatus: order.paymentStatus,
    filesStatus: order.filesStatus ?? OrderFilesStatus.FILES_ARE_READY,
    paymentDocumentId: order.paymentDocumentId,
    updatedBy: createEmptyNestedMember(),
    printingMethods: order.printingMethods ?? [],
    carriedOutBy: order.carriedOutBy ?? [],
    mailLink: order.mailLink ?? "",
    active: order.active ?? true,
  };
  return values;
};

const handleUpdateOrderStore = async (
  _order: Order,
  orderId: Order["id"],
  data: UpdateInputStore,
  channel: Channel,
  toaster: CreateToasterReturn,
  t: (
    key: string,
    options?: { defaultValue?: string; values?: Record<string, unknown> },
  ) => string,
  setOptimisticOrder?: (action: Partial<Order>) => void,
  tenantContext?: TenantContext,
  knownPrintingMethodIds?: NonNullable<Order["printingMethods"]>,
  productionGroupingProfile?: ProductionGroupingProfile,
  paymentStatusDirty = false,
) => {
  try {
    if (!hasShippingDestination(data.shipping)) {
      showShippingDestinationRequiredError(toaster, t);
      return;
    }

    if (
      data.anonymousPackageShipping &&
      !isAnonymousPackageShippingAllowedFor(data.shipping?.country)
    ) {
      toaster.error({
        title: t("error.somethingWrong", {
          defaultValue: "Something went wrong",
        }),
        description: t(
          "forms.anonymousPackageShipping.internationalUnavailable",
          {
            defaultValue:
              "Anonymous package shipping is not available for international shipping.",
          },
        ),
      });
      return;
    }

    const printingMethods = data.printingMethods ?? [];
    const timestampNow = Timestamp.now();
    const order: Omit<OrderUpdateStore, "paymentStatus"> &
      Partial<Pick<OrderUpdateStore, "paymentStatus">> = {
      anonymousPackageShipping: data.anonymousPackageShipping ?? false,
      anonymousPackageLabelAddress: data.anonymousPackageShipping
        ? normalizeAnonymousPackageLabelAddress(
            data.anonymousPackageLabelAddress,
          )
        : null,
      shippingOption: data.shippingOption,
      shipping: data.shipping,
      priority: data.priority,
      status: data.status,
      filesStatus: data.filesStatus,
      paymentDocumentId: data.paymentDocumentId,
      deadlineString: data.deadlineString,
      specialNotes: data.specialNotes,
      invoiceNotes: data.invoiceNotes,
      messages: [],
      updatedBy: data.updatedBy,
      updatedAt: timestampNow,
      printingMethods,
      carriedOutBy: data.carriedOutBy,
      mailLink: formatMailLink(data.mailLink ?? ""),
      active: data.active ?? true,
    };
    const optimisticOrder = paymentStatusDirty
      ? { ...order, paymentStatus: data.paymentStatus }
      : order;

    if (process.env.NODE_ENV === "development") {
      console.log("order", order);
      toaster.success({
        title: t("order.updatedDev", {
          defaultValue: "Order updated without saving (DEV)",
        }),
        description: t("order.updatedDevDescription", {
          defaultValue: "Successfully updated order",
        }),
      });
      return;
    }

    if (setOptimisticOrder) {
      startTransition(() => {
        setOptimisticOrder(optimisticOrder);
      });
    }

    await update(
      order,
      db.doc(firestore, "/channels/" + channel.id + "/orders", orderId),
      tenantContext,
    );
    if (paymentStatusDirty) {
      await updateOrderStatusField({
        channelId: channel.id,
        field: "paymentStatus",
        orderId,
        source: "admin-store-order-form",
        updatedBy: data.updatedBy,
        value: data.paymentStatus,
      });
    }

    void classifyAndPersistOrderPrintingMethodsAdmin({
      channelId: channel.id,
      orderId,
      items: toSerializableOrderPrintingMethodItems(
        _order.items,
        knownPrintingMethodIds,
      ),
      currentPrintingMethods: data.printingMethods ?? [],
    }).catch((error: unknown) => {
      console.error(
        "Failed to classify printing methods for updated order",
        error,
      );
    });

    void classifyAndPersistProductionGroupingsAdmin({
      channelId: channel.id,
      items: toSerializableProductionGroupingItems(_order.items),
      orderId,
      profile: productionGroupingProfile,
    }).catch((error: unknown) => {
      console.error(
        "Failed to classify production groupings for updated order",
        error,
      );
    });

    toaster.success({
      title: t("toasts.order.updated", { defaultValue: "Order updated" }),
      description: t("toasts.order.updatedDescription", {
        defaultValue: "Successfully updated order",
      }),
    });
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("error.somethingWrong", {
        defaultValue: "Something went wrong",
      }),
      description: t("toasts.order.notUpdated", {
        defaultValue: "Order was not updated",
      }),
    });
    if (setOptimisticOrder) {
      startTransition(() => {
        setOptimisticOrder(_order);
      });
    }
  }
};

export const initialValuesDuplicate = (
  order?: Order,
  overrides?: Partial<CreateInput>,
) => {
  if (isUndefined(order)) {
    throw new Error("Order was not provided to initialValuesDuplicate.");
  }

  const values: CreateInput = {
    customer: order.customer,
    contact: order.contact ?? {
      name: "",
      email: "",
      phone: "",
      active: true,
    },
    externalSource: null,
    email: order.email,
    anonymousPackageShipping: order.anonymousPackageShipping ?? false,
    anonymousPackageLabelAddress:
      order.anonymousPackageLabelAddress ??
      createEmptyAnonymousPackageLabelAddress(),
    shippingOption: order.shippingOption,
    shipping: order.shipping,
    invoice: order.invoice,
    billing: order.billing
      ? normalizeOrderFormAddress(order.billing, AddressTypeEnum.BILLING)
      : order.invoice
        ? createEmptyBillingAddress()
        : null,
    exactTime: order.exactTime ?? false,
    deadlineString: order.deadlineString,
    specialNotes: order.specialNotes,
    invoiceNotes: order.invoiceNotes ?? "",
    items: order.items,
    difficulty: order.difficulty,
    priority: order.priority,
    status: OrderStatus.NEW,
    paymentType: order.paymentType,
    paymentStatus: PaymentStatus.NEW,
    filesStatus: order.filesStatus,
    createdBy: createEmptyNestedMember(),
    isTest: false,
    appliedPromotionCodes: order.appliedPromotionCodes,
    printingMethods: order.printingMethods ?? [],
    carriedOutBy: order.carriedOutBy ?? [],
    saveCustomer: false,
    saveContact: false,
    sendStatusChangeEmail: order.sendStatusChangeEmail ?? false,
    saveShippingAddress: false,
    saveBillingAddress: false,
    mailLink: "",
    active: true,
  };
  return {
    ...values,
    ...overrides,
  };
};

export const initialValuesCreateFromQuote = (quote?: Quote) => {
  if (isUndefined(quote)) {
    throw new Error("Quote was not provided to initialValuesCreateFromQuote.");
  }

  const values: CreateInput = {
    customer: quote.customer ?? "",
    contact: quote.contact ?? {
      name: "",
      email: "",
      phone: "",
      active: true,
    },
    externalSource: null,
    email: quote.contact?.email ?? "",
    anonymousPackageShipping: false,
    anonymousPackageLabelAddress: createEmptyAnonymousPackageLabelAddress(),
    shippingOption: quote.shippingOption ?? ShippingOptions.PERSONAL_COLLECTION,
    shipping: null,
    invoice: false,
    billing: createEmptyBillingAddress(),
    exactTime: false,
    deadlineString: getLocalDateInputValue(),
    specialNotes: quote.specialNotes ?? "",
    invoiceNotes: "",
    items: quote.items,
    difficulty: 5,
    priority: 2,
    status: OrderStatus.NEW,
    paymentType: PaymentType.ON_PICKUP,
    paymentStatus: PaymentStatus.NEW,
    filesStatus: OrderFilesStatus.FILES_ARE_READY,
    paymentDocumentId: "",
    proformaDocumentId: "",
    createdBy: {
      id: "",
      name: "",
    },
    isTest: false,
    appliedPromotionCodes: [],
    printingMethods: [],
    carriedOutBy: [],
    designatedPickupAreaId: "",
    saveCustomer: false,
    saveContact: false,
    sendStatusChangeEmail: false,
    saveShippingAddress: false,
    saveBillingAddress: false,
    mailLink: "",
    active: true,
  };
  return values;
};

export default OrderForm;
