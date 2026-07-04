"use client";

import { useStoreRuntimeConfig } from "@/context/runtime-config";
import { useT } from "@/i18n/client";
import { buildRuntimeAssetUrl } from "@/lib/runtime-config";
import {
  Box,
  Heading,
  HStack,
  Image,
  Link as ChakraLink,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Preview, Tag } from "@konfi/components";
import { BlogCategory, BlogPost, BlogTag } from "@konfi/types";
import { formatDate } from "@konfi/utils";
import NextLink from "next/link";

interface BlogPostProps {
  lng: string;
  slug: string;
  post: BlogPost | null;
  categories: BlogCategory[];
  tags: BlogTag[];
  relatedPosts: BlogPost[];
  serializedContent: string | null;
}

export default function BlogPostComponent({
  lng,
  slug,
  post,
  categories,
  tags,
  relatedPosts,
  serializedContent,
}: BlogPostProps) {
  const { t } = useT();
  const runtimeConfig = useStoreRuntimeConfig();

  const getCategoryName = (categoryId: string) => {
    const category = categories.find((c: BlogCategory) => c.id === categoryId);
    return category?.name || categoryId;
  };

  const getTagName = (tagId: string) => {
    const tag = tags.find((t: BlogTag) => t.id === tagId);
    return tag?.name || tagId;
  };

  if (!post) {
    return (
      <Box textAlign="center" py={12}>
        <Text fontSize="lg" color="red.fg">
          {t("blog.notFound")}
        </Text>
      </Box>
    );
  }

  return (
    <Stack gap={8} maxW="4xl" mx="auto">
      {/* Post Header */}
      <VStack align="start" gap={4}>
        <Heading as="h1" size="3xl">
          {post.title}
        </Heading>

        <Text fontSize="lg" color={{ base: "gray.600", _dark: "gray.400" }}>
          {post.excerpt}
        </Text>

        <HStack gap={4} flexWrap="wrap">
          <Text fontSize="sm" color={{ base: "gray.500", _dark: "gray.400" }}>
            {formatDate(post.publishedAt, lng)}
          </Text>
          {post.readTime && (
            <Text fontSize="sm" color={{ base: "gray.500", _dark: "gray.400" }}>
              {post.readTime} {t("blog.minRead")}
            </Text>
          )}
          {post.views > 0 && (
            <Text fontSize="sm" color={{ base: "gray.500", _dark: "gray.400" }}>
              {post.views} {t("blog.views")}
            </Text>
          )}
        </HStack>

        {/* Categories and Tags */}
        <HStack gap={2} flexWrap="wrap">
          {post.categories.map((categoryId: string) => (
            <Tag key={categoryId} colorScheme="primary" size="sm">
              {getCategoryName(categoryId)}
            </Tag>
          ))}
          {post.tags.map((tagId: string) => (
            <Tag key={tagId} colorScheme="gray" size="sm">
              {getTagName(tagId)}
            </Tag>
          ))}
        </HStack>
      </VStack>

      {/* Featured Image */}
      {post.featuredImage && (
        <Box>
          <Image
            src={
              buildRuntimeAssetUrl(
                runtimeConfig.cdnUrl,
                `cms/blog/${post.featuredImage}?fit=max&auto=format,compress`,
              ) ?? ""
            }
            alt={post.title}
            width="100%"
            height={400}
            objectFit="cover"
            borderRadius="md"
          />
        </Box>
      )}

      {/* Post Content */}
      <Box>{serializedContent && <Preview source={serializedContent} />}</Box>

      {/* Related Posts */}
      {relatedPosts.length > 0 && (
        <VStack align="start" gap={4}>
          <Heading as="h3" size="lg">
            {t("blog.relatedPosts")}
          </Heading>
          <VStack gap={4} align="stretch">
            {relatedPosts.map((relatedPost: BlogPost) => (
              <Box
                key={relatedPost.id}
                p={4}
                borderWidth={1}
                borderRadius="md"
                bg={{ base: "white", _dark: "gray.800" }}
                shadow="sm"
              >
                <HStack gap={4} align="start">
                  {relatedPost.featuredImage && (
                    <Box flexShrink={0} w="100px" h="70px">
                      <Image
                        src={
                          buildRuntimeAssetUrl(
                            runtimeConfig.cdnUrl,
                            `cms/blog/${relatedPost.featuredImage}?fit=max&auto=format,compress`,
                          ) ?? relatedPost.featuredImage
                        }
                        alt={relatedPost.title}
                        width={100}
                        height={70}
                        objectFit="cover"
                        borderRadius="md"
                      />
                    </Box>
                  )}
                  <VStack align="start" flex={1} gap={2}>
                    <Heading as="h4" size="md">
                      <ChakraLink
                        asChild
                        color={{ base: "blue.600", _dark: "blue.300" }}
                      >
                        <NextLink
                          href={`/${lng}/blog/${relatedPost.slug}`}
                          prefetch={true}
                        >
                          {relatedPost.title}
                        </NextLink>
                      </ChakraLink>
                    </Heading>
                    <Text
                      color={{ base: "gray.600", _dark: "gray.400" }}
                      fontSize="sm"
                      lineClamp={2}
                    >
                      {relatedPost.excerpt}
                    </Text>
                    {relatedPost.publishedAt && (
                      <Text
                        fontSize="xs"
                        color={{ base: "gray.500", _dark: "gray.400" }}
                      >
                        {formatDate(relatedPost.publishedAt, lng)}
                      </Text>
                    )}
                  </VStack>
                </HStack>
              </Box>
            ))}
          </VStack>
        </VStack>
      )}

      {/* Back to Blog */}
      <Box pt={4}>
        <ChakraLink asChild color="primary.solid">
          <NextLink href={`/${lng}/blog`} prefetch={true}>
            ← {t("blog.backToBlog")}
          </NextLink>
        </ChakraLink>
      </Box>
    </Stack>
  );
}
