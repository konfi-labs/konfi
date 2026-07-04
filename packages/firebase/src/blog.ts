import {
  BlogCategory,
  BlogPost,
  BlogPostQuery,
  BlogPostStatus,
  BlogStats,
  BlogTag,
  NestedMember,
} from "@konfi/types";
import {
  addDoc,
  collection,
  CollectionReference,
  deleteDoc,
  doc,
  Firestore,
  getCountFromServer,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { getFirestoreInstance } from "./lib";

/**
 * Get the blog posts collection reference
 */
export function getBlogPostsCollection(
  firestore?: Firestore,
): CollectionReference {
  const db = getFirestoreInstance(firestore);
  return collection(db, "blogPosts");
}

/**
 * Get the blog categories collection reference
 */
export function getBlogCategoriesCollection(
  firestore?: Firestore,
): CollectionReference {
  const db = getFirestoreInstance(firestore);
  return collection(db, "blogCategories");
}

/**
 * Get the blog tags collection reference
 */
export function getBlogTagsCollection(
  firestore?: Firestore,
): CollectionReference {
  const db = getFirestoreInstance(firestore);
  return collection(db, "blogTags");
}

/**
 * Get blog post translations collection reference
 */
export function getBlogPostTranslationsCollection(
  postId: string,
  firestore?: Firestore,
): CollectionReference {
  const db = getFirestoreInstance(firestore);
  return collection(db, `blogPosts/${postId}/translations`);
}

/**
 * Get blog category translations collection reference
 */
export function getBlogCategoryTranslationsCollection(
  categoryId: string,
  firestore?: Firestore,
): CollectionReference {
  const db = getFirestoreInstance(firestore);
  return collection(db, `blogCategories/${categoryId}/translations`);
}

/**
 * Get blog tag translations collection reference
 */
export function getBlogTagTranslationsCollection(
  tagId: string,
  firestore?: Firestore,
): CollectionReference {
  const db = getFirestoreInstance(firestore);
  return collection(db, `blogTags/${tagId}/translations`);
}

/**
 * Create a new blog post
 */
export async function createBlogPost(
  data: Omit<BlogPost, "id" | "createdAt" | "updatedAt" | "views">,
  revalidateTagCache?: (tag: string) => Promise<void> | void,
): Promise<string> {
  const now = Timestamp.now();
  const postsCollection = getBlogPostsCollection();

  const blogPost: Omit<BlogPost, "id"> = {
    ...data,
    createdAt: now,
    createdBy: {
      id: data.createdBy.id,
      name: data.createdBy.name,
    },
    updatedAt: now,
    updatedBy: {
      id: data.updatedBy.id,
      name: data.updatedBy.name,
    },
    views: 0,
  };

  const docRef = await addDoc(postsCollection, {
    ...blogPost,
    publishedAt: now,
  });

  // Revalidate cache
  if (revalidateTagCache) {
    await revalidateTagCache("blogPosts");
    // Also revalidate the slug-based cache tag for the new post
    if (data.slug) {
      await revalidateTagCache(`blogPost-${data.slug}`);
    }
  }

  return docRef.id;
}

/**
 * Update an existing blog post
 */
export async function updateBlogPost(
  postId: string,
  data: Partial<Omit<BlogPost, "id" | "createdAt" | "createdBy" | "views">>,
  updatedBy: NestedMember,
  revalidateTagCache?: (tag: string) => Promise<void> | void,
  oldSlug?: string,
): Promise<void> {
  const postsCollection = getBlogPostsCollection();
  const postRef = doc(postsCollection, postId);

  await updateDoc(postRef, {
    ...data,
    updatedAt: Timestamp.now(),
    updatedBy: {
      id: updatedBy.id,
      name: updatedBy.name,
    },
  });

  // Revalidate cache
  if (revalidateTagCache) {
    await revalidateTagCache("blogPosts");
    // Determine current slug (post-update). If slug not provided in update, fetch existing.
    let currentSlug: string | undefined = data.slug;
    if (!currentSlug) {
      const currentSnap = await getDoc(postRef);
      if (currentSnap.exists()) {
        currentSlug = (currentSnap.data() as Pick<BlogPost, "slug">).slug;
      }
    }

    // If old slug is provided and differs from current slug, revalidate old slug tag
    if (oldSlug && oldSlug !== currentSlug) {
      await revalidateTagCache(`blogPost-${oldSlug}`);
    }

    // Always revalidate current slug tag when available (even if unchanged)
    if (currentSlug) {
      await revalidateTagCache(`blogPost-${currentSlug}`);
    }
  }
}

/**
 * Delete a blog post
 */
export async function deleteBlogPost(
  postId: string,
  revalidateTagCache?: (tag: string) => Promise<void> | void,
  slug?: string,
): Promise<void> {
  const postsCollection = getBlogPostsCollection();
  const postRef = doc(postsCollection, postId);
  await deleteDoc(postRef);

  // Revalidate cache
  if (revalidateTagCache) {
    await revalidateTagCache("blogPosts");

    // If slug is provided, also revalidate the slug-based cache tag
    if (slug) {
      await revalidateTagCache(`blogPost-${slug}`);
    }
  }
}

/**
 * Get a single blog post by ID
 */
export async function getBlogPost(
  postId: string,
  firestore?: Firestore,
): Promise<BlogPost | null> {
  const postsCollection = getBlogPostsCollection(firestore);
  const postRef = doc(postsCollection, postId);
  const postDoc = await getDoc(postRef);

  if (!postDoc.exists()) {
    return null;
  }

  return { id: postDoc.id, ...postDoc.data() } as BlogPost;
}

/**
 * Get a blog post by slug
 */
export async function getBlogPostBySlug(
  slug: string,
  firestore?: Firestore,
): Promise<BlogPost | null> {
  const postsCollection = getBlogPostsCollection(firestore);
  const q = query(postsCollection, where("slug", "==", slug), limit(1));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.empty) {
    return null;
  }

  const doc = querySnapshot.docs[0];
  return { id: doc.id, ...doc.data() } as BlogPost;
}

