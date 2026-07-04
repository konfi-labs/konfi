"use client";

import BlogStatistics from "@/components/blog/BlogStatistics";
import { useBlogData } from "@/hooks/useBlog";
import { useT } from "@/i18n/client";
import { Card, Heading, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { ButtonLink, CustomHeading, MaterialSymbol } from "@konfi/components";
import {
  ADMIN_BLOG_CATEGORIES,
  ADMIN_BLOG_POSTS,
  ADMIN_BLOG_TAGS,
} from "@konfi/utils";
import { useParams } from "next/navigation";

export default function BlogMainPage() {
  const params = useParams();
  const lng = params.lng as string;
  const { t } = useT();
  const { posts, categories, tags, isLoading } = useBlogData();

  const blogSections = [
    {
      title: t("blog.sections.posts"),
      description: t("blog.sections.postsDescription"),
      href: ADMIN_BLOG_POSTS,
      icon: "article",
    },
    {
      title: t("blog.sections.categories"),
      description: t("blog.sections.categoriesDescription"),
      href: ADMIN_BLOG_CATEGORIES,
      icon: "folder",
    },
    {
      title: t("blog.sections.tags"),
      description: t("blog.sections.tagsDescription"),
      href: ADMIN_BLOG_TAGS,
      icon: "label",
    },
  ];

  return (
    <Stack gap={6}>
      <CustomHeading
        heading={t("blog.title")}
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <BlogStatistics
        posts={posts.data?.posts || []}
        categories={categories.data || []}
        tags={tags.data || []}
        isLoading={isLoading}
      />
      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={6}>
        {blogSections.map((section) => (
          <Card.Root key={section.href} size="lg">
            <Card.Body>
              <Stack gap={4}>
                <Stack direction="row" align="center" gap={3}>
                  <Heading as="h2" size="lg">
                    {section.title}
                  </Heading>
                </Stack>
                <Text color={{ base: "gray.600", _dark: "gray.300" }}>
                  {section.description}
                </Text>
              </Stack>
            </Card.Body>
            <Card.Footer>
              <ButtonLink
                lng={lng}
                href={section.href}
                size="sm"
                variant="outline"
                w="full"
                ariaLabel={t("blog.manage")}
              >
                <MaterialSymbol>{section.icon}</MaterialSymbol>
                {t("blog.manage")}
              </ButtonLink>
            </Card.Footer>
          </Card.Root>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
