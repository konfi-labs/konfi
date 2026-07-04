"use client";

import BlogTagsTable from "@/components/blog/BlogTagsTable";
import { useBlogTagPostCounts, useBlogTags } from "@/hooks/useBlog";
import { useT } from "@/i18n/client";
import { Card, Stack } from "@chakra-ui/react";
import { ButtonLink, CustomHeading, MaterialSymbol } from "@konfi/components";
import { ADMIN_BLOG_TAGS_CREATE } from "@konfi/utils";
import { useParams } from "next/navigation";

export default function BlogTagsPage() {
  const params = useParams();
  const lng = params.lng as string;
  const { t } = useT();
  const { data: tags, isLoading, mutate } = useBlogTags();
  const {
    data: counts,
    isLoading: isLoadingCounts,
    error: countsError,
  } = useBlogTagPostCounts(tags);

  const handleTagDeleted = (tagId: string) => {
    // Refresh the data after deletion
    mutate();
  };

  return (
    <Stack gap={6}>
      <CustomHeading
        heading={t("blog.tags.title")}
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <Stack direction="row" justify="space-between" align="center">
        <ButtonLink
          lng={lng}
          href={ADMIN_BLOG_TAGS_CREATE}
          size="sm"
          colorPalette="primary"
          variant="solid"
          ariaLabel={t("blog.tags.create")}
        >
          <MaterialSymbol>add</MaterialSymbol>
          {t("blog.tags.create")}
        </ButtonLink>
      </Stack>

      <Card.Root>
        <Card.Body>
          <BlogTagsTable
            tags={tags || []}
            isLoading={isLoading}
            onTagDeleted={handleTagDeleted}
            counts={counts}
            isLoadingCounts={isLoadingCounts}
            countsError={countsError}
          />
        </Card.Body>
      </Card.Root>
    </Stack>
  );
}
