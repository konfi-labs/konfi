import { revalidateTagCache } from "@/actions";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { createManualTranslationMeta } from "@/lib/translations";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import {
  createBlogCategoryTranslation,
  getBlogCategoryTranslation,
  updateBlogCategoryTranslation,
} from "@konfi/firebase";
import {
  BlogCategory,
  BlogCategoryTranslation,
  FormData,
  FormTypes,
  Locale,
} from "@konfi/types";
import {
  BlogCategoryTranslationCreateSchema,
  BlogCategoryTranslationUpdateSchema,
  getIconByFormType,
} from "@konfi/utils";
import { TFunction } from "i18next";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import useSWR, { KeyedMutator } from "swr";
import { InferType } from "yup";
import { By } from "../form/field-controllers/By";
import Generate from "../form/field-controllers/Generate";
import { getTranslationFormVersion } from "../translations/translation-form-version";

type CreateInput = InferType<typeof BlogCategoryTranslationCreateSchema>;
type UpdateInput = InferType<typeof BlogCategoryTranslationUpdateSchema>;

interface BlogCategoryTranslationFormProps {
  locale: Locale;
  blogCategory: BlogCategory;
  type: keyof typeof FormTypes;
  translation?: BlogCategoryTranslation;
  mutateTranslations?: KeyedMutator<BlogCategoryTranslation[]>;
}

