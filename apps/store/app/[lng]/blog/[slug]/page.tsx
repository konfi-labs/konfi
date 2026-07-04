import BlogPostComponent from "@/components/blog/blog-post";
import {
  getTranslatedBlogCategories,
  getTranslatedBlogPost,
  getTranslatedBlogPosts,
  getTranslatedBlogTags,
} from "@/lib/blog/translations";
import {
  getAppForServer,
  getStoreRuntimeConfigForRequest,
  shouldSkipStaticDataDuringCiBuild,
} from "@/lib/firebase/serverApp";
import { buildRuntimeAssetUrl } from "@/lib/runtime-config";
import { Stack } from "@chakra-ui/react";
import {
  getBlogCategories,
  getBlogPostBySlug,
  getBlogTags,
  getPublishedBlogPosts,
  getRelatedBlogPosts,
} from "@konfi/firebase";
import {
  DEFAULT_LOCALE,
  Locale,
  BlogPost,
  BlogCategory,
  BlogTag,
} from "@konfi/types";
import { getFirestore } from "firebase/firestore";
import { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { serializeFirestore } from "@konfi/utils";

// Use shared serializer to convert Firestore objects to plain objects
const BLOG_SLUG_BUILD_PLACEHOLDER = "__build-validation__";

async function getCachedBlogPost(
  slug: string,
  locale: Locale,
): Promise<{
  post: BlogPost | null;
  categories: BlogCategory[];
  tags: BlogTag[];
  relatedPosts: BlogPost[];
  serializedContent: string | null;
}> {
  "use cache";
  cacheTag(
    "blogPosts",
    `blogPost-${slug}`,
    `blogPost-${slug}-${locale}`,
    "blogCategories",
    "blogTags",
  );
  cacheLife("max");

  try {
    const { firebaseServerApp } = await getAppForServer();
    const firestore = getFirestore(firebaseServerApp);

    const [post, categories, tags] = await Promise.all([
      getBlogPostBySlug(slug, firestore),
      getBlogCategories(firestore),
      getBlogTags(firestore),
    ]);

    if (!post) {
      return {
        post: null,
        categories: [],
        tags: [],
        relatedPosts: [],
        serializedContent: null,
      };
    }

    // Get translated content
    const [translatedPost, translatedCategories, translatedTags] =
      await Promise.all([
        getTranslatedBlogPost(firestore, post, locale as Locale),
        getTranslatedBlogCategories(firestore, categories, locale as Locale),
        getTranslatedBlogTags(firestore, tags, locale as Locale),
      ]);

    // Use raw markdown content instead of serialized MDX to avoid eval()
    const serializedContent = translatedPost.content || "";

    // Get related posts
    const relatedPostsResult = await getRelatedBlogPosts(
      post.id,
      post.categories,
      post.tags,
      3,
      firestore,
    );

    // Translate related posts
    const translatedRelatedPosts = await getTranslatedBlogPosts(
      firestore,
      relatedPostsResult,
      locale as Locale,
    );

    // Serialize all Firestore objects to plain objects
    const serializedPost = serializeFirestore(translatedPost) as BlogPost;
    const serializedCategories = serializeFirestore(
      translatedCategories,
    ) as BlogCategory[];
    const serializedTags = serializeFirestore(translatedTags) as BlogTag[];
    const serializedRelatedPosts = serializeFirestore(
      translatedRelatedPosts,
    ) as BlogPost[];

    return {
      post: serializedPost,
      categories: serializedCategories,
      tags: serializedTags,
      relatedPosts: serializedRelatedPosts,
      serializedContent,
    };
  } catch (error) {
    console.error("Error fetching blog post:", error);
    return {
      post: null,
      categories: [],
      tags: [],
      relatedPosts: [],
      serializedContent: null,
    };
  }
}

export async function generateStaticParams() {
  if (shouldSkipStaticDataDuringCiBuild()) {
    return [{ slug: BLOG_SLUG_BUILD_PLACEHOLDER, lng: DEFAULT_LOCALE }];
  }

  try {
    const { firebaseServerApp } = await getAppForServer();
    const firestore = getFirestore(firebaseServerApp);
    const { posts } = await getPublishedBlogPosts(undefined, firestore);

    // Only pre-render default locale; other locales render on-demand
    const params = posts.map((post) => ({
      slug: post.slug,
      lng: DEFAULT_LOCALE,
    }));

    // Next.js Cache Components requires at least one param for validation.
    return params.length > 0
      ? params
      : [{ slug: BLOG_SLUG_BUILD_PLACEHOLDER, lng: DEFAULT_LOCALE }];
  } catch (error) {
    console.error("Error generating static params:", error);
    return [{ slug: BLOG_SLUG_BUILD_PLACEHOLDER, lng: DEFAULT_LOCALE }];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string; slug: string }>;
}): Promise<Metadata> {
  const { lng, slug } = await params;
  const runtimeConfig = await getStoreRuntimeConfigForRequest();

  if (shouldSkipStaticDataDuringCiBuild()) {
    return { title: "Blog Post" };
  }

  const metadata = await getCachedBlogPostMetadata(slug, lng as Locale);
  const imageUrl = buildRuntimeAssetUrl(
    runtimeConfig?.cdnUrl,
    metadata.featuredImage
      ? `cms/blog/${metadata.featuredImage}?fit=max&auto=format,compress`
      : undefined,
  );

  return {
    title: metadata.title,
    description: metadata.description,
    openGraph: {
      title: metadata.title,
      description: metadata.description,
      type: "article",
      publishedTime: metadata.publishedTime,
      images: imageUrl
        ? [
            {
              url: imageUrl,
              width: 1200,
              height: 630,
              alt: metadata.title,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: metadata.title,
      description: metadata.description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

async function getCachedBlogPostMetadata(
  slug: string,
  lng: Locale,
): Promise<{
  description: string;
  featuredImage?: string;
  publishedTime?: string;
  title: string;
}> {
  "use cache";
  cacheLife("max");
  cacheTag(
    "blogPosts",
    "blogPost-metadata",
    `blogPost-metadata-${slug}-${lng}`,
  );

  try {
    const { firebaseServerApp } = await getAppForServer();
    const firestore = getFirestore(firebaseServerApp);
    const basePost = await getBlogPostBySlug(slug, firestore);

    if (!basePost) {
      return {
        description: "Blog post not found",
        title: "Blog Post Not Found",
      };
    }

    // Attempt to get translated content (including SEO) when locale differs or always to allow overriding
    let translatedPost = basePost;
    try {
      translatedPost = await getTranslatedBlogPost(firestore, basePost, lng);
    } catch (e) {
      // Fallback silently
    }

    const title =
      translatedPost.seo?.title || translatedPost.title || basePost.title;
    const description =
      translatedPost.seo?.description ||
      translatedPost.excerpt ||
      translatedPost.title;

    return {
      title,
      description,
      featuredImage: basePost.featuredImage,
      publishedTime: basePost.publishedAt?.toDate?.()?.toISOString(),
    };
  } catch (error) {
    console.error("Error generating metadata:", error);
    return {
      description: "Blog post",
      title: "Blog Post",
    };
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ lng: string; slug: string }>;
}) {
  return (
    <Suspense>
      <BlogPostContent params={params} />
    </Suspense>
  );
}

async function BlogPostContent({
  params,
}: {
  params: Promise<{ lng: string; slug: string }>;
}) {
  const { lng, slug } = await params;

  if (slug === BLOG_SLUG_BUILD_PLACEHOLDER) {
    notFound();
  }

  const { post, categories, tags, relatedPosts, serializedContent } =
    await getCachedBlogPost(slug, lng as Locale);

  return (
    <Stack gap={6}>
      <BlogPostComponent
        lng={lng}
        slug={slug}
        post={post}
        categories={categories}
        tags={tags}
        relatedPosts={relatedPosts}
        serializedContent={serializedContent}
      />
    </Stack>
  );
}
