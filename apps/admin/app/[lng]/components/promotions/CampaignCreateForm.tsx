import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { sendCampaignCreatedNotifications } from "@/actions/campaign-notifications";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import {
  CampaignBudgetTypeEnum,
  CreateCampaign,
  CurrencyEnum,
  TenantContext,
} from "@konfi/types";
import {
  CampaignCreateSchema,
  createCampaignForm,
  formatDateInput,
  getIconByFormType,
} from "@konfi/utils";
import { Timestamp } from "firebase/firestore";
import type { TFunction } from "i18next";
import { useForm } from "react-hook-form";
import { InferType } from "yup";

type Input = InferType<typeof CampaignCreateSchema>;

export default function CampaignCreateForm() {
  const { t, i18n } = useT();
  const tenantContext = useTenantContext();
  const SchemaYupResolver = yupResolver(CampaignCreateSchema);
  const Form = useForm({
    defaultValues: initialValues(),
    resolver: SchemaYupResolver,
  });

  return (
    <FormController
      methods={Form}
      buttonLeftIcon={getIconByFormType("CREATE")}
      buttonLabel={t("admin.createCampaign", {
        defaultValue: "Create Campaign",
      })}
      formData={createCampaignForm(t)}
      handleSubmit={async (data) => await handleSubmit(data, t, tenantContext)}
      t={t}
      i18n={i18n}
    />
  );
}

const initialValues = () => {
  const values: Omit<Input, "createdAt" | "updatedAt"> = {
    name: "",
    description: "",
    campaignIdentifier: "",
    startsAt: "",
    endsAt: "",
    availabilityTypes: [],
    budget: {
      type: CampaignBudgetTypeEnum.USAGE,
      limit: 0,
      currencyCode: CurrencyEnum.PLN,
    },
  };
  return values;
};

async function handleSubmit(
  data: Input,
  t: TFunction,
  tenantContext: TenantContext,
): Promise<string | undefined> {
  try {
    const firestore = (await import("@/lib/firebase/clientApp")).firestore;
    const create = (await import("@konfi/firebase")).create;
    const db = (await import("@konfi/firebase")).db;
    const startsAtDate = data.startsAt ? new Date(data.startsAt) : new Date();
    startsAtDate.setHours(0, 0, 0, 0);
    const endsAtDate = data.endsAt ? new Date(data.endsAt) : new Date();
    endsAtDate.setHours(0, 0, 0, 0);
    const campaign: CreateCampaign = {
      name: data.name,
      description: data.description,
      campaignIdentifier: data.campaignIdentifier,
      startsAt: formatDateInput(startsAtDate),
      endsAt: formatDateInput(endsAtDate),
      availabilityTypes: data.availabilityTypes,
      budget:
        !data.budget?.type && !data.budget?.limit
          ? null
          : {
              type: data.budget.type,
              limit: data.budget.limit,
              currencyCode: CurrencyEnum.PLN,
              used: 0,
            },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    toaster.success({
      title: t("campaign.created", { defaultValue: "Campaign created" }),
      description: t("campaign.createdDescription", {
        defaultValue: "The campaign has been created successfully.",
      }),
    });
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
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("error.somethingWrong", {
        defaultValue: "Something went wrong",
      }),
      description: t("campaign.notCreated", {
        defaultValue: "The campaign could not be created. Error: {{error}}",
        error,
      }),
    });
  }
}
