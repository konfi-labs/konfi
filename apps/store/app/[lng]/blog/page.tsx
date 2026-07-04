import {
  getTranslatedBlogCategories,
  getTranslatedBlogPosts,
  getTranslatedBlogTags,
} from "@/lib/blog/translations";
import {
  getAppForServer,
  shouldSkipStaticDataDuringCiBuild,
} from "@/lib/firebase/serverApp";
import { Stack } from "@chakra-ui/react";
import {
  getBlogCategories,
  getBlogTags,
  getPublishedBlogPosts,
} from "@konfi/firebase";
import { DEFAULT_LOCALE, Locale } from "@konfi/types";
import { serializeFirestore } from "@konfi/utils";
import { getFirestore } from "firebase/firestore";
import { cacheLife, cacheTag } from "next/cache";
import { Suspense } from "react";
import BlogList from "../components/blog/blog-list";

export function generateStaticParams() {
  return [{ lng: DEFAULT_LOCALE }];
}

async function getCachedBlogPosts(locale: Locale, limit: number) {
  "use cache";
  cacheTag("blogPosts", `blogPosts-${locale}`);
  cacheLife("max");

  if (shouldSkipStaticDataDuringCiBuild()) {
    return { posts: [], hasMore: false };
  }

  try {
    const { firebaseServerApp } = await getAppForServer();
    const firestore = getFirestore(firebaseServerApp);
    const result = await getPublishedBlogPosts({ limit }, firestore);

    // Translate posts
    const translatedPosts = await getTranslatedBlogPosts(
      firestore,
      result.posts,
      locale,
    );

    return {
      ...result,
      posts: serializeFirestore(translatedPosts) as typeof translatedPosts,
    };
  } catch (error) {
    console.error("Error fetching blog posts:", error);
    return { posts: [], hasMore: false };
  }
}

async function getCachedBlogCategories(locale: Locale) {
  "use cache";
  cacheTag("blogCategories", `blogCategories-${locale}`);
  cacheLife("max");

  if (shouldSkipStaticDataDuringCiBuild()) {
    return [];
  }

  try {
    const { firebaseServerApp } = await getAppForServer();
    const firestore = getFirestore(firebaseServerApp);
    const categories = await getBlogCategories(firestore);

    // Translate categories
    const translatedCategories = await getTranslatedBlogCategories(
      firestore,
      categories,
      locale,
    );
    return serializeFirestore(
      translatedCategories,
    ) as typeof translatedCategories;
  } catch (error) {
    console.error("Error fetching blog categories:", error);
    return [];
  }
}

async function getCachedBlogTags(locale: Locale) {
  "use cache";
  cacheTag("blogTags", `blogTags-${locale}`);
  cacheLife("max");

  if (shouldSkipStaticDataDuringCiBuild()) {
    return [];
  }

  try {
    const { firebaseServerApp } = await getAppForServer();
    const firestore = getFirestore(firebaseServerApp);
    const tags = await getBlogTags(firestore);

    // Translate tags
    const translatedTags = await getTranslatedBlogTags(firestore, tags, locale);
    return serializeFirestore(translatedTags) as typeof translatedTags;
  } catch (error) {
    console.error("Error fetching blog tags:", error);
    return [];
  }
}

export default async function BlogPage({
  params,
}: {
  params: Promise<{ lng: string }>;
}) {
  return (
    <Suspense>
      <BlogPageContent params={params} />
    </Suspense>
  );
}

async function BlogPageContent({
  params,
}: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = await params;
  const locale = lng as Locale;

  // Fetch all data in parallel for better performance
  const [postsResult, categories, tags] = await Promise.all([
    getCachedBlogPosts(locale, 10),
    getCachedBlogCategories(locale),
    getCachedBlogTags(locale),
  ]);

  return (
    <Stack gap={6}>
      <BlogList
        lng={lng}
        initialPosts={postsResult.posts}
        initialHasMore={postsResult.hasMore}
        initialNextCursor={postsResult.nextCursor}
        categories={categories}
        tags={tags}
      />
    </Stack>
  );
}