export function BlogCategoryTranslationForm({
  blogCategory,
  type,
  locale,
  translation: initialTranslation,
  mutateTranslations,
}: BlogCategoryTranslationFormProps) {
  const { t, i18n } = useT();
  const { data: fetchedTranslation, mutate } = useSWR(
    `/blogCategories/${blogCategory.id}/translations/${locale}`,
    () => getBlogCategoryTranslation(firestore, blogCategory.id, locale),
  );
  const translation = initialTranslation ?? fetchedTranslation;
  const translationVersion = getTranslationFormVersion(translation);

  const label =
    `${t(`FormTypes.${type}`)} ` +
    t(`forms.labels.translation`, {
      defaultValue: "Translation",
    });

  const CreateSchemaYupResolver = yupResolver(
    BlogCategoryTranslationCreateSchema,
  );
  const UpdateSchemaYupResolver = yupResolver(
    BlogCategoryTranslationUpdateSchema,
  );

  const CreateForm = useForm({
    defaultValues: blogCategory && initialValuesCreate(locale, blogCategory),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "CREATE",
  });

  const UpdateForm = useForm({
    defaultValues:
      blogCategory &&
      translation &&
      initialValuesUpdate(locale, blogCategory, translation),
    resolver: UpdateSchemaYupResolver,
    disabled: type !== "UPDATE",
  });

  const onSubmit = async (data: Partial<BlogCategoryTranslation>) => {
    try {
      const payload: Partial<BlogCategoryTranslation> = {
        ...data,
        translationMeta: createManualTranslationMeta({
          kind: "blogCategory",
          source: blogCategory,
        }),
      };

      if (translation?.id) {
        // Update existing translation
        await updateBlogCategoryTranslation(
          firestore,
          blogCategory.id,
          locale,
          payload,
        );
      } else {
        // Create new translation
        await createBlogCategoryTranslation(
          firestore,
          blogCategory.id,
          payload as Omit<
            BlogCategoryTranslation,
            "id" | "createdAt" | "updatedAt"
          >,
        );
        await revalidateTagCache("blogCategories");
      }

      toaster.success({
        title: t("translationSaved", { defaultValue: "Translation saved" }),
        description: t("translationSavedDescription", {
          defaultValue: "Translation has been successfully saved.",
        }),
      });

      mutate();
      mutateTranslations?.();
    } catch (error) {
      toaster.error({
        title: t("translationError", { defaultValue: "Translation error" }),
        description: t("translationErrorDescription", {
          defaultValue: "An error occurred while saving the translation.",
        }),
      });
    }
  };

  const prevCategoryIdRef = useRef<string | undefined>(undefined);
  const prevLocaleRef = useRef<Locale | undefined>(undefined);
  const prevTypeRef = useRef<string | undefined>(undefined);
  const initializedCreateRef = useRef(false);
  const initializedUpdateTranslationVersionRef = useRef<string | undefined>(
    undefined,
  );

  useEffect(() => {
    const categoryChanged = prevCategoryIdRef.current !== blogCategory?.id;
    const localeChanged = prevLocaleRef.current !== locale;
    const typeChanged = prevTypeRef.current !== type;

    if (categoryChanged || localeChanged || typeChanged) {
      initializedCreateRef.current = false;
      initializedUpdateTranslationVersionRef.current = undefined;
    }

    if (type === "CREATE" && blogCategory && !initializedCreateRef.current) {
      CreateForm.reset(initialValuesCreate(locale, blogCategory));
      initializedCreateRef.current = true;
    }

    if (
      type === "UPDATE" &&
      blogCategory &&
      translation &&
      translationVersion &&
      initializedUpdateTranslationVersionRef.current !== translationVersion
    ) {
      UpdateForm.reset(initialValuesUpdate(locale, blogCategory, translation));
      initializedUpdateTranslationVersionRef.current = translationVersion;
    }

    prevCategoryIdRef.current = blogCategory?.id;
    prevLocaleRef.current = locale;
    prevTypeRef.current = type;
  }, [
    type,
    blogCategory,
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
      formData={blogCategoryTranslationForm(t)}
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
  blogCategory: BlogCategory,
): CreateInput => {
  const values: CreateInput = {
    locale: locale,
    name: blogCategory.name,
    description: blogCategory.description,
    seo: {
      title: blogCategory.seo.title,
      description: blogCategory.seo.description,
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
  blogCategory: BlogCategory,
  translation?: BlogCategoryTranslation,
): UpdateInput => {
  const values: UpdateInput = {
    locale: locale,
    name: translation?.name || blogCategory.name,
    description: translation?.description || blogCategory.description,
    seo: {
      title: translation?.seo.title || blogCategory.seo.title,
      description: translation?.seo.description || blogCategory.seo.description,
    },
    active: translation?.active ?? true,
    updatedBy: {
      id: "",
      name: "",
    },
  };
  return values;
};

export const blogCategoryTranslationForm = (t: TFunction) => {
  const _blogCategoryTranslationForm: FormData = {
    allowMultiple: false,
    allowToggle: true,
    sections: [
      {
        fieldArray: false,
        heading: t("forms.blog.categories.headings.basicInformation"),
        isDefaultExpanded: true,
        fields: [
          {
            name: "name",
            label: t("forms.blog.categories.labels.name"),
            isRequired: true,
            placeholder: t("forms.blog.categories.placeholders.name"),
            generate: {
              systemPrompt:
                "Translate `name` field to the specified locale. Return only the translated text.",
              context: ["root.locale", "name"],
            },
          },
          {
            name: "description",
            label: t("forms.blog.categories.labels.description"),
            isRequired: false,
            placeholder: t("forms.placeholders.description", {
              defaultValue: "Category description",
            }),
            type: "textarea",
            generate: {
              systemPrompt:
                "Translate `description` field to the specified locale. Return only the translated text.",
              context: ["root.locale", "description"],
            },
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.blog.categories.headings.seoSettings"),
        isDefaultExpanded: false,
        fields: [
          {
            name: "seo.title",
            label: t("forms.blog.categories.labels.seoTitle"),
            isRequired: true,
            placeholder: t("forms.placeholders.seoTitle", {
              defaultValue: "SEO Title",
            }),
            generate: {
              systemPrompt:
                "Translate `seo.title` field to the specified locale. Return only the translated text.",
              context: ["root.locale", "seo.title"],
            },
          },
          {
            name: "seo.description",
            label: t("forms.blog.categories.labels.seoDescription"),
            isRequired: true,
            placeholder: t("forms.placeholders.seoDescription", {
              defaultValue: "SEO Description",
            }),
            type: "textarea",
            generate: {
              systemPrompt:
                "Translate `seo.description` field to the specified locale. Return only the translated text.",
              context: ["root.locale", "seo.description"],
            },
          },
        ],
      },
    ],
  };
  return _blogCategoryTranslationForm;
};
