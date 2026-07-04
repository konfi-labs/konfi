"use client";

import { revalidateTagCache } from "@/actions";
import { ensureEntityTranslationsAction } from "@/actions/managed-translations";
import { useT } from "@/i18n/client";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import {
  createBlogCategory,
  MODELS,
  updateBlogCategory,
} from "@konfi/firebase";
import { BlogCategory, DEFAULT_LOCALE, FormData } from "@konfi/types";
import { BlogCategoryCreateSchema, toSlug } from "@konfi/utils";
import type { TFunction } from "i18next";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { InferType } from "yup";
import { By } from "../form/field-controllers/By";
import Generate from "../form/field-controllers/Generate";

interface BlogCategoryFormProps {
  category?: BlogCategory;
  onSuccess?: (categoryId: string) => void;
  onCancel?: () => void;
}

export default function BlogCategoryForm({
  category,
  onSuccess,
  onCancel,
}: BlogCategoryFormProps) {
  const { t, i18n } = useT();

  // Get form configuration
  const formConfig = blogCategoryForm(
    t,
    i18n.resolvedLanguage ?? DEFAULT_LOCALE,
  );

  const methods = useForm({
    resolver: yupResolver(BlogCategoryCreateSchema),
    defaultValues: category
      ? {
          name: category.name,
          slug: category.slug,
          description: category.description || "",
          seo: {
            title: category.seo?.title || "",
            description: category.seo?.description || "",
          },
          active: category.active,
          createdBy: category.createdBy,
          updatedBy: {
            id: "",
            name: "",
          },
        }
      : {
          name: "",
          slug: "",
          description: "",
          seo: {
            title: "",
            description: "",
          },
          active: true,
          createdBy: {
            id: "",
            name: "",
          },
          updatedBy: {
            id: "",
            name: "",
          },
        },
  });

  const { watch, setValue } = methods;
  const watchName = watch("name");
  const watchCreatedBy = watch("createdBy");

  // Auto-generate slug from name
  useEffect(() => {
    if (watchName && !category) {
      // Only auto-generate for new categories
      const slug = toSlug(watchName);
      setValue("slug", slug);

      // Auto-generate SEO title if empty
      if (!watch("seo.title")) {
        setValue("seo.title", watchName);
      }
    }
  }, [watchName, setValue, watch, category]);

  // Sync updatedBy with createdBy for new categories
  useEffect(() => {
    if (!category && watchCreatedBy) {
      // Only for new categories
      setValue("updatedBy", watchCreatedBy, {
        shouldValidate: false,
        shouldDirty: false,
      });
    }
  }, [watchCreatedBy, setValue, category]);

  const handleSubmit = async (
    data: InferType<typeof BlogCategoryCreateSchema> & {
      updatedBy: { id: string; name: string };
      createdBy: { id: string; name: string };
    },
  ) => {
    try {
      if (category) {
        // Update existing category
        const categoryData = {
          ...data,
          slug: toSlug(data.slug),
        };

        await updateBlogCategory(
          category.id,
          categoryData,
          {
            id: data.updatedBy.id,
            name: data.updatedBy.name,
          },
          revalidateTagCache,
        );

        toaster.create({
          title: t("forms.blog.categories.messages.updateSuccess"),
          type: "success",
        });
      } else {
        // Create new category
        const categoryData = {
          ...data,
          slug: toSlug(data.slug),
        };

        const categoryId = await createBlogCategory(
          categoryData,
          revalidateTagCache,
        );

        toaster.create({
          title: t("forms.blog.categories.messages.success"),
          type: "success",
        });

        void ensureEntityTranslationsAction({
          kind: "blogCategory",
          entityId: categoryId,
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
            console.error("[BlogCategoryForm] Auto-translation failed", error);
            toaster.warning({
              title: t("translations.managed.toasts.autoWarning", {
                defaultValue: "Created, but auto-translation failed",
              }),
            });
          });

        if (onSuccess) {
          onSuccess(categoryId);
        }

        return categoryId;
      }
    } catch (error) {
      console.error(
        `Error ${category ? "updating" : "creating"} blog category:`,
        error,
      );
      toaster.create({
        title: t(
          `forms.blog.categories.messages.${category ? "updateError" : "error"}`,
        ),
        type: "error",
      });
      throw error;
    }
  };

  return (
    <FormController
      methods={methods}
      buttonLabel={
        category
          ? t("forms.blog.categories.buttons.update")
          : t("forms.blog.categories.buttons.submit")
      }
      formData={formConfig}
      handleSubmit={handleSubmit}
      t={t}
      i18n={i18n}
      Generate={Generate}
      By={<By update={category ? true : false} />}
    />
  );
}

const blogCategoryForm = (t: TFunction, lng: string): FormData => ({
  allowMultiple: true,
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
        },
        {
          name: "slug",
          label: t("forms.blog.categories.labels.slug"),
          isRequired: true,
          placeholder: t("forms.blog.categories.placeholders.slug"),
        },
        {
          name: "description",
          label: t("forms.blog.categories.labels.description"),
          type: "textarea",
          placeholder: t("forms.blog.categories.placeholders.description"),
          generate: {
            systemPrompt: `
              Generate a description for the blog category based on its name. Return just the description text. Language of the response should be ${lng}.
            `,
            context: ["name"],
            model: MODELS.GEMINI_3_FLASH_LITE,
            stream: true,
          },
        },
      ],
    },
    {
      fieldArray: false,
      heading: t("forms.blog.categories.headings.seoSettings"),
      isDefaultExpanded: true,
      fields: [
        {
          name: "seo.title",
          label: t("forms.blog.categories.labels.seoTitle"),
          placeholder: t("forms.blog.categories.placeholders.seoTitle"),
          generate: {
            systemPrompt: `
              Generate a SEO title for the blog category based on its name and description. Return just the SEO title text. Language of the response should be ${lng}.
            `,
            context: ["name", "description"],
            model: MODELS.GEMINI_3_FLASH_LITE,
          },
        },
        {
          name: "seo.description",
          label: t("forms.blog.categories.labels.seoDescription"),
          type: "textarea",
          placeholder: t("forms.blog.categories.placeholders.seoDescription"),
          generate: {
            systemPrompt: `
              Generate a SEO description for the blog category based on its name and description. Return just the SEO description text. Language of the response should be ${lng}.
            `,
            context: ["name", "description"],
            model: MODELS.GEMINI_3_FLASH_LITE,
          },
        },
      ],
    },
  ],
});
