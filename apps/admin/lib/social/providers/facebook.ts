import type { SocialPostMedia } from "@konfi/types";
import { metaGraphFetch, type MetaClientConfig } from "./meta-client";
import type { PublishResult } from "./types";

interface FeedResponse {
  id: string;
}

interface PhotoResponse {
  id: string;
}

/**
 * Publish content to a Facebook Page.
 *
 * - 0 images  → POST /{pageId}/feed {message}
 * - 1 image   → POST /{pageId}/photos {url, message}
 * - 2+ images → upload each as unpublished photo, then POST /{pageId}/feed
 *               with attached_media
 */
export async function publishToFacebookPage({
  graphApiVersion,
  pageId,
  pageToken,
  content,
  media,
}: MetaClientConfig & {
  pageId: string;
  pageToken: string;
  content: string;
  media: SocialPostMedia[];
}): Promise<PublishResult> {
  const imageMedia = media.filter((m) => m.contentType.startsWith("image/"));

  if (imageMedia.length === 0) {
    // Text-only post
    const result = await metaGraphFetch<FeedResponse>({
      graphApiVersion,
      path: `${pageId}/feed`,
      method: "POST",
      accessToken: pageToken,
      body: { message: content },
    });
    return { externalPostId: result.id };
  }

  if (imageMedia.length === 1) {
    // Single-photo post
    const result = await metaGraphFetch<FeedResponse>({
      graphApiVersion,
      path: `${pageId}/photos`,
      method: "POST",
      accessToken: pageToken,
      body: { url: imageMedia[0].downloadUrl, message: content },
    });
    return { externalPostId: result.id };
  }

  // Multi-photo post: upload each as unpublished, then create feed post
  const photoIds = await Promise.all(
    imageMedia.map(async (img) => {
      const photo = await metaGraphFetch<PhotoResponse>({
        graphApiVersion,
        path: `${pageId}/photos`,
        method: "POST",
        accessToken: pageToken,
        body: { url: img.downloadUrl, published: false },
      });
      return photo.id;
    }),
  );

  const feedResult = await metaGraphFetch<FeedResponse>({
    graphApiVersion,
    path: `${pageId}/feed`,
    method: "POST",
    accessToken: pageToken,
    body: {
      message: content,
      attached_media: photoIds.map((media_fbid) => ({ media_fbid })),
    },
  });

  return { externalPostId: feedResult.id };
}
