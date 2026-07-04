import { useTenantContext } from "@/context/tenant";
import { CreateToasterReturn } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { CustomDialog, FormController, toaster } from "@konfi/components";
import { create, db, update } from "@konfi/firebase";
import {
  CreateDesignatedPickupArea,
  DesignatedPickupArea,
  FormTypes,
  TenantContext,
  UpdateDesignatedPickupArea,
} from "@konfi/types";
import {
  generateKeywords,
  getIconByFormType,
  DesignatedPickupAreaCreateSchema,
  designatedPickupAreaForm,
  DesignatedPickupAreaUpdateSchema,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { useConfiguration } from "context/configuration";
import { isNull, isUndefined } from "es-toolkit";
import { Timestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase/clientApp";
import { Dispatch, SetStateAction, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useT } from "@/i18n/client";
import { InferType } from "yup";
import { By } from "../form/field-controllers/By";
import { TFunction } from "i18next";

type CreateInput = InferType<typeof DesignatedPickupAreaCreateSchema>;
type UpdateInput = InferType<typeof DesignatedPickupAreaUpdateSchema>;

export default function DesignatedPickupAreaForm({
  pickupArea,
  warehouseId,
  type,
  open,
  setOpen,
}: {
  pickupArea?: DesignatedPickupArea;
  warehouseId: string;
  type: keyof typeof FormTypes;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const { t, i18n } = useT();
  const { refreshWarehouses } = useConfiguration();
  const { channel } = useChannels();
  const tenantContext = useTenantContext();
  const label = `${t(`FormTypes.${type}`)} ${t("admin.designatedPickupArea", { defaultValue: "Designated Pickup Area" })}`;
  const CreateSchemaYupResolver = yupResolver(DesignatedPickupAreaCreateSchema);
  const UpdateSchemaYupResolver = yupResolver(DesignatedPickupAreaUpdateSchema);

  const CreateForm = useForm({
    defaultValues: initialValuesCreate(warehouseId),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "CREATE",
  });

  const UpdateForm = useForm({
    defaultValues: pickupArea && initialValuesUpdate(pickupArea),
    resolver: UpdateSchemaYupResolver,
    disabled: type !== "UPDATE",
  });

  const DuplicateForm = useForm({
    defaultValues:
      pickupArea && initialValuesDuplicate(pickupArea, warehouseId),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "DUPLICATE",
  });

  // Reset forms when open state or pickup area changes
  useEffect(() => {
    if (type === "CREATE") {
      CreateForm.reset(initialValuesCreate(warehouseId));
    } else if (type === "UPDATE" && pickupArea) {
      UpdateForm.reset(initialValuesUpdate(pickupArea));
    } else if (type === "DUPLICATE" && pickupArea) {
      DuplicateForm.reset(initialValuesDuplicate(pickupArea, warehouseId));
    }
  }, [
    CreateForm,
    UpdateForm,
    DuplicateForm,
    open,
    pickupArea,
    type,
    warehouseId,
  ]);

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
        formData={designatedPickupAreaForm(t)}
        update={type === "UPDATE"}
        handleSubmit={async (data) =>
          type === "CREATE" || type === "DUPLICATE"
            ? await handleCreatePickupArea(
                data,
                refreshWarehouses,
                toaster,
                t,
                tenantContext,
              )
            : !isUndefined(pickupArea)
              ? handleUpdatePickupArea(
                  pickupArea.id,
                  data,
                  refreshWarehouses,
                  toaster,
                  t,
                  tenantContext,
                )
              : toaster.error({
                  title: t("errors.somethingWentWrong"),
                  description: t("errors.pickupArea.notFound", {
                    defaultValue: "Pickup area not found",
                  }),
                  duration: 3000,
                })
        }
        By={<By update={type === "UPDATE"} />}
        t={t}
        i18n={i18n}
      />
    </CustomDialog>
  );
}

const initialValuesCreate = (warehouseId: string) => {
  const values: CreateInput = {
    name: "",
    warehouseId: warehouseId,
    description: "",
    shippingOptions: [],
    createdBy: {
      id: "",
      name: "",
    },
  };
  return values;
};

const handleCreatePickupArea = async (
  data: CreateInput,
  refreshWarehouses: () => void,
  toaster: CreateToasterReturn,
  t: TFunction,
  tenantContext: TenantContext,
) => {
  try {
    const pickupArea: CreateDesignatedPickupArea = {
      id: "",
      name: data.name,
      warehouseId: data.warehouseId,
      description: data.description,
      shippingOptions: data.shippingOptions,
      createdBy: {
        id: data.createdBy.id,
        name: data.createdBy.name,
      },
      createdAt: Timestamp.now(),
      updatedBy: {
        id: data.createdBy.id,
        name: data.createdBy.name,
      },
      updatedAt: Timestamp.now(),
      keywords: generateKeywords(data.name),
      active: true,
    };
    await create(
      firestore,
      pickupArea,
      undefined,
      db.collection(firestore, "/designatedPickupAreas"),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      tenantContext,
    );
    refreshWarehouses();
    toaster.success({
      title: t("toasts.pickupArea.created", {
        defaultValue: "Pickup area created",
      }),
      description: t("toasts.pickupArea.createdDescription", {
        defaultValue: "Pickup area has been created successfully.",
      }),
    });
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("errors.somethingWentWrong"),
      description: t("toasts.pickupArea.notCreated", {
        defaultValue: "Could not create pickup area",
      }),
    });
  }
};

