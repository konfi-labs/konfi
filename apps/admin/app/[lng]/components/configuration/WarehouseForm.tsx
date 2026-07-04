import { useTenantContext } from "@/context/tenant";
import { CreateToasterReturn } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { CustomDialog, FormController, toaster } from "@konfi/components";
import { create, db, update } from "@konfi/firebase";
import {
  Contact,
  CreateWarehouse,
  FormTypes,
  TenantContext,
  UpdateWarehouse,
  Warehouse,
} from "@konfi/types";
import {
  generateKeywords,
  getIconByFormType,
  WarehouseCreateSchema,
  warehouseForm,
  WarehouseUpdateSchema,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { useConfiguration } from "context/configuration";
import { isNull, isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { Timestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase/clientApp";
import { Dispatch, SetStateAction, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useT } from "@/i18n/client";
import { InferType } from "yup";
import { By } from "../form/field-controllers/By";
import { TFunction } from "i18next";
import DesignatedPickupAreasManager from "./DesignatedPickupAreasManager";

type CreateInput = InferType<typeof WarehouseCreateSchema>;
type UpdateInput = InferType<typeof WarehouseUpdateSchema>;

export default function WarehouseForm({
  warehouse,
  type,
  open,
  setOpen,
}: {
  warehouse?: Warehouse;
  type: keyof typeof FormTypes;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const { t, i18n } = useT();
  const { refreshWarehouses } = useConfiguration();
  const { channel } = useChannels();
  const tenantContext = useTenantContext();
  const label = `${t(`FormTypes.${type}`)} Magazyn`;
  const CreateSchemaYupResolver = yupResolver(WarehouseCreateSchema);
  const UpdateSchemaYupResolver = yupResolver(WarehouseUpdateSchema);

  const CreateForm = useForm({
    defaultValues: initialValuesCreate(),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "CREATE",
  });

  const UpdateForm = useForm({
    defaultValues: warehouse && initialValuesUpdate(warehouse),
    resolver: UpdateSchemaYupResolver,
    disabled: type !== "UPDATE",
  });

  const DuplicateForm = useForm({
    defaultValues: warehouse && initialValuesDuplicate(warehouse),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "DUPLICATE",
  });

  // Reset forms when open state or warehouse changes
  useEffect(() => {
    if (type === "CREATE") {
      CreateForm.reset(initialValuesCreate());
    } else if (type === "UPDATE" && warehouse) {
      UpdateForm.reset(initialValuesUpdate(warehouse));
    } else if (type === "DUPLICATE" && warehouse) {
      DuplicateForm.reset(initialValuesDuplicate(warehouse));
    }
  }, [CreateForm, UpdateForm, DuplicateForm, open, warehouse, type]);

  if (isNull(channel)) return null;

  if (type === "CREATE" && CreateForm.formState.disabled) return null;
  if (type === "UPDATE" && UpdateForm.formState.disabled) return null;
  if (type === "DUPLICATE" && DuplicateForm.formState.disabled) return null;

  return (
    <CustomDialog header={label} open={open} setOpen={setOpen} size={"xl"}>
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
        formData={warehouseForm(t)}
        update={type === "UPDATE"}
        handleSubmit={async (data) =>
          type === "CREATE" || type === "DUPLICATE"
            ? await handleCreateWarehouse(
                data,
                refreshWarehouses,
                toaster,
                t,
                tenantContext,
              )
            : !isUndefined(warehouse)
              ? await handleUpdateWarehouse(
                  warehouse.id,
                  data,
                  refreshWarehouses,
                  toaster,
                  t,
                  tenantContext,
                )
              : toaster.error({
                  title: t("errors.somethingWentWrong"),
                  description: t("errors.warehouse.notFound"),
                  duration: 3000,
                })
        }
        By={<By update={type === "UPDATE"} />}
        t={t}
        i18n={i18n}
      />
      {type === "UPDATE" && warehouse && (
        <DesignatedPickupAreasManager
          warehouseId={warehouse.id}
          warehouseName={warehouse.name}
        />
      )}
    </CustomDialog>
  );
}

const initialValuesCreate = () => {
  const values: CreateInput = {
    name: "",
    contacts: [
      {
        name: "",
        email: "",
        phone: "",
        active: true,
      },
    ],
    address: {
      name: "",
      type: "BILLING",
      street: "",
      number: "",
      local: "",
      zip: "",
      city: "",
      country: "",
      active: true,
    },
    createdBy: {
      id: "",
      name: "",
    },
  };
  return values;
};

const handleCreateWarehouse = async (
  data: CreateInput,
  refreshWarehouses: () => void,
  toaster: CreateToasterReturn,
  t: TFunction,
  tenantContext: TenantContext,
) => {
  try {
    const warehouse: CreateWarehouse = {
      id: "",
      name: data.name,
      contacts: data.contacts,
      address: data.address ?? null,
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
      warehouse,
      undefined,
      db.collection(firestore, "/warehouses"),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      tenantContext,
    );
    refreshWarehouses();
    toaster.success({
      title: t("toasts.warehouse.created"),
      description: t("toasts.warehouse.createdDescription"),
    });
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("errors.somethingWentWrong"),
      description: t("toasts.warehouse.notCreated", { error }),
    });
  }
};

const initialValuesUpdate = (warehouse?: Warehouse) => {
  if (isUndefined(warehouse))
    throw "warehouse was not provided to initialValuesUpdate";
  const values: UpdateInput = {
    name: warehouse.name,
    contacts:
      Array.isArray(warehouse.contacts) && !isEmpty(warehouse.contacts)
        ? warehouse.contacts
        : [
            {
              name: "",
              email: "",
              phone: "",
              active: false,
            } as Contact,
          ],
    address: warehouse.address,
    updatedBy: warehouse.updatedBy,
  };
  return values;
};

const handleUpdateWarehouse = async (
  warehouseId: Warehouse["id"],
  data: UpdateInput,
  refreshWarehouses: () => void,
  toaster: CreateToasterReturn,
  t: TFunction,
  tenantContext: TenantContext,
) => {
  try {
    const warehouse: UpdateWarehouse = {
      name: data.name,
      contacts: data.contacts,
      address: data.address,
      updatedBy: {
        id: data.updatedBy.id,
        name: data.updatedBy.name,
      },
      updatedAt: Timestamp.now(),
      keywords: generateKeywords(data.name),
    };
    await update(
      warehouse,
      db.doc(firestore, "/warehouses", warehouseId),
      tenantContext,
    );
    refreshWarehouses();
    toaster.success({
      title: t("toasts.warehouse.updated"),
      description: t("toasts.warehouse.updatedDescription", {
        name: data.name,
      }),
    });
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("errors.somethingWentWrong"),
      description: t("toasts.warehouse.notUpdated", { error }),
    });
  }
};

const initialValuesDuplicate = (warehouse?: Warehouse) => {
  if (isUndefined(warehouse))
    throw "warehouse was not provided to initialValuesUpdate";
  const values: CreateInput = {
    name: warehouse.name ?? "",
    contacts:
      Array.isArray(warehouse.contacts) && !isEmpty(warehouse.contacts)
        ? warehouse.contacts
        : [
            {
              name: "",
              email: "",
              phone: "",
              active: false,
            },
          ],
    address: {
      name: warehouse.address?.name ?? "",
      type: warehouse.address?.type ?? "BILLING",
      street: warehouse.address?.street ?? "",
      number: warehouse.address?.number ?? "",
      local: warehouse.address?.local ?? "",
      zip: warehouse.address?.zip ?? "",
      city: warehouse.address?.city ?? "",
      country: warehouse.address?.country ?? "",
      active: warehouse.address?.active ?? true,
    },
    createdBy: {
      id: "",
      name: "",
    },
  };
  return values;
};
