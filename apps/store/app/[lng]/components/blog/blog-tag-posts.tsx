"use client";

import { useT } from "@/i18n/client";
import { Heading, Text, VStack } from "@chakra-ui/react";
import { getBlogTags } from "@konfi/firebase";
import { BlogCategory, BlogTag } from "@konfi/types";
import { useEffect, useState } from "react";
import BlogList from "./blog-list";

interface BlogTagPostsProps {
  lng: string;
  tagSlug: string;
  categories?: BlogCategory[];
  tags?: BlogTag[];
}

export default function BlogTagPosts({
  lng,
  tagSlug,
  categories = [],
  tags = [],
}: BlogTagPostsProps) {
  const { t } = useT();
  const [tag, setTag] = useState<BlogTag | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTag = async () => {
      try {
        // Use passed tags if available, otherwise fetch
        const tagsData = tags.length > 0 ? tags : await getBlogTags();
        const foundTag = tagsData.find((t) => t.slug === tagSlug);
        setTag(foundTag || null);
      } catch (error) {
        console.error("Error loading tag:", error);
      } finally {
        setLoading(false);
      }
    };

    loadTag();
  }, [tagSlug, tags]);

  if (loading) {
    return <Text>Loading...</Text>;
  }

  if (!tag) {
    return (
      <VStack gap={4} align="start">
        <Heading as="h1" size="xl">
          Tag Not Found
        </Heading>
        <Text color={{ base: "gray.600", _dark: "gray.400" }}>The requested tag could not be found.</Text>
      </VStack>
    );
  }

  return (
    <VStack gap={6} align="start">
      <VStack align="start" gap={2}>
        <Heading as="h1" size="xl">
          {tag.name}
        </Heading>
        {tag.description && (
          <Text color={{ base: "gray.600", _dark: "gray.400" }} fontSize="lg">
            {tag.description}
          </Text>
        )}
      </VStack>

      <BlogList
        lng={lng}
        tagFilter={tag.id}
        categories={categories}
        tags={tags}
      />
    </VStack>
  );
}
