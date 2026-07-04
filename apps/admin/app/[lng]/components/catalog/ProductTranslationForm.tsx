import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { createManualTranslationMeta } from "@/lib/translations";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import {
  createProductTranslation,
  getProductTranslation,
  updateProductTranslation,
} from "@konfi/firebase";
import {
  FormTypes,
  Locale,
  Product,
  ProductTranslation,
  ProductTranslationCreate,
  ProductTranslationUpdate,
} from "@konfi/types";
import {
  getIconByFormType,
  ProductTranslationCreateSchema,
  productTranslationForm,
  ProductTranslationUpdateSchema,
  toSlug,
} from "@konfi/utils";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import useSWR, { KeyedMutator } from "swr";
import { InferType } from "yup";
import { By } from "../form/field-controllers/By";
import Generate from "../form/field-controllers/Generate";
import { getTranslationFormVersion } from "../translations/translation-form-version";

type CreateInput = InferType<typeof ProductTranslationCreateSchema>;
type UpdateInput = InferType<typeof ProductTranslationUpdateSchema>;

interface ProductTranslationFormProps {
  locale: Locale;
  product: Product;
  type: keyof typeof FormTypes;
  channelId: string;
  translation?: ProductTranslation;
  mutateTranslations?: KeyedMutator<ProductTranslation[]>;
}

export function ProductTranslationForm({
  product,
  type,
  channelId,
  locale,
  translation: initialTranslation,
  mutateTranslations,
}: ProductTranslationFormProps) {
  const { t, i18n } = useT();
  const tenantContext = useTenantContext();
  const { data: fetchedTranslation, mutate } = useSWR(
    `/channels/${channelId}/products/${product.id}/translations/${locale}`,
    () => getProductTranslation(firestore, channelId, product.id, locale),
  );
  const translation = initialTranslation ?? fetchedTranslation;
  const translationVersion = getTranslationFormVersion(translation);
  const label =
    `${t(`FormTypes.${type}`)} ` +
    t(`forms.labels.translation`, {
      defaultValue: "Translation",
    });
  const CreateSchemaYupResolver = yupResolver(ProductTranslationCreateSchema);
  const UpdateSchemaYupResolver = yupResolver(ProductTranslationUpdateSchema);

  const CreateForm = useForm({
    defaultValues: product && initialValuesCreate(locale, product),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "CREATE",
  });

  const UpdateForm = useForm({
    defaultValues:
      product &&
      translation &&
      initialValuesUpdate(locale, product, translation),
    resolver: UpdateSchemaYupResolver,
    disabled: type !== "UPDATE",
  });

  const onSubmit = async (data: Partial<ProductTranslation>) => {
    try {
      const payload = {
        ...data,
        seo: {
          ...data.seo,
          slug: data.seo?.slug ? toSlug(data.seo.slug) : data.seo?.slug,
        },
        translationMeta: createManualTranslationMeta({
          kind: "product",
          source: product,
        }),
      } as Partial<ProductTranslation>;
      if (translation?.id) {
        // Update existing translation
        await updateProductTranslation(
          firestore,
          channelId,
          product.id,
          translation.id,
          payload as ProductTranslationUpdate,
          tenantContext,
        );
      } else {
        // Create new translation
        await createProductTranslation(
          firestore,
          channelId,
          product.id,
          payload as ProductTranslationCreate,
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
  const prevProductIdRef = useRef<string | undefined>(undefined);
  const prevLocaleRef = useRef<Locale | undefined>(undefined);
  const prevTypeRef = useRef<string | undefined>(undefined);
  const initializedCreateRef = useRef(false);
  const initializedUpdateTranslationVersionRef = useRef<string | undefined>(
    undefined,
  );

  useEffect(() => {
    const productChanged = prevProductIdRef.current !== product?.id;
    const localeChanged = prevLocaleRef.current !== locale;
    const typeChanged = prevTypeRef.current !== type;

    // Reset guards when core dependencies change
    if (productChanged || localeChanged || typeChanged) {
      initializedCreateRef.current = false;
      initializedUpdateTranslationVersionRef.current = undefined;
    }

    if (type === "CREATE" && product && !initializedCreateRef.current) {
      CreateForm.reset(initialValuesCreate(locale, product));
      initializedCreateRef.current = true;
    }

    if (
      type === "UPDATE" &&
      product &&
      translation &&
      translationVersion &&
      initializedUpdateTranslationVersionRef.current !== translationVersion
    ) {
      UpdateForm.reset(initialValuesUpdate(locale, product, translation));
      initializedUpdateTranslationVersionRef.current = translationVersion;
    }

    prevProductIdRef.current = product?.id;
    prevLocaleRef.current = locale;
    prevTypeRef.current = type;
  }, [
    type,
    product,
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
      formData={productTranslationForm(t)}
      update={type === "UPDATE"}
      handleSubmit={async (data) => await onSubmit(data)}
      By={<By update={type === "UPDATE"} />}
      t={t}
      i18n={i18n}
      Generate={Generate}
    />
  );
}

const initialValuesCreate = (locale: Locale, product: Product): CreateInput => {
  const values: CreateInput = {
    locale: locale,
    name: product.name,
    description: product.description || "",
    seo: {
      title: product.seo?.title || "",
      description: product.seo?.description || "",
      slug: product.seo?.slug || "",
    },
    specialNotes: product.specialNotes || "",
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
  product: Product,
  translation?: ProductTranslation,
): UpdateInput => {
  const values: UpdateInput = {
    locale: locale,
    name: translation?.name || product.name,
    description: translation?.description || product.description || "",
    seo: {
      title: translation?.seo?.title || product.seo?.title || "",
      description:
        translation?.seo?.description || product.seo?.description || "",
      slug: translation?.seo?.slug || product.seo?.slug || "",
    },
    specialNotes: translation?.specialNotes || product.specialNotes || "",
    active: translation?.active ?? true,
    updatedBy: {
      id: "",
      name: "",
    },
  };
  return values;
};
