import { useChannels } from "context/channels";
import { useConfiguration } from "context/configuration";
import { useCustomers } from "context/customers";
import { sendCampaignCreatedNotifications } from "@/actions/campaign-notifications";
import { fetchCustomerGroupOptions } from "@/components/customers/customer-groups";
import AdminLoadingSkeleton from "@/components/layout/AdminLoadingSkeleton";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { CreateToasterReturn } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import {
  ApplicationMethodAllocationEnum,
  ApplicationMethodTargetTypeEnum,
  ApplicationMethodTypeEnum,
  Campaign,
  Category,
  Channel,
  CreateCampaign,
  CreatePromotion,
  CurrencyEnum,
  Product,
  PromotionTypeEnum,
  TenantContext,
} from "@konfi/types";
import {
  createPromotionForm,
  getIconByFormType,
  PromotionCreateSchema,
} from "@konfi/utils";
import { isNull, isUndefined } from "es-toolkit";
import { Timestamp } from "firebase/firestore";
import type { TFunction } from "i18next";
import { useEffect, useMemo, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import useSWRImmutable from "swr";
import { InferType } from "yup";
import { getPromotionRuleValueResetIndexes } from "./promotion-rule-value-reset";

type Input = InferType<typeof PromotionCreateSchema>;
type PromotionRuleInput = NonNullable<Input["rules"]>[number];

export async function fetchProducts(channels: Channel[]) {
  const get = (await import("@konfi/firebase")).get;
  const db = (await import("@konfi/firebase")).db;
  const where = (await import("firebase/firestore")).where;
  const firestore = (await import("@/lib/firebase/clientApp")).firestore;
  const result = await get(
    db.collectionGroup(firestore, "products", 999, [
      where("active", "==", true),
      where("availability.published", "==", true),
    ]),
  );
  if (!isUndefined(result)) {
    const products = result[0] as Product[];
    const productsAsOptions = products.map((product) => {
      const channelName =
        channels.find((channel) => channel.id === product.channelId)?.name ??
        "Unknown channel";

      return {
        value: product.id,
        label: `${product.name} [${channelName}]`,
      };
    });
    return productsAsOptions;
  } else return [];
}

export async function fetchCategories() {
  const get = (await import("@konfi/firebase")).get;
  const db = (await import("@konfi/firebase")).db;
  const firestore = (await import("@/lib/firebase/clientApp")).firestore;
  const result = await get(db.collectionGroup(firestore, "categories", 99));
  if (!isUndefined(result)) {
    const categories = result[0] as Category[];
    const categoriesAsOptions = categories.map((category) => ({
      value: category.id,
      label: category.name,
    }));
    return categoriesAsOptions;
  } else return [];
}

export async function fetchCampaigns() {
  const get = (await import("@konfi/firebase")).get;
  const db = (await import("@konfi/firebase")).db;
  const firestore = (await import("@/lib/firebase/clientApp")).firestore;
  const result = await get(db.collection(firestore, "campaigns"));
  if (!isUndefined(result)) {
    const campaigns = result[0] as Campaign[];
    const campaignsAsOptions = campaigns.map((campaign) => ({
      value: campaign.id,
      label: campaign.name ?? campaign.id,
    }));
    return campaignsAsOptions;
  } else return [];
}

export default function PromotionCreateForm() {
  const { channels } = useChannels();
  const { loadingProductTypes, productTypes } = useConfiguration();
  const { t, i18n } = useT();
  const tenantContext = useTenantContext();
  const SchemaYupResolver = yupResolver(PromotionCreateSchema);
  const Form = useForm({
    defaultValues: initialValues(),
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
      buttonLeftIcon={getIconByFormType("CREATE")}
      buttonLabel={t("admin.createPromotion", {
        defaultValue: "Create Promotion",
      })}
      formData={createPromotionForm(
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
      handleSubmit={async (data) =>
        await handleSubmit(data, toaster, t, tenantContext)
      }
      t={t}
      i18n={i18n}
    />
  );
}

const initialValues = () => {
  const values: Omit<Input, "createdAt" | "updatedAt"> & {
    createCampaign: boolean;
  } = {
    code: "",
    type: PromotionTypeEnum.STANDARD,
    isAutomatic: false,
    isOneTime: false,
    applicationMethod: {
      type: ApplicationMethodTypeEnum.PERCENTAGE,
      targetType: ApplicationMethodTargetTypeEnum.ITEMS,
      allocation: ApplicationMethodAllocationEnum.EACH,
      value: 0,
      currencyCode: "PLN",
      maxQuantity: 0,
      buyRulesMinQuantity: 0,
      applyToQuantity: 0,
    },
    active: true,
    createCampaign: false,
  };
  return values;
};

const handleSubmit = async (
  data: Input & { createCampaign: boolean },
  toast: CreateToasterReturn,
  t: TFunction,
  tenantContext: TenantContext,
) => {
  console.log(data);
  try {
    const promotion: CreatePromotion = {
      code: data.code,
      type: data.type,
      isAutomatic: data.isAutomatic,
      isOneTime: data.isOneTime,
      minimumOrderValue: data.minimumOrderValue,
      applicationMethod: data.applicationMethod,
      active: data.active,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    if (data.rules) promotion.rules = data.rules;
    const firestore = (await import("@/lib/firebase/clientApp")).firestore;
    const create = (await import("@konfi/firebase")).create;
    const db = (await import("@konfi/firebase")).db;
    let createdCampaignId;
    if (data.createCampaign) {
      createdCampaignId = await createCampaign(data, tenantContext);
    }
    console.log(createdCampaignId);
    if (createdCampaignId) {
      promotion.campaignId = createdCampaignId;
    } else if (!data.createCampaign && data.campaignId) {
      promotion.campaignId = data.campaignId;
    }
    await create(
      firestore,
      promotion,
      undefined,
      db.collection(firestore, "promotions"),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      tenantContext,
    );
    toast.success({
      title: t("common.success", { defaultValue: "Success" }),
      description: t("admin.promotionCreated", {
        defaultValue: "The promotion has been created successfully.",
      }),
    });
  } catch (error) {
    toast.error({
      title: t("admin.somethingWentWrong", {
        defaultValue: "Something went wrong",
      }),
      description: t("admin.promotionNotCreated", {
        defaultValue: "The promotion could not be created. Error: {{error}}",
        error,
      }),
    });
    console.error(error);
  }
};

async function createCampaign(
  data: Input & { createCampaign: boolean },
  tenantContext: TenantContext,
): Promise<string | undefined> {
  if (!data.campaign) return;
  const firestore = (await import("@/lib/firebase/clientApp")).firestore;
  const create = (await import("@konfi/firebase")).create;
  const db = (await import("@konfi/firebase")).db;
  const campaign: CreateCampaign = {
    name: data.campaign.name,
    description: data.campaign.description,
    campaignIdentifier: data.campaign.campaignIdentifier,
    startsAt: data.campaign.startsAt,
    endsAt: data.campaign.endsAt,
    availabilityTypes: data.campaign.availabilityTypes,
    budget:
      !data.campaign.budget?.type && !data.campaign.budget?.limit
        ? null
        : {
            type: data.campaign.budget.type,
            limit: data.campaign.budget.limit,
            currencyCode: CurrencyEnum.PLN,
            used: 0,
          },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  const campaignId = await create(
    firestore,
    campaign,
    undefined,
    db.collection(firestore, "campaigns"),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    tenantContext,
  );
  if (campaignId) {
    try {
      await sendCampaignCreatedNotifications(campaignId);
    } catch (error) {
      console.error("Failed to send campaign notifications", error);
    }
  }

  return campaignId;
}
