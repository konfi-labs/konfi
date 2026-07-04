"use client";

import BlogPostsTable from "@/components/blog/BlogPostsTable";
import { useBlogPosts } from "@/hooks/useBlog";
import { useT } from "@/i18n/client";
import { Card, Stack } from "@chakra-ui/react";
import { ButtonLink, CustomHeading, MaterialSymbol } from "@konfi/components";
import { ADMIN_BLOG_POSTS_CREATE } from "@konfi/utils";
import { useParams } from "next/navigation";

export default function BlogPostsPage() {
  const params = useParams();
  const lng = params.lng as string;
  const { t } = useT();
  const { data: postsData, isLoading, mutate } = useBlogPosts();

  const handlePostDeleted = (postId: string) => {
    // Refresh the data after deletion
    mutate();
  };

  return (
    <Stack gap={6}>
      <CustomHeading
        heading={t("blog.posts.title")}
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <Stack direction="row" justify="space-between" align="center">
        <ButtonLink
          lng={lng}
          href={ADMIN_BLOG_POSTS_CREATE}
          size="sm"
          colorPalette="primary"
          variant="solid"
          ariaLabel={t("blog.posts.create")}
        >
          <MaterialSymbol>add</MaterialSymbol>
          {t("blog.posts.create")}
        </ButtonLink>
      </Stack>

      <Card.Root>
        <Card.Body>
          <BlogPostsTable
            posts={postsData?.posts || []}
            isLoading={isLoading}
            lng={lng}
            onPostDeleted={handlePostDeleted}
          />
        </Card.Body>
      </Card.Root>
    </Stack>
  );
}
