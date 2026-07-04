import { scheduleChangeLogAfterFormSubmit } from "@/actions/change-log";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { createChangeSnapshot } from "@/lib/change-snapshot";
import { firestore } from "@/lib/firebase/clientApp";
import { CreateToasterReturn } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import { create, db, update } from "@konfi/firebase";
import {
  Channel,
  EntityType,
  FormTypes,
  ProductType,
  TenantContext,
} from "@konfi/types";
import {
  generateKeywords,
  getIconByFormType,
  ProductTypeCreateSchema,
  productTypeForm,
  ProductTypeUpdateSchema,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { useConfiguration } from "context/configuration";
import { isNull, isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { Timestamp } from "firebase/firestore";
import { Dispatch, SetStateAction, useEffect } from "react";
import { useForm } from "react-hook-form";
import { InferType } from "yup";
import Drawer from "../Drawer";
import { Attributes } from "../form/field-controllers/Attributes";
import { By } from "../form/field-controllers/By";
import { ToChannel } from "../form/field-controllers/ToChannel";
import { TFunction } from "i18next";

type CreateInput = InferType<typeof ProductTypeCreateSchema>;
type UpdateInput = InferType<typeof ProductTypeUpdateSchema>;

export default function ProductTypesForm({
  productType,
  prefillProductType,
  menuItem,
  type,
  open,
  setOpen,
}: {
  productType?: ProductType;
  prefillProductType?: Partial<CreateInput>;
  menuItem?: boolean;
  type: keyof typeof FormTypes;
  open?: boolean;
  setOpen?: Dispatch<SetStateAction<boolean>>;
}) {
  const { t, i18n } = useT();
  const { refreshProductTypes } = useConfiguration();
  const { channel } = useChannels();
  const tenantContext = useTenantContext();
  const label = `${t(`FormTypes.${type}`)} Typ Produktu`;
  const CreateSchemaYupResolver = yupResolver(ProductTypeCreateSchema);
  const UpdateSchemaYupResolver = yupResolver(ProductTypeUpdateSchema);

  const CreateForm = useForm({
    defaultValues: initialValuesCreate(prefillProductType),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "CREATE",
  });

  const UpdateForm = useForm({
    defaultValues: productType && initialValuesUpdate(productType),
    resolver: UpdateSchemaYupResolver,
    disabled: type !== "UPDATE",
  });

  const DuplicateForm = useForm({
    defaultValues: productType && initialValuesDuplicate(productType),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "DUPLICATE",
  });

  // Reset forms when open state or productType changes
  useEffect(() => {
    if (type === "CREATE") {
      CreateForm.reset(initialValuesCreate(prefillProductType));
    } else if (type === "UPDATE" && productType) {
      UpdateForm.reset(initialValuesUpdate(productType));
    } else if (type === "DUPLICATE" && productType) {
      DuplicateForm.reset(initialValuesDuplicate(productType));
    }
  }, [
    CreateForm,
    UpdateForm,
    DuplicateForm,
    open,
    productType,
    prefillProductType,
    type,
  ]);

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
        formData={productTypeForm(t)}
        update={type === "UPDATE"}
        handleSubmit={async (data) =>
          type === "CREATE" || type === "DUPLICATE"
            ? await handleCreateProductType(
                data,
                refreshProductTypes,
                channel.id,
                toaster,
                t,
                tenantContext,
              )
            : !isUndefined(productType)
              ? await handleUpdateProductType(
                  productType.id,
                  productType,
                  data,
                  refreshProductTypes,
                  channel.id,
                  toaster,
                  t,
                  tenantContext,
                )
              : toaster.error({
                  title: t("errors.somethingWentWrong"),
                  description: t("errors.productType.notFound"),
                  duration: 3000,
                })
        }
        By={<By update={type === "UPDATE"} />}
        ToChannel={type === "DUPLICATE" && <ToChannel />}
        Attributes={Attributes}
        t={t}
        i18n={i18n}
      />
    </Drawer>
  );
}

const initialValuesCreate = (prefill?: Partial<CreateInput>) => {
  const values: CreateInput = {
    id: prefill?.id ?? "",
    name: prefill?.name ?? "",
    attributes: prefill?.attributes ?? [],
    isShippable: prefill?.isShippable ?? true,
    createdBy: {
      id: prefill?.createdBy?.id ?? "",
      name: prefill?.createdBy?.name ?? "",
    },
  };
  return values;
};

function scheduleProductTypeChangeLog(
  productTypeId: ProductType["id"],
  before: ProductType | null,
) {
  const beforeSnapshot = before ? createChangeSnapshot(before) : null;
  if (before && !beforeSnapshot) {
    console.error(
      "[ProductTypesForm] Failed to serialize previous product type",
      {
        productTypeId,
      },
    );
    return;
  }

  void scheduleChangeLogAfterFormSubmit({
    entityType: EntityType.ProductType,
    entityId: productTypeId,
    before: beforeSnapshot,
  }).catch((error) => {
    console.error("[ProductTypesForm] Failed to schedule change log", {
      error,
      productTypeId,
    });
  });
}

const handleCreateProductType = async (
  data: CreateInput,
  refreshProductTypes: () => void,
  channelId: Channel["id"],
  toaster: CreateToasterReturn,
  t: TFunction,
  tenantContext: TenantContext,
) => {
  try {
    const productType: ProductType = {
      id: data.id,
      name: data.name,
      attributes: data.attributes,
      isShippable: data.isShippable,
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
    const _channelId = !isUndefined(data?.toChannel?.id)
      ? data?.toChannel?.id
      : channelId;
    await create(
      firestore,
      productType,
      db.doc(firestore, "/productTypes", productType.id),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      tenantContext,
    );
    scheduleProductTypeChangeLog(productType.id, null);
    channelId === _channelId && refreshProductTypes();
    toaster.success({
      title: t("toasts.productType.created"),
      description: t("toasts.productType.createdDescription"),
    });
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("errors.somethingWentWrong"),
      description: t("toasts.productType.notCreated", { error }),
    });
  }
};

