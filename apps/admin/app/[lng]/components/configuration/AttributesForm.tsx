import { ensureEntityTranslationsAction } from "@/actions/managed-translations";
import { scheduleChangeLogAfterFormSubmit } from "@/actions/change-log";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { createChangeSnapshot } from "@/lib/change-snapshot";
import { firestore } from "@/lib/firebase/clientApp";
import { CreateToasterReturn } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import { create, db, getAttributeTranslations, update } from "@konfi/firebase";
import {
  Attribute,
  AttributeInputTypeEnum,
  CreateAttribute,
  EntityType,
  FormTypes,
  Option,
  TenantContext,
  UpdateAttribute,
} from "@konfi/types";
import {
  AttributeCreateSchema,
  attributeForm,
  AttributeUpdateSchema,
  generateKeywords,
  getIconByFormType,
  hasDuplicateIds,
} from "@konfi/utils";
import { useConfiguration } from "context/configuration";
import { isUndefined } from "es-toolkit";
import { Timestamp } from "firebase/firestore";
import type { TFunction } from "i18next";
import { Dispatch, SetStateAction, useEffect } from "react";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import { InferType } from "yup";
import Drawer from "../Drawer";
import { By } from "../form/field-controllers/By";
import { TranslationPanel } from "../translations/TranslationPanel";
import { AttributesTranslationForm } from "./AttributesTranslationForm";

type CreateInput = InferType<typeof AttributeCreateSchema>;
type UpdateInput = InferType<typeof AttributeUpdateSchema>;

export interface AttributePrefillData {
  name?: string;
  type?: string;
  options?: Array<{ label: string; value: string }>;
}

