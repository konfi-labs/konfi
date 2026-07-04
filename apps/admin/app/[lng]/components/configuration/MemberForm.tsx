import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { useTenantContext } from "@/context/tenant";
import {
  assertSaasRuntimeQuotaAction,
  recordSaasRuntimeQuotaUsageAction,
} from "@/actions/saas-runtime-quotas";
import { CreateToasterReturn } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { CustomDialog, FormController, toaster } from "@konfi/components";
import { create, db, update } from "@konfi/firebase";
import {
  FormTypes,
  Member,
  MemberCreate,
  MemberUpdate,
  SelectOption,
  TenantContext,
} from "@konfi/types";
import {
  getIconByFormType,
  MemberCreateSchema,
  memberForm,
  MemberUpdateSchema,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { useConfiguration } from "context/configuration";
import { isNull, isUndefined } from "es-toolkit";
import { Timestamp } from "firebase/firestore";
import { TFunction } from "i18next";
import { Dispatch, SetStateAction, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { InferType } from "yup";

type CreateInput = InferType<typeof MemberCreateSchema>;
type UpdateInput = InferType<typeof MemberUpdateSchema>;

export default function MemberForm({
  member,
  type,
  open,
  setOpen,
}: {
  member?: Member;
  type: keyof typeof FormTypes;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const { t, i18n } = useT();
  const { refreshMembers } = useConfiguration();
  const { channel, channels } = useChannels();
  const tenantContext = useTenantContext();
  const channelIdsOptions: SelectOption[] = useMemo(() => {
    if (isNull(channels)) return [];
    return channels.map((channel) => ({
      label: channel.name,
      value: channel.id,
    }));
  }, [channels]);
  const label = `${t(`FormTypes.${type}`)} Pracownika`;
  const CreateSchemaYupResolver = yupResolver(MemberCreateSchema);
  const UpdateSchemaYupResolver = yupResolver(MemberUpdateSchema);

  const CreateForm = useForm({
    defaultValues: initialValuesCreate(),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "CREATE",
  });

  const UpdateForm = useForm({
    defaultValues: member && initialValuesUpdate(member),
    resolver: UpdateSchemaYupResolver,
    disabled: type !== "UPDATE",
  });

  const DuplicateForm = useForm({
    defaultValues: member && initialValuesDuplicate(member),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "DUPLICATE",
  });

  // Reset forms when open state or member changes
  useEffect(() => {
    if (type === "CREATE") {
      CreateForm.reset(initialValuesCreate());
    } else if (type === "UPDATE" && member) {
      UpdateForm.reset(initialValuesUpdate(member));
    } else if (type === "DUPLICATE" && member) {
      DuplicateForm.reset(initialValuesDuplicate(member));
    }
  }, [CreateForm, UpdateForm, DuplicateForm, open, member, type]);

  if (isNull(channel)) return null;

  if (type === "CREATE" && CreateForm.formState.disabled) return null;
  if (type === "UPDATE" && UpdateForm.formState.disabled) return null;
  if (type === "DUPLICATE" && DuplicateForm.formState.disabled) return null;

  return (
    <CustomDialog header={label} open={open} setOpen={setOpen}>
      <FormController
        methods={
          type === "CREATE"
            ? CreateForm
            : type === "UPDATE"
              ? UpdateForm
              : DuplicateForm
        }
        buttonLeftIcon={getIconByFormType(type)}
        buttonLabel={label}
        formData={memberForm(channelIdsOptions, t)}
        update={type === "UPDATE"}
        handleSubmit={async (data) =>
          type === "CREATE" || type === "DUPLICATE"
            ? await handleCreateMember(
                data,
                refreshMembers,
                toaster,
                t,
                tenantContext,
              )
            : !isUndefined(member)
              ? await handleUpdateMember(
                  member.id,
                  data,
                  refreshMembers,
                  toaster,
                  t,
                  tenantContext,
                )
              : toaster.error({
                  title: t("errors.somethingWentWrong"),
                  description: t("errors.member.notFound"),
                  duration: 3000,
                })
        }
        t={t}
        i18n={i18n}
      />
    </CustomDialog>
  );
}

const initialValuesCreate = () => {
  const values: CreateInput = {
    name: "",
    email: "",
    phone: "",
    channelIds: [],
    notifications: {},
  };
  return values;
};

const handleCreateMember = async (
  data: CreateInput,
  refreshMembers: () => void,
  toaster: CreateToasterReturn,
  t: TFunction,
  tenantContext: TenantContext,
) => {
  try {
    await assertSaasRuntimeQuotaAction({
      operation: "admin.member.create",
      resource: "members",
    });

    const member: MemberCreate = {
      id: "",
      name: data.name,
      email: data.email,
      phone: data.phone,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      channelIds: data.channelIds ?? [],
      active: true,
      notifications: data.notifications,
    };
    await create(
      firestore,
      member,
      undefined,
      db.collection(firestore, "/members"),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      tenantContext,
    );
    await recordSaasRuntimeQuotaUsageAction({
      operation: "admin.member.create",
      resource: "members",
    });
    refreshMembers();
    toaster.success({
      title: t("toasts.member.created"),
      description: t("toasts.member.createdDescription"),
    });
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("errors.somethingWentWrong"),
      description: t("toasts.member.notCreated", { error }),
    });
  }
};

const initialValuesUpdate = (member?: Member) => {
  if (isUndefined(member))
    throw "member was not provided to initialValuesUpdate";
  const values: UpdateInput = {
    name: member.name,
    email: member.email,
    phone: member.phone,
    channelIds: member.channelIds ?? [],
    notifications: member.notifications || {},
  };
  return values;
};

const handleUpdateMember = async (
  memberId: Member["id"],
  data: UpdateInput,
  refreshMembers: () => void,
  toaster: CreateToasterReturn,
  t: TFunction,
  tenantContext: TenantContext,
) => {
  try {
    const member: MemberUpdate = {
      name: data.name,
      email: data.email,
      phone: data.phone,
      updatedAt: Timestamp.now(),
      channelIds: data.channelIds ?? [],
      notifications: data.notifications,
    };
    await update(
      member,
      db.doc(firestore, "/members", memberId),
      tenantContext,
    );
    refreshMembers();
    toaster.success({
      title: t("toasts.member.updated"),
      description: t("toasts.member.updatedDescription", { name: data.name }),
    });
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("errors.somethingWentWrong"),
      description: t("toasts.member.notUpdated", { error }),
    });
  }
};

const initialValuesDuplicate = (member?: Member) => {
  if (isUndefined(member))
    throw "member was not provided to initialValuesUpdate";
  const values: CreateInput = {
    name: member.name ?? "",
    email: member.email ?? "",
    phone: member.phone ?? "",
    channelIds: member.channelIds ?? [],
    notifications: member.notifications || {},
  };
  return values;
};
