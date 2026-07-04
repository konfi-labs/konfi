import { useAuth } from "@/context/auth";
import { useCart } from "@/context/cart";
import { useStoreCurrency } from "@/context/currency";
import { useT } from "@/i18n/client";
import { analytics } from "@/lib/firebase/clientApp";
import { createOrder } from "@/lib/firebase/functions";
import { Spinner } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import {
  AnonymousPackageShippingField,
  Empty,
  FormController,
} from "@konfi/components";
import {
  AddressTypeEnum,
  type CurrencyCode,
  type CurrencyConversionSnapshot,
  Customer,
  Discount,
  OrderItem,
  type PaymentMethodId,
  ProofingOptions,
  SelectOption,
  type ShippingMethodId,
  ShippingOptions,
  type StoreOrderForm,
  Warehouse,
} from "@konfi/types";
import {
  checkoutForm,
  createEmptyAnonymousPackageLabelAddress,
  formatOrderItemAsAnalyticsItem,
  openNewTabWithDelay,
  STORE_CART,
  StoreOrderSchema,
} from "@konfi/utils";
import { isNull, isUndefined } from "es-toolkit";
import { logEvent } from "firebase/analytics";
import { User } from "firebase/auth";
import { TFunction } from "i18next";
import { Route } from "next";
import { useRouter } from "next/navigation";
import React from "react";
import { Resolver, useForm } from "react-hook-form";

type Input = StoreOrderForm;
type CheckoutFormValues = Omit<Input, "customer" | "shippingOption"> & {
  customer?: Customer;
  shippingOption: ShippingMethodId;
};

interface Props {
  channelId?: string;
  warehouses: Warehouse[] | null;
  shippingPrice: number;
  setShowSuccess: React.Dispatch<React.SetStateAction<boolean>>;
  setUrl: React.Dispatch<React.SetStateAction<string>>;
  setError: React.Dispatch<React.SetStateAction<string>>;
  setProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  proofingMethodOptions?: SelectOption[];
  checkoutInvoiceEnabled?: boolean;
}

const CheckoutForm = ({
  channelId,
  warehouses,
  shippingPrice,
  setUrl,
  setShowSuccess,
  setError,
  setProcessing,
  proofingMethodOptions,
  checkoutInvoiceEnabled = true,
}: Props) => {
  const { t, i18n } = useT();
  const { user, customer } = useAuth();
  const {
    loading,
    isEmpty,
    items,
    availablePaymentTypes,
    total,
    shippingOption,
    paymentType,
    appliedPromotionCodes,
    totalDiscount,
    shippingPriceDiscount,
    storeCreditAmount,
  } = useCart();
  const {
    convertAmount,
    selectedCurrency,
    selectedCurrencyCode,
    toMajorAmount,
  } = useStoreCurrency();
  const router = useRouter();

  const SchemaYupResolver = yupResolver(
    StoreOrderSchema,
  ) as unknown as Resolver<CheckoutFormValues>;
  const CreateForm = useForm<CheckoutFormValues>({
    defaultValues: initialValues(customer, shippingOption),
    resolver: SchemaYupResolver,
  });

  React.useEffect(() => {
    if (CreateForm.getValues("shippingOption") === shippingOption) {
      return;
    }

    CreateForm.setValue("shippingOption", shippingOption, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: true,
    });
  }, [CreateForm, shippingOption]);

  if (loading || !channelId || !availablePaymentTypes || !user)
    return <Spinner />;

  if (availablePaymentTypes.length === 0) {
    return (
      <Empty
        title={t("store.checkout.paymentUnavailableTitle", {
          defaultValue: "Checkout is unavailable",
        })}
        description={t("store.checkout.paymentUnavailableDescription", {
          defaultValue:
            "This storefront has no usable payment methods configured. Please contact the store team before placing an order.",
        })}
        icon={"payments"}
      />
    );
  }

  if (
    !shippingOption ||
    !paymentType ||
    !availablePaymentTypes.includes(paymentType)
  ) {
    router.replace(("/" + i18n.resolvedLanguage + STORE_CART) as Route);
    return <Spinner />;
  }

  if (isEmpty || isNull(items))
    return (
      <Empty
        title={t("cart.empty", { defaultValue: "Cart is empty" })}
        description={t("cart.addProducts", {
          defaultValue: "Add products to cart",
        })}
        icon={"shopping_cart"}
      />
    );

  return (
    <FormController
      methods={CreateForm}
      buttonLeftIcon={"https"}
      buttonLabel={t("store.orderAndPay", { defaultValue: "Order and pay" })}
      formData={checkoutForm(t, proofingMethodOptions, {
        invoiceEnabled: checkoutInvoiceEnabled,
      })}
      afterAddressSection={
        <AnonymousPackageShippingField shippingOption={shippingOption} t={t} />
      }
      handleSubmit={(data) =>
        handleCreateOrder(
          data,
          user,
          items,
          total,
          paymentType,
          shippingOption,
          shippingPrice,
          setShowSuccess,
          setUrl,
          setError,
          setProcessing,
          appliedPromotionCodes,
          totalDiscount,
          shippingPriceDiscount,
          selectedCurrencyCode,
          convertAmount(total).snapshot,
          selectedCurrency.minorUnitDigits,
          toMajorAmount,
          storeCreditAmount,
          t,
        )
      }
      warehouses={
        shippingOption === ShippingOptions.PERSONAL_COLLECTION
          ? warehouses
          : null
      }
      t={t}
      i18n={i18n}
    />
  );
};

