"use client";

import { useStoreRuntimeConfig } from "@/context/runtime-config";
import { useT } from "@/i18n/client";
import { buildRuntimeAssetUrl } from "@/lib/runtime-config";
import {
  AspectRatio,
  Box,
  Button,
  Card,
  Center,
  Heading,
  HStack,
  Image,
  SimpleGrid,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Empty, LinkOverlay, Tag } from "@konfi/components";
import { getPublishedBlogPosts } from "@konfi/firebase";
import { BlogCategory, BlogPost, BlogTag } from "@konfi/types";
import { formatDate } from "@konfi/utils";
import { isEmpty } from "es-toolkit/compat";
import { useEffect, useState } from "react";

interface BlogListProps {
  lng: string;
  initialPosts?: BlogPost[];
  initialHasMore?: boolean;
  initialNextCursor?: string;
  categories?: BlogCategory[];
  tags?: BlogTag[];
  categoryFilter?: string;
  tagFilter?: string;
}

export default function BlogList({
  lng,
  initialPosts = [],
  initialHasMore = false,
  initialNextCursor,
  categories = [],
  tags = [],
  categoryFilter,
  tagFilter,
}: BlogListProps) {
  const { t } = useT();
  const runtimeConfig = useStoreRuntimeConfig();
  const [posts, setPosts] = useState<BlogPost[]>(initialPosts);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextCursor, setNextCursor] = useState<string | undefined>(
    initialNextCursor,
  );

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const postsResult = await getPublishedBlogPosts({
          limit: 10,
          categories: categoryFilter ? [categoryFilter] : undefined,
          tags: tagFilter ? [tagFilter] : undefined,
        });

        setPosts(postsResult.posts);
        setHasMore(postsResult.hasMore);
        setNextCursor(postsResult.nextCursor);
      } catch (error) {
        console.error("Error loading blog data:", error);
      } finally {
        setLoading(false);
      }
    };

    // Only load data client-side if we don't have initial posts
    // or if we have category/tag filters (which means we need fresh data)
    if (!initialPosts.length || categoryFilter || tagFilter) {
      loadData();
    }
  }, [categoryFilter, tagFilter, initialPosts.length]);

  const loadMorePosts = async () => {
    if (!hasMore || loading) return;

    setLoading(true);
    try {
      const result = await getPublishedBlogPosts({
        limit: 10,
        cursor: nextCursor,
        categories: categoryFilter ? [categoryFilter] : undefined,
        tags: tagFilter ? [tagFilter] : undefined,
      });

      // Deduplicate posts by ID to prevent showing the same post twice
      const existingPostIds = new Set(posts.map((post) => post.id));
      const newPosts = result.posts.filter(
        (post) => !existingPostIds.has(post.id),
      );

      setPosts((prev) => [...prev, ...newPosts]);
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
    } catch (error) {
      console.error("Error loading more posts:", error);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryName = (categoryId: string) => {
    const category = categories.find((c) => c.id === categoryId);
    return category?.name || categoryId;
  };

  const getTagName = (tagId: string) => {
    const tag = tags.find((t) => t.id === tagId);
    return tag?.name || tagId;
  };

  const renderBlogCard = (post: BlogPost, isFeatured = false) => (
    <LinkOverlay
      key={post.id}
      href={`/blog/${post.slug}`}
      lng={lng}
      prefetch={true}
    >
      <Card.Root overflow="hidden" height="100%">
        {post.featuredImage && (
          <AspectRatio ratio={isFeatured ? 21 / 9 : 16 / 9}>
            <Image
              src={
                buildRuntimeAssetUrl(
                  runtimeConfig.cdnUrl,
                  `cms/blog/${post.featuredImage}?fit=max&auto=format,compress`,
                ) ?? ""
              }
              alt={post.title}
              objectFit="cover"
            />
          </AspectRatio>
        )}

        <Card.Body p={6}>
          <VStack align="start" gap={3} height="100%">
            <Heading
              as="h2"
              size={isFeatured ? "xl" : "lg"}
              lineHeight="1.2"
              lineClamp={isFeatured ? 2 : 3}
            >
              {post.title}
            </Heading>

            <Text
              color={{ base: "gray.600", _dark: "gray.400" }}
              fontSize={isFeatured ? "md" : "sm"}
              lineClamp={isFeatured ? 3 : 2}
              flexGrow={1}
            >
              {post.excerpt}
            </Text>

            <VStack align="start" gap={2} width="100%">
              <HStack
                gap={4}
                flexWrap="wrap"
                fontSize="sm"
                color={{ base: "gray.500", _dark: "gray.400" }}
              >
                <Text>{formatDate(post.publishedAt, lng)}</Text>
                {post.readTime && (
                  <Text>
                    {post.readTime} {t("blog.minRead")}
                  </Text>
                )}
              </HStack>

              {/* Categories and Tags */}
              <HStack gap={2} flexWrap="wrap">
                {post.categories.slice(0, 2).map((categoryId) => (
                  <Tag key={categoryId} colorScheme="primary" size="sm">
                    {getCategoryName(categoryId)}
                  </Tag>
                ))}
                {post.tags.slice(0, 2).map((tagId) => (
                  <Tag key={tagId} colorScheme="gray" size="sm">
                    {getTagName(tagId)}
                  </Tag>
                ))}
              </HStack>
            </VStack>
          </VStack>
        </Card.Body>
      </Card.Root>
    </LinkOverlay>
  );

  const renderBlogGrid = () => {
    if (posts.length === 0) return null;

    // If only 1-2 posts, show them in a simple layout
    if (posts.length <= 2) {
      return (
        <SimpleGrid
          columns={{ base: 1, md: posts.length === 1 ? 1 : 2 }}
          gap={6}
          maxW={posts.length === 1 ? "2xl" : "full"}
          mx={posts.length === 1 ? "auto" : "0"}
        >
          {posts.map((post) => renderBlogCard(post, posts.length === 1))}
        </SimpleGrid>
      );
    }

    // For 3+ posts, show featured layout with first post larger
    const [featuredPost, ...regularPosts] = posts;

    return (
      <VStack gap={8} align="stretch">
        {/* Featured Post */}
        <Box maxW="4xl" mx="auto" width="100%">
          {renderBlogCard(featuredPost, true)}
        </Box>

        {/* Regular Posts Grid */}
        {regularPosts.length > 0 && (
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={6}>
            {regularPosts.map((post) => renderBlogCard(post, false))}
          </SimpleGrid>
        )}
      </VStack>
    );
  };

  return (
    <Stack gap={8}>
      {/* Blog Posts */}
      {renderBlogGrid()}

      {/* Empty State */}
      {!loading && isEmpty(posts) && (
        <Empty
          title={t("blog.empty")}
          description={t("blog.emptyDescription")}
          icon="amp_stories"
        />
      )}

      {/* Load More Button */}
      {hasMore && (
        <Center>
          <Button
            colorPalette="primary"
            onClick={loadMorePosts}
            loading={loading}
            disabled={loading}
          >
            {loading ? t("common.loading") : t("common.loadMore")}
          </Button>
        </Center>
      )}
    </Stack>
  );
}
