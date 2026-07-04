"use client";

import BlogCategoryForm from "@/components/blog/BlogCategoryForm";
import { BlogCategoryTranslationForm } from "@/components/blog/BlogCategoryTranslationForm";
import AdminLoadingSkeleton from "@/components/layout/AdminLoadingSkeleton";
import { TranslationPanel } from "@/components/translations/TranslationPanel";
import { useBlogCategory } from "@/hooks/useBlog";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { Stack } from "@chakra-ui/react";
import { CustomHeading, EmptyState } from "@konfi/components";
import { getBlogCategoryTranslations } from "@konfi/firebase";
import { BlogCategory } from "@konfi/types";
import { ADMIN_BLOG_CATEGORIES } from "@konfi/utils";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";

export default function EditBlogCategoryPage() {
  const { t } = useT();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { data: category, isLoading, error } = useBlogCategory(params?.id);

  const handleSuccess = () => {
    router.push(ADMIN_BLOG_CATEGORIES);
  };

  const handleCancel = () => {
    router.push(ADMIN_BLOG_CATEGORIES);
  };

  if (isLoading) {
    return (
      <Stack gap={6}>
        <CustomHeading
          heading={t("blog.categories.editTitle")}
          breadcrumb={true}
          goBack={true}
          t={t}
        />
        <AdminLoadingSkeleton variant="fields" showHeader={false} rows={6} />
      </Stack>
    );
  }

  if (error || !category) {
    return (
      <Stack gap={6}>
        <CustomHeading
          heading={t("blog.categories.editTitle")}
          breadcrumb={true}
          goBack={true}
          t={t}
        />
        <EmptyState
          title={t("blog.categories.notFound")}
          description={t("blog.categories.notFoundDescription")}
        />
      </Stack>
    );
  }

  return (
    <Stack gap={6}>
      <CustomHeading
        heading={t("blog.categories.editTitle")}
        breadcrumb={true}
        goBack={true}
        t={t}
      />

      <BlogCategoryForm
        category={category}
        onSuccess={handleSuccess}
        onCancel={handleCancel}
      />

      {category && (
        <CategoryTranslationsPanel
          categoryId={category.id}
          category={category}
        />
      )}
    </Stack>
  );
}

// Separate component to handle translations fetching & rendering
function CategoryTranslationsPanel({
  categoryId,
  category,
}: {
  categoryId: string;
  category: BlogCategory;
}) {
  const { data: translations, mutate: mutateTranslations } = useSWR(
    categoryId ? ["blogCategoryTranslations", categoryId] : null,
    () => getBlogCategoryTranslations(firestore, categoryId),
  );
  return (
    <TranslationPanel
      kind="blogCategory"
      source={category}
      translationRef={{ kind: "blogCategory", entityId: categoryId }}
      translations={translations}
      onMutate={mutateTranslations}
      renderForm={({ locale, translation, type }) => (
        <BlogCategoryTranslationForm
          locale={locale}
          blogCategory={category}
          type={type}
          translation={translation}
          mutateTranslations={mutateTranslations}
        />
      )}
    />
  );
}
