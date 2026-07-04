"use client";

import { classifyAndPersistOrderPrintingMethodsAdmin } from "@/actions/ai";
import { classifyAndPersistProductionGroupingsAdmin } from "@/actions/production-grouping-classifications";
import { updateOrderStatusField } from "@/actions/order-updates";
import { useOrders } from "@/context/orders";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { toSerializableProductionGroupingItems } from "@/lib/orders/production-materials";
import { yupResolver } from "@hookform/resolvers/yup";
import {
  AnonymousPackageShippingField,
  FormController,
  toaster,
} from "@konfi/components";
import { db, update } from "@konfi/firebase";
import {
  Channel,
  NestedMember,
  Order,
  OrderFilesStatus,
  OrderUpdateStore,
  type ProductionGroupingProfile,
  SelectOption,
  ShippingOptions,
  TenantContext,
} from "@konfi/types";
import {
  formatMailLink,
  createEmptyAnonymousPackageLabelAddress,
  getIconByFormType,
  getKnownPrintingMethodIds,
  getOrderFileStatusOptions,
  getOrderWorkflowStatusOptions,
  getPrintingMethodOptions,
  getShippingMethodOptions,
  hasShippingDestination,
  isAnonymousPackageShippingAllowedFor,
  normalizeAnonymousPackageLabelAddress,
  OrderUpdateSchemaStore,
  toSerializableOrderPrintingMethodItems,
  updateOrderFormStore,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import {
  useConfigurationMembers,
  useConfigurationSettings,
  useConfigurationWarehouses,
} from "context/configuration";
import { isUndefined } from "es-toolkit";
import { Timestamp } from "firebase/firestore";
import { TFunction } from "i18next";
import { startTransition, useEffect, useMemo } from "react";
import { FieldErrors, FieldValues, useForm } from "react-hook-form";
import { InferType } from "yup";
import { By } from "../form/field-controllers/By";

type UpdateInputStore = InferType<typeof OrderUpdateSchemaStore>;

type StoreOrderUpdateFormProps = {
  order: Order;
  setOptimisticOrder?: (action: Partial<Order>) => void;
};

type OrderTranslation = (
  key: string,
  options?: { defaultValue?: string; values?: Record<string, unknown> },
) => string;

function createEmptyNestedMember(): NestedMember {
  return { id: "", name: "" };
}

function showShippingDestinationRequiredError(
  toast: typeof toaster,
  t: OrderTranslation,
) {
  toast.error({
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
  toast: typeof toaster,
  t: OrderTranslation,
) {
  if (!isUndefined(errors.shipping)) {
    showShippingDestinationRequiredError(toast, t);
  }
}

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

async function handleUpdateOrderStore(
  _order: Order,
  orderId: Order["id"],
  data: UpdateInputStore,
  channel: Channel,
  toast: typeof toaster,
  t: TFunction,
  setOptimisticOrder?: (action: Partial<Order>) => void,
  tenantContext?: TenantContext,
  knownPrintingMethodIds?: NonNullable<Order["printingMethods"]>,
  productionGroupingProfile?: ProductionGroupingProfile,
  paymentStatusDirty = false,
) {
  try {
    if (!hasShippingDestination(data.shipping)) {
      showShippingDestinationRequiredError(toast, t);
      return;
    }

    if (
      data.anonymousPackageShipping &&
      !isAnonymousPackageShippingAllowedFor(data.shipping?.country)
    ) {
      toast.error({
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

    // oxlint-disable-next-line turbo/no-undeclared-env-vars -- NODE_ENV is provided by Next.js.
    if (process.env.NODE_ENV === "development") {
      console.log("order", order);
      toast.success({
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

    toast.success({
      title: t("toasts.order.updated", { defaultValue: "Order updated" }),
      description: t("toasts.order.updatedDescription", {
        defaultValue: "Successfully updated order",
      }),
    });
  } catch (error) {
    console.error(error);
    toast.error({
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
}

export default function StoreOrderUpdateForm({
  order,
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
    methods.reset(updateDefaultValues);
  }, [methods, updateDefaultValues]);

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

  return (
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
  );
}