/**
 * Get blog posts with query parameters
 */
export async function getBlogPosts(
  queryParams: BlogPostQuery = {},
  firestore?: Firestore,
): Promise<{
  posts: BlogPost[];
  hasMore: boolean;
  nextCursor?: string;
}> {
  const postsCollection = getBlogPostsCollection(firestore);
  let q = query(postsCollection);

  // Apply filters
  if (queryParams.status) {
    q = query(q, where("status", "==", queryParams.status));
  }

  if (queryParams.categories && queryParams.categories.length > 0) {
    q = query(
      q,
      where("categories", "array-contains-any", queryParams.categories),
    );
  }

  if (queryParams.tags && queryParams.tags.length > 0) {
    q = query(q, where("tags", "array-contains-any", queryParams.tags));
  }

  // Apply ordering
  const orderByField = queryParams.orderBy || "createdAt";
  const orderDirection = queryParams.orderDirection || "desc";
  q = query(q, orderBy(orderByField, orderDirection));

  // Apply pagination
  if (queryParams.cursor) {
    // Get the document snapshot for the cursor
    const cursorDoc = await getDoc(doc(postsCollection, queryParams.cursor));
    if (cursorDoc.exists()) {
      q = query(q, startAfter(cursorDoc));
    }
  }

  const limitCount = queryParams.limit || 10;
  q = query(q, limit(limitCount + 1)); // Get one extra to check if there are more

  const querySnapshot = await getDocs(q);
  const posts: BlogPost[] = [];

  querySnapshot.docs.slice(0, limitCount).forEach((doc) => {
    posts.push({ id: doc.id, ...doc.data() } as BlogPost);
  });

  const hasMore = querySnapshot.docs.length > limitCount;
  const nextCursor = hasMore ? posts[posts.length - 1]?.id : undefined;

  return { posts, hasMore, nextCursor };
}

