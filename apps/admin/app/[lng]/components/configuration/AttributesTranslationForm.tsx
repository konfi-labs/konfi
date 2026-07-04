import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  createManualTranslationMeta,
  reconcileAttributeOptionTranslations,
} from "@/lib/translations";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import {
  createAttributeTranslation,
  getAttributeTranslation,
  updateAttributeTranslation,
} from "@konfi/firebase";
import {
  Attribute,
  AttributeTranslation,
  AttributeTranslationCreate,
  AttributeTranslationUpdate,
  FormTypes,
  Locale,
} from "@konfi/types";
import {
  AttributeTranslationCreateSchema,
  attributeTranslationForm,
  AttributeTranslationUpdateSchema,
  getIconByFormType,
} from "@konfi/utils";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import useSWR, { KeyedMutator } from "swr";
import { InferType } from "yup";
import { By } from "../form/field-controllers/By";
import Generate from "../form/field-controllers/Generate";
import { getTranslationFormVersion } from "../translations/translation-form-version";

type CreateInput = InferType<typeof AttributeTranslationCreateSchema>;
type UpdateInput = InferType<typeof AttributeTranslationUpdateSchema>;

interface AttributesTranslationFormProps {
  locale: Locale;
  attribute: Attribute;
  type: keyof typeof FormTypes;
  translation?: AttributeTranslation;
  mutateTranslations?: KeyedMutator<AttributeTranslation[]>;
}

export function AttributesTranslationForm({
  attribute,
  type,
  locale,
  translation: initialTranslation,
  mutateTranslations,
}: AttributesTranslationFormProps) {
  const { t, i18n } = useT();
  const tenantContext = useTenantContext();
  const { data: fetchedTranslation, mutate } = useSWR(
    `/attributes/${attribute.id}/translations/${locale}`,
    () => getAttributeTranslation(firestore, attribute.id, locale),
  );
  const translation = initialTranslation ?? fetchedTranslation;
  const translationVersion = getTranslationFormVersion(translation);
  const label =
    `${t(`FormTypes.${type}`)} ` +
    t(`forms.labels.translation`, {
      defaultValue: "Translation",
    });
  const CreateSchemaYupResolver = yupResolver(AttributeTranslationCreateSchema);
  const UpdateSchemaYupResolver = yupResolver(AttributeTranslationUpdateSchema);

  const CreateForm = useForm({
    defaultValues: attribute && initialValuesCreate(locale, attribute),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "CREATE",
  });

  const UpdateForm = useForm({
    defaultValues:
      attribute &&
      translation &&
      initialValuesUpdate(locale, attribute, translation),
    resolver: UpdateSchemaYupResolver,
    disabled: type !== "UPDATE",
  });

  const onSubmit = async (data: Partial<AttributeTranslation>) => {
    try {
      const payload: Partial<AttributeTranslation> = {
        ...data,
        translationMeta: createManualTranslationMeta({
          kind: "attribute",
          source: attribute,
        }),
      };

      if (translation?.id) {
        // Update existing translation
        await updateAttributeTranslation(
          firestore,
          attribute.id,
          translation.id,
          payload as AttributeTranslationUpdate,
          tenantContext,
        );
      } else {
        // Create new translation
        await createAttributeTranslation(
          firestore,
          attribute.id,
          payload as AttributeTranslationCreate,
          tenantContext,
        );
      }

      toaster.success({
        title: t("translationSaved", { defaultValue: "Tłumaczenie zapisane" }),
        description: t("translationSavedDescription", {
          defaultValue: "Tłumaczenie zostało pomyślnie zapisane.",
        }),
      });

      mutate();
      mutateTranslations?.();
    } catch (error) {
      toaster.error({
        title: t("translationError", { defaultValue: "Błąd tłumaczenia" }),
        description: t("translationErrorDescription", {
          defaultValue: "Wystąpił błąd podczas zapisywania tłumaczenia.",
        }),
      });
    }
  };

  // Refs to ensure we only initialize form values when switching entity/locale/type
  const prevAttributeIdRef = useRef<string | undefined>(undefined);
  const prevLocaleRef = useRef<Locale | undefined>(undefined);
  const prevTypeRef = useRef<string | undefined>(undefined);
  const initializedCreateRef = useRef(false);
  const initializedUpdateTranslationVersionRef = useRef<string | undefined>(
    undefined,
  );

  useEffect(() => {
    const attributeChanged = prevAttributeIdRef.current !== attribute?.id;
    const localeChanged = prevLocaleRef.current !== locale;
    const typeChanged = prevTypeRef.current !== type;

    // Reset guards when core dependencies change
    if (attributeChanged || localeChanged || typeChanged) {
      initializedCreateRef.current = false;
      initializedUpdateTranslationVersionRef.current = undefined;
    }

    if (type === "CREATE" && attribute && !initializedCreateRef.current) {
      CreateForm.reset(initialValuesCreate(locale, attribute));
      initializedCreateRef.current = true;
    }

    if (
      type === "UPDATE" &&
      attribute &&
      translation &&
      translationVersion &&
      initializedUpdateTranslationVersionRef.current !== translationVersion
    ) {
      UpdateForm.reset(initialValuesUpdate(locale, attribute, translation));
      initializedUpdateTranslationVersionRef.current = translationVersion;
    }

    prevAttributeIdRef.current = attribute?.id;
    prevLocaleRef.current = locale;
    prevTypeRef.current = type;
  }, [
    type,
    attribute,
    locale,
    translation,
    translationVersion,
    CreateForm,
    UpdateForm,
  ]);

  if (type === "CREATE" && CreateForm.formState.disabled) return null;
  if (type === "UPDATE" && UpdateForm.formState.disabled) return null;

  return (
    <FormController
      methods={type === "CREATE" ? CreateForm : UpdateForm}
      buttonLeftIcon={getIconByFormType(type)}
      buttonLabel={label}
      formData={attributeTranslationForm(t)}
      update={type === "UPDATE"}
      handleSubmit={async (data) => await onSubmit(data)}
      By={<By update={type === "UPDATE"} />}
      t={t}
      i18n={i18n}
      Generate={Generate}
    />
  );
}

const initialValuesCreate = (
  locale: Locale,
  attribute: Attribute,
): CreateInput => {
  const values: CreateInput = {
    locale: locale,
    name: attribute.name,
    options: attribute.options.map((option) => ({
      value: option.value,
      label: option.label,
      advancedPreset: option.advancedPreset,
    })),
    createdBy: {
      id: "",
      name: "",
    },
    active: true,
  };
  return values;
};

const initialValuesUpdate = (
  locale: Locale,
  attribute: Attribute,
  translation?: AttributeTranslation,
): UpdateInput => {
  const values: UpdateInput = {
    locale: locale,
    name: translation?.name || attribute.name,
    options: reconcileAttributeOptionTranslations(
      attribute,
      translation?.options,
    ),
    active: translation?.active ?? true,
    updatedBy: {
      id: "",
      name: "",
    },
  };
  return values;
};
