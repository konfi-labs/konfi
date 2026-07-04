"use client";

import {
  getBlogCategories,
  getBlogCategory,
  getBlogPost,
  getBlogPosts,
  getBlogTag,
  getBlogTagPostCount,
  getBlogTags,
} from "@konfi/firebase";
import { BlogCategory, BlogPost, BlogPostQuery, BlogTag } from "@konfi/types";
import useSWR from "swr";

// Constants
const TAG_COUNT_BATCH_SIZE = 10;

// Fetcher functions
async function fetchBlogPosts(key: string): Promise<{
  posts: BlogPost[];
  hasMore: boolean;
  nextCursor?: string;
}> {
  const [, queryParams] = JSON.parse(key);
  return await getBlogPosts(queryParams);
}


async function fetchBlogCategories(key: string | [string, boolean]): Promise<BlogCategory[]> {
  const includeCounts = Array.isArray(key) ? key[1] : false;
  return await getBlogCategories(undefined, includeCounts);
}

async function fetchBlogTags(): Promise<BlogTag[]> {
  return await getBlogTags();
}

async function fetchBlogPost(postId: string): Promise<BlogPost | null> {
  return await getBlogPost(postId);
}

async function fetchBlogCategory(
  categoryId: string,
): Promise<BlogCategory | null> {
  return await getBlogCategory(categoryId);
}

async function fetchBlogTag(tagId: string): Promise<BlogTag | null> {
  return await getBlogTag(tagId);
}

// Custom hooks
export function useBlogPosts(queryParams: BlogPostQuery = {}) {
  const key = JSON.stringify(["blog-posts", queryParams]);

  return useSWR(key, fetchBlogPosts, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
}

export function useBlogCategories(includeCounts: boolean = false) {
  return useSWR(
    ["blog-categories", includeCounts],
    (key) => fetchBlogCategories(key),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );
}

export function useBlogTags() {
  return useSWR("blog-tags", fetchBlogTags, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
}

export function useBlogPost(postId?: string) {
  return useSWR(
    postId ? `blog-post-${postId}` : null,
    () => (postId ? fetchBlogPost(postId) : null),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );
}

export function useBlogCategory(categoryId?: string) {
  return useSWR(
    categoryId ? `blog-category-${categoryId}` : null,
    () => (categoryId ? fetchBlogCategory(categoryId) : null),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );
}

export function useBlogTag(tagId?: string) {
  return useSWR(
    tagId ? `blog-tag-${tagId}` : null,
    () => (tagId ? fetchBlogTag(tagId) : null),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );
}

export function useBlogTagPostCounts(tags: BlogTag[] | undefined) {
  const tagIds = tags?.map((t) => t.id).sort() ?? [];
  const tagIdsKey = tagIds.join(",");

  return useSWR(
    tags?.length ? (["blog-tag-counts", tagIdsKey] as const) : null,
    async () => {
      if (!tags || tags.length === 0) return {};
      const counts: Record<string, number> = {};

      for (let i = 0; i < tags.length; i += TAG_COUNT_BATCH_SIZE) {
        const batch = tags.slice(i, i + TAG_COUNT_BATCH_SIZE);
        await Promise.all(
          batch.map(async (tag) => {
            counts[tag.id] = await getBlogTagPostCount(tag.id);
          }),
        );
      }

      return counts;
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );
}

// Combined hook for all blog data
export function useBlogData() {
  const posts = useBlogPosts();
  const categories = useBlogCategories();
  const tags = useBlogTags();

  return {
    posts,
    categories,
    tags,
    isLoading: posts.isLoading || categories.isLoading || tags.isLoading,
    error: posts.error || categories.error || tags.error,
  };
}
