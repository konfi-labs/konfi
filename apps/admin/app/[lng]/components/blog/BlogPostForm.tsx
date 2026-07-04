"use client";

import { revalidateTagCache } from "@/actions";
import { ensureEntityTranslationsAction } from "@/actions/managed-translations";
import { useT } from "@/i18n/client";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import {
  calculateReadingTime,
  createBlogPost,
  getBlogCategories,
  getBlogTags,
  isBlogSlugUnique,
  MODELS,
  updateBlogPost,
} from "@konfi/firebase";
import {
  BlogCategory,
  BlogPost,
  BlogPostStatus,
  BlogTag,
  DEFAULT_LOCALE,
  FormData,
} from "@konfi/types";
import { BlogPostCreateSchema, toSlug } from "@konfi/utils";
import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { InferType } from "yup";
import { By } from "../form/field-controllers/By";
import Generate from "../form/field-controllers/Generate";

interface BlogPostFormProps {
  post?: BlogPost;
  onSuccess?: (postId: string) => void;
  onCancel?: () => void;
}

export default function BlogPostForm({
  post,
  onSuccess,
  onCancel,
}: BlogPostFormProps) {
  const { t, i18n } = useT();
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [tags, setTags] = useState<BlogTag[]>([]);
  const [slugChecking, setSlugChecking] = useState(false);

  // Get form configuration with loaded categories and tags
  const formConfig = blogPostForm(
    t,
    i18n.resolvedLanguage ?? DEFAULT_LOCALE,
    categories,
    tags,
  );

  const methods = useForm({
    resolver: yupResolver(BlogPostCreateSchema),
    defaultValues: post
      ? {
          name: post.name,
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt,
          content: post.content,
          featuredImage: post.featuredImage || "",
          status: post.status,
          categories: post.categories,
          tags: post.tags,
          seo: {
            title: post.seo?.title || "",
            description: post.seo?.description || "",
          },
          active: post.active,
          createdBy: post.createdBy,
          updatedBy: {
            id: "",
            name: "",
          },
        }
      : {
          name: "",
          title: "",
          slug: "",
          excerpt: "",
          content: "",
          featuredImage: "",
          status: BlogPostStatus.DRAFT,
          categories: [],
          tags: [],
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
  const watchTitle = watch("title");
  const watchContent = watch("content");
  const watchCreatedBy = watch("createdBy");

  useEffect(() => {
    const loadData = async () => {
      try {
        const [categoriesResult, tagsResult] = await Promise.all([
          getBlogCategories(),
          getBlogTags(),
        ]);
        setCategories(categoriesResult);
        setTags(tagsResult);
      } catch (error) {
        console.error("Error loading blog data:", error);
      }
    };

    loadData();
  }, []);

  // Auto-generate slug from title
  useEffect(() => {
    if (watchTitle && !post) {
      // Only auto-generate for new posts
      const slug = toSlug(watchTitle);
      setValue("slug", slug);
      setValue("name", watchTitle); // Use title as name

      // Auto-generate SEO title if empty
      if (!watch("seo.title")) {
        setValue("seo.title", watchTitle);
      }
    }
  }, [watchTitle, setValue, watch, post]);

  // Auto-generate excerpt from content if empty
  useEffect(() => {
    if (watchContent && !watch("excerpt") && !post) {
      // Only auto-generate for new posts
      const plainText = watchContent.replace(/<[^>]*>/g, "");
      const excerpt =
        plainText.substring(0, 300) + (plainText.length > 300 ? "..." : "");
      setValue("excerpt", excerpt);
    }
  }, [watchContent, setValue, watch, post]);

  // Sync updatedBy with createdBy for new posts
  useEffect(() => {
    if (!post && watchCreatedBy) {
      // Only for new posts
      setValue("updatedBy", watchCreatedBy, {
        shouldValidate: false,
        shouldDirty: false,
      });
    }
  }, [watchCreatedBy, setValue, post]);

  const checkSlugUniqueness = async (slug: string) => {
    if (!slug) return;

    setSlugChecking(true);
    try {
      const isUnique = await isBlogSlugUnique(slug, post?.id);
      if (!isUnique) {
        // Add timestamp to make it unique
        const uniqueSlug = `${slug}-${Date.now()}`;
        setValue("slug", uniqueSlug);
      }
    } catch (error) {
      console.error("Error checking slug uniqueness:", error);
    } finally {
      setSlugChecking(false);
    }
  };

  const handleSubmit = async (
    data: InferType<typeof BlogPostCreateSchema> & {
      updatedBy: { id: string; name: string };
      createdBy: { id: string; name: string };
    },
  ) => {
    try {
      // Calculate reading time
      const readTime = calculateReadingTime(data.content);

      // Ensure slug is sanitized
      const postData = {
        ...data,
        slug: toSlug(data.slug),
        readTime,
      };

      let postId: string;

      if (post) {
        // Update existing post
        await updateBlogPost(
          post.id,
          {
            ...postData,
          },
          postData.updatedBy,
          revalidateTagCache,
          post.slug,
        );
        postId = post.id;

        toaster.create({
          title: t("forms.blog.posts.messages.updateSuccess"),
          type: "success",
        });
      } else {
        // Create new post
        postId = await createBlogPost(
          {
            ...postData,
          },
          revalidateTagCache,
        );

        toaster.create({
          title: t("forms.blog.posts.messages.success"),
          type: "success",
        });

        void ensureEntityTranslationsAction({
          kind: "blogPost",
          entityId: postId,
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
            console.error("[BlogPostForm] Auto-translation failed", error);
            toaster.warning({
              title: t("translations.managed.toasts.autoWarning", {
                defaultValue: "Created, but auto-translation failed",
              }),
            });
          });
      }

      if (onSuccess) {
        onSuccess(postId);
      }

      return postId;
    } catch (error) {
      console.error("Error saving blog post:", error);
      toaster.create({
        title: post
          ? t("forms.blog.posts.messages.updateError")
          : t("forms.blog.posts.messages.error"),
        type: "error",
      });
      throw error;
    }
  };

  return (
    <FormController
      methods={methods}
      buttonLabel={
        post
          ? t("forms.blog.posts.buttons.update")
          : t("forms.blog.posts.buttons.submit")
      }
      formData={formConfig}
      handleSubmit={handleSubmit}
      t={t}
      i18n={i18n}
      Generate={Generate}
      By={<By update={post ? true : false} />}
    />
  );
}

const blogPostForm = (
  t: TFunction,
  lng: string,
  categories: BlogCategory[] = [],
  tags: BlogTag[] = [],
): FormData => ({
  allowMultiple: true,
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
          placeholder: t("forms.blog.posts.placeholders.title"),
        },
        {
          name: "slug",
          label: t("forms.blog.posts.labels.slug"),
          isRequired: true,
          placeholder: t("forms.blog.posts.placeholders.slug"),
        },
        {
          name: "excerpt",
          label: t("forms.blog.posts.labels.excerpt"),
          type: "textarea",
          placeholder: t("forms.blog.posts.placeholders.excerpt"),
        },
        {
          name: "content",
          label: t("forms.blog.posts.labels.content"),
          type: "textarea",
          isRequired: true,
          placeholder: t("forms.blog.posts.placeholders.content"),
          mdxPreview: true,
          watch: true,
        },
        {
          name: "featuredImage",
          label: t("forms.blog.posts.labels.featuredImage"),
          isRequired: false,
          type: "fileManager",
          imageProps: {
            prefix: "cms/blog/",
            includePrefix: false,
            maxNumber: 1,
            maxFiles: 1,
            maxFileSize: 10,
            acceptType: ["jpeg", "jpg", "png"],
          },
        },
        {
          name: "status",
          label: t("forms.blog.posts.labels.status"),
          type: "select",
          isRequired: true,
          options: [
            { label: "Draft", value: BlogPostStatus.DRAFT },
            { label: "Published", value: BlogPostStatus.PUBLISHED },
            { label: "Scheduled", value: BlogPostStatus.SCHEDULED },
          ],
        },
      ],
    },
    {
      fieldArray: false,
      heading: t("forms.blog.posts.headings.categorization"),
      isDefaultExpanded: true,
      fields: [
        {
          name: "categories",
          label: t("forms.blog.posts.labels.categories"),
          type: "multiSelect",
          options: categories.map((category) => ({
            label: category.name,
            value: category.id,
          })),
        },
        {
          name: "tags",
          label: t("forms.blog.posts.labels.tags"),
          type: "multiSelect",
          options: tags.map((tag) => ({
            label: tag.name,
            value: tag.id,
          })),
        },
      ],
    },
    {
      fieldArray: false,
      heading: t("forms.blog.posts.headings.seoSettings"),
      isDefaultExpanded: true,
      fields: [
        {
          name: "seo.title",
          label: t("forms.blog.posts.labels.seoTitle"),
          placeholder: t("forms.blog.posts.placeholders.seoTitle"),
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
          label: t("forms.blog.posts.labels.seoDescription"),
          type: "textarea",
          placeholder: t("forms.blog.posts.placeholders.seoDescription"),
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
