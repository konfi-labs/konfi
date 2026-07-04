"use client";

import { useT } from "@/i18n/client";
import { Heading, Text, VStack } from "@chakra-ui/react";
import { getBlogCategories } from "@konfi/firebase";
import { BlogCategory, BlogTag } from "@konfi/types";
import { useEffect, useState } from "react";
import BlogList from "./blog-list";

interface BlogCategoryPostsProps {
  lng: string;
  categorySlug: string;
  categories?: BlogCategory[];
  tags?: BlogTag[];
}

export default function BlogCategoryPosts({
  lng,
  categorySlug,
  categories = [],
  tags = [],
}: BlogCategoryPostsProps) {
  const { t } = useT();
  const [category, setCategory] = useState<BlogCategory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCategory = async () => {
      try {
        // Use passed categories if available, otherwise fetch
        const categoriesData =
          categories.length > 0 ? categories : await getBlogCategories();
        const foundCategory = categoriesData.find(
          (c) => c.slug === categorySlug,
        );
        setCategory(foundCategory || null);
      } catch (error) {
        console.error("Error loading category:", error);
      } finally {
        setLoading(false);
      }
    };

    loadCategory();
  }, [categorySlug, categories]);

  if (loading) {
    return <Text>Loading...</Text>;
  }

  if (!category) {
    return (
      <VStack gap={4} align="start">
        <Heading as="h1" size="xl">
          Category Not Found
        </Heading>
        <Text color={{ base: "gray.600", _dark: "gray.400" }}>The requested category could not be found.</Text>
      </VStack>
    );
  }

  return (
    <VStack gap={6} align="start">
      <VStack align="start" gap={2}>
        <Heading as="h1" size="xl">
          {category.name}
        </Heading>
        {category.description && (
          <Text color={{ base: "gray.600", _dark: "gray.400" }} fontSize="lg">
            {category.description}
          </Text>
        )}
      </VStack>

      <BlogList
        lng={lng}
        categoryFilter={category.id}
        categories={categories}
        tags={tags}
      />
    </VStack>
  );
}