/**
 * Get published blog posts for public display
 */
export async function getPublishedBlogPosts(
  queryParams: Omit<BlogPostQuery, "status"> = {},
  firestore?: Firestore,
): Promise<{
  posts: BlogPost[];
  hasMore: boolean;
  nextCursor?: string;
}> {
  const db = getFirestoreInstance(firestore);
  return getBlogPosts(
    {
      ...queryParams,
      status: BlogPostStatus.PUBLISHED,
    },
    db,
  );
}

/**
 * Increment blog post views
 */
export async function incrementPostViews(postId: string): Promise<void> {
  const postsCollection = getBlogPostsCollection();
  const postRef = doc(postsCollection, postId);
  await updateDoc(postRef, { views: increment(1) });
}

/**
 * Create a new blog category
 */
export async function createBlogCategory(
  data: Omit<BlogCategory, "id" | "createdAt" | "updatedAt">,
  revalidateTagCache?: (tag: string) => Promise<void> | void,
): Promise<string> {
  const now = Timestamp.now();
  const categoriesCollection = getBlogCategoriesCollection();

  const category: Omit<BlogCategory, "id"> = {
    ...data,
    createdAt: now,
    createdBy: {
      id: data.createdBy.id,
      name: data.createdBy.name,
    },
    updatedAt: now,
    updatedBy: {
      id: data.updatedBy.id,
      name: data.updatedBy.name,
    },
  };

  const docRef = await addDoc(categoriesCollection, category);

  // Revalidate cache
  if (revalidateTagCache) {
    await revalidateTagCache("blogCategories");
  }

  return docRef.id;
}

/**
 * Update a blog category
 */
export async function updateBlogCategory(
  categoryId: string,
  data: Partial<Omit<BlogCategory, "id" | "createdAt" | "createdBy">>,
  updatedBy: NestedMember,
  revalidateTagCache?: (tag: string) => Promise<void> | void,
): Promise<void> {
  const categoriesCollection = getBlogCategoriesCollection();
  const categoryRef = doc(categoriesCollection, categoryId);

  await updateDoc(categoryRef, {
    ...data,
    updatedAt: Timestamp.now(),
    updatedBy: {
      id: updatedBy.id,
      name: updatedBy.name,
    },
  });

  // Revalidate cache
  if (revalidateTagCache) {
    await revalidateTagCache("blogCategories");
  }
}

/**
 * Delete a blog category
 */
export async function deleteBlogCategory(
  categoryId: string,
  revalidateTagCache?: (tag: string) => Promise<void> | void,
): Promise<void> {
  const categoriesCollection = getBlogCategoriesCollection();
  const categoryRef = doc(categoriesCollection, categoryId);
  await deleteDoc(categoryRef);

  // Revalidate cache
  if (revalidateTagCache) {
    await revalidateTagCache("blogCategories");
  }
}

/**
 * Get all blog categories
 */
