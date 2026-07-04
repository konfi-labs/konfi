import { revalidateTagCache } from "@/actions";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { createManualTranslationMeta } from "@/lib/translations";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import {
  createBlogTagTranslation,
  getBlogTagTranslation,
  updateBlogTagTranslation,
} from "@konfi/firebase";
import {
  BlogTag,
  BlogTagTranslation,
  FormData,
  FormTypes,
  Locale,
} from "@konfi/types";
import {
  BlogTagTranslationCreateSchema,
  BlogTagTranslationUpdateSchema,
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

type CreateInput = InferType<typeof BlogTagTranslationCreateSchema>;
type UpdateInput = InferType<typeof BlogTagTranslationUpdateSchema>;

interface BlogTagTranslationFormProps {
  locale: Locale;
  blogTag: BlogTag;
  type: keyof typeof FormTypes;
  translation?: BlogTagTranslation;
  mutateTranslations?: KeyedMutator<BlogTagTranslation[]>;
}

export function BlogTagTranslationForm({
  blogTag,
  type,
  locale,
  translation: initialTranslation,
  mutateTranslations,
}: BlogTagTranslationFormProps) {
  const { t, i18n } = useT();
  const { data: fetchedTranslation, mutate } = useSWR(
    `/blogTags/${blogTag.id}/translations/${locale}`,
    () => getBlogTagTranslation(firestore, blogTag.id, locale),
  );
  const translation = initialTranslation ?? fetchedTranslation;
  const translationVersion = getTranslationFormVersion(translation);

  const label =
    `${t(`FormTypes.${type}`)} ` +
    t(`forms.labels.translation`, {
      defaultValue: "Translation",
    });

  const CreateSchemaYupResolver = yupResolver(BlogTagTranslationCreateSchema);
  const UpdateSchemaYupResolver = yupResolver(BlogTagTranslationUpdateSchema);

  const CreateForm = useForm({
    defaultValues: blogTag && initialValuesCreate(locale, blogTag),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "CREATE",
  });

  const UpdateForm = useForm({
    defaultValues:
      blogTag &&
      translation &&
      initialValuesUpdate(locale, blogTag, translation),
    resolver: UpdateSchemaYupResolver,
    disabled: type !== "UPDATE",
  });

  const onSubmit = async (data: Partial<BlogTagTranslation>) => {
    try {
      const payload: Partial<BlogTagTranslation> = {
        ...data,
        translationMeta: createManualTranslationMeta({
          kind: "blogTag",
          source: blogTag,
        }),
      };

      if (translation?.id) {
        // Update existing translation
        await updateBlogTagTranslation(firestore, blogTag.id, locale, payload);
      } else {
        // Create new translation
        await createBlogTagTranslation(
          firestore,
          blogTag.id,
          payload as Omit<BlogTagTranslation, "id" | "createdAt" | "updatedAt">,
        );
        await revalidateTagCache("blogTags");
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

  const prevTagIdRef = useRef<string | undefined>(undefined);
  const prevLocaleRef = useRef<Locale | undefined>(undefined);
  const prevTypeRef = useRef<string | undefined>(undefined);
  const initializedCreateRef = useRef(false);
  const initializedUpdateTranslationVersionRef = useRef<string | undefined>(
    undefined,
  );

  useEffect(() => {
    const tagChanged = prevTagIdRef.current !== blogTag?.id;
    const localeChanged = prevLocaleRef.current !== locale;
    const typeChanged = prevTypeRef.current !== type;

    if (tagChanged || localeChanged || typeChanged) {
      initializedCreateRef.current = false;
      initializedUpdateTranslationVersionRef.current = undefined;
    }

    if (type === "CREATE" && blogTag && !initializedCreateRef.current) {
      CreateForm.reset(initialValuesCreate(locale, blogTag));
      initializedCreateRef.current = true;
    }

    if (
      type === "UPDATE" &&
      blogTag &&
      translation &&
      translationVersion &&
      initializedUpdateTranslationVersionRef.current !== translationVersion
    ) {
      UpdateForm.reset(initialValuesUpdate(locale, blogTag, translation));
      initializedUpdateTranslationVersionRef.current = translationVersion;
    }

    prevTagIdRef.current = blogTag?.id;
    prevLocaleRef.current = locale;
    prevTypeRef.current = type;
  }, [
    type,
    blogTag,
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
      formData={blogTagTranslationForm(t)}
      update={type === "UPDATE"}
      handleSubmit={async (data) => await onSubmit(data)}
      By={<By update={type === "UPDATE"} />}
      t={t}
      i18n={i18n}
      Generate={Generate}
    />
  );
}

const initialValuesCreate = (locale: Locale, blogTag: BlogTag): CreateInput => {
  const values: CreateInput = {
    locale: locale,
    name: blogTag.name,
    description: blogTag.description,
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
  blogTag: BlogTag,
  translation?: BlogTagTranslation,
): UpdateInput => {
  const values: UpdateInput = {
    locale: locale,
    name: translation?.name || blogTag.name,
    description: translation?.description || blogTag.description,
    active: translation?.active ?? true,
    updatedBy: {
      id: "",
      name: "",
    },
  };
  return values;
};

export const blogTagTranslationForm = (t: TFunction) => {
  const _blogTagTranslationForm: FormData = {
    allowMultiple: false,
    allowToggle: true,
    sections: [
      {
        fieldArray: false,
        heading: t("forms.blog.tags.headings.basicInformation"),
        isDefaultExpanded: true,
        fields: [
          {
            name: "name",
            label: t("forms.blog.tags.labels.name"),
            isRequired: true,
            placeholder: t("forms.blog.tags.placeholders.name"),
            generate: {
              systemPrompt:
                "Translate `name` field to the specified locale. Return only the translated text.",
              context: ["root.locale", "name"],
            },
          },
          {
            name: "description",
            label: t("forms.blog.tags.labels.description"),
            isRequired: false,
            placeholder: t("forms.placeholders.description", {
              defaultValue: "Tag description",
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
    ],
  };
  return _blogTagTranslationForm;
};
