"use client";

import { useT } from "@/i18n/client";
import { SimpleGrid, Skeleton, Stat } from "@chakra-ui/react";
import { BlogCategory, BlogPost, BlogPostStatus, BlogTag } from "@konfi/types";

interface BlogStatisticsProps {
  posts: BlogPost[];
  categories: BlogCategory[];
  tags: BlogTag[];
  isLoading: boolean;
}

export default function BlogStatistics({
  posts,
  categories,
  tags,
  isLoading,
}: BlogStatisticsProps) {
  const { t } = useT();

  const publishedPosts =
    posts?.filter((post) => post.status === BlogPostStatus.PUBLISHED) || [];
  const totalViews =
    posts?.reduce((sum, post) => sum + (post.views || 0), 0) || 0;

  if (isLoading) {
    return (
      <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} gap={6}>
        {[...Array(4)].map((_, index) => (
          <Stat.Root key={index}>
            <Skeleton height="20px" mb={2} />
            <Skeleton height="32px" />
          </Stat.Root>
        ))}
      </SimpleGrid>
    );
  }

  return (
    <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} gap={6}>
      <Stat.Root>
        <Stat.Label>{t("blog.stats.totalPosts")}</Stat.Label>
        <Stat.ValueText>{posts?.length || 0}</Stat.ValueText>
        <Stat.HelpText>
          {publishedPosts.length} {t("blog.stats.published")}
        </Stat.HelpText>
      </Stat.Root>

      <Stat.Root>
        <Stat.Label>{t("blog.stats.totalCategories")}</Stat.Label>
        <Stat.ValueText>{categories?.length || 0}</Stat.ValueText>
      </Stat.Root>

      <Stat.Root>
        <Stat.Label>{t("blog.stats.totalTags")}</Stat.Label>
        <Stat.ValueText>{tags?.length || 0}</Stat.ValueText>
      </Stat.Root>

      <Stat.Root>
        <Stat.Label>{t("blog.stats.totalViews")}</Stat.Label>
        <Stat.ValueText>{totalViews.toLocaleString()}</Stat.ValueText>
      </Stat.Root>
    </SimpleGrid>
  );
}