const initialValuesUpdate = (pickupArea?: DesignatedPickupArea) => {
  if (isUndefined(pickupArea))
    throw "pickupArea was not provided to initialValuesUpdate";
  const values: UpdateInput = {
    name: pickupArea.name,
    warehouseId: pickupArea.warehouseId,
    description: pickupArea.description || "",
    shippingOptions: pickupArea.shippingOptions || [],
    updatedBy: pickupArea.updatedBy,
  };
  return values;
};

const handleUpdatePickupArea = async (
  pickupAreaId: DesignatedPickupArea["id"],
  data: UpdateInput,
  refreshWarehouses: () => void,
  toaster: CreateToasterReturn,
  t: TFunction,
  tenantContext: TenantContext,
) => {
  try {
    const pickupArea: UpdateDesignatedPickupArea = {
      name: data.name,
      warehouseId: data.warehouseId,
      description: data.description,
      shippingOptions: data.shippingOptions,
      updatedBy: {
        id: data.updatedBy.id,
        name: data.updatedBy.name,
      },
      updatedAt: Timestamp.now(),
      keywords: generateKeywords(data.name),
    };
    await update(
      pickupArea,
      db.doc(firestore, "/designatedPickupAreas", pickupAreaId),
      tenantContext,
    );
    refreshWarehouses();
    toaster.success({
      title: t("toasts.pickupArea.updated", {
        defaultValue: "Pickup area updated",
      }),
      description: t("toasts.pickupArea.updatedDescription", {
        defaultValue: "Pickup area has been updated successfully.",
      }),
    });
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("errors.somethingWentWrong"),
      description: t("toasts.pickupArea.notUpdated", {
        defaultValue: "Could not update pickup area",
      }),
    });
  }
};

const initialValuesDuplicate = (
  pickupArea?: DesignatedPickupArea,
  warehouseId?: string,
) => {
  if (isUndefined(pickupArea))
    throw "pickupArea was not provided to initialValuesDuplicate";
  const values: CreateInput = {
    name: pickupArea.name ?? "",
    warehouseId: warehouseId || pickupArea.warehouseId,
    description: pickupArea.description ?? "",
    shippingOptions: pickupArea.shippingOptions ?? [],
    createdBy: {
      id: "",
      name: "",
    },
  };
  return values;
};
