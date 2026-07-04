import "server-only";

import { getTenantContext } from "@/lib/firebase/serverApp";
import { getMetaAppConfig } from "@/lib/social/meta-config";
import {
  getMetaPublishCredentials,
  markMetaIntegrationNeedsAttention,
} from "@/lib/social/meta-credentials";
import {
  finalizePost,
  getPost,
  recordTargetResult,
} from "@/lib/social/posts";
import { publishToFacebookPage } from "@/lib/social/providers/facebook";
import { publishToInstagram } from "@/lib/social/providers/instagram";
import {
  PermanentProviderError,
  RetryableProviderError,
} from "@/lib/social/providers/types";
import type { SocialPost, SocialPostMedia, SocialPostTarget } from "@konfi/types";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

export interface PublishCredentialsContext {
  userToken: string;
  pages: {
    id: string;
    name: string;
    pageToken: string;
    igAccount?: { id: string; username: string };
  }[];
  graphApiVersion: string;
}

interface LoadedPublishContext extends PublishCredentialsContext {
  post: SocialPost;
}

// ──────────────────────────────────────────────────────────────────────────────
// Steps
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Re-read the post and load credentials at workflow execution time.
 * Returns null if the post is missing, no longer in "publishing" status
 * (cancelled/edited), or if Meta credentials are unavailable (in which case
 * all pending targets are marked failed).
 */
export async function loadPublishablePostStep(
  postId: string,
  tenantId?: string,
): Promise<LoadedPublishContext | null> {
  "use step";

  const tenantContext = getTenantContext(tenantId);
  const post = await getPost(postId, tenantContext);

  if (!post || post.status !== "publishing") {
    return null;
  }

  const [credentials, appConfig] = await Promise.all([
    getMetaPublishCredentials(tenantContext),
    getMetaAppConfig(tenantContext),
  ]);

  if (!credentials || !appConfig) {
    // Mark all pending targets as failed — no credentials available.
    for (const target of post.targets) {
      if (target.status === "pending") {
        await recordTargetResult(postId, tenantContext, target.targetId, {
          status: "failed",
          error: "Meta not connected",
        });
      }
    }
    await finalizePost(postId, tenantContext);
    return null;
  }

  return {
    post,
    userToken: credentials.userToken,
    pages: credentials.pages,
    graphApiVersion: appConfig.graphApiVersion,
  };
}

/**
 * Publish a single target and record the result.
 *
 * - Already-published targets are skipped (idempotency on retry).
 * - PermanentProviderError → record "failed"; if tokenExpired, also call
 *   markMetaIntegrationNeedsAttention.
 * - RetryableProviderError → RE-THROW so the workflow step runtime retries.
 */
export async function publishTargetStep(
  postId: string,
  tenantId: string | undefined,
  target: SocialPostTarget,
  content: string,
  media: SocialPostMedia[],
  context: PublishCredentialsContext,
): Promise<{ targetId: string; outcome: "published" | "failed" | "skipped" }> {
  "use step";

  const tenantContext = getTenantContext(tenantId);

  // Idempotency: skip already-published targets (handles step retry)
  if (target.status === "published") {
    return { targetId: target.targetId, outcome: "skipped" };
  }

  // Re-read the live target status: on step retry the `target` argument is a
  // stale snapshot, and the external publish may already have succeeded even
  // though recording it failed.
  const livePost = await getPost(postId, tenantContext);
  if (!livePost) {
    return { targetId: target.targetId, outcome: "skipped" };
  }
  const liveTarget = livePost.targets.find(
    (t) => t.targetId === target.targetId,
  );
  if (liveTarget?.status === "published") {
    return { targetId: target.targetId, outcome: "skipped" };
  }

  try {
    let externalPostId: string;

    if (target.provider === "facebook") {
      const page = context.pages.find((p) => p.id === target.targetId);
      if (!page) {
        throw new PermanentProviderError(
          `Facebook page ${target.targetId} not found in credentials.`,
        );
      }
      const result = await publishToFacebookPage({
        graphApiVersion: context.graphApiVersion,
        pageId: page.id,
        pageToken: page.pageToken,
        content,
        media,
      });
      externalPostId = result.externalPostId;
    } else if (target.provider === "instagram") {
      const page = context.pages.find((p) => p.id === target.targetId);
      if (!page?.igAccount) {
        throw new PermanentProviderError(
          `Instagram account for target ${target.targetId} not found in credentials.`,
        );
      }
      const result = await publishToInstagram({
        graphApiVersion: context.graphApiVersion,
        igUserId: page.igAccount.id,
        userToken: context.userToken,
        content,
        media,
      });
      externalPostId = result.externalPostId;
    } else {
      throw new PermanentProviderError(
        `Unknown provider: ${String(target.provider)}`,
      );
    }

    await recordTargetResult(postId, tenantContext, target.targetId, {
      status: "published",
      externalPostId,
    });

    return { targetId: target.targetId, outcome: "published" };
  } catch (err) {
    if (err instanceof RetryableProviderError) {
      // Let the workflow runtime retry the step.
      throw err;
    }

    const message =
      err instanceof Error ? err.message : "Unknown publish error.";

    await recordTargetResult(postId, tenantContext, target.targetId, {
      status: "failed",
      error: message,
    });

    if (err instanceof PermanentProviderError && err.tokenExpired) {
      await markMetaIntegrationNeedsAttention(tenantContext, message);
    }

    return { targetId: target.targetId, outcome: "failed" };
  }
}

/**
 * Derive and write the final aggregate status for the post.
 */
export async function finalizePostStep(
  postId: string,
  tenantId?: string,
): Promise<void> {
  "use step";

  const tenantContext = getTenantContext(tenantId);
  await finalizePost(postId, tenantContext);
}
