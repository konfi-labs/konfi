import { useTenantContext } from "@/context/tenant";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import { create, db, update } from "@konfi/firebase";
import {
  Supplier,
  SupplierCreate,
  SupplierUpdate,
  FormTypes,
  TenantContext,
} from "@konfi/types";
import {
  addressInitialValues,
  contactIntialValues,
  SupplierCreateSchema,
  supplierForm,
  SupplierUpdateSchema,
  generateKeywords,
  getIconByFormType,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { useSuppliers } from "context/suppliers";
import { isNull, isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { Timestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase/clientApp";
import { Dispatch, SetStateAction, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useT } from "@/i18n/client";
import { InferType } from "yup";
import Drawer from "../Drawer";
import { By } from "../form/field-controllers/By";
import { TFunction } from "i18next";

type CreateInput = InferType<typeof SupplierCreateSchema>;
type UpdateInput = InferType<typeof SupplierUpdateSchema>;

export default function SupplierForm({
  supplier,
  type,
  open,
  setOpen,
  onSuccess,
  prefill,
}: {
  supplier?: Supplier;
  type: keyof typeof FormTypes;
  open?: boolean;
  setOpen?: Dispatch<SetStateAction<boolean>>;
  onSuccess?: (created?: { name: string; nip?: string }) => void;
  prefill?: Partial<CreateInput>;
}) {
  const { t, i18n } = useT();
  const { refreshSuppliers } = useSuppliers();
  const { channel } = useChannels();
  const tenantContext = useTenantContext();
  const label = `${t(`FormTypes.${type}`)} Dostawcę`;
  const CreateSchemaYupResolver = yupResolver(SupplierCreateSchema);
  const UpdateSchemaYupResolver = yupResolver(SupplierUpdateSchema);

  const CreateForm = useForm({
    defaultValues: { ...initialValuesCreate(), ...(prefill ?? {}) },
    resolver: CreateSchemaYupResolver,
    disabled: type !== "CREATE",
  });

  const UpdateForm = useForm({
    defaultValues: supplier && initialValuesUpdate(supplier),
    resolver: UpdateSchemaYupResolver,
    disabled: type !== "UPDATE",
  });

  const DuplicateForm = useForm({
    defaultValues: supplier && initialValuesDuplicate(supplier),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "DUPLICATE",
  });

  useEffect(() => {
    // Reset form when supplier changes
    if (type === "UPDATE" && supplier) {
      UpdateForm.reset(initialValuesUpdate(supplier));
    } else if (type === "DUPLICATE" && supplier) {
      DuplicateForm.reset(initialValuesDuplicate(supplier));
    } else if (type === "CREATE") {
      CreateForm.reset({ ...initialValuesCreate(), ...(prefill ?? {}) });
    }
  }, [CreateForm, DuplicateForm, UpdateForm, open, prefill, supplier, type]);

  if (isNull(channel)) return null;
  if (type === "CREATE" && CreateForm.formState.disabled) return null;
  if (type === "UPDATE" && UpdateForm.formState.disabled) return null;
  if (type === "DUPLICATE" && DuplicateForm.formState.disabled) return null;

  return (
    <Drawer header={label} size={"xl"} open={open} setOpen={setOpen}>
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
        formData={supplierForm(t)}
        update={type === "UPDATE"}
        handleSubmit={async (data) =>
          type === "CREATE" || type === "DUPLICATE"
            ? await handleCreateSupplier(
                t,
                data,
                refreshSuppliers,
                tenantContext,
                onSuccess
                  ? (created) => onSuccess(created)
                  : undefined,
              )
            : !isUndefined(supplier)
              ? await handleUpdateSupplier(
                  t,
                  supplier.id,
                  data,
                  refreshSuppliers,
                  tenantContext,
                  onSuccess,
                )
              : toaster.error({
                  title: t("errors.somethingWentWrong"),
                  description: t("errors.supplier.notFound"),
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

const handleCreateSupplier = async (
  t: TFunction,
  data: CreateInput,
  refreshSuppliers: () => void,
  tenantContext: TenantContext,
  onSuccess?: (created?: { name: string; nip?: string }) => void,
) => {
  try {
    const supplier: SupplierCreate = {
      id: "",
      name: data.name,
      companyName: data.companyName,
      contactPerson: data.contactPerson,
      email: data.email,
      phone: data.phone,
      website: data.website,
      nip: data.nip,
      regon: data.regon,
      krs: data.krs,
      contacts: data.contacts,
      addresses: data.addresses,
      specialNotes: data.specialNotes,
      paymentTerms: data.paymentTerms,
      currency: data.currency,
      isPreferred: data.isPreferred,
      rating: data.rating,
      leadTime: data.leadTime,
      minimumOrder: data.minimumOrder,
      supplierCode: data.supplierCode,
      linkedProductsIds: [],
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
      supplier,
      undefined,
      db.collection(firestore, "/suppliers"),
      db.collection(firestore, "/suppliers"),
      undefined,
      undefined,
      undefined,
      undefined,
      tenantContext,
    );
    refreshSuppliers();
    if (onSuccess)
      onSuccess({
        name: data.name,
        ...(data.nip ? { nip: data.nip } : {}),
      });
    toaster.success({
      title: t("toasts.supplier.created"),
      description: t("toasts.supplier.createdDescription"),
    });
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("errors.somethingWentWrong"),
      description: t("toasts.supplier.notCreated", { error }),
    });
  }
};

const initialValuesUpdate = (supplier?: Supplier) => {
  if (isUndefined(supplier))
    throw "supplier was not provided to initialValuesUpdate";
  const values: UpdateInput = {
    name: supplier.name,
    companyName: supplier.companyName,
    contactPerson: supplier.contactPerson,
    email: supplier.email,
    phone: supplier.phone,
    website: supplier.website,
    nip: supplier.nip,
    regon: supplier.regon,
    krs: supplier.krs,
    contacts:
      Array.isArray(supplier.contacts) && !isEmpty(supplier.contacts)
        ? supplier.contacts
        : [contactIntialValues],
    addresses:
      Array.isArray(supplier.addresses) && !isEmpty(supplier.addresses)
        ? supplier.addresses
        : [addressInitialValues],
    specialNotes: supplier.specialNotes,
    paymentTerms: supplier.paymentTerms,
    currency: supplier.currency,
    isPreferred: supplier.isPreferred,
    rating: supplier.rating,
    leadTime: supplier.leadTime,
    minimumOrder: supplier.minimumOrder,
    supplierCode: supplier.supplierCode,
    updatedBy: {
      id: supplier.updatedBy.id,
      name: supplier.updatedBy.name,
    },
  };
  return values;
};

const handleUpdateSupplier = async (
  t: TFunction,
  supplierId: string,
  data: UpdateInput,
  refreshSuppliers: () => void,
  tenantContext: TenantContext,
  onSuccess?: (created?: { name: string; nip?: string }) => void,
) => {
  try {
    const supplier: SupplierUpdate = {
      name: data.name,
      companyName: data.companyName,
      contactPerson: data.contactPerson,
      email: data.email,
      phone: data.phone,
      website: data.website,
      nip: data.nip,
      regon: data.regon,
      krs: data.krs,
      contacts: data.contacts,
      addresses: data.addresses,
      specialNotes: data.specialNotes,
      paymentTerms: data.paymentTerms,
      currency: data.currency,
      isPreferred: data.isPreferred,
      rating: data.rating,
      leadTime: data.leadTime,
      minimumOrder: data.minimumOrder,
      supplierCode: data.supplierCode,
      updatedBy: {
        id: data.updatedBy.id,
        name: data.updatedBy.name,
      },
      updatedAt: Timestamp.now(),
      keywords: generateKeywords(data.name),
    };
    await update(
      supplier,
      db.doc(firestore, "/suppliers", supplierId),
      tenantContext,
    );
    refreshSuppliers();
    if (onSuccess) onSuccess();
    toaster.success({
      title: t("toasts.supplier.updated"),
      description: t("toasts.supplier.updatedDescription", { name: data.name }),
    });
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("errors.somethingWentWrong"),
      description: t("toasts.supplier.notUpdated", { error }),
    });
  }
};

const initialValuesDuplicate = (supplier?: Supplier) => {
  if (isUndefined(supplier))
    throw "supplier was not provided to initialValuesUpdate";
  const values: CreateInput = {
    name: supplier.name ?? "",
    companyName: supplier.companyName ?? "",
    contactPerson: supplier.contactPerson ?? "",
    email: supplier.email ?? "",
    phone: supplier.phone ?? "",
    website: supplier.website ?? "",
    nip: supplier.nip ?? "",
    regon: supplier.regon ?? "",
    krs: supplier.krs ?? "",
    contacts:
      Array.isArray(supplier.contacts) && !isEmpty(supplier.contacts)
        ? supplier.contacts
        : [contactIntialValues],
    addresses:
      Array.isArray(supplier.addresses) && !isEmpty(supplier.addresses)
        ? supplier.addresses
        : [addressInitialValues],
    specialNotes: supplier.specialNotes ?? "",
    paymentTerms: supplier.paymentTerms ?? "",
    currency: supplier.currency ?? "",
    isPreferred: supplier.isPreferred ?? false,
    rating: supplier.rating ?? undefined,
    leadTime: supplier.leadTime ?? undefined,
    minimumOrder: supplier.minimumOrder ?? undefined,
    supplierCode: supplier.supplierCode ?? "",
    createdBy: {
      id: supplier.createdBy.id,
      name: supplier.createdBy.name,
    },
  };
  return values;
};

const initialValuesCreate = () => {
  const values: CreateInput = {
    name: "",
    companyName: "",
    contactPerson: "",
    email: "",
    phone: "",
    website: "",
    nip: "",
    regon: "",
    krs: "",
    contacts: [contactIntialValues],
    addresses: [addressInitialValues],
    specialNotes: "",
    paymentTerms: "",
    currency: "",
    isPreferred: false,
    rating: undefined,
    leadTime: undefined,
    minimumOrder: undefined,
    supplierCode: "",
    createdBy: {
      id: "",
      name: "",
    },
  };
  return values;
};