export async function getBlogCategories(
  includeCounts?: boolean,
  firestore?: Firestore,
): Promise<BlogCategory[]>;
export async function getBlogCategories(
  firestore?: Firestore,
  includeCounts?: boolean,
): Promise<BlogCategory[]>;
export async function getBlogCategories(
  arg1?: boolean | Firestore,
  arg2?: boolean | Firestore,
): Promise<BlogCategory[]> {
  const includeCounts =
    typeof arg1 === "boolean" ? arg1 : typeof arg2 === "boolean" ? arg2 : false;
  const firestore =
    arg1 && typeof arg1 !== "boolean"
      ? (arg1 as Firestore | undefined)
      : arg2 && typeof arg2 !== "boolean"
        ? (arg2 as Firestore | undefined)
        : undefined;

  const categoriesCollection = getBlogCategoriesCollection(firestore);
  const q = query(categoriesCollection, orderBy("name"));
  const querySnapshot = await getDocs(q);

  if (includeCounts) {
    // Use aggregation queries to avoid fetching all posts
    const postsCollection = getBlogPostsCollection(firestore);
    const categoriesWithCounts: BlogCategory[] = await Promise.all(
      querySnapshot.docs.map(async (docSnap) => {
        const baseCategory = {
          id: docSnap.id,
          ...docSnap.data(),
        } as BlogCategory;

        const countQuery = query(
          postsCollection,
          where("categories", "array-contains", baseCategory.id),
        );
        const countSnapshot = await getCountFromServer(countQuery);
        const postCount = countSnapshot.data().count;

        return {
          ...baseCategory,
          postCount,
        };
      }),
    );

    return categoriesWithCounts;
  }

  const categories: BlogCategory[] = [];
  querySnapshot.forEach((doc) => {
    categories.push({ id: doc.id, ...doc.data() } as BlogCategory);
  });

  return categories;
}

/**
 * Get a blog category by ID
 */
export async function getBlogCategory(
  categoryId: string,
  firestore?: Firestore,
): Promise<BlogCategory | null> {
  const categoriesCollection = getBlogCategoriesCollection(firestore);
  const categoryRef = doc(categoriesCollection, categoryId);
  const categoryDoc = await getDoc(categoryRef);

  if (!categoryDoc.exists()) {
    return null;
  }

  return { id: categoryDoc.id, ...categoryDoc.data() } as BlogCategory;
}

/**
 * Create a new blog tag
 */
export async function createBlogTag(
  data: Omit<BlogTag, "id" | "createdAt" | "updatedAt">,
  revalidateTagCache?: (tag: string) => Promise<void> | void,
): Promise<string> {
  const now = Timestamp.now();
  const tagsCollection = getBlogTagsCollection();

  const tag: Omit<BlogTag, "id"> = {
    ...data,
    createdAt: now,
    createdBy: {
      id: data.createdBy.id,
      name: data.createdBy.name,
    },
    updatedAt: now,
    updatedBy: {
      id: data.updatedBy.id,
      name: data.updatedBy.name,
    },
  };

  const docRef = await addDoc(tagsCollection, tag);

  // Revalidate cache
  if (revalidateTagCache) {
    await revalidateTagCache("blogTags");
  }

  return docRef.id;
}

/**
 * Update a blog tag
 */
export async function updateBlogTag(
  tagId: string,
  data: Partial<Omit<BlogTag, "id" | "createdAt" | "createdBy">>,
  updatedBy: NestedMember,
  revalidateTagCache?: (tag: string) => Promise<void> | void,
): Promise<void> {
  const tagsCollection = getBlogTagsCollection();
  const tagRef = doc(tagsCollection, tagId);

  await updateDoc(tagRef, {
    ...data,
    updatedAt: Timestamp.now(),
    updatedBy: {
      id: updatedBy.id,
      name: updatedBy.name,
    },
  });

  // Revalidate cache
  if (revalidateTagCache) {
    await revalidateTagCache("blogTags");
  }
}

/**
 * Delete a blog tag
 */
export async function deleteBlogTag(
  tagId: string,
  revalidateTagCache?: (tag: string) => Promise<void> | void,
): Promise<void> {
  const tagsCollection = getBlogTagsCollection();
  const tagRef = doc(tagsCollection, tagId);
  await deleteDoc(tagRef);

  // Revalidate cache
  if (revalidateTagCache) {
    await revalidateTagCache("blogTags");
  }
}

/**
 * Get all blog tags
 */
export async function getBlogTags(firestore?: Firestore): Promise<BlogTag[]> {
  const tagsCollection = getBlogTagsCollection(firestore);
  const q = query(tagsCollection, orderBy("name"));
  const querySnapshot = await getDocs(q);

  const tags: BlogTag[] = [];
  querySnapshot.forEach((doc) => {
    tags.push({ id: doc.id, ...doc.data() } as BlogTag);
  });

  return tags;
}

