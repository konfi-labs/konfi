import { useTenantContext } from "@/context/tenant";
import { useChannels } from "context/channels";
import {
  useConfigurationMembers,
  useConfigurationSettings,
} from "context/configuration";
import { useOrders } from "context/orders";
import { createComplaint } from "@/actions/complaints";
import { CreateToasterReturn } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import { db, update } from "@konfi/firebase";
import {
  Channel,
  ComplaintCreate,
  ComplaintStatus,
  ComplaintUpdate,
  FormTypes,
  Order,
  OrderItem,
  SelectOption,
  TenantContext,
} from "@konfi/types";
import {
  ComplaintCreateSchema,
  complaintForm,
  ComplaintUpdateSchema,
  getComplaintStatusOptions,
  getIconByFormType,
} from "@konfi/utils";
import { isNull, isUndefined } from "es-toolkit";
import { Timestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase/clientApp";
import { Dispatch, SetStateAction, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useT } from "@/i18n/client";
import type { MutatorOptions } from "swr";
import { InferType } from "yup";
import Drawer from "../Drawer";
import { By } from "../form/field-controllers/By";

type CreateInput = InferType<typeof ComplaintCreateSchema>;
type UpdateInput = InferType<typeof ComplaintUpdateSchema>;

const ComplaintForm = ({
  complaint,
  order,
  type,
  open = false,
  setOpen,
  mutate,
}: {
  complaint?: ComplaintCreate;
  order: Order;
  type: keyof typeof FormTypes;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  mutate?: (
    data?:
      | ComplaintCreate
      | ((current?: ComplaintCreate) => ComplaintCreate | undefined),
    options?: boolean | MutatorOptions<ComplaintCreate>,
  ) => Promise<ComplaintCreate | undefined>;
}) => {
  const { t, i18n } = useT();
  const { refreshOrders } = useOrders();
  const { filteredMembers } = useConfigurationMembers();
  const { supportTaxonomySettings } = useConfigurationSettings();
  const { channel } = useChannels();
  const tenantContext = useTenantContext();
  const complaintStatusOptions = useMemo(
    () => getComplaintStatusOptions(supportTaxonomySettings, t),
    [supportTaxonomySettings, t],
  );

  const carriedOutByOptions: SelectOption[] = filteredMembers
    ? filteredMembers.map(
        (member) =>
          ({
            label: member.name,
            value: member.name,
          }) as SelectOption,
      )
    : [];

  const orderItemOptions: SelectOption[] = order?.items
    ? order.items.map(
        (item: OrderItem) =>
          ({
            label: `${item.product?.name} (${item.quantity}x)`,
            value: item.id,
          }) as SelectOption,
      )
    : [];

  const label = `${t(`FormTypes.${type}`)} Reklamacja`;

  const CreateSchemaYupResolver = yupResolver(ComplaintCreateSchema);
  const UpdateSchemaYupResolver = yupResolver(ComplaintUpdateSchema);

  const CreateForm = useForm({
    defaultValues: initialValuesCreate(),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "CREATE",
  });

  const UpdateForm = useForm({
    defaultValues: complaint && initialValuesUpdate(complaint),
    resolver: UpdateSchemaYupResolver,
    disabled: type !== "UPDATE",
  });

  useEffect(() => {
    // Reset form when complaint changes
    if (type === "UPDATE" && complaint) {
      UpdateForm.reset(initialValuesUpdate(complaint));
    } else if (type === "CREATE") {
      CreateForm.reset(initialValuesCreate());
    }
  }, [CreateForm, UpdateForm, open, complaint, type]);

  if (isNull(channel)) return null;

  if (type === "CREATE" && CreateForm.formState.disabled) return null;
  if (type === "UPDATE" && UpdateForm.formState.disabled) return null;

  return (
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
        methods={type === "CREATE" ? CreateForm : UpdateForm}
        buttonLeftIcon={getIconByFormType(type)}
        buttonLabel={label}
        formData={complaintForm(
          orderItemOptions,
          carriedOutByOptions,
          t,
          complaintStatusOptions,
        )}
        update={type === "UPDATE"}
        handleSubmit={async (data) =>
          type === "CREATE"
            ? await handleCreateComplaint(
                data,
                order,
                channel,
                toaster,
                refreshOrders,
                setOpen,
                t,
              )
            : !isUndefined(complaint)
              ? await handleUpdateComplaint(
                  complaint.id,
                  data,
                  channel,
                  toaster,
                  mutate,
                  setOpen,
                  t,
                  tenantContext,
                )
              : toaster.error({
                  title: t("error.somethingWrong", {
                    defaultValue: "Something went wrong",
                  }),
                  description: t("complaint.notFound", {
                    defaultValue: "Complaint not found for editing",
                  }),
                  duration: 3000,
                })
        }
        By={<By update={type === "UPDATE"} />}
        t={t}
        i18n={i18n}
      />
    </Drawer>
  );
};

export const initialValuesCreate = (): CreateInput => {
  const values: CreateInput = {
    orderItemIds: [],
    description: "",
    status: ComplaintStatus.NEW,
    createdBy: {
      id: "",
      name: "",
    },
    carriedOutBy: [],
    active: true,
  };
  return values;
};

const handleCreateComplaint = async (
  data: CreateInput,
  order: Order,
  channel: Channel,
  toast: CreateToasterReturn,
  refreshOrders: () => void,
  setOpen: Dispatch<SetStateAction<boolean>>,
  t: (
    key: string,
    options?: { defaultValue?: string; error?: unknown },
  ) => string,
) => {
  try {
    if (process.env.NODE_ENV === "development") {
      console.log("complaint", data);
      toast.success({
        title: t("complaint.createdDev", {
          defaultValue: "Complaint created without saving (DEV)",
        }),
        description: t("complaint.createdDevDescription", {
          defaultValue: "Successfully created new complaint",
        }),
      });
      setOpen(false);
      return;
    }

    const result = await createComplaint({
      channelId: channel.id,
      orderId: order.id,
      data,
    });

    if (result.id) {
      refreshOrders();
      toast.success({
        title: t("complaint.created", { defaultValue: "Complaint created" }),
        description: t("complaint.createdDescription", {
          defaultValue: "Successfully created new complaint",
        }),
      });
      setOpen(false);
    } else {
      toast.error({
        title: t("error.somethingWrong", {
          defaultValue: "Something went wrong",
        }),
        description: t("complaint.notCreated", {
          defaultValue: "Complaint was not created",
        }),
      });
    }
  } catch (error) {
    console.error(error);
    toast.error({
      title: t("error.somethingWrong", {
        defaultValue: "Something went wrong",
      }),
      description: t("complaint.notCreatedError", {
        defaultValue: "Complaint was not created, error code: {{error}}",
        error,
      }),
    });
  }
};

export const initialValuesUpdate = (
  complaint?: ComplaintCreate,
): UpdateInput => {
  if (isUndefined(complaint))
    throw "complaint was not provided to initialValuesUpdate";

  const values: UpdateInput = {
    orderItemIds: complaint.orderItemIds || [],
    description: complaint.description || "",
    status: complaint.status || ComplaintStatus.NEW,
    updatedBy: {
      id: "",
      name: "",
    },
    carriedOutBy: complaint.carriedOutBy || [],
  };
  return values;
};

const handleUpdateComplaint = async (
  complaintId: string,
  data: UpdateInput,
  channel: Channel,
  toast: CreateToasterReturn,
  mutate?: (
    data?:
      | ComplaintCreate
      | ((current?: ComplaintCreate) => ComplaintCreate | undefined),
    options?: boolean | MutatorOptions<ComplaintCreate>,
  ) => Promise<ComplaintCreate | undefined>,
  setOpen?: Dispatch<SetStateAction<boolean>>,
  t?: (
    key: string,
    options?: { defaultValue?: string; error?: unknown },
  ) => string,
  tenantContext?: TenantContext,
) => {
  try {
    const timestampNow = Timestamp.now();
    const complaint: ComplaintUpdate = {
      orderItemIds: data.orderItemIds,
      description: data.description,
      status: data.status,
      updatedBy: data.updatedBy,
      updatedAt: timestampNow,
      carriedOutBy: data.carriedOutBy,
    };

    if (process.env.NODE_ENV === "development") {
      console.log("complaint", complaint);
      toast.success({
        title:
          t?.("complaint.updatedDev", {
            defaultValue: "Complaint updated without saving (DEV)",
          }) ?? "Complaint updated without saving (DEV)",
        description:
          t?.("complaint.updatedDevDescription", {
            defaultValue: "Successfully updated complaint",
          }) ?? "Successfully updated complaint",
      });
      if (setOpen) setOpen(false);
      return;
    }

    await update(
      complaint,
      db.doc(firestore, `/channels/${channel.id}/complaints`, complaintId),
      tenantContext,
    );

    // If mutate function is provided, update the SWR cache
    if (mutate) {
      await mutate((prevData?: ComplaintCreate) => {
        if (!prevData) return undefined;
        return {
          ...prevData,
          ...complaint,
        };
      }, false);
    }
    toast.success({
      title:
        t?.("complaint.updated", { defaultValue: "Complaint updated" }) ??
        "Complaint updated",
      description:
        t?.("complaint.updatedDescription", {
          defaultValue: "Successfully updated complaint",
        }) ?? "Successfully updated complaint",
    });

    if (setOpen) setOpen(false);
  } catch (error) {
    console.error(error);
    toast.error({
      title:
        t?.("error.somethingWrong", { defaultValue: "Something went wrong" }) ??
        "Something went wrong",
      description:
        t?.("complaint.notUpdatedError", {
          defaultValue: "Complaint was not updated, error code: {{error}}",
          error,
        }) ?? `Complaint was not updated, error code: ${error}`,
    });
  }
};

export default ComplaintForm;
