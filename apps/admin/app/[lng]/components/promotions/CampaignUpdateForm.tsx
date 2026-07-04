import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import {
  Campaign,
  CurrencyEnum,
  TenantContext,
  UpdateCampaign,
} from "@konfi/types";
import {
  CampaignUpdateSchema,
  formatDateInput,
  getIconByFormType,
  updateCampaignForm,
} from "@konfi/utils";
import { isUndefined } from "es-toolkit";
import { Timestamp } from "firebase/firestore";
import type { TFunction } from "i18next";
import { useForm } from "react-hook-form";
import { InferType } from "yup";

type Input = InferType<typeof CampaignUpdateSchema>;

export default function CampaignUpdateForm({
  campaign,
}: {
  campaign: Campaign;
}) {
  const { t, i18n } = useT();
  const tenantContext = useTenantContext();
  const SchemaYupResolver = yupResolver(CampaignUpdateSchema);
  const Form = useForm({
    defaultValues: initialValues(campaign),
    resolver: SchemaYupResolver,
  });

  return (
    <FormController
      methods={Form}
      buttonLeftIcon={getIconByFormType("UPDATE")}
      buttonLabel={t("admin.editCampaign", {
        defaultValue: "Edit Campaign",
      })}
      formData={updateCampaignForm(t)}
      handleSubmit={async (data) => await handleSubmit(data, t, tenantContext)}
      t={t}
      i18n={i18n}
    />
  );
}

const initialValues = (campaign: Campaign) => {
  if (isUndefined(campaign)) throw new Error("Campaign not provided");
  const values: Input = {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    campaignIdentifier: campaign.campaignIdentifier,
    startsAt: campaign.startsAt
      ? formatDateInput(new Date(campaign.startsAt))
      : "",
    endsAt: campaign.endsAt ? formatDateInput(new Date(campaign.endsAt)) : "",
    availabilityTypes: campaign.availabilityTypes || [],
    budget: {
      type: campaign.budget?.type,
      limit: campaign.budget?.limit,
      currencyCode: campaign.budget?.currencyCode,
    },
  };
  return values;
};

async function handleSubmit(
  data: Input,
  t: TFunction,
  tenantContext: TenantContext,
): Promise<void> {
  try {
    const firestore = (await import("@/lib/firebase/clientApp")).firestore;
    const update = (await import("@konfi/firebase")).update;
    const db = (await import("@konfi/firebase")).db;
    const campaign: Omit<UpdateCampaign, "id"> = {
      name: data.name,
      description: data.description,
      campaignIdentifier: data.campaignIdentifier,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
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
      updatedAt: Timestamp.now(),
    };
    toaster.success({
      title: t("campaign.updated", { defaultValue: "Campaign updated" }),
      description: t("campaign.updatedDescription", {
        defaultValue: "The campaign has been updated successfully.",
      }),
    });
    return await update(
      campaign,
      db.doc(firestore, "campaigns", data.id),
      tenantContext,
    );
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("error.somethingWrong", {
        defaultValue: "Something went wrong",
      }),
      description: t("campaign.notUpdated", {
        defaultValue: "The campaign could not be updated. Error: {{error}}",
        error,
      }),
    });
  }
}