/**
 * Get a blog tag by ID
 */
export async function getBlogTag(
  tagId: string,
  firestore?: Firestore,
): Promise<BlogTag | null> {
  const tagsCollection = getBlogTagsCollection(firestore);
  const tagRef = doc(tagsCollection, tagId);
  const tagDoc = await getDoc(tagRef);

  if (!tagDoc.exists()) {
    return null;
  }

  return { id: tagDoc.id, ...tagDoc.data() } as BlogTag;
}

/**
 * Get the count of blog posts for a specific tag
 */
export async function getBlogTagPostCount(
  tagId: string,
  firestore?: Firestore,
): Promise<number> {
  const postsCollection = getBlogPostsCollection(firestore);
  const q = query(postsCollection, where("tags", "array-contains", tagId));
  const snapshot = await getCountFromServer(q);
  return snapshot.data().count;
}

/**
 * Get related blog posts based on categories and tags
 */
export async function getRelatedBlogPosts(
  postId: string,
  categories: string[],
  tags: string[],
  limitCount: number = 5,
  firestore?: Firestore,
): Promise<BlogPost[]> {
  const postsCollection = getBlogPostsCollection(firestore);

  // Query posts with same categories or tags, excluding the current post
  let q = query(
    postsCollection,
    where("status", "==", BlogPostStatus.PUBLISHED),
    orderBy("publishedAt", "desc"),
    limit(limitCount * 2), // Get more to filter out the current post
  );

  // Apply category filter if available
  if (categories.length > 0) {
    q = query(q, where("categories", "array-contains-any", categories));
  } else if (tags.length > 0) {
    q = query(q, where("tags", "array-contains-any", tags));
  }

  const querySnapshot = await getDocs(q);
  const relatedPosts: BlogPost[] = [];

  querySnapshot.docs.forEach((doc) => {
    // Exclude the current post
    if (doc.id !== postId && relatedPosts.length < limitCount) {
      relatedPosts.push({ id: doc.id, ...doc.data() } as BlogPost);
    }
  });

  return relatedPosts;
}

/**
 * Get blog statistics
 */
export async function getBlogStats(firestore?: Firestore): Promise<BlogStats> {
  const [posts, categories, tags] = await Promise.all([
    getBlogPosts({ status: BlogPostStatus.PUBLISHED, limit: 1000 }, firestore),
    getBlogCategories(),
    getBlogTags(),
  ]);

  const totalViews = posts.posts.reduce(
    (sum, post) => sum + (post.views || 0),
    0,
  );
  const popularPosts = posts.posts
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 10)
    .map((post) => ({
      id: post.id,
      title: post.title,
      views: post.views || 0,
    }));

  return {
    totalPosts: posts.posts.length,
    totalCategories: categories.length,
    totalTags: tags.length,
    totalViews,
    popularPosts,
  };
}

/**
 * Calculate estimated reading time for content
 */
export function calculateReadingTime(content: string): number {
  // Average reading speed is about 200 words per minute
  const wordsPerMinute = 200;
  const words = content.trim().split(/\s+/).length;
  const readingTime = Math.ceil(words / wordsPerMinute);
  return Math.max(1, readingTime); // Minimum 1 minute
}

/**
 * Check if a slug is unique
 */
export async function isBlogSlugUnique(
  slug: string,
  excludePostId?: string,
): Promise<boolean> {
  const postsCollection = getBlogPostsCollection();
  const q = query(postsCollection, where("slug", "==", slug));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.empty) {
    return true;
  }

  // If excludePostId is provided, check if the only match is that post
  if (excludePostId && querySnapshot.size === 1) {
    return querySnapshot.docs[0].id === excludePostId;
  }

  return false;
}
