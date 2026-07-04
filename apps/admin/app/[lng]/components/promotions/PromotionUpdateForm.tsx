import { useChannels } from "context/channels";
import { useConfiguration } from "context/configuration";
import { useCustomers } from "context/customers";
import { fetchCustomerGroupOptions } from "@/components/customers/customer-groups";
import AdminLoadingSkeleton from "@/components/layout/AdminLoadingSkeleton";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import {
  Campaign,
  CreatePromotionRule,
  Promotion,
  TenantContext,
  UpdatePromotion,
} from "@konfi/types";
import {
  getIconByFormType,
  PromotionUpdateSchema,
  updatePromotionForm,
} from "@konfi/utils";
import { isNull, isUndefined } from "es-toolkit";
import { Timestamp } from "firebase/firestore";
import type { TFunction } from "i18next";
import { useEffect, useMemo, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import useSWRImmutable from "swr";
import { InferType } from "yup";
import {
  fetchCampaigns,
  fetchCategories,
  fetchProducts,
} from "./PromotionCreateForm";
import { getPromotionRuleValueResetIndexes } from "./promotion-rule-value-reset";
type Input = InferType<typeof PromotionUpdateSchema>;
type PromotionRuleInput = NonNullable<Input["rules"]>[number];

export default function PromotionUpdateForm({
  promotion,
}: {
  promotion: Promotion;
}) {
  const { channels } = useChannels();
  const { loadingProductTypes, productTypes } = useConfiguration();
  const { t, i18n } = useT();
  const tenantContext = useTenantContext();
  const SchemaYupResolver = yupResolver(PromotionUpdateSchema);
  const Form = useForm({
    defaultValues: initialValues(promotion),
    resolver: SchemaYupResolver,
  });
  const rules = useWatch({
    control: Form.control,
    name: "rules",
  }) as Input["rules"] | undefined;
  const previousRuleAttributesRef = useRef<
    Array<PromotionRuleInput["attribute"] | undefined>
  >([]);

  useEffect(() => {
    if (!Array.isArray(rules)) {
      previousRuleAttributesRef.current = [];
      return;
    }

    const nextAttributes = rules.map((rule) => rule?.attribute);
    const indexesToReset = getPromotionRuleValueResetIndexes(
      previousRuleAttributesRef.current,
      rules,
    );

    indexesToReset.forEach((index) => {
      const valuesFieldName = `rules.${index}.values` as const;

      Form.setValue(valuesFieldName, [], {
        shouldDirty: true,
      });
      Form.clearErrors(valuesFieldName);
    });

    previousRuleAttributesRef.current = nextAttributes;
  }, [Form, rules]);
  const { data: productOptions, isValidating: isValidatingProducts } =
    useSWRImmutable(
      isNull(channels) ? null : [channels, "/products"],
      ([channelList]) => fetchProducts(channelList),
      {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        revalidateOnMount: true,
      },
    );
  const { data: categoryOptions, isValidating: isValidatingCategories } =
    useSWRImmutable("/categories", fetchCategories, {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: true,
    });
  const { data: campaignOptions, isValidating: isValidatingCampaigns } =
    useSWRImmutable("/campaigns", fetchCampaigns, {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: true,
    });
  const {
    data: customerGroupOptions,
    isValidating: isValidatingCustomerGroups,
  } = useSWRImmutable(
    ["/customerGroups", tenantContext],
    ([, context]) => fetchCustomerGroupOptions(context),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: true,
    },
  );
  const { customersInputSearchResults, searchCustomersInput } = useCustomers();
  const channelOptions = useMemo(
    () =>
      (channels ?? []).map((channel) => ({
        value: channel.id,
        label: channel.name,
      })),
    [channels],
  );
  const productTypeOptions = useMemo(
    () =>
      (productTypes ?? [])
        .filter((productType) => productType.active)
        .map((productType) => ({
          value: productType.id,
          label: productType.name,
        })),
    [productTypes],
  );

  if (
    isValidatingProducts ||
    isValidatingCategories ||
    isValidatingCampaigns ||
    isValidatingCustomerGroups ||
    loadingProductTypes
  )
    return (
      <AdminLoadingSkeleton variant="fields" showHeader={false} rows={7} />
    );

  if (
    !productOptions ||
    !categoryOptions ||
    !campaignOptions ||
    !customerGroupOptions
  )
    return null;

  return (
    <FormController
      methods={Form}
      buttonLeftIcon={getIconByFormType("UPDATE")}
      buttonLabel={t("admin.editPromotion", {
        defaultValue: "Edit Promotion",
      })}
      formData={updatePromotionForm(
        productOptions,
        categoryOptions,
        campaignOptions,
        t,
        { channelOptions, customerGroupOptions, productTypeOptions },
      )}
      searchResults={{
        customers: customersInputSearchResults,
      }}
      searchFn={{
        customers: searchCustomersInput,
      }}
      handleSubmit={async (data) => await handleSubmit(data, t, tenantContext)}
      t={t}
      i18n={i18n}
    />
  );
}

const initialValues = (promotion: Promotion) => {
  if (isUndefined(promotion)) throw new Error("Promotion not provided");
  const values: Input = {
    id: promotion.id,
    code: promotion.code,
    type: promotion.type,
    isAutomatic: promotion.isAutomatic,
    isOneTime: promotion.isOneTime ?? false,
    minimumOrderValue: promotion.minimumOrderValue,
    applicationMethod: promotion.applicationMethod,
    campaignId: promotion.campaignId,
    rules: toPromotionFormRules(promotion.rules),
    active: promotion.active,
  };
  return values;
};

const toPromotionFormRules = (
  rules: Promotion["rules"],
): CreatePromotionRule[] => {
  const formRules: CreatePromotionRule[] = [];

  for (const rule of rules ?? []) {
    if (!rule.attribute || !rule.operator) continue;

    formRules.push({
      description: rule.description,
      attribute: rule.attribute,
      operator: rule.operator,
      values: rule.values,
    });
  }

  return formRules;
};

const handleSubmit = async (
  data: Input & { campaign: Campaign },
  t: TFunction,
  tenantContext: TenantContext,
) => {
  try {
    const promotion: Omit<UpdatePromotion, "id"> = {
      code: data.code,
      type: data.type,
      isAutomatic: data.isAutomatic,
      isOneTime: data.isOneTime,
      minimumOrderValue: data.minimumOrderValue,
      applicationMethod: data.applicationMethod,
      rules: data.rules,
      active: data.active,
      updatedAt: Timestamp.now(),
    };
    const firestore = (await import("@/lib/firebase/clientApp")).firestore;
    const update = (await import("@konfi/firebase")).update;
    const db = (await import("@konfi/firebase")).db;
    if (data.campaign) {
      const campaign = data.campaign;
      promotion.campaignId = campaign.id;
    }
    await update(
      promotion,
      db.doc(firestore, "/promotions", data.id),
      tenantContext,
    );
    toaster.success({
      title: t("promotion.updated", { defaultValue: "Promotion updated" }),
      description: t("promotion.updatedDescription", {
        defaultValue: "The promotion has been updated successfully.",
      }),
    });
  } catch (error) {
    toaster.error({
      title: t("error.somethingWrong", {
        defaultValue: "Something went wrong",
      }),
      description: t("promotion.notUpdated", {
        defaultValue: "The promotion could not be updated. Error: {{error}}",
        error,
      }),
    });
    console.error(error);
  }
};