const initialValuesUpdate = (productType?: ProductType) => {
  if (isUndefined(productType))
    throw "productType was not provided to initialValuesUpdate";
  const values: UpdateInput = {
    id: productType.id ?? "",
    name: productType.name ?? "",
    attributes: !isEmpty(productType.attributes) ? productType.attributes : [],
    isShippable: productType.isShippable,
    updatedBy: {
      id: "",
      name: "",
    },
  };
  return values;
};

const handleUpdateProductType = async (
  productTypeId: ProductType["id"],
  previousProductType: ProductType,
  data: UpdateInput,
  refreshProductTypes: () => void,
  channelId: Channel["id"],
  toaster: CreateToasterReturn,
  t: TFunction,
  tenantContext: TenantContext,
) => {
  try {
    const productType: Partial<ProductType> = {
      name: data.name,
      attributes: data.attributes,
      isShippable: data.isShippable,
      updatedBy: {
        id: data.updatedBy.id,
        name: data.updatedBy.name,
      },
      updatedAt: Timestamp.now(),
      keywords: generateKeywords(data.name),
    };
    await update(
      productType,
      db.doc(firestore, "/productTypes", productTypeId),
      tenantContext,
    );
    scheduleProductTypeChangeLog(productTypeId, previousProductType);
    refreshProductTypes();
    toaster.success({
      title: t("toasts.productType.updated"),
      description: t("toasts.productType.updatedDescription", {
        name: productType.name,
      }),
    });
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("errors.somethingWentWrong"),
      description: t("toasts.productType.notUpdated", { error }),
    });
  }
};

const initialValuesDuplicate = (productType?: ProductType) => {
  if (isUndefined(productType))
    throw "productType was not provided to initialValuesUpdate";
  const values: CreateInput = {
    id: "",
    name: productType.name ?? "",
    attributes: !isEmpty(productType.attributes) ? productType.attributes : [],
    isShippable: productType.isShippable,
    createdBy: {
      id: "",
      name: "",
    },
  };
  return values;
};
