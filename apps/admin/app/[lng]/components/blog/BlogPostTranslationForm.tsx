import { revalidateTagCache } from "@/actions";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { createManualTranslationMeta } from "@/lib/translations";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import {
  createBlogPostTranslation,
  getBlogPostTranslation,
  updateBlogPostTranslation,
} from "@konfi/firebase";
import {
  BlogPost,
  BlogPostTranslation,
  FormData,
  FormTypes,
  Locale,
} from "@konfi/types";
import {
  BlogPostTranslationCreateSchema,
  BlogPostTranslationUpdateSchema,
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

type CreateInput = InferType<typeof BlogPostTranslationCreateSchema>;
type UpdateInput = InferType<typeof BlogPostTranslationUpdateSchema>;

interface BlogPostTranslationFormProps {
  locale: Locale;
  blogPost: BlogPost;
  type: keyof typeof FormTypes;
  translation?: BlogPostTranslation;
  mutateTranslations?: KeyedMutator<BlogPostTranslation[]>;
}

export function BlogPostTranslationForm({
  blogPost,
  type,
  locale,
  translation: initialTranslation,
  mutateTranslations,
}: BlogPostTranslationFormProps) {
  const { t, i18n } = useT();
  const { data: fetchedTranslation, mutate } = useSWR(
    `/blogPosts/${blogPost.id}/translations/${locale}`,
    () => getBlogPostTranslation(firestore, blogPost.id, locale),
  );
  const translation = initialTranslation ?? fetchedTranslation;
  const translationVersion = getTranslationFormVersion(translation);

  const label =
    `${t(`FormTypes.${type}`)} ` +
    t(`forms.labels.translation`, {
      defaultValue: "Translation",
    });

  const CreateSchemaYupResolver = yupResolver(BlogPostTranslationCreateSchema);
  const UpdateSchemaYupResolver = yupResolver(BlogPostTranslationUpdateSchema);

  const CreateForm = useForm({
    defaultValues: blogPost && initialValuesCreate(locale, blogPost),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "CREATE",
  });

  const UpdateForm = useForm({
    defaultValues:
      blogPost &&
      translation &&
      initialValuesUpdate(locale, blogPost, translation),
    resolver: UpdateSchemaYupResolver,
    disabled: type !== "UPDATE",
  });

  const onSubmit = async (data: Partial<BlogPostTranslation>) => {
    try {
      const payload: Partial<BlogPostTranslation> = {
        ...data,
        translationMeta: createManualTranslationMeta({
          kind: "blogPost",
          source: blogPost,
        }),
      };

      if (translation?.id) {
        // Update existing translation
        await updateBlogPostTranslation(
          firestore,
          blogPost.id,
          locale,
          payload,
        );
      } else {
        // Create new translation
        await createBlogPostTranslation(
          firestore,
          blogPost.id,
          payload as Omit<
            BlogPostTranslation,
            "id" | "createdAt" | "updatedAt"
          >,
        );
        await revalidateTagCache("blogPosts");
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

  // Refs to ensure we only initialize form values when switching entity/locale/type
  const prevPostIdRef = useRef<string | undefined>(undefined);
  const prevLocaleRef = useRef<Locale | undefined>(undefined);
  const prevTypeRef = useRef<string | undefined>(undefined);
  const initializedCreateRef = useRef(false);
  const initializedUpdateTranslationVersionRef = useRef<string | undefined>(
    undefined,
  );

  useEffect(() => {
    const postChanged = prevPostIdRef.current !== blogPost?.id;
    const localeChanged = prevLocaleRef.current !== locale;
    const typeChanged = prevTypeRef.current !== type;

    // Reset guards when core dependencies change
    if (postChanged || localeChanged || typeChanged) {
      initializedCreateRef.current = false;
      initializedUpdateTranslationVersionRef.current = undefined;
    }

    if (type === "CREATE" && blogPost && !initializedCreateRef.current) {
      CreateForm.reset(initialValuesCreate(locale, blogPost));
      initializedCreateRef.current = true;
    }

    if (
      type === "UPDATE" &&
      blogPost &&
      translation &&
      translationVersion &&
      initializedUpdateTranslationVersionRef.current !== translationVersion
    ) {
      UpdateForm.reset(initialValuesUpdate(locale, blogPost, translation));
      initializedUpdateTranslationVersionRef.current = translationVersion;
    }

    prevPostIdRef.current = blogPost?.id;
    prevLocaleRef.current = locale;
    prevTypeRef.current = type;
  }, [
    type,
    blogPost,
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
      formData={blogPostTranslationForm(t)}
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
  blogPost: BlogPost,
): CreateInput => {
  const values: CreateInput = {
    locale: locale,
    title: blogPost.title,
    excerpt: blogPost.excerpt,
    content: blogPost.content,
    seo: {
      title: blogPost.seo.title,
      description: blogPost.seo.description,
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
  blogPost: BlogPost,
  translation?: BlogPostTranslation,
): UpdateInput => {
  const values: UpdateInput = {
    locale: locale,
    title: translation?.title || blogPost.title,
    excerpt: translation?.excerpt || blogPost.excerpt,
    content: translation?.content || blogPost.content,
    seo: {
      title: translation?.seo.title || blogPost.seo.title,
      description: translation?.seo.description || blogPost.seo.description,
    },
    active: translation?.active ?? true,
    updatedBy: {
      id: "",
      name: "",
    },
  };
  return values;
};

export const blogPostTranslationForm = (t: TFunction) => {
  const _blogPostTranslationForm: FormData = {
    allowMultiple: false,
    allowToggle: true,
    sections: [
      {
        fieldArray: false,
        heading: t("forms.blog.posts.headings.basicInformation"),
        isDefaultExpanded: true,
        fields: [
          {
            name: "title",
            label: t("forms.blog.posts.labels.title"),
            isRequired: true,
            placeholder: t("forms.placeholders.myTitle", {
              defaultValue: "My title",
            }),
            generate: {
              systemPrompt:
                "Translate `title` field to the specified locale. Return only the translated text.",
              context: ["root.locale", "title"],
            },
          },
          {
            name: "excerpt",
            label: t("forms.blog.posts.labels.excerpt"),
            isRequired: true,
            placeholder: t("forms.placeholders.myExcerpt", {
              defaultValue: "My excerpt",
            }),
            type: "textarea",
            generate: {
              systemPrompt:
                "Translate `excerpt` field to the specified locale. Return only the translated text.",
              context: ["root.locale", "excerpt"],
            },
          },
          {
            name: "content",
            label: t("forms.blog.posts.labels.content"),
            isRequired: true,
            placeholder: t("forms.placeholders.myContent", {
              defaultValue: "My content",
            }),
            type: "textarea",
            mdxPreview: true,
            generate: {
              systemPrompt:
                "Translate `content` field to the specified locale. Preserve all formatting and markdown/html syntax. Return only the translated text.",
              context: ["root.locale", "content"],
            },
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.blog.posts.headings.seoSettings"),
        isDefaultExpanded: false,
        fields: [
          {
            name: "seo.title",
            label: t("forms.blog.posts.labels.seoTitle"),
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
            label: t("forms.blog.posts.labels.seoDescription"),
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
  return _blogPostTranslationForm;
};
