import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { createManualTranslationMeta } from "@/lib/translations";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import {
  createCategoryTranslation,
  getCategoryTranslation,
  updateCategoryTranslation,
} from "@konfi/firebase";
import {
  Category,
  CategoryTranslation,
  CategoryTranslationCreate,
  CategoryTranslationUpdate,
  FormTypes,
  Locale,
} from "@konfi/types";
import {
  CategoryTranslationCreateSchema,
  categoryTranslationForm,
  CategoryTranslationUpdateSchema,
  getIconByFormType,
  toSlug,
} from "@konfi/utils";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import useSWR, { KeyedMutator } from "swr";
import { InferType } from "yup";
import { By } from "../form/field-controllers/By";
import Generate from "../form/field-controllers/Generate";
import { getTranslationFormVersion } from "../translations/translation-form-version";

type CreateInput = InferType<typeof CategoryTranslationCreateSchema>;
type UpdateInput = InferType<typeof CategoryTranslationUpdateSchema>;

interface CategoryTranslationFormProps {
  locale: Locale;
  category: Category;
  type: keyof typeof FormTypes;
  channelId: string;
  translation?: CategoryTranslation;
  mutateTranslations?: KeyedMutator<CategoryTranslation[]>;
}

export function CategoryTranslationForm({
  category,
  type,
  channelId,
  locale,
  translation: initialTranslation,
  mutateTranslations,
}: CategoryTranslationFormProps) {
  const { t, i18n } = useT();
  const tenantContext = useTenantContext();
  const { data: fetchedTranslation, mutate } = useSWR(
    `/channels/${channelId}/categories/${category.id}/translations/${locale}`,
    () => getCategoryTranslation(firestore, channelId, category.id, locale),
  );
  const translation = initialTranslation ?? fetchedTranslation;
  const translationVersion = getTranslationFormVersion(translation);
  const label =
    `${t(`FormTypes.${type}`)} ` +
    t(`forms.labels.translation`, {
      defaultValue: "Translation",
    });
  const CreateSchemaYupResolver = yupResolver(CategoryTranslationCreateSchema);
  const UpdateSchemaYupResolver = yupResolver(CategoryTranslationUpdateSchema);

  const CreateForm = useForm({
    defaultValues: category && initialValuesCreate(locale, category),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "CREATE",
  });

  const UpdateForm = useForm({
    defaultValues:
      category &&
      translation &&
      initialValuesUpdate(locale, category, translation),
    resolver: UpdateSchemaYupResolver,
    disabled: type !== "UPDATE",
  });

  const onSubmit = async (data: Partial<CategoryTranslation>) => {
    try {
      const payload = {
        ...data,
        seo: {
          ...data.seo,
          slug: data.seo?.slug ? toSlug(data.seo.slug) : data.seo?.slug,
        },
        translationMeta: createManualTranslationMeta({
          kind: "category",
          source: category,
        }),
      } as Partial<CategoryTranslation>;
      if (translation?.id) {
        // Update existing translation
        await updateCategoryTranslation(
          firestore,
          channelId,
          category.id,
          translation.id,
          payload as CategoryTranslationUpdate,
          tenantContext,
        );
      } else {
        // Create new translation
        await createCategoryTranslation(
          firestore,
          channelId,
          category.id,
          payload as CategoryTranslationCreate,
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
  const prevCategoryIdRef = useRef<string | undefined>(undefined);
  const prevLocaleRef = useRef<Locale | undefined>(undefined);
  const prevTypeRef = useRef<string | undefined>(undefined);
  const initializedCreateRef = useRef(false);
  const initializedUpdateTranslationVersionRef = useRef<string | undefined>(
    undefined,
  );

  useEffect(() => {
    const categoryChanged = prevCategoryIdRef.current !== category?.id;
    const localeChanged = prevLocaleRef.current !== locale;
    const typeChanged = prevTypeRef.current !== type;

    // Reset guards when core dependencies change
    if (categoryChanged || localeChanged || typeChanged) {
      initializedCreateRef.current = false;
      initializedUpdateTranslationVersionRef.current = undefined;
    }

    if (type === "CREATE" && category && !initializedCreateRef.current) {
      CreateForm.reset(initialValuesCreate(locale, category));
      initializedCreateRef.current = true;
    }

    if (
      type === "UPDATE" &&
      category &&
      translation &&
      translationVersion &&
      initializedUpdateTranslationVersionRef.current !== translationVersion
    ) {
      UpdateForm.reset(initialValuesUpdate(locale, category, translation));
      initializedUpdateTranslationVersionRef.current = translationVersion;
    }

    prevCategoryIdRef.current = category?.id;
    prevLocaleRef.current = locale;
    prevTypeRef.current = type;
  }, [
    type,
    category,
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
      formData={categoryTranslationForm(t)}
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
  category: Category,
): CreateInput => {
  const values: CreateInput = {
    locale: locale,
    name: category.name,
    description: category.description || "",
    seo: {
      title: category.seo?.title || "",
      description: category.seo?.description || "",
      slug: category.seo?.slug || "",
    },
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
  category: Category,
  translation?: CategoryTranslation,
): UpdateInput => {
  const values: UpdateInput = {
    locale: locale,
    name: translation?.name || category.name,
    description: translation?.description || category.description || "",
    seo: {
      title: translation?.seo?.title || category.seo?.title || "",
      description:
        translation?.seo?.description || category.seo?.description || "",
      slug: translation?.seo?.slug || category.seo?.slug || "",
    },
    active: translation?.active ?? true,
    updatedBy: {
      id: "",
      name: "",
    },
  };
  return values;
};
