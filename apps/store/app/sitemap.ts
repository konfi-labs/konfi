import {
  getAppForServer,
  getStoreRuntimeConfigForRequest,
  shouldSkipStaticDataDuringCiBuild,
} from "@/lib/firebase/serverApp";
import { BlogCategory, BlogPost, BlogTag, Locale, Product } from "@konfi/types";
import { all } from "better-all";
import { MetadataRoute } from "next";

async function getData(channelId: string) {
  if (shouldSkipStaticDataDuringCiBuild()) {
    return {
      productSlugs: [],
      blogPostSlugs: [],
      blogCategorySlugs: [],
      blogTagSlugs: [],
    };
  }

  const get = (await import("@konfi/firebase")).get;
  const db = (await import("@konfi/firebase")).db;
  const { where, orderBy } = await import("firebase/firestore");
  const getFirestore = (await import("firebase/firestore")).getFirestore;
  const { BlogPostStatus } = await import("@konfi/types");
  const { firebaseServerApp } = await getAppForServer();
  const firestore = getFirestore(firebaseServerApp);

  if (!channelId) {
    throw new Error("Channel ID is not defined");
  }

  // Fetch all data in parallel for better performance
  const {
    productsResult,
    blogPostsResult,
    blogCategoriesResult,
    blogTagsResult,
  } = await all({
    async productsResult() {
      return get<Product>(
        db.query<Product>(
          firestore,
          `/channels/${channelId}/products`,
          99,
          undefined,
          [
            where("active", "==", true),
            where("availability.published", "==", true),
          ],
        ),
      );
    },
    async blogPostsResult() {
      return get<BlogPost>(
        db.query<BlogPost>(firestore, "blogPosts", 99, undefined, [
          where("channelId", "==", channelId),
          where("active", "==", true),
          where("status", "==", BlogPostStatus.PUBLISHED),
          orderBy("publishedAt", "desc"),
        ]),
      );
    },
    async blogCategoriesResult() {
      return get<BlogCategory>(
        db.query<BlogCategory>(firestore, "blogCategories", 99, undefined, [
          where("channelId", "==", channelId),
          where("active", "==", true),
          orderBy("name"),
        ]),
      );
    },
    async blogTagsResult() {
      return get<BlogTag>(
        db.query<BlogTag>(firestore, "blogTags", 99, undefined, [
          where("channelId", "==", channelId),
          where("active", "==", true),
          orderBy("name"),
        ]),
      );
    },
  });

  const productSlugs =
    productsResult?.[0]?.map((product) => product.seo.slug) || [];
  const blogPostSlugs =
    blogPostsResult?.[0]?.map((post: BlogPost) => post.slug) || [];
  const blogCategorySlugs =
    blogCategoriesResult?.[0]?.map((category: BlogCategory) => category.slug) ||
    [];
  const blogTagSlugs =
    blogTagsResult?.[0]?.map((tag: BlogTag) => tag.slug) || [];

  return {
    productSlugs,
    blogPostSlugs,
    blogCategorySlugs,
    blogTagSlugs,
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const runtimeConfig = await getStoreRuntimeConfigForRequest();

  if (!runtimeConfig || runtimeConfig.maintenance.enabled) {
    return [];
  }

  const baseUrl = runtimeConfig.storeBaseUrl;
  const data = await getData(runtimeConfig.channelId);
  const locales = Object.values(Locale);
  const urls: MetadataRoute.Sitemap = [];

  // Add base URLs for each locale
  for (const locale of locales) {
    urls.push(
      {
        url: `${baseUrl}/${locale}`,
        lastModified: new Date(),
        changeFrequency: "yearly",
        priority: 1,
      },
      {
        url: `${baseUrl}/${locale}/auth/login`,
        lastModified: new Date(),
        changeFrequency: "yearly",
        priority: 0.5,
      },
      {
        url: `${baseUrl}/${locale}/auth/register`,
        lastModified: new Date(),
        changeFrequency: "yearly",
        priority: 0.5,
      },
      {
        url: `${baseUrl}/${locale}/auth/forgot`,
        lastModified: new Date(),
        changeFrequency: "yearly",
        priority: 0.1,
      },
      {
        url: `${baseUrl}/${locale}/help/contact`,
        lastModified: new Date(),
        changeFrequency: "yearly",
        priority: 0.1,
      },
      {
        url: `${baseUrl}/${locale}/help/faq`,
        lastModified: new Date(),
        changeFrequency: "yearly",
        priority: 0.1,
      },
      {
        url: `${baseUrl}/${locale}/help/general-conditions-of-sale`,
        lastModified: new Date(),
        changeFrequency: "yearly",
        priority: 0.1,
      },
      {
        url: `${baseUrl}/${locale}/help/privacy-policy`,
        lastModified: new Date(),
        changeFrequency: "yearly",
        priority: 0.1,
      },
      {
        url: `${baseUrl}/${locale}/help/reasons-for-rejections`,
        lastModified: new Date(),
        changeFrequency: "yearly",
        priority: 0.1,
      },
      {
        url: `${baseUrl}/${locale}/help/regulations`,
        lastModified: new Date(),
        changeFrequency: "yearly",
        priority: 0.1,
      },
      {
        url: `${baseUrl}/${locale}/help`,
        lastModified: new Date(),
        changeFrequency: "yearly",
        priority: 0.1,
      },
      {
        url: `${baseUrl}/${locale}/products`,
        lastModified: new Date(),
        changeFrequency: "monthly",
        priority: 0.8,
      },
      {
        url: `${baseUrl}/${locale}/blog`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.8,
      },
    );

    // Add product pages for each locale
    if (data?.productSlugs) {
      for (const slug of data.productSlugs) {
        urls.push({
          url: `${baseUrl}/${locale}/products/${slug}`,
          lastModified: new Date(),
          changeFrequency: "monthly",
          priority: 0.9,
        });
      }
    }

    // Add blog post pages for each locale
    if (data?.blogPostSlugs) {
      for (const slug of data.blogPostSlugs) {
        urls.push({
          url: `${baseUrl}/${locale}/blog/${slug}`,
          lastModified: new Date(),
          changeFrequency: "weekly",
          priority: 0.7,
        });
      }
    }

    // Add blog category pages for each locale
    if (data?.blogCategorySlugs) {
      for (const slug of data.blogCategorySlugs) {
        urls.push({
          url: `${baseUrl}/${locale}/blog/category/${slug}`,
          lastModified: new Date(),
          changeFrequency: "weekly",
          priority: 0.6,
        });
      }
    }

    // Add blog tag pages for each locale
    if (data?.blogTagSlugs) {
      for (const slug of data.blogTagSlugs) {
        urls.push({
          url: `${baseUrl}/${locale}/blog/tag/${slug}`,
          lastModified: new Date(),
          changeFrequency: "weekly",
          priority: 0.5,
        });
      }
    }
  }

  return urls as MetadataRoute.Sitemap;
}
