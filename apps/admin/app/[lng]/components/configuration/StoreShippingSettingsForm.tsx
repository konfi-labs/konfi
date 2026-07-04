import { revalidateTagCache } from "@/actions";
import { assertSaasRuntimeModuleAction } from "@/actions/saas-runtime-quotas";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { CreateToasterReturn } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import { db, tenant } from "@konfi/firebase";
import {
  FormTypes,
  Settings,
  ShippingOptions,
  TenantContext,
} from "@konfi/types";
import {
  getIconByFormType,
  storeSettingsForm,
  StoreSettingsSchema,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { useConfiguration } from "context/configuration";
import { isEqual, isNull } from "es-toolkit";
import { setDoc } from "firebase/firestore";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { InferType } from "yup";

type Input = InferType<typeof StoreSettingsSchema>;

export const StoreShippingSettingsForm = ({
  storeSettings,
  type,
}: {
  storeSettings?: Settings | null;
  type: keyof typeof FormTypes;
}) => {
  const { t, i18n } = useT();
  const { refreshMembers } = useConfiguration();
  const { channel } = useChannels();
  const tenantContext = useTenantContext();
  const label = `${t(`FormTypes.${type}`)} ${t("admin.storeSettings")}`;
  const SchemaYupResolver = yupResolver(StoreSettingsSchema);
  const UpdateForm = useForm({
    defaultValues: storeSettings ? initialValues(storeSettings) : undefined,
    resolver: SchemaYupResolver,
    disabled: type !== "UPDATE",
  });

  useEffect(() => {
    if (storeSettings) {
      UpdateForm.reset(initialValues(storeSettings));
    }
  }, [UpdateForm, storeSettings]);

  if (type !== "UPDATE" || UpdateForm.formState.disabled) return null;

  if (isNull(channel)) return null;

  return (
    <FormController
      methods={type === "UPDATE" ? UpdateForm : undefined}
      buttonLeftIcon={getIconByFormType(type)}
      buttonLabel={label}
      formData={storeSettingsForm(t)}
      update={type === "UPDATE"}
      handleSubmit={async (data: Input) =>
        await handleUpdateStoreSettings(
          storeSettings,
          data,
          refreshMembers,
          toaster,
          channel.id,
          t,
          tenantContext,
        )
      }
      t={t}
      i18n={i18n}
    />
  );
};

const initialValues = (storeSettings?: Settings | null) => {
  const values: Input = {
    buying: {
      enabled: storeSettings?.buying?.enabled ?? false,
      max: storeSettings?.buying?.max ?? 500000,
      min: storeSettings?.buying?.min ?? 5000,
    },
    freeShipping: {
      enabled: storeSettings?.freeShipping?.enabled ?? false,
      min: storeSettings?.freeShipping?.min ?? 500000,
    },
    underConstruction: {
      enabled: storeSettings?.underConstruction?.enabled ?? false,
      message: storeSettings?.underConstruction?.message ?? "",
    },
    checkout: {
      invoiceEnabled: storeSettings?.checkout?.invoiceEnabled ?? true,
      stockPolicy: storeSettings?.checkout?.stockPolicy ?? "allow",
    },
    express: {
      enabled: storeSettings?.express?.enabled ?? false,
      percent: storeSettings?.express?.percent ?? 20,
    },
    shippingOptionsPrices: {
      [ShippingOptions.COMPANY_COURIER]:
        storeSettings?.shippingOptionsPrices[ShippingOptions.COMPANY_COURIER] ??
        4000,
      [ShippingOptions.CUSTOM]:
        storeSettings?.shippingOptionsPrices[ShippingOptions.CUSTOM] ?? 0,
      [ShippingOptions.DHL]:
        storeSettings?.shippingOptionsPrices[ShippingOptions.DHL] ?? 3000,
      [ShippingOptions.DPD]:
        storeSettings?.shippingOptionsPrices[ShippingOptions.DPD] ?? 3000,
      [ShippingOptions.FEDEX]:
        storeSettings?.shippingOptionsPrices[ShippingOptions.FEDEX] ?? 3000,
      [ShippingOptions.INPOST]:
        storeSettings?.shippingOptionsPrices[ShippingOptions.INPOST] ?? 3000,
      [ShippingOptions.PACZKOMATY_INPOST]:
        storeSettings?.shippingOptionsPrices[
          ShippingOptions.PACZKOMATY_INPOST
        ] ?? 1500,
      [ShippingOptions.PERSONAL_COLLECTION]:
        storeSettings?.shippingOptionsPrices[
          ShippingOptions.PERSONAL_COLLECTION
        ] ?? 0,
    },
  };
  return values;
};

const handleUpdateStoreSettings = async (
  storeSettings: Settings | undefined | null,
  data: Input,
  refreshStoreSettings: () => void,
  toaster: CreateToasterReturn,
  channelId: string,
  t: ReturnType<typeof useT>["t"],
  tenantContext: TenantContext,
) => {
  try {
    const buyingStoreSettings: Settings["buying"] = {
      max: data.buying.max,
      min: data.buying.min,
      enabled: data.buying.enabled,
    };

    const freeShippingStoreSettings: Settings["freeShipping"] = {
      enabled: data.freeShipping.enabled,
      min: data.freeShipping.min,
    };

    const underConstructionStoreSettings: Settings["underConstruction"] = {
      enabled: data.underConstruction.enabled,
      message: data.underConstruction.message,
    };

    const checkoutStoreSettings: NonNullable<Settings["checkout"]> = {
      invoiceEnabled: data.checkout?.invoiceEnabled ?? true,
      stockPolicy: data.checkout?.stockPolicy === "block" ? "block" : "allow",
    };

    const expressStoreSettings: Settings["express"] = {
      enabled: data.express.enabled,
      percent: data.express.percent,
    };

    const shippingOptionsPricesStoreSettings: Settings["shippingOptionsPrices"] =
      {
        [ShippingOptions.COMPANY_COURIER]:
          data.shippingOptionsPrices.COMPANY_COURIER,
        [ShippingOptions.CUSTOM]: data.shippingOptionsPrices.CUSTOM,
        [ShippingOptions.DHL]: data.shippingOptionsPrices.DHL,
        [ShippingOptions.DPD]: data.shippingOptionsPrices.DPD,
        [ShippingOptions.FEDEX]: data.shippingOptionsPrices.FEDEX,
        [ShippingOptions.INPOST]: data.shippingOptionsPrices.INPOST,
        [ShippingOptions.PACZKOMATY_INPOST]:
          data.shippingOptionsPrices.PACZKOMATY_INPOST,
        [ShippingOptions.PERSONAL_COLLECTION]:
          data.shippingOptionsPrices.PERSONAL_COLLECTION,
      };

    if (!isEqual(storeSettings?.buying, buyingStoreSettings)) {
      if (buyingStoreSettings.enabled) {
        await assertSaasRuntimeModuleAction({
          module: "storefront",
          operation: "admin.storefront.enable",
        });
      }

      await setDoc(
        db.doc(firestore, "/channels/" + channelId + "/settings", "buying"),
        tenant.withTenantId(
          buyingStoreSettings,
          tenantContext,
          "store shipping settings update",
        ),
        { merge: true },
      );
      try {
        await revalidateTagCache("storeSettings");
      } catch (error) {
        console.error("Failed to revalidate cache:", error);
      }
      toaster.success({
        title: t("configuration.buyingSettings"),
        description: t("configuration.settingsUpdatedSuccess"),
      });
    }

    if (!isEqual(storeSettings?.freeShipping, freeShippingStoreSettings)) {
      await setDoc(
        db.doc(
          firestore,
          "/channels/" + channelId + "/settings",
          "freeShipping",
        ),
        tenant.withTenantId(
          freeShippingStoreSettings,
          tenantContext,
          "store shipping settings update",
        ),
        { merge: true },
      );
      try {
        await revalidateTagCache("storeSettings");
      } catch (error) {
        console.error("Failed to revalidate cache:", error);
      }
      toaster.success({
        title: t("configuration.freeShippingSettings"),
        description: t("configuration.settingsUpdatedSuccess"),
      });
    }

    if (
      !isEqual(storeSettings?.underConstruction, underConstructionStoreSettings)
    ) {
      await setDoc(
        db.doc(
          firestore,
          "/channels/" + channelId + "/settings",
          "underConstruction",
        ),
        tenant.withTenantId(
          underConstructionStoreSettings,
          tenantContext,
          "store shipping settings update",
        ),
        { merge: true },
      );
      try {
        await revalidateTagCache("storeSettings");
      } catch (error) {
        console.error("Failed to revalidate cache:", error);
      }
      toaster.success({
        title: t("configuration.underConstructionSettings"),
        description: t("configuration.settingsUpdatedSuccess"),
      });
    }

    if (!isEqual(storeSettings?.checkout, checkoutStoreSettings)) {
      await setDoc(
        db.doc(firestore, "/channels/" + channelId + "/settings", "checkout"),
        tenant.withTenantId(
          checkoutStoreSettings,
          tenantContext,
          "store checkout settings update",
        ),
        { merge: true },
      );
      try {
        await revalidateTagCache("storeSettings");
      } catch (error) {
        console.error("Failed to revalidate cache:", error);
      }
      toaster.success({
        title: t("configuration.checkoutSettings"),
        description: t("configuration.settingsUpdatedSuccess"),
      });
    }

    if (!isEqual(storeSettings?.express, expressStoreSettings)) {
      await setDoc(
        db.doc(firestore, "/channels/" + channelId + "/settings", "express"),
        tenant.withTenantId(
          expressStoreSettings,
          tenantContext,
          "store shipping settings update",
        ),
        { merge: true },
      );
      try {
        await revalidateTagCache("storeSettings");
      } catch (error) {
        console.error("Failed to revalidate cache:", error);
      }
      toaster.success({
        title: t("configuration.expressSettings"),
        description: t("configuration.settingsUpdatedSuccess"),
      });

      // Revalidate product caches since express settings affect product pricing
      try {
        await revalidateTagCache("featuredProducts");
        await revalidateTagCache("popularProducts");
        await revalidateTagCache("categorizedCardProducts");
        await revalidateTagCache("products");
      } catch (revalidationError) {
        console.error(
          "Failed to revalidate product caches:",
          revalidationError,
        );
        // Don't throw - settings were saved successfully
      }
    }

    if (
      !isEqual(
        storeSettings?.shippingOptionsPrices,
        shippingOptionsPricesStoreSettings,
      )
    ) {
      await setDoc(
        db.doc(
          firestore,
          "/channels/" + channelId + "/settings",
          "shippingOptionsPrices",
        ),
        tenant.withTenantId(
          shippingOptionsPricesStoreSettings,
          tenantContext,
          "store shipping settings update",
        ),
        { merge: true },
      );
      toaster.success({
        title: t("configuration.shippingCostsSettings"),
        description: t("configuration.settingsUpdatedSuccess"),
      });

      // Revalidate product caches since shipping prices can affect product displays
      try {
        await revalidateTagCache("storeSettings");
        await revalidateTagCache("featuredProducts");
        await revalidateTagCache("popularProducts");
        await revalidateTagCache("categorizedCardProducts");
        await revalidateTagCache("products");
      } catch (revalidationError) {
        console.error(
          "Failed to revalidate product caches:",
          revalidationError,
        );
        // Don't throw - settings were saved successfully
      }
    }

    refreshStoreSettings();
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("admin.somethingWentWrong"),
      description: t("configuration.settingsUpdateError", {
        error: String(error),
      }),
    });
  }
};
