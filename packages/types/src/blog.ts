import { Timestamp } from "firebase/firestore";
import { Base } from "./base";
import { BlogPostStatus, Locale } from "./enums";
import type { TranslatedContentMetadata } from "./translation-meta";

/**
 * Interface representing a blog post
 */
export interface BlogPost extends Base {
  /**
   * URL-friendly slug for the blog post
   */
  slug: string;
  /**
   * Blog post title
   */
  title: string;
  /**
   * Short excerpt/summary of the blog post
   */
  excerpt: string;
  /**
   * Full content in MDX format
   */
  content: string;
  /**
   * Featured image URL
   */
  featuredImage?: string;
  /**
   * Publication status
   */
  status: BlogPostStatus;
  /**
   * When the post was published
   */
  publishedAt?: Omit<Timestamp, "toJSON">;
  /**
   * When the post is scheduled to be published
   */
  scheduledAt?: Omit<Timestamp, "toJSON">;
  /**
   * Category IDs this post belongs to
   */
  categories: string[];
  /**
   * Tag IDs associated with this post
   */
  tags: string[];
  /**
   * SEO metadata
   */
  seo: {
    title: string;
    description: string;
  };
  /**
   * Estimated reading time in minutes
   */
  readTime: number;
  /**
   * Number of views
   */
  views: number;
}

/**
 * Interface representing a blog category
 */
export interface BlogCategory extends Base {
  /**
   * URL-friendly slug for the category
   */
  slug: string;
  /**
   * Category description
   */
  description?: string;
  /**
   * SEO metadata for the category
   */
  seo: {
    title: string;
    description: string;
  };
  /**
   * Number of posts in this category (only available when explicitly requested)
   */
  postCount?: number;
}

/**
 * Interface representing a blog tag
 */
export interface BlogTag extends Base {
  /**
   * URL-friendly slug for the tag
   */
  slug: string;
  /**
   * Tag description
   */
  description?: string;
}

/**
 * Interface for blog post translations
 */
export interface BlogPostTranslation
  extends Omit<Base, "name">, TranslatedContentMetadata {
  /**
   * Locale for this translation
   */
  locale: Locale;
  /**
   * Translated title
   */
  title: string;
  /**
   * Translated excerpt
   */
  excerpt: string;
  /**
   * Translated content in MDX format
   */
  content: string;
  /**
   * Translated SEO metadata
   */
  seo: BlogPost["seo"];
}

/**
 * Interface for blog category translations
 */
export interface BlogCategoryTranslation
  extends Base, TranslatedContentMetadata {
  /**
   * Locale for this translation
   */
  locale: Locale;
  /**
   * Translated name
   */
  name: string;
  /**
   * Translated description
   */
  description?: string;
  /**
   * Translated SEO metadata
   */
  seo: BlogCategory["seo"];
}

/**
 * Interface for blog tag translations
 */
export interface BlogTagTranslation extends Base, TranslatedContentMetadata {
  /**
   * Locale for this translation
   */
  locale: Locale;
  /**
   * Translated name
   */
  name: string;
  /**
   * Translated description
   */
  description?: string;
}

/**
 * Query parameters for fetching blog posts
 */
export interface BlogPostQuery {
  /**
   * Number of posts to fetch
   */
  limit?: number;
  /**
   * Cursor for pagination
   */
  cursor?: string;
  /**
   * Filter by category IDs
   */
  categories?: string[];
  /**
   * Filter by tag IDs
   */
  tags?: string[];
  /**
   * Filter by status
   */
  status?: BlogPostStatus;
  /**
   * Search query
   */
  search?: string;
  /**
   * Sort order
   */
  orderBy?: "createdAt" | "publishedAt" | "updatedAt" | "views";
  /**
   * Sort direction
   */
  orderDirection?: "asc" | "desc";
}

/**
 * Blog statistics interface
 */
export interface BlogStats {
  /**
   * Total number of published posts
   */
  totalPosts: number;
  /**
   * Total number of categories
   */
  totalCategories: number;
  /**
   * Total number of tags
   */
  totalTags: number;
  /**
   * Total views across all posts
   */
  totalViews: number;
  /**
   * Most popular posts
   */
  popularPosts: Array<{
    id: string;
    title: string;
    views: number;
  }>;
}

/**
 * Form interfaces for blog translations
 */
export interface BlogPostTranslationCreateForm extends Omit<
  BlogPostTranslation,
  "id" | "createdAt" | "updatedAt" | "updatedBy"
> {}

export interface BlogPostTranslationUpdateForm extends Omit<
  BlogPostTranslation,
  "id" | "createdAt" | "createdBy" | "updatedAt"
> {}

export interface BlogCategoryTranslationCreateForm extends Omit<
  BlogCategoryTranslation,
  "id" | "createdAt" | "updatedAt" | "updatedBy"
> {}

export interface BlogCategoryTranslationUpdateForm extends Omit<
  BlogCategoryTranslation,
  "id" | "createdAt" | "createdBy" | "updatedAt"
> {}

export interface BlogTagTranslationCreateForm extends Omit<
  BlogTagTranslation,
  "id" | "createdAt" | "updatedAt" | "updatedBy"
> {}

export interface BlogTagTranslationUpdateForm extends Omit<
  BlogTagTranslation,
  "id" | "createdAt" | "createdBy" | "updatedAt"
> {}
