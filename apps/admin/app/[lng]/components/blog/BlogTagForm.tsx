"use client";

import { revalidateTagCache } from "@/actions";
import { ensureEntityTranslationsAction } from "@/actions/managed-translations";
import { useT } from "@/i18n/client";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import { createBlogTag, updateBlogTag } from "@konfi/firebase";
import { BlogTag, FormData } from "@konfi/types";
import { BlogTagCreateSchema, toSlug } from "@konfi/utils";
import type { TFunction } from "i18next";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { InferType } from "yup";
import { By } from "../form/field-controllers/By";

interface BlogTagFormProps {
  tag?: BlogTag;
  onSuccess?: (tagId: string) => void;
  onCancel?: () => void;
}

export default function BlogTagForm({
  tag,
  onSuccess,
  onCancel,
}: BlogTagFormProps) {
  const { t, i18n } = useT();

  // Get form configuration
  const formConfig = blogTagForm(t);

  const methods = useForm({
    resolver: yupResolver(BlogTagCreateSchema),
    defaultValues: tag
      ? {
          name: tag.name,
          slug: tag.slug,
          description: tag.description || "",
          active: tag.active,
          createdBy: tag.createdBy,
          updatedBy: {
            id: "",
            name: "",
          },
        }
      : {
          name: "",
          slug: "",
          description: "",
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
    if (watchName && !tag) {
      // Only auto-generate for new tags
      const slug = toSlug(watchName);
      setValue("slug", slug);
    }
  }, [watchName, setValue, tag]);

  // Sync updatedBy with createdBy for new tags
  useEffect(() => {
    if (!tag && watchCreatedBy) {
      // Only for new tags
      setValue("updatedBy", watchCreatedBy, {
        shouldValidate: false,
        shouldDirty: false,
      });
    }
  }, [watchCreatedBy, setValue, tag]);

  const handleSubmit = async (
    data: InferType<typeof BlogTagCreateSchema> & {
      updatedBy: { id: string; name: string };
      createdBy: { id: string; name: string };
    },
  ) => {
    try {
      if (tag) {
        // Update existing tag
        const tagData = {
          ...data,
          slug: toSlug(data.slug),
        };

        await updateBlogTag(
          tag.id,
          tagData,
          {
            id: data.updatedBy.id,
            name: data.updatedBy.name,
          },
          revalidateTagCache,
        );

        toaster.create({
          title: t("forms.blog.tags.messages.updateSuccess"),
          type: "success",
        });
      } else {
        // Create new tag
        const tagData = {
          ...data,
          slug: toSlug(data.slug),
        };

        const tagId = await createBlogTag(tagData, revalidateTagCache);

        toaster.create({
          title: t("forms.blog.tags.messages.success"),
          type: "success",
        });

        void ensureEntityTranslationsAction({
          kind: "blogTag",
          entityId: tagId,
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
            console.error("[BlogTagForm] Auto-translation failed", error);
            toaster.warning({
              title: t("translations.managed.toasts.autoWarning", {
                defaultValue: "Created, but auto-translation failed",
              }),
            });
          });

        if (onSuccess) {
          onSuccess(tagId);
        }

        return tagId;
      }
    } catch (error) {
      console.error(`Error ${tag ? "updating" : "creating"} blog tag:`, error);
      toaster.create({
        title: t(`forms.blog.tags.messages.${tag ? "updateError" : "error"}`),
        type: "error",
      });
      throw error;
    }
  };

  return (
    <FormController
      methods={methods}
      buttonLabel={
        tag
          ? t("forms.blog.tags.buttons.update")
          : t("forms.blog.tags.buttons.submit")
      }
      formData={formConfig}
      handleSubmit={handleSubmit}
      t={t}
      i18n={i18n}
      By={<By update={tag ? true : false} />}
    />
  );
}

const blogTagForm = (t: TFunction): FormData => ({
  allowMultiple: true,
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
        },
        {
          name: "slug",
          label: t("forms.blog.tags.labels.slug"),
          isRequired: true,
          placeholder: t("forms.blog.tags.placeholders.slug"),
        },
        {
          name: "description",
          label: t("forms.blog.tags.labels.description"),
          type: "textarea",
          placeholder: t("forms.blog.tags.placeholders.description"),
        },
      ],
    },
  ],
});
