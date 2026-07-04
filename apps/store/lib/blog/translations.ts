import {
  getBlogCategoryTranslation,
  getBlogPostTranslation,
  getBlogTagTranslation,
} from "@konfi/firebase";
import { BlogCategory, BlogPost, BlogTag, Locale } from "@konfi/types";
import { Firestore } from "firebase/firestore";

/**
 * Get translated blog post content or fallback to original
 */
export async function getTranslatedBlogPost(
  firestore: Firestore,
  post: BlogPost,
  locale: Locale,
): Promise<BlogPost> {
  try {
    const translation = await getBlogPostTranslation(
      firestore,
      post.id,
      locale,
    );

    if (translation) {
      return {
        ...post,
        title: translation.title,
        excerpt: translation.excerpt,
        content: translation.content,
        seo: translation.seo,
      };
    }

    return post;
  } catch (error) {
    console.error("Error getting translated blog post:", error);
    return post;
  }
}

/**
 * Get translated blog category content or fallback to original
 */
export async function getTranslatedBlogCategory(
  firestore: Firestore,
  category: BlogCategory,
  locale: Locale,
): Promise<BlogCategory> {
  try {
    const translation = await getBlogCategoryTranslation(
      firestore,
      category.id,
      locale,
    );

    if (translation) {
      return {
        ...category,
        name: translation.name || category.name,
        description: translation.description || category.description,
        seo: translation.seo,
      };
    }

    return category;
  } catch (error) {
    console.error("Error getting translated blog category:", error);
    return category;
  }
}

/**
 * Get translated blog tag content or fallback to original
 */
export async function getTranslatedBlogTag(
  firestore: Firestore,
  tag: BlogTag,
  locale: Locale,
): Promise<BlogTag> {
  try {
    const translation = await getBlogTagTranslation(firestore, tag.id, locale);

    if (translation) {
      return {
        ...tag,
        name: translation.name || tag.name,
        description: translation.description || tag.description,
      };
    }

    return tag;
  } catch (error) {
    console.error("Error getting translated blog tag:", error);
    return tag;
  }
}

/**
 * Get translated blog posts array
 */
export async function getTranslatedBlogPosts(
  firestore: Firestore,
  posts: BlogPost[],
  locale: Locale,
): Promise<BlogPost[]> {
  try {
    return await Promise.all(
      posts.map((post) => getTranslatedBlogPost(firestore, post, locale)),
    );
  } catch (error) {
    console.error("Error getting translated blog posts:", error);
    return posts;
  }
}

/**
 * Get translated blog categories array
 */
export async function getTranslatedBlogCategories(
  firestore: Firestore,
  categories: BlogCategory[],
  locale: Locale,
): Promise<BlogCategory[]> {
  try {
    return await Promise.all(
      categories.map((category) =>
        getTranslatedBlogCategory(firestore, category, locale),
      ),
    );
  } catch (error) {
    console.error("Error getting translated blog categories:", error);
    return categories;
  }
}

/**
 * Get translated blog tags array
 */
export async function getTranslatedBlogTags(
  firestore: Firestore,
  tags: BlogTag[],
  locale: Locale,
): Promise<BlogTag[]> {
  try {
    return await Promise.all(
      tags.map((tag) => getTranslatedBlogTag(firestore, tag, locale)),
    );
  } catch (error) {
    console.error("Error getting translated blog tags:", error);
    return tags;
  }
}
