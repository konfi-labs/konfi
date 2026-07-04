import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import { create, db, update } from "@konfi/firebase";
import { CustomerGroup, FormTypes, TenantContext } from "@konfi/types";
import {
  CustomerGroupCreateSchema,
  customerGroupForm,
  CustomerGroupUpdateSchema,
  getIconByFormType,
} from "@konfi/utils";
import { isUndefined } from "es-toolkit";
import { Timestamp } from "firebase/firestore";
import type { TFunction } from "i18next";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import type { InferType } from "yup";
import Drawer from "../Drawer";
import { By } from "../form/field-controllers/By";

type CreateInput = InferType<typeof CustomerGroupCreateSchema>;
type UpdateInput = InferType<typeof CustomerGroupUpdateSchema>;

export default function CustomerGroupForm({
  customerGroup,
  type,
  open,
  setOpen,
  onSuccess,
}: {
  customerGroup?: CustomerGroup;
  type: keyof typeof FormTypes;
  open?: boolean;
  setOpen?: Dispatch<SetStateAction<boolean>>;
  onSuccess?: () => void;
}) {
  const { t, i18n } = useT();
  const tenantContext = useTenantContext();
  const label = t(`customerGroups.form.${type.toLowerCase()}`, {
    defaultValue:
      type === "CREATE"
        ? "Create customer group"
        : type === "DUPLICATE"
          ? "Duplicate customer group"
          : "Edit customer group",
  });
  const createSchemaYupResolver = yupResolver(CustomerGroupCreateSchema);
  const updateSchemaYupResolver = yupResolver(CustomerGroupUpdateSchema);
  const lastResetRef = useRef<{
    customerGroup?: CustomerGroup;
    type: keyof typeof FormTypes;
  } | null>(null);

  const createForm = useForm<CreateInput>({
    defaultValues: initialValuesCreate(),
    resolver: createSchemaYupResolver,
    disabled: type !== "CREATE",
  });

  const updateForm = useForm<UpdateInput>({
    defaultValues: customerGroup && initialValuesUpdate(customerGroup),
    resolver: updateSchemaYupResolver,
    disabled: type !== "UPDATE",
  });

  const duplicateForm = useForm<CreateInput>({
    defaultValues: customerGroup && initialValuesDuplicate(customerGroup),
    resolver: createSchemaYupResolver,
    disabled: type !== "DUPLICATE",
  });

  useEffect(() => {
    if (!open) {
      lastResetRef.current = null;
      return;
    }

    const lastReset = lastResetRef.current;
    if (lastReset?.type === type && lastReset.customerGroup === customerGroup) {
      return;
    }

    if (type === "UPDATE" && customerGroup) {
      updateForm.reset(initialValuesUpdate(customerGroup));
    } else if (type === "DUPLICATE" && customerGroup) {
      duplicateForm.reset(initialValuesDuplicate(customerGroup));
    } else if (type === "CREATE") {
      createForm.reset(initialValuesCreate());
    }

    lastResetRef.current = {
      customerGroup,
      type,
    };
  }, [createForm, duplicateForm, updateForm, open, customerGroup, type]);

  if (type === "CREATE" && createForm.formState.disabled) return null;
  if (type === "UPDATE" && updateForm.formState.disabled) return null;
  if (type === "DUPLICATE" && duplicateForm.formState.disabled) return null;

  return (
    <Drawer
      header={label}
      size="md"
      open={open}
      setOpen={setOpen}
      lazyMount
      unmountOnExit
    >
      <FormController
        methods={
          type === "CREATE"
            ? createForm
            : type === "UPDATE"
              ? updateForm
              : duplicateForm
        }
        buttonLeftIcon={getIconByFormType(type)}
        buttonLabel={label}
        formData={customerGroupForm(t)}
        update={type === "UPDATE"}
        handleSubmit={async (data) =>
          type === "CREATE" || type === "DUPLICATE"
            ? await handleCreateCustomerGroup(t, data, tenantContext, onSuccess)
            : !isUndefined(customerGroup)
              ? await handleUpdateCustomerGroup(
                  t,
                  customerGroup.id,
                  data,
                  tenantContext,
                  onSuccess,
                )
              : toaster.error({
                  title: t("errors.somethingWentWrong", {
                    defaultValue: "Something went wrong",
                  }),
                  description: t("customerGroups.notFound", {
                    defaultValue: "Customer group was not found.",
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
}

const initialValuesCreate = (): CreateInput => ({
  name: "",
  description: "",
  customerIds: [],
  createdBy: {
    id: "",
    name: "",
  },
});

const initialValuesUpdate = (customerGroup: CustomerGroup): UpdateInput => ({
  id: customerGroup.id,
  name: customerGroup.name,
  description: customerGroup.description ?? "",
  customerIds: customerGroup.customerIds ?? [],
  archivedAt: customerGroup.archivedAt ?? null,
  updatedBy: customerGroup.updatedBy,
});

const initialValuesDuplicate = (customerGroup: CustomerGroup): CreateInput => ({
  name: customerGroup.name ?? "",
  description: customerGroup.description ?? "",
  customerIds: [],
  createdBy: {
    id: "",
    name: "",
  },
});

const handleCreateCustomerGroup = async (
  t: TFunction,
  data: CreateInput,
  tenantContext: TenantContext,
  onSuccess?: () => void,
) => {
  try {
    const customerGroup = {
      id: "",
      name: data.name,
      description: data.description ?? null,
      customerIds: data.customerIds ?? [],
      active: true,
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
    };

    await create(
      firestore,
      customerGroup,
      undefined,
      db.collection(firestore, "/customerGroups"),
      db.collection(firestore, "/customerGroups"),
      undefined,
      undefined,
      undefined,
      undefined,
      tenantContext,
    );
    if (onSuccess) onSuccess();
    toaster.success({
      title: t("customerGroups.created", {
        defaultValue: "Customer group created",
      }),
      description: t("customerGroups.createdDescription", {
        defaultValue: "{{name}} is ready for customer assignments.",
        name: data.name,
      }),
    });
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("errors.somethingWentWrong", {
        defaultValue: "Something went wrong",
      }),
      description: t("customerGroups.notCreated", {
        defaultValue: "Customer group could not be created.",
      }),
    });
  }
};

const handleUpdateCustomerGroup = async (
  t: TFunction,
  customerGroupId: CustomerGroup["id"],
  data: UpdateInput,
  tenantContext: TenantContext,
  onSuccess?: () => void,
) => {
  try {
    const customerGroup = {
      id: customerGroupId,
      name: data.name,
      description: data.description ?? null,
      customerIds: data.customerIds ?? [],
      archivedAt: data.archivedAt ?? null,
      updatedBy: {
        id: data.updatedBy.id,
        name: data.updatedBy.name,
      },
      updatedAt: Timestamp.now(),
    };

    await update(
      customerGroup,
      db.doc(firestore, "/customerGroups", customerGroupId),
      tenantContext,
    );
    if (onSuccess) onSuccess();
    toaster.success({
      title: t("customerGroups.updated", {
        defaultValue: "Customer group updated",
      }),
      description: t("customerGroups.updatedDescription", {
        defaultValue: "{{name}} was updated.",
        name: data.name,
      }),
    });
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("errors.somethingWentWrong", {
        defaultValue: "Something went wrong",
      }),
      description: t("customerGroups.notUpdated", {
        defaultValue: "Customer group could not be updated.",
      }),
    });
  }
};