export default function AttributesForm({
  attribute,
  menuItem,
  type,
  open,
  setOpen,
  prefillData,
}: {
  attribute?: Attribute;
  menuItem?: boolean;
  type: keyof typeof FormTypes;
  open?: boolean;
  setOpen?: Dispatch<SetStateAction<boolean>>;
  prefillData?: AttributePrefillData;
}) {
  const { t, i18n } = useT();
  const { refreshAttributes } = useConfiguration();
  const tenantContext = useTenantContext();
  const label = `${t(`FormTypes.${type}`)} ${t("ROUTES.attributes", { defaultValue: "Attribute" })}`;
  const CreateSchemaYupResolver = yupResolver(AttributeCreateSchema);
  const UpdateSchemaYupResolver = yupResolver(AttributeUpdateSchema);

  const { data: translations, mutate: mutateTranslations } = useSWR(
    attribute ? [attribute] : null,
    ([attribute]) => getAttributeTranslations(firestore, attribute.id),
  );

  const CreateForm = useForm({
    defaultValues: initialValuesCreate(prefillData),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "CREATE",
  });

  const UpdateForm = useForm({
    defaultValues: attribute && initialValuesUpdate(attribute),
    resolver: UpdateSchemaYupResolver,
    disabled: type !== "UPDATE",
  });

  const DuplicateForm = useForm({
    defaultValues: attribute && initialValuesDuplicate(attribute),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "DUPLICATE",
  });

  // Reset forms when open state or attribute changes
  useEffect(() => {
    if (type === "CREATE") {
      CreateForm.reset(initialValuesCreate(prefillData));
    } else if (type === "UPDATE" && attribute) {
      UpdateForm.reset(initialValuesUpdate(attribute));
    } else if (type === "DUPLICATE" && attribute) {
      DuplicateForm.reset(initialValuesDuplicate(attribute));
    }
  }, [
    CreateForm,
    UpdateForm,
    DuplicateForm,
    open,
    attribute,
    type,
    prefillData,
  ]);

  if (type === "CREATE" && CreateForm.formState.disabled) return null;
  if (type === "UPDATE" && UpdateForm.formState.disabled) return null;
  if (type === "DUPLICATE" && DuplicateForm.formState.disabled) return null;

  return (
    <Drawer
      header={label}
      size={"xl"}
      closeOnOverlayClick={false}
      open={open}
      setOpen={setOpen}
    >
      {attribute && translations && (
        <TranslationPanel
          kind="attribute"
          source={attribute}
          translationRef={{
            kind: "attribute",
            entityId: attribute.id,
          }}
          translations={translations}
          onMutate={mutateTranslations}
          renderForm={({ locale, translation, type }) => (
            <AttributesTranslationForm
              key={locale}
              attribute={attribute}
              locale={locale}
              type={type}
              translation={translation}
              mutateTranslations={mutateTranslations}
            />
          )}
        />
      )}
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
        formData={attributeForm(t)}
        update={type === "UPDATE"}
        handleSubmit={async (data) =>
          type === "CREATE" || type === "DUPLICATE"
            ? await handleCreateAttribute(
                data,
                refreshAttributes,
                toaster,
                t,
                tenantContext,
              )
            : !isUndefined(attribute)
              ? await handleUpdateAttribute(
                  attribute.id,
                  attribute,
                  data,
                  refreshAttributes,
                  toaster,
                  t,
                  tenantContext,
                )
              : toaster.error({
                  title: t("errors.somethingWentWrong"),
                  description: t("errors.attribute.notFound"),
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

const buildDefaultAdvancedPreset = (): Option["advancedPreset"] => ({
  reinforcementSides: [],
  tunnelSides: [],
  grommets: {
    sides: [],
    spacing: 50,
    offsetStart: 0,
    offsetEnd: 0,
  },
  cutToSize: false,
});

const buildDefaultOption = (): Option => ({
  label: "",
  value: "",
  customFormat: false,
  hidden: false,
  formatWidth: null,
  formatHeight: null,
  unitsPerSheet: null,
  pages: null,
  cost: null,
  advancedPreset: buildDefaultAdvancedPreset(),
});

function scheduleAttributeChangeLog(
  attributeId: Attribute["id"],
  before: Attribute | null,
) {
  const beforeSnapshot = before ? createChangeSnapshot(before) : null;
  if (before && !beforeSnapshot) {
    console.error("[AttributesForm] Failed to serialize previous attribute", {
      attributeId,
    });
    return;
  }

  void scheduleChangeLogAfterFormSubmit({
    entityType: EntityType.Attribute,
    entityId: attributeId,
    before: beforeSnapshot,
  }).catch((error) => {
    console.error("[AttributesForm] Failed to schedule change log", {
      error,
      attributeId,
    });
  });
}

const buildDefaultAdvancedOptions = (): Option[] => [
  {
    ...buildDefaultOption(),
    label: "Custom finishing",
    value: "custom",
  },
  {
    ...buildDefaultOption(),
    label: "Reinforcement + grommets every 50cm",
    value: "reinforcementGrommets50",
    advancedPreset: {
      reinforcementSides: ["top", "right", "bottom", "left"],
      grommets: {
        sides: ["top", "right", "bottom", "left"],
        spacing: 50,
        offsetStart: 0,
        offsetEnd: 0,
      },
    },
  },
  {
    ...buildDefaultOption(),
    label: "Cut to size",
    value: "cutToSize",
    advancedPreset: {
      cutToSize: true,
      reinforcementSides: [],
      tunnelSides: [],
      grommets: {
        sides: [],
        spacing: 50,
        offsetStart: 0,
        offsetEnd: 0,
      },
    },
  },
];

const initialValuesCreate = (prefillData?: AttributePrefillData) => {
  const prefillOptions = prefillData?.options?.map((opt) => ({
    ...buildDefaultOption(),
    label: opt.label,
    value: opt.value,
  }));

  const values: CreateInput = {
    id: "",
    name: prefillData?.name ?? "",
    calculated: true,
    required: false,
    format: false,
    pages: false,
    type: (prefillData?.type as CreateInput["type"]) ?? "DROPDOWN",
    options:
      prefillOptions && prefillOptions.length > 0
        ? prefillOptions
        : (prefillData?.type as CreateInput["type"]) ===
            AttributeInputTypeEnum.ADVANCED_FINISHING
          ? buildDefaultAdvancedOptions()
          : [buildDefaultOption(), buildDefaultOption()],
    trackStock: false,
    calculateStockFromSheet: {
      enabled: false,
      sheetWidth: 450,
      sheetHeight: 320,
      margin: 0,
      bleed: 3,
    },
    costUnit: undefined,
    createdBy: {
      id: "",
      name: "",
    },
  };
  return values;
};

const handleCreateAttribute = async (
  data: CreateInput,
  refreshAttributes: () => void,
  toaster: CreateToasterReturn,
  t: TFunction,
  tenantContext: TenantContext,
) => {
  try {
    if (hasDuplicateIds(data.options.map((option: Option) => option.value)))
      throw t("errors.attribute.duplicateIds");

    const attribute: CreateAttribute = {
      id: data.id,
      name: data.name,
      calculated: data.calculated,
      required: data.required,
      format: data.format,
      pages: data.pages,
      options: data.options,
      trackStock: data.trackStock ?? false,
      calculateStockFromSheet: data.calculateStockFromSheet ?? {
        enabled: false,
        sheetWidth: 450,
        sheetHeight: 320,
        margin: 0,
        bleed: 3,
      },
      ...(data.costUnit ? { costUnit: data.costUnit } : {}),
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
      type: data.type,
      active: true,
    };
    await create(
      firestore,
      attribute,
      db.doc(firestore, "/attributes", attribute.id),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      tenantContext,
    );
    void ensureEntityTranslationsAction({
      kind: "attribute",
      entityId: attribute.id,
    })
      .then((result) => {
        if (!result.ok) {
          toaster.warning({
            title: t("translations.managed.toasts.autoWarning", {
              defaultValue: "Created, but auto-translation failed",
            }),
          });
        }
      })
      .catch((error) => {
        console.error("[AttributesForm] Auto-translation failed", error);
        toaster.warning({
          title: t("translations.managed.toasts.autoWarning", {
            defaultValue: "Created, but auto-translation failed",
          }),
        });
      });
    scheduleAttributeChangeLog(attribute.id, null);
    toaster.success({
      title: t("toasts.attribute.created"),
      description: t("toasts.attribute.createdDescription"),
    });
    refreshAttributes();
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("errors.somethingWentWrong"),
      description: `${t("toasts.attribute.notCreated", { error })}`,
    });
  }
};

const initialValuesUpdate = (attribute?: Attribute) => {
  if (isUndefined(attribute))
    throw "attribute was not provided to initialValuesUpdate";
  const values: UpdateInput = {
    id: attribute.id ?? "",
    name: attribute.name ?? "",
    calculated: attribute.calculated ?? false,
    required: attribute.required ?? false,
    format: attribute.format ?? false,
    pages: attribute.pages ?? false,
    type: attribute.type ?? AttributeInputTypeEnum.DROPDOWN,
    options: attribute.options.map((opt) => ({
      ...opt,
      formatWidth: opt.formatWidth ?? null,
      formatHeight: opt.formatHeight ?? null,
      unitsPerSheet: opt.unitsPerSheet ?? null,
      pages: opt.pages ?? null,
      cost: opt.cost ?? null,
      advancedPreset: opt.advancedPreset ?? buildDefaultAdvancedPreset(),
    })),
    updatedBy: attribute.updatedBy,
    trackStock: attribute.trackStock ?? false,
    costUnit: attribute.costUnit ?? undefined,
  };
  if (attribute.calculateStockFromSheet?.enabled) {
    values.calculateStockFromSheet = attribute.calculateStockFromSheet;
  }
  return values;
};

const handleUpdateAttribute = async (
  attributeId: Attribute["id"],
  previousAttribute: Attribute,
  data: UpdateAttribute,
  refreshAttributes: () => void,
  toaster: CreateToasterReturn,
  t: TFunction,
  tenantContext: TenantContext,
) => {
  try {
    if (hasDuplicateIds(data.options.map((option) => option.value)))
      throw t("errors.attribute.duplicateIds");

    const attribute: UpdateAttribute = {
      name: data.name,
      options: data.options,
      trackStock: data.trackStock ?? false,
      pages: data.pages,
      updatedBy: {
        id: data.updatedBy.id,
        name: data.updatedBy.name,
      },
      updatedAt: Timestamp.now(),
      keywords: generateKeywords(data.name),
      type: data.type,
      active: true,
      ...(data.costUnit ? { costUnit: data.costUnit } : {}),
    };
    if (data.calculateStockFromSheet?.enabled) {
      attribute.calculateStockFromSheet = data.calculateStockFromSheet;
    }
    await update(
      attribute,
      db.doc(firestore, "/attributes", attributeId),
      tenantContext,
    );
    scheduleAttributeChangeLog(attributeId, previousAttribute);
    refreshAttributes();
    toaster.success({
      title: t("toasts.attribute.updated"),
      description: t("toasts.attribute.updatedDescription", {
        name: data.name,
      }),
    });
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("errors.somethingWentWrong"),
      description: `${t("toasts.attribute.notUpdated", { error })}`,
    });
  }
};

const initialValuesDuplicate = (attribute?: Attribute) => {
  if (isUndefined(attribute))
    throw "attribute was not provided to initialValuesUpdate";
  const values: CreateInput = {
    id: "",
    name: attribute.name ?? "",
    calculated: attribute.calculated ?? false,
    required: attribute.required ?? false,
    format: attribute.format ?? false,
    pages: attribute.pages ?? false,
    type: attribute.type ?? AttributeInputTypeEnum.DROPDOWN,
    options: attribute.options.map((opt) => ({
      ...opt,
      formatWidth: opt.formatWidth ?? null,
      formatHeight: opt.formatHeight ?? null,
      unitsPerSheet: opt.unitsPerSheet ?? null,
      pages: opt.pages ?? null,
      cost: opt.cost ?? null,
      advancedPreset: opt.advancedPreset ?? buildDefaultAdvancedPreset(),
    })),
    createdBy: {
      id: "",
      name: "",
    },
    trackStock: attribute.trackStock ?? false,
    costUnit: attribute.costUnit ?? undefined,
  };
  if (attribute.calculateStockFromSheet?.enabled) {
    values.calculateStockFromSheet = attribute.calculateStockFromSheet;
  }
  return values;
};
