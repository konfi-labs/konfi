"use client";

import BlogCategoriesTable from "@/components/blog/BlogCategoriesTable";
import { useBlogCategories } from "@/hooks/useBlog";
import { useT } from "@/i18n/client";
import { Card, Stack } from "@chakra-ui/react";
import { ButtonLink, CustomHeading, MaterialSymbol } from "@konfi/components";
import { ADMIN_BLOG_CATEGORIES_CREATE } from "@konfi/utils";
import { useParams } from "next/navigation";

export default function BlogCategoriesPage() {
  const params = useParams();
  const lng = params.lng as string;
  const { t } = useT();
  const { data: categories, isLoading, mutate } = useBlogCategories(true);

  const handleCategoryDeleted = (categoryId: string) => {
    // Refresh the data after deletion
    mutate();
  };

  return (
    <Stack gap={6}>
      <CustomHeading
        heading={t("blog.categories.title")}
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <Stack direction="row" justify="space-between" align="center">
        <ButtonLink
          lng={lng}
          href={ADMIN_BLOG_CATEGORIES_CREATE}
          size="sm"
          colorPalette="primary"
          variant="solid"
          ariaLabel={t("blog.categories.create")}
        >
          <MaterialSymbol>add</MaterialSymbol>
          {t("blog.categories.create")}
        </ButtonLink>
      </Stack>

      <Card.Root>
        <Card.Body>
          <BlogCategoriesTable
            categories={categories || []}
            isLoading={isLoading}
            onCategoryDeleted={handleCategoryDeleted}
          />
        </Card.Body>
      </Card.Root>
    </Stack>
  );
}