const initialValues = (
  customer: Customer | null,
  shippingOption: ShippingMethodId,
) => {
  const values: CheckoutFormValues = {
    // userId: user?.uid ?? "",
    customer: customer ?? undefined, // Client side for addresses access in form
    contact: {
      name: process.env.NODE_ENV === "development" ? "Example Customer" : "",
      email: "",
      phone: process.env.NODE_ENV === "development" ? "123456789" : "",
      active: true,
    },
    anonymousPackageShipping: false,
    anonymousPackageLabelAddress: createEmptyAnonymousPackageLabelAddress(),
    shippingOption,
    shipping: {
      type: AddressTypeEnum.SHIPPING,
      name: "",
      street: "",
      number: "",
      local: "",
      zip: "",
      city: "",
      country: "Polska",
      active: true,
    },
    saveShippingAddress: false,
    invoice: false,
    billing: {
      type: AddressTypeEnum.BILLING,
      name: "",
      companyName: "",
      nip: "",
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
    },
    saveBillingAddress: false,
    specialNotes: "",
    invoiceNotes: "",
    proofing: ProofingOptions.RUN_AS_IS,
    appliedPromotionCodes: [],
  };
  return values;
};

async function handleCreateOrder(
  data: Input,
  user: User,
  items: OrderItem[],
  total: number,
  paymentType: PaymentMethodId,
  shippingOption: ShippingMethodId,
  shippingPrice: number,
  setShowSuccess: React.Dispatch<React.SetStateAction<boolean>>,
  setUrl: React.Dispatch<React.SetStateAction<string>>,
  setError: React.Dispatch<React.SetStateAction<string>>,
  setProcessing: React.Dispatch<React.SetStateAction<boolean>>,
  appliedPromotionCodes: string[],
  totalPriceDiscount: Discount | null,
  shippingPriceDiscount: Discount | null,
  selectedCurrencyCode: CurrencyCode,
  currencySnapshot: CurrencyConversionSnapshot | undefined,
  selectedCurrencyMinorUnitDigits: number,
  toMajorAmount: (
    amountMinor: number,
    baseCurrency?: CurrencyCode | null,
  ) => number,
  storeCreditAmount: number,
  t: TFunction<"translation", undefined>,
) {
  try {
    setError("");
    setProcessing(true);

    const orderRequest = {
      ...data,
      paymentType,
      shippingOption,
      appliedPromotionCodes,
      currency: selectedCurrencyCode,
      currencySnapshot,
      storeCreditAmount,
    };

    // Check if in development environment, log the order data and set success message
    // if (process.env.NODE_ENV === "development") {
    //   console.log("Order data:", orderRequest);
    //   setShowSuccess(true);
    //   setProcessing(false);
    //   return;
    // }

    if (!isUndefined(analytics) && process.env.NODE_ENV !== "development") {
      const analyticsItems = items.map((item: OrderItem, index) =>
        formatOrderItemAsAnalyticsItem(item, index),
      );
      const analyticsValue = Number(
        toMajorAmount(total - shippingPrice).toFixed(
          selectedCurrencyMinorUnitDigits,
        ),
      );
      logEvent(analytics, "begin_checkout", {
        currency: selectedCurrencyCode,
        value: analyticsValue,
        items: analyticsItems,
      });
      if (paymentType) {
        logEvent(analytics, "add_payment_info", {
          currency: selectedCurrencyCode,
          value: analyticsValue,
          items: analyticsItems,
          payment_type: t(`PaymentType.${paymentType}`),
        });
      }
      if (shippingOption) {
        logEvent(analytics, "add_shipping_info", {
          currency: selectedCurrencyCode,
          value: analyticsValue,
          items: analyticsItems,
          shipping_option: t(`ShippingOptions.${shippingOption}`),
        });
      }
    }

    if (process.env.NODE_ENV === "development") {
      console.log("Order data:", orderRequest);
    }

    const idToken = await user.getIdToken();
    const result = await createOrder(orderRequest, idToken);
    const { id, url, error } = result;

    if (error) {
      console.error(error);
      setError(error as string);
      setProcessing(false);
      return;
    }

    if (url) {
      setUrl(url);
      openNewTabWithDelay(url, 3000);
    }

    if (!isUndefined(analytics) && process.env.NODE_ENV !== "development") {
      const totalMajor = toMajorAmount(total);
      const purchaseValue = Number(
        toMajorAmount(total - shippingPrice).toFixed(
          selectedCurrencyMinorUnitDigits,
        ),
      );
      logEvent(analytics, "purchase", {
        currency: selectedCurrencyCode,
        value: purchaseValue,
        transaction_id: id,
        shipping: Number(
          toMajorAmount(shippingPrice).toFixed(selectedCurrencyMinorUnitDigits),
        ),
        tax: Number(
          (totalMajor - totalMajor / 1.23).toFixed(
            selectedCurrencyMinorUnitDigits,
          ),
        ),
        items: items.map((item: OrderItem, index) =>
          formatOrderItemAsAnalyticsItem(item, index),
        ),
      });
    }

    setShowSuccess(true);
    setProcessing(false);
  } catch (error) {
    console.error(error);
    setError(error as string);
    setProcessing(false);
  }
}

export default CheckoutForm;
